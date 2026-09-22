// Deliberately LARGE complete worlds, not the legacy ~1.3KiB marker benchmark.
// This is deterministic transport load, not execution of the game's simulation.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {simulateSocketLink} from './steam-sockets-link-model.mjs';
function frame(seq){
 let seed=seq+300;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 return {ships:Array.from({length:22},(_,id)=>({id,health:10000-seq,armor:Array.from({length:160},()=>[random(),random(),random(),random()])})),match:{name:'large complete world'}};
}
test('five-player multi-fragment worlds make fair bounded progress instead of all expiring in parallel',()=>{
 const r=simulateSocketLink({guests:4,durationMs:14000,rttMs:60,upBytesPerSecond:500000,observedAckFloor:true,compensateAckDelay:true,frameFactory:frame,trace:true});
 console.log(JSON.stringify({scope:r.scope,peers:r.peers,peak:r.peakExternalHostBytes}));
 assert.deepEqual(r.closed,[]);assert.equal(r.finalWireBytes,0);assert.equal(r.finalNativePending,0);
 assert.ok(r.timeline.some(t=>t.peers.some(p=>p.job?.count>=5)),'fixture must actually require large fragmented worlds');
 for(const p of r.peers){
  assert.equal(p.decodeFailures,0);assert.ok(p.frames>=10);assert.ok(p.steadyHz>=1);
  assert.ok(p.ageP95<600);assert.ok(p.observedAgeP95<1500);assert.ok(p.lastStateAt>12500);
  for(const w of p.windows.filter(w=>w.end>=10000))assert.ok(w.maxGap<2000,'healthy pongs cannot hide a frozen world');
 }
 assert.ok(Math.max(...r.peers.map(p=>p.frames))-Math.min(...r.peers.map(p=>p.frames))<=3,'FIFO whole-frame admission must avoid starvation');
});

