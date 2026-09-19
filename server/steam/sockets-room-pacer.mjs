// Experimental room-wide admission using native *pending* bytes, not per-peer
// window multiplication. Does not cancel packets already accepted by the SDK,
// measure an external router FIFO, or replace congestion-control/playtest gates.
export const SOCKET_ROOM_LIMITS=Object.freeze({peers:9,sampleMs:25,stateBytes:32768,allBytes:49152,peerStateBytes:16384,peerAllBytes:32768,unknownControlBytes:16384,queueMs:250,quantum:2048,deficit:16512,maxPacket:8256});
const safeCount=n=>Number.isSafeInteger(n)&&n>=0;
function usable(s){return s?.available===true&&safeCount(s.pendingBytes)&&safeCount(s.unackedReliableBytes)&&Array.isArray(s.lanes)&&s.lanes.length===3&&s.lanes.every((l,i)=>l.lane===i&&(l.queueMs===null||Number.isFinite(l.queueMs)&&l.queueMs>=0));}
export class SteamSocketRoomPacer {
 constructor({sample}){if(typeof sample!=='function')throw Error('Native status sampler required');this.sample=sample;this.records=new Map();this.cursor=0;this.lastNow=null;this.busy=false;this.faulted=false;this.stats={samples:0,unavailable:0,controlBytes:0,stateBytes:0,peakPendingEstimate:0,blockedState:0};}
 record(session,now){let r=this.records.get(session);if(!r){r={sampleAt:-Infinity,lastGood:null,available:false,added:0,deficit:SOCKET_ROOM_LIMITS.maxPacket,creditAt:now};this.records.set(session,r);}return r;}
 pending(r){return (r.lastGood?.pendingBytes??0)+r.added;}
 clear(){if(this.busy)return false;this.records.clear();this.lastNow=null;this.cursor=0;return true;}
 tick(sessions,now){
  if(this.faulted)throw Error('Socket room pacer quarantined');
  if(this.busy)throw Error('Socket room pacing is not reentrant');
  if(!Number.isFinite(now)||this.lastNow!==null&&now<this.lastNow||!Array.isArray(sessions)||sessions.length>SOCKET_ROOM_LIMITS.peers||new Set(sessions).size!==sessions.length
   ||sessions.some(s=>typeof s?.pump!=='function'||!s.ticket))throw Error('Invalid bounded socket room tick');
  this.lastNow=now;this.busy=true;
  const result={bytes:0,packets:0,controlBytes:0,stateBytes:0,sampled:0};
  try{
   const live=new Set(sessions.filter(s=>s.state!=='closed'));for(const s of this.records.keys())if(!live.has(s))this.records.delete(s);
   const active=[];
   for(const session of live){
    // Timeouts / ping creation still run without send credit. State/ACK clocks
    // must not be extended by bandwidth starvation or by control-only turns.
    session.pump({now,maxBytes:0,maxPackets:0,traffic:'control'});
    if(session.state==='closed'){this.records.delete(session);continue;}
    const r=this.record(session,now),quanta=Math.floor((now-r.creditAt)/8);
    if(quanta>0){r.deficit=Math.min(SOCKET_ROOM_LIMITS.deficit,r.deficit+quanta*SOCKET_ROOM_LIMITS.quantum);r.creditAt+=quanta*8;}
    if(now-r.sampleAt>=SOCKET_ROOM_LIMITS.sampleMs){
     r.sampleAt=now;let status;try{status=this.sample(session.ticket);}catch{status=null;}
     result.sampled++;this.stats.samples++;
     if(usable(status)){
      r.lastGood={pendingBytes:status.pendingBytes,unackedReliableBytes:status.unackedReliableBytes,queueMs:status.lanes.map(l=>l.queueMs),sendRateBytesPerSecond:status.sendRateBytesPerSecond??null};r.available=true;r.added=0;
     }else{r.available=false;this.stats.unavailable++;} // Retain last known queue + new admissions; never zero it on failure.
    }
    active.push({session,r});
   }
   let pending=active.reduce((sum,{r})=>sum+this.pending(r),0);
   this.stats.peakPendingEstimate=Math.max(this.stats.peakPendingEstimate,pending);
   const order=active.length?Array.from({length:active.length},(_,i)=>active[(this.cursor+i)%active.length]):[];
   // All peers' control lane gets an admission opportunity before ANY states.
   for(const traffic of ['control','state'])for(const {session,r}of order){
    if(session.state==='closed')continue;
    let grant;
    if(traffic==='control'){
     grant=Math.min(SOCKET_ROOM_LIMITS.maxPacket,SOCKET_ROOM_LIMITS.allBytes-pending,SOCKET_ROOM_LIMITS.peerAllBytes-this.pending(r));
     if(!r.available)grant=Math.min(grant,SOCKET_ROOM_LIMITS.unknownControlBytes-this.pending(r));
    }else{
     if(session.state!=='ready'||!r.available||r.lastGood.queueMs.slice(1).some(ms=>ms===null||ms>SOCKET_ROOM_LIMITS.queueMs)){this.stats.blockedState++;continue;}
     grant=Math.min(SOCKET_ROOM_LIMITS.maxPacket,r.deficit,SOCKET_ROOM_LIMITS.stateBytes-pending,SOCKET_ROOM_LIMITS.peerStateBytes-this.pending(r));
    }
    if(grant<=0)continue;
    const sent=session.pump({now,maxBytes:Math.floor(grant),maxPackets:1,traffic});
    if(!safeCount(sent?.bytes)||sent.bytes>grant||!safeCount(sent.packets)||sent.packets>1)throw Error('Socket session exceeded granted budget');
    r.added+=sent.bytes;pending+=sent.bytes;result.bytes+=sent.bytes;result.packets+=sent.packets;result[traffic+'Bytes']+=sent.bytes;this.stats[traffic+'Bytes']+=sent.bytes;
    if(traffic==='state')r.deficit-=sent.bytes;
    this.stats.peakPendingEstimate=Math.max(this.stats.peakPendingEstimate,pending);
   }
   this.cursor=active.length?(this.cursor+1)%active.length:0;
   return result;
  }catch(error){this.faulted=true;throw error;}finally{this.busy=false;}
 }
 diagnostics(){return {faulted:this.faulted,peers:this.records.size,pendingEstimate:[...this.records.values()].reduce((sum,r)=>sum+this.pending(r),0),unackedReliableBytes:[...this.records.values()].reduce((sum,r)=>sum+(r.lastGood?.unackedReliableBytes??0),0),...this.stats};}
}
