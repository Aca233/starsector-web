// Actual TS actors and one-time shared Rust installation. No host rule solver.
import { CombatEngine } from '../../src/engine/simulation/CombatEngine';
import { Ship, type ShipStepState } from '../../src/engine/simulation/Ship';
import { ShipSystem } from '../../src/engine/simulation/ShipSystem';
import { SimulationRandom } from '../../src/engine/simulation/SimulationRandom';
import { Vector2 } from '../../src/engine/math/Vector2';
import { RustCombatCore } from '../../src/engine/runtime/rust/RustCombatCore';
import { RustHullSize, RustLifecycleFlag, RustUpkeepControl, type RustBodyHandle, type RustCommand, type RustFireSpec, type RustDeliveryWorldSpec, type RustExplosionSpec } from '../../src/engine/runtime/rust/RustCoreProtocol';
import { contentRegistry } from '../../src/engine/content/ContentRegistry';
import { installedHullMods, hullModRangeBaseFlat, hullModRangePercent, hullModRangeFlat, hullModRangeMultiplier, hullModRangeThresholdStats, hullModDefinitions } from '../../src/engine/extensions/HullMods';
import { WeaponSimulationSystem } from '../../src/engine/simulation/systems/WeaponSimulationSystem';
import { CombatFXSystem } from '../../src/engine/simulation/systems/CombatFXSystem';
import { CombatStatsTracker } from '../../src/engine/simulation/systems/CombatStatsTracker';
import { AsteroidSystem } from '../../src/engine/simulation/systems/AsteroidSystem';
import { NebulaSystem } from '../../src/engine/simulation/systems/NebulaSystem';
import { ShipCollisionSystem } from '../../src/engine/simulation/systems/ShipCollisionSystem';
import { i18n } from '../../src/engine/i18n/LocalizationManager';
import { captureCombatAudio } from '../../src/engine/audio/CombatAudioEvents';
import type { ShipSpec } from '../../src/engine/content/ShipSpec';
import type { Projectile, Beam, WeaponMount, WeaponSpec } from '../../src/engine/simulation/Weapon';
import type { WeaponControlStep, WeaponFirePlan } from '../../src/engine/simulation/systems/ShipWeaponControlSystem';
import type { WeaponSimContext } from '../../src/engine/simulation/systems/weapon/WeaponSimContext';
import type { FireControlWorld } from '../../src/engine/ai/AutofireController';
import type { SystemWorld } from '../../src/engine/extensions/ship-systems/Types';
import type { ShipLossNotification } from '../../src/engine/simulation/CombatNotifications';
import { hyperionYamatoProjectile } from '../../src/engine/content/HyperionPack';
import { GRAVITY_SYSTEM_IDS as GID } from '../../src/engine/content/GravityIds';
import type { RustGravitySystemConfig } from '../../src/engine/runtime/rust/RustCoreProtocol';
import type { StageView } from '../../src/engine/ai/batch/StageBridge';
import { beginStage } from '../../src/engine/ai/batch/StageProducer';
import { FireControlQueryRoster } from '../../src/engine/ai/FireControlQueryBatch';
import { InFlightFireBudget } from '../../src/engine/ai/InFlightFireBudget';
import { advanceGravityFields } from '../../src/engine/simulation/systems/GravityFieldPhysics';
import { advanceGravityDamage } from '../../src/engine/simulation/systems/GravityDamage';
import { advanceGravityTerrain } from '../../src/engine/simulation/systems/GravityTerrain';

export function assertWorld(v: unknown, label: string): asserts v { if (!v) throw Error(label); }
export const worldSystemIds = ['NONE', 'WEB_ZHUYUAN_ECLIPSE_PROTOCOL', 'WEB_GLORIANA_BROADSIDE_EDICT', 'WEB_SC2_HYPERION_YAMATO',
  'WEB_SC2_HYPERION_JUMP', 'WEB_ADUN_ARK_FORGE', 'WEB_ADUN_ARK_BARRIER', 'WEB_ADUN_ARK_REPAIR', 'WEB_ROCINANTE_ATTITUDE', 'WEB_ROCINANTE_FIRE_CONTROL', 'WEB_ZHEFENG_COMMUTATOR'];
const kindNames = ['NONE', 'ECLIPSE', 'EDICT', 'YAMATO', 'JUMP', 'ARK_FORGE', 'ARK_BARRIER', 'ARK_REPAIR', 'ROC_ATTITUDE', 'ROC_FIRE', 'ZHEFENG'] as const;
export const worldOutgoingModId = 'rust_world_actual_outgoing_fixture';
if (!hullModDefinitions.get(worldOutgoingModId)) hullModDefinitions.register({ id: worldOutgoingModId, name: 'Oracle outgoing actual extension', status: 'implemented',
  stats: () => ({ damageToFrigatesPercent: 25 }) });
export interface WorldActor { hull?: string; size?: ShipSpec['hullSize']; position: [number, number]; velocity?: [number, number]; hp?: number;
  maxHp?: number; maxFlux?: number; team?: number; parent?: number; transient?: boolean; breakProbability?: number; pieces?: number;
  system?: number; mods?: string[]; builtins?: string[]; gun?: Partial<WeaponSpec>; shield?: ShipSpec['shieldType']; radius?: number;
  voidShield?: ShipSpec['voidShield']; captainSkills?: ShipSpec['captainSkills']; systemTypes?: string[]; slot?: string; side?: -1 | 0 | 1;
  traits?: number; role?: 'AXIAL' | 'POINT_DEFENSE'; hardpoint?: boolean; facing?: number; motion?: boolean; dissipation?: number; independent?: boolean;
  sourceTraits?: string[]; moduleCombat?: boolean; }
interface FireMethods { requestWeaponFire(m: WeaponMount, s: Ship, p: (p: Projectile) => void, b: (b: Beam) => void): boolean;
  advanceWeaponLifecycle(dt: number, m: WeaponMount, s: Ship, can: boolean, p: (p: Projectile) => void, b: (b: Beam) => void): void;
  programFluxBudget(s: Ship, m: WeaponMount, dt: number): boolean;
  planNumericFire(s: WeaponControlStep, w: FireControlWorld, v: StageView): WeaponFirePlan; }
