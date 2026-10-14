import type { RustCoreSnapshot } from './RustCoreProtocol';
import type { RustPresentationFacts } from './RustCombatPresentationFacts';
import type { WeaponSpec, Projectile, Beam } from '../../simulation/Weapon';
import { Vector2 } from '../../math/Vector2';
import { RustPresentationReader as Reader } from './RustCombatPresentationData';
import type { RustBodyHandle } from './RustCoreProtocol';

const spawnTypes = [undefined, 'BALLISTIC', 'BALLISTIC_AS_BEAM', 'PLASMA', 'MISSILE'] as const;
const damageTypes = ['ENERGY', 'KINETIC', 'HIGH_EXPLOSIVE', 'FRAGMENTATION'] as const;
const vector = (r: Float64Array, i: number) => new Vector2(r[i], r[i + 1]);
export function rustPresentationOrdnance(snapshot: RustCoreSnapshot, facts: RustPresentationFacts,
  weapon: (key: string) => WeaponSpec, stableId: (id: number, generation?: number) => string,
  handleId: (handle: RustBodyHandle) => string): { projectiles: Projectile[]; beams: Beam[] } {
  if (!snapshot.world || snapshot.projectiles.length !== facts.ordnance.projectiles.length || snapshot.beams.length !== facts.ordnance.beams.length)
    throw Error('Rust ordnance presentation bindings differ');
  const projectileBindings = new Map(facts.ordnance.projectiles.map(p => [p.serial, p])), beamBindings = new Map(facts.ordnance.beams.map(b => [b.serial, b]));
  const guidance = new Map(snapshot.guidance.map(g => [g.values[0], g.values])), worlds = new Map(snapshot.world.projectiles.map(p => [p.values[0], p.values]));
  const gravityProjectiles = new Map(snapshot.world.gravity?.projectiles.map(p => [p.values[0], p.values])), beamWorlds = new Map(snapshot.world.beams.map(b => [b.values[0], b.values]));
  const projectiles = snapshot.projectiles.map(r => {
    const binding = projectileBindings.get(r[0]); if (!binding) throw Error('Missing Rust projectile source binding');
    const w = weapon(binding.weaponKey), g = guidance.get(r[0]);
    const world = worlds.get(r[0]); if (!world) throw Error('Missing Rust projectile world publication');
    const extra = new Reader(world); extra.skip(3); const screenHit = extra.flag(), captured = extra.flag(), captureHandle = { slot: extra.n(), generation: extra.n() };
    const damaged: string[] = [];
    const ordered = binding.presentation.damagedTargetIds ?? [];
    for (let i = extra.count(); i > 0; i--) { const serial = extra.n(), live = snapshot.projectiles.find(p => p[0] === serial);
      // A target may already be retired. The native ordered certificate retains
      // its real random ID; its numeric membership is checked by the publisher.
      if (live) damaged.push('projectile:' + live[1]); else if (!ordered.some(id => id.startsWith('projectile:'))) throw Error('Missing retired Rust interception identity'); }
    for (const prefix of ['terrain:asteroid:', 'terrain:wreck:']) for (let i = extra.count(); i > 0; i--) damaged.push(prefix + extra.n());
    for (let i = extra.count(); i > 0; i--) damaged.push(stableId(extra.n(), extra.n()));
    const blocked = extra.flag(), blockedId = extra.n(), blockedGeneration = extra.n(), fuseTriggered = extra.flag(); extra.finish();
    const hits = ordered;
    if (damaged.some(id => !hits.includes(id)))
      throw Error('Rust projectile completed hit identities differ from ordered presentation');
    const gravity = gravityProjectiles.get(r[0]);
    let original: string | undefined, gravityCaptured: string | undefined, well: Projectile['gravityWellBinding'], massDriver = false, hullExplosion = false;
    if (gravity) {
      const gr = new Reader(gravity); gr.skip(2);
      if (gr.flag()) { const id = gr.n(), h = { slot: gr.n(), generation: gr.n() }; original = stableId(id, h.generation);
        if (handleId(h) !== original) throw Error('Rust gravity original source binding differs'); }
      if (gr.flag()) gravityCaptured = handleId({ slot: gr.n(), generation: gr.n() });
      massDriver = gr.flag(); gr.flag(); hullExplosion = gr.flag();
      if (gr.flag()) well = { ownerId: handleId({ slot: gr.n(), generation: gr.n() }), serial: gr.n(), age: gr.n(), turn: gr.n() }; gr.finish();
    }
    if (captured) { const owner = handleId(captureHandle); if (gravityCaptured !== undefined && owner !== gravityCaptured) throw Error('Rust gravity capture identities differ'); gravityCaptured = owner; }
    const p: Projectile = { id: r[1], specId: w.id, sourceShipId: stableId(r[2]), slotId: binding.sourceSlotId, teamId: r[7],
      pos: vector(r, 12), prevPos: vector(r, 14), vel: vector(r, 16), facingRad: r[18], damage: r[19], empDamage: r[20], baseDamage: r[21],
      radius: r[11], rangeRemaining: r[22], totalRange: r[23], elapsedTime: r[24], color: [...w.color], spawnType: spawnTypes[r[8]], damageType: damageTypes[r[9]],
      ballisticTail: vector(r, 30), prevBallisticTail: vector(r, 32), sourceMoveSpeed: r[25], sourceVelocity: vector(r, 26), spawnLocation: vector(r, 28),
      fadeProgress: r[34], prevFadeProgress: r[35], unfadedDamage: r[36], unfadedEmp: r[37], didDamage: r[38] === 1, softFlux: r[39] === 1,
      flightTimeRemaining: r[40] === 1 ? r[41] : undefined, armingTimeRemaining: r[42] === 1 ? r[43] : undefined,
      armedWhileFizzling: r[44] === 1 ? r[45] === 1 : undefined, missileFizzleTime: r[46] === 1 ? r[47] : undefined,
      isDisarmed: r[48] === 1, collisionDisabled: r[49] === 1, isGuided: r[50] === 1, gravityDeflected: r[51] === 1,
      targetShipId: r[52] === 1 ? stableId(r[53]) : undefined, targetProjectileId: binding.presentation.targetProjectileId,
      isRocket: binding.presentation.isRocket, projSpriteUrl: w.projSpriteUrl, projLength: w.projLength, projWidth: w.projWidth,
      textureType: w.textureType, textureScrollSpeed: w.textureScrollSpeed, fadeTime: w.fadeTime, pixelsPerTexel: w.pixelsPerTexel,
      fringeColor: w.fringeColor ? [...w.fringeColor] : undefined, coreColor: w.coreColor ? [...w.coreColor] : undefined,
      glowColor: w.glowColor ? [...w.glowColor] : undefined, hitGlowRadius: w.hitGlowRadius, glowRadius: w.glowRadius, coreWidthMult: w.coreWidthMult,
      onHitEffect: w.onHitEffect, passThroughMissiles: w.passThroughMissiles,
      passThroughFighters: w.passThroughFighters, passThroughFightersOnlyWhenDestroyed: w.passThroughFightersOnlyWhenDestroyed,
      ...binding.presentation, voidShieldHitRecorded: screenHit, voidShieldBlockedRoot: blocked ? stableId(blockedId, blockedGeneration) : undefined,
      systemFuseTriggered: fuseTriggered, gravityOriginalSourceShipId: original, gravityCapturedBy: gravityCaptured, gravityWellBinding: well,
      gravityCoupling: massDriver ? 'MASS_DRIVER' : binding.presentation.gravityCoupling, isHullExplosion: hullExplosion,
      inertialFlight: captured ? true : binding.presentation.inertialFlight, renderTargetIndicator: w.renderTargetIndicator,
      missileEngineVisualSpec: w.missileEngineVisualSpec, missileTrailSpec: w.missileTrailSpec, missileExplosionVisualSpec: binding.presentation.missileExplosionVisualSpec,
      turnVelocityRad: g?.[1] ?? 0, hitpoints: g?.[2] === 1 ? g[3] : world[1] === 1 ? world[2] : undefined,
      stageTriggered: g?.[4] === 1, mirvSplitDistance: g?.[5] === 1 ? g[6] : undefined,
      isPlayer: binding.isPlayer,
      sourceWeaponType: binding.presentation.sourceWeaponType, eccmChance: w.eccmChanceBonus, guidanceBonus: w.missileGuidanceBonus,
      missileLifecycleSpec: w.missileLifecycleSpec, engineAcceleration: captured ? 0 : w.engineAcceleration, missileDeceleration: w.missileDeceleration,
      maxSpeed: captured ? undefined : binding.presentation.maxSpeed, maxTurnRate: w.maxTurnRate,
      maxTurnAcceleration: w.maxTurnAcceleration, engineFlameColor: w.engineFlameColor, projectileExplosionSpec: w.projectileExplosionSpec,
      isTwoStage: w.isTwoStage, mirv: w.mirv, proximityFuse: w.proximityFuse, maxHitpoints: binding.presentation.maxHitpoints,
    };
    if (g?.[12] === 1) { p.flareLife = g[14]; p.flareFizzling = g[13] === 1; }
    const present = new Set(binding.presentFields); const result: Partial<Projectile> = {}; for (const key of Object.keys(p) as (keyof Projectile)[]) if (present.has(key)) result[key] = p[key] as never;
    for (const key of present) if (!Object.hasOwn(result, key)) throw Error('Unsupported Rust projectile presentation field: ' + key);
    return result as Projectile;
  });
  const beams = snapshot.beams.map(r => {
    const binding = beamBindings.get(r[0]); if (!binding) throw Error('Missing Rust beam source binding');
    const w = weapon(binding.weaponKey), v = beamWorlds.get(r[0]); if (!v) throw Error('Missing Rust beam world publication');
    const b: Beam = { id: r[1], sourceShipId: stableId(r[2]), slotId: binding.sourceSlotId, specId: w.id, teamId: r[7], isPlayer: v[1] === 1 ? v[2] === 1 : undefined,
      startPos: vector(r, 8), endPos: vector(r, 10), rayEndPrevFrame: binding.rayValue === false ? undefined : vector(r, 12), barrelOffset: binding.barrelValue === false ? undefined : { x: r[14], y: r[15] }, elapsedTime: r[16],
      duration: r[17], maxDuration: binding.maxDuration, damagePerSec: r[18], empPerSec: binding.empValue === false ? undefined : r[19], brightness: r[20], damageActive: r[21] === 1,
      isHitting: r[22] === 1, elapsedSinceDamage: r[23] === 1 ? r[24] : undefined, accumulatedBrightness: r[25], dpsDuration: r[26], damageMultiplier: r[27],
      firingCycleId: r[6], baseDamagePerSec: v[3], hitGlowRadius: w.hitGlowRadius, hitGlowBrightenDuration: w.hitGlowBrightenDuration, hasRecordedHit: v[6] === 1, wasShortened: v[7] === 1,
      hitGlowBrightness: v[8], hitGlowSizeMult: v[9], contactSurface: v[10] === 1 ? v[11] === 1 ? 'SHIELD' : 'HULL' : undefined,
      contactFxCooldown: v[12], contactSoundCooldown: v[13], baseEmpPerSec: w.empPerSecond, width: v[15],
      fringeColor: w.fringeColor ? [...w.fringeColor] : undefined, coreColor: w.coreColor ? [...w.coreColor] : undefined,
      color: [...w.color], damageType: w.type, beamEffect: w.beamEffect, visualMode: w.beamVisualMode,
      textureType: w.textureType, textureScrollSpeed: w.textureScrollSpeed, pixelsPerTexel: w.pixelsPerTexel,
      glowColor: w.glowColor ? [...w.glowColor] : undefined, useGlowColorForHitGlow: w.useGlowColorForHitGlow,
      fringeScrollSpeedMult: w.fringeScrollSpeedMult, coreWidthMult: w.coreWidthMult, darkCore: w.darkCore, darkFringeIter: w.darkFringeIter, darkCoreIter: w.darkCoreIter,
      scaleGlowBasedOnDamageEffectiveness: binding.scaleGlowBasedOnDamageEffectiveness,
    };
    const present = new Set(binding.presentFields); const result: Partial<Beam> = {}; for (const key of Object.keys(b) as (keyof Beam)[]) if (present.has(key)) result[key] = b[key] as never;
    for (const key of present) if (!Object.hasOwn(result, key)) throw Error('Unsupported Rust beam presentation field: ' + key);
    return result as Beam;
  });
  return { projectiles, beams };
}
