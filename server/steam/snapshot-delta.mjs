import { createHash } from 'node:crypto';
// This is lossless transport compression of validated, complete presentation
// states. Physics, capture frequency and the browser's full-frame contract stay
// unchanged. Oversized/deep states retain the original full-message path.
export const DELTA_MAX_BYTES = 512 * 1024;
export const DELTA_MAX_NODES = 65536;
const MAX_DEPTH = 96, KEYFRAME_MS = 1000, MAX_KEYFRAME_MS = 10000;
const own = (value, key) => Object.hasOwn(value, key);
const uint = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const digest = text => createHash('sha256').update(text).digest('hex');
const invalid = () => { throw Error('无效 Steam 状态差分'); };
function inspect(value, budget = { nodes: 0, strings: 0 }, depth = 0) {
  if (++budget.nodes > DELTA_MAX_NODES || depth > MAX_DEPTH) invalid();
  if (typeof value === 'string') { budget.strings += Buffer.byteLength(value); if (budget.strings > DELTA_MAX_BYTES) invalid(); return; }
  if (value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return;
  if (!value || typeof value !== 'object') invalid();
  if (Array.isArray(value)) { for (const item of value) inspect(item, budget, depth + 1); return; }
  for (const key of Object.keys(value)) { budget.strings += Buffer.byteLength(key); if (budget.strings > DELTA_MAX_BYTES) invalid(); inspect(value[key], budget, depth + 1); }
}
function isState(value) {
  return object(value) && value.type === 'state' && typeof value.matchId === 'string'
    && Number.isSafeInteger(value.seq) && value.seq >= 0 && object(value.frame)
    && Number.isSafeInteger(value.frame.tick) && value.frame.tick >= 0;
}
// null = unchanged; [0,value] = replace; [1,length,index,patch,...] = array;
// [2,changes,optionalOrderedKeys] = object. Ordered keys preserve JSON key order,
// not just deep equality. No coercion, float quantization, deletion heuristics or
// mutating shared baselines. Structural identity includes arrays and null.
export function createStateDelta(a, b, depth = 0) {
  if (depth > MAX_DEPTH) invalid();
  if (a === b) return null;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return [0, b];
  if (Array.isArray(b)) {
    const result = [1, b.length];
    for (let i = 0; i < b.length; i++) { const change = createStateDelta(a[i], b[i], depth + 1); if (change !== null) result.push(i, change); }
    return result.length === 2 && a.length === b.length ? null : result;
  }
  const before = Object.keys(a), keys = Object.keys(b), same = before.length === keys.length && before.every((key, i) => key === keys[i]);
  const changes = Object.create(null); let count = 0;
  for (const key of keys) { const change = createStateDelta(own(a, key) ? a[key] : undefined, b[key], depth + 1); if (change !== null) { changes[key] = change; count++; } }
  return !count && same ? null : same ? [2, changes] : [2, changes, keys];
}
export function applyStateDelta(base, change, depth = 0, budget = { operations: 0 }) {
  if (++budget.operations > DELTA_MAX_NODES || depth > MAX_DEPTH) invalid();
  if (change === null) { if (base === undefined) invalid(); return base; }
  if (!Array.isArray(change)) invalid();
  if (change[0] === 0) { if (change.length !== 2 || change[1] === undefined) invalid(); return change[1]; }
  if (change[0] === 1) {
    if (!Array.isArray(base) || change.length < 2 || change.length % 2 || !uint(change[1]) || change[1] > DELTA_MAX_NODES) invalid();
    const length = change[1]; let last = -1, appended = base.length;
    // Validate all indices before allocating/copying. No duplicate/reordered
    // edits, sparse extension, giant length or repeated subtree amplification.
    for (let i = 2; i < change.length; i += 2) {
      const index = change[i];
      if (!uint(index) || index <= last || index >= length) invalid();
      if (index >= base.length && index !== appended++) invalid();
      last = index;
    }
    if (length > base.length && appended !== length) invalid();
    const result = base.slice(0, length);
    for (let i = 2; i < change.length; i += 2) result[change[i]] = applyStateDelta(base[change[i]], change[i + 1], depth + 1, budget);
    return result;
  }
  if (change[0] !== 2 || !object(base) || (change.length !== 2 && change.length !== 3) || !object(change[1])) invalid();
  const keys = change.length === 3 ? change[2] : Object.keys(base);
  if (!Array.isArray(keys) || keys.length > DELTA_MAX_NODES || keys.some(key => typeof key !== 'string')) invalid();
  const keySet = new Set(keys); if (keySet.size !== keys.length) invalid();
  for (const key of Object.keys(change[1])) if (!keySet.has(key)) invalid();
  const result = {};
  for (const key of keys) {
    if (!own(change[1], key) && !own(base, key)) invalid();
    const value = own(change[1], key) ? applyStateDelta(own(base, key) ? base[key] : undefined, change[1][key], depth + 1, budget) : base[key];
    // Never invoke Object.prototype.__proto__ setters. JSON-looking keys are data.
    Object.defineProperty(result, key, { value, enumerable: true, writable: true, configurable: true });
  }
  return result;
}
/** One current preparation per gateway; streams retain only their LAST sent
 * baseline. Shared peers reuse the parse/hash/full compression and identical
 * delta preparation. No map of every in-flight parsed world is retained. */
export class SteamSnapshotEncoder {
  constructor() { this.current = null; this.sequence = 0; }
  clear() { this.current = null; }
  prepare(text, codec) {
    if (this.current?.text === text) return this.current;
    this.current = null;
    if (Buffer.byteLength(text) > DELTA_MAX_BYTES) return null;
    const value = JSON.parse(text);
    if (!isState(value)) return null;
    try { inspect(value); } catch { return null; }
    const canonical = JSON.stringify(value), size = Buffer.byteLength(canonical);
    if (size > DELTA_MAX_BYTES) return null;
    const token = this.sequence = (this.sequence + 1) >>> 0;
    const hash = digest(canonical);
    const envelope = { type: 'steam-state', v: 1, token, base: null, size, hash, body: value };
    const full = codec.prepare('data', JSON.stringify(envelope));
    return this.current = { text, value, token, size, hash, full, deltas: new WeakMap() };
  }
}
export class SteamSnapshotSender {
  constructor() { this.fullStates = 0; this.deltaStates = 0; this.legacyStates = 0; this.savedBytes = 0; this.reset(); }
  reset() { this.base = null; this.fullAt = -Infinity; this.deltaBytesSinceFull = 0; }
  diagnostics() { return { fullStates: this.fullStates, deltaStates: this.deltaStates, legacyStates: this.legacyStates, savedBytes: this.savedBytes, baselineBytes: this.base?.size ?? 0 }; }
  prepare(text, encoder, codec, now = Date.now()) {
    const target = encoder.prepare(text, codec);
    if (!target) return { prepared: codec.prepare('data', text), target: null, delta: false, now };
    let prepared = target.full, delta = false;
    // Reliable deltas validate the whole target and explicitly request a full
    // state on a missing base. A fixed 1s checkpoint otherwise consumes most of
    // a slow/shared uplink, eventually forcing EVERY low-rate state to be full.
    // Keep routine checkpoint cost near <=20% of bytes, with a 10s ceiling.
    // New connection/match/reset still sends a full state immediately.
    const age = now - this.fullAt;
    const checkpoint = age >= MAX_KEYFRAME_MS || age >= KEYFRAME_MS && this.deltaBytesSinceFull >= target.full.payload.length * 4;
    if (this.base && this.base.token !== target.token && this.base.value.matchId === target.value.matchId && !checkpoint) {
      let candidate = target.deltas.get(this.base.value);
      if (candidate === undefined) {
        const body = createStateDelta(this.base.value, target.value);
        // Patch metadata adds nodes and depth even when both states fit. Match
        // the receiver's pre-apply budget or send a full frame instead.
        try {
          inspect(body);
          const wire = JSON.stringify({ type: 'steam-state', v: 1, token: target.token, base: this.base.token, size: target.size, hash: target.hash, body });
          candidate = Buffer.byteLength(wire) <= DELTA_MAX_BYTES ? codec.prepare('data', wire) : null;
        } catch { candidate = null; }
        // Some changes cost MORE as patches. Full frames remain the fallback.
        if (candidate && candidate.payload.length + 128 >= target.full.payload.length) candidate = null;
        target.deltas.set(this.base.value, candidate);
      }
      if (candidate) { prepared = candidate; delta = true; }
    }
    return { prepared, target, delta, now };
  }
  // Only commit AFTER every native fragment was accepted. A skipped/failed send
  // must never become the next frame's baseline.
  commit(choice) {
    if (!choice.target) { this.legacyStates++; this.reset(); return; }
    this.base = { value: choice.target.value, token: choice.target.token, size: choice.target.size };
    if (choice.delta) { this.deltaBytesSinceFull += choice.prepared.payload.length; this.deltaStates++; this.savedBytes += choice.target.full.payload.length - choice.prepared.payload.length; }
    else { this.fullStates++; this.fullAt = choice.now; this.deltaBytesSinceFull = 0; }
  }
}
export class SteamSnapshotReceiver {
  constructor() { this.base = null; this.fullStates = 0; this.deltaStates = 0; this.misses = 0; }
  diagnostics() { return { fullStates: this.fullStates, deltaStates: this.deltaStates, misses: this.misses, baselineBytes: this.base?.size ?? 0 }; }
  receive(envelope) {
    if (envelope?.type !== 'steam-state') { if (envelope?.type === 'state') this.base = null; return { data: envelope, needsFull: false }; }
    if (envelope.v !== 1 || !uint(envelope.token) || !(envelope.base === null || uint(envelope.base)) || !uint(envelope.size)
      || envelope.size < 1 || envelope.size > DELTA_MAX_BYTES || typeof envelope.hash !== 'string' || !/^[a-f0-9]{64}$/.test(envelope.hash)) invalid();
    if (envelope.base !== null && this.base?.token !== envelope.base) {
      this.base = null; this.misses++; return { data: null, needsFull: true };
    }
    // Inspect the patch BEFORE applying it, then the reconstructed target. Both
    // trees are bounded; unique indices/keys prevent copying one large subtree
    // an attacker-selected number of times. Never trust the declared size alone.
    inspect(envelope.body);
    const value = envelope.base === null ? envelope.body : applyStateDelta(this.base.value, envelope.body);
    inspect(value);
    if (!isState(value)) invalid();
    const canonical = JSON.stringify(value), size = Buffer.byteLength(canonical);
    if (size !== envelope.size || digest(canonical) !== envelope.hash) invalid();
    this.base = { token: envelope.token, value, size };
    if (envelope.base === null) this.fullStates++; else this.deltaStates++;
    return { data: value, needsFull: false };
  }
}
