// Experimental application session layered on a CONNECTED lifecycle ticket.
// It never initializes Steam. Caller owns room-wide pacing and routes only
// lifecycle.receive() messages; raw wire identities are NOT authentication.
import { randomBytes } from 'node:crypto';
import { SteamPacketCodec } from './packet-codec.mjs';
import { SteamSocketStateCodec } from './sockets-state-codec.mjs';
import { SteamSnapshotEncoder } from './snapshot-delta.mjs';
import { SteamAnchoredSender, SteamAnchoredReceiver } from './anchored-snapshots.mjs';
import { SocketWireReceiver, SocketWireBudget, socketWireFrame, socketWireHeader, validNonce, ZERO_NONCE, SOCKET_WIRE_MAX } from './sockets-wire.mjs';
const TIMEOUT=8000, MAX_QUEUE_BYTES=SOCKET_WIRE_MAX+64*1024, MAX_QUEUE=64, CAPABILITIES=7;
const uint=v=>Number.isInteger(v)&&v>=0&&v<=0xffffffff;
const validId=v=>typeof v==='string'&&/^[1-9][0-9]{15,19}$/.test(v)&&BigInt(v)<=0xffffffffffffffffn;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const validMatch=v=>typeof v==='string'&&v.length>0&&v.length<=256;
const stateShape=v=>object(v)&&v.type==='state'&&validMatch(v.matchId)&&Number.isSafeInteger(v.seq)&&v.seq>=0&&object(v.frame)&&Number.isSafeInteger(v.frame.tick)&&v.frame.tick>=0;
export class SteamSocketSession {
 constructor({transport,ticket,localId,ownerId,build,gameProtocol,flightBudget=null,wireBudget=new SocketWireBudget(),encoder=null,codec=null,nonce=randomBytes(16).toString('hex')}){
  if(typeof transport?.send!=='function'||typeof transport?.disconnect!=='function'||!validId(localId)||!validId(ownerId)||!validId(ticket?.remote)||ticket.remote===localId
   ||localId!==ownerId&&ticket.remote!==ownerId||!validId(ticket?.scope)||!Number.isInteger(ticket?.handle)||ticket.handle<1||ticket.handle>0xffffffff
   ||typeof ticket.lease!=='string'||!/^\d{1,19}$/.test(ticket.lease)||BigInt(ticket.lease)<1n||BigInt(ticket.lease)>0x7fffffffffffffffn
   ||typeof build!=='string'||!build.length||build.length>128||!Number.isInteger(gameProtocol)||gameProtocol<1||!validNonce(nonce))throw Error('Invalid socket session configuration');
  this.ownsEncoder=!encoder;this.ownsCodec=!codec;encoder??=new SteamSnapshotEncoder();codec??=flightBudget?new SteamSocketStateCodec():new SteamPacketCodec();
  Object.assign(this,{transport,localId,ownerId,build,gameProtocol,encoder,codec});this.flightBudget=flightBudget;this.receipts=[];this.receiptAt=null;this.ticket=Object.freeze({...ticket});this.host=localId===ownerId;
  this.localNonce=nonce;this.remoteNonce=null;this.state='new';this.failure=null;this.since=0;this.lastPong=0;this.lastPing=0;this.pingSerial=0;this.ping=null;
  this.sequence=0;this.controls=[];this.controlBytes=0;this.stateJob=null;this.latest=null;this.awaitingReliable=null;this.epoch=0;this.matchId=null;this.streamReady=false;this.streamSentAt=null;
  this.sender=new SteamAnchoredSender({adaptive:Boolean(flightBudget)});this.receiver=new SteamAnchoredReceiver();this.wire=new SocketWireReceiver(wireBudget);this.lastSeq=-1;
  this.events=[];this.eventBytes=0;this.present=null;this.stats={sentPackets:0,sentBytes:0,droppedSnapshots:0,staleSessionPackets:0,deliveredStates:0,missedAnchors:0,anchorAcks:0,matchedPongs:0,coalescedControls:0};
 }
 config(){return {wire:1,capabilities:CAPABILITIES|(this.flightBudget?24:0),scope:this.ticket.scope,build:this.build,protocol:this.gameProtocol};}
 matchesConfig(v){return object(v)&&v.wire===1&&uint(v.capabilities)&&(v.capabilities&(CAPABILITIES|(this.flightBudget?24:0)))===(CAPABILITIES|(this.flightBudget?24:0))&&v.scope===this.ticket.scope&&v.build===this.build&&v.protocol===this.gameProtocol;}
 start(now){if(this.state!=='new'||!Number.isFinite(now))throw Error('Socket session already started');this.since=now;this.state=this.host?'await-hello':'hello-queued';if(!this.host)this.queue('hello',this.config(),0,()=>{this.state='await-welcome';});}
 frame(op,prepared,epoch=0){this.sequence=(this.sequence+1)>>>0;return socketWireFrame({op,source:this.localNonce,target:this.remoteNonce??ZERO_NONCE,epoch,id:this.sequence,prepared,wide:Boolean(this.flightBudget)&&op==='snapshot'});}
 queue(op,value,epoch=0,done=null,coalesce=null){
  if(this.state==='closed')return false;
  try{
   const prepared=this.codec.prepare('data',JSON.stringify(value));const frame=this.frame(op,prepared,epoch);
   // Only adjacent, completely unsent movement is replaceable. An action,
   // another scope, or the first native fragment is an ordering barrier.
   const last=this.controls.at(-1);
   const replace=coalesce&&last?.coalesce&&last.startedAt===null&&['control','input'].includes(last.frame.op)&&op===last.frame.op
    &&coalesce.scope===last.coalesce.scope&&coalesce.seq>last.coalesce.seq;
   if(replace){this.controls.pop();this.controlBytes-=last.frame.bytes;this.stats.coalescedControls++;}
   if(this.controls.length>=MAX_QUEUE||this.controlBytes+frame.bytes>MAX_QUEUE_BYTES){this.close('control-queue-overflow');return false;}
   this.controls.push({frame,index:0,done,startedAt:null,coalesce});this.controlBytes+=frame.bytes;return true;
  }catch{this.close('invalid-outgoing-control');return false;}
 }
 emit(event,bytes=0){if(this.events.length>=32||this.eventBytes+bytes>MAX_QUEUE_BYTES){this.close('application-queue-overflow');return;}this.events.push(event);this.eventBytes+=bytes;}
 takeEvents(){const result=this.events.splice(0);this.eventBytes=0;if(this.present){result.push({type:'state',data:this.present});this.present=null;}return result;}
 markReady(now){this.state='ready';this.lastPong=now;this.lastPing=now;this.emit({type:'ready'});}
 // Stop obsolete offers without abandoning a partially admitted reliable frame.
 // Its receiver still needs the remaining fragments/ACK within the original TTL.
 suspendStates(){this.latest=null;if(this.stateJob&&(this.stateJob.frame.kind==='snapshot'||this.stateJob.startedAt===null))this.stateJob=null;}
 sendControl(value,{coalesce=null}={}){
  if(this.state!=='ready'||!object(value)||typeof value.type!=='string')return false;
  if(coalesce&&(!object(coalesce)||typeof coalesce.scope!=='string'||coalesce.scope.length>1024||!Number.isSafeInteger(coalesce.seq)||coalesce.seq<0))return false;
  const op=this.flightBudget&&!this.host&&value.type==='app'&&value.data?.type==='input'?'input':'control';
  return this.queue(op,value,0,null,coalesce);
 }
 checkTime(now){
  if(this.state==='new'||this.state==='closed')return false;
  if(!Number.isFinite(now)||now<this.since){this.close('invalid-clock');return false;}
  if(this.state!=='ready'&&now-this.since>TIMEOUT){this.close('wire-handshake-timeout');return false;}
  if(this.state==='ready'&&now-this.lastPong>TIMEOUT){this.close('wire-heartbeat-timeout');return false;}
  if(this.host&&!this.streamReady&&this.streamSentAt!==null&&now-this.streamSentAt>TIMEOUT){this.close('wire-stream-ack-timeout');return false;}
  if(this.awaitingReliable&&now-this.awaitingReliable.since>TIMEOUT){this.close('wire-state-ack-timeout');return false;}
  for(const job of [this.controls[0],this.stateJob])if(job&&job.frame.kind!=='snapshot'&&job.startedAt!==null&&now-job.startedAt>TIMEOUT){this.close('wire-send-timeout');return false;}
  if(this.flightBudget?.expired(this,now)){this.close('wire-delivery-timeout');return false;}
  if(this.wire.sweep(now)){this.close('wire-reassembly-timeout');return false;}return true;
 }
 offerState(text,now){
  if(this.state!=='ready'||!this.host)return {status:'not-ready'};
  if(typeof text!=='string'||Buffer.byteLength(text)>SOCKET_WIRE_MAX-4096)return {status:'invalid-state'};
  let value;try{value=this.encoder.prepare(text,this.codec)?.value??JSON.parse(text);}catch{return {status:'invalid-state'};}
  if(!stateShape(value))return {status:'invalid-state'};
  if(value.matchId!==this.matchId){
   if(this.epoch===0xffffffff){this.close('stream-epoch-exhausted');return {status:'error'};}
   this.epoch++;this.matchId=value.matchId;this.streamReady=false;this.streamSentAt=null;this.sender.reset();this.stateJob=null;this.awaitingReliable=null;
   const epoch=this.epoch;
   if(!this.queue('stream',{matchId:this.matchId},epoch,sentAt=>{if(this.epoch===epoch)this.streamSentAt=sentAt;}))return {status:'error'};
  }
  this.latest={text,seq:value.seq,at:now};
  // Any entirely unsent state may be replaced. Once the first fragment is admitted, finish this ONE bounded frame
  // (or expire it) while coalescing latest. Cancelling every 16ms update would
  // starve any frame that needs more than two paced native packets forever.
  if(this.stateJob&&this.stateJob.startedAt===null){if(this.stateJob.frame.kind==='snapshot')this.stats.droppedSnapshots++;this.stateJob=null;}
  return {status:'queued'};
 }
 prepareState(now){
  if(!this.latest||!this.streamReady||this.stateJob||this.awaitingReliable?.op==='full')return;
  const latest=this.latest;this.latest=null;
  const choice=this.sender.prepare(latest.text,this.encoder,this.codec,now);
  if(choice.kind==='reset-required'){this.close('invalid-stream-transition');return;}
  const full=choice.kind==='unsupported';
  if(full&&this.awaitingReliable){this.latest=latest;return;}
  const op=full?'full':choice.kind,prepared=full?this.codec.prepare('data',latest.text):choice.prepared;
  const frame=this.frame(op,prepared,this.epoch);
  this.stateJob={frame,index:0,at:now,startedAt:null,done:(_sentAt,startedAt)=>{
   if(full){this.sender.reset();this.awaitingReliable={op,id:frame.id,since:startedAt};}
   else if(op==='anchor'){
    if(!this.sender.commit(choice)){this.close('anchor-commit-failed');return;}
    this.awaitingReliable={op,id:frame.id,token:choice.target.token,since:startedAt};
   }else this.sender.commit(choice); // An ACK may retire this prepared revision; no baseline changes for snapshots.
  }};
 }
 pump({now,maxBytes,maxPackets=16,traffic='all'}){
  if(!['all','control','state'].includes(traffic)||!Number.isInteger(maxBytes)||maxBytes<0||maxBytes>65536||!Number.isInteger(maxPackets)||maxPackets<0||maxPackets>64)throw Error('Explicit bounded socket send budget required');
  if(!this.checkTime(now))return {bytes:0,packets:0};
  if(this.receipts.length&&now>=this.receiptAt){
   this.queue('receipt',{packets:this.receipts.splice(0,32)});this.receiptAt=this.receipts.length?now+(this.host?100:40):null;
  }
  if(this.state==='ready'&&!this.ping&&now-this.lastPing>=1000){
   this.pingSerial=(this.pingSerial+1)>>>0;const ping=this.ping={serial:this.pingSerial,sentAt:null};this.lastPing=now;
   this.queue('ping',{serial:ping.serial},0,sentAt=>{ping.sentAt=sentAt;});
  }
  let bytes=0,packets=0;
  try{
   while(this.state!=='closed'&&packets<maxPackets){
    // Native lane priority does not replace this per-pump application priority.
    // A room scheduler can service ALL peers' controls before any state,
    // instead of exhausting its shared credit on the first peer's snapshot.
    if(traffic==='state'&&this.controls.length)break;
    if(traffic!=='control'&&!this.controls.length&&this.state==='ready')this.prepareState(now);
    // Input is reliable on the otherwise guest-idle anchor lane. It cannot
    // sit in front of challenge replies on control lane 0, even before SDK admission.
    const control=this.controls.find(job=>job.frame.kind==='control')??this.controls[0];
    const job=traffic==='control'?control:control??this.stateJob;if(!job)break;
    if(job.frame.kind!=='snapshot'&&job.startedAt!==null&&now-job.startedAt>TIMEOUT){this.close('wire-send-timeout');break;}
    if(job.frame.kind==='snapshot'&&now-job.at>500){this.stateJob=null;this.stats.droppedSnapshots++;continue;}
    const packet=job.frame.packet(job.index);if(bytes+packet.length>maxBytes)break;
    const tracked=job.frame.kind!=='control'&&this.flightBudget;
    if(tracked&&!this.flightBudget.allows(this,packet.length,job))break;
    const result=this.transport.send(this.ticket,packet,job.frame.kind);
    if(result.status==='backpressure'){this.flightBudget?.cancelWait(this);break;}
    if(result.status==='dropped'&&job.frame.kind==='snapshot'){this.flightBudget?.cancelWait(this);this.stateJob=null;this.stats.droppedSnapshots++;break;}
    if(result.status!=='accepted'){this.close('native-send-failed');break;}
    if(tracked)this.flightBudget.track(this,{epoch:job.frame.epoch,id:job.frame.id,index:job.index,bytes:packet.length,kind:job.frame.kind},now,job);
    bytes+=packet.length;packets++;job.index++;job.startedAt??=now;
    if(job.index===job.frame.count){
     const controlIndex=this.controls.indexOf(job);if(controlIndex>=0){this.controls.splice(controlIndex,1);this.controlBytes-=job.frame.bytes;}else this.stateJob=null;
     job.done?.(now,job.startedAt);
    }
   }
  }catch{this.close('wire-send-failed');}
  this.stats.sentBytes+=bytes;this.stats.sentPackets+=packets;return {bytes,packets};
 }
 receive(message,now){
  if(this.state==='new'||this.state==='closed')return;
  const t=message?.ticket;
  if(!t||['handle','lease','remote','scope'].some(k=>t[k]!==this.ticket[k])){this.stats.staleSessionPackets++;return;}
  if(!this.checkTime(now))return;
  try{
   const h=socketWireHeader(message.kind,message.data);
   const hello=this.host&&this.state==='await-hello'&&h.op==='hello'&&h.target===ZERO_NONCE;
   const welcome=!this.host&&this.state==='await-welcome'&&h.op==='welcome'&&h.target===this.localNonce;
   if(!hello&&!welcome&&(h.source!==this.remoteNonce||h.target!==this.localNonce)){this.stats.staleSessionPackets++;return;}
   if((h.op==='hello'&&!hello)||(h.op==='welcome'&&!welcome)){this.stats.staleSessionPackets++;return;}
   if(h.packedState&&!this.flightBudget)throw Error('Unnegotiated packed state');
   if(hello||welcome){
    if(h.epoch!==0)throw Error('Invalid handshake epoch');
   }else if(h.op==='ready'){
    if(this.host&&this.state==='ready'){this.stats.staleSessionPackets++;return;}
    if(!this.host||this.state!=='await-ready'||h.epoch!==0)throw Error('Unexpected ready');
   }else{
    if(this.state!=='ready')throw Error('Data before handshake');
    if(['anchor','snapshot','full','stream'].includes(h.op)&&this.host)throw Error('Guest cannot supply host states');
    if(h.op==='input'&&!this.host)throw Error('Unexpected input direction');
    if(this.flightBudget&&['anchor','snapshot','full','input'].includes(h.op)){
     if(this.receipts.length>=256)throw Error('Receipt queue overflow');
     this.receipts.push([h.epoch,h.id,h.index]);this.receiptAt??=now+(this.host?100:40);
    }
    if(['anchorAck','fullAck','streamAck'].includes(h.op)&&!this.host)throw Error('Unexpected state acknowledgement');
    if(['anchor','snapshot','full','anchorAck','fullAck','streamAck'].includes(h.op)&&(!this.epoch||h.epoch!==this.epoch)){this.stats.staleSessionPackets++;return;}
    if(h.op==='stream'&&(!h.epoch||h.epoch<this.epoch)){this.stats.staleSessionPackets++;return;}
    if(['control','ping','pong','receipt','input'].includes(h.op)&&h.epoch!==0)throw Error('Unexpected control epoch');
   }
   const decoded=this.wire.receive(h,message.data,now);if(decoded===null)return;const value=decoded.data;
   if(hello||welcome){
    if(!this.matchesConfig(value))throw Error('Incompatible socket handshake');
    this.remoteNonce=h.source;
    if(hello){this.state='welcome-queued';this.queue('welcome',this.config(),0,()=>{this.state='await-ready';});}
    else{this.state='ready-queued';this.queue('ready',this.config(),0,sentAt=>this.markReady(sentAt));}
    return;
   }
   if(h.op==='ready'){if(!this.matchesConfig(value))throw Error('Incompatible ready');this.markReady(now);return;}
   if(!object(value))throw Error('Invalid control object');
   if(h.op==='receipt'){
    if(!Array.isArray(value.packets)||value.packets.length<1||value.packets.length>32||value.packets.some(p=>!Array.isArray(p)||p.length!==3||!p.every(uint)))throw Error('Invalid state receipt');
    this.flightBudget?.acknowledge(this,value.packets,now);
   }else if(h.op==='control'||h.op==='input'){if(typeof value.type!=='string')throw Error('Invalid application message');this.emit({type:'control',data:value},h.raw);}
   else if(h.op==='ping'){if(!uint(value.serial))throw Error('Invalid ping');this.queue('pong',{serial:value.serial});}
   else if(h.op==='pong'){
    if(!uint(value.serial))throw Error('Invalid pong');
    if(this.ping?.sentAt!==null&&this.ping?.serial===value.serial){this.lastPong=now;this.ping=null;this.stats.matchedPongs++;}
   }else if(h.op==='stream'){
    if(!validMatch(value.matchId)||h.epoch===this.epoch&&value.matchId!==this.matchId)throw Error('Invalid stream');
    if(h.epoch!==this.epoch){this.epoch=h.epoch;this.matchId=value.matchId;this.receiver.reset();this.wire.resetState();this.lastSeq=-1;this.present=null;}
    this.queue('streamAck',{matchId:this.matchId},this.epoch);
   }else if(h.op==='streamAck'){
    if(value.matchId!==this.matchId)throw Error('Invalid stream acknowledgement');if(this.streamSentAt!==null)this.streamReady=true;
   }else if(h.op==='anchorAck'||h.op==='fullAck'){
    const expected=h.op==='anchorAck'?'anchor':'full',waiting=this.awaitingReliable;
    if(waiting?.op===expected&&value.id===waiting.id&&(expected==='full'||value.token===waiting.token)){
     if(expected==='anchor'){if(!this.sender.acknowledgeAnchor(value.token))throw Error('Anchor acknowledgement rejected');this.stats.anchorAcks++;}
     this.awaitingReliable=null;
    }
   }else{
    let data;
    if(h.op==='anchor'){
     const result=this.receiver.receiveAnchor(value);data=result.data;this.queue('anchorAck',{id:h.id,token:result.anchorAck},this.epoch);
    }else if(h.op==='snapshot'){
     const result=this.receiver.receiveSnapshot(value);data=result.data;if(result.needsAnchor)this.stats.missedAnchors++;
    }else if(h.op==='full'){
     if(!stateShape(value))throw Error('Invalid reliable full state');data=value;this.queue('fullAck',{id:h.id},this.epoch);
    }else throw Error('Unexpected wire operation');
    if(data){
     if(!stateShape(data)||data.matchId!==this.matchId)throw Error('State scope mismatch');
     if(data.seq>this.lastSeq){this.lastSeq=data.seq;this.present=data;this.stats.deliveredStates++;if(h.op==='full')this.receiver.reset();}
    }
   }
  }catch{this.close('invalid-wire-message');}
 }
 close(reason='local-close'){
  if(this.state==='closed')return;this.failure=reason;this.state='closed';this.controls.length=0;this.controlBytes=0;this.stateJob=null;this.latest=null;this.awaitingReliable=null;
  this.receipts.length=0;this.receiptAt=null;this.flightBudget?.retire(this);this.sender.reset();this.receiver.reset();this.wire.clear();if(this.ownsCodec)this.codec.clear();if(this.ownsEncoder)this.encoder.clear();this.events=[{type:'closed',reason}];this.eventBytes=0;this.present=null;this.ping=null;
  try{this.transport.disconnect(this.ticket);}catch{ /* lifecycle owner contains/quarantines native errors */ }
 }
 diagnostics(){return {state:this.state,failure:this.failure,epoch:this.epoch,streamReady:this.streamReady,queuedControls:this.controls.length,controlBytes:this.controlBytes,
  pendingStateBytes:this.stateJob?.frame.prepared.payload.length??0,latestStateBytes:this.latest?Buffer.byteLength(this.latest.text):0,awaitingStateAck:Boolean(this.awaitingReliable),
  ...this.stats,reassembly:this.wire.diagnostics(),sender:this.sender.diagnostics(),receiver:this.receiver.diagnostics()};}
}
