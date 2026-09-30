import { LAN_CONTROL_BYTES, LanPresentationControlMailbox } from './LanPresentationControlMailbox';
import type { CombatSnapshot } from './CombatSnapshot';
import { LAN_REALTIME_BYTES, LanRealtimeMailbox, copyRealtimeFrame, type LanRealtimeFrame } from './LanPresentationRealtime';
import { clientToCombatWorldInViewport } from '../engine/runtime/PlayerControls';
import { Vector2 } from '../engine/math/Vector2';
import type { CombatViewport } from '../engine/runtime/CombatViewport';
import type { Action } from './protocol';
import { getGraphicsSettings, type GraphicsSettings } from '../engine/runtime/GraphicsSettings';
import type { LanVisualDelivery } from './LanPresentationVisuals';
import type { LanBinaryStateOwner, LanConnection, Match, PlayerInput, Seat } from './protocol';
import type { LanBinaryDelivery, LanBinaryIngressSession } from './LanBinaryStateIngress';
import type { LanComponentDelivery } from './LanPresentationComponents';
import type { PresentationReceipt } from './PresentationReceipts';
import { LanPresentationCommandClient, type LanViewSound } from './LanPresentationCommands';
import type { LanPresentationViews } from './LanPresentationViews';
import { copyAcceptedWorkerInput, copyWorkerControls, requireSynchronousPresentation, samePresentationEpoch } from './LanPresentationWorkerProtocol';
import type { FromPresentationWorker, ToPresentationWorker, LanWorkerControls, LanWorkerAuxiliary, LanWorkerStatus, LanWorkerDisposal, PresentationEpoch } from './LanPresentationWorkerProtocol';

export interface LanWorkerOptions { realtime?: 'auto'|'shared'|'messages' }
export interface LanWorkerCallbacks {
  /** Retain/play small ancillary records synchronously before network credits. */
  onState(value:LanWorkerAuxiliary,parseMs:number):void;
  onViewsInvalidated?():void;
  onMotionAcknowledged?(ack:number):void;
  onViews?(views:LanPresentationViews,status:LanWorkerStatus):void;
  playViewSound(sound:LanViewSound):void;
  onError(error:unknown):void;
}
interface Delivery { id:number; session:PresentationEpoch; kind:'state'|'motion'|'combat'|'visual'; receipt:PresentationReceipt; parseMs?:number }
interface Operation { session:PresentationEpoch; resolve:(value:boolean)=>void; reject:(error:Error)=>void; timer:ReturnType<typeof setTimeout> }
/** Production raw transport -> actual presentation Worker. No decoded combat
 * graph crosses back. Network receipts remain locally-issued capabilities;
 * Worker IDs can only complete a currently retained matching entry. */
export class LanPresentationWorkerClient implements LanBinaryStateOwner {
  private worker:Worker;
  private session:LanBinaryIngressSession|null=null;
  private nextId=0;
  private deliveries=new Map<number,Delivery>();
  private operations=new Map<number,Operation>();
  private commandClient:LanPresentationCommandClient|null=null;
  private configured:{id:number;session:PresentationEpoch}|null=null;
  private desired:LanWorkerControls|null=null;
  private configureTimer:ReturnType<typeof setTimeout>|undefined;
  private release:(()=>void)|null=null;
  private phase:'capabilities'|'initializing'|'ready'|'closing'|'closed'='capabilities';
  private readyResolve!:()=>void;
  private readyReject!:(error:Error)=>void;
  private startupTimer:ReturnType<typeof setTimeout>|undefined;
  private closeResolve:((report:LanWorkerDisposal)=>void)|null=null;
  private closeReject:((error:Error)=>void)|null=null;
  private closeTimer:ReturnType<typeof setTimeout>|undefined;
  private closing:Promise<LanWorkerDisposal>|null=null;
  private lastStatus:LanWorkerStatus|null=null;
  private controlsSent=0;
  private controlsPublished=0;
  private readonly controlMailbox:LanPresentationControlMailbox|null;
  private publishedControls:LanWorkerControls|null=null;
  private revocations=0;
  private pointerRevocations=0;
  private wakeWanted=false;
  private sentGraphics:Readonly<GraphicsSettings>|null=null;
  private readonly realtimeMailbox:LanRealtimeMailbox|null;
  private viewGeneration=0;
  private realtimeSerial=0;
  private realtimeFrame:LanRealtimeFrame|null=null;
  private realtimeVisible=true;
  private realtimeSuspended=false;
  private ingressStopped=false;
  private renderConfiguration:{context:WebGLContextAttributes|null;layers:readonly string[]}|null=null;

