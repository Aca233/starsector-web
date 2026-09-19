import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bundleGateway, simulateSharedLink } from './steam-shared-link-model.mjs';
const bundle=await bundleGateway();
function checked(config) {
 const result=simulateSharedLink(bundle,config);
 assert.deepEqual(result.closes,[],'shared load must not trip retryable disconnects');
 assert.equal(result.budgetViolations,0,'a send cannot exceed shared ACK byte credit');
 assert.ok(!result.logs.some(log=>log.event==='invalid-packet'));
 for(const peer of result.peers){assert.equal(peer.decodeFailures,0);assert.ok(peer.steadyHz>0,'every guest keeps receiving fresh states');assert.ok(peer.lastStateAt>config.durationMs-4000);assert.ok(peer.peakBytes<=65536);assert.ok(peer.peakFrames<=32);}
 assert.ok(result.sharedBudget.waitingPeers<=config.guests);
 console.log(JSON.stringify({scope:'synthetic states/inputs over virtual shared FIFO uplink; not actual game FPS or Valve routing',config,peakHostQueueBytes:result.peakHostQueueBytes,peers:result.peers.map(p=>({hz:p.steadyHz,ageP95:p.steadyAgeP95,maxPongAge:p.maxPongAge}))}));
 return result;
}
test('3 guests retain 60Hz synthetic delivery on a healthy 8Mbps shared host uplink',()=>{
 const r=checked({guests:3,upBytesPerSecond:1000000,durationMs:40000});
 for(const p of r.peers){assert.ok(p.steadyHz>=59);assert.ok(p.steadyAgeP95<200);}
});
test('9 guests survive 8Mbps to 256Kbps collapse without extending the 8s timeout',()=>{
 const r=checked({guests:9,upBytesPerSecond:1000000,afterBytesPerSecond:32000,changeAtMs:12000,durationMs:50000});
 assert.ok(r.peakHostQueueBytes<270000);
 for(const p of r.peers){assert.ok(p.steadyAgeP95<3000);assert.ok(p.maxPongAge<8000);}
});
test('low bandwidth from startup remains fair across all 9 guests',()=>{
 const r=checked({guests:9,upBytesPerSecond:64000,durationMs:50000});
 assert.ok(r.peakHostQueueBytes<100000);
 for(const p of r.peers){assert.ok(p.steadyHz>=2);assert.ok(p.steadyAgeP95<1600);assert.ok(p.maxPongAge<3000);}
});
test('120s virtual soak, bandwidth collapse and 3s reliable stall recover without learning multi-second queues',()=>{
 const r=checked({guests:3,upBytesPerSecond:1000000,afterBytesPerSecond:64000,changeAtMs:12000,stallAtMs:25000,stallMs:3000,durationMs:120000});
 for(const p of r.peers){assert.ok(p.steadyHz>6);assert.ok(p.steadyAgeP95<1100);}
});
test('one 1500ms guest does not throttle the 80ms and 300ms paths',()=>{
 const r=checked({guests:3,upBytesPerSecond:1000000,guestRtts:[80,300,1500],durationMs:50000});
 assert.ok(r.peers[0].steadyHz>=59);assert.ok(r.peers[1].steadyHz>=59);assert.ok(r.peers[2].steadyHz>=15);
 assert.ok(r.peers[0].steadyAgeP95<80);assert.ok(r.peers[1].steadyAgeP95<200);assert.ok(r.peers[2].steadyAgeP95<900);
});

test('9 healthy guests use surplus reserved credit instead of being limited to half rate',()=>{
 const r=checked({guests:9,upBytesPerSecond:1000000,durationMs:50000});
 for(const p of r.peers){assert.ok(p.steadyHz>=40);assert.ok(p.steadyAgeP95<250);}
 assert.ok(r.peers.reduce((sum,p)=>sum+p.steadyHz,0)>420);
});
