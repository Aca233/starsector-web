import type { Ship } from '../../simulation/Ship';
import type { WeaponMount, WeaponSpec } from '../../simulation/Weapon';
import { ShipWeaponControlSystem } from '../../simulation/systems/ShipWeaponControlSystem';
import { nativeSampledAutofireReaders, type AutofireController } from '../../ai/AutofireController';
import { contentRegistry } from '../../content/ContentRegistry';
import { hullModRangeBaseFlat, hullModRangePercent, hullModRangeMultiplier, hullModRangeFlat,
  hullModRangeThresholdStats, fighterWeaponRangeFlat } from '../../extensions/HullMods';
import { FireHint } from '../../ai/batch/FireProtocol';
import { WeaponFlag } from '../../ai/batch/StageProtocol';
import { HYPERION_HULLMODS, HYPERION_HULL_ID, HYPERION_PROJECTILE_ID } from '../../content/HyperionIds';
import { GLORIANA_BUILTINS } from '../../content/GlorianaBuiltins';
import { ARK_HULLMODS, arkOwner } from '../../content/AdunArkIds';
import { ROCINANTE_MODS } from '../../content/RocinanteIds';
import { GRAVITY_SYSTEM_IDS } from '../../content/GravityIds';
import { adunWeaponFxScale } from '../../visual/AdunFXAssets';
import { arkWeaponFxProfile } from '../../visual/ArkWeaponFX';
import { moduleOffset } from '../../content/ModuleGeometry';
import { i18n } from '../../i18n/LocalizationManager';
import type { RustArmorStats, RustDeliverySpec, RustDeliveryWorldSpec, RustEngineMotionStats,
  RustExplosionSpec, RustFireSpec, RustFireQueryMount, RustGravitySystemConfig, RustGravityMountConfig,
  RustSystemKind, RustSystemWorldConfig, RustWorldShipConfig } from './RustCoreProtocol';

/** The numeric rule mapping is separate from the definition identity certificate. */
export const rustSystemKinds: Readonly<Record<string, keyof typeof RustSystemKind>> = Object.freeze({
  NONE: 'NONE', WEB_ZHUYUAN_ECLIPSE_PROTOCOL: 'ECLIPSE', WEB_GLORIANA_BROADSIDE_EDICT: 'EDICT',
  WEB_SC2_HYPERION_YAMATO: 'YAMATO', WEB_SC2_HYPERION_JUMP: 'JUMP', WEB_ADUN_ARK_FORGE: 'ARK_FORGE',
  WEB_ADUN_ARK_BARRIER: 'ARK_BARRIER', WEB_ADUN_ARK_REPAIR: 'ARK_REPAIR',
  WEB_ROCINANTE_ATTITUDE: 'ROC_ATTITUDE', WEB_ROCINANTE_FIRE_CONTROL: 'ROC_FIRE',
  WEB_ZHEFENG_COMMUTATOR: 'ZHEFENG', WEB_GRAVITY_WELL: 'GRAVITY_WELL', WEB_GRAVITY_BATTLE_WELL: 'GRAVITY_BATTLE_WELL',
  ...Object.fromEntries(Object.values(GRAVITY_SYSTEM_IDS).filter(id => id !== GRAVITY_SYSTEM_IDS.well && id !== GRAVITY_SYSTEM_IDS.battleWell)
    .map(id => [id, 'GRAVITY_OTHER'])),
});

export function rustExplosion(spec: NonNullable<WeaponSpec['projectileExplosionSpec']>): RustExplosionSpec {
  const collision: Record<string, RustExplosionSpec['collision']> = { HITS_SHIPS_AND_ASTEROIDS: 'SHIPS_AND_ASTEROIDS',
    MISSILE_FF: 'MISSILE_FF', MISSILE_NO_FF: 'MISSILE_NO_FF', PROJECTILE_FF: 'PROJECTILE_FF', PROJECTILE_NO_FF: 'PROJECTILE_NO_FF' };
  return { radius: spec.radius, core: spec.coreRadius, duration: spec.duration, minimumFraction: spec.minDamageFraction ?? 0,
    collision: collision[spec.collisionClass] ?? 'OTHER', noFriendlyFire: spec.collisionClass.endsWith('_NO_FF') };
}

