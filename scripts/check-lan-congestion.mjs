import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LanStateCredits } from '../server/LanStateCredits.mjs';
import { modelLanCredits } from './lib/lan-credit-link-model.mjs';

test('busy TCP pongs remain visible but cannot grow the LAN consumption window', () => {
  const c=new LanStateCredits();c.recordNetworkRtt(20);assert.equal(c.capacity,3);
  c.reserve(1,44324);
  for(let i=0;i<20;i++)c.recordNetworkRtt(500+i*100,c.beginNetworkProbe());
  assert.equal(c.capacity,3);assert.deepEqual(c.networkStats(),{latestRttMs:2400,baselineRttMs:20,busySamples:20});
  // Genuine faster routes may shrink even while busy.
  c.recordNetworkRtt(5,c.beginNetworkProbe());assert.equal(c.capacity,2);
});
test('empty on pong is not clean if the probe shared its epoch with state sends',()=>{
  const c=new LanStateCredits();c.recordNetworkRtt(20);
  for(let i=1;i<=6;i++){const probe=c.beginNetworkProbe();c.reserve(i,100);c.ack(i);c.recordNetworkRtt(1000,probe);}
  assert.equal(c.capacity,3);assert.equal(c.networkStats().busySamples,6);
});
test('clean idle route changes still relearn the five-sample window, including high RTT',()=>{
  const c=new LanStateCredits();c.recordNetworkRtt(20);
  for(let i=0;i<5;i++)c.recordNetworkRtt(300,c.beginNetworkProbe());
  assert.equal(c.capacity,19);assert.equal(c.networkStats().latestRttMs,300);
  c.recordNetworkRtt(5,c.beginNetworkProbe());assert.equal(c.capacity,2);
});
test('cold busy probes, stale epochs and malformed values do not create credits',()=>{
  const c=new LanStateCredits();c.reserve(1,123);c.recordNetworkRtt(2000,c.beginNetworkProbe());assert.equal(c.capacity,2);
  assert.equal(c.networkStats().baselineRttMs,null);
  const probe=c.beginNetworkProbe();c.reset();const before=c.networkStats();
  assert.equal(c.recordNetworkRtt(1000,probe),false);
  for(const value of [NaN,Infinity,-1,'200',null])assert.equal(c.recordNetworkRtt(value,c.beginNetworkProbe()),false);
  assert.deepEqual(c.networkStats(),before);assert.equal(c.ack(1),false);
  c.recordNetworkRtt(120,c.beginNetworkProbe());assert.equal(c.capacity,9);
});
test('first idle connection ping bootstraps a fast-start high-RTT battle, but not a reset epoch',()=>{
  const c=new LanStateCredits(),first=c.beginNetworkProbe();c.reserve(1,123);c.recordNetworkRtt(120,first);
  assert.equal(c.capacity,9);assert.equal(c.networkStats().baselineRttMs,120);
  const reset=new LanStateCredits();reset.reserve(1,123);reset.reset();const oldPipeline=reset.beginNetworkProbe();
  reset.reserve(2,123);reset.recordNetworkRtt(2000,oldPipeline);assert.equal(reset.capacity,2);
  assert.equal(reset.networkStats().baselineRttMs,null);
});
test('queue growth on a slow LAN cannot grant itself progressively larger windows',()=>{
  const result=modelLanCredits(LanStateCredits);
  assert.equal(result.maxWindow,3);assert.ok(result.maxFlight<=3);
  assert.equal(result.skipSocket,0);assert.ok(result.maxQueue<3*result.bytes);
  assert.ok(result.ageP95<1400);assert.ok(result.delivered>800);
  console.log(JSON.stringify({...result,samples:undefined}));
});
test('ample bandwidth preserves near-60 delivery with 20/120/300ms idle native RTT',()=>{
  for(const rtt of [20,120,300]){
    const r=modelLanCredits(LanStateCredits,{duration:10000,rtt,changeAt:20000});
    assert.ok(r.delivered/(10-rtt/2000)>=58,JSON.stringify({...r,samples:undefined}));
    assert.equal(r.skipSocket,0);assert.ok(r.ageMax===null);
  }
});
