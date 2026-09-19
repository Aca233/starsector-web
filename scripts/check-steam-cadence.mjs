import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SnapshotSendWindow } from '../server/steam/snapshot-window.mjs';
import { bundleGateway, simulateSharedLink } from './steam-shared-link-model.mjs';

test('only a recovered large RTT excursion earns a bounded temporary allowance', () => {
  const w = new SnapshotSendWindow();
  w.acknowledge(136, 0, 4);
  w.acknowledge(250, 200, 4); assert.equal(w.queueRtt, 250);
  w.acknowledge(312, 400, 4); assert.equal(w.queueRtt, 312);
  w.acknowledge(136, 600, 4); assert.ok(w.jitterAllowance > 0);
  w.acknowledge(300, 800, 4); assert.equal(w.queueRtt, 136);
  assert.equal(w.baseRtt, 136, 'never turn a jitter allowance into network RTT');
  w.acknowledge(700, 1800, 4); assert.equal(w.queueRtt, 700, 'unrecovered congestion loses allowance');
});
test('persistent RTT growth and ordinary small queue oscillations receive no jitter exemption', () => {
  const w = new SnapshotSendWindow(); w.acknowledge(200, 0, 4);
  for (let i = 1; i < 30; i++) { const sample = 200 + i * 40; w.acknowledge(sample, i * 200, w.limit); assert.equal(w.queueRtt, sample); }
  assert.equal(w.limit, 2); assert.equal(w.baseRtt, 200);
  const small = new SnapshotSendWindow(); small.acknowledge(200, 0, 4); small.acknowledge(260, 200, 4); small.acknowledge(200, 400, 4); small.acknowledge(260, 600, 4);
  assert.equal(small.jitterAllowance, 0); assert.equal(small.queueRtt, 260);
});
test('spike allowance is capped; probe reset and new connections cannot retain it', () => {
  const w = new SnapshotSendWindow(); w.acknowledge(100, 0, 4); w.acknowledge(5000, 100, 4); w.acknowledge(100, 200, 4);
  assert.equal(w.jitterAllowance, 200); w.acknowledge(1000, 400, 4); assert.equal(w.queueRtt, 800);
  w.acknowledge(300, 41000, 4); w.acknowledge(300, 42000, 1); w.acknowledge(300, 43000, 1);
  assert.equal(w.jitterAllowance, 0); assert.equal(w.queueRtt, 300); assert.equal(new SnapshotSendWindow().queueRtt, null);
  for(let i=0;i<1000;i++)w.acknowledge(300,43000,4); assert.ok(w.recentRtts.length<=256);
});
test('actual default gateway: adequate bandwidth plus ordered route jitter must not collapse to teens Hz', async () => {
  const r = simulateSharedLink(await bundleGateway(), { guests: 1, rttMs: 120, jitterMs: 100, upBytesPerSecond: 1000000, durationMs: 25000 });
  assert.deepEqual(r.closes, []); assert.equal(r.budgetViolations, 0);
  const p=r.peers[0]; assert.ok(p.steadyHz >= 50, JSON.stringify(p)); assert.ok(p.steadyAgeP95 <= 180);
  assert.equal(p.decodeFailures,0); assert.ok(p.peakBytes<=65536); assert.ok(p.peakFrames<=32); assert.ok(r.peakHostQueueBytes<16000);
  console.log(JSON.stringify({scope:'synthetic default SteamGateway, not real Steam measurements',hz:p.steadyHz,ageP95:p.steadyAgeP95,peakQueued:r.peakHostQueueBytes}));
});
