import { prepareSnapshotChunks, snapshotChunkPacket, newSnapshotChunkId, SNAPSHOT_CHUNK_LIMITS as L } from './SnapshotChunkCodec.mjs';
// One room owns one ACK-paced byte pool. Queueing a 50KB world never means a
// 50KB write to TCP. At most one prepared world per peer; no historical backlog.
// Transport receipts free CHUNK bytes only, never delta/renderer state credit.
export class LanBulkScheduler {
 constructor({maxFlightBytes=8192,maxPeerFlightBytes=4096,initialFlightBytes=maxFlightBytes,adaptive=false,maxRetainedBytes=12*1024*1024,prepare=prepareSnapshotChunks,now=()=>performance.now()}={}){
  if(!Number.isSafeInteger(maxFlightBytes)||maxFlightBytes<L.packet+4||maxFlightBytes>65536||!Number.isSafeInteger(maxPeerFlightBytes)||maxPeerFlightBytes<L.packet+4||maxPeerFlightBytes>maxFlightBytes)throw Error('Invalid bulk flight limits');
  if(!Number.isSafeInteger(initialFlightBytes)||initialFlightBytes<2048||initialFlightBytes>maxFlightBytes)throw Error('Invalid initial flight limit');
  if(!Number.isSafeInteger(maxRetainedBytes)||maxRetainedBytes<L.packet||maxRetainedBytes>24*1024*1024)throw Error('Invalid retained byte limit');
  this.ceiling=maxFlightBytes;this.limit=initialFlightBytes;this.floor=Math.min(8192,initialFlightBytes);this.adaptive=adaptive;this.feedback=new Map();this.adjustedAt=-Infinity;this.blockedAt=-Infinity;
  this.peerLimit=maxPeerFlightBytes;this.maxRetained=maxRetainedBytes;this.prepare=prepare;this.now=now;
  this.jobs=new Map();this.ownedJobs=new Set();this.ledger=new Map();this.flightBytes=0;this.retainedBytes=0;this.closed=false;this.scheduled=null;this.cursor=0;this.serial=0;
  this.totals={queued:0,completed:0,packets:0,wireBytes:0,receipts:0,ignoredReceipts:0,peakFlightBytes:0,peakRetainedBytes:0,cancelled:0,retiredBytes:0,failures:0,increased:0,reduced:0,abandonedBytes:0,abandonedChunks:0,disconnectedPeers:0};
  this.preparing=new WeakMap();
 }
 observeCritical(peer,sample,idleRttMs){
  if(!this.adaptive||!Number.isFinite(sample)||sample<0||!Number.isFinite(idleRttMs)||idleRttMs<0)return;
  const at=this.now(),old=this.feedback.get(peer),delay=Math.max(0,sample-idleRttMs);
  this.feedback.set(peer,{at,base:idleRttMs,delay:old?old.delay*.8+delay*.2:delay});
  if(at-this.adjustedAt<250)return;
  const active=[...this.feedback.values()].filter(r=>at-r.at<Math.max(1000,r.base*3));
  const worst=Math.max(0,...active.map(r=>r.delay));
  if(worst>40){const next=Math.max(this.floor,Math.floor(this.limit*.75/2048)*2048);if(next<this.limit)this.totals.reduced++;this.limit=next;this.adjustedAt=at;}
  else if(worst<24&&at-this.blockedAt<500){const next=Math.min(this.ceiling,this.limit+2048);if(next>this.limit)this.totals.increased++;this.limit=next;this.adjustedAt=at;this.schedule();}
 }
 hasDebt(peer){return !!this.ledger.get(peer)?.size;}
 busy(peer){return this.jobs.has(peer);}
 canEnqueue(peer,value){return !this.closed&&!this.busy(peer)&&this.ownedJobs.size<10&&ArrayBuffer.isView(value)&&value.byteLength>0&&value.byteLength<=L.raw&&this.retainedBytes+value.byteLength<=this.maxRetained;}
 enqueue(peer,value,{send,started=()=>{},failed=()=>{}}={}){
  if(!this.canEnqueue(peer,value)||typeof send!=='function')return false;
  const job={peer,id:newSnapshotChunkId(),size:value.byteLength,send,started,failed,offset:0,sending:false,begun:false,prepared:null,cancelled:false,preparing:true,completed:false,lastSent:0};
  this.jobs.set(peer,job);this.ownedJobs.add(job);this.retainedBytes+=job.size;this.totals.queued++;this.totals.peakRetainedBytes=Math.max(this.totals.peakRetainedBytes,this.retainedBytes);
  let prepared=this.preparing.get(value);
  if(!prepared){try{prepared=Promise.resolve(this.prepare(value));}catch(error){job.preparing=false;this.fail(job,error);return false;}this.preparing.set(value,prepared);prepared.finally(()=>this.preparing.delete(value)).catch(()=>{});}
  prepared.then(result=>{job.preparing=false;if(this.jobs.get(peer)!==job||this.closed){this.release(job);return;}job.prepared=result;this.schedule();},error=>{job.preparing=false;this.fail(job,error);this.release(job);});
  return true;
 }
 schedule(){if(!this.closed&&!this.scheduled)this.scheduled=setImmediate(()=>{this.scheduled=null;this.pump();});}
 pump(){
  if(this.closed)return;
  const jobs=[...this.jobs.values()];if(!jobs.length)return;
  const peerFlight=peer=>[...(this.ledger.get(peer)?.values()??[])].reduce((n,e)=>n+e.bytes,0);
  const wireSize=n=>n+(n<126?2:4); // unmasked server WS, compression DISABLED for precompressed chunks
  const peerLimit=this.adaptive?Math.min(this.peerLimit,Math.max(4096,Math.ceil(this.limit/Math.min(4,jobs.length)/2048)*2048)):this.peerLimit;
  const nextSize=j=>wireSize(j.prepared?Math.min(L.packet,L.header+j.prepared.payload.length-j.offset):L.packet);
  const ordered=jobs.toSorted((a,b)=>a.lastSent-b.lastSent);
  let sent=false;
  for(const j of ordered){
   if(j.sending||!j.prepared||j.offset>=j.prepared.payload.length)continue;
   const bytes=nextSize(j);
   const entries=this.ledger.get(j.peer),peerBytes=entries?[...entries.values()].reduce((n,e)=>n+e.bytes,0):0;
   // Reserve the oldest eligible peer's next fragment, including compression
   // still in progress. Faster zlib completions must not consume every slot.
   // Locally ACK-blocked peers reserve nothing, so slow peers cannot freeze all.
   if(j.begun&&jobs.some(q=>!q.begun&&!q.cancelled&&peerFlight(q.peer)+nextSize(q)<=peerLimit))continue;
   const first=jobs.filter(q=>!q.cancelled&&!q.sending&&(!q.prepared||q.offset<q.prepared.payload.length)&&peerFlight(q.peer)+nextSize(q)<=this.peerLimit).toSorted((a,b)=>a.lastSent-b.lastSent)[0];
   const reserved=first&&first!==j?nextSize(first):0;
   if(this.flightBytes+bytes+reserved>this.limit||peerBytes+bytes>peerLimit){this.blockedAt=this.now();continue;}
   const packet=snapshotChunkPacket(j.prepared,j.id,j.offset),next=j.offset+packet.length-L.header,key=j.id+':'+next;
   const ledger=entries??new Map();if(!entries)this.ledger.set(j.peer,ledger);
   ledger.set(key,{id:j.id,offset:next,bytes,at:this.now(),retired:false});this.flightBytes+=bytes;
   this.totals.peakFlightBytes=Math.max(this.totals.peakFlightBytes,this.flightBytes);
   j.offset=next;j.sending=true;j.lastSent=++this.serial;sent=true;this.totals.packets++;this.totals.wireBytes+=bytes;
   try{
    // Commit the codec only when its first real transport write is admitted.
    let completed=false;
    const accepted=j.send(packet,error=>{if(completed)return;completed=true;j.sending=false;this.release(j);if(error)this.fail(j,error);else this.schedule();});
    if(accepted===false)throw Error('Bulk transport refused packet');
    if(!j.begun&&!j.cancelled){j.begun=true;j.started();}
   }catch(error){j.sending=false;this.fail(j,error);}
  }
  // Completion callbacks / authenticated receipts schedule the next opportunity.
  // Do not run a timer that manufactures credits while a route is stalled.
  return sent;
 }
 acknowledge(peer,m){
  if(this.closed||m?.type!=='bulk-ack'||typeof m.id!=='string'||!/^[a-f0-9]{32}$/.test(m.id)||!Number.isSafeInteger(m.offset)||m.offset<=0||m.offset>L.compressed){this.totals.ignoredReceipts++;return false;}
  const ledger=this.ledger.get(peer),row=ledger?.get(m.id+':'+m.offset);
  if(!row){this.totals.ignoredReceipts++;return false;}
  for(const [k,e]of ledger){if(e.id!==row.id||e.offset>row.offset)continue;ledger.delete(k);this.flightBytes-=e.bytes;if(e.retired)this.totals.retiredBytes-=e.bytes;}
  if(!ledger.size)this.ledger.delete(peer);this.totals.receipts++;
  const job=this.jobs.get(peer);
  if(job?.id===row.id&&job.prepared&&row.offset===job.prepared.payload.length){this.jobs.delete(peer);job.completed=true;this.release(job);this.totals.completed++;}
  this.schedule();return true;
 }
 cancel(peer){
  this.feedback.delete(peer);
  const j=this.jobs.get(peer);if(j){this.jobs.delete(peer);j.cancelled=true;this.release(j);this.totals.cancelled++;}
  // Cancellation cannot retract bytes already in an external FIFO. Keep debt;
  // late genuine receipts may release it. Only a real transport teardown may
  // abandon that debt; cancellation/resync/timeouts are not network receipts.
  for(const e of this.ledger.get(peer)?.values()??[])if(!e.retired){e.retired=true;this.totals.retiredBytes+=e.bytes;}
 }

