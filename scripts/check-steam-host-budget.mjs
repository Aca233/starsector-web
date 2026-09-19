import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SnapshotHostBudget, INITIAL_HOST_SNAPSHOT_BYTES as BYTES } from '../server/steam/snapshot-host-budget.mjs';
const peer=()=>({readyState:1,inflight:new Map(),inflightBytes:0,snapshotWindow:{limit:32,baseRtt:300}});
const track=(p,bytes,id=1)=>{p.inflight.set(id,{});p.inflightBytes+=bytes;};
test('shared budget counts aggregate bytes; oversized frame only when entire host pipeline is empty',()=>{
 const a=peer(),b=peer(),all=[a,b],budget=new SnapshotHostBudget(()=>all);
 assert.equal(budget.allows(a,50000,0),true);track(a,50000);
 assert.equal(budget.allows(b,20000,0),false);assert.equal(budget.allows(a,1000,0),false,'later small state cannot overtake waiting full');
 a.inflight.clear();a.inflightBytes=0;
 assert.equal(budget.allows(b,100000,8),true);track(b,100000);
 assert.equal(budget.allows(a,100,8),false);assert.equal(budget.totalBytes(),100000);
});
test('FIFO intents refresh without changing order; no payload retention, no active-peer starvation',()=>{
 const all=Array.from({length:9},peer),budget=new SnapshotHostBudget(()=>all);track(all[0],50000);
 for(const p of all)assert.equal(budget.allows(p,40000,0),false);
 for(let i=0;i<9;i++){
  for(const p of all){p.inflightBytes=0;p.inflight.clear();}
  for(let j=0;j<9;j++){const granted=budget.allows(all[j],40000,i*16+1);assert.equal(granted,i===j);if(granted)track(all[j],40000);}
 }
 assert.ok(budget.waiting.size<=9);
 for(const [p,request] of budget.waiting){assert.ok(all.includes(p));assert.equal(typeof request.at,'number');assert.equal(typeof request.bytes,'number');assert.deepEqual(Object.keys(request),['at','bytes']);}
});
test('hidden/idle, locally blocked and closed waiters relinquish reservations',()=>{
 const a=peer(),b=peer(),budget=new SnapshotHostBudget(()=>[a,b]);track(a,BYTES);
 assert.equal(budget.allows(b,30000,0),false);a.inflight.clear();a.inflightBytes=0;
 assert.equal(budget.allows(a,40000,100),false);assert.equal(budget.allows(a,100,251),true,'stale hidden-peer intent expires');
 track(a,BYTES);budget.allows(b,30000,260);a.inflight.clear();a.inflightBytes=0;
 b.readyState=3;assert.equal(budget.allows(a,100,261),true);
 b.readyState=1;track(a,BYTES);budget.allows(b,30000,270);a.inflight.clear();a.inflightBytes=0;track(b,100);b.snapshotWindow.limit=1;
 assert.equal(budget.allows(a,100,271),true,'per-peer count blocked waiter is not a global barrier');
 budget.remove(a);budget.remove(b);assert.equal(budget.waiting.size,0);
});
test('host credit grows only on demand, within aggregate caps, then shrinks on queue feedback',()=>{
 const all=[peer(),peer(),peer()],budget=new SnapshotHostBudget(()=>all);
 for(let now=0;now<10000;now+=100)budget.acknowledge(300,300,now,BYTES);
 assert.equal(budget.limitBytes,BYTES,'application-limited traffic cannot grow');
 track(all[0],BYTES*3);
 for(let now=10000;now<20000;now+=100){budget.allows(all[1],1000,now);budget.acknowledge(300,300,now,budget.limitBytes);assert.ok(budget.limitBytes<=BYTES*3);assert.ok(budget.samples.length<=256);}
 assert.ok(budget.limitBytes>BYTES);
 for(let now=20000;now<30000;now+=100)budget.acknowledge(1200,300,now,budget.limitBytes);
 assert.equal(budget.limitBytes,BYTES);
 all[1].readyState=all[2].readyState=3;budget.limitBytes=BYTES*3;budget.diagnostics(30001);assert.equal(budget.limitBytes,BYTES);
 budget.clear();assert.equal(budget.waiting.size,0);assert.equal(budget.samples.length,0);assert.equal(budget.roundAt,null);
});
test('invalid ACK samples do not change host accounting or feedback',()=>{
 const p=peer(),budget=new SnapshotHostBudget(()=>[p]);
 for(const value of [NaN,Infinity,0,-1]){budget.acknowledge(value,300,1000,10000);budget.acknowledge(300,value,1000,10000);}
 assert.equal(budget.samples.length,0);assert.equal(budget.limitBytes,BYTES);assert.equal(budget.totalBytes(),0);
});

test('surplus credit bypasses an older waiter without spending its reserved frame bytes',()=>{
 const a=peer(),b=peer(),budget=new SnapshotHostBudget(()=>[a,b]);track(a,50000);
 assert.equal(budget.allows(b,20000,0),false);
 a.inflight.clear();a.inflightBytes=10000;
 assert.equal(budget.allows(a,10000,8),true,'do not waste a whole broadcast when both fit');
 track(a,10000);
 assert.equal(budget.allows(a,30000,8),false,'cannot spend the oldest waiter reservation');
 assert.equal(budget.allows(b,20000,8),true);
});
