import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomBytes} from 'node:crypto';
import {deflateRawSync,crc32} from 'node:zlib';
import {SnapshotChunkReceiver,prepareSnapshotChunks,snapshotChunkPacket,SNAPSHOT_CHUNK_LIMITS as L}from '../server/SnapshotChunkCodec.mjs';
import {LanBulkScheduler}from '../server/LanBulkScheduler.mjs';
const id='ab'.repeat(16),wait=()=>new Promise(r=>setImmediate(r));
async function until(fn){for(let i=0;i<4000;i++){if(fn())return;await new Promise(r=>setTimeout(r,1));}throw Error('Chunk test timeout');}
const prepared=(payload)=>({payload,rawBytes:payload.length,checksum:crc32(payload),compressed:false});
const packets=p=>{const a=[];for(let at=0;at<p.payload.length;at+=L.packet-L.header)a.push(snapshotChunkPacket(p,id,at));return a;};
test('compressed and incompressible frames reassemble exact bytes, never partial state',async()=>{
 for(const raw of [Buffer.from('complete-frame:'.repeat(20000)),randomBytes(128000)]){
  const p=await prepareSnapshotChunks(raw),receiver=new SnapshotChunkReceiver(),parts=packets(p);let result;
  for(let i=0;i<parts.length;i++){result=receiver.receive(parts[i]);assert.equal(result.receipt.id,id);assert.equal(result.payload===null,i<parts.length-1);assert.ok(receiver.retainedBytes<=L.compressed);}
  assert.deepEqual(result.payload,raw);assert.equal(receiver.retainedBytes,0);assert.equal(receiver.completed,1);
 }
});
test('truncated, overlapping, duplicate and inconsistent chunks cannot assemble or expand bounds',()=>{
 const p=prepared(randomBytes(12000)),parts=packets(p);
 for(const mutate of [b=>b.subarray(0,39),b=>{b.writeUInt32BE(L.compressed+1,24);return b;},b=>{b.writeUInt32BE(L.raw+1,28);return b;},b=>{b.writeUInt32BE(2,36);return b;},b=>{b.writeUInt32BE(9,20);return b;}])assert.throws(()=>new SnapshotChunkReceiver().receive(mutate(Buffer.from(parts[0]))));
 const r=new SnapshotChunkReceiver();r.receive(parts[0]);assert.throws(()=>r.receive(parts[0]));assert.throws(()=>r.receive(parts[2]));
 const bad=Buffer.from(parts[1]);bad.writeUInt32BE(1,32);assert.throws(()=>r.receive(bad));r.receive(parts[1]);
});
test('bounded inflate rejects length lies and checksum corruption before full-state delivery',()=>{
 const raw=Buffer.alloc(200000,7),p={payload:deflateRawSync(raw),compressed:true,rawBytes:1,checksum:crc32(raw)};
 assert.throws(()=>new SnapshotChunkReceiver().receive(snapshotChunkPacket(p,id,0)));
 p.rawBytes=raw.length;p.checksum^=1;assert.throws(()=>new SnapshotChunkReceiver().receive(snapshotChunkPacket(p,id,0)));
});
test('new token replaces a cancelled partial frame without accepting old tail; reset releases allocation',()=>{
 const p=prepared(randomBytes(10000)),r=new SnapshotChunkReceiver();r.receive(snapshotChunkPacket(p,id,0));r.receive(snapshotChunkPacket(p,'cd'.repeat(16),0));
 assert.equal(r.abandoned,1);assert.throws(()=>r.receive(snapshotChunkPacket(p,id,L.packet-L.header)));r.reset();assert.equal(r.retainedBytes,0);
});
test('one room shared ACK window bounds all peers, not one window per peer or local socket drain',async t=>{
 const s=new LanBulkScheduler(),sent=[],peers=Array.from({length:4},()=>({}));t.after(()=>s.close());
 for(const peer of peers)assert.ok(s.enqueue(peer,randomBytes(50000),{send(b,done){sent.push({peer,b});done();return true;}}));
 await until(()=>s.flightBytes===s.limit);const count=sent.length;
 for(let i=0;i<20;i++){s.pump();await wait();}assert.equal(sent.length,count);assert.equal(s.flightBytes,8192);
 assert.equal(new Set(sent.map(x=>x.peer)).size,4,'all four peers receive a turn before repeated admission');
 const a=sent[0],r=new SnapshotChunkReceiver(),m=r.receive(a.b).receipt;
 assert.equal(s.acknowledge(peers.find(p=>p!==a.peer),m),false);assert.equal(s.acknowledge(a.peer,{...m,offset:m.offset+1}),false);assert.equal(s.flightBytes,8192);
 assert.ok(s.acknowledge(a.peer,m));assert.equal(s.acknowledge(a.peer,m),false);await until(()=>sent.length>count);assert.ok(s.flightBytes<=s.limit);
});
test('cumulative exact chunk receipt releases prior same-token bytes, but never another frame or peer',async t=>{
 const s=new LanBulkScheduler({maxPeerFlightBytes:8192}),peer={},sent=[];t.after(()=>s.close());s.enqueue(peer,randomBytes(16000),{send(b,done){sent.push(b);done();}});
 await until(()=>sent.length===4);const r=new SnapshotChunkReceiver();let receipt;for(const b of sent)receipt=r.receive(b).receipt;
 assert.ok(s.acknowledge(peer,receipt));assert.equal(s.flightBytes,0);assert.equal(s.acknowledge(peer,receipt),false);
});
test('cancelled in-flight bytes stay debt; old real receipt cannot complete or credit a replacement frame',async t=>{
 const s=new LanBulkScheduler(),peer={},sent=[];t.after(()=>s.close());const send=(b,done)=>{sent.push(b);done();};
 s.enqueue(peer,randomBytes(10000),{send});await until(()=>sent.length===2);const receipt=new SnapshotChunkReceiver().receive(sent[0]).receipt;
 s.cancel(peer);assert.equal(s.retainedBytes,0);assert.equal(s.flightBytes,4096);assert.equal(s.stats().retiredBytes,4096);
 assert.ok(s.enqueue(peer,randomBytes(9000),{send}));assert.ok(s.acknowledge(peer,receipt));assert.ok(s.busy(peer));assert.equal(s.stats().completed,0);assert.equal(s.stats().retiredBytes,2048);
});
test('compression pending/cancel/close, admission refusal and retained room cap stay bounded',async t=>{
 let resolve;const s=new LanBulkScheduler({prepare:()=>new Promise(r=>{resolve=r;}),maxRetainedBytes:12000});t.after(()=>s.close());const p={},data=randomBytes(8000);let started=0;
 assert.ok(s.enqueue(p,data,{send(){assert.fail('cancelled');},started(){started++;}}));assert.equal(s.enqueue(p,data,{send(){}}),false);assert.equal(s.enqueue({},data,{send(){}}),false);
 s.cancel(p);resolve(prepared(data));await wait();assert.equal(started,0);assert.equal(s.flightBytes,0);assert.equal(s.retainedBytes,0);
 const q=new LanBulkScheduler();t.after(()=>q.close());let failure=0;q.enqueue({},data,{send(){return false;},started(){assert.fail('refused');},failed(){failure++;}});await until(()=>failure===1);assert.equal(q.stats().jobs,0);assert.ok(q.stats().retiredBytes>0);
 s.close();assert.equal(s.enqueue(p,data,{send(){}}),false);
});
test('complete chunk ACK is not renderer consumption and shared compression remains read-only',async t=>{
 let calls=0;const s=new LanBulkScheduler({prepare:async bytes=>{calls++;return prepareSnapshotChunks(bytes);}});t.after(()=>s.close());const raw=Buffer.from('render state '.repeat(10000)),peers=[{},{}],receivers=peers.map(()=>new SnapshotChunkReceiver());let deliveries=0,starts=0;
 peers.forEach((peer,i)=>s.enqueue(peer,raw,{started(){starts++;},send(b,done){setImmediate(()=>{const r=receivers[i].receive(b);s.acknowledge(peer,r.receipt);if(r.payload){assert.deepEqual(r.payload,raw);deliveries++;}done();});return true;}}));
 await until(()=>deliveries===2);assert.equal(starts,2);assert.equal(calls,1);assert.equal(s.flightBytes,0);assert.equal(s.retainedBytes,0);assert.equal(s.stats().completed,2);
});