 // Call ONLY after invalidating the primary socket epoch. Those packets can no
 // longer finish a usable snapshot on this transport. Account them as abandoned,
 // never as received/completed. This prevents disconnected guests permanently
 // consuming the room window while conservatively restarting at the floor.
 abandon(peer){
  this.cancel(peer);
  const ledger=this.ledger.get(peer);
  if(ledger?.size){
   for(const e of ledger.values()){this.flightBytes-=e.bytes;if(e.retired)this.totals.retiredBytes-=e.bytes;this.totals.abandonedBytes+=e.bytes;this.totals.abandonedChunks++;}
   this.ledger.delete(peer);this.totals.disconnectedPeers++;
   if(this.adaptive){if(this.limit>this.floor)this.totals.reduced++;this.limit=this.floor;this.adjustedAt=this.now();}
  }
  this.schedule();
 }
 release(job){if((job.cancelled||job.completed)&&!job.preparing&&!job.sending&&this.ownedJobs.delete(job)){this.retainedBytes-=job.size;job.prepared=null;}}
 fail(job,error){if(this.jobs.get(job.peer)!==job)return;this.totals.failures++;this.cancel(job.peer);job.failed(error);}
 close(){this.closed=true;clearImmediate(this.scheduled);this.scheduled=null;for(const peer of [...this.jobs.keys()])this.cancel(peer);this.ledger.clear();this.feedback.clear();this.flightBytes=0;this.totals.retiredBytes=0;}
 stats(){return {...this.totals,jobs:this.jobs.size,ownedJobs:this.ownedJobs.size,flightBytes:this.flightBytes,retainedBytes:this.retainedBytes,limit:this.limit,peerLimit:this.peerLimit,ceiling:this.ceiling,adaptive:this.adaptive};}
}
