import { decodeBase64Bytes } from './Base64Bytes.mjs';
import { AnchoredProjectileReceiver, ANCHORED_VISUAL_LIMITS as L } from './AnchoredProjectileVisual.mjs';
import { decodeCombatState, COMBAT_STATE_MAX_BYTES } from './CriticalCombatState.mjs';
const bytes = value => value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : null;
const text = value => { const b = bytes(value); if (!b) throw Error('Invalid component bytes'); let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192)); return btoa(s); };
const read = (s, limit) => { if (typeof s !== 'string' || !s.length || s.length > Math.ceil(limit / 3) * 4 || s.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw Error('Invalid component upload'); const b = decodeBase64Bytes(s); if (b.length > limit) throw Error('Component upload budget'); return b; };
export class AuthorityComponentPublisher {
  constructor() { this.reset(); }
  reset() { this.matchId = null; this.key = null; }
  prepare(matchId, m) {
    if (this.matchId !== matchId) this.reset();
    if (m.type === 'combat-state') return { message: { type: 'component-publication', family: 'combat', matchId, tick: m.tick, data: text(m.data) }, commit() {} };
    if (m.type !== 'projectile-visual') throw Error('Unknown authority component');
    const p = m.publication;
    return { message: { type: 'component-publication', family: 'visual', matchId, tick: p.tick, time: p.time, key: p.key, baseTick: p.baseTick,
      ...(this.key !== p.key ? { baseline: text(p.baseline) } : {}), update: p.update ? text(p.update) : null },
      commit: () => { this.matchId = matchId; this.key = p.key; } };
  }
}
export class AuthorityComponentReceiver {
  constructor(matchId) { this.matchId = matchId; this.visual = new AnchoredProjectileReceiver(matchId); this.baseline = null; this.key = null; }
  receive(m) {
    if (m?.type !== 'component-publication' || m.matchId !== this.matchId || !Number.isSafeInteger(m.tick) || m.tick < 0) throw Error('Invalid component publication scope');
    if (m.family === 'combat') { const data = read(m.data, COMBAT_STATE_MAX_BYTES), frame = decodeCombatState(data); if (frame.tick !== m.tick) throw Error('Combat publication tick mismatch'); return { family: 'combat', data, frame }; }
    if (m.family !== 'visual') throw Error('Invalid component publication family');
    const baseline = m.baseline === undefined ? this.key === m.key ? this.baseline : null : read(m.baseline, L.baselineBytes);
    if (!baseline) throw Error('Missing authority visual baseline');
    let frame = this.visual.baseline(m.key, baseline);
    const update = m.update === null ? null : read(m.update, L.updateBytes);
    if (update) frame = this.visual.update(m.key, update);
    if (!frame || frame.tick !== m.tick || frame.time !== m.time || this.visual.stats().baselineTick !== m.baseTick) throw Error('Visual publication metadata mismatch');
    this.key = m.key; this.baseline = baseline;
    return { family: 'visual', publication: { key: m.key, tick: m.tick, time: m.time, baseTick: m.baseTick, baseline, update } };
  }
}
