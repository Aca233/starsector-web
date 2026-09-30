import { LanPresentationControlMailbox } from './LanPresentationControlMailbox';
import type { LanWorkerControls } from './LanPresentationWorkerProtocol';
import { LanPresentationTelemetry } from './LanPresentationTelemetry';
import { LanRealtimeMailbox, LanRealtimePublisher } from './LanPresentationRealtime';
import { LAN_PRESENTATION_LAYERS as layers, LAN_PRESENTATION_CONTEXT } from './LanPresentationDefaults';
import { getGraphicsSettings, updateGraphicsSettings } from '../engine/runtime/GraphicsSettings';
import { assetManager } from '../engine/assets/AssetResolver';
import { contentManifestManager } from '../engine/content/ContentManifest';
import { textureCache } from '../engine/render/TextureCache';
import { LanPresentationRuntime } from './LanPresentationRuntime';
import { LanPresentationFrameLoop } from './LanPresentationFrameLoop';
import { copyAcceptedWorkerInput, copyWorkerControls, idleWorkerControls, samePresentationEpoch } from './LanPresentationWorkerProtocol';
import type { FromPresentationWorker, ToPresentationWorker, LanWorkerStatus, LanWorkerAuxiliary, LanWorkerDisposal } from './LanPresentationWorkerProtocol';
import type { LanBinaryIngressSession } from './LanBinaryStateIngress';
import type { LanPresentationCommandOwner } from './LanPresentationCommands';
import type { CombatSnapshot } from './CombatSnapshot';

const scope=globalThis as unknown as {onmessage:((event:MessageEvent<ToPresentationWorker>)=>void)|null;onmessageerror:(()=>void)|null;
  postMessage(message:FromPresentationWorker,transfer?:Transferable[]):void;close():void};
