import assert from 'node:assert/strict';import {test} from 'node:test';
import {simulateSocketLink} from './steam-sockets-link-model.mjs';
test('the ACK-floor sensitivity model does not mistake explicit ACK batching for an empty-link bandwidth collapse',()=>{
 const run=observedAckFloor=>simulateSocketLink({guests:1,durationMs:5000,rttMs:60,stateHz:0,trace:true,observedAckFloor});
 const legacy=run(false),observed=run(true);
 assert.deepEqual(legacy.closed,[]);assert.deepEqual(observed.closed,[]);
 assert.equal(observed.config.observedAckFloor,true);
 const latest=observed.timeline.at(-1).peers[0],old=legacy.timeline.at(-1).peers[0];
 assert.equal(latest.nativePending,0);assert.ok(latest.nativeRate>=128000);assert.ok(old.nativeRate<16000);
});
test('recorded-frame input verifies the complete received JSON, not just tick and marker fields',()=>{
 const r=simulateSocketLink({guests:1,durationMs:3500,rttMs:60,observedAckFloor:true,frameFactory:seq=>({unchanged:'中文🚀',complete:Array.from({length:80},(_,i)=>({x:Math.sin(seq+i),y:i,flag:i%2===0})),nested:{nil:null,empty:[]}})});
 assert.ok(r.peers[0].frames>20);assert.equal(r.peers[0].decodeFailures,0);assert.deepEqual(r.closed,[]);
});

test('ACK delay compensation stays bounded for continuous mixed-size traffic on an empty physical link',()=>{
 const options={guests:1,durationMs:7000,rttMs:60,upBytesPerSecond:8000000,trace:true,observedAckFloor:true,
 frameFactory:seq=>({items:Array.from({length:800},(_,i)=>[Math.sin(seq+i),Math.cos(seq-i),i])})};
 const r=simulateSocketLink({...options,compensateAckDelay:true});
 assert.deepEqual(r.closed,[]);assert.equal(r.peers[0].decodeFailures,0);
 assert.ok(r.peers[0].frames>20);assert.ok(r.timeline.at(-1).peers[0].nativeRate>=128000);
 assert.equal(r.config.compensateAckDelay,true);
});
