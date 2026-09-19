import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { simulateSocketLink } from './steam-sockets-link-model.mjs';
function checked(name,config){
 const r=simulateSocketLink(config);fs.writeFileSync(`artifacts/steam-sockets-link-${name}.json`,JSON.stringify(r,null,2)+'\n');
 console.log(JSON.stringify({scenario:name,closed:r.closed,peakExternalHostBytes:r.peakExternalHostBytes,peakSdkPending:r.maxNativePending,flight:r.hostFlight,peers:r.peers}));
 assert.deepEqual(r.closed,[],'neither heartbeat nor reliable delivery can extend the original 8s protection');
 assert.equal(r.finalWireBytes,0);assert.equal(r.finalNativePending,0);
 for(const p of r.peers){assert.equal(p.decodeFailures,0);assert.ok(p.steadyHz>0,'every peer receives recent states');assert.ok(p.lastStateAt>config.durationMs-4000,'no frozen guest hidden by healthy control heartbeats');}
 return r;
}
test('sockets: 3 guests preserve healthy 8Mbps synthetic delivery and exact full-state contract',()=>{
 const r=checked('healthy-three',{guests:3,durationMs:30000});for(const p of r.peers){assert.ok(p.steadyHz>=59);assert.ok(p.ageP95<200);}
});
test('sockets: 9 guests survive shared external FIFO 8Mbps -> 256Kbps collapse with fresh states',()=>{
 const r=checked('collapse-nine',{guests:9,durationMs:50000,changeAtMs:12000,afterBytesPerSecond:32000});
 assert.ok(r.peakExternalHostBytes<270000);for(const p of r.peers){assert.ok(p.ageP95<3000);assert.ok(p.maxPongAge<8000);}
});
test('sockets: low bandwidth from startup stays fair across 9 guests',()=>{
 const r=checked('low-start-nine',{guests:9,durationMs:50000,upBytesPerSecond:64000});for(const p of r.peers){assert.ok(p.steadyHz>=2);assert.ok(p.ageP95<1600);}
});
test('sockets: mixed 80/300/1500ms RTT does not make the slow peer consume everyone else\'s credit',()=>{
 const r=checked('mixed-rtt',{guests:3,durationMs:40000,guestRtts:[80,300,1500]});
 assert.ok(r.peers[0].steadyHz>=59);assert.ok(r.peers[1].steadyHz>=59);assert.ok(r.peers[2].steadyHz>=15);
 assert.ok(r.peers[0].ageP95<100);assert.ok(r.peers[1].ageP95<200);assert.ok(r.peers[2].ageP95<1000);
});
test('sockets: reliable retransmission and lossy/reordered state keep delivering without leaked credit',()=>{
 const r=checked('loss-reorder',{guests:3,durationMs:60000,lossEvery:41,reorderEvery:29});assert.ok(r.losses>0);assert.ok(r.retransmits>0);assert.ok(r.hostFlight.lostPackets>0);
 for(const p of r.peers)assert.ok(p.ageP95<1500);
});
test('sockets: 120s virtual soak recovers from shared collapse plus 3s stall',()=>{
 const r=checked('soak-stall',{guests:3,durationMs:120000,changeAtMs:12000,afterBytesPerSecond:64000,stallAtMs:25000,stallMs:3000});
 for(const p of r.peers){assert.ok(p.steadyHz>6);assert.ok(p.ageP95<1100);}
});
// Preserve the existing healthy multi-peer throughput target. If a conservative
// credit ceiling harms throughput this stays red; do not weaken it to call the
// collapse mitigation a release-ready optimization.
test('sockets: 9 healthy guests retain >=40Hz each instead of trading away normal-link performance',()=>{
 const r=checked('healthy-nine',{guests:9,durationMs:40000});for(const p of r.peers){assert.ok(p.steadyHz>=40);assert.ok(p.ageP95<250);}assert.ok(r.peers.reduce((n,p)=>n+p.steadyHz,0)>420);
});
