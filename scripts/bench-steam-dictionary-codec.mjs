// Offline comparison only. Does not alter production imports, start networking,
// call Steam, crop large recorded frames, or negotiate the candidate format.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { SteamPacketCodec } from '../server/steam/packet-codec.mjs';
import { SteamSocketStateCodec, unpackSocketState } from '../server/steam/sockets-state-codec.mjs';
import { SteamAnchorDictionaryCodec } from '../server/steam/experimental/anchor-dictionary-state-codec.mjs';
import { SteamDictionaryStateCodec, unpackDictionaryState } from '../server/steam/experimental/dictionary-state-codec.mjs';
import { SteamSnapshotEncoder, SteamSnapshotReceiver } from '../server/steam/snapshot-delta.mjs';
import { SteamAnchoredSender, SteamAnchoredReceiver } from '../server/steam/anchored-snapshots.mjs';
import { decodeBinaryState } from '../src/network/BinarySnapshot.mjs';
const dir = path.resolve(process.argv[2] ?? `artifacts/steam-lan-dictionary-20260919/bench-${Date.now()}`);
fs.mkdirSync(dir, { recursive: true });
const write = (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const paths = ['server/steam/experimental/anchor-dictionary-state-codec.mjs', 'server/steam/experimental/dictionary-state-codec.mjs', 'server/steam/sockets-state-codec.mjs', 'server/steam/packet-codec.mjs',
  'server/steam/snapshot-delta.mjs', 'server/steam/anchored-snapshots.mjs', 'src/network/BinarySnapshot.mjs', 'src/network/KeyDictionary.mjs', 'scripts/bench-steam-dictionary-codec.mjs'];
const hashes = () => Object.fromEntries(paths.map(p => [p, hash(fs.readFileSync(p))]));
const before = hashes(), Codec = { json: SteamPacketCodec, packed: SteamSocketStateCodec, dictionary: SteamDictionaryStateCodec, anchorDictionary: SteamAnchorDictionaryCodec };
const peers = 9, count = 120;
const summary = values => { const a = [...values].sort((a, b) => a - b); return { n: a.length, mean: a.reduce((s, n) => s + n, 0) / a.length, median: a[Math.floor(a.length / 2)], p95: a[Math.ceil(a.length * .95) - 1] }; };
const decode = p => {
  const raw = p.zipped ? inflateRawSync(p.payload, { maxOutputLength: p.rawBytes }) : p.payload;
  return p.dictionaryState ? unpackDictionaryState(raw) : p.packedState ? unpackSocketState(raw) : JSON.parse(raw.toString('utf8'));
};
const wireBytes = p => p.payload.length + 64 * Math.ceil(p.payload.length / 8192); // wide snapshots / reliable anchors
const plan = { peers, states: count, rounds: 2, warmupStates: 30, omitFirstSamples: 20,
  gates: { maximumWireRatioVsPacked: 1, maximumSharedHostRatioVsPacked: 1.10, maximumGuestRatioVsPacked: 1.10 },
  scope: 'Complete recorded anchors/fallbacks + synthetic 9-peer aligned/staggered anchors; immediate ACK, no game/render/native/input latency measurement',
  noProductionChange: true, sourceHashes: before, node: process.version };
write('plan.json', plan);
console.log('Output:', dir);

// Preserve all three complete captured 32-ship states. Two exceed Steam's
// existing delta ceiling: retain JSON fallback and explicitly report it.
const recorded = [];
for (let index = 0; index < 3; index++) {
  const source = `artifacts/lan-worker-latency/snapshot-32-${index}.bin`, bytes = fs.readFileSync(source), state = decodeBinaryState(bytes), text = JSON.stringify(state);
  const rows = Object.fromEntries(Object.keys(Codec).map(key => [key, { host: [], guest: [], wire: [], packed: 0, unsupported: 0 }]));
  for (let round = 0; round < 25; round++) for (const key of round % 2 ? Object.keys(Codec).reverse() : Object.keys(Codec)) {
    const codec = new Codec[key](), encoder = new SteamSnapshotEncoder(), row = rows[key];
    let at = performance.now(); const target = encoder.prepare(text, codec), p = target ? target.full : codec.prepare('data', text);
    const host = performance.now() - at;
    at = performance.now(); const envelope = decode(p), restored = new SteamSnapshotReceiver().receive(envelope).data;
    const guest = performance.now() - at;
    assert.equal(JSON.stringify(restored), text);
    if (round >= 5) { row.host.push(host); row.guest.push(guest); row.wire.push(wireBytes(p, 'anchor')); row.packed += Number(!!p.packedState); row.unsupported += Number(!target); }
    codec.clear(); encoder.clear();
  }
  recorded.push({ index, source, sha256: hash(bytes), ships: state.frame.ships.length, canonicalBytes: Buffer.byteLength(text),
    variants: Object.fromEntries(Object.entries(rows).map(([key, row]) => [key, { hostMs: summary(row.host), guestMs: summary(row.guest), wireBytes: summary(row.wire), selectedPacked: row.packed, legacyFullFallbacks: row.unsupported, samples: row }])) });
}
write('recorded.json', recorded);
console.log('Recorded:', JSON.stringify(recorded.map(r => ({ index: r.index, canonicalBytes: r.canonicalBytes,
  variants: Object.fromEntries(Object.entries(r.variants).map(([k, v]) => [k, { bytes: v.wireBytes.mean, selected: v.selectedPacked, fallback: v.legacyFullFallbacks }])) }))));

let seed = 218;
const noise = n => Array.from({ length: n }, () => String.fromCharCode(32 + ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) % 90))).join('');
const ballast = noise(14000), moving = Array.from({ length: 60 }, (_, id) => ({ id, name: noise(12) }));
const states = Array.from({ length: count + peers }, (_, index) => {
  const seq = index + 1;
  return JSON.stringify({ type: 'state', matchId: 'shared-battle', seq, frame: { tick: seq, marker: 'exact-' + seq, producedAt: Math.ceil(seq * 1000 / 60 / 4) * 4, ballast,
    moving: moving.map((m, i) => ({ ...m, x: Math.sin((seq + i) * .07) * 1000, y: Math.cos((seq - i) * .04) * 1000, hp: 10000 - seq % 700 })) } });
});
function measure({ key, shared, staggered }, limit) {
  const commonCodec = new Codec[key](), commonEncoder = new SteamSnapshotEncoder();
  const entries = Array.from({ length: peers }, () => ({ sender: new SteamAnchoredSender({ adaptive: true }), receiver: new SteamAnchoredReceiver(),
    codec: shared ? commonCodec : new Codec[key](), encoder: shared ? commonEncoder : new SteamSnapshotEncoder() }));
  const host = [], guest = [], wire = []; let anchorBytes = 0, packedStates = 0;
  if (staggered) for (let i = 0; i < peers; i++) {
    const e = entries[i], c = e.sender.prepare(states[i], e.encoder, e.codec, 0);
    assert.equal(c.kind, 'anchor'); assert.ok(e.sender.commit(c));
    assert.equal(JSON.stringify(e.receiver.receiveAnchor(decode(c.prepared)).data), states[i]);
    assert.ok(e.sender.acknowledgeAnchor(c.target.token));
  }
  for (let index = 0; index < limit; index++) {
    const text = states[index + (staggered ? peers : 0)], now = (index + 1) * 1000 / 60, at = performance.now();
    const choices = entries.map(e => { const c = e.sender.prepare(text, e.encoder, e.codec, now); assert.ok(e.sender.commit(c)); return c; });
    host.push(performance.now() - at);
    for (let i = 0; i < peers; i++) {
      const c = choices[i], e = entries[i], started = performance.now(), value = decode(c.prepared);
      const data = (c.kind === 'anchor' ? e.receiver.receiveAnchor(value) : e.receiver.receiveSnapshot(value)).data;
      if (i === 0) guest.push(performance.now() - started);
      assert.equal(JSON.stringify(data), text); // ALL nine peers, not only the first.
      if (c.kind === 'anchor') assert.ok(e.sender.acknowledgeAnchor(c.target.token));
    }
    const first = choices[0];
    if (first.kind === 'snapshot') wire.push(wireBytes(first.prepared, first.kind)); else anchorBytes = wireBytes(first.prepared, first.kind);
    packedStates += Number(!!first.prepared.packedState);
  }
  for (const e of entries) { e.codec.clear(); e.encoder.clear(); }
  return { key, shared, staggered, states: limit, allNinePeersExact: true,
    hostMs: summary(host.slice(20)), guestMs: summary(guest.slice(20)), snapshotWireBytes: summary(wire), anchorBytes, packedStates,
    rawSamples: { hostMs: host, guestMs: guest, snapshotWireBytes: wire } };
}
const variants = [false, true].flatMap(staggered => [false, true].flatMap(shared => Object.keys(Codec).map(key => ({ key, shared, staggered }))));
for (const v of variants) measure(v, 30);
const results = [];
for (const [round, order] of [[1, variants], [2, [...variants].reverse()]]) for (const v of order) {
  const result = { round, ...measure(v, count) }; results.push(result);
  console.log(JSON.stringify({ round, key: v.key, shared: v.shared, staggered: v.staggered, hostMedian: result.hostMs.median, guestMedian: result.guestMs.median, wireMean: result.snapshotWireBytes.mean }));
}
write('broadcast.json', results);
const comparisons = results.filter(r => ['dictionary', 'anchorDictionary'].includes(r.key) && r.shared).map(b => {
  const a = results.find(r => r.round === b.round && r.key === 'packed' && r.shared && r.staggered === b.staggered);
  return { key: b.key, round: b.round, staggered: b.staggered, hostRatio: b.hostMs.median / a.hostMs.median, guestRatio: b.guestMs.median / a.guestMs.median, wireRatio: b.snapshotWireBytes.mean / a.snapshotWireBytes.mean };
});
assert.deepEqual(hashes(), before, 'sources changed during benchmark');
write('decision.json', { comparisons, microbenchGatesPassed: comparisons.every(c => c.hostRatio <= 1.10 && c.guestRatio <= 1.10 && c.wireRatio <= 1),
  defaultEnabled: false, sourceHashesUnchanged: true, note: 'No automatic promotion. Model and negotiated native/real two-account tests remain separate gates.' });
console.log(JSON.stringify({ comparisons, defaultEnabled: false }));
