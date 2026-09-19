// Offline benchmark. Never imports Steam native bindings or enables a format.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { SteamSocketStateCodec, unpackSocketState } from '../server/steam/sockets-state-codec.mjs';
import { SteamSelectiveStateCodec, unpackSelectiveState } from '../server/steam/experimental/selective-state-codec.mjs';
import { SteamSelectiveAnchoredSender } from '../server/steam/experimental/selective-anchored-sender.mjs';
import { SteamSnapshotEncoder, SteamSnapshotReceiver } from '../server/steam/snapshot-delta.mjs';
import { SteamAnchoredSender, SteamAnchoredReceiver } from '../server/steam/anchored-snapshots.mjs';
import { decodeBinaryState } from '../src/network/BinarySnapshot.mjs';
const dir = path.resolve(process.argv[2] ?? `artifacts/steam-selective-state-20260919/bench-${Date.now()}`);
fs.mkdirSync(dir, { recursive: true });
const write = (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const hash = b => createHash('sha256').update(b).digest('hex');
const sourcePaths = ['scripts/bench-steam-selective-state.mjs', 'server/steam/experimental/selective-state-codec.mjs', 'server/steam/experimental/selective-anchored-sender.mjs', 'server/steam/experimental/dictionary-state-codec.mjs', 'server/steam/sockets-state-codec.mjs', 'server/steam/anchored-snapshots.mjs', 'server/steam/snapshot-delta.mjs', 'src/network/BinarySnapshot.mjs', 'src/network/KeyDictionary.mjs'];
const hashes = () => Object.fromEntries(sourcePaths.map(p => [p, hash(fs.readFileSync(p))]));
const before = hashes();
const variants = {
  packed: { Codec: SteamSocketStateCodec, Sender: SteamAnchoredSender, unpack: unpackSocketState },
  selective: { Codec: SteamSelectiveStateCodec, Sender: SteamSelectiveAnchoredSender, unpack: unpackSelectiveState },
};
const stats = values => { const a = [...values].sort((a, b) => a - b); return { n: a.length, mean: a.reduce((s, n) => s + n, 0) / a.length, median: a[Math.floor(a.length / 2)], p95: a[Math.ceil(a.length * .95) - 1] }; };
const wire = p => p.payload.length + 64 * Math.ceil(p.payload.length / 8192);
const decode = (key, p) => { const b = p.zipped ? inflateRawSync(p.payload, { maxOutputLength: p.rawBytes }) : p.payload; return p.packedState ? variants[key].unpack(b) : JSON.parse(b.toString('utf8')); };
write('plan.json', { sourceHashes: before, node: process.version, peers: 9, states: 120, rounds: 2, broadcastWarmupStates: 30, steadyOmitFirst: 20,
  recordedWarmupPerRound: 5, recordedSamplesPerRound: 20, maxWireRatio: 1, maxHostAndGuestRatio: 1.10,
  scope: 'Full recorded 32-ship states + synthetic nine-peer immediate-ACK broadcast. Cold full-state trial CPU explicitly included, not hidden by steady-state warmup. Not live combat, native, render or network latency.', defaultEnabled: false });
const recorded = [];
for (let index = 0; index < 3; index++) {
  const source = `artifacts/lan-worker-latency/snapshot-32-${index}.bin`, bytes = fs.readFileSync(source), state = decodeBinaryState(bytes), text = JSON.stringify(state);
  for (let round = 1; round <= 2; round++) {
    const rows = Object.fromEntries(Object.keys(variants).map(k => [k, { host: [], guest: [], wire: [], trials: [], dictionary: 0, fallback: 0 }]));
    for (let n = 0; n < 25; n++) for (const key of (n + round) % 2 ? Object.keys(variants) : Object.keys(variants).reverse()) {
      const { Codec, Sender } = variants[key], codec = new Codec(), encoder = new SteamSnapshotEncoder(), sender = new Sender({ adaptive: true });
      let at = performance.now();
      const c = sender.prepare(text, encoder, codec, 0), p = c.kind === 'unsupported' ? codec.prepare('data', text) : c.prepared;
      const hostMs = performance.now() - at;
      const receiver = new SteamSnapshotReceiver();
      at = performance.now(); const restored = receiver.receive(decode(key, p)).data; const guestMs = performance.now() - at;
      assert.equal(JSON.stringify(restored), text); // validation OUTSIDE timed work
      if (n >= 5) { const r = rows[key]; r.host.push(hostMs); r.guest.push(guestMs); r.wire.push(wire(p)); r.trials.push(codec.selectionDiagnostics?.().attempts ?? 0); r.dictionary += Number(!!p.dictionaryState); r.fallback += Number(c.kind === 'unsupported'); }
      codec.clear(); encoder.clear();
    }
    assert.ok(rows.selective.wire.every((n, i) => n <= rows.packed.wire[i]));
    recorded.push({ index, round, source, sha256: hash(bytes), ships: state.frame.ships.length, canonicalBytes: Buffer.byteLength(text), exact: true,
      variants: Object.fromEntries(Object.entries(rows).map(([k, r]) => [k, { hostMs: stats(r.host), guestMs: stats(r.guest), wireBytes: stats(r.wire), dictionary: r.dictionary, fallback: r.fallback, samples: r }])) });
  }
}
write('recorded.json', recorded);
console.log('Recorded bytes:', JSON.stringify(recorded.map(r => ({ index: r.index, round: r.round, packed: r.variants.packed.wireBytes.mean, selective: r.variants.selective.wireBytes.mean, hostRatio: r.variants.selective.hostMs.median / r.variants.packed.hostMs.median }))));
let seed = 218;
const noise = n => Array.from({ length: n }, () => String.fromCharCode(32 + ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) % 90))).join('');
const ballast = noise(14000), moving = Array.from({ length: 60 }, (_, id) => ({ id, name: noise(12) }));
const texts = Array.from({ length: 129 }, (_, i) => { const seq = i + 1; return JSON.stringify({ type: 'state', matchId: 'shared-battle', seq, frame: { tick: seq, marker: 'exact-' + seq, producedAt: seq * 1000 / 60, ballast,
  moving: moving.map((m, j) => ({ ...m, x: Math.sin((seq + j) * .07) * 1000, y: Math.cos((seq - j) * .04) * 1000, hp: 10000 - seq % 700 })) } }); });