type DeathOwner = { handleShipDestruction(s: Ship): void; combatTime: number; aftermathTime: number; suppressDestructionSideEffects: boolean };
const bounds: [number, number][] = [[-35, -35], [35, -35], [35, 35], [-35, 35]];
export function worldOutgoingWords(ship: Ship) { const h = ship.hullStats, skills = ship.spec.captainSkills;
  return [skills?.point_defense ?? 0, skills?.target_analysis ?? 0, skills?.energy_weapon_mastery ?? 0,
    h.damageToFightersPercent, h.damageToFightersMultiplier, h.damageToFrigatesPercent, h.damageToDestroyersPercent, h.damageToCruisersPercent]; }
export function worldExplosionSpec(s: NonNullable<WeaponSpec['projectileExplosionSpec']>): RustExplosionSpec {
  const classes: Record<string, RustExplosionSpec['collision']> = { HITS_SHIPS_AND_ASTEROIDS: 'SHIPS_AND_ASTEROIDS', MISSILE_FF: 'MISSILE_FF', MISSILE_NO_FF: 'MISSILE_NO_FF',
    PROJECTILE_FF: 'PROJECTILE_FF', PROJECTILE_NO_FF: 'PROJECTILE_NO_FF' };
  return { radius: s.radius, core: s.coreRadius, duration: s.duration, minimumFraction: s.minDamageFraction ?? 0,
    collision: classes[s.collisionClass] ?? 'OTHER', noFriendlyFire: s.collisionClass.endsWith('_NO_FF') };
}
function worldDeliverySpec(w: WeaponSpec): RustDeliveryWorldSpec { return {
  explosion: w.projectileExplosionSpec ? worldExplosionSpec(w.projectileExplosionSpec) : undefined,
  passMissiles: w.passThroughMissiles, passFighters: w.passThroughFighters, passFightersDestroyed: w.passThroughFightersOnlyWhenDestroyed,
  hitpoints: w.missileHp, terrainPenetration: w.terrainPenetration ? [w.terrainPenetration.maxRadius, w.terrainPenetration.minDamageCost, w.terrainPenetration.wreckDamagePerRadius] : undefined,
  visual: { hitGlowRadius: w.hitGlowRadius ?? 0, width: w.projWidth ?? w.projRadius * 2, texture: w.textureType === 'SMOOTH' ? 1 : 0,
    scroll: w.textureScrollSpeed ?? -256, pixels: w.pixelsPerTexel ?? 1, sourceMoveSpeed: true,
    fringe: w.fringeColor ?? [...w.color, 255], core: w.coreColor ?? [255, 255, 255, 255], fuseSound: 'flak_explosion', fuseColor: [255, 155, 125] } };
}
export function worldFireSpec(ship: Ship, m: WeaponMount): RustFireSpec {
  const w = m.spec, threshold = hullModRangeThresholdStats(ship.spec);
  return { burstSize: w.burstSize, interruptible: w.interruptibleBurst, autoCharge: w.autoCharge, fluxPerShot: w.fluxPerShot, fluxPerSecond: w.fluxPerSecond,
    maxSpread: w.maxSpread, spreadPerShot: w.spreadPerShot, relativePos: [m.relativePos.x, m.relativePos.y],
    damagePerShot: w.damagePerShot, damagePerSecond: w.damagePerSecond, empPerShot: w.empPerShot, empPerSecond: w.empPerSecond,
    range: w.range, speed: w.projSpeed, recoilSpeed: w.fireRecoilSpeed, pointDefense: w.isPointDefense,
    beamChargeup: w.beamSourceChargeupTime, beamChargedown: w.beamSourceChargedownTime, beamDuration: w.beamDuration,
    beamFireOnlyFull: w.beamFireOnlyOnFullCharge, sustained: w.beamVisualMode !== 'BURST',
    rangeInputs: { base: w.range + hullModRangeBaseFlat(ship.spec, w), percent: hullModRangePercent(ship.spec, w), multiplier: hullModRangeMultiplier(ship.spec, w),
      flat: hullModRangeFlat(ship.spec, w), threshold: threshold.rangeThreshold, pastMultiplier: threshold.rangePastThresholdMultiplier,
      shipMultiplier: ship.spec.weaponRangeMult ?? 1, authoredRange: w.range, authoredSpeed: w.projSpeed, speedBonus: w.projectileSpeedBonusPercent },
    delivery: { spawnType: w.spawnType === 'BEAM' ? 'ORDINARY' : w.spawnType ?? 'ORDINARY', damageType: w.type, weaponType: w.weaponType, radius: w.projRadius, length: w.projLength,
      fadeTime: w.fadeTime, beamSpeed: w.beamSpeed } };
}
export async function worldFixture(wasm: BufferSource, name: string, actors: WorldActor[], seed: number, withAsteroids = false) {
  if (!contentRegistry.getWeapon(hyperionYamatoProjectile.id)) contentRegistry.registerWeapon(hyperionYamatoProjectile, false);
  const core = await RustCombatCore.create(wasm, seed), random = new SimulationRandom(seed), visual = new SimulationRandom((seed ^ 0x9e3779b9) >>> 0),
    weapon = new WeaponSimulationSystem(), fx = new CombatFXSystem(visual), stats = new CombatStatsTracker(),
    asteroids = new AsteroidSystem(random, visual), nebula = new NebulaSystem(visual), collision = new ShipCollisionSystem();
  const ships: Ship[] = [], handles: RustBodyHandle[] = [], serials = new Map<number, number>(), sourceBindings = new Map<number, number[]>(),
    breakupSequences = new Map<object, number>(); let serial = 0, tick = 0;
  for (let i = 0; i < actors.length; i++) {
    const c = actors[i], id = i + 1, size = c.size ?? 'FRIGATE';
    const gun: WeaponSpec = { id: `owner-world-${seed}-${i}`, nameKey: 'world weapon', weaponType: 'ENERGY', mountSize: 'SMALL', isBeam: false,
      refireDelay: .32, chargeTime: 0, burstSize: 1, burstDelay: .04, interruptibleBurst: false, fluxPerShot: 17, fluxPerSecond: 0,
      maxAmmo: 100, ammoRegenPerSec: 0, minSpread: 0, maxSpread: 0, spreadPerShot: 0, spreadDecay: 5, type: 'ENERGY',
      turnRateDegPerSec: 120, damagePerShot: 200, damagePerSecond: 0, empPerShot: 0, projSpeed: 600, range: 2000, projRadius: 1,
      color: [255, 100, 50], ordnancePointCost: 2, ...c.gun } as WeaponSpec;
    if (c.gun) contentRegistry.registerWeapon(gun, false);
    const spec: ShipSpec = { id: c.hull ?? `舰体-${seed}-${i}-🚀`, sourceHullId: c.hull, nameKey: `装甲舰-${i} (审查)`, descKey: '', designationKey: '',
      isModuleHull: c.parent !== undefined, sourceHullTraits: c.sourceTraits ?? (c.independent ? ['INDEPENDENT_ROTATION'] : undefined), moduleCombat: c.moduleCombat,
      spriteUrl: '', spriteWidth: 70, spriteHeight: 70, pivotX: 35, pivotY: 35,
      collisionRadius: c.radius ?? 50, mass: 100, hullSize: size, maxSpeed: c.motion ? 140 : 0, acceleration: c.motion ? 65 : 0, deceleration: c.motion ? 85 : 0, maxTurnRateDeg: c.motion ? 42 : 0, turnAccelerationDeg: c.motion ? 55 : 0,
      hitpoints: c.maxHp ?? 1000, armorRating: 27, armorCols: 9, armorRows: 7, maxFlux: c.maxFlux ?? 10000, fluxDissipation: c.dissipation ?? 0, peakCRSec: 0,
      shieldType: c.shield ?? 'NONE', shieldArcDeg: 360, shieldRadius: c.voidShield ? 170 : 65, shieldEfficiency: 1, shieldUpkeep: 0, voidShield: c.voidShield, captainSkills: c.captainSkills,
      systemType: c.systemTypes?.[0] ?? worldSystemIds[c.system ?? 0], systemTypes: c.systemTypes, defenseSystemType: 'NONE', hullMods: c.mods ?? [], builtInHullMods: c.builtins ?? [],
      systemWeaponSlots: c.systemTypes?.includes(worldSystemIds[3]) || c.system === 3 ? [{ slotId: 'SYS_YAMATO', x: 50, y: 0, baseAngleDeg: 0, arcDeg: 0, mountType: 'HIDDEN', slotSize: 'LARGE' }] : [],
      weaponSlots: c.gun ? [{ slotId: '1', mountType: c.hardpoint ? 'HARDPOINT' : 'TURRET', slotSize: 'SMALL', x: 0, y: 0, baseAngleDeg: 0, arcDeg: 360, defaultWeaponId: gun.id,
        builtIn: !!c.role, controlRole: c.role }] : [],
      engineSlots: [], bounds, breakProbability: c.breakProbability ?? 0, minPieces: c.pieces ?? 2, maxPieces: c.pieces ?? 2,
      explosionColor: [231, 132, 91], explosionFlashColor: [247, 164, 31], debrisColor: [100, 130, 160] };
    const ship = new Ship(String(id), spec, (c.team ?? (i === 0 ? 0 : 1)) === 0, new Vector2(...c.position), c.facing ?? 0, random, visual);
    ship.shipName = `联合验收舰名🚀-${seed}-${i}-跨越十九字符分块`; ship.teamId = c.team ?? (i === 0 ? 0 : 1); ship.hullHp = c.hp ?? ship.maxHullHp;
    ship.vel.set(...(c.velocity ?? [0, 0])); ship.aimTargetWorld.set(c.position[0] + 10000, c.position[1]); ship.fireControlMode = 'MANUAL'; ship.visibilityMask = 3;
    if (c.parent !== undefined) { ship.parentShip = ships[c.parent]; ship.moduleMount = { slotId: c.slot ?? 'P' + i,
      x: ship.pos.x - ship.parentShip.pos.x, y: ship.pos.y - ship.parentShip.pos.y, angleDeg: 0, spec }; ship.parentShip.childModules.push(ship); }
    ships.push(ship);
    const motion = new Float64Array(22); motion[0] = ship.pos.x; motion[1] = ship.pos.y; motion[2] = ship.vel.x; motion[3] = ship.vel.y; motion[4] = ship.facingRad; motion[18] = 1;
    core.apply([{ kind: 'spawn', id, motion }]); const handle = core.snapshot().bodies[i].handle; handles.push(handle); const armor = ship.armor;
    const commands: RustCommand[] = [{ kind: 'initialize-ship', id, handle, config: { maxFlux: ship.flux.maxFlux, baseDissipation: ship.flux.baseDissipation, hullSize: RustHullSize[size ?? 'UNKNOWN'] } },
      { kind: 'initialize-shield', id, handle, config: { type: ship.shield.type, maxArc: ship.shield.maxArcDeg, radius: ship.shield.radius, efficiency: ship.shield.efficiency,
        upkeepRate: ship.shield.upkeepRate, phaseChargeUp: ship.shield.phaseChargeUpDuration, phaseChargeDown: ship.shield.phaseChargeDownDuration,
        phaseCooldown: ship.shield.phaseCooldownDuration, phaseActivationCost: ship.shield.phaseActivationCost, phaseUpkeep: ship.shield.phaseUpkeepPerSecond } },
      { kind: 'shield-input', id, handle, aimX: ship.aimTargetWorld.x, aimY: ship.aimTargetWorld.y },
      { kind: 'initialize-armor', id, handle, config: { cols: armor.cols, rows: armor.rows, cellWidth: armor.cellWidth, cellHeight: armor.cellHeight, armorRating: armor.maxArmorRating,
        minX: armor.minX, minY: armor.minY, maxHull: ship.maxHullHp, hullHp: ship.hullHp, effectiveMultiplier: armor.effectiveArmorMultiplier,
        dynamicMultiplier: 1, maxReduction: armor.maxDamageReduction, minResidualMultiplier: armor.minArmorFractionMultiplier } },
      { kind: 'initialize-combat', id, handle, geometry: { team: ship.teamId, hullSize: size, radius: spec.collisionRadius, bounds, player: ship.isPlayer } },
      { kind: 'combat-attributes', id, handle, attributes: { ai: false, damageTaken: ship.crDamageTakenMultiplier,
        pointDefenseSkill: spec.captainSkills?.point_defense, targetAnalysisSkill: spec.captainSkills?.target_analysis, energyMasterySkill: spec.captainSkills?.energy_weapon_mastery,
        damageToFightersPercent: ship.hullStats.damageToFightersPercent, damageToFightersMultiplier: ship.hullStats.damageToFightersMultiplier,
        damageToFrigatesPercent: ship.hullStats.damageToFrigatesPercent, damageToDestroyersPercent: ship.hullStats.damageToDestroyersPercent,
        damageToCruisersPercent: ship.hullStats.damageToCruisersPercent } }];
    if (c.voidShield) commands.push({ kind: 'configure-void-shield', id, handle, spec: c.voidShield });
    ship.allSystems.forEach((s, j) => {
      const control = s.definition.controls, specId = id * 100 + j + 1, flags = +s.available | (s.definition.toggle ? RustLifecycleFlag.Toggle : 0)
        | (s.definition.charges !== undefined && s.definition.usesChargesForActivation !== false ? RustLifecycleFlag.UsesCharges : 0)
        | (s.generatesHardFlux ? RustLifecycleFlag.HardFlux : 0) | (control?.cancelOnBrake ? RustLifecycleFlag.CancelOnBrake : 0)
        | (control?.cancelOnRetreat ? RustLifecycleFlag.CancelOnRetreat : 0) | (control?.cancelOnFlameout ? RustLifecycleFlag.CancelOnFlameout : 0);
      commands.push({ kind: 'define-lifecycle', id: specId, spec: { chargeUp: s.chargeUpDuration, active: s.activeDuration, chargeDown: s.chargeDownDuration,
        cooldown: s.maxCooldown, maxCharges: s.maxCharges, initialCharges: s.charges, chargeRegen: s.chargeRegenRate, fluxCostPerUse: s.fluxCostPerUse, flags } },
      { kind: 'install-system', id, handle, systemId: j + 1, specId, defense: s === ship.defenseSystem },
      { kind: 'system-upkeep', id, handle, systemId: j + 1, policy: { gate: 14, controls: (control?.blockShields ? RustUpkeepControl.BlockShields : 0)
        | (control?.blockFluxDissipation ? RustUpkeepControl.BlockDissipation : 0) | (control?.blockWeapons ? RustUpkeepControl.BlockWeapons : 0)
        | (control?.lockTurning ? RustUpkeepControl.LockTurning : 0) | (control?.blockVenting ? RustUpkeepControl.BlockVenting : 0)
        | (control?.releaseOnOut ? RustUpkeepControl.ReleaseOnOut : 0) | (control?.forceAutofire ? RustUpkeepControl.ForceAutofire : 0) } });
    });
    ship.weapons.forEach((m, j) => commands.push({ kind: 'install-weapon-health', id, handle, config: { componentId: j + 1, size: m.spec.mountSize,
      mount: m.mountType, x: m.relativePos.x, y: m.relativePos.y, healthMultiplier: ship.weaponHealthMultiplier } }));
    commands.push({ kind: 'initialize-weapons', id, handle, facing: ship.facingRad, manual: true, mounts: ship.weapons.map((m, j) => ({ componentId: j + 1,
      type: m.spec.weaponType, beam: m.spec.isBeam, burstBeam: m.spec.beamVisualMode === 'BURST', refireDelay: m.spec.refireDelay, chargeTime: m.spec.chargeTime,
      burstDelay: m.spec.burstDelay, beamBurstDelay: m.spec.beamBurstDelay, maxAmmo: m.spec.maxAmmo, ammoRegen: m.spec.ammoRegenPerSec, minSpread: m.spec.minSpread, spreadDecay: m.spec.spreadDecay })),
      groups: ship.weaponGroups.map(g => ({ index: g.index, mode: g.mode, autofire: g.isAutofire, members: g.weaponSlotIds.map(slot => ship.weapons.findIndex(m => m.slotId === slot) + 1) })) },
      { kind: 'initialize-fire', id, handle, mounts: ship.weapons.map(m => worldFireSpec(ship, m)) },
      { kind: 'initialize-engines', id, handle, hullSize: size, radius: spec.collisionRadius, slots: [] },
      { kind: 'engine-motion-stats', id, handle, stats: { accelerationBase: spec.acceleration + ship.hullStats.accelerationBonus, accelerationPercent: ship.hullStats.accelerationPercent, accelerationMultiplier: ship.hullStats.accelerationMultiplier,
        decelerationBase: spec.deceleration + ship.hullStats.decelerationBonus, decelerationPercent: ship.hullStats.decelerationPercent, decelerationMultiplier: ship.hullStats.decelerationMultiplier,
        speedBase: spec.maxSpeed + ship.hullStats.speedBonus, speedPercent: ship.hullStats.speedPercent, speedMultiplier: ship.hullStats.speedMultiplier,
        turnAccelerationBaseDeg: spec.turnAccelerationDeg, turnAccelerationPercent: ship.hullStats.turnAccelerationPercent,
        turnAccelerationMultiplier: ship.hullStats.turnAccelerationMultiplier, turnRateBaseDeg: spec.maxTurnRateDeg, turnRatePercent: ship.hullStats.turnRatePercent,
        turnRateMultiplier: ship.hullStats.turnRateMultiplier, terrainMultiplier: 1, readinessMultiplier: 1,
        specAcceleration: spec.acceleration, specTurnAccelerationDeg: spec.turnAccelerationDeg,
        zeroFluxSpeedBonus: ship.hullStats.zeroFluxSpeedBonus, zeroFluxTurnMultiplier: ship.hullStats.zeroFluxTurnMultiplier } },
      { kind: 'initialize-readiness', id, handle, config: { cr: .7, peakRemaining: 0, peakCRSeconds: 0, crLossPerSecond: 0 } });
    ship.weapons.forEach((m, j) => commands.push({ kind: 'configure-delivery-world', id, handle, mount: j, config: worldDeliverySpec(m.spec) }));
    try { core.apply(commands); } catch (error) { throw Error(name + ` ship${i} installation: ` + String(error) + '\n' + JSON.stringify(commands)); }
  }
  const worldCommands = ships.flatMap((s, i) => [{ kind: 'initialize-system-world', id: i + 1, handle: handles[i], config: { traits: actors[i].traits ?? 0,
    parent: s.parentShip ? handles[ships.indexOf(s.parentShip)] : undefined, children: s.childModules.map(child => handles[ships.indexOf(child)]),
    side: actors[i].side ?? 0, rangeMultiplier: s.hullStats.systemRangeMultiplier,
    yamatoMuzzle: s.allSystems.some(sys => sys.type === worldSystemIds[3]) ? [50, 0] : undefined,
    yamato: s.allSystems.some(sys => sys.type === worldSystemIds[3]) ? { damage: hyperionYamatoProjectile.damagePerShot, emp: hyperionYamatoProjectile.empPerShot ?? 0,
      range: hyperionYamatoProjectile.range, speed: hyperionYamatoProjectile.projSpeed, launchSpeed: hyperionYamatoProjectile.launchSpeed, speedBonus: hyperionYamatoProjectile.projectileSpeedBonusPercent,
      weaponType: hyperionYamatoProjectile.weaponType, delivery: { spawnType: hyperionYamatoProjectile.spawnType ?? 'ORDINARY', damageType: hyperionYamatoProjectile.type,
        weaponType: hyperionYamatoProjectile.weaponType, radius: hyperionYamatoProjectile.projRadius, length: hyperionYamatoProjectile.projLength, fadeTime: hyperionYamatoProjectile.fadeTime } } : undefined,
    systems: s.allSystems.map((sys, j) => ({ systemId: j + 1, kind: sys.type === GID.well ? 'GRAVITY_WELL' : sys.type === GID.battleWell ? 'GRAVITY_BATTLE_WELL'
      : (Object.values(GID) as string[]).includes(sys.type) ? 'GRAVITY_OTHER' : kindNames[worldSystemIds.indexOf(sys.type)] })) } },
  { kind: 'initialize-world-ship', id: i + 1, handle: handles[i], config: { specId: s.spec.id, stableId: s.id, shipName: s.shipName,
    hullName: i18n.t(s.spec.nameKey).split(' (')[0], explosionDamage: s.hullStats.explosionDamageMultiplier, explosionRadius: s.hullStats.explosionRadiusMultiplier,
    breakProbability: s.hullStats.breakProbability, minPieces: s.spec.minPieces ?? 2, maxPieces: s.spec.maxPieces ?? 2,
    explosionColor: s.spec.explosionColor!, flashColor: s.spec.explosionFlashColor!, debrisColor: s.spec.debrisColor!, spriteHeight: s.spec.spriteHeight,
    missileDamagePercent: s.hullStats.damageToMissilesPercent, missileDamageMultiplier: s.hullStats.damageToMissilesMultiplier,
    transient: actors[i].transient, mass: s.spec.mass, station: s.isStation, moduleOffset: s.moduleMount ? [s.moduleMount.x, s.moduleMount.y] : undefined,
    moduleAngle: 0, independentRotation: !!s.spec.sourceHullTraits?.includes('INDEPENDENT_ROTATION'),
    slots: s.spec.weaponSlots.map(slot => ({ id: Number(slot.slotId), position: [slot.x, slot.y] })) } }] as RustCommand[]);
  try { core.apply(worldCommands); } catch (error) { throw Error(name + ' world installation: ' + String(error) + '\n' + JSON.stringify(worldCommands)); }
  core.apply(ships.flatMap((ship, i) => ship.weapons.map((mount, j) => ({ kind: 'recoil-source' as const, id: i + 1, handle: handles[i], index: j,
    railgun: mount.mountType === 'HARDPOINT' && mount.spec.weaponType === 'BALLISTIC' && ship.spec.weaponSlots.some(slot => slot.slotId === mount.slotId && slot.controlRole === 'AXIAL'),
    pointDefenseRole: ship.spec.weaponSlots.some(slot => slot.slotId === mount.slotId && slot.builtIn && slot.defaultWeaponId === mount.spec.id && slot.controlRole === 'POINT_DEFENSE'
      && mount.spec.weaponType === 'BALLISTIC' && mount.spec.spawnType === 'BALLISTIC' && !mount.spec.isBeam && !mount.spec.isRocket) }))));
  if (withAsteroids) asteroids.init();
  core.apply([{ kind: 'initialize-battle-world', id: 1, handle: handles[0], enemy: { id: 2, handle: handles[1] }, asteroids: withAsteroids }]);
  core.apply([{ kind: 'initialize-phase-world', id: 1, handle: handles[0],
    ships: ships.map((_, i) => ({ id: i + 1, handle: handles[i] })),
    controls: ships.flatMap((ship, i) => ship.allSystems.map((system, j) => {
      const c = system.definition.controls;
      return { id: i + 1, handle: handles[i], systemId: j + 1,
        flags: (c?.blockFluxDissipation ? 1 : 0) | (c?.blockAcceleration ? 2 : 0) | (c?.blockStrafing ? 4 : 0)
          | (c?.forceAutofire ? 8 : 0) | (c?.blockWeapons ? 16 : 0) | (c?.blockShields ? 32 : 0)
          | (c?.lockTurning ? 64 : 0) | (c?.forceForward ? 128 : 0) | (c?.blockVenting ? 256 : 0) | (c?.releaseOnOut ? 512 : 0),
        phase: !!system.definition.phase, vulnerableUp: !!system.definition.phase?.vulnerableChargeUp,
        vulnerableDown: !!system.definition.phase?.vulnerableChargeDown };
    })) }]);
  core.apply([{ kind: 'initialize-motion-world', id: 1, handle: handles[0], data: { ships: ships.map((ship, i) => ({ id: i + 1, handle: handles[i],
    station: ship.isStation, axial: !!ship.spec.sourceHullTraits?.includes('axialrotation'), independent: !!ship.spec.sourceHullTraits?.includes('INDEPENDENT_ROTATION'),
    inheritParentEngineCommands: !!ship.spec.inheritParentEngineCommands, turnAcceleration: ship.spec.turnAccelerationDeg * Math.PI / 180,
    maxTurnRate: ship.spec.maxTurnRateDeg * Math.PI / 180 })) } }]);
  if (ships.some(s => s.allSystems.some(sys => (Object.values(GID) as string[]).includes(sys.type)))) {
    const command: RustCommand[] = [{ kind: 'initialize-gravity-world', id: 1, handle: handles[0] }],
      systemKinds = ['WELL', 'REPULSOR', 'MANEUVER', 'RELEASE', 'PUSH', 'POLARITY', 'BATTLE_WELL', 'COLLAPSE', 'BATTLE_REPULSOR'] as const,
      rank = (values: string[]) => { const sorted = values.slice().sort((a, b) => a.localeCompare(b)); return values.map(s => sorted.indexOf(s)); },
      ranks = rank(ships.map(s => 'SHIP:' + s.id));
    ships.forEach((ship, i) => {
      const systems: RustGravitySystemConfig[] = ship.allSystems.flatMap((sys, j) => {
        const k = (Object.values(GID) as string[]).indexOf(sys.type); if (k < 0) return [];
        const d = sys.definition, f = d.gravityField, c = d.gravityCollapse, a = d.gravityAutoCollapse, m = d.gravityManeuver, p = d.gravityDirectionalPush;
        return [{ systemId: j + 1, id: sys.type, kind: systemKinds[k], field: f ? { kind: f.kind, cursorSpeed: f.cursorSpeed, linger: f.lingerSeconds,
          radius: f.radius, placement: f.placementRange, duration: f.duration, shipStrength: f.shipStrength, projectileStrength: f.projectileStrength,
          shipBudget: f.shipBudget, projectileBudget: f.projectileBudget, maxShips: f.maxShips, maxProjectiles: f.maxProjectiles } : undefined,
          collapse: c ? { radius: c.radius, damage: c.damage, edge: c.edgeDamage, maxShips: c.maxShips, auto: a ? { up: a.chargeUp, active: a.active, cost: a.fluxCost } : undefined } : undefined,
          maneuver: m ? { duration: m.duration, maxTurn: m.maxTurn, turnRate: m.turnRate, acceleration: m.lateralAcceleration, minSpeed: m.minSpeed, minAim: m.minAimDistance } : undefined,
          push: p ? { range: p.range, shipStrength: p.shipStrength, projectileStrength: p.projectileStrength, fluxRate: p.fluxPerSecond } : undefined }];
      });
      command.push({ kind: 'initialize-gravity-ship', id: i + 1, handle: handles[i], systems, mounts: [] },
        { kind: 'initialize-gravity-collation', id: i + 1, handle: handles[i], shipRank: ranks[i],
          prefixes: i === 0 ? rank(['ASTEROID', 'HULK', 'PROJECTILE', 'SHIP']) : undefined, alphabet: i === 0 ? rank(Array.from('-.0123456789+e')) : undefined });
    }); core.apply(command);
  }
  const losses: ShipLossNotification[] = [], engine = Object.create(CombatEngine.prototype) as DeathOwner;
  const observations: { tag: number; values: number[]; geometry: number[] }[] = [];
  const record = (tag: number, values: number[], geometry: number[] = []) => observations.push({ tag, values, geometry });
  const units = (s: string) => [s.length, ...Array.from({ length: s.length }, (_, i) => s.charCodeAt(i))];
  const shipId = (s: Ship) => [Number(s.id), handles[ships.indexOf(s)].generation];
  const floatingObservations: { tag: number; values: number[]; geometry: number[] }[] = [];
  function floatingRecord(f: CombatFXSystem['floatingTexts'][number]) { const values = [f.id, f.pos.x, f.pos.y, f.vel.x, f.vel.y, ...units(f.text), ...f.color, f.size, f.life, f.maxLife];
    return { tag: 605, values, geometry: [1, 2, 3, 4] }; }
  const floatingDamage = fx.addFloatingDamage.bind(fx), floatingText = fx.addFloatingText.bind(fx);
  fx.addFloatingDamage = (...args) => { const before = fx.floatingTexts.map(f => ({ f, text: f.text, life: f.life, size: f.size })); floatingDamage(...args);
    const changed = fx.floatingTexts.find(f => !before.some(p => p.f === f)) ?? before.find(p => p.f.text !== p.text || p.f.life !== p.life || p.f.size !== p.size)?.f;
    if (changed) floatingObservations.push(floatingRecord(changed)); };
  fx.addFloatingText = (...args) => { const first = fx.floatingTexts.length; floatingText(...args); for (const f of fx.floatingTexts.slice(first)) floatingObservations.push(floatingRecord(f)); };
  const debris = fx.spawnDebris.bind(fx);
  let debrisScope: 'death' | 'terrain' | 'weapon' = 'weapon';
  fx.spawnDebris = (...args) => { const first = fx.debris.length; debris(...args); const p = fx.debris.slice(first), category = ['small', 'medium', 'large'].indexOf(args[4] ?? 'small'),
    values = debrisScope === 'weapon' ? [category, p.length] : [p.length], geometry: number[] = [];
    for (const d of p) { const offset = values.length; values.push(d.pos.x, d.pos.y, d.vel.x, d.vel.y, d.rotation, d.angularVel, d.size, d.maxLife,
      ...d.color, Number(d.spriteUrl!.match(/(?:sml|med|lrg)(\d)/)![1]), +!!d.isGlowing); geometry.push(...[0, 1, 2, 3, 4].map(i => offset + i)); } record(debrisScope === 'weapon' ? 606 : 105, values, geometry); };
  const armorSparks = fx.spawnArmorDamageSparks.bind(fx);
  fx.spawnArmorDamageSparks = (s, point, damage) => { const first = fx.particles.length; armorSparks(s, point, damage); if (s.damageDecals.suppressed) return;
    const p = fx.particles.slice(first), values = [...shipId(s), point.x, point.y, damage, p.length], geometry = [2, 3];
    for (const a of p) { const offset = values.length; values.push(a.pos.x, a.pos.y, a.vel.x, a.vel.y, a.size); geometry.push(...[0, 1, 2, 3].map(i => offset + i)); } record(108, values, geometry); };
  const explosionPush = fx.explosions.push.bind(fx.explosions);
  fx.explosions.push = (...entries) => { for (const x of entries) if (x.visualKind === 'ship') { const flash = x.flash!, f = x.flare,
    values = [x.id, x.maxRadius * 2, x.maxLife, ...units(x.sourceShipId!), x.pos.x, x.pos.y, ...x.color, x.puffDuration!, 0,
      flash.velocity.x, flash.velocity.y, flash.diameter, +!!(flash.coreDiameter !== undefined), flash.coreDiameter ?? 0, ...flash.color,
      flash.duration, flash.velocity.x, flash.velocity.y, +!!f];
    const geometry = [1, 4 + x.sourceShipId!.length, 5 + x.sourceShipId!.length, 11 + x.sourceShipId!.length, 12 + x.sourceShipId!.length,
      13 + x.sourceShipId!.length, 15 + x.sourceShipId!.length, 20 + x.sourceShipId!.length, 21 + x.sourceShipId!.length];
    if (f) { const offset = values.length; values.push(f.width, f.height, ...f.color, f.velocity.x, f.velocity.y); geometry.push(offset + 5, offset + 6); }
    values.push(x.puffs!.length); for (const p of x.puffs!) { const offset = values.length; values.push(p.texture, p.startSize, p.endSize, p.rotation, p.offset.x, p.offset.y, p.velocity.x, p.velocity.y);
      geometry.push(...[1, 2, 3, 4, 5, 6, 7].map(i => offset + i)); }
    // The Rust puff cursor is a witness only; source rendering does not expose it.
    values[10 + x.sourceShipId!.length] = -1; record(102, values, geometry);
  } return explosionPush(...entries); };
  const hulkPush = fx.hulkFragments.push.bind(fx.hulkFragments);
  fx.hulkFragments.push = (...entries) => { for (const h of entries) { const values = [h.id, ...shipId(h.sourceShip), h.pos.x, h.pos.y, h.vel.x, h.vel.y, h.facingRad, h.angularVel, h.collisionRadius,
      h.bounds.length, ...h.bounds.flatMap(p => [p.x, p.y]), h.mountSlotIds.length, ...h.mountSlotIds.map(Number), +!!h.breakup];
    if (h.breakup) { if (!breakupSequences.has(h.breakup)) breakupSequences.set(h.breakup, breakupSequences.size + 1);
      values.push(h.breakup.remainingSplits, h.breakup.interval, h.breakup.elapsed, h.breakup.nextInterval); } record(107, values, [3, 4, 5, 6, 7]); } return hulkPush(...entries); };
  const ctx = { playerShip: ships[0], enemyShip: ships[1], ships, capitalShips: ships.filter(s => s.spec.hullSize !== 'FIGHTER'),
    fighters: ships.filter(s => s.spec.hullSize === 'FIGHTER'), projectiles: weapon.projectiles, hulkFragments: fx.hulkFragments, fx, random, visualRandom: visual,
    statsTracker: stats, asteroids: asteroids.asteroids, addRadioMessage: () => {}, addCameraShake: () => {}, handleShipDestruction: (s: Ship) => engine.handleShipDestruction(s),
    queryAsteroidImpact: (p: Projectile) => asteroids.queryProjectileImpact(p) } as WeaponSimContext;
  Object.assign(engine, { playerShip: ships[0], enemyShip: ships[1], combatTime: 0, aftermathTime: 0, suppressDestructionSideEffects: false,
    transientCombatShips: new Set(ships.filter((_, i) => actors[i].transient)), shipLossNotifications: losses, random, visualRandom: visual,
    fxSystem: fx, statsTracker: stats, weaponSystem: weapon, getWeaponSimContext: () => ctx,
    addCameraShake: (amount: number, duration: number) => record(106, [amount, duration]),
    spawnDebris: (...args: Parameters<CombatFXSystem['spawnDebris']>) => { const before = debrisScope; debrisScope = 'death'; try { fx.spawnDebris(...args); } finally { debrisScope = before; } },
    addRadioMessage: (_name: string, side: string) => record(103, [+!!(side === 'HQ')]),
    addFloatingText: (...args: Parameters<CombatFXSystem['addFloatingText']>) => { fx.addFloatingText(...args);
      record(104, [+!!(args[1] === 'HULL DESTROYED'), args[0].x, args[0].y], [1, 2]); } });
  const world: SystemWorld = { ships, projectiles: weapon.projectiles, asteroids: asteroids.asteroids, combatRandom: random, deployMine: () => {} };
  // The real system-only launcher appends directly to this same authority array.
  // Observe all accepted launches, retaining their true ordered identity; only
  // ordinary onProjectile below owns the source ShotFired statistics callback.
  const projectilePush = weapon.projectiles.push.bind(weapon.projectiles);
  weapon.projectiles.push = (...entries) => {
    for (const p of entries) if (!serials.has(p.id)) {
      serials.set(p.id, ++serial); const owner = ships.find(s => s.id === p.sourceShipId)!;
      const h = handles[ships.indexOf(owner)]; sourceBindings.set(p.id, [h.slot, h.generation, { NONE: 0, BALLISTIC: 1, ENERGY: 2, MISSILE: 3 }[p.sourceWeaponType ?? 'NONE'],
        p.spawnLocation!.x, p.spawnLocation!.y, ...worldOutgoingWords(owner), owner.flux.maxFlux > 0 ? owner.flux.totalFlux / owner.flux.maxFlux : 0, +!!p.gravityCapturedBy]);
    }
    return projectilePush(...entries);
  };
  const collisionFX = { addFloatingDamage: fx.addFloatingDamage.bind(fx), spawnArmorDamageSparks: fx.spawnArmorDamageSparks.bind(fx),
    spawnDebris: fx.spawnDebris.bind(fx), spawnShieldRipple: fx.spawnShieldRipple.bind(fx), addFloatingText: fx.addFloatingText.bind(fx),
    spawnSparks: fx.spawnSparks.bind(fx), spawnAuthenticExplosion: fx.spawnAuthenticExplosion.bind(fx), detachContrail: () => {},
    addCameraShake: () => {}, getPlayerPos: () => ships[0].pos };
  function damage(index: number, amount: number) { ships[index].applyHullDamage(amount); core.apply([{ kind: 'hull-damage', id: index + 1, handle: handles[index], damage: amount }]); }
  function activate(index: number) { assertWorld(ships[index].system.activate(), name + ' source activation failed'); core.apply([{ kind: 'accepted-system', id: index + 1,
    handle: handles[index], systemId: 1, point: [ships[index].aimTargetWorld.x, ships[index].aimTargetWorld.y] }]); }
  function shield(index: number, up: boolean) { ships[index].shield.setActive(up); core.apply([{ kind: 'shield', id: index + 1, handle: handles[index], operation: up ? 'raise-raw' : 'lower-raw' }]); }
  function aim(index: number, point: [number, number]) { ships[index].aimTargetWorld.set(...point); core.apply([{ kind: 'shield-input', id: index + 1,
    handle: handles[index], aimX: point[0], aimY: point[1] }]); }
  async function step(dt: number, fire: boolean[] = [], numeric = false) {
    observations.length = 0; floatingObservations.length = 0;
    const releaseAudio = captureCombatAudio(event => { if (event.kind === 'play' && event.position && ['explosion', 'disabled_large'].includes(event.key)) {
      const source = ships.find(s => s.pos.x === event.position![0] && s.pos.y === event.position![1]); if (!source) return;
      record(event.key === 'explosion' ? 100 : 101, [...shipId(source), ...event.position, ...(event.key === 'explosion' ? [event.volume] : [])], [2, 3]); } });
    try {
    engine.combatTime += dt;
    const stages = new Map<Ship, ShipStepState>(), controls = new Map<Ship, WeaponControlStep>(),
      fireBudget = numeric ? new InFlightFireBudget(ships, weapon.projectiles, asteroids.asteroids) : undefined,
      fireWorld: FireControlWorld = { ships, projectiles: weapon.projectiles, asteroids: asteroids.asteroids,
        missiles: weapon.projectiles.filter(p => p.isRocket || p.spawnType === 'MISSILE' || p.isMine || p.isFlare), fireBudget };
    const onProjectile = (p: Projectile) => { weapon.projectiles.push(p);
      stats.recordShotFired(p.isPlayer ?? false); fireBudget?.add(p); };
    const onBeam = (_b: Beam) => { throw Error(name + ' unexpected beam in world scene'); };
    for (const ship of ships) { const stage = ship.prepareStep(dt, numeric ? ship.currentTargetShip : null, fireWorld); if (stage) stages.set(ship, stage); }
    for (const [ship, stage] of stages) ship.integrateStep(stage);
    for (const [ship, stage] of stages) controls.set(ship, ship.weaponControl.advanceState(stage.effectiveDt, ship));
    const intents: RustCommand[] = [];
    const fireOwner = { ships, playerShip: ships[0], externallyControlledShipIds: new Set(), projectiles: weapon.projectiles,
      beams: weapon.beams, asteroids: asteroids.asteroids, hulkFragments: fx.hulkFragments } as unknown as CombatEngine;
    if (numeric) FireControlQueryRoster.ownForWorker(fireOwner);
    const numericPlans = new Map<Ship, WeaponFirePlan>();
    if (numeric) {
      const view = beginStage(fireOwner, 'FIRE_QUERY', fireWorld); assertWorld(view, 'actual numeric fire admission');
      try {
        for (const [ship, control] of controls) if (!ship.isDead && !ship.isRetreated && ship.hullHp > 0)
          numericPlans.set(ship, (ship.weaponControl as unknown as FireMethods).planNumericFire(control, fireWorld, view));
      } finally { view.close(); }
    }
    for (const [ship, control] of controls) {
      const i = ships.indexOf(ship), methods = ship.weaponControl as unknown as FireMethods;
      if (numeric) {
        const plan = numericPlans.get(ship); if (plan) ship.weaponControl.commitFire(plan, onProjectile, onBeam); continue;
      }
      ship.weapons.forEach((m, j) => { const requested = fire[i] ?? false, allowed = ship.system.canFireWeapon(m); m.triggerHeld = requested;
        intents.push({ kind: 'fire-intent', id: i + 1, handle: handles[i], index: j, requested, triggerHeld: requested, angle: m.currentAngleRad });
        if (requested && allowed && control.canShipFire && methods.programFluxBudget(ship, m, dt)) methods.requestWeaponFire(m, ship, onProjectile, onBeam);
        methods.advanceWeaponLifecycle(m.lifecycleDt ?? dt, m, ship, control.canShipFire && allowed, onProjectile, onBeam); });
    } core.apply(intents);
    for (const [ship, stage] of stages) ship.finishStep(stage);
    nebula.update(ships);
    for (const ship of ships) if (!ship.isDead && !ship.isRetreated && !ship.isDocked) {
      for (const sys of ship.allSystems) sys.dispatchEvents(ship, world, dt * ship.subjectiveTimeMultiplier);
      for (const mod of installedHullMods(ship.spec)) mod.advanceCombat?.(ship, dt, world);
    }
    debrisScope = 'terrain'; try {
      advanceGravityFields(dt, ships, weapon.projectiles, asteroids.asteroids, fx.hulkFragments);
      advanceGravityDamage(dt, { ships, projectiles: weapon.projectiles, asteroids: asteroids.asteroids, hulkFragments: fx.hulkFragments }, {
        ...collisionFX, recordDamage: (owner, target, amount, area) => stats.recordDamageDealt(owner.isPlayer, 'ENERGY', amount, area, 0, target.isPlayer) });
      advanceGravityTerrain(dt, ships, fx.hulkFragments, collisionFX);
      asteroids.update(dt); asteroids.resolveShipCollisions(ships, collisionFX);
      const capitals = ships.filter(s => s.spec.hullSize !== 'FIGHTER');
      for (let i = 0; i < capitals.length; i++) for (let j = i + 1; j < capitals.length; j++) collision.resolveShipToShipCollision(capitals[i], capitals[j], collisionFX, dt);
      for (const root of ships.filter(s => !s.parentShip)) root.syncModuleTree();
    } finally { debrisScope = 'weapon'; }
    weapon.update(dt, ctx); fx.update(dt);
    for (const ship of ships) if (!ship.isDead && ship.hullHp <= 0) engine.handleShipDestruction(ship);
    core.step(dt); tick++; return core.snapshot();
    } finally { releaseAudio(); }
  }
  return { name, core, ships, handles, serials, sourceBindings, breakupSequences, random, visual, weapon, fx, stats, asteroids, engine, losses, observations, floatingObservations, damage, activate, shield, aim, step,
    get tick() { return tick; }, get serial() { return serial; } };
}

export type WorldFixture = Awaited<ReturnType<typeof worldFixture>>;
export function lifecycleWords(s: ShipSystem) { const p = s as unknown as { pendingActivationFlux: number; pendingActivationEvents: number; pendingActiveEvents: number;
  chargeRegenTimer: number; stageTimer: number; outEntryEffectLevel: number };
  return [['IDLE', 'IN', 'ACTIVE', 'OUT', 'COOLDOWN'].indexOf(s.state), s.effectLevel, +s.isActive, +s.isCoolingDown, s.activeTimer, s.cooldownTimer,
    s.charges, s.activationSerial, p.pendingActivationFlux, p.pendingActivationEvents, p.pendingActiveEvents, p.chargeRegenTimer, p.stageTimer, p.outEntryEffectLevel, +s.disabled]; }

