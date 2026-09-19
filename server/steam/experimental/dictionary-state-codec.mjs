// OFFLINE CANDIDATE ONLY. No production imports or negotiated wire capability.
// Reuse LAN's SWF2 key dictionary WITHOUT float planes, quantization or schema
// pruning. packedState is used only by the explicit isolated model substitution;
// existing Sockets receivers reject SKD1. Never send this to default/old peers.
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { SteamPacketCodec } from '../packet-codec.mjs';
import { encodeProjectedBinaryFrame, decodeBinaryFrame } from '../../../src/network/BinarySnapshot.mjs';
import { KEY_DICTIONARY } from '../../../src/network/KeyDictionary.mjs';

export const DICTIONARY_STATE_MAX = 512 * 1024 + 4096;
const HEADER = 24, MAX_NODES = 65536, MAX_DEPTH = 96;
const dictionaryId = createHash('sha256').update(JSON.stringify(KEY_DICTIONARY)).digest().subarray(0, 16);
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
if (KEY_DICTIONARY.length > 128 || new Set(KEY_DICTIONARY).size !== KEY_DICTIONARY.length || KEY_DICTIONARY.some(k => forbidden.has(k))) throw Error('Unsupported LAN dictionary');
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const invalid = () => { throw Error('Invalid experimental Steam dictionary state'); };
const finite = n => { if (!Number.isFinite(n) || Object.is(n, -0)) invalid(); };

// Scan BEFORE LAN's general decoder allocates containers. Unlike LAN, Steam has
// tighter node/depth limits. Integer dictionary keys are allowed ONLY in map-key
// position and ONLY as the known positive fixint codes produced by SWF2.
function preflight(input) {
  if (!Buffer.isBuffer(input) || input.length < 5 || input.length > DICTIONARY_STATE_MAX || input.toString('ascii', 0, 4) !== 'SWF2') invalid();
  let at = 4, nodes = 0, pending = 1;
  const take = n => { if (n > input.length - at) invalid(); const p = at; at += n; return p; };
  const length = width => { const p = take(width); return width === 1 ? input[p] : width === 2 ? input.readUInt16BE(p) : input.readUInt32BE(p); };
  function visit(depth, key = false) {
    if (depth > MAX_DEPTH || ++nodes > MAX_NODES) invalid();
    pending--; const tag = input[take(1)];
    let size = null;
    if (tag >= 0xa0 && tag <= 0xbf) size = tag & 31;
    else if (tag === 0xd9 || tag === 0xda || tag === 0xdb) size = length(tag === 0xd9 ? 1 : tag === 0xda ? 2 : 4);
    if (size !== null) {
      const p = take(size), s = utf8.decode(input.subarray(p, p + size));
      // LAN's legacy long-string decoder strips a leading BOM. Keep these rare
      // strings in JSON rather than inheriting a lossy text interpretation.
      if (s.startsWith('\ufeff') || key && forbidden.has(s)) invalid();
      return;
    }
    if (key) { if (tag < 0x80 && tag < KEY_DICTIONARY.length) return; invalid(); }
    if (tag < 0x80 || tag >= 0xe0 || tag === 0xc0 || tag === 0xc2 || tag === 0xc3) return;
    let children = null, map = false;
    if (tag >= 0x90 && tag <= 0x9f) children = tag & 15;
    else if (tag >= 0x80 && tag <= 0x8f) { children = (tag & 15) * 2; map = true; }
    else if (tag === 0xdc || tag === 0xdd) children = length(tag === 0xdc ? 2 : 4);
    else if (tag === 0xde || tag === 0xdf) { children = length(tag === 0xde ? 2 : 4) * 2; map = true; }
    if (children !== null) {
      pending += children;
      if (nodes + pending > MAX_NODES || pending > input.length - at) invalid();
      for (let i = 0; i < children; i++) visit(depth + 1, map && i % 2 === 0);
      return;
    }
    if (tag === 0xca) { finite(input.readFloatBE(take(4))); return; }
    if (tag === 0xcb) { finite(input.readDoubleBE(take(8))); return; }
    if (tag === 0xcc || tag === 0xd0) { take(1); return; }
    if (tag === 0xcd || tag === 0xd1) { take(2); return; }
    if (tag === 0xce || tag === 0xd2) { take(4); return; }
    if (tag === 0xcf || tag === 0xd3) {
      const p = take(8), n = tag === 0xcf ? input.readBigUInt64BE(p) : input.readBigInt64BE(p);
      if (n < BigInt(Number.MIN_SAFE_INTEGER) || n > BigInt(Number.MAX_SAFE_INTEGER)) invalid();
      return;
    }
    invalid();
  }
  visit(0);
  if (at !== input.length || pending !== 0) invalid();
}

export function packDictionaryState(text) {
  if (typeof text !== 'string' || !text.length || Buffer.byteLength(text) > DICTIONARY_STATE_MAX) invalid();
  const value = JSON.parse(text);
  if (JSON.stringify(value) !== text) invalid();
  const bytes = encodeProjectedBinaryFrame(value);
  if (!bytes || HEADER + bytes.length > DICTIONARY_STATE_MAX) invalid();
  const message = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  preflight(message);
  const packed = Buffer.alloc(HEADER + message.length);
  packed.write('SKD1', 0, 'ascii'); packed.writeUInt32LE(Buffer.byteLength(text), 4);
  dictionaryId.copy(packed, 8); message.copy(packed, HEADER);
  return packed;
}
export function unpackDictionaryState(packed) {
  if (!Buffer.isBuffer(packed) || packed.length < HEADER + 5 || packed.length > DICTIONARY_STATE_MAX || packed.toString('ascii', 0, 4) !== 'SKD1') invalid();
  const jsonBytes = packed.readUInt32LE(4);
  if (!jsonBytes || jsonBytes > DICTIONARY_STATE_MAX || !packed.subarray(8, 24).equals(dictionaryId)) invalid();
  const message = packed.subarray(HEADER);
  preflight(message);
  const value = decodeBinaryFrame(message);
  if (Buffer.byteLength(JSON.stringify(value)) !== jsonBytes) invalid();
  return value;
}

export class SteamDictionaryStateCodec extends SteamPacketCodec {
  constructor() { super(); this.dictionaryCache = null; this.dictionaryPreparations = 0; }
  prepare(op, value) {
    const original = super.prepare(op, value);
    if (op !== 'data' || !original.raw.startsWith('{"type":"steam-state",')) return original;
    if (this.dictionaryCache?.original === original) return this.dictionaryCache.prepared;
    let prepared = original;
    try {
      const packed = packDictionaryState(original.raw), payload = deflateRawSync(packed, { level: 1 });
      this.dictionaryPreparations++;
      // Match the current packed candidate's >=16-byte saving policy and JSON
      // fallback. Comparing against SMF1 is the BENCHMARK's job, not this cache.
      if (payload.length + 16 < original.payload.length) prepared = {
        raw: original.raw, payload, rawBytes: packed.length, zipped: true,
        packedState: true, dictionaryState: true,
      };
    } catch { /* Keep the original full JSON, including unsupported key/string data. */ }
    this.dictionaryCache = { original, prepared }; return prepared;
  }
  encode() { throw Error('Dictionary candidate requires a new negotiated protocol; offline prepare only'); }
  frame() { throw Error('Dictionary candidate cannot use legacy SWSP framing'); }
  clear() { super.clear(); this.dictionaryCache = null; }
}
