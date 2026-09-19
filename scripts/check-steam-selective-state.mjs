import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { SteamSelectiveStateCodec, unpackSelectiveState, readSelectiveDecodes } from '../server/steam/experimental/selective-state-codec.mjs';
import { SteamSelectiveAnchoredSender } from '../server/steam/experimental/selective-anchored-sender.mjs';
import { SteamSocketStateCodec } from '../server/steam/sockets-state-codec.mjs';
import { packDictionaryState } from '../server/steam/experimental/dictionary-state-codec.mjs';
import { SteamAnchoredSender, SteamAnchoredReceiver } from '../server/steam/anchored-snapshots.mjs';
import { SteamSnapshotEncoder } from '../server/steam/snapshot-delta.mjs';
import { KEY_DICTIONARY } from '../src/network/KeyDictionary.mjs';
const text = JSON.stringify;
const wire = p => p.payload.length + 64 * Math.ceil(p.payload.length / 8192);
const decode = p => { const raw = p.zipped ? inflateRawSync(p.payload, { maxOutputLength: p.rawBytes }) : p.payload; return p.packedState ? unpackSelectiveState(raw) : JSON.parse(raw.toString()); };
const envelope = body => text({ type: 'steam-state', v: 1, token: 1, base: null, size: 1, hash: 'b'.repeat(64), body });
let seed = 218;
const noise = n => Array.from({ length: n }, () => String.fromCharCode(32 + ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) % 90))).join('');
const ballast = noise(14000), moving = Array.from({ length: 60 }, (_, id) => ({ id, name: noise(12) }));
const smallState = seq => text({ type: 'state', matchId: 'shared-battle', seq, frame: { tick: seq, marker: 'exact-' + seq, producedAt: seq * 17, ballast,
  moving: moving.map((m, i) => ({ ...m, x: Math.sin((seq + i) * .07) * 1000, y: Math.cos((seq - i) * .04) * 1000, hp: 10000 - seq % 700 })) } });
const dictionaryBody = Array.from({ length: 32 }, () => Object.fromEntries(KEY_DICTIONARY.map(k => [k, noise(40)])));

