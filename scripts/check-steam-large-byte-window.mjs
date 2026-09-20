import assert from 'node:assert/strict';import {test} from 'node:test';
import {bundleGateway,simulateSharedLink} from './steam-shared-link-model.mjs';
import {MAX_BINARY_SNAPSHOT_BYTES} from '../server/steam/snapshot-byte-window.mjs';
const bundle=await bundleGateway();
const frameFactory=seq=>({values:Array.from({length:2200},(_,i)=>Math.sin(seq*.07+i*.137)*10000+Math.cos(seq*.023-i*.29))});
for(const [name,changes] of [['healthy',{}],['collapse',{changeAtMs:12000,afterBytesPerSecond:32000}],['collapse-stall',{changeAtMs:12000,afterBytesPerSecond:64000,stallAtMs:20000,stallMs:3000}]])test('large binary states: '+name+' preserves ACK ownership and original eight-second protection',()=>{
 const r=simulateSharedLink(bundle,{guests:1,durationMs:40000,rttMs:80,upBytesPerSecond:4000000,frameFactory,...changes});
 assert.deepEqual(r.closes,[]);assert.equal(r.budgetViolations,0);const p=r.peers[0];assert.equal(p.decodeFailures,0);assert.ok(p.peakBytes<=MAX_BINARY_SNAPSHOT_BYTES);assert.ok(p.lastStateAt>36000);assert.ok(p.maxPongAge<8000);
 if(name==='healthy'){assert.ok(p.steadyHz>=59);assert.ok(p.steadyAgeP95<100);assert.ok(p.peakBytes>65536,'exercises a genuinely byte-limited 64KiB pipeline, not tiny states');}
 else {assert.ok(p.steadyHz>=1);assert.ok(p.steadyAgeP95<1600);assert.equal(p.transport.byteLimit,65536,'congested path returns to original floor');}
 console.log(JSON.stringify({scope:'Large synthetic exact binary states, virtual FIFO; not native Steam/game FPS',name,hz:p.steadyHz,ageP95:p.steadyAgeP95,maxPongAge:p.maxPongAge,peakBytes:p.peakBytes}));
});
