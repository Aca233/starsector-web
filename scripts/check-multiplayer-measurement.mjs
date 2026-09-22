import assert from 'node:assert/strict';
import {test} from 'node:test';
import {measuredSamples,summarizeStall,recordedStall} from './lib/multiplayer-measurement.mjs';
test('HUD statistics exclude warmup, inspection and stall after the end cutoff',()=>{
 const rows=[99,100,150,200,201,1000].map(wallTimeMs=>({event:'sample',wallTimeMs}));
 rows.push({event:'ended',wallTimeMs:150},{event:'sample',wallTimeMs:NaN});
 assert.deepEqual(measuredSamples(rows,100,200).map(r=>r.wallTimeMs),[100,150,200]);
 assert.throws(()=>measuredSamples(rows,200,100));
});
const block={startedAt:1000,finishedAt:1800},middle={at:1200,seq:5},late={at:1650,seq:11};
test('actual start aligned block and receive-time ACK advancement are valid',()=>{
 const s=summarizeStall(block,middle,late,[{wallTimeMs:995,ack:3},{wallTimeMs:1500,ack:7}]);
 assert.equal(s.validWindow,true);assert.equal(s.validAckProgress,true);assert.equal(s.publicationsDuringMiddle450ms,6);assert.equal(s.guestAckObservedAt,1500);
});
test('late evaluation cannot manufacture in-window ACK progress',()=>{
 const s=summarizeStall(block,middle,late,[{wallTimeMs:995,ack:3},{wallTimeMs:1801,ack:7}]);
 assert.equal(s.guestAckDuring,null);assert.equal(s.validAckProgress,false);
});
test('queued host evaluation and late Node timers invalidate the sample window',()=>{
 for(const b of [{startedAt:1400,finishedAt:2200},{startedAt:800,finishedAt:1600}])assert.equal(summarizeStall(b,middle,late,[]).validWindow,false);
});
test('missing/malformed/unchanged ACKs never count as progress',()=>{
 for(const ack of [3,2,NaN,Infinity,-1,3.5,undefined])assert.equal(summarizeStall(block,middle,late,[{wallTimeMs:990,ack:3},{wallTimeMs:1500,ack}]).validAckProgress,false);
 assert.equal(summarizeStall(block,middle,late,[{wallTimeMs:1500,ack:7}]).validAckProgress,false);
});

test('recorded relay trace uses the actual block even if Playwright returns seconds later',()=>{
 const s=recordedStall(block,[{at:900,seq:0,boundary:true},{at:1250,seq:3},{at:1500,seq:6},{at:2500,seq:20}], [{wallTimeMs:999,ack:2},{wallTimeMs:1500,ack:4}], {startedAt:900,finishedAt:3000});
 assert.equal(s.validWindow,true);assert.equal(s.validAckProgress,true);assert.equal(s.publicationsDuringMiddle450ms,2);assert.equal(s.middle.at,1200);assert.equal(s.late.at,1650);
});
test('trace that misses the actual block cannot pass even if later publications advance',()=>{
 const s=recordedStall(block,[{at:2000,seq:20}],[],{startedAt:1801,finishedAt:3000});assert.equal(s.validWindow,false);assert.equal(s.publicationsDuringMiddle450ms,0);
});