let runtime:LanPresentationRuntime|undefined,loop:LanPresentationFrameLoop|undefined,ui:LanPresentationCommandOwner|undefined;
let session:LanBinaryIngressSession|null=null,controls=idleWorkerControls(),initializing=false,ended=false,hasFrame=false;
let realtime:LanRealtimePublisher|undefined,configuration=0;
let controlMailbox:LanPresentationControlMailbox|null=null,controlGeneration=0,controlsAvailable=true;
let revocations=0,pointerRevocations=0;
const telemetry=new LanPresentationTelemetry();
let gpuInfo={vendor:'',renderer:''};
let seat=0,receivedAt=-Infinity,receivedTick=-1,lastUiAt=-Infinity,hudZoom=.65,ready=false;
const post=(message:FromPresentationWorker,transfer:Transferable[]=[])=>{if(!ended)scope.postMessage(message,transfer);};
function dispose():LanWorkerDisposal {
  realtime?.close();loop?.dispose();runtime?.dispose();textureCache.disposeBitmapImages();
  const stats=runtime?.renderer.getResourceStats();
  return {disposed:true,residentTextures:stats?.residentTextures??0,pendingUploads:stats?.pendingUploads??0};
}
function fail(error:unknown):void {
  if(ended)return;ended=true;
  try{dispose();}finally{scope.postMessage({type:'fatal',message:error instanceof Error?error.message:String(error)});scope.close();}
}
function active(now:number):boolean {
  return controlsAvailable&&hasFrame&&controls.launched&&controls.synced&&controls.focused&&!controls.blocked&&now-receivedAt<=1500&&!runtime!.world.isTacticalMap;
}
function status():LanWorkerStatus {
  const stats=loop!.stats,view=runtime!.controls;
  return {control:{transport:controlMailbox?'shared':'messages',revision:configuration,revocations,pointerRevocations},telemetry:telemetry.capture(runtime!,performance.now(),receivedAt),controlledIds:[...runtime!.controlledIds],gpuInfo,tick:runtime!.appliedTick,receivedTick,frames:stats.frames,pendingFrames:stats.pendingFrames,ready,
    camera:[view.camera.x,view.camera.y],zoom:view.zoom,hudZoom,motionTick:runtime!.pipeline.motion.tick,combatTick:runtime!.pipeline.combat.tick,
    stale:performance.now()-receivedAt>1500,phase:stats.phase,visual:{...runtime!.pipeline.projectileVisuals.stats(),renderEntities:runtime!.world.renderView().projectileVisuals?.projectiles.length??0,bulkEntities:runtime!.world.projectiles.length},graphics:getGraphicsSettings()};
}
function applyControls(next:LanWorkerControls,revision:number,revoke=false,pointerRevoke=false):void {
  if(revoke||controls.focused&&!next.focused||!controls.blocked&&next.blocked||controls.visible&&!next.visible){
    if(hasFrame)runtime!.pipeline.firePrediction.reset(runtime!.world);
  }
  if(pointerRevoke||!next.pointer)runtime!.controls.controller.suspendPointer();
  controls=next;configuration=revision;if(!next.visible)realtime!.publish(null);
  runtime!.controls.zoom=next.zoom;runtime!.controls.pointerActive=!!next.pointer;
  if(next.pointer)runtime!.controls.samplePointer(...next.pointer);
  loop!.setVisible(next.visible);
}
function refreshSharedControls():boolean {
  if(!controlMailbox)return true;
  if(!session){controlsAvailable=false;return false;}
  const sample=controlMailbox.read(controlGeneration,session.components?.syncId??'',controlsAvailable?configuration:0);
  if(sample===null){controlsAvailable=false;realtime!.publish(null);return false;}
  if(sample!==false){
    if(sample.revocations<revocations||sample.pointerRevocations<pointerRevocations)throw Error('Shared control revocations regressed');
    applyControls(sample.controls,sample.revision,sample.revocations>revocations,sample.pointerRevocations>pointerRevocations);
    revocations=sample.revocations;pointerRevocations=sample.pointerRevocations;
  }
  controlsAvailable=true;return true;
}
function announceUi():void {if(ui&&session)post({type:'ui-session',session,ui:ui.session});}
function ensureUi():void {
  if(ui)return;
  ui=runtime!.createUiCommandOwner((packet,transfer)=>post({type:'ui',session:session!,packet,status:status()},transfer),
    reply=>post({type:'view-result',session:session!,reply}),fail);
  announceUi();
}
function auxiliary(frame:CombatSnapshot):LanWorkerAuxiliary {
  const acknowledged=frame.acknowledged[seat],p=runtime!.world.playerShip.pos;
  // Preserve the main sound consumer's 64-event window and invalid-id/key
  // watermark behavior, without sending arbitrary extra fields or render data.
  const sounds=(frame.sounds??[]).slice(0,64).map(event=>({id:Number.isSafeInteger(event.id)?event.id:-1,
    key:typeof event.key==='string'&&event.key.length<=256?event.key:'',volume:typeof event.volume==='number'?event.volume:NaN,
    rate:typeof event.rate==='number'?event.rate:NaN,
    ...(Array.isArray(event.pos)&&event.pos.length===2&&event.pos.every(Number.isFinite)?{pos:[event.pos[0],event.pos[1]] as [number,number]}:{})}));
  return {tick:frame.tick,acknowledged:Number.isSafeInteger(acknowledged)?acknowledged:null,sounds,listener:[p.x,p.y]};
}
async function initialize(message:Extract<ToPresentationWorker,{type:'init'}>):Promise<void> {
  if(initializing||runtime)throw Error('Presentation Worker already initialized');initializing=true;
  if(!(message.canvas instanceof OffscreenCanvas)||!message.match||!Number.isSafeInteger(message.seat)||message.seat<0)throw Error('Invalid presentation initialization');
  await assetManager.ensureManifestLoaded();await contentManifestManager.ensureLoaded();if(ended)return;
  updateGraphicsSettings(message.graphics);
  const gl=message.canvas.getContext('webgl2',LAN_PRESENTATION_CONTEXT);if(!gl)throw Error('Presentation Worker requires WebGL2');seat=message.seat;
  const debug=gl.getExtension('WEBGL_debug_renderer_info');
  gpuInfo={vendor:String(gl.getParameter(debug?.UNMASKED_VENDOR_WEBGL??gl.VENDOR)),renderer:String(gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL??gl.RENDERER))};
  controlMailbox=message.controlMailbox?new LanPresentationControlMailbox(message.controlMailbox):null;controlsAvailable=!controlMailbox;
  realtime=new LanRealtimePublisher(message.realtime?new LanRealtimeMailbox(message.realtime):null,packet=>post({type:'realtime',packet}));
  runtime=new LanPresentationRuntime(message.match,seat,undefined,message.canvas,gl,{
    onContextLost:()=>{ready=false;realtime?.publish(null);loop?.setContextAvailable(false);},
    onContextRestored:()=>loop?.setContextAvailable(true),onContextRestoreFailed:fail,
  });
  loop=new LanPresentationFrameLoop(runtime,message.canvas,{
    readLayout:()=>refreshSharedControls()&&hasFrame&&controls.viewport?{viewport:controls.viewport,immediate:!controls.launched||!controls.synced}:null,
    readInput:viewport=>runtime!.controls.readInput(runtime!.world,viewport,controls.seq,controls.keys,controls.firing,[]),
    readActivity:now=>{const running=controlsAvailable&&hasFrame&&controls.launched&&controls.synced&&now-receivedAt<=1500;return {
      launched:controls.launched,running,active:active(now),projectilesActive:running&&controls.focused,
      fireActive:active(now)&&now-receivedAt<=250,layers,damageEnabled:true};},
    onFrame:frame=>{ready=true;hudZoom=frame.hudZoom;const now=performance.now(),view=runtime!.controls,aim=runtime!.world.playerShip.aimTargetWorld;
      telemetry.frame(frame,now);
      realtime!.publish({frame:loop!.stats.frames,tick:runtime!.appliedTick,at:performance.timeOrigin+now,
        cameraX:view.camera.x,cameraY:view.camera.y,zoom:view.zoom,aimX:aim.x,aimY:aim.y,
        width:message.canvas.width,height:message.canvas.height,hudZoom,configuration});
      if(ui&&now-lastUiAt>=100){if(ui.publish())lastUiAt=now;}},onError:fail,
  });
  post({type:'ready',context:gl.getContextAttributes(),layers:[...layers]});
}
function command(message:Exclude<ToPresentationWorker,{type:'init'|'close'|'realtime-receipt'}>):void {
  if(!runtime||!loop)throw Error('Presentation Worker is not ready');
  if(message.type==='reset'){
    if(session?.owner===message.session.owner&&message.session.epoch<=session.epoch)return;
    realtime!.reset(message.viewGeneration);configuration=0;controlGeneration=message.viewGeneration;revocations=pointerRevocations=0;controlsAvailable=!controlMailbox;
    loop.reset();telemetry.reset();runtime.resetBinaryIngress(message.session);session={...message.session,components:message.session.components&&{...message.session.components}};
    controls=idleWorkerControls();runtime.controls.pointerActive=false;runtime.controls.controller.reset();
    hasFrame=false;ready=false;receivedAt=-Infinity;receivedTick=-1;lastUiAt=-Infinity;loop.setVisible(true);announceUi();return;
  }
  const epoch='packet' in message?message.packet:message.session;
  if(!samePresentationEpoch(epoch,session)){
    if(message.type==='state'||message.type==='fallback'||message.type==='component'||message.type==='visual')post({type:'retained',id:message.id,session:epoch,kind:message.type==='state'||message.type==='fallback'?'state':message.type==='visual'?'visual':message.packet.kind,status:'discarded',parseMs:0});
    return;
  }
  const sharedApplied=refreshSharedControls();
  switch(message.type){
    case 'state':{
      let retained:LanWorkerAuxiliary|undefined;
      const result=runtime.receiveBinaryState(message.packet,controls.minTick,frame=>{retained=auxiliary(frame);});
      if(result.retained){hasFrame=true;receivedAt=performance.now();receivedTick=result.tick!;ensureUi();void loop.start();}
      post({type:'retained',session:session!,id:message.id,kind:'state',status:result.retained?'consumed':'discarded',parseMs:result.parseMs,auxiliary:retained});break;
    }
    case 'fallback':{
      let retained:LanWorkerAuxiliary|undefined;
      const accepted=runtime.receiveFallback(message.frame,controls.minTick,frame=>{retained=auxiliary(frame);});
      if(accepted){hasFrame=true;receivedAt=performance.now();receivedTick=message.frame.tick;ensureUi();void loop.start();}
      post({type:'retained',session:session!,id:message.id,kind:'state',status:accepted?'consumed':'discarded',parseMs:0,auxiliary:retained});break;
    }
    case 'component':{
      const now=performance.now(),result=runtime.receiveComponent(message.packet,now,controlsAvailable&&hasFrame&&ready&&controls.launched&&controls.synced&&controls.visible,controls.minTick);
      if(message.packet.kind==='motion'&&result.advanced)telemetry.motion.receive(now);
      post({type:'retained',session:session!,id:message.id,kind:message.packet.kind,status:result.status,parseMs:0,component:result});break;
    }
    case 'visual':{
      const result=runtime.receiveVisual(message.packet,performance.now(),controlsAvailable&&hasFrame&&ready&&controls.launched&&controls.synced&&controls.visible,controls.minTick);
      post({type:'retained',session:session!,id:message.id,kind:'visual',status:result.status,parseMs:0});break;
    }
    case 'controls':{
      if(controlMailbox)throw Error('Unexpected message controls for a shared owner');
      const next=copyWorkerControls(message.controls);
      if(next.syncId!==(session!.components?.syncId??''))throw Error('Presentation controls belong to another sync');
      if(message.graphics)updateGraphicsSettings(message.graphics);
      applyControls(next,message.id);post({type:'controls-applied',id:message.id,session:session!});break;
    }
    case 'controls-wake':{
      if(!controlMailbox)throw Error('Unexpected shared control wake');
      if(message.graphics)updateGraphicsSettings(message.graphics);
      post({type:'controls-applied',id:message.id,session:session!,applied:sharedApplied});break;
    }
    case 'accepted-input':{
      if(!Number.isFinite(message.at)||typeof message.active!=='boolean'||!message.input||!Number.isSafeInteger(message.input.seq)||message.input.seq<0)throw Error('Invalid accepted presentation input');
      const accepted=hasFrame&&controls.launched&&controls.synced;
      if(accepted)runtime.recordAcceptedInput(copyAcceptedWorkerInput(message.input),message.at-performance.timeOrigin,message.active&&active(performance.now()));
      post({type:'operation',id:message.id,session:session!,accepted});break;
    }
    case 'view':if(hasFrame)ui?.receive(message.request);break;
    case 'ui-receipt':ui?.completeUi(message.receipt);break;
    case 'stop':realtime!.publish(null);loop.stop();hasFrame=false;ready=false;announceUi();post({type:'operation',id:message.id,session:session!,accepted:true});break;
  }
}
scope.onmessageerror=()=>fail(Error('Presentation Worker message decode failed'));
scope.onmessage=event=>{
  if(ended)return;
  try{
    const message=event.data;
    if(message.type==='init'){void initialize(message).catch(fail);return;}
    if(message.type==='close'){const report=dispose();scope.postMessage({type:'disposed',report});ended=true;scope.close();return;}
    if(message.type==='realtime-receipt'){realtime?.complete(message.receipt);return;}
    command(message);
  }catch(error){fail(error);}
};
post({type:'capabilities',raf:typeof globalThis.requestAnimationFrame==='function'&&typeof globalThis.cancelAnimationFrame==='function',offscreen:typeof OffscreenCanvas==='function'});