test('critical feedback grows only on demand, uses per-route idle RTT and never invents byte receipts',async t=>{
 let now=0;const s=new LanBulkScheduler({adaptive:true,maxFlightBytes:65536,initialFlightBytes:16384,maxPeerFlightBytes:16384,now:()=>now}),fast={},slow={};t.after(()=>s.close());
 for(now=0;now<5000;now+=250)s.observeCritical(fast,20,20);assert.equal(s.limit,16384,'application limited');
 for(now=5000;now<18000;now+=250){s.blockedAt=now;s.observeCritical(fast,20,20);s.observeCritical(slow,1500,1500);assert.ok(s.limit<=65536);}
 assert.equal(s.limit,65536);assert.ok(s.enqueue(fast,randomBytes(80000),{send(_b,done){done();}}));await until(()=>s.flightBytes>0);const debt=s.flightBytes;
 for(now=18000;now<30000;now+=250)s.observeCritical(fast,200,20);
 assert.equal(s.limit,8192);assert.equal(s.flightBytes,debt,'shrinking is not a transport receipt');
 const before=s.stats();for(const value of [NaN,Infinity,-1])s.observeCritical(fast,value,20);assert.deepEqual(s.stats(),before);
 s.cancel(fast);assert.equal(s.feedback.has(fast),false);assert.equal(s.flightBytes,debt);
});
test('rapid cancellation retains compression ownership until the actual promises settle',async t=>{
 const pending=[];const s=new LanBulkScheduler({maxRetainedBytes:12000,prepare:raw=>new Promise(resolve=>pending.push(()=>resolve(prepared(raw))))});t.after(()=>s.close());
 for(let i=0;i<3;i++){const peer={};assert.ok(s.enqueue(peer,randomBytes(4000),{send(){assert.fail('cancelled compression sent');}}));s.cancel(peer);}
 assert.equal(s.stats().ownedJobs,3);assert.equal(s.retainedBytes,12000);assert.equal(s.enqueue({},randomBytes(4000),{send(){}}),false);
 s.close();assert.equal(s.retainedBytes,12000,'close cannot release live zlib inputs');
 pending.forEach(resolve=>resolve());await until(()=>s.retainedBytes===0);assert.equal(s.stats().ownedJobs,0);
});
test('transport teardown retains a live send buffer until callback and does not count it as received',async t=>{
 const s=new LanBulkScheduler({prepare:async raw=>prepared(raw)});t.after(()=>s.close());const peer={},sent=[];let callback;
 s.enqueue(peer,randomBytes(9000),{send(b,done){sent.push(b);callback=done;return true;}});await until(()=>sent.length===1);
 const receipt=new SnapshotChunkReceiver().receive(sent[0]).receipt;s.abandon(peer);
 assert.equal(s.flightBytes,0);assert.equal(s.retainedBytes,9000);assert.equal(s.stats().ownedJobs,1);assert.equal(s.stats().abandonedBytes,2048);
 assert.equal(s.stats().receipts,0);assert.equal(s.stats().completed,0);assert.equal(s.acknowledge(peer,receipt),false);
 callback();await until(()=>s.retainedBytes===0);assert.equal(s.stats().jobs,0);
});
test('repeated closed transports cannot strand room bytes; cancellation on a live route still cannot forgive them',async t=>{
 const s=new LanBulkScheduler({adaptive:true,maxFlightBytes:65536,initialFlightBytes:16384,maxPeerFlightBytes:16384,prepare:async raw=>prepared(raw)});t.after(()=>s.close());let receipts=0;
 for(let i=0;i<12;i++){
  const peer={};s.enqueue(peer,randomBytes(20000),{send(_b,done){done();}});await until(()=>s.flightBytes>0);s.cancel(peer);
  const debt=s.flightBytes;assert.ok(debt>0);assert.ok(s.hasDebt(peer));s.abandon(peer);
  assert.equal(s.flightBytes,0);assert.equal(s.stats().retiredBytes,0);assert.equal(s.hasDebt(peer),false);assert.equal(s.limit,8192);receipts+=debt;
 }
 assert.equal(s.stats().abandonedBytes,receipts);assert.equal(s.stats().receipts,0);assert.equal(s.stats().completed,0);assert.equal(s.stats().ownedJobs,0);
 const peer={},r=new SnapshotChunkReceiver();let delivered=false;
 s.enqueue(peer,randomBytes(16000),{send(b,done){setImmediate(()=>{const x=r.receive(b);s.acknowledge(peer,x.receipt);delivered=!!x.payload;done();});}});
 await until(()=>delivered);assert.equal(s.flightBytes,0);assert.equal(s.stats().completed,1);
});
