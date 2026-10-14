/** Pure full retained visual decoder. No rules, clocks, content sampling or RNG. */
import { Vector2 } from '../../math/Vector2';
import { DEBRIS_TEXTURES } from '../../assets/CombatFXAssets';
import { ADUN_FX } from '../../visual/AdunFXAssets';
import { ARK_IMPACT_FX } from '../../visual/ArkWeaponFX';
import type { Particle, ContrailParticle, DebrisParticle, ExplosionAnimation, HitGlowAnimation, MovingRayFade, MuzzleFlash, MuzzleParticle, ShieldRipple } from '../../simulation/CombatTypes';
import type { RustPresentationFacts, RustPresentationShipFact } from './RustCombatPresentationFacts';
import type { CombatAudioEvent } from '../../audio/CombatAudioEvents';
import type { RustBodyHandle } from './RustCoreProtocol';
export interface RustVisualFrame {
  readonly visuals: Pick<RustPresentationFacts['visuals'], 'particles' | 'contrails' | 'debris' | 'explosions' | 'hitGlows' | 'movingRayFades' | 'empArcs' | 'muzzleFlashes' | 'muzzleParticles' | 'shieldRipples' | 'trailStrips'>;
  readonly ships: readonly (Pick<RustPresentationShipFact, 'handle' | 'phaseGhosts' | 'engineBoostLevel' | 'previousEngineBoostLevel' | 'surfaceFeedback' | 'shieldHitSegmentLevels'>)[];
  readonly audio: RustPresentationFacts['audio']; readonly cameraShakeIntensity: number;
}
class Reader {
  private index = 0;
  constructor(private readonly words: readonly number[] | Float64Array) {}
  number(): number { const n = this.words[this.index++]; if (!Number.isFinite(n)) throw Error('Invalid Rust visual number'); return n; }
  integer(max = 250_000): number { const n = this.number(); if (!Number.isSafeInteger(n) || n < 0 || n > max) throw Error('Invalid Rust visual integer'); return n; }
  collection(stride: number, max = 250_000): number { const n = this.integer(max); if (n > Math.floor((this.words.length - this.index) / stride)) throw Error('Truncated Rust visual collection'); return n; }
  take(n: number): readonly number[] | Float64Array { if (n > this.words.length - this.index) throw Error('Truncated Rust visual record'); const start=this.index;for(let i=0;i<n;i++)this.number();return this.words instanceof Float64Array?this.words.subarray(start,this.index):this.words.slice(start,this.index); }
  flag(): boolean { return !!this.integer(1); }
  optional(): number | undefined { const present = this.flag(), value = this.number(); if (!present && value !== 0) throw Error('Noncanonical Rust visual optional'); return present ? value : undefined; }
  string(): string { const n = this.collection(1, 65_536), codes = Array.from({ length: n }, () => this.integer(65_535));
    for (let i = 0; i < n; i++) { const c = codes[i]; if (c >= 0xd800 && c <= 0xdbff) { const next = codes[++i]; if (!(next >= 0xdc00 && next <= 0xdfff)) throw Error('Invalid Rust visual UTF16'); } else if (c >= 0xdc00 && c <= 0xdfff) throw Error('Invalid Rust visual UTF16'); }
    let s = ''; for (let i = 0; i < n; i += 1024) s += String.fromCharCode(...codes.slice(i, i + 1024)); return s; }
  optionalString(): string | undefined { return this.flag() ? this.string() : undefined; }
  vector(): Vector2 { return new Vector2(this.number(), this.number()); }
  position(): [number, number] { return [this.number(), this.number()]; }
  color(): [number, number, number] { return [this.number(), this.number(), this.number()]; }
  rgba(): [number, number, number, number] { return [...this.color(), this.number()]; }
  points(): Vector2[] { return Array.from({ length: this.collection(2) }, () => this.vector()); }
  handle(): RustBodyHandle { const slot = this.integer(0xffffffff), generation = this.integer(0xffffffff); if (!generation) throw Error('Invalid Rust visual generation'); return { slot, generation }; }
  done(): void { if (this.index !== this.words.length) throw Error('Trailing Rust visual words'); }
}
export function decodeRustVisualFrame(words: readonly number[] | Float64Array): RustVisualFrame {
  if (words.length < 2 || words.length > 8_000_000) throw Error('Rust visual budget');
  const r = new Reader(words); if (r.integer(1) !== 1) throw Error('Rust visual version'); const count = r.integer();
  const particles: Particle[] = [], contrails: ContrailParticle[] = [], debris: DebrisParticle[] = [], explosions: ExplosionAnimation[] = [], hitGlows: HitGlowAnimation[] = [], movingRayFades: MovingRayFade[] = [];
  const empArcs: RustVisualFrame['visuals']['empArcs'][number][] = [], muzzleFlashes: MuzzleFlash[] = [], muzzleParticles: MuzzleParticle[] = [], shieldRipples: ShieldRipple[] = [], trailStrips: RustVisualFrame['visuals']['trailStrips'][number][] = [];
  const ships: RustVisualFrame['ships'][number][] = [], events: CombatAudioEvent[] = [];
  let sequence = -1, shake = 0, expected: number[] | undefined;
  for (let i = 0; i < count; i++) {
    const tag = r.integer(14), n = r.integer(8_000_000), d = new Reader(r.take(n));
    if (tag === 1) { if (i !== 0 || expected) throw Error('Rust visual header order'); sequence = d.integer(Number.MAX_SAFE_INTEGER); shake = d.number(); expected = Array.from({ length: 13 }, () => d.integer()); }
    else if (!expected) throw Error('Missing Rust visual header');
    else if (tag === 2) { const p: Particle = { pos: d.vector(), vel: d.vector(), life: d.number(), maxLife: d.number(), size: d.number(), color: d.color(), alpha: d.number() };
      const material = d.integer(4); if (material) p.material = (['GLOW', 'SPARK', 'SMOKE', 'SOURCE_SMOOTH'] as const)[material - 1];
      const fields = ['startSize', 'endSize', 'peakAlpha', 'rampUpFraction', 'fadeOutFraction', 'drag', 'rotation', 'angularVel', 'stretch'] as const;
      for (const field of fields) { const v = d.optional(); if (v !== undefined) p[field] = v; } if (d.optional() !== undefined || d.optional() !== undefined) throw Error('Unknown Rust particle field'); particles.push(p); }
    else if (tag === 3) contrails.push({ pos: d.vector(), vel: d.vector(), life: d.number(), maxLife: d.number(), size: d.number(), maxSize: d.number(), alpha: d.number(), rotation: d.number(), color: d.color() });
    else if (tag === 4) { const p: DebrisParticle = { pos: d.vector(), vel: d.vector(), rotation: d.number(), angularVel: d.number(), size: d.number(), life: d.number(), maxLife: d.number(), color: d.color(), points: [] };
      const category = d.integer(2), texture = d.integer(3), glowing = d.flag(), list = [DEBRIS_TEXTURES.small, DEBRIS_TEXTURES.medium, DEBRIS_TEXTURES.large][category]; if (!list[texture]) throw Error('Invalid Rust debris texture'); p.spriteUrl = list[texture]; p.isGlowing = glowing; debris.push(p); }
    else if (tag === 5) { const id = d.number(), kind = d.integer(3), source = d.optionalString(), sourcePresent = d.flag(), authored = d.optional(); if (kind < 1 || source !== undefined && !sourcePresent || authored !== undefined && authored !== 0 && authored !== 1) throw Error('Invalid Rust explosion metadata');
      const p: ExplosionAnimation = { id, visualKind: (['impact', 'missile', 'ship'] as const)[kind - 1], pos: d.vector(), radius: d.number(), maxRadius: d.number(), life: d.number(), maxLife: d.number(), frame: d.integer(6), rotation: d.number(), color: d.color(), hasShockwaveRing: d.flag(), shockwaveRadius: d.number(), maxShockwaveRadius: d.number() };
      if (sourcePresent) p.sourceShipId = source; if (authored !== undefined) p.sourceAuthored = !!authored;
      if (d.flag()) p.puffs = Array.from({ length: d.collection(8) }, () => ({ offset: d.vector(), velocity: d.vector(), startSize: d.number(), endSize: d.number(), texture: d.integer(3) as 0 | 1 | 2 | 3, rotation: d.number() }));
      const puffDuration = d.optional(); if (puffDuration !== undefined) p.puffDuration = puffDuration;
      if (d.flag()) { const diameter = d.number(), coreDiameter = d.optional(), color = d.color(), duration = d.number(), velocity = d.vector(); p.flash = { diameter, color, duration, velocity }; if (kind === 3 || coreDiameter !== undefined) p.flash.coreDiameter = coreDiameter; }
      if (kind === 3) p.flare = undefined;
      if (d.flag()) p.flare = { width: d.number(), height: d.number(), color: d.color(), velocity: d.vector() }; explosions.push(p); }
    else if (tag === 6) { const p: HitGlowAnimation = { id: d.number(), pos: d.vector(), vel: d.vector(), diameter: d.number(), life: d.number(), maxLife: d.number(), peakAlpha: d.number(), color: d.color() }; const custom = d.integer(3); if (custom) p.spriteUrl = custom === 1 ? ADUN_FX.impact : ARK_IMPACT_FX; hitGlows.push(p); }
    else if (tag === 7) { const id = d.number(), headPos = d.vector(), tailPos = d.vector(), direction = d.vector(), moveSpeed = d.number(), life = d.number(), maxLife = d.number(), elapsedTime = d.number(), maxPulseLength = d.number(), width = d.number(), texture = d.integer(2); if (texture === 2) throw Error('Unsupported Rust ray texture');
      if (texture > 1) throw Error('Unsupported Rust ray texture');
      movingRayFades.push({ id, headPos, tailPos, direction, moveSpeed, life, maxLife, elapsedTime, maxPulseLength, width, textureType: texture === 1 ? 'SMOOTH' : 'ROUGH', textureScrollSpeed: d.number(), pixelsPerTexel: d.number(), fringeColor: d.rgba(), coreColor: d.rgba() }); }
    else if (tag === 8) { const p = { startPos: d.vector(), endPos: d.vector(), life: d.number(), maxLife: d.number(), thickness: d.number(), coreColor: d.color(), glowColor: d.color(), segments: d.points(), branches: Array.from({ length: d.collection(2) }, () => ({ segments: d.points(), thickness: d.number() })),
      native: undefined as RustVisualFrame['visuals']['empArcs'][number]['native'] };
      if (d.flag()) p.native = { anchor: d.handle(), fromLocal: d.vector(), toLocal: d.vector(), points: d.points(), length: d.number(), fringe: d.rgba(), core: d.rgba(), period: d.number(), elapsed: d.number(), level: d.number(), peak: d.number(), brightness: d.number() };
      else delete (p as { native?: typeof p.native }).native; empArcs.push(p); }
    else if (tag === 9) { const id = d.number(), owner = d.optionalString(), spec = d.optionalString(); const p: MuzzleFlash = { id, pos: d.vector(), angleRad: d.number(), size: d.number(), color: d.color(), life: d.number(), maxLife: d.number() }; if (owner !== undefined) p.underHullShipId = owner; if (spec !== undefined) p.specId = spec; muzzleFlashes.push(p); }
    else if (tag === 10) { const owner = d.optionalString(), p: MuzzleParticle = { pos: d.vector(), vel: d.vector(), size: d.number(), life: d.number(), maxLife: d.number(), color: d.rgba() }; const normal = d.optional(); if (normal !== undefined) { if (normal !== 0 && normal !== 1) throw Error('Invalid Rust muzzle blend'); p.blendMode = normal ? 'NORMAL' : 'ADDITIVE'; } if (owner !== undefined) p.underHullShipId = owner; muzzleParticles.push(p); }
    else if (tag === 11) shieldRipples.push({ pos: d.vector(), radius: d.number(), maxRadius: d.number(), life: d.number(), maxLife: d.number(), color: d.color() });
    else if (tag === 12) { const text = d.flag(), stripId = text ? d.string() : d.number(), color = d.rgba(), blendMode = d.flag() ? 'GLOW' as const : 'NORMAL' as const, widenMult = d.number(), minSeg = d.number(), isDetached = d.flag(), accumU = d.number();
      if (trailStrips.some(t => t.stripId === stripId)) throw Error('Duplicate Rust ribbon'); trailStrips.push({ stripId, color, blendMode, widenMult, minSeg, isDetached, accumU, points: Array.from({ length: d.collection(8) }, () => ({ pos: d.vector(), age: d.number(), duration: d.number(), baseWidth: d.number(), currentWidth: d.number(), u: d.number(), alpha: d.number() })) }); }
    else if (tag === 13) { const handle = d.handle(), engineBoostLevel = d.number(), previousEngineBoostLevel = d.number(), phaseGhosts = Array.from({ length: d.collection(3, 7) }, () => ({ pos: d.vector(), facingRad: d.number(), alpha: 1, life: 1, maxLife: 1 }));
      if (ships.some(s => s.handle.slot === handle.slot && s.handle.generation === handle.generation)) throw Error('Duplicate Rust ship visual'); const surfaceFeedback = d.flag() ? { mode: (['ORDER', 'SEALED', 'WAITING'] as const)[d.integer(2)], level: d.number(), progress: d.number() } : undefined;
      if (!d.flag()) throw Error('Missing Rust shield visual owner'); const shieldHitSegmentLevels = new Float32Array(Array.from({ length: d.collection(1) }, () => d.number())); ships.push({ handle, engineBoostLevel, previousEngineBoostLevel, phaseGhosts, surfaceFeedback, shieldHitSegmentLevels }); }
    else if (tag === 14) { const kind = d.integer(2); if (kind === 0) { const key = d.string(), volume = d.number(), rate = d.number(); const e: Extract<CombatAudioEvent, { kind: 'play' }> = { kind: 'play', key, volume, rate }; if (!key) throw Error('Empty Rust audio key'); if (d.flag()) e.position = d.position(); if (d.flag()) e.listener = d.position(); const max = d.optional(); if (max !== undefined) e.maxDistance = max; events.push(e); }
      else if (kind === 1) { const key = d.string(); if (!key) throw Error('Empty Rust loop key'); events.push({ kind: 'loop', key, volume: d.number(), active: d.flag() }); } else events.push({ kind: 'muffled', value: d.flag() }); }
    else throw Error('Unknown Rust visual tag'); d.done();
  }
  r.done(); const actual = [particles, contrails, debris, explosions, hitGlows, movingRayFades, empArcs, muzzleFlashes, muzzleParticles, shieldRipples, trailStrips, ships, events];
  if (!expected || expected.some((n, i) => actual[i].length !== n)) throw Error('Incomplete Rust visual publication');
  return { visuals: { particles, contrails, debris, explosions, hitGlows, movingRayFades, empArcs, muzzleFlashes, muzzleParticles, shieldRipples, trailStrips }, ships, audio: { sequence, events }, cameraShakeIntensity: shake };
}
