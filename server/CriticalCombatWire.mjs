import { combatByteReference, prepareCombatSpatialReference, applyCombatSpatialReference, COMBAT_SPATIAL_MAX_BYTES } from './CriticalCombatReference.mjs';
import { deflateRawSync, inflateRawSync, crc32 } from 'node:zlib';
import { COMBAT_STATE_MAX_BYTES, encodeCombatState, decodeCombatState } from '../src/network/CriticalCombatState.mjs';
const text = new TextDecoder('utf-8', { fatal: true });
export const COMBAT_WIRE_MAGIC = 0x53434c31;
const zip = bytes => { const z = deflateRawSync(bytes, {level:1}); return z.length < bytes.length ? {payload:z,compressed:true} : {payload:bytes,compressed:false}; };
export function prepareCombatState(value) {
  const bytes = Buffer.from(value), frame = decodeCombatState(bytes);
  return { hasWeapons: frame.weapons !== undefined, core: null, tick: frame.tick, bytes, rawBytes: bytes.length, crc: crc32(bytes), ...zip(bytes), cache:new Map() };
}
/** Lazily retain ONE HP-only fallback. No weapon failure can suppress core health. */
export function coreCombatTarget(target) {
  if (!target.hasWeapons) return target;
  return target.core ??= prepareCombatState(encodeCombatState({ ...decodeCombatState(target.bytes), weapons: undefined }));
}
export function encodeCombatEnvelope(target, matchId, syncId, variant = target) {
  if ((variant.predicted || variant.spatial) && !variant.delta) throw Error('Combat reference requires delta');
  const scope = [matchId, syncId].map(s => {
    if (typeof s !== 'string' || !s) throw Error('Invalid combat scope'); const b = Buffer.from(s);
    if (b.length > 256 || text.decode(b) !== s) throw Error('Invalid combat scope'); return b;
  });
  const out = Buffer.alloc(40 + scope[0].length + scope[1].length + variant.payload.length);
  if (out.length > 16384) throw Error('Oversized combat envelope');
  out.writeUInt32BE(COMBAT_WIRE_MAGIC); out[4] = +variant.compressed | (variant.delta ? 2 : 0) | (variant.predicted ? 4 : 0) | (variant.spatial ? 8 : 0);
  out.writeUInt16BE(scope[0].length, 6); out.writeUInt16BE(scope[1].length, 8);
  out.writeUInt32BE(target.rawBytes, 12); out.writeUInt32BE(target.crc, 16); out.writeDoubleBE(target.tick, 20);
  out.writeDoubleBE(variant.baseTick ?? 0, 28); out.writeUInt32BE(variant.baseCrc ?? 0, 36);
  scope[0].copy(out, 40); scope[1].copy(out, 40 + scope[0].length); variant.payload.copy(out, 40 + scope[0].length + scope[1].length);
  return out;
}
// Read scope before inflation; retired packets release only their original debt.
export function readCombatEnvelope(value) {
  const b = Buffer.from(value);
  if (b.length <= 42 || b.length > 16384 || b.readUInt32BE(0) !== COMBAT_WIRE_MAGIC || b[4] > 15 || (b[4] & 12) && !(b[4] & 2) || b[5] || b[10] || b[11]) throw Error('Invalid combat envelope');
  const m = b.readUInt16BE(6), s = b.readUInt16BE(8), rawBytes = b.readUInt32BE(12);
  if (!m || !s || m > 256 || s > 256 || 40 + m + s >= b.length || rawBytes < 22 || rawBytes > COMBAT_STATE_MAX_BYTES) throw Error('Invalid combat envelope bounds');
  const tick = b.readDoubleBE(20), baseTick = b.readDoubleBE(28), baseCrc = b.readUInt32BE(36), delta = !!(b[4] & 2);
  if (!Number.isSafeInteger(tick) || tick < 0 || !Number.isSafeInteger(baseTick) || baseTick < 0 || (delta ? baseTick >= tick : baseTick !== 0 || baseCrc !== 0)) throw Error('Invalid combat tick');
  return { tick, baseTick, baseCrc, delta, predicted:!!(b[4]&4), spatial:!!(b[4]&8), matchId:text.decode(b.subarray(40,40+m)), syncId:text.decode(b.subarray(40+m,40+m+s)), data:b.subarray(40+m+s), compressed:!!(b[4]&1), rawBytes, crc:b.readUInt32BE(16) };
}
function decodeBytes(envelope, base) {
  let b = envelope.compressed ? inflateRawSync(envelope.data, {maxOutputLength:envelope.rawBytes + (envelope.spatial ? COMBAT_SPATIAL_MAX_BYTES : 0)}) : Buffer.from(envelope.data);
  if ((envelope.spatial || envelope.predicted) && !envelope.delta) throw Error('Combat reference requires delta');
  let anchors = null;
  if (envelope.spatial) {
    const length = 1 + b[0] * 9;
    if (!b[0] || length > COMBAT_SPATIAL_MAX_BYTES || b.length !== envelope.rawBytes + length) throw Error('Invalid combat angle payload');
    anchors = b.subarray(0, length); b = b.subarray(length);
  }
  if (b.length !== envelope.rawBytes) throw Error('Invalid combat length');
  if (envelope.delta) {
    if (!base || base.tick !== envelope.baseTick || base.crc !== envelope.baseCrc || base.bytes.length !== b.length) throw Error('Missing combat wire base');
    let reference = envelope.predicted ? combatByteReference(base, base.previous, envelope.tick) : base.bytes;
    if (!reference || reference.length !== b.length) throw Error('Missing combat prediction reference');
    if (anchors) reference = applyCombatSpatialReference(reference, anchors);
    // Inflation creates new bytes; no mutation of either retained reference.
    for (let i=0;i<b.length;i++) b[i] ^= reference[i];
  }
  if (crc32(b) !== envelope.crc) throw Error('Invalid combat content');
  if (decodeCombatState(b).tick !== envelope.tick) throw Error('Combat tick mismatch');
  return b;
}
const message = (e,b) => ({type:'combat-state',matchId:e.matchId,syncId:e.syncId,tick:e.tick,data:b.toString('base64')});
export function decodeCombatEnvelope(envelope) { return message(envelope,decodeBytes(envelope,null)); }
/** Reliable ordered helper WS byte bases, NOT application/world baselines.
 * Two raw bases per endpoint (one shallow previous); at most two shared XOR builds per publication. */