  private constructor(private readonly canvas:HTMLCanvasElement,private readonly match:Match,private readonly seat:Seat,
    private readonly callbacks:LanWorkerCallbacks,options:LanWorkerOptions){
    const mode=options.realtime??'auto';if(!['auto','shared','messages'].includes(mode))throw Error('Invalid realtime transport');
    const supported=globalThis.crossOriginIsolated===true&&typeof SharedArrayBuffer==='function';
    if(mode==='shared'&&!supported)throw Error('Shared realtime transport unavailable; canvas has not been transferred');
    this.realtimeMailbox=mode!=='messages'&&supported?new LanRealtimeMailbox(new SharedArrayBuffer(LAN_REALTIME_BYTES)):null;
    this.controlMailbox=this.realtimeMailbox?new LanPresentationControlMailbox(new SharedArrayBuffer(LAN_CONTROL_BYTES)):null;
    this.worker=new Worker(new URL('./lan-presentation.worker.ts',import.meta.url),{type:'module'});
    this.worker.onmessage=event=>{try{this.receiveMessage(event.data as FromPresentationWorker);}catch(error){this.fail(error);}};
    this.worker.onerror=event=>{event.preventDefault();this.fail(Error('Presentation Worker failed: '+event.message));};
    this.worker.onmessageerror=()=>this.fail(Error('Presentation Worker message decode failed'));
  }
  static async create(canvas:HTMLCanvasElement,match:Match,seat:Seat,callbacks:LanWorkerCallbacks,options:LanWorkerOptions={}):Promise<LanPresentationWorkerClient>{
    if(typeof Worker!=='function'||typeof canvas.transferControlToOffscreen!=='function')throw Error('Offscreen presentation is unsupported');
    const client=new LanPresentationWorkerClient(canvas,match,seat,callbacks,options);
    await new Promise<void>((resolve,reject)=>{
      client.readyResolve=resolve;client.readyReject=reject;
      client.startupTimer=setTimeout(()=>client.fail(Error('Presentation Worker startup timed out')),15000);
    });
    return client;
  }
  get generation():number{return this.viewGeneration;}
  get syncId():string{return this.session?.components?.syncId??'';}
  get matchId():string{return this.match.id;}
  get views():LanPresentationViews|null{return this.lastStatus?this.commandClient?.views??null:null;}
  get stats(){return {phase:this.phase,pendingDeliveries:this.deliveries.size,pendingOperations:this.operations.size,
    pendingControls:!!this.configured,queuedControls:this.controlMailbox?this.wakeWanted:!!this.desired,controlsSent:this.controlsSent,controlsPublished:this.controlsPublished,controlMode:this.controlMailbox?'shared':'messages',realtimeMode:this.realtimeMailbox?'shared':'messages',status:this.lastStatus,renderConfiguration:this.renderConfiguration};}
  /** Latest same-frame scalars, independent of UI publication. Bounded reads;
   * never wait for a Worker, invent an input, or extrapolate a stopped owner. */
  readRealtime(maxAgeMs=250):LanRealtimeFrame|null{
    if(!Number.isFinite(maxAgeMs)||maxAgeMs<0)throw Error('Invalid realtime age budget');
    if(this.phase!=='ready'||!this.session||!this.realtimeVisible||this.realtimeSuspended)return null;
    const frame=this.realtimeMailbox?this.realtimeMailbox.read(this.viewGeneration):this.realtimeFrame?copyRealtimeFrame(this.realtimeFrame):null;
    if(!frame)return null;
    const age=performance.timeOrigin+performance.now()-frame.at;
    return age>=-1&&age<=maxAgeMs?frame:null;
  }
  /** Build at send time from fresh frame coordinates plus the current CSS rect.
   * Reuses the page's exact projection math. Does not send or consume actions. */
  readInput(pointer:readonly [number,number]|null,rect:CombatViewport['rect'],seq:number,keys:number,firing:boolean,actions:Action[]):PlayerInput|null{
    if(pointer&&(!Array.isArray(pointer)||pointer.length!==2||!pointer.every(Number.isFinite)))throw Error('Invalid realtime pointer');
    if(!rect||![rect.left,rect.top,rect.width,rect.height].every(Number.isFinite)||rect.width<=0||rect.height<=0)return null;
    const frame=this.readRealtime();if(!frame)return null;
    const aim=pointer?clientToCombatWorldInViewport({x:pointer[0],y:pointer[1]},
      {width:frame.width,height:frame.height,rect},new Vector2(frame.cameraX,frame.cameraY),frame.zoom):new Vector2(frame.aimX,frame.aimY);
    return copyAcceptedWorkerInput({seq,keys,firing,pointerActive:!!pointer,aim:[aim.x,aim.y],actions});
  }
  attach(connection:LanConnection):void{
    this.assertReady();if(this.release)throw Error('Presentation Worker already attached');
    this.release=connection.claimBinaryState(this);if(!this.release)throw Error('Binary presentation owner could not be claimed before first state');
  }
  private assertReady():void{if(this.phase!=='ready')throw Error('Presentation Worker is not active');}
  private id():number{if(!Number.isSafeInteger(this.nextId+1))throw Error('Presentation Worker sequence exhausted');return ++this.nextId;}
  private send(message:ToPresentationWorker,transfer:Transferable[]=[]):void{this.worker.postMessage(message,transfer);}
  reset(session:LanBinaryIngressSession):void{
    if(this.phase==='closing')return;
    this.assertReady();this.clearLocal(Error('Presentation session reset'));
    if(!Number.isSafeInteger(this.viewGeneration+1))throw Error('Realtime generation exhausted');
    this.viewGeneration++;this.ingressStopped=false;this.realtimeSuspended=false;this.realtimeVisible=true;
    this.session={...session,components:session.components&&{...session.components}};
    this.send({type:'reset',session:this.session,viewGeneration:this.viewGeneration});
  }
  private claim(receipt:PresentationReceipt,kind:Delivery['kind']):Delivery{
    this.assertReady();if(!this.session)throw Error('Missing presentation session');
    const limit=kind==='state'?64:kind==='motion'?16:kind==='combat'?6:4;
    if([...this.deliveries.values()].filter(e=>e.kind===kind).length>=limit)throw Error('Presentation Worker delivery capacity exceeded');
    const entry={id:this.id(),session:{owner:this.session.owner,epoch:this.session.epoch},kind,receipt};
    receipt.defer(()=>this.deliveries.delete(entry.id));this.deliveries.set(entry.id,entry);return entry;
  }
  receive(packet:LanBinaryDelivery,receipt:PresentationReceipt):void{
    try{
      this.assertReady();if(this.ingressStopped||!samePresentationEpoch(packet,this.session)){receipt.complete('discarded');return;}
      const entry=this.claim(receipt,'state');this.send({type:'state',id:entry.id,packet},[packet.data]);
    }catch(error){receipt.reject(error);this.fail(error);}
  }
  receiveFallback(frame:CombatSnapshot,receipt:PresentationReceipt,parseMs=0):void{
    try{
      this.assertReady();if(this.ingressStopped){receipt.complete('discarded');return;}
      if(!Number.isFinite(parseMs)||parseMs<0)throw Error('Invalid JSON parse duration');
      const entry=this.claim(receipt,'state');entry.parseMs=parseMs;this.send({type:'fallback',id:entry.id,session:entry.session,frame});
    }catch(error){receipt.reject(error);this.fail(error);}
  }
  receiveComponent(packet:LanComponentDelivery,receipt:PresentationReceipt):void{
    try{
      this.assertReady();if(this.ingressStopped||!samePresentationEpoch(packet,this.session)){receipt.complete('discarded');return;}
      const entry=this.claim(receipt,packet.kind);this.send({type:'component',id:entry.id,packet});
    }catch(error){receipt.reject(error);this.fail(error);}
  }
  receiveVisual(packet:LanVisualDelivery,receipt:PresentationReceipt):void{
    try{
      this.assertReady();if(this.ingressStopped||!samePresentationEpoch(packet,this.session)){receipt.complete('discarded');return;}
      const entry=this.claim(receipt,'visual');this.send({type:'visual',id:entry.id,packet},[packet.data]);
    }catch(error){receipt.reject(error);this.fail(error);}
  }
  /** Shared: publish the latest scalars immediately, independent of IPC credit.
   * Messages: one in-flight plus one latest sample. Neither carries action edges
   * or grants input/state receipts. Wake/preferences remain bounded messages. */
  configure(value:LanWorkerControls):void{
    this.assertReady();if(!this.session)throw Error('Missing presentation session');
    if(this.ingressStopped)return;
    const next=copyWorkerControls(value);
    if(next.syncId!==this.syncId)throw Error('Presentation controls belong to another sync');
    this.realtimeVisible=next.visible;
    if(this.controlMailbox){
      const previous=this.publishedControls;
      if(previous){
        if(previous.focused&&!next.focused||!previous.blocked&&next.blocked||previous.visible&&!next.visible)++this.revocations;
        if(previous.pointer&&!next.pointer)++this.pointerRevocations;
      }
      this.controlMailbox.write(this.viewGeneration,{revision:this.id(),revocations:this.revocations,pointerRevocations:this.pointerRevocations,controls:next});
      this.controlsPublished++;this.publishedControls=next;
      // Remember transitions, not just the final boolean: a quick hide/show may
      // have suspended RAF while a previous wake receipt is still in flight.
      if(!previous||previous.visible!==next.visible||getGraphicsSettings()!==this.sentGraphics)this.wakeWanted=true;
    }else this.desired=next;
    this.sendControls();
  }
  private sendControls():void{
    if(this.ingressStopped||this.configured||!this.session||(this.controlMailbox?!this.wakeWanted:!this.desired))return;
    const id=this.id(),session=this.session,controls=this.desired;this.desired=null;this.wakeWanted=false;
    this.configured={id,session};this.controlsSent++;
    this.configureTimer=setTimeout(()=>this.fail(Error('Presentation controls timed out')),5000);
    try{
      const graphics=getGraphicsSettings(),changed=graphics===this.sentGraphics?{}:{graphics};
      if(this.controlMailbox)this.send({type:'controls-wake',id,session,...changed});
      else this.send({type:'controls',id,session,controls:controls!,...changed});
      this.sentGraphics=graphics;
    }catch(error){this.fail(error);}
  }
  private operation(build:(id:number,session:PresentationEpoch)=>ToPresentationWorker):Promise<boolean>{
    this.assertReady();if(!this.session)throw Error('Missing presentation session');
    if(this.operations.size>=128)throw Error('Presentation operation capacity exceeded');
    const id=this.id(),session=this.session;
    return new Promise((resolve,reject)=>{
      const entry={session,resolve,reject,timer:setTimeout(()=>this.fail(Error('Presentation operation timed out')),5000)};
      this.operations.set(id,entry);try{this.send(build(id,session));}catch(error){this.fail(error);}
    });
  }
  /** The caller must invoke only AFTER its real input send succeeds. */
  recordAcceptedInput(input:PlayerInput,now:number,active:boolean):Promise<boolean>{
    if(!Number.isFinite(now)||typeof active!=='boolean'||!input||!Array.isArray(input.actions)||input.actions.length>16)throw Error('Invalid accepted input');
    const copied=copyAcceptedWorkerInput(input);
    return this.operation((id,session)=>({type:'accepted-input',id,session,input:copied,at:performance.timeOrigin+now,active}));
  }
  stop():Promise<boolean>{if(this.controlMailbox&&this.viewGeneration)this.controlMailbox.write(this.viewGeneration,null);this.ingressStopped=true;this.realtimeSuspended=true;this.realtimeFrame=null;return this.operation((id,session)=>({type:'stop',id,session}));}
  private receiveMessage(message:FromPresentationWorker):void{
    if(message.type==='disposed'){
      if(this.phase!=='closing')return;
      clearTimeout(this.closeTimer);this.phase='closed';this.worker.terminate();this.closeResolve?.(message.report);this.closeResolve=null;this.closeReject=null;return;
    }
    if(this.phase==='closed')return;
    if(message.type==='fatal'){this.fail(Error(message.message));return;}
    if(this.phase==='closing')return;
    if(message.type==='capabilities'){
      if(this.phase!=='capabilities')throw Error('Unexpected presentation capabilities');
      if(!message.raf||!message.offscreen)throw Error('Native Worker RAF/Offscreen is unavailable; canvas has not been transferred');
      this.phase='initializing';const canvas=this.canvas.transferControlToOffscreen();
      const graphics=this.sentGraphics=getGraphicsSettings();
      this.send({type:'init',canvas,match:this.match,seat:this.seat,graphics,realtime:this.realtimeMailbox?.buffer??null,controlMailbox:this.controlMailbox?.buffer??null},[canvas]);return;
    }
    if(message.type==='ready'){
      if(this.phase!=='initializing')throw Error('Unexpected presentation ready');
      clearTimeout(this.startupTimer);this.renderConfiguration={context:message.context,layers:[...message.layers]};this.phase='ready';this.readyResolve();return;
    }
    this.assertReady();
    if(message.type==='realtime'){
      if(this.realtimeMailbox)throw Error('Unexpected realtime message in shared mode');
      const packet=message.packet;
      if(packet.generation!==this.viewGeneration)return;
      if(!Number.isSafeInteger(packet.serial)||packet.serial<1)throw Error('Invalid realtime publication');
      if(packet.serial<=this.realtimeSerial)return;
      this.realtimeFrame=packet.frame?copyRealtimeFrame(packet.frame):null;this.realtimeSerial=packet.serial;
      this.send({type:'realtime-receipt',receipt:{generation:packet.generation,serial:packet.serial}});return;
    }
    if(!samePresentationEpoch(message.session,this.session))return;
    switch(message.type){
      case 'controls-applied':
        if(this.configured?.id!==message.id||!samePresentationEpoch(this.configured.session,message.session))return;
        clearTimeout(this.configureTimer);this.configured=null;
        if(this.controlMailbox&&message.applied===false&&!this.ingressStopped)this.wakeWanted=true;
        this.sendControls();break;
      case 'operation':{
        const entry=this.operations.get(message.id);if(!entry||!samePresentationEpoch(entry.session,message.session))return;
        this.operations.delete(message.id);clearTimeout(entry.timer);entry.resolve(message.accepted);break;
      }
      case 'ui-session':
        requireSynchronousPresentation(this.callbacks.onViewsInvalidated?.());this.commandClient?.close();this.lastStatus=null;this.commandClient=new LanPresentationCommandClient(message.ui,
          request=>{this.assertReady();this.send({type:'view',session:this.session!,request});},this.callbacks.playViewSound,error=>this.fail(error));break;
      case 'ui':{
        if(!this.commandClient)throw Error('UI arrived without explicit session');
        const client=this.commandClient,receipt=client.receiveUi(message.packet);
        // Applying a post-command revision may play sound; that callback can
        // revoke this client/epoch before receiveUi returns.
        if(!receipt||this.commandClient!==client||this.phase!=='ready'||!samePresentationEpoch(message.session,this.session))return;
        this.lastStatus=message.status;requireSynchronousPresentation(this.callbacks.onViews?.(client.views,message.status));
        if(this.phase==='ready'&&samePresentationEpoch(message.session,this.session))this.send({type:'ui-receipt',session:this.session!,receipt},[receipt.buffer]);break;
      }
      case 'view-result':this.commandClient?.receiveResult(message.reply);break;
      case 'retained':{
        const entry=this.deliveries.get(message.id);
        if(!entry||entry.kind!==message.kind||!samePresentationEpoch(entry.session,message.session))return;
        if(message.status!=='consumed'&&message.status!=='discarded')throw Error('Invalid Worker consumption status');
        if(message.auxiliary)requireSynchronousPresentation(this.callbacks.onState(message.auxiliary,message.parseMs+(entry.parseMs??0)));
        if(message.component?.acknowledged!==undefined)requireSynchronousPresentation(this.callbacks.onMotionAcknowledged?.(message.component.acknowledged));
        // Callbacks can synchronously reset/dispose. Never ACK that older owner.
        if(this.deliveries.get(message.id)!==entry||!samePresentationEpoch(entry.session,this.session)||this.phase!=='ready')return;
        this.deliveries.delete(message.id);entry.receipt.complete(message.status);break;
      }
    }
  }
  private clearLocal(error:Error):void{
    if(this.controlMailbox&&this.viewGeneration)this.controlMailbox.write(this.viewGeneration,null);
    this.publishedControls=null;this.revocations=0;this.pointerRevocations=0;this.wakeWanted=false;
    this.realtimeFrame=null;this.realtimeSerial=0;this.realtimeSuspended=true;
    this.deliveries.clear();clearTimeout(this.configureTimer);this.configured=null;this.desired=null;
    for(const pending of this.operations.values()){clearTimeout(pending.timer);pending.reject(error);}this.operations.clear();
    requireSynchronousPresentation(this.callbacks.onViewsInvalidated?.());
    this.commandClient?.close();this.commandClient=null;this.lastStatus=null;
  }
  private fail(error:unknown):void{
    if(this.phase==='closed')return;const problem=error instanceof Error?error:Error(String(error));
    const entries=[...this.deliveries.values()];this.phase='closed';clearTimeout(this.startupTimer);clearTimeout(this.closeTimer);
    this.clearLocal(problem);this.worker.terminate();this.readyReject?.(problem);this.closeReject?.(problem);
    for(const entry of entries)entry.receipt.reject(problem);
    try{this.callbacks.onError(problem);}catch{/* terminal owner */}
  }
  dispose():Promise<LanWorkerDisposal>{
    if(this.closing)return this.closing;
    if(this.phase==='closed'){
      // Explicit caller disposal may release a failed owner. Failure alone must
      // not silently reconnect into an unrelated main-thread drawing owner.
      const release=this.release;this.release=null;try{release?.();}catch(error){return Promise.reject(error);}
      return Promise.reject(Error('Presentation Worker already failed or closed'));
    }
    this.phase='closing';clearTimeout(this.startupTimer);this.clearLocal(Error('Presentation Worker disposed'));
    const release=this.release;this.release=null;try{release?.();}catch(error){this.fail(error);return Promise.reject(error);}
    this.closing=new Promise((resolve,reject)=>{
      this.closeResolve=resolve;this.closeReject=reject;this.closeTimer=setTimeout(()=>this.fail(Error('Presentation Worker disposal timed out')),3000);
      try{this.send({type:'close'});}catch(error){this.fail(error);}
    });return this.closing;
  }
}
