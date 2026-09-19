// Offline full-envelope-only candidate. Keep the current SMF1 codec for delta
// envelopes; use LAN dictionary only for complete envelopes from the unchanged
// SteamSnapshotEncoder. No new float-plane pass is added to the dictionary path.
// This format combination is NOT negotiated by the production wire capability.
import { SteamSocketStateCodec, unpackSocketState } from '../sockets-state-codec.mjs';
import { SteamDictionaryStateCodec, unpackDictionaryState } from './dictionary-state-codec.mjs';
const fullPrefix = /^\{"type":"steam-state","v":1,"token":\d+,"base":null,/;
export class SteamAnchorDictionaryCodec extends SteamSocketStateCodec {
  constructor() { super(); this.anchorCodec = new SteamDictionaryStateCodec(); }
  prepare(op, value) {
    // The producer has this exact canonical prefix. Other caller layouts stay
    // on the old codec rather than parsing the whole tree for a routing hint.
    const raw = op === 'data' && typeof value === 'string' ? value : JSON.stringify(value);
    if (op === 'data' && typeof raw === 'string' && fullPrefix.test(raw)) return this.anchorCodec.prepare(op, raw);
    return super.prepare(op, value);
  }
  encode() { throw Error('Anchor dictionary requires a new negotiated capability; offline prepare only'); }
  frame() { throw Error('Anchor dictionary cannot use legacy SWSP framing'); }
  clear() { super.clear(); this.anchorCodec.clear(); }
}
export function unpackAnchorDictionaryState(packed) {
  return Buffer.isBuffer(packed) && packed.toString('ascii', 0, 4) === 'SKD1' ? unpackDictionaryState(packed) : unpackSocketState(packed);
}