export class CombatWireSender {
  constructor() { this.reset(); this.full=0; this.delta=0; this.predicted=0; this.spatial=0; }
  reset() { this.base=null; this.matchId=this.syncId=null; this.generation=(this.generation??0)+1; }
  prepare(target, matchId, syncId) {
    const base=this.base;let variant=target;
    if (base && this.matchId===matchId && this.syncId===syncId && base.tick<target.tick && base.bytes.length===target.bytes.length) {
      const key=`${base.tick}:${base.crc}:${base.previous?.tick??-1}:${base.previous?.crc??0}`,cached=target.cache.get(key);
      if (cached) variant=cached;
      else if (target.cache.size<2) {
        const residual = reference => {
          const bytes = Buffer.allocUnsafe(target.bytes.length);
          for (let i = 0; i < bytes.length; i++) bytes[i] = target.bytes[i] ^ reference[i];
          return bytes;
        };
        let z=zip(residual(base.bytes)),predicted=false,spatial=false;
        const reference=target.hasWeapons?combatByteReference(base,base.previous,target.tick):null;
        if(reference){
          const candidate=zip(residual(reference));
          if(candidate.payload.length+32<z.payload.length){z=candidate;predicted=true;}
        }
        const correlated=target.hasWeapons?prepareCombatSpatialReference(reference??base.bytes,target.bytes):null;
        if(correlated && correlated.bytes.length===target.bytes.length){
          const candidate=zip(Buffer.concat([correlated.anchors,residual(correlated.bytes)]));
          if(candidate.payload.length+32<z.payload.length){z=candidate;predicted=!!reference;spatial=true;}
        }
        variant=z.payload.length<target.payload.length?{...z,delta:true,predicted,spatial,baseTick:base.tick,baseCrc:base.crc}:target;
        // Cache bytes/metadata only, never an old target/base object/history.
        target.cache.set(key,variant===target?{payload:target.payload,compressed:target.compressed}:variant);
      }
    }
    return {generation:this.generation,data:encodeCombatEnvelope(target,matchId,syncId,variant),target,expected:base,matchId,syncId,delta:!!variant.delta,predicted:!!variant.predicted,spatial:!!variant.spatial};
  }
  commit(choice) {
    if (this.generation!==choice.generation || this.base!==choice.expected) return false;
    this.base={bytes:choice.target.bytes,tick:choice.target.tick,crc:choice.target.crc,previous:this.base && this.matchId===choice.matchId && this.syncId===choice.syncId?{bytes:this.base.bytes,tick:this.base.tick,crc:this.base.crc}:null};this.matchId=choice.matchId;this.syncId=choice.syncId;
    if(choice.delta)this.delta++;else this.full++;if(choice.predicted)this.predicted++;if(choice.spatial)this.spatial++;return true;
  }
}
export class CombatWireReceiver {
  constructor() { this.reset(); }
  reset() { this.base=null; this.matchId=this.syncId=null; }
  decode(e) {
    const base=this.matchId===e.matchId&&this.syncId===e.syncId?this.base:null;
    if (base && e.tick <= base.tick) throw Error("Replayed combat wire tick");
    const b=decodeBytes(e,base),result=message(e,b);
    this.base={bytes:b,tick:e.tick,crc:e.crc,previous:base?{bytes:base.bytes,tick:base.tick,crc:base.crc}:null};this.matchId=e.matchId;this.syncId=e.syncId;return result;
  }
}