const effectCodes: Readonly<Record<string, NonNullable<RustDeliverySpec['effect']>>> = Object.freeze({
  'com.fs.starfarer.api.impl.combat.TachyonLanceEffect': 'Tachyon', 'com.fs.starfarer.api.impl.combat.GravitonBeamEffect': 'Graviton',
  'com.fs.starfarer.api.impl.combat.SabotOnHitEffect': 'Sabot', 'com.fs.starfarer.api.impl.combat.MoteOnHitEffect': 'Mote',
  web_sc2_hyperion_yamato_impact: 'HyperionYamato', web_gloriana_siege_impact: 'GlorianaSiege',
});
export function rustWeaponEffect(id: string): NonNullable<RustDeliverySpec['effect']> | undefined { return effectCodes[id]; }

export function rustDeliveryWorld(spec: WeaponSpec, mounted = true): RustDeliveryWorldSpec {
  const missile = spec.missileExplosionVisualSpec;
  return { explosion: spec.projectileExplosionSpec ? rustExplosion(spec.projectileExplosionSpec) : undefined,
    batchShipContacts: spec.id !== 'lightmg',
    passMissiles: spec.passThroughMissiles, passFighters: spec.passThroughFighters, gravityCoupling: mounted ? spec.gravityCoupling : undefined,
    passFightersDestroyed: spec.passThroughFightersOnlyWhenDestroyed, hitpoints: spec.missileHp,
    terrainPenetration: spec.terrainPenetration ? [spec.terrainPenetration.maxRadius, spec.terrainPenetration.minDamageCost,
      spec.terrainPenetration.wreckDamagePerRadius] : undefined,
    fuse: spec.proximityFuse ? { range: spec.proximityFuse.range, radius: spec.proximityFuse.explosionRadius,
      core: spec.proximityFuse.coreRadius, sourceExplosion: spec.projectileExplosionSpec ? rustExplosion(spec.projectileExplosionSpec) : undefined } : undefined,
    beamHitRadius: spec.hitGlowRadius, beamHitBrighten: spec.hitGlowBrightenDuration,
    visual: { hitGlowRadius: spec.hitGlowRadius ?? 0, width: spec.isBeam ? spec.beamWidth ?? 8 : spec.projWidth ?? spec.projRadius * 2,
      texture: spec.textureType === 'SMOOTH' ? 1 : 0, scroll: spec.textureScrollSpeed ?? -256, pixels: spec.pixelsPerTexel ?? 1,
      sourceMoveSpeed: true, fringe: spec.fringeColor ?? [...spec.color, 255], core: spec.coreColor ?? [255, 255, 255, 255],
      missile: missile ? { radius: missile.radius, color: missile.color.slice(0, 3) as [number, number, number],
        hitGlow: missile.useHitGlowWhenDealingDamage !== false } : undefined,
      custom: adunWeaponFxScale(spec.id) ? arkWeaponFxProfile(spec.id) ? spec.id === 'web_ark_solar_lance' ? 3 : 2 : 1 : 0,
      heavyTorpedo: spec.impactFamily === 'HEAVY_TORPEDO',
      fuseSound: spec.proximityFuse?.soundKey ?? 'flak_explosion', fuseColor: [255, 155, 125] } };
}

/** splitMirv creates an independent ballistic payload, not another parent missile. */
export function rustMirvChild(spec: WeaponSpec): WeaponSpec | undefined {
  const mirv = spec.mirv; if (!mirv) return undefined;
  return { id: mirv.projectileSpec, nameKey: mirv.projectileSpec, mountSize: spec.mountSize,
    isBeam: false, damagePerShot: mirv.damage, empPerShot: mirv.emp, damagePerSecond: 0,
    fluxPerShot: 0, range: mirv.projectileRange, refireDelay: 0, projSpeed: mirv.spreadSpeed,
    projRadius: mirv.childProjectile?.projRadius ?? 1.75, color: [175, 210, 255],
    spawnType: mirv.childProjectile?.spawnType ?? 'BALLISTIC', type: mirv.damageType,
    ...mirv.childProjectile, isRocket: false, isGuided: false, mirv: undefined,
    missileLifecycleSpec: undefined, projectileExplosionSpec: undefined,
    missileExplosionVisualSpec: undefined, missileHp: mirv.childHitpoints };
}

