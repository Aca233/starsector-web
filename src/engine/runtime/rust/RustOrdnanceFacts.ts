/** Completed native ordnance certificates + immutable source art. Pure read only. */
import { Vector2 } from '../../math/Vector2';
import { nativeMines, nativeMineSpec } from '../../extensions/NativeMines';
import type { Projectile, Beam, WeaponSpec } from '../../simulation/Weapon';
import type { RustBodyHandle, RustCoreSnapshot } from './RustCoreProtocol';
import type { RustCompiledContent } from './RustContentCompiler';
import type { RustPresentationFacts, RustProjectilePresentationValues } from './RustCombatPresentationFacts';
import type { RustSceneShipRead } from './RustScenePublication';
import { rustHandleKey } from './RustCombatPresentationData';
import { isImmutableMetadata } from '../../extensions/Immutable';
type ProjectileFact = RustPresentationFacts['ordnance']['projectiles'][number];
type BeamFact = RustPresentationFacts['ordnance']['beams'][number];
export interface RustOrdnanceFacts {
  readonly ordnance: RustPresentationFacts['ordnance'];
  readonly layers: Pick<RustPresentationFacts['visuals'], 'mines' | 'projectileVisuals' | 'projectileFlight' | 'projectilePrediction' | 'localMuzzles' | 'localParticles'>;
}
class Reader {
  constructor(private readonly values: readonly number[]|Float64Array,private at=0,private readonly end=values.length) {}
  number(): number { const n = this.at<this.end?this.values[this.at++]:undefined; if (!Number.isFinite(n)) throw Error('Invalid Rust ordnance number'); return n as number; }
  integer(max = 250_000): number { const n = this.number(); if (!Number.isSafeInteger(n) || n < 0 || n > max) throw Error('Invalid Rust ordnance integer'); return n; }
  flag(): boolean { return this.integer(1) === 1; }
  optional(): number | undefined { const present = this.flag(), n = this.number(); if (!present && n !== 0) throw Error('Noncanonical Rust ordnance optional'); return present ? n : undefined; }
  optionalFlag(): boolean | undefined { const present = this.flag(), value = this.flag(); if (!present && value) throw Error('Noncanonical Rust ordnance boolean'); return present ? value : undefined; }
  point(): Vector2 { return new Vector2(this.number(), this.number()); }
  handle(): RustBodyHandle { const slot = this.integer(0xffffffff), generation = this.integer(0xffffffff); if (!generation) throw Error('Invalid Rust ordnance generation'); return { slot, generation }; }
  skip(n: number): void { if (n > this.end - this.at) throw Error('Truncated Rust ordnance block'); for(let i=0;i<n;i++)this.number(); }
  record(n:number):Reader {
    if(n>this.end-this.at)throw Error('Truncated Rust ordnance block');
    // Generic array callers can have observable index readers. Retain the
    // original once-only sampled record before interpreting its fields.
    if(!ArrayBuffer.isView(this.values))return new Reader(Array.from({length:n},()=>this.number()));
    const start=this.at;this.skip(n);return new Reader(this.values,start,this.at);
  }
  count(stride = 1): number { const n = this.integer(); if (n > Math.floor((this.end - this.at) / stride)) throw Error('Truncated Rust ordnance collection'); return n; }
  text(): string { const codes = Array.from({ length: this.count() }, () => this.integer(65535)); let s = ''; for (let i = 0; i < codes.length; i++) { const c = codes[i]; if (c >= 0xd800 && c <= 0xdbff) { const next = codes[++i]; if (!(next >= 0xdc00 && next <= 0xdfff)) throw Error('Invalid Rust ordnance UTF16'); } else if (c >= 0xdc00 && c <= 0xdfff) throw Error('Invalid Rust ordnance UTF16'); } for (let i = 0; i < codes.length; i += 1024) s += String.fromCharCode(...codes.slice(i, i + 1024)); return s; }
  optionalText(): string | undefined { return this.flag() ? this.text() : undefined; }
  done(): void { if (this.at !== this.end) throw Error('Trailing Rust ordnance words'); }
}
function firstRows<T>(rows:readonly T[],key:(row:T)=>number):Map<number,T>{const map=new Map<number,T>();for(const row of rows){const id=key(row);if(!map.has(id))map.set(id,row);}return map;}
function ordnanceContentIndex(content:RustCompiledContent){
  const sources=new Map<number,typeof content.pending.generatedSources[number][]>();
  for(const source of content.pending.generatedSources){let rows=sources.get(source.id);if(!rows)sources.set(source.id,rows=[]);rows.push(source);}
  return {originals:new Map(content.entities.map(e=>[rustHandleKey(e.handle),e])),templates:new Map(content.dictionary.templates.map(t=>[t.key,t])),weapons:new Map(content.dictionary.weapons.map(w=>[w.key,w.spec])),sources};
}
const ordnanceContentIndexes=new WeakMap<RustCompiledContent,ReturnType<typeof ordnanceContentIndex>>();
const mounted = `id sourceShipId slotId isPlayer teamId specId pos prevPos ballisticTail prevBallisticTail vel baseDamage sourceDamageMultiplier sourceWeaponType spawnLocation empDamage damage damageType onHitEffect passThroughMissiles passThroughFighters passThroughFightersOnlyWhenDestroyed radius rangeRemaining totalRange elapsedTime color spawnType renderTargetIndicator visualSpawnType textureType textureScrollSpeed fadeTime pixelsPerTexel fringeColor coreColor glowColor hitGlowRadius glowRadius coreWidthMult movingRayMoveSpeed projSpriteUrl projLength projWidth barrelOffset isRocket isGuided eccmChance guidanceBonus targetShipId targetProjectileId facingRad flightTimeRemaining maxFlightTime missileLifecycleSpec armingTimeRemaining turnVelocityRad engineAcceleration missileDeceleration maxSpeed maxTurnRate maxTurnAcceleration engineFlameColor missileEngineVisualSpec missileTrailSpec missileExplosionVisualSpec projectileExplosionSpec isTwoStage mirv proximityFuse hitpoints maxHitpoints`.split(' ') as (keyof Projectile)[];
const system = `id sourceShipId isPlayer teamId specId pos prevPos vel facingRad damage baseDamage damageType sourceDamageMultiplier sourceWeaponType spawnLocation empDamage radius rangeRemaining totalRange elapsedTime color spawnType visualSpawnType renderTargetIndicator textureType textureScrollSpeed fadeTime pixelsPerTexel fringeColor coreColor glowColor hitGlowRadius glowRadius coreWidthMult projSpriteUrl projLength projWidth isRocket isGuided eccmChance guidanceBonus missileLifecycleSpec flightTimeRemaining maxFlightTime armingTimeRemaining engineAcceleration missileDeceleration maxSpeed maxTurnRate maxTurnAcceleration engineFlameColor missileEngineVisualSpec missileTrailSpec missileExplosionVisualSpec projectileExplosionSpec isTwoStage mirv proximityFuse hitpoints maxHitpoints onHitEffect passThroughMissiles passThroughFighters passThroughFightersOnlyWhenDestroyed`.split(' ') as (keyof Projectile)[];
const child = `id sourceShipId slotId isPlayer teamId specId pos prevPos vel baseDamage damage sourceDamageMultiplier sourceWeaponType spawnLocation damageType empDamage radius rangeRemaining totalRange elapsedTime color spawnType onHitEffect textureScrollSpeed fadeTime pixelsPerTexel fringeColor coreColor glowColor glowRadius hitGlowRadius projSpriteUrl projLength projWidth facingRad hitpoints maxHitpoints`.split(' ') as (keyof Projectile)[];
const mine = `id sourceShipId isPlayer teamId specId sourceWeaponType spawnLocation pos prevPos vel damage baseDamage damageType radius rangeRemaining totalRange elapsedTime color renderTargetIndicator isRocket isMine hitpoints maxHitpoints missileExplosionVisualSpec`.split(' ') as (keyof Projectile)[];
const beamBirth = `id sourceShipId slotId isPlayer teamId specId startPos endPos damagePerSec baseDamagePerSec empPerSec baseEmpPerSec damageType color duration maxDuration damageActive firingCycleId width visualMode beamEffect elapsedTime textureType textureScrollSpeed pixelsPerTexel fringeColor coreColor glowColor hitGlowRadius hitGlowBrightenDuration useGlowColorForHitGlow fringeScrollSpeedMult coreWidthMult darkCore darkFringeIter darkCoreIter`.split(' ') as (keyof Beam)[];
export function decodeRustOrdnanceFacts(words: readonly number[]|Float64Array, content: RustCompiledContent, snapshot: RustCoreSnapshot, ships: readonly RustSceneShipRead[]): RustOrdnanceFacts {
  if (words.length < 2 || words.length > 8_000_000 || !snapshot.world) throw Error('Invalid Rust ordnance publication');
  let index=ordnanceContentIndexes.get(content);if(!index){index=ordnanceContentIndex(content);if(isImmutableMetadata(content))ordnanceContentIndexes.set(content,index);}
  const {originals,templates,weapons,sources}=index;
  const identities = new Map(ships.map(s => [rustHandleKey(s.handle), s]));
  const projectileRows = new Map(snapshot.projectiles.map(r => [r[0], r])), beamRows = new Map(snapshot.beams.map(r => [r[0], r]));
  if (identities.size !== ships.length || projectileRows.size !== snapshot.projectiles.length || beamRows.size !== snapshot.beams.length) throw Error('Duplicate Rust ordnance identity');
  const owner = (h: RustBodyHandle) => { const s = identities.get(rustHandleKey(h)); if (!s) throw Error('Unknown Rust ordnance art owner'); return s; };
  const bindings = (h: RustBodyHandle) => { const s = owner(h), initial = originals.get(rustHandleKey(h)), template = templates.get(s.specKey); if (!initial && !template) throw Error('Unknown Rust ordnance art template'); return { ship: s, mounts: initial?.mounts ?? template!.mounts, sources: initial ? sources.get(initial.id)??[] : template!.generatedSources }; };
  const weapon = (key: string): WeaponSpec => { const w = weapons.get(key); if (!w) throw Error('Missing immutable Rust ordnance art'); return w; };
  const projectiles: ProjectileFact[] = [], beams: BeamFact[] = [], mines: RustOrdnanceFacts['layers']['mines'][number][] = [];
  const worldRows=firstRows(snapshot.world.projectiles,p=>p.values[0]),gravityRows=firstRows(snapshot.world.gravity?.projectiles??[],p=>p.values[0]),guidanceRows=firstRows(snapshot.guidance,p=>p.values[0]);
  const seenProjectiles=new Set<number>(),seenBeams=new Set<number>(),seenMines=new Set<number>();
  const block = new Reader(words); if (block.integer(1) !== 1) throw Error('Rust ordnance version'); const count = block.count(); let expected: number[] | undefined;
  for (let i = 0; i < count; i++) {
    const tag = block.integer(4), n = block.integer(8_000_000), d = block.record(n);
    if (tag === 1) { if (i !== 0 || expected) throw Error('Invalid Rust ordnance header'); expected = Array.from({ length: 3 }, () => d.integer()); for (let j = 0; j < 5; j++) if (d.flag()) throw Error('Unsupported native authority prediction layer'); }
    else if (!expected) throw Error('Missing Rust ordnance header');
    else if (tag === 2) {
      const serial = d.integer(0xffffffff), kind = d.integer(3), h = d.handle(), component = d.integer(0xffffffff), sid = d.integer(0xffffffff), category = d.integer(3), playerPresent = d.flag(), player = d.flag(), multiplier = d.number();
      const maxFlight = d.optional(), maxHitpoints = d.optional(), barrel = d.flag() ? d.point() : undefined, begun = d.flag(), impacted = d.flag(), resource = d.optionalText();
      const empResistance = d.optional(), spriteAlphaOverride = d.optional(), interceptOverride = d.optionalFlag(), inertialOverride = d.optionalFlag(), isFlare = d.flag(), decoyPresent = d.flag(), decoy = d.flag(), mote = d.flag() ? { age: d.number(), turnSign: d.number(), scanRemaining: d.number() } : undefined;
      const intercepts = d.flag(), isMine = d.flag(), fizzleAtRange = d.flag(), systemFuseSeconds = d.optional(), systemFadeInSeconds = d.optional(), systemExplosionSound = d.optionalText(), flareLife = d.optional(), flareMaxLife = d.optional(), angularVelocityRad = d.optional();
      const hits: string[] = []; const hitCount = d.count(4), hitKeys = new Set<string>();
      for (let j = 0; j < hitCount; j++) { const hitKind = d.integer(3), id = d.number(), generation = d.integer(0xffffffff), numeric = d.number(), key = `${hitKind}:${id}:${generation}`; if (!generation || hitKeys.has(key)) throw Error('Invalid Rust ordered hit identity'); hitKeys.add(key);
        const target = hitKind === 3 ? ships.find(s => s.id === id && s.handle.generation === generation) : undefined;
        if (hitKind === 3 && !target) throw Error('Unknown Rust ordered ship hit'); hits.push(hitKind === 0 ? 'projectile:' + numeric : hitKind === 1 ? 'terrain:asteroid:' + id : hitKind === 2 ? 'terrain:wreck:' + id : target!.stableId); }
      const targetProjectileId = d.optional();
      const row = projectileRows.get(serial), art = bindings(h); if (!row || seenProjectiles.has(serial)) throw Error('Missing/duplicate Rust projectile certificate');
      seenProjectiles.add(serial);
      if ((row[54] === 1) !== (targetProjectileId !== undefined) || row[54] === 1 && snapshot.projectiles.some(p => p[0] === row[55] && p[1] !== targetProjectileId)) throw Error('Invalid Rust projectile target identity certificate');
      let weaponKey: string, sourceSlotId: string | undefined;
      if (kind === 0) { const m = art.mounts.find(m => m.componentId === component); if (!m) throw Error('Unknown Rust projectile mount'); weaponKey = m.weaponKey; sourceSlotId = m.sourceSlotId; }
      else { const candidates = art.sources.filter(s => s.kind === (kind === 1 ? 'mirv-child' : kind === 2 ? 'system-resource' : 'mine')
        && (kind !== 1 || s.sourceSlotId === art.mounts.find(m => m.componentId === component)?.sourceSlotId)
        && (kind !== 2 || s.systemId === sid && weapon(s.weaponKey).id === resource)
        && (kind !== 3 || weapon(s.weaponKey).id === nativeMines[sid === 1 ? 'minelayer1' : 'minelayer2'].id));
        if (candidates.length !== 1 || kind === 3 && sid !== 1 && sid !== 2) throw Error('Ambiguous Rust generated projectile art'); weaponKey = candidates[0].weaponKey; sourceSlotId = candidates[0].sourceSlotId; }
      const w = weapon(weaponKey), present = new Set<keyof Projectile>([mounted, child, system, mine][kind]);
      const rocket = kind === 0 || kind === 2 ? w.isRocket || w.spawnType === 'MISSILE' : kind === 3 ? true : undefined;
      const hasSource = !rocket && !isFlare && ['BALLISTIC', 'BALLISTIC_AS_BEAM', 'PLASMA'].includes(w.spawnType ?? '') && (w.fadeTime ?? 0) > 0 && (w.spawnType === 'PLASMA' || (w.projLength ?? 0) > 0);
      if (hasSource) for (const key of ['sourceMoveSpeed', 'sourceVelocity', 'ballisticTail', 'prevBallisticTail', 'fadeProgress', 'prevFadeProgress', 'unfadedDamage', 'unfadedEmp'] as const) present.add(key);
      if (hasSource && begun) present.add('softFlux');
      if (rocket && w.missileLifecycleSpec && !isFlare && !isMine && !mote && systemFuseSeconds === undefined) { present.add('armedWhileFizzling'); present.add('missileRangeOrigin'); if (begun) present.add('prevFadeProgress'); }
      if (row[46] === 1) { for (const key of ['missileFizzleTime', 'flightTimeRemaining', 'isDisarmed', 'isGuided', 'targetShipId', 'targetProjectileId', 'unfadedDamage', 'unfadedEmp', 'fadeProgress'] as const) present.add(key); }
      if (row[49] === 1) present.add('collisionDisabled'); if (row[51] === 1) present.add('gravityDeflected'); if (row[39] === 1) present.add('softFlux'); if (impacted) present.add('didDamage');
      if (kind === 0 && w.gravityCoupling) present.add('gravityCoupling');
      if (kind === 2 && sourceSlotId !== undefined) present.add('slotId');
      if (barrel !== undefined) present.add('barrelOffset');
      if (hitCount) present.add('damagedTargetIds'); if (empResistance !== undefined) present.add('empResistance'); if (spriteAlphaOverride !== undefined) present.add('spriteAlphaOverride');
      if (interceptOverride !== undefined) present.add('interceptsMissiles'); if (inertialOverride !== undefined) present.add('inertialFlight'); if (isFlare) present.add('isFlare'); if (decoyPresent) present.add('isFighterDecoy'); if (mote) present.add('mote');
      if (systemFuseSeconds !== undefined) { present.add('systemFuseSeconds'); if (begun) present.add('fadeProgress'); } if (systemFadeInSeconds !== undefined) present.add('systemFadeInSeconds'); if (systemExplosionSound !== undefined) present.add('systemExplosionSound'); if (angularVelocityRad !== undefined) present.add('angularVelocityRad'); if (fizzleAtRange) present.add('fizzleAtRange');
      if (flareLife !== undefined) present.add('flareLife'); if (flareMaxLife !== undefined) present.add('flareMaxLife');
      const world = worldRows.get(serial)?.values; if (!world) throw Error('Missing native ordnance world certificate');
      const wr = new Reader(world); wr.skip(3); const screenHit = wr.flag(), worldCaptured = wr.flag(); wr.skip(2);
      for (const stride of [1, 1, 1, 2]) wr.skip(wr.count(stride) * stride);
      const blocked = wr.flag(); wr.skip(2); wr.flag(); wr.done();
      const gr = gravityRows.get(serial)?.values;
      let original = false, captured = worldCaptured, massDriver = false, well = false, hullExplosion = false;
      if (gr) { const r = new Reader(gr); r.skip(2); original = r.flag(); if (original) r.skip(3); const gravityCaptured = r.flag(); if (gravityCaptured) r.skip(2); captured ||= gravityCaptured;
        massDriver = r.flag(); r.flag(); hullExplosion = r.flag(); well = r.flag(); if (well) r.skip(5); r.done(); }
      if (screenHit) present.add('voidShieldHitRecorded'); if (blocked) present.add('voidShieldBlockedRoot'); if (original) present.add('gravityOriginalSourceShipId');
      if (captured) { for (const key of ['gravityCapturedBy', 'inertialFlight', 'engineAcceleration', 'maxSpeed', 'isGuided', 'targetShipId', 'targetProjectileId'] as const) present.add(key); }
      if (well) present.add('gravityWellBinding'); if (massDriver) present.add('gravityCoupling'); if (hullExplosion) present.add('isHullExplosion');
      const g = guidanceRows.get(serial)?.values; if (g?.[4] === 1) present.add('stageTriggered'); if (g?.[5] === 1) present.add('mirvSplitDistance');
      const presentation: RustProjectilePresentationValues = { targetProjectileId, interceptsMissiles: interceptOverride === undefined ? intercepts || undefined : interceptOverride, isMine: isMine || undefined, fizzleAtRange: fizzleAtRange || undefined,
        systemFuseSeconds, systemFadeInSeconds, systemExplosionSound, isFlare: isFlare || undefined, flareLife, flareMaxLife, isFighterDecoy: decoyPresent ? decoy : undefined,
        spriteAlphaOverride, visualSpawnType: w.visualSpawnType, movingRayMoveSpeed: w.spawnType === 'BALLISTIC_AS_BEAM' ? row[25] : undefined,
        barrelOffset: barrel ? { x: barrel.x, y: barrel.y } : undefined, sourceDamageMultiplier: kind === 3 ? undefined : multiplier, gravityCoupling: w.gravityCoupling,
        maxFlightTime: maxFlight, missileRangeOrigin: row[44] === 1 ? new Vector2(row[28], row[29]) : undefined, sourceWeaponType: ([undefined, 'BALLISTIC', 'ENERGY', 'MISSILE'] as const)[category],
        damagedTargetIds: hitCount ? hits : undefined, empResistance, inertialFlight: inertialOverride, angularVelocityRad,
        proximityExplosionSpec: undefined, flareBehavior: undefined, mote, maxHitpoints, maxSpeed: kind === 2 ? w.maxSpeed ?? w.projSpeed : w.maxSpeed ?? (rocket ? w.projSpeed : undefined), isRocket: rocket,
        isGuided: w.isGuided === undefined && row[50] === 0 && row[46] === 0 && !captured ? undefined : row[50] === 1,
        ballisticTail: w.spawnType === 'BALLISTIC' || hasSource ? new Vector2(row[30], row[31]) : undefined,
        prevBallisticTail: w.spawnType === 'BALLISTIC' || hasSource ? new Vector2(row[32], row[33]) : undefined,
        missileExplosionVisualSpec: kind === 3 ? { radius: nativeMineSpec(sid === 1 ? 'minelayer1' : 'minelayer2').explosionRadius,
          color: [...nativeMineSpec(sid === 1 ? 'minelayer1' : 'minelayer2').explosionColor] as [number, number, number, number] } : w.missileExplosionVisualSpec,
        color: kind === 1 ? [175, 210, 255] : [...w.color] };
      projectiles.push({ serial, weaponKey, sourceSlotId, isPlayer: playerPresent ? player : undefined, presentFields: [...present], presentation });
    } else if (tag === 3) {
      const serial = d.integer(0xffffffff), h = d.handle(), component = d.integer(0xffffffff), maxDuration = d.number(), scalePresent = d.flag(), scale = d.flag(), clock = d.flag(), surface = d.flag();
      const row = beamRows.get(serial), art = bindings(h), mount = art.mounts.find(m => m.componentId === component); if (!row || !mount || seenBeams.has(serial)) throw Error('Invalid Rust beam certificate');
      seenBeams.add(serial);
      const present = new Set<keyof Beam>(beamBirth);
      if (clock) { present.add('elapsedSinceDamage'); present.add('accumulatedBrightness'); } if (surface) { present.add('contactFxCooldown'); present.add('contactSoundCooldown'); }
      if (scalePresent) present.add('scaleGlowBasedOnDamageEffectiveness');
      // Real active-shot vs phase-only birth is explicitly retained by native.
      const activeBorn = d.flag(); if (activeBorn) { present.add('barrelOffset'); present.add('hasRecordedHit'); }
      const glowWritten = d.flag(), recordedWritten = d.flag(), pulseWritten = d.flag(); if (glowWritten) present.add('hitGlowSizeMult'); if (recordedWritten) present.add('hasRecordedHit'); if (pulseWritten) { present.add('contactFxCooldown'); present.add('contactSoundCooldown'); }
      const refreshed = d.flag(), resetCycle = d.flag(), barrelValue = d.flag(); if (refreshed) present.add('barrelOffset');
      const advanced = d.flag(), rayValue = d.flag(), sampled = d.flag(); if (advanced) for (const key of ['isHitting', 'brightness', 'rayEndPrevFrame', 'hitGlowBrightness', 'wasShortened', 'dpsDuration', 'damageMultiplier', 'contactSurface'] as const) present.add(key);
      if (resetCycle) for (const key of ['elapsedSinceDamage', 'accumulatedBrightness', 'dpsDuration', 'damageMultiplier', 'rayEndPrevFrame', 'hitGlowBrightness', 'hitGlowSizeMult', 'wasShortened', 'contactSurface', 'contactFxCooldown', 'contactSoundCooldown', 'hasRecordedHit'] as const) present.add(key);
      beams.push({ serial, weaponKey: mount.weaponKey, sourceSlotId: mount.sourceSlotId, maxDuration, scaleGlowBasedOnDamageEffectiveness: scalePresent ? scale : undefined, barrelValue, rayValue, empValue: sampled || weapon(mount.weaponKey).empPerSecond !== undefined, presentFields: [...present] });
    } else if (tag === 4) {
      const serial = d.integer(0xffffffff), id = d.number(), mineKind = d.integer(2), h = d.handle(), playerPresent = d.flag(), player = d.flag(), teamId = d.integer(0xffffffff), pos = d.point(), vel = d.point(), age = d.number(), fadeInSeconds = d.number(), rotation = d.number(), windupPlayed = d.flag(), detonatingTimer = d.number(), isDetonating = d.flag(), triggerRadius = d.number(), explosionRadius = d.number(), damage = d.number(), sourceDamageMultiplier = d.number(), life = d.number();
      if (!mineKind || !projectileRows.has(serial) || seenMines.has(id)) throw Error('Invalid Rust spatial mine'); seenMines.add(id);mines.push({ id, weaponId: mineKind === 1 ? 'minelayer1' : 'minelayer2', pos, vel, sourceShipId: owner(h).stableId, sourceIsPlayer: playerPresent ? player : undefined, teamId, age, fadeInSeconds, rotation, windupPlayed, detonatingTimer, isDetonating, triggerRadius, explosionRadius, damage, sourceDamageMultiplier, life });
    } else throw Error('Unknown Rust ordnance record'); d.done();
  }
  block.done(); if (!expected || expected.some((n, i) => n !== [projectiles.length, beams.length, mines.length][i]) || projectiles.length !== snapshot.projectiles.length || beams.length !== snapshot.beams.length) throw Error('Incomplete native Rust ordnance fullframe');
  return { ordnance: { projectiles, beams }, layers: { mines, projectileVisuals: undefined, projectileFlight: undefined, projectilePrediction: undefined, localMuzzles: [], localParticles: [] } };
}
