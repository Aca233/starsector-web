import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LanDeltaSender, lanDeltaTarget } from '../server/LanDeltaTransport.mjs';
import { LanDeltaReceiver, encodeLanPacket, LAN_DELTA_MAX_BYTES } from '../src/network/LanBinaryDelta.mjs';
import { motionFrame, motionBytes } from './lib/motion-reference-fixture.mjs';
const target = (seq, tick = 100 + seq, change = () => {}) => { const frame = motionFrame(); frame.tick = tick; change(frame); return lanDeltaTarget(motionBytes(frame, seq), seq); };
const receiver = () => new LanDeltaReceiver({ motionReference: true });
function deliver(sender, recv, t) {
  const original = t.bytes.slice(), choice = sender.prepare(t);
  assert.deepEqual(recv.decode(choice.packet), t.bytes); assert.deepEqual(t.bytes, original);
  assert.equal(sender.commit(choice), true); return choice;
}
test('negotiated correction is exact across skips, changing motion and delayed consumption ACKs', () => {
  for (const ordered of [true, false]) {
    const sender = new LanDeltaSender({ ordered, motionReference: true }), recv = receiver();
    deliver(sender, recv, target(1)); sender.ack(1);
    for (const seq of [2, 5, 8, 12]) {
      const result = deliver(sender, recv, target(seq, 100 + seq, f => { f.world.fxSystem.values[0][0].values[0].$vector[0] = -99.125 * seq; }));
      assert.ok(result.motionSteps > 0); assert.ok(result.delta); sender.ack(seq);
    }
    assert.equal(sender.stats().motionDeltas, 4); assert.ok(recv.retainedBytes <= 2 * LAN_DELTA_MAX_BYTES);
  }
});
test('no negotiation means no motion flag; unconfirmed receiver rejects rather than misdecoding', () => {
  const legacy = new LanDeltaSender({ ordered: true }), oldReceiver = new LanDeltaReceiver();
  deliver(legacy, oldReceiver, target(1)); assert.equal(deliver(legacy, oldReceiver, target(2)).motionSteps, 0);
  const sender = new LanDeltaSender({ ordered: true, motionReference: true }), first = sender.prepare(target(1)); sender.commit(first);
  const recv = new LanDeltaReceiver(); recv.decode(first.packet); const next = sender.prepare(target(2));
  assert.throws(() => recv.decode(next.packet)); assert.equal(recv.retainedBytes, 0);
});
test('unknown/zero/oversized step flags, altered target hash, and unmarked step count fail closed', () => {
  const sender = new LanDeltaSender({ ordered: true, motionReference: true }), first = sender.prepare(target(1)); sender.commit(first);
  const next = sender.prepare(target(2)); assert.equal(next.motionSteps, 1);
  for (const mutate of [
    b => new DataView(b.buffer).setUint32(4, 7),
    b => new DataView(b.buffer).setUint32(4, 7 | 61 << 8),
    b => new DataView(b.buffer).setUint32(4, 3 | 1 << 8),
    b => new DataView(b.buffer).setUint32(4, 7 | 1 << 15),
    b => new DataView(b.buffer).setUint32(4, 6 | 1 << 8),
    b => b[32] ^= 1, b => b[28] ^= 1,
  ]) {
    const recv = receiver(), packet = next.packet.slice(); recv.decode(first.packet); mutate(packet);
    assert.throws(() => recv.decode(packet)); assert.equal(recv.retainedBytes, 0);
  }
  assert.throws(() => encodeLanPacket(target(1), null, null, true, 1));
});
test('reference over one second, clock rollback, or unknown shape uses ordinary exact deltas', () => {
  for (const tick of [1000, 100, 101]) {
    const sender = new LanDeltaSender({ ordered: true, motionReference: true }), recv = receiver();
    deliver(sender, recv, target(1)); const next = deliver(sender, recv, target(2, tick)); assert.equal(next.motionSteps, 0);
  }
  const sender = new LanDeltaSender({ ordered: true, motionReference: true }), recv = receiver();
  deliver(sender, recv, target(1, 101, f => { f.world = {}; })); assert.equal(deliver(sender, recv, target(2)).motionSteps, 0);
});
test('matched references are shared per broadcast while divergent work retains the existing 2/4ms budget', () => {
  const initial = target(1), senders = Array.from({ length: 9 }, () => new LanDeltaSender({ ordered: true, motionReference: true }));
  for (const sender of senders) sender.commit(sender.prepare(initial));
  const next = target(2); for (const sender of senders) sender.commit(sender.prepare(next));
  assert.equal(next.patchBuilds, 1); assert.ok(senders.every(s => s.stats().motionDeltas === 1));
  for (let i = 0; i < senders.length; i++) senders[i].commit(senders[i].prepare(target(i + 3)));
  const divergent = target(50); for (const sender of senders) sender.commit(sender.prepare(divergent));
  assert.ok(divergent.patchBuilds <= 2); assert.ok(senders.reduce((sum, s) => sum + s.stats().budgetFallbacks, 0) >= 7);
});
test('mixed negotiated/legacy recipients never share an incompatible cached patch', () => {
  const next = target(2), initial = target(1);
  const legacy = new LanDeltaSender({ ordered: true }), motion = new LanDeltaSender({ ordered: true, motionReference: true });
  const old = new LanDeltaReceiver(), modern = receiver(); deliver(legacy, old, initial); deliver(motion, modern, initial);
  const a = deliver(motion, modern, next), b = deliver(legacy, old, next);
  assert.ok(a.motionSteps > 0); assert.equal(b.motionSteps, 0); assert.ok(next.patchBuilds <= 2);
});
test('capability changes, missing bases and resets cannot reuse an old reference or accept a discarded preparation', () => {
  const sender = new LanDeltaSender({ ordered: true, motionReference: true }), recv = receiver();
  deliver(sender, recv, target(1)); const stale = sender.prepare(target(2)); sender.reset();
  assert.equal(sender.commit(stale), false); recv.setMotionReference(false); assert.equal(recv.retainedBytes, 0);
  assert.throws(() => recv.decode(stale.packet)); recv.setMotionReference(true);
  assert.equal(deliver(sender, recv, target(3)).motionSteps, 0);
});