export function rustDelivery(spec: WeaponSpec, childSpec = 0, mounted = true): RustDeliverySpec {
  const lifecycle = spec.missileLifecycleSpec, mirv = spec.mirv;
  const effect = spec.beamEffect ?? spec.onHitEffect ?? spec.everyFrameEffect;
  const child = rustMirvChild(spec);
  return { spawnType: spec.spawnType === 'BEAM' ? 'ORDINARY' : spec.spawnType ?? 'ORDINARY', length: spec.projLength,
    fadeTime: spec.fadeTime, damageType: spec.type, weaponType: spec.weaponType, radius: spec.projRadius, armingTime: spec.armingTime,
    flightTime: spec.flightTime, sourceMissile: (!!spec.isRocket || spec.spawnType === 'MISSILE') && !!lifecycle,
    flameoutTime: lifecycle?.flameoutTime, missileFadeTime: lifecycle?.fadeTime,
    fizzleAtRange: lifecycle?.fizzleOnReachingWeaponRange, noCollisionWhileFading: lifecycle?.noCollisionWhileFading,
    reduceDamageWhileFading: lifecycle?.reduceDamageWhileFading, collisionAfterFlameoutNone: lifecycle?.collisionClassAfterFlameout === 'NONE',
    beamSpeed: spec.beamSpeed, beamHardFlux: spec.beamDealsHardFlux, effect: effect ? rustWeaponEffect(effect) : undefined,
    beamWidth: spec.beamWidth, fringeColor: spec.fringeColor, coreColor: spec.coreColor,
    guidance: spec.isRocket || spec.spawnType === 'MISSILE' ? { rocket: true, guided: !!spec.isGuided, inertial: false,
      hitpoints: spec.missileHp || 100, acceleration: spec.engineAcceleration, maxSpeed: spec.maxSpeed ?? spec.projSpeed, maxTurnRate: spec.maxTurnRate,
      maxTurnAcceleration: spec.maxTurnAcceleration, guidanceBonus: spec.missileGuidanceBonus, eccmChance: spec.eccmChanceBonus,
      renderTargetIndicator: spec.renderTargetIndicator,
      mirv: mirv && child ? { splitRange: mirv.splitRange, splitRangeRange: mirv.splitRangeRange, minTime: mirv.minTimeToSplit,
        canSplitEarly: mirv.canSplitEarly, shots: mirv.numShots, damage: mirv.damage, emp: mirv.emp, damageType: mirv.damageType,
        childHitpoints: mirv.childHitpoints, evenSpread: mirv.evenSpread, arcDeg: mirv.arcDeg, inaccuracyDeg: mirv.spreadInaccuracyDeg,
        spreadSpeed: mirv.spreadSpeed, spreadSpeedRange: mirv.spreadSpeedRange, projectileRange: mirv.projectileRange,
        childSpec, childRadius: child.projRadius, childSpawnType: child.spawnType === 'BEAM' ? 'ORDINARY' : child.spawnType,
        childDelivery: rustDelivery(child, 0, false) } : undefined } : undefined, world: rustDeliveryWorld(spec, mounted) };
}

export function rustFire(ship: Ship, mount: WeaponMount, childSpec = 0): RustFireSpec {
  const spec = mount.spec, threshold = hullModRangeThresholdStats(ship.spec);
  const primary = mount.mountType === 'HARDPOINT' ? spec.hardpointOffsets : spec.turretOffsets;
  const secondary = mount.mountType === 'HARDPOINT' ? spec.turretOffsets : spec.hardpointOffsets;
  const offsets = primary && primary.length >= 2 ? primary : secondary;
  return { burstSize: spec.burstSize, interruptible: spec.interruptibleBurst, autoCharge: spec.autoCharge,
    fluxPerShot: spec.fluxPerShot, fluxPerSecond: spec.fluxPerSecond, maxSpread: spec.maxSpread, spreadPerShot: spec.spreadPerShot,
    relativePos: [mount.relativePos.x, mount.relativePos.y], damagePerShot: spec.damagePerShot, damagePerSecond: spec.damagePerSecond,
    empPerShot: spec.empPerShot, empPerSecond: spec.empPerSecond, range: spec.range, speed: spec.projSpeed,
    recoilSpeed: spec.fireRecoilSpeed, pointDefense: spec.isPointDefense, beamChargeup: spec.beamSourceChargeupTime,
    beamChargedown: spec.beamSourceChargedownTime, beamDuration: spec.beamDuration, beamFireOnlyFull: spec.beamFireOnlyOnFullCharge,
    sustained: spec.beamVisualMode === 'SUSTAINED', offsets: offsets ? Array.from({ length: Math.floor(offsets.length / 2) }, (_, i) => [offsets[i * 2], offsets[i * 2 + 1]] as const) : undefined,
    rocket: spec.isRocket || spec.spawnType === 'MISSILE', launchSpeed: spec.launchSpeed, flightTime: spec.flightTime,
    dudProbability: spec.missileLifecycleSpec?.dudProbabilityOnFlameout,
    rangeInputs: { base: spec.range + hullModRangeBaseFlat(ship.spec, spec), percent: hullModRangePercent(ship.spec, spec),
      multiplier: hullModRangeMultiplier(ship.spec, spec), flat: hullModRangeFlat(ship.spec, spec),
      threshold: threshold.rangeThreshold, pastMultiplier: threshold.rangePastThresholdMultiplier,
      shipMultiplier: ship.spec.weaponRangeMult ?? 1, authoredRange: spec.range, authoredSpeed: spec.projSpeed,
      speedBonus: spec.projectileSpeedBonusPercent, carrierFlat: ship.sourceCarrier ? fighterWeaponRangeFlat(ship.sourceCarrier.spec, spec) : 0 },
    delivery: rustDelivery(spec, childSpec) };
}

