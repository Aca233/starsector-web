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

// Input/display timing is intentionally distinct from hardware input-to-photon.
const {summarizePresentationPhase}=await import('./lib/lan-presentation-latency.mjs');
const timing=(overrides={})=>({start:0,end:100,edges:[{at:10,keys:1},{at:60,keys:2}],frames:[
 {at:15,keys:1,active:true,predicted:false,predictionReason:'collision',acknowledged:0,tick:1,ships:22},
 {at:55,keys:1,active:true,predicted:true,acknowledged:3,tick:3,ships:22},
 {at:75,keys:2,active:true,predicted:true,acknowledged:4,tick:4,ships:22}],
 inputTrace:{sent:[{at:12,seq:1,keys:1},{at:62,seq:4,keys:2}],acks:[{at:58,ack:3},{at:78,ack:4}]},...overrides});
test('phase crossing response retained; cumulative ACK is separate from exact input application',()=>{
 const p=summarizePresentationPhase(timing(),'normal',0,50),e=p.edges[0];
 assert.equal(e.sentSeq,1);assert.equal(e.sendLatency,2);assert.equal(e.controlLatency,5);assert.equal(e.latency,45);
 assert.equal(e.mainAckLatency,48);assert.equal(e.drawAckLatency,45);assert.equal(p.frames,1);
});
test('missing sends, ACKs and prediction remain null, never fabricated zero latency',()=>{
 const p=summarizePresentationPhase(timing({frames:timing().frames.slice(0,1),inputTrace:{sent:[],acks:[]}}),'all',0,100);
 assert.equal(p.missing,2);assert.equal(p.missingSent,2);assert.equal(p.missingDrawAck,2);
 assert.equal(p.eventToPredictedSubmitMs.p95,null);assert.equal(p.eventToSendMs.p95,null);
 assert.deepEqual(p.edges[0].skipReasons,['collision']);assert.equal(p.edges[1].controlLatency,null);
});
test('old ACK, inactive frames and frames after the next edge cannot forge response',()=>{
 const data=timing();data.frames[0].active=false;data.frames[1].at=65;data.inputTrace.acks=[{at:11,ack:100}];
 const p=summarizePresentationPhase(data,'all',0,100);
 assert.equal(p.edges[0].controlLatency,null);assert.equal(p.edges[0].latency,null);assert.equal(p.edges[0].mainAckLatency,null);
 // ACK coverage may arrive after a newer edge. That is allowed and labeled.
 assert.equal(p.edges[0].drawAckLatency,55);
});
test('phase windows are half-open and trace ends are censored',()=>{
 const data=timing();data.edges[1].at=50;data.frames[2].at=100;data.inputTrace.acks[1].at=100;
 const p=summarizePresentationPhase(data,'busy',50,100);
 assert.equal(p.edges.length,1);assert.equal(p.edges[0].controlLatency,null);assert.equal(p.missingMainAck,1);assert.equal(p.missingDrawAck,1);
});

test('display clock age excludes missing, future and invalid pose clocks',()=>{
 const data=timing({end:2000});data.frames=data.frames.map((f,i)=>({...f,at:f.at+1000,poseAt:i===0?f.at+930:i===1?f.at+996:undefined}));
 assert.deepEqual(summarizePresentationPhase(data,'all',0,2000).poseClockAgeMs,{count:2,p50:4,p95:4,p99:4,max:70});
 for(const poseAt of [undefined,null,NaN,Infinity,-1,1000000]){
  const frames=data.frames.map(f=>({...f,poseAt}));const result=summarizePresentationPhase({...data,frames},'all',0,2000);
  assert.equal(result.poseClockAgeMs.count,0);assert.equal(result.poseClockAgeMs.p95,null);
 }
});