test('default prepare is identical to current codec; no eager dictionary work', () => {
  const a = new SteamSocketStateCodec(), b = new SteamSelectiveStateCodec();
  for (const [op, value] of [['ping', { n: 1 }], ['data', text({ type: 'input', n: 2 })], ['data', envelope(dictionaryBody)], ['data', envelope(null)]]) assert.deepEqual(b.prepare(op, value), a.prepare(op, value));
  assert.equal(b.selectionDiagnostics().attempts, 0);
});
test('exact current winner is kept when dictionary beats JSON but loses to SMF1', () => {
  const codec = new SteamSelectiveStateCodec(), target = new SteamSnapshotEncoder().prepare(smallState(1), codec);
  const original = target.full, dictionary = deflateRawSync(packDictionaryState(original.raw), { level: 1 });
  assert.ok(dictionary.length > original.payload.length, 'known old-candidate regression fixture');
  assert.equal(codec.selectFull(original), original);
  assert.equal(codec.selectionDiagnostics().keptBaseline, 1);
});
test('dictionary chosen only when independently measured application wire is smaller', () => {
  const codec = new SteamSelectiveStateCodec(), reference = codec.prepare('data', envelope(dictionaryBody));
  const raw = packDictionaryState(reference.raw), payload = deflateRawSync(raw, { level: 1 });
  const selected = codec.selectFull(reference), eligible = payload.length < reference.payload.length && wire({ payload }) + 16 < wire(reference);
  assert.ok(eligible, 'fixture must exercise a real dictionary winner');
  assert.equal(selected.dictionaryState, true); assert.deepEqual(selected.payload, payload); assert.equal(selected.rawBytes, raw.length);
  assert.equal(text(decode(selected)), reference.raw); assert.ok(wire(selected) + 16 < wire(reference));
});
test('shared broadcast retries use one bounded cache without mutating reference', () => {
  const codec = new SteamSelectiveStateCodec(), reference = codec.prepare('data', envelope(dictionaryBody)), saved = Buffer.from(reference.payload);
  const chosen = codec.selectFull(reference);
  for (let i = 0; i < 9; i++) assert.equal(codec.selectFull(reference), chosen);
  assert.equal(codec.selectionDiagnostics().attempts, 1); assert.equal(codec.selectionDiagnostics().cacheHits, 9);
  assert.deepEqual(reference.payload, saved); assert.equal(reference.dictionaryState, undefined);
  const bytes = Buffer.from(chosen.payload); codec.clear(); assert.equal(codec.selectionDiagnostics().cached, false); assert.equal(codec.cache, null); assert.deepEqual(chosen.payload, bytes);
});
test('non-full, controls, legacy full fallback and invalid strings stay untouched', () => {
  const codec = new SteamSelectiveStateCodec();
  for (const raw of [smallState(1), text({ type: 'input', seq: 1 }), envelope(null).replace('"base":null', '"base":2')]) {
    const reference = codec.prepare('data', raw); assert.equal(codec.selectFull(reference), reference);
  }
  assert.equal(codec.selectionDiagnostics().attempts, 0);
  for (const body of [{ constructor: 1 }, { s: '\ud800' }, { s: '\ufeffhello' }, { s: 'x'.repeat(600000) }]) {
    const reference = codec.prepare('data', envelope(body)); assert.equal(codec.selectFull(reference), reference);
  }
});
test('only selected full envelopes trigger trials, not every offered state', () => {
  const codec = new SteamSelectiveStateCodec(), encoder = new SteamSnapshotEncoder(), sender = new SteamSelectiveAnchoredSender({ adaptive: true });
  for (let seq = 1; seq <= 120; seq++) {
    encoder.prepare(smallState(seq), codec); // offerState's existing eager baseline preparation
    const c = sender.prepare(smallState(seq), encoder, codec, seq * 17); assert.ok(sender.commit(c));
    if (c.kind === 'anchor') assert.ok(sender.acknowledgeAnchor(c.target.token));
  }
  assert.equal(codec.selectionDiagnostics().attempts, 1);
});
test('representation changes cannot alter anchor/full decisions or byte-amortization accounting', () => {
  // Deliberately fake a smaller wire payload to isolate scheduling, not a valid
  // packet or end-to-end codec test. Actual decoding is covered separately.
  const base = new SteamAnchoredSender({ adaptive: true }), routed = new SteamSelectiveAnchoredSender({ adaptive: true });
  const a = new SteamSocketStateCodec(), b = new SteamSocketStateCodec();
  b.selectFull = p => ({ ...p, payload: Buffer.from([0]) });
  const ea = new SteamSnapshotEncoder(), eb = new SteamSnapshotEncoder(); let anchors = 0, changed = 0;
  for (let seq = 1; seq <= 680; seq++) {
    const raw = smallState(seq), ca = base.prepare(raw, ea, a, seq * 17), cb = routed.prepare(raw, eb, b, seq * 17);
    assert.equal(cb.kind, ca.kind); assert.equal(cb.delta, ca.delta); assert.equal(cb.target.token, ca.target.token);
    assert.deepEqual(cb.target.full.payload, ca.target.full.payload, 'reference target must not be overwritten');
    if (cb.prepared !== cb.target.full && cb.prepared.payload.length === 1) changed++;
    assert.ok(base.commit(ca)); assert.ok(routed.commit(cb));
    if (ca.kind === 'anchor') { anchors++; assert.ok(base.acknowledgeAnchor(ca.target.token)); assert.ok(routed.acknowledgeAnchor(cb.target.token)); }
    assert.deepEqual(routed.diagnostics(), base.diagnostics());
  }
  assert.ok(anchors >= 3); assert.ok(changed >= 3);
});
test('routed commit preserves one-use, cross-sender and reset protections', () => {
  const codec = new SteamSocketStateCodec(); codec.selectFull = p => ({ ...p, payload: Buffer.from([0]) });
  const sender = new SteamSelectiveAnchoredSender(), other = new SteamSelectiveAnchoredSender(), encoder = new SteamSnapshotEncoder();
  let choice = sender.prepare(smallState(1), encoder, codec, 0);
  assert.equal(other.commit(choice), false); assert.ok(sender.commit(choice)); assert.equal(sender.commit(choice), false);
  assert.ok(sender.acknowledgeAnchor(choice.target.token));
  choice = sender.prepare(smallState(2), encoder, codec, 6000); sender.reset(); assert.equal(sender.commit(choice), false);
  assert.equal(sender.commit({ kind: 'anchor', target: choice.target, prepared: choice.prepared }), false);
});
test('real dictionary full and unchanged delta apply exactly with original hash/base checks', () => {
  const codec = new SteamSelectiveStateCodec(), encoder = new SteamSnapshotEncoder(), sender = new SteamSelectiveAnchoredSender({ adaptive: true }), receiver = new SteamAnchoredReceiver();
  const before = readSelectiveDecodes(); let full;
  for (let seq = 1; seq <= 4; seq++) {
    const raw = text({ type: 'state', matchId: 'large-dictionary', seq, frame: { tick: seq, ships: dictionaryBody } });
    const c = sender.prepare(raw, encoder, codec, seq * 17); assert.ok(sender.commit(c));
    const value = decode(c.prepared), r = c.kind === 'anchor' ? receiver.receiveAnchor(value) : receiver.receiveSnapshot(value);
    assert.equal(text(r.data), raw);
    if (c.kind === 'anchor') { assert.equal(c.prepared.dictionaryState, true); full = value; assert.ok(sender.acknowledgeAnchor(c.target.token)); }
    else assert.equal(c.prepared.dictionaryState, undefined);
  }
  assert.ok(readSelectiveDecodes().dictionaryDecoded > before.dictionaryDecoded);
  const bad = structuredClone(full); bad.hash = '0'.repeat(64); assert.throws(() => new SteamAnchoredReceiver().receiveAnchor(bad));
});
test('legacy framing stays forbidden and malformed payloads do not count as decoded', () => {
  const codec = new SteamSelectiveStateCodec(), before = readSelectiveDecodes();
  assert.throws(() => codec.encode()); assert.throws(() => codec.frame()); assert.throws(() => unpackSelectiveState(Buffer.from('SKD1')));
  assert.deepEqual(readSelectiveDecodes(), before);
});