export function rustQueryMount(ship: Ship, mount: WeaponMount): RustFireQueryMount {
  const spec = mount.spec, hints = spec.aiHints ?? []; let schedulingSalt = 2166136261;
  for (const char of ship.id + '/' + mount.slotId) schedulingSalt = Math.imul(schedulingSalt ^ char.charCodeAt(0), 16777619);
  return { flags: (spec.isPointDefense || hints.includes('PD') || hints.includes('PD_ONLY') ? WeaponFlag.PD : 0) | (hints.includes('PD_ONLY') ? WeaponFlag.PD_ONLY : 0)
    | (spec.isBeam ? WeaponFlag.BEAM : 0) | (spec.isGuided ? WeaponFlag.GUIDED : 0) | (spec.weaponType === 'MISSILE' ? WeaponFlag.MISSILE : 0)
    | (mount.mountType === 'HARDPOINT' ? WeaponFlag.HARDPOINT : 0) | (spec.alwaysFire ? WeaponFlag.ALWAYS_FIRE : 0)
    ,
    hints: (Object.keys(FireHint) as (keyof typeof FireHint)[]).reduce((mask, key) => mask | (hints.includes(key) ? FireHint[key] : 0), 0),
    baseAngleDeg: mount.baseAngleDeg, arcDeg: mount.arcDeg, turnRateDeg: spec.turnRateDegPerSec ?? 30,
    sizeScale: spec.isPointDefense || hints.includes('PD') || hints.includes('PD_ONLY') || spec.mountSize === 'SMALL' ? .25 : spec.mountSize === 'MEDIUM' ? .5 : 1,
    accuracyBonus: spec.autofireAccuracyBonus, passFighters: !!spec.passThroughFighters && !spec.passThroughFightersOnlyWhenDestroyed,
    proximity: spec.proximityFuse?.range, initialIdle: mount.aimIdleSeconds ?? 15.1, schedulingSalt: schedulingSalt >>> 0,
    sampleHz20: mount.mountType === 'TURRET' && (spec.mountSize === 'SMALL' || spec.mountSize === 'MEDIUM'),
    sampleNative: ShipWeaponControlSystem.hasNativeQueryLoop(ship.weaponControl)
      && nativeSampledAutofireReaders.every(([key,value]) => (ship.weaponControl as unknown as {autofire:AutofireController}).autofire[key] === value) };
}

export function rustMotionStats(ship: Ship): RustEngineMotionStats {
  const spec = ship.spec, stats = ship.hullStats;
  return { accelerationBase: spec.acceleration + stats.accelerationBonus, accelerationPercent: stats.accelerationPercent,
    accelerationMultiplier: stats.accelerationMultiplier, decelerationBase: spec.deceleration + stats.decelerationBonus,
    decelerationPercent: stats.decelerationPercent, decelerationMultiplier: stats.decelerationMultiplier,
    speedBase: spec.maxSpeed + stats.speedBonus, speedPercent: stats.speedPercent + ship.fleetSpeedBonusPercent,
    speedMultiplier: stats.speedMultiplier, turnAccelerationBaseDeg: spec.turnAccelerationDeg,
    turnAccelerationPercent: stats.turnAccelerationPercent, turnAccelerationMultiplier: stats.turnAccelerationMultiplier,
    turnRateBaseDeg: spec.maxTurnRateDeg, turnRatePercent: stats.turnRatePercent, turnRateMultiplier: stats.turnRateMultiplier,
    terrainMultiplier: ship.terrainSpeedMult, readinessMultiplier: ship.crMovementMultiplier, specAcceleration: spec.acceleration,
    specTurnAccelerationDeg: spec.turnAccelerationDeg, zeroFluxSpeedBonus: stats.zeroFluxSpeedBonus,
    zeroFluxTurnMultiplier: stats.zeroFluxTurnMultiplier };
}

