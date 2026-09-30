import {createAuthorityAdmission, closeAuthorityAdmission, writeAuthorityAdmission} from './AuthorityIoAdmission.mjs';
import {createAuthorityCompletion, closeAuthorityCompletion, writeAuthorityCompletion} from './AuthorityLocalCompletion.mjs';
import {encodeBinaryState} from './BinarySnapshot.mjs';
import config from './protocol.json' with {type:'json'};
import {RealtimeSendGate} from './RealtimeSendPolicy.mjs';

/** Private MessagePort on the EXISTING authenticated socket. No new network
 * endpoint, speculative ACK, payload backlog or authority role is introduced. */
export class AuthorityIoBridge {
 constructor({send,buffered,now=()=>performance.now(),sharedAdmission=false,sharedCompletion=globalThis.crossOriginIsolated === true && import.meta.env?.VITE_LAN_LOCAL_IO_CREDIT !== 'false'}) { this.sharedAdmission=sharedAdmission;this.admission=null;this.sharedCompletion=sharedCompletion;this.completion=null;this.send=send;this.buffered=buffered;this.now=now;this.gate=new RealtimeSendGate();this.port=null;this.seq=0;this.active=false;this.matchId=''; }
 attach(port,matchId,seq=0) {
  this.close();
  if(typeof matchId!=='string'||!matchId||matchId.length>128||!Number.isSafeInteger(seq)||seq<0)throw Error('Invalid authority link');
  this.completion=createAuthorityCompletion(this.sharedCompletion);
  this.admission=createAuthorityAdmission(this.sharedCompletion && this.sharedAdmission);
  this.port=port;this.matchId=matchId;this.seq=seq;this.active=false;
  port.onmessage=e=>{if(this.port!==port)return;try{this.publish(e.data);}catch{this.close('Authority I/O publication failed');}};
  this.refreshAdmission();
  port.start?.();port.postMessage({type:'io-ready',...(this.completion?{completion:this.completion.buffer}:{}),...(this.admission?{admission:this.admission.buffer}:{})});
 }
 close(reason='Authority I/O detached') {
  closeAuthorityAdmission(this.admission);this.admission=null;
  closeAuthorityCompletion(this.completion);this.completion=null;
  const p=this.port;this.port=null;this.active=false;this.gate.reset();
  if(p){try{p.postMessage({type:'io-unavailable',reason,nextSequence:this.seq});}finally{p.close();}}
 }
 // The owner must refresh on sends AND drain/reservation rollback. Zero queued
 // bytes permits a try without resetting the companion batch as a side effect.
 refreshAdmission(bufferedAmount) {
  if(!this.admission)return;
  const bytes=bufferedAmount ?? this.buffered();
  writeAuthorityAdmission(this.admission,!this.active || !(bytes===0 || this.gate.canSendSnapshot(bytes,this.now())));
 }
 observe(data) {
  if(!this.port||typeof data!=='string'||data.length>16384||!/^\{"type":"(?:input|presence|deployment|launch|resume|ended|roomClosed|error)"/.test(data))return;
  const m=JSON.parse(data);
  if(['roomClosed','error'].includes(m.type)){this.active=false;this.refreshAdmission();this.port.postMessage({type:'stop'});return;}
  if(m.matchId!==this.matchId)return;
  if(m.type==='resume'){if(Number.isSafeInteger(m.stateSeq)&&m.stateSeq>=-1)this.seq=Math.max(this.seq,m.stateSeq+1);return;}
  if(m.type==='launch'){this.active=true;this.refreshAdmission();this.port.postMessage({type:'start'});return;}
  if(m.type==='ended'){this.active=false;this.refreshAdmission();this.port.postMessage({type:'stop'});return;}
  if(['input','presence','deployment'].includes(m.type)){this.port.postMessage(m);return true;}
 }
 publish(m) {
  if(!this.port)return;
  if(m?.type==='barrier'){this.port.postMessage({type:'io-barrier',id:m.id});return;}
  if(!['snapshot','motion','deployment-result'].includes(m?.type))throw Error('Invalid authority publication');
  if(m.type==='deployment-result'){if(this.active)this.send(JSON.stringify({...m,matchId:this.matchId}));this.refreshAdmission();return;}
  const isState=m.type==='snapshot',now=this.now(),tick=m.tick;
  if(!Number.isSafeInteger(tick)||tick<0)throw Error('Invalid authority tick');
  const attempt=m.attempt;
  if(attempt!==undefined&&(!Number.isSafeInteger(attempt)||attempt<=0))throw Error('Invalid authority attempt');
  let delivery='skipped';
  if(this.active && (isState?this.gate.canSendSnapshot(this.buffered(),now):this.gate.canSendMotion(this.buffered(),now))){
   let data;
   if(isState){
    if(m.binary instanceof ArrayBuffer){if(m.bytes!==m.binary.byteLength||m.bytes>=config.maxSnapshotBytes)throw Error('Authority snapshot budget');data=encodeBinaryState(this.matchId,this.seq++,m.binary);}
    else if(typeof m.json==='string'){data=JSON.stringify({type:'state',matchId:this.matchId,seq:this.seq++}).slice(0,-1)+',"frame":'+m.json+'}';if(new TextEncoder().encode(data).length>config.maxSnapshotBytes)throw Error('Authority snapshot budget');}
    else throw Error('Invalid authority frame');
   }else{if(typeof m.data!=='string'||m.data.length>15000)throw Error('Authority motion budget');data=JSON.stringify({type:'motion',matchId:this.matchId,data:m.data});}
   this.send(data);delivery='sent';if(isState)this.gate.snapshotSent(now);else this.gate.motionSent(now);
  }
  this.refreshAdmission();
  writeAuthorityCompletion(this.completion,isState?'snapshot':'motion',{tick,delivery,nextSequence:this.seq,...(attempt!==undefined?{attempt}:{})});
  this.port.postMessage({type:isState?'io-snapshot':'io-motion',tick,delivery,nextSequence:this.seq,...(attempt!==undefined?{attempt}:{})});
 }
}
