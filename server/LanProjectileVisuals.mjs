import {compressVisualBytes} from './ProjectileVisualWire.mjs';
import {VISUAL_FRAGMENT_BYTES as F} from '../src/network/ProjectileVisualPacket.mjs';
import { ANCHORED_VISUAL_LIMITS as L } from '../src/network/AnchoredProjectileVisual.mjs';
/** Shared immutable publication, bounded per-peer consumption windows. This is
 * application retention credit, NOT TCP receipt, display FPS, or network RTT.
 * A reset retires slots without refunding bytes; only exact receipts or actual
 * socket teardown free them. One baseline + latest update, no event backlog. */
export class LanProjectileVisuals {
 constructor(matchId,{now=()=>performance.now(),maxFlightBytes=32768,maxPeerBytes=32768,bytesPerSecond=512*1024}={}){
  this.matchId=matchId;this.now=now;this.maxFlightBytes=maxFlightBytes;this.maxPeerBytes=maxPeerBytes;this.rate=bytesPerSecond;
  this.tokens=maxFlightBytes;this.at=now();this.flightBytes=0;this.peers=new Map();this.latest=null;this.rotation=0;this.closed=false;
  this.totals={publications:0,sent:0,consumed:0,discarded:0,fragment:0,skippedWritable:0,skippedBudget:0,oversizeBaseline:0,peakFlightBytes:0};
 }
 publish(p){
  if(this.closed)return false;
  if(!p||!Number.isSafeInteger(p.key)||p.key<=0||!Number.isSafeInteger(p.tick)||p.tick<0||!Number.isSafeInteger(p.baseTick)||p.baseTick<0||p.baseTick>p.tick||!Number.isFinite(p.time)||p.time<0||!(p.baseline instanceof Uint8Array)||p.baseline.length>L.baselineBytes||p.update!==null&&(!(p.update instanceof Uint8Array)||p.update.length>L.updateBytes)||!p.update&&p.tick!==p.baseTick)throw Error('Invalid visual publication');
  const old=this.latest;
  if(old&&(p.tick<=old.tick||p.time<old.time||p.key<old.key||p.key===old.key&&(p.baseTick!==old.baseTick||p.baseline.length!==old.rawBaselineBytes)))throw Error('Visual publication rewinds room');
  // Node encodes base64 once per room, not once per consumer. Byte arrays from
  // the authority worker have dedicated ownership in this process.
  const base=p.key===old?.key?old.base:compressVisualBytes(p.baseline),update=p.update?compressVisualBytes(p.update):null;
  this.latest={key:p.key,tick:p.tick,baseTick:p.baseTick,time:p.time,rawBaselineBytes:p.baseline.length,baselineBytes:base.bytes,base,baseline:base.data,updateWire:update,update:update?.data??null};
  this.totals.publications++;return true;
 }
 peer(peer,syncId){
  let p=this.peers.get(peer);if(!p){p={syncId,key:0,lastTick:-1,consumedAt:-Infinity,slots:[],bytes:0,active:true};this.peers.set(peer,p);}
  if(p.syncId!==syncId){p.syncId=syncId;p.key=0;p.lastTick=-1;p.consumedAt=-Infinity;p.baseWaitSince=null;p.partKey=0;p.partOffset=0;}
  p.active=true;return p;
 }
 reset(peer){const p=this.peers.get(peer);if(p){p.active=false;p.syncId=null;p.key=0;p.lastTick=-1;p.consumedAt=-Infinity;p.partKey=0;p.partOffset=0;}}
 needsBaseline(peer,syncId){
  if(this.closed||!this.latest)return false;
  const p=this.peer(peer,syncId),now=this.now();
  if(p.key===this.latest.key){p.baseWaitSince=null;return false;}
  p.baseWaitSince??=now;
  // A short bootstrap opportunity, not indefinite permission to starve the
  // full fallback on a broken visual consumer. No timer refunds sent credit.
  return now>=p.baseWaitSince&&now-p.baseWaitSince<500;
 }
 canReplaceBulk(peer,syncId,tick,minTick=0){
  const p=this.peers.get(peer),age=this.now()-(p?.consumedAt??-Infinity);
  return !this.closed&&!!p?.active&&p.syncId===syncId&&p.key>0&&p.lastTick>=minTick&&p.lastTick<=tick&&tick-p.lastTick<=15&&age>=0&&age<=250;
 }
 hasDebt(peer){return !!this.peers.get(peer)?.slots.length;}
 abandon(peer){const p=this.peers.get(peer);if(p)this.flightBytes-=p.bytes;this.peers.delete(peer);}
 close(){this.closed=true;this.latest=null;for(const peer of this.peers.keys())this.reset(peer);}
 flush(recipients,{writable,send,encode=(_p,m)=>JSON.stringify(m)}){
  if(this.closed||!this.latest)return null;
  let retryAfter=null;
  const now=this.now();this.tokens=Math.min(this.maxFlightBytes,this.tokens+Math.max(0,now-this.at)*this.rate/1000);this.at=now;
  const start=this.rotation++%Math.max(1,recipients.length),list=recipients.slice(start).concat(recipients.slice(0,start)),v=this.latest;
  for(const {peer,syncId} of list){
   const p=this.peer(peer,syncId);if(p.slots.length>=2)continue;
   const kind=p.key===v.key?'update':'baseline',tick=kind==='baseline'?v.baseTick:v.tick;
   if(kind==='update'&&(!v.update||tick<=p.lastTick)||p.slots.some(s=>s.syncId===syncId&&(s.kind==='baseline'||s.tick>=tick)))continue;
   if(!writable(peer,kind)){this.totals.skippedWritable++;retryAfter=16;continue;}
   if(kind==='baseline'&&p.partKey!==v.key){p.partKey=v.key;p.partOffset=0;}
   const offset=kind==='baseline'?p.partOffset:undefined,total=kind==='baseline'?v.baselineBytes:undefined;
   const payload=kind==='baseline'?v.baseline.slice(offset/3*4,Math.ceil(Math.min(total,offset+F)/3)*4):v.update;
   const wire=kind==='baseline'?v.base:v.updateWire;
   const message={type:'projectile-visual',matchId:this.matchId,syncId,key:v.key,tick,kind,data:payload,...(wire.encoding?{encoding:wire.encoding,rawBytes:wire.rawBytes}:{}),...(offset!==undefined?{offset,total}:{})};
   // Preserve application-retention credit across wire encodings. Smaller
   // binary transport must not silently allow more costly visual decodes or
   // steal the whole-world share; count the canonical JSON envelope as before.
   const data=encode(peer,message),size=Buffer.byteLength(typeof data==='string'?data:JSON.stringify(message));
   if(size>this.maxPeerBytes){if(kind==='baseline')this.totals.oversizeBaseline++;continue;}
   if(p.bytes+size>this.maxPeerBytes||this.flightBytes+size>this.maxFlightBytes){this.totals.skippedBudget++;continue;}
   if(size>this.tokens){this.totals.skippedBudget++;const delay=Math.max(1,Math.ceil((size-this.tokens)*1000/this.rate));retryAfter=retryAfter===null?delay:Math.min(retryAfter,delay);continue;}
   const slot={syncId,key:v.key,tick,kind,size,offset,total};p.slots.push(slot);p.bytes+=size;this.flightBytes+=size;this.tokens-=size;
   // Reserve before sending (also supports synchronous test transports). Refused
   // writes may refund the reservation; admitted bytes cannot be cancelled.
   let accepted=false;try{accepted=send(peer,kind,message,data)!==false;}finally{if(!accepted){const i=p.slots.indexOf(slot);if(i>=0){p.slots.splice(i,1);p.bytes-=size;this.flightBytes-=size;this.tokens+=size;}}}
   if(accepted){this.totals.sent++;this.totals.peakFlightBytes=Math.max(this.totals.peakFlightBytes,this.flightBytes);}else retryAfter=16;
  }
  return retryAfter;
 }
 acknowledge(peer,m){
  if(m?.type!=='visual-consumed'||m.matchId!==this.matchId||!['consumed','discarded','fragment'].includes(m.status))return false;
  const p=this.peers.get(peer),index=p?.slots.findIndex(s=>s.syncId===m.syncId&&s.key===m.key&&s.tick===m.tick&&s.kind===m.kind&&s.offset===m.offset&&s.total===m.total)??-1;
  if(index<0)return false;
  const slot=p.slots[index],partial=slot.offset!==undefined&&slot.offset+F<slot.total;
  if(m.status==='fragment'&&!partial||m.status==='consumed'&&partial)return false;
  const [s]=p.slots.splice(index,1);p.bytes-=s.size;this.flightBytes-=s.size;this.totals[m.status]++;
  if(p.active&&p.syncId===s.syncId){
   if(m.status==='fragment'){if(p.partKey===s.key)p.partOffset=s.offset+F;}
   else if(m.status==='consumed'){if(s.kind==='baseline'){p.key=s.key;p.partOffset=0;}p.lastTick=Math.max(p.lastTick,s.tick);p.consumedAt=this.now();}
   else {p.key=0;p.lastTick=-1;p.consumedAt=-Infinity;p.partKey=0;p.partOffset=0;}
  }
  return true;
 }
 stats(){return {...this.totals,flightBytes:this.flightBytes,peers:this.peers.size,retainedPublicationBytes:this.latest?this.latest.baseline.length+(this.latest.update?.length??0):0};}
}
