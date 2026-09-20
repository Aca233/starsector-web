// Offline codec experiment only. No protocol/production-policy change.
// Byte-exact restoration via the existing receiver, with bounded candidate
// matchers derived from the current source. Compressed sizes include SLD1.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { crc32, deflateRawSync, constants } from 'node:zlib';
import { createLanBytePatch, encodeLanPacket, LanDeltaReceiver } from '../src/network/LanBinaryDelta.mjs';
import { decodeBinaryState } from '../src/network/BinarySnapshot.mjs';
const folder = process.argv[2] ?? 'artifacts/lan-delta-20260919/frames32';
const output = process.argv[3] ?? 'artifacts/network-latency-phase4-20260920/matchers.json';
const source = fs.readFileSync(new URL('../src/network/LanBinaryDelta.mjs', import.meta.url), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8'));
const frames = manifest.rows.map(row => {
  const bytes = fs.readFileSync(path.join(folder, row.name));
  return { bytes, seq: decodeBinaryState(bytes).seq, crc: crc32(bytes) };
});
const variants = [{ name: '16-byte/stride4 (production)', patch: createLanBytePatch }];
for (const [minimum, stride] of [[16, 8], [8, 8], [8, 4]]) {
  const start = source.indexOf('export function createLanBytePatch('), end = source.indexOf('export function encodeLanPacket(', start);
  assert.ok(start >= 0 && end > start);
  let body = source.slice(start, end).replace(/i \+= [48]\)/, `i += ${stride})`);
  if (minimum === 8) body = body.replace('i + 8, true)', 'i + 4, true)').replaceAll('i + 16 <=', 'i + 8 <=').replaceAll('n < 16', 'n < 8').replace('length >= 16', 'length >= 8');
  const candidate = source.slice(0, start) + body + source.slice(end);
  const mod = await import('data:text/javascript;base64,' + Buffer.from(candidate).toString('base64'));
  variants.push({ name: `${minimum}-byte/stride${stride}`, patch: mod.createLanBytePatch });
}
const stat = xs => { const s = xs.toSorted((a, b) => a - b); return { mean: s.reduce((a, b) => a + b, 0) / s.length, p95: s[Math.floor(s.length * .95)] }; };
function replay(variant) {
  const receiver = new LanDeltaReceiver(), times = [], sizes = [], restores = []; let base = null;
  for (const frame of frames) {
    const start = performance.now(), patch = base && variant.patch(base.bytes, frame.bytes), encoded = encodeLanPacket(frame, base, patch, true);
    times.push(performance.now() - start);
    const before = performance.now(), restored = receiver.decode(encoded); restores.push(performance.now() - before);
    assert.deepEqual(restored, new Uint8Array(frame.bytes));
    sizes.push(deflateRawSync(encoded, { level: 1, memLevel: 7, finishFlush: constants.Z_SYNC_FLUSH }).length - 4); base = frame;
  }
  return { name: variant.name, compressedBytes: stat(sizes), encodeMs: stat(times), restoreMs: stat(restores) };
}
for (const variant of variants) replay(variant);
const rounds = [];
for (const order of [variants, variants.toReversed()]) for (const variant of order) { const result = replay(variant); rounds.push(result); console.log(JSON.stringify(result)); }
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ scope: 'Offline lossless codec size/CPU experiment over same 32-ship recording; NOT network Hz/latency; production is labeled explicitly; other matcher variants are offline only', rounds }, null, 2));