function measure(key, staggered, limit) {
  const { Codec, Sender } = variants[key], codec = new Codec(), encoder = new SteamSnapshotEncoder();
  const entries = Array.from({ length: 9 }, () => ({ sender: new Sender({ adaptive: true }), receiver: new SteamAnchoredReceiver() }));
  const host = [], guest = [], sentWire = [], deltaHashes = []; let fullChoices = 0, deltaChoices = 0;
  const apply = (e, c, text) => {
    const at = performance.now(), value = decode(key, c.prepared), restored = (c.kind === 'anchor' ? e.receiver.receiveAnchor(value) : e.receiver.receiveSnapshot(value)).data;
    const ms = performance.now() - at;
    assert.equal(JSON.stringify(restored), text);
    if (c.kind === 'anchor') assert.ok(e.sender.acknowledgeAnchor(c.target.token));
    return ms;
  };
  if (staggered) for (let i = 0; i < entries.length; i++) { const e = entries[i], c = e.sender.prepare(texts[i], encoder, codec, 0); assert.ok(e.sender.commit(c)); apply(e, c, texts[i]); }
  for (let i = 0; i < limit; i++) {
    const text = texts[i + (staggered ? 9 : 0)], now = (i + 1) * 1000 / 60, at = performance.now();
    const choices = entries.map(e => { const c = e.sender.prepare(text, encoder, codec, now); return { c, committed: e.sender.commit(c) }; });
    host.push(performance.now() - at);
    let peerCost = 0;
    for (let j = 0; j < entries.length; j++) {
      const { c, committed } = choices[j]; assert.ok(committed);
      peerCost += apply(entries[j], c, text); sentWire.push(wire(c.prepared));
      if (c.delta) { deltaChoices++; deltaHashes.push(hash(c.prepared.payload)); } else fullChoices++;
    }
    guest.push(peerCost / entries.length);
  }
  const result = { key, staggered, states: limit, allNinePeersExact: true, fullChoices, deltaChoices, selection: codec.selectionDiagnostics?.() ?? null,
    firstHostMs: host[0], hostMs: stats(host.slice(20)), guestMs: stats(guest.slice(20)), actualWireBytes: sentWire.reduce((s, n) => s + n, 0), deltaDigest: hash(deltaHashes.join('\n')), rawSamples: { hostMs: host, guestMs: guest, sentWire } };
  codec.clear(); encoder.clear(); return result;
}
const order = [false, true].flatMap(staggered => Object.keys(variants).map(key => ({ key, staggered })));
for (const v of order) measure(v.key, v.staggered, 30);
const broadcast = [];
for (const round of [1, 2]) for (const v of round === 1 ? order : [...order].reverse()) {
  const r = { round, ...measure(v.key, v.staggered, 120) }; broadcast.push(r);
  console.log(JSON.stringify({ round, key: v.key, staggered: v.staggered, host: r.hostMs.median, guest: r.guestMs.median, selection: r.selection }));
}
write('broadcast.json', broadcast);
const comparisons = broadcast.filter(r => r.key === 'selective').map(b => {
  const a = broadcast.find(r => r.key === 'packed' && r.round === b.round && r.staggered === b.staggered);
  assert.equal(b.deltaDigest, a.deltaDigest, 'all delta payloads must remain byte-identical');
  assert.ok(b.rawSamples.sentWire.every((n, i) => n <= a.rawSamples.sentWire[i]));
  return { round: b.round, staggered: b.staggered, hostRatio: b.hostMs.median / a.hostMs.median, guestRatio: b.guestMs.median / a.guestMs.median, wireRatio: b.actualWireBytes / a.actualWireBytes, trials: b.selection.attempts };
});
const coldComparisons = recorded.map(r => ({ index: r.index, round: r.round, hostRatio: r.variants.selective.hostMs.median / r.variants.packed.hostMs.median, guestRatio: r.variants.selective.guestMs.median / r.variants.packed.guestMs.median, wireRatio: r.variants.selective.wireBytes.mean / r.variants.packed.wireBytes.mean }));
const pass = r => r.hostRatio <= 1.10 && r.guestRatio <= 1.10 && r.wireRatio <= 1;
assert.deepEqual(hashes(), before);
write('decision.json', { comparisons, coldComparisons, steadyGatesPassed: comparisons.every(pass), coldGatesPassed: coldComparisons.every(pass), failedRows: [...comparisons, ...coldComparisons].filter(r => !pass(r)), defaultEnabled: false, sourceHashesUnchanged: true });
console.log('Output:', dir);
