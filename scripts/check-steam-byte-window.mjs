import assert from 'node:assert/strict';import {test} from 'node:test';
import {SnapshotByteWindow,INITIAL_BINARY_SNAPSHOT_BYTES as INITIAL,MAX_BINARY_SNAPSHOT_BYTES as MAX} from '../server/steam/snapshot-byte-window.mjs';
import {SnapshotHostBudget} from '../server/steam/snapshot-host-budget.mjs';
import {SteamConsumptionWindow} from '../server/steam/state-consumption.mjs';
test('byte window requires both blocked demand and measured successful ACKs, not wall time/queries',()=>{
 const w=new SnapshotByteWindow();for(let now=0;now<10000;now+=20)w.acknowledge(80,80,now,60000,20000);assert.equal(w.limit,INITIAL);
 for(let now=0;now<10000;now+=20)w.blocked(now);assert.equal(w.limit,INITIAL);
 const active=new SnapshotByteWindow();for(let now=0;now<30000;now+=20){active.blocked(now);active.acknowledge(90,80,now,active.limit,24000);}
 assert.ok(active.limit>INITIAL);assert.ok(active.limit<=MAX);assert.ok(active.samples.length<=256);
});
test('one measured round grants at most 16KiB; no growth on oversized frames or implausible samples',()=>{
 const w=new SnapshotByteWindow();w.blocked(0);w.acknowledge(80,80,0,60000,20000);w.blocked(99);w.acknowledge(80,80,99,60000,20000);assert.equal(w.limit,INITIAL);
 w.acknowledge(80,80,100,60000,20000);assert.equal(w.limit,INITIAL+16384);
 const before=JSON.stringify(w);for(const args of [[0,80,200,60000,20000],[80,90,200,60000,20000],[Infinity,80,200,60000,20000],[80,80,NaN,60000,20000],[80,80,200,1000,20000],[80,80,200,100000,80000],[80,80,200,60000,-1]])w.acknowledge(...args);
 assert.equal(JSON.stringify(w),before);
});
test('persistent queue inflation shrinks credit even when producer keeps demanding more',()=>{
 const w=new SnapshotByteWindow();for(let now=0;now<2000;now+=20){w.blocked(now);w.acknowledge(80,80,now,w.limit,20000);}assert.equal(w.limit,MAX);
 for(let now=2000;now<7000;now+=20){w.blocked(now);w.acknowledge(500,80,now,w.limit,10000);}assert.equal(w.limit,INITIAL);
 assert.ok(w.samples.length<=256);
});
test('clock reversal clears sampling and blocked intent instead of expanding credit',()=>{
 const w=new SnapshotByteWindow();w.blocked(1000);w.acknowledge(80,80,1000,60000,20000);w.acknowledge(80,80,500,60000,20000);assert.equal(w.roundAt,null);assert.equal(w.blockedAt,-Infinity);assert.deepEqual(w.samples,[]);assert.equal(w.limit,INITIAL);
});
test('one negotiated binary peer uses its bounded controller; adding a peer restores aggregate budget',()=>{
 const a={readyState:1,inflight:new Map(),inflightBytes:0,snapshotWindow:{limit:12,baseRtt:80},binarySnapshots:true,snapshotByteLimit:128*1024};
 const b={...a,inflight:new Map(),binarySnapshots:false,snapshotByteLimit:INITIAL};let all=[a];const budget=new SnapshotHostBudget(()=>all);
 assert.equal(budget.allows(a,24000,0),true);assert.equal(budget.limitBytes,a.snapshotByteLimit);a.inflightBytes=100000;
 assert.equal(budget.allows(a,24000,1),true);assert.equal(budget.allows(a,40000,1),false);
 all=[a,b];budget.prune(2);assert.ok(budget.limitBytes<=2*INITIAL);a.snapshotByteLimit=MAX;budget.prune(3);assert.ok(budget.limitBytes<=2*INITIAL);
 budget.samples=[50000];budget.roundAt=1;budget.blockedAt=1;
 all=[a];budget.prune(3.5);assert.deepEqual(budget.samples,[]);assert.equal(budget.roundAt,null);assert.equal(budget.blockedAt,-Infinity);assert.equal(budget.diagnostics(3.5).estimatedQueueBytes,null);
 all=[b];budget.prune(4);assert.equal(budget.limitBytes,INITIAL);assert.equal(budget.diagnostics(4).estimatedQueueBytes,null);
 all=[a];a.inflightBytes=0;a.snapshotByteLimit=INITIAL;budget.prune(5);assert.equal(budget.limitBytes,INITIAL);
});
test('shrinking byte credit never forgives unconsumed frames or bypasses raw renderer budget',()=>{
 const c=new SteamConsumptionWindow({maxFrames:32,maxBytes:MAX,maxRawBytes:2000000});c.track(1,60000,1000000);c.track(2,60000,1000000);c.maxBytes=INITIAL;
 assert.equal(c.writable(32),false);assert.equal(c.allows(100,100,32),false);assert.equal(c.acknowledge(999),false);assert.equal(c.bytes,120000);
 assert.equal(c.acknowledge(1),true);assert.equal(c.allows(5000,1000000,32),true);assert.equal(c.allows(5000,1000001,32),false);
});
