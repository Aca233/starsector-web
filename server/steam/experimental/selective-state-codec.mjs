// OFFLINE CANDIDATE, not a negotiated production format. Default prepare is
// byte-for-byte the existing SMF1/JSON path. Trial dictionary encoding only AFTER
// the sender has selected a full envelope, and never increase its wire cost.
import { deflateRawSync } from 'node:zlib';
import { SteamSocketStateCodec, unpackSocketState } from '../sockets-state-codec.mjs';
import { packDictionaryState, unpackDictionaryState } from './dictionary-state-codec.mjs';
const fullPrefix = /^\{"type":"steam-state","v":1,"token":\d+,"base":null,/;
const wireBytes = p => p.payload.length + 64 * Math.ceil(p.payload.length / 8192);
let dictionaryDecoded = 0, packedDecoded = 0;
export function readSelectiveDecodes() { return { dictionaryDecoded, packedDecoded }; }
export function unpackSelectiveState(packed) {
  if (Buffer.isBuffer(packed) && packed.toString('ascii', 0, 4) === 'SKD1') {
    const value = unpackDictionaryState(packed); dictionaryDecoded++; return value;
  }
  const value = unpackSocketState(packed); packedDecoded++; return value;
}
export class SteamSelectiveStateCodec extends SteamSocketStateCodec {
  #selection = null;
  #stats = { attempts: 0, cacheHits: 0, selected: 0, keptBaseline: 0, ineligible: 0, savedWireBytes: 0 };
  selectFull(reference) {
    if (!reference || typeof reference.raw !== 'string' || !fullPrefix.test(reference.raw)) {
      this.#stats.ineligible++; return reference;
    }
    if (this.#selection?.reference === reference) { this.#stats.cacheHits++; return this.#selection.prepared; }
    this.#stats.attempts++;
    let prepared = reference;
    try {
      const bytes = packDictionaryState(reference.raw), payload = deflateRawSync(bytes, { level: 1 });
      const candidate = { raw: reference.raw, payload, rawBytes: bytes.length, zipped: true, packedState: true, dictionaryState: true };
      // Compare against the ACTUAL current SMF1-or-JSON winner, not JSON alone.
      // Both payload and total application wire cost must improve, with the
      // same >16-byte margin. Include fragment headers; never use raw size.
      if (payload.length < reference.payload.length && wireBytes(candidate) + 16 < wireBytes(reference)) {
        prepared = candidate; this.#stats.selected++; this.#stats.savedWireBytes += wireBytes(reference) - wireBytes(candidate);
      }
    } catch { /* Unsupported/over-budget data preserves the exact old prepared. */ }
    if (prepared === reference) this.#stats.keptBaseline++;
    this.#selection = { reference, prepared }; return prepared;
  }
  selectionDiagnostics() { return { ...this.#stats, cached: this.#selection !== null }; }
  clear() { super.clear(); this.#selection = null; }
  encode() { throw Error('Selective format requires a new negotiated capability; offline prepare only'); }
  frame() { throw Error('Selective format cannot use legacy SWSP framing'); }
}