export function rustArmorStats(ship: Ship): RustArmorStats {
  const armor = ship.armor;
  return { effectiveMultiplier: armor.effectiveArmorMultiplier, dynamicMultiplier: armor.dynamicEffectiveArmorMultiplier?.() ?? 1,
    maxReduction: armor.maxDamageReduction, minResidualMultiplier: armor.minArmorFractionMultiplier,
    incoming: (['ENERGY', 'KINETIC', 'HIGH_EXPLOSIVE', 'FRAGMENTATION'] as const).flatMap(type => {
      const value = armor.damageTakenModifiers?.(type); return [value?.armor ?? 1, value?.hull ?? 1];
    }) as [number, number, number, number, number, number, number, number],
    hullSuppressed: ship.hullDamageSuppressed, vastBulk: ship.hasVastBulk };
}

export function rustDeath(ship: Ship, transient = !!ship.sourceCarrier): RustWorldShipConfig {
  const offset = ship.moduleMount ? moduleOffset(ship.moduleMount) : undefined;
  return { specId: ship.spec.id, stableId: ship.id, shipName: ship.shipName,
    hullName: i18n.t(ship.spec.nameKey).split(' (')[0], explosionDamage: ship.hullStats.explosionDamageMultiplier,
    explosionRadius: ship.hullStats.explosionRadiusMultiplier, breakProbability: ship.hullStats.breakProbability,
    minPieces: ship.spec.minPieces ?? 2, maxPieces: ship.spec.maxPieces ?? 2,
    explosionColor: ship.spec.explosionColor ?? [255, 165, 100], flashColor: ship.spec.explosionFlashColor ?? [255, 125, 25],
    debrisColor: ship.spec.debrisColor ?? [100, 130, 160], spriteHeight: ship.spec.spriteHeight,
    missileDamagePercent: ship.hullStats.damageToMissilesPercent, missileDamageMultiplier: ship.hullStats.damageToMissilesMultiplier,
    transient, mass: ship.spec.mass, station: ship.isStation, moduleOffset: offset ? [offset.x, offset.y] : undefined,
    moduleAngle: ship.moduleMount ? ship.moduleMount.angleDeg * Math.PI / 180 : undefined,
    independentRotation: ship.spec.sourceHullTraits?.includes('INDEPENDENT_ROTATION'),
    slots: ship.spec.weaponSlots.map((slot, i) => ({ id: i + 1, position: [slot.x, slot.y] })) };
}

export function rustWorldSystem(ship: Ship, handle: (ship: Ship) => { slot: number; generation: number }): RustSystemWorldConfig {
  const mods = new Set([...(ship.spec.builtInHullMods ?? []), ...(ship.spec.hullMods ?? [])]), hull = ship.spec.sourceHullId ?? ship.spec.id;
  const owner = arkOwner(hull), yamato = ship.allSystems.some(system => system.type === 'WEB_SC2_HYPERION_YAMATO')
    ? contentRegistry.getWeapon(HYPERION_PROJECTILE_ID) : undefined;
  const launcherSlot = ship.spec.systemWeaponSlots?.find(slot => slot.slotId === 'SYS_YAMATO');
  if (ship.allSystems.some(system => system.type === 'WEB_SC2_HYPERION_YAMATO') && (!yamato || !launcherSlot)) throw Error(ship.spec.id + ': missing actual Yamato launcher/slot');
  return { traits: (hull === 'web_gloriana' || /^web_gloriana_/.test(hull) ? 1 : 0) | (hull === HYPERION_HULL_ID ? 2 : 0)
    | (mods.has(HYPERION_HULLMODS.reactor) ? 4 : 0) | (mods.has(HYPERION_HULLMODS.focus) ? 8 : 0)
    | (mods.has(ARK_HULLMODS.coupler) ? 16 : 0) | (owner === 'AFT' ? 32 : 0)
    | (mods.has('web_gloriana_edict_loader') ? 64 : 0),
    parent: ship.parentShip ? handle(ship.parentShip) : undefined, carrierRoot: ship.sourceCarrier ? handle(ship.sourceCarrier) : undefined,
    children: ship.childModules.map(handle), side: /^P[123]$/.test(ship.moduleMount?.slotId ?? '') ? -1 : /^S[123]$/.test(ship.moduleMount?.slotId ?? '') ? 1 : 0,
    rangeMultiplier: ship.hullStats.systemRangeMultiplier, bulkheads: mods.has(GLORIANA_BUILTINS.bulkheads),
    fieldRepair: mods.has(HYPERION_HULLMODS.repair), compensation: mods.has(ROCINANTE_MODS.compensator),
    yamatoMuzzle: yamato ? [launcherSlot!.x, launcherSlot!.y] : undefined,
    systems: ship.allSystems.map((system, i) => ({ systemId: i + 1, kind: rustSystemKinds[system.type] })),
    yamato: yamato ? { damage: yamato.damagePerShot, emp: yamato.empPerShot ?? 0, range: yamato.range, speed: yamato.projSpeed,
      launchSpeed: yamato.launchSpeed, speedBonus: yamato.projectileSpeedBonusPercent, weaponType: yamato.weaponType,
      delivery: rustDelivery(yamato, 0, false) } : undefined };
}