test('non-delta snapshots may select dictionary without changing accounting; pending ACK invalidates stale wrappers', () => {
  const codec = new SteamSelectiveStateCodec(), encoder = new SteamSnapshotEncoder();
  const sender = new SteamSelectiveAnchoredSender({ adaptive: true }), receiver = new SteamAnchoredReceiver();
  const state = (seq, ships) => text({ type: 'state', matchId: 'full-snapshot', seq, frame: { tick: seq, ships } });
  const first = state(1, dictionaryBody), anchor = sender.prepare(first, encoder, codec, 0);
  assert.equal(anchor.prepared.dictionaryState, true); assert.ok(sender.commit(anchor));
  assert.equal(text(receiver.receiveAnchor(decode(anchor.prepared)).data), first);
  const changed = dictionaryBody.map(row => Object.fromEntries(Object.keys(row).map(key => [key, noise(40)])));
  const next = state(2, changed), pending = sender.prepare(next, encoder, codec, 17);
  assert.equal(pending.kind, 'snapshot'); assert.equal(pending.delta, false); assert.equal(pending.prepared.dictionaryState, true);
  assert.ok(sender.acknowledgeAnchor(anchor.target.token));
  assert.equal(sender.commit(pending), false, 'ACK changed the sender revision');
  const fresh = sender.prepare(next, encoder, codec, 34);
  assert.equal(fresh.kind, 'snapshot'); assert.equal(fresh.delta, false); assert.equal(fresh.prepared.dictionaryState, true);
  assert.ok(sender.commit(fresh)); assert.equal(text(receiver.receiveSnapshot(decode(fresh.prepared)).data), next);
  assert.equal(sender.diagnostics().snapshotBytes, fresh.target.full.payload.length, 'amortization uses original cost, not dictionary wire cost');
});
