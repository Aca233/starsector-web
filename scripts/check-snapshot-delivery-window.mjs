import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SnapshotDeliveryWindow } from '../server/SnapshotDeliveryWindow.mjs';
import { LanStateCredits } from '../server/LanStateCredits.mjs';

function observer(gap, count = 1) {
  let time = 0;
  const window = new SnapshotDeliveryWindow({ now: () => time });
  for (let i = 0; i < 16; i++) { time = i * gap; window.acknowledge(count); }
  return { window, advance: (ms, n = 1) => { time += ms; window.acknowledge(n); } };
}
test('healthy 20/60/120/300/1000ms routes keep the original RTT-derived ceiling', () => {
  for (const rtt of [20, 60, 120, 300, 1000]) for (const gap of [16, 80, 170, 1500]) {
    const {window} = observer(gap), ceiling = Math.min(64, Math.ceil(rtt * .06) + 1);
    assert.equal(window.limit(ceiling, rtt, rtt + 30), ceiling);
  }
});
test('congested delivery learns a BDP window, not an ever-growing busy RTT window', () => {
  const {window} = observer(170);
  assert.equal(window.limit(5, 60, 800), 2);
  assert.equal(window.limit(5, 60, 75), 2, 'one drained pong must not refill the slow link');
  assert.equal(window.limit(19, 300, 1800), 4);
  assert.equal(window.limit(2, 5, 800), 2);

});
test('extra serialization/scheduler slot avoids the measured hard-two-frame starvation', () => {
  const {window} = observer(80);
  assert.equal(window.limit(5, 60, 400), 3);
  assert.equal(window.limit(19, 300, 1500), 6);
});
test('short, unknown or malformed measurements do not manufacture a rate', () => {
  const window = new SnapshotDeliveryWindow({now:()=>0});
  assert.equal(window.deliveryHz, null);
  for (const count of [0, -1, NaN, Infinity, 1.5, '1']) assert.equal(window.acknowledge(count), false);
  window.acknowledge(10);window.acknowledge(10);
  assert.equal(window.deliveryHz, null, 'one burst cannot imply infinite service rate');
  for (const rtt of [null, NaN, Infinity, -1]) assert.equal(window.limit(5, rtt, 999),5);
  assert.throws(()=>window.limit(1,60,999),RangeError);
});
test('sparse very slow deliveries remain bounded and recover after bandwidth returns', () => {
  const {window,advance} = observer(1500);
  assert.ok(window.deliveryHz > 0 && window.deliveryHz < 1);
  assert.equal(window.limit(19,300,15000),2);
  for(let i=0;i<180;i++)advance(1000/60);
  assert.equal(window.limit(19,300,320),19,'recovered service and RTT restore the old ceiling');
  window.reset();assert.equal(window.deliveryHz,null);assert.equal(window.limit(19,300,15000),19);
});
test('cumulative ACKs count frames, not calls, and identical timestamps do not divide by zero', () => {
  const {window} = observer(100,5);
  assert.ok(Math.abs(window.deliveryHz-50)<1e-9);
  assert.equal(window.limit(5,60,900),5);
});
test('backward/invalid test clocks cannot create negative or nonfinite rates', () => {
  let now=1000;const window=new SnapshotDeliveryWindow({now:()=>now});window.acknowledge(1);
  now=900;window.acknowledge(1);assert.equal(window.deliveryHz,null);
  now=NaN;assert.equal(window.acknowledge(1),false);assert.equal(window.deliveryHz,null);
});
test('LAN exact membership gates delivery feedback; shrink never discards an in-flight frame', () => {
  let now=0;const credits=new LanStateCredits({now:()=>now});credits.recordNetworkRtt(60);
  for(let i=1;i<=16;i++){now+=170;assert.equal(credits.reserve(i,1000),true);assert.equal(credits.ack(i),true);}
  for(let i=17;i<=21;i++)assert.equal(credits.reserve(i,1000),true);
  const probe=credits.beginNetworkProbe();credits.recordNetworkRtt(800,probe);
  assert.equal(credits.capacity,2);assert.equal(credits.stats().inflight,5);
  const before=credits.stats();assert.equal(credits.ack(999),false);assert.equal(credits.ack(16),false);assert.deepEqual(credits.stats(),before);
  assert.equal(credits.reserve(22,1000),false);
  now+=170;assert.equal(credits.ack(19),true);assert.equal(credits.stats().inflight,2);
  assert.equal(credits.reserve(22,1000),false, "two remaining frames must drain, not be thrown away");
  now+=170;assert.equal(credits.ack(20),true);
  assert.equal(credits.reserve(22,1000),true);
  credits.reset();assert.equal(credits.stats().inflight,0);assert.equal(credits.ack(22),false);
  assert.equal(credits.capacity,5,'new match has no reused consumption-rate estimate');
});

test('deterministic bandwidth collapse drains queues, then restores healthy high-RTT throughput', async () => {
  const { modelLanCredits } = await import('./lib/lan-credit-link-model.mjs');
  for (const rtt of [60, 300]) for (const rate of [250000, 500000]) {
    const result = modelLanCredits(LanStateCredits, { duration: 30000, rtt, bytes: 40000, rate,
      fastRate: 4000000, changeAt: 4000, restoreAt: 20000 });
    const settled = result.samples.filter(s => s.at >= 15000 && s.at < 20000);
    assert.ok(settled.length >= 4);
    assert.ok(settled.every(s => s.capacity < s.idleCapacity));
    assert.ok(settled.every(s => s.queuedMs < 500), JSON.stringify({rtt,rate,settled}));
    const recovered = result.samples.filter(s => s.at >= 25000);
    assert.ok(recovered.every(s => s.capacity === s.idleCapacity));
    assert.ok(recovered.every(s => s.deliveryHz >= 58));
    assert.equal(result.skipSocket, 0);
  }
});