export function rustGravity(ship: Ship): { systems: RustGravitySystemConfig[]; mounts: RustGravityMountConfig[] } {
  const kinds: Record<string, RustGravitySystemConfig['kind']> = Object.fromEntries([
    ['well', 'WELL'], ['repulsor', 'REPULSOR'], ['maneuver', 'MANEUVER'], ['release', 'RELEASE'], ['battleWell', 'BATTLE_WELL'],
    ['collapse', 'COLLAPSE'], ['polarity', 'POLARITY'], ['battleRepulsor', 'BATTLE_REPULSOR'], ['push', 'PUSH'],
  ].map(([key, value]) => [GRAVITY_SYSTEM_IDS[key as keyof typeof GRAVITY_SYSTEM_IDS], value])) as Record<string, RustGravitySystemConfig['kind']>;
  return { systems: ship.allSystems.flatMap((system, i) => {
    const kind = kinds[system.type]; if (!kind) return [];
    const definition = system.definition, field = definition.gravityField, collapse = definition.gravityCollapse,
      maneuver = definition.gravityManeuver, push = definition.gravityDirectionalPush, auto = definition.gravityAutoCollapse;
    return [{ systemId: i + 1, id: system.type, kind, field: field ? { kind: field.kind, cursorSpeed: field.cursorSpeed,
      linger: field.lingerSeconds, radius: field.radius, placement: field.placementRange, duration: field.duration,
      shipStrength: field.shipStrength, projectileStrength: field.projectileStrength, shipBudget: field.shipBudget,
      projectileBudget: field.projectileBudget, maxShips: field.maxShips, maxProjectiles: field.maxProjectiles } : undefined,
      collapse: collapse ? { radius: collapse.radius, damage: collapse.damage, edge: collapse.edgeDamage, maxShips: collapse.maxShips,
        auto: auto ? { up: auto.chargeUp, active: auto.active, cost: auto.fluxCost } : undefined } : undefined,
      maneuver: maneuver ? { duration: maneuver.duration, maxTurn: maneuver.maxTurn, turnRate: maneuver.turnRate,
        acceleration: maneuver.lateralAcceleration, minSpeed: maneuver.minSpeed, minAim: maneuver.minAimDistance } : undefined,
      push: push ? { range: push.range, shipStrength: push.shipStrength, projectileStrength: push.projectileStrength, fluxRate: push.fluxPerSecond } : undefined }];
  }), mounts: ship.weapons.flatMap((mount, i) => {
    const tractor = mount.spec.gravityTractor, deflector = mount.spec.gravityDeflector; if (!tractor && !deflector) return [];
    return [{ componentId: i + 1, id: mount.slotId, hardpoint: mount.mountType === 'HARDPOINT',
      tractor: tractor ? { capture: tractor.captureTime, projectileCapture: tractor.projectileCaptureTime, hold: tractor.holdTime,
        recovery: tractor.recovery, anchorSpeed: tractor.anchorSpeed, strength: tractor.strength, damping: tractor.damping,
        fluxRate: tractor.fluxPerSecond, selfTow: !!tractor.selfTow, tidalDamage: tractor.tidalDamagePerSecond, tidalFlux: tractor.tidalFluxPerSecond } : undefined,
      deflector: deflector ? { impulse: deflector.impulse, budget: deflector.budgetPerSecond, flux: deflector.fluxPerUse, interval: deflector.interval } : undefined }];
  }) };
}
