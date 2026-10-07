import type { FireControlWorld } from '../AutofireController';
import { POLICY_TUNING, shipPolicyAction } from '../learning/CombatPolicy';
import { BodyFlag, type StageView } from './StageProtocol';
import type { WeaponMount, Projectile } from '../../simulation/Weapon';
import type { Ship } from '../../simulation/Ship';
import { combatTeam } from '../../simulation/CombatTeams';
import { coordinateLength } from '../../math/Vector2';

/** Minimal source comparison already recorded in combat-core-replacement-plan:
 * local ../starsector-core and ../decompiled absent on 2026-10-04; no new parity
 * claim. Port sources: AutofireController.solveAim/decide, NativeAim,
 * FireTargetUtility, InFlightFireBudget and WeaponAim/group scheduling.
 * Expected: same target/clock/RNG/resource order, 60Hz bore safety and emission.
 * Web/source/real-game comparison is pending, not implied by this implementation.
 *
 * This is a FIRE_QUERY supplement, NOT a second world codec. Shared transforms,
 * identity, geometry, range/speed, lifecycle and visibility stay in StageView.
 * Missing rules are published once per epoch; hot solvers never dereference refs.
 */
export const FireHint = Object.freeze({
  ANTI_FTR: 1, STRIKE: 2, DO_NOT_AIM: 4, GUIDED_POOR: 8, PD_ALSO: 16,
  USE_VS_FRIGATES: 32, IGNORES_FLARES: 64, DO_NOT_CONSERVE: 128,
  USE_LESS_VS_SHIELDS: 256
});
export interface FireWeaponInput {
  hints: number; passFighters: boolean; missileBody: boolean; beamBurst: boolean;
  proximity: number; hasProximity: boolean; weaponMissile: boolean; regen: number; sizeScale: number; accuracyBonus: number;
  idle: number; hasMuzzleOffset: boolean; offsetX: number; offsetY: number; reload: number;
  reserved: boolean; interruptible: boolean; sourceCharge: number;
  cycle: number; cooldownRate: number; baseRange: number; baseSpeed: number;
  baseAngle: number; arc: number; relativeX: number; relativeY: number;
  tractor: boolean; deflector: boolean;
}
export interface FireArmorInput {
  cols: number; rows: number; width: number; height: number; minX: number; minY: number;
  cells: Float32Array; effective: number; dynamicEffective: number; residual: number; reduction: number;
  armorMult: number[]; hullMult: number[]; native: boolean;
}
export interface FireInputs {
  epoch: number; revision: number; projectileCount: number;
  shieldOn: number[]; targetRadius: number[]; vast: number[]; noFireThrough: number[];
  pdIgnoreFlares: number[]; accuracy: number[]; currentTarget: number[];
  autonomous: number[]; player: number[]; aimX: number[]; aimY: number[];
  mainTrigger: number[]; finish: number[]; pressure: number[];
  nativeThreat: number[]; armor: FireArmorInput[];
  weapons: FireWeaponInput[];
  decoy: number[]; flare: number[]; missileHp: number[];
  flightLife: number[]; flightLifePresent: number[]; eligibleBudget: number[]; arming: number[]; sourceSpeed: number[];
  projectileTeam: number[]; explicitProjectileTeam: number[]; budgetTeam: number[];
  budgetRows: number[][]; budgetScope: Uint8Array; budgetComplete: boolean; budgetOwner?: object;
  asteroidX: number[]; asteroidY: number[]; asteroidVx: number[]; asteroidVy: number[];
  asteroidRadius: number[]; asteroidHp: number[];
  /** ID lexicographic ranks compiled at publication, not in a candidate comparator. */
  shipTie: number[]; projectileTie: number[];
  scopeByRoster: WeakMap<readonly object[], Uint8Array>;
  missileScopeByRoster: WeakMap<readonly object[], Uint8Array>;
}
const inputs = new WeakMap<StageView, FireInputs>();
const types = ['KINETIC', 'HIGH_EXPLOSIVE', 'ENERGY', 'FRAGMENTATION'] as const;
const hintNames = Object.keys(FireHint) as (keyof typeof FireHint)[];

function tieRanks(ids: readonly (string | number)[]): number[] {
  const order = ids.map((_, i) => i).sort((a, b) => String(ids[a]).localeCompare(String(ids[b])));
  const ranks: number[] = [];
  let rank = 0;
  for (let i = 0; i < order.length; i++) {
    if (i && String(ids[order[i]]).localeCompare(String(ids[order[i - 1]])) !== 0) rank++;
    ranks[order[i]] = rank;
  }
  return ranks;
}
function weaponInput(m: WeaponMount, old?: FireWeaponInput): FireWeaponInput {
  const s = m.spec, hints = s.aiHints ?? [];
  const primary = m.mountType === 'HARDPOINT' ? s.hardpointOffsets : s.turretOffsets;
  const secondary = m.mountType === 'HARDPOINT' ? s.turretOffsets : s.hardpointOffsets;
  const offsets = primary && primary.length >= 2 ? primary : secondary;
  const index = offsets ? (m.barrelIndex % Math.floor(offsets.length / 2)) * 2 : -1;
  const beamBurst = s.isBeam && s.beamVisualMode === 'BURST';
  let cycle = s.isBeam
    ? (s.beamDuration ?? 0) + (s.beamBurstDelay ?? 0) + (s.beamSourceChargeupTime ?? 0) + (s.beamSourceChargedownTime ?? 0)
    : (s.burstSize ?? 1) > 50 ? 3
      : Math.max(0, (s.burstSize ?? 1) - 1) * (s.burstDelay ?? 0) + s.refireDelay + (s.chargeTime ?? 0);
  if (s.isBeam && !(cycle > 0)) cycle = 3;
  return Object.assign(old ?? {}, {
    hints: hintNames.reduce((mask, name) => mask | (hints.includes(name) ? FireHint[name] : 0), 0),
    passFighters: !!s.passThroughFighters && !s.passThroughFightersOnlyWhenDestroyed,
    missileBody: !!s.isRocket || s.spawnType === 'MISSILE', beamBurst: !!beamBurst,
    proximity: s.proximityFuse?.range ?? 0, hasProximity: !!s.proximityFuse,
    weaponMissile: s.weaponType === 'MISSILE', regen: s.ammoRegenPerSec ?? 0,
    sizeScale: s.isPointDefense || hints.includes('PD') || hints.includes('PD_ONLY') || s.mountSize === 'SMALL'
      ? .25 : s.mountSize === 'MEDIUM' ? .5 : 1,
    accuracyBonus: s.autofireAccuracyBonus ?? 0, idle: m.aimIdleSeconds ?? 15.1,
    hasMuzzleOffset: !!offsets && offsets.length >= 2,
    offsetX: offsets?.[index] ?? 0, offsetY: offsets?.[index + 1] ?? 0,
    reload: m.reloadDelayRemaining ?? 0, reserved: !!m.burstFluxReserved,
    interruptible: !!s.interruptibleBurst, sourceCharge: s.beamSourceChargeupTime ?? 0,
    cycle, cooldownRate: 1, baseRange: s.range, baseSpeed: s.projSpeed,
    baseAngle: m.baseAngleDeg, arc: m.arcDeg, relativeX: m.relativePos.x, relativeY: m.relativePos.y,
    tractor: !!s.gravityTractor, deflector: !!s.gravityDeflector,
  }) as FireWeaponInput;
}

export function publishFireInputs(v: StageView, world: FireControlWorld): FireInputs {
  let f = inputs.get(v);
  if (f && f.epoch === v.epoch && f.revision === v.revision && f.projectileCount === v.projectileCount
    && f.budgetOwner === world.fireBudget) return f;
  f ??= {
    epoch: -1, revision: -1, projectileCount: 0, shieldOn: [], targetRadius: [], vast: [], noFireThrough: [],
    pdIgnoreFlares: [], accuracy: [], currentTarget: [], autonomous: [], player: [], aimX: [], aimY: [],
    mainTrigger: [], finish: [], pressure: [], nativeThreat: [], armor: [], weapons: [],
    decoy: [], flare: [], missileHp: [], flightLife: [], flightLifePresent: [], eligibleBudget: [],
    arming: [], sourceSpeed: [], projectileTeam: [], explicitProjectileTeam: [], budgetTeam: [],
    budgetRows: [], budgetScope: new Uint8Array(), budgetComplete: true,
    asteroidX: [], asteroidY: [], asteroidVx: [], asteroidVy: [], asteroidRadius: [], asteroidHp: [],
    shipTie: [], projectileTie: [], scopeByRoster: new WeakMap(), missileScopeByRoster: new WeakMap(),
  };
  inputs.set(v, f);
  f.scopeByRoster = new WeakMap();
  f.missileScopeByRoster = new WeakMap();
  f.budgetOwner = world.fireBudget; f.budgetComplete = true;
  if (f.budgetScope.length !== v.bodyCount) f.budgetScope = new Uint8Array(v.bodyCount);
  else f.budgetScope.fill(0);
  for (const rows of f.budgetRows) if (rows) rows.length = 0;
  // These are TS-private native ledger DATA fields, inspected only during input
  // publication behind the private stage + native-budget identity admission.
  // Do not rebuild the ledger from "all potentially eligible rounds": it records
  // ACTUAL add() calls, including prior launches and later disarmed raw pressure.
  const sourceMap = world.fireBudget
    ? Object.getOwnPropertyDescriptor(world.fireBudget, 'sources')?.value as Map<string, Ship> | undefined : undefined;
  const ledger = world.fireBudget
    ? Object.getOwnPropertyDescriptor(world.fireBudget, 'byTarget')?.value as Map<string, readonly Projectile[]> | undefined : undefined;
  if (world.fireBudget && (!(sourceMap instanceof Map) || !(ledger instanceof Map))) f.budgetComplete = false;
  if (sourceMap instanceof Map) for (const source of sourceMap.values()) {
    const row = v.rowOf.get(source);
    if (row === undefined) f.budgetComplete = false; else f.budgetScope[row] = 1;
  }
  if (ledger instanceof Map) for (const [targetId, shots] of ledger) {
    const target = v.rowById.get(targetId);
    if (target === undefined) continue;
    const rows = f.budgetRows[target] ??= [];
    for (const shot of shots) {
      const row = v.projectileRowOf.get(shot);
      if (row === undefined) f.budgetComplete = false; else rows.push(row);
    }
  }
  for (let r = 0; r < v.bodyCount; r++) {
    const ship = v.ships[r], armor = ship.armor;
    f.shieldOn[r] = v.ai?.rawShieldActive[r] ?? +ship.shield.isActive;
    f.vast[r] = v.ai?.vastBulk[r] ?? +ship.hasVastBulk;
    f.targetRadius[r] = Math.max(v.bodies.radius[r], f.shieldOn[r]
      && v.bodies.shieldType[r] !== 0 && v.bodies.shieldType[r] !== 3
      ? v.bodies.shieldRadius[r] + coordinateLength(v.bodies.shieldX[r] - v.bodies.x[r], v.bodies.shieldY[r] - v.bodies.y[r]) : 0);
    f.noFireThrough[r] = +(ship.spec.sourceHullTraits?.includes('do_not_fire_through') ?? false);
    f.pdIgnoreFlares[r] = ship.hullStats.pdIgnoresFlares;
    f.accuracy[r] = ship.hullStats.autofireAimAccuracy;
    f.currentTarget[r] = ship.currentTargetShip ? v.rowOf.get(ship.currentTargetShip) ?? -1 : -1;
    f.autonomous[r] = +(ship.fireControlMode === 'AI'); f.player[r] = v.ai?.player[r] ?? +ship.isPlayer;
    f.aimX[r] = ship.aimTargetWorld.x; f.aimY[r] = ship.aimTargetWorld.y;
    f.mainTrigger[r] = +ship.isFiringMain;
    const tuning = POLICY_TUNING[shipPolicyAction(ship)];
    f.finish[r] = tuning.finish; f.pressure[r] = tuning.pressure;
    f.nativeThreat[r] = +ship.hasNativeThreatPhaseHooks;
    const native = ship.hasNativeFireBudgetPolicyInputs;
    let a = f.armor[r];
    if (!a) a = f.armor[r] = { cols: 0, rows: 0, width: 0, height: 0, minX: 0, minY: 0,
      cells: new Float32Array(), effective: 1, dynamicEffective: 1, residual: 0, reduction: 0, armorMult: [], hullMult: [], native };
    a.native = native; a.cols = armor.cols; a.rows = armor.rows;
    a.width = armor.cellWidth; a.height = armor.cellHeight; a.minX = armor.minX; a.minY = armor.minY;
    // Unknown hooks are not moved out of their original per-target call position.
    if (native) {
      const cells = armor.copyCells();
      if (a.cells.length !== cells.length) a.cells = cells; else a.cells.set(cells);
      a.effective = armor.effectiveArmorMultiplier;
      a.dynamicEffective = armor.dynamicEffectiveArmorMultiplier?.() ?? 1;
      a.residual = armor.maxArmorRating * .05 * armor.minArmorFractionMultiplier;
      a.reduction = armor.maxDamageReduction;
      for (let t = 0; t < types.length; t++) {
        const modifiers = armor.damageTakenModifiers?.(types[t]);
        a.armorMult[t] = modifiers?.armor ?? 1; a.hullMult[t] = modifiers?.hull ?? 1;
      }
    }
  }
  for (let r = 0; r < v.weaponCount; r++) f.weapons[r] = weaponInput(v.mounts[r], f.weapons[r]);
  for (let r = 0; r < v.projectileCount; r++) {
    const p = v.projectileRefs[r];
    f.decoy[r] = +!!p.isFighterDecoy; f.flare[r] = +!!p.isFlare;
    f.missileHp[r] = p.hitpoints ?? 0; f.flightLife[r] = p.flightTimeRemaining ?? Infinity;
    f.flightLifePresent[r] = +(p.flightTimeRemaining !== undefined);
    f.eligibleBudget[r] = +(Number.isFinite(p.damage) && p.damage > 0 && Number.isFinite(p.rangeRemaining)
      && p.rangeRemaining > 0 && !p.didDamage && !p.isDisarmed && !p.collisionDisabled && !p.isFlare
      && !p.isFighterDecoy && !p.isMine && !p.isHullExplosion && p.targetProjectileId === undefined
      && !p.mirv && p.spawnType !== 'BALLISTIC_AS_BEAM' && (p.hitpoints === undefined || p.hitpoints > 0)
      && (p.flightTimeRemaining === undefined || p.flightTimeRemaining > 0));
    f.arming[r] = p.armingTimeRemaining ?? 0;
    f.sourceSpeed[r] = p.sourceMoveSpeed ?? coordinateLength(v.projectiles.vx[r], v.projectiles.vy[r]);
    // Stage team may be absent for source-bound rounds; publish the exact fallback once.
    const explicitTeam = combatTeam(p);
    f.explicitProjectileTeam[r] = explicitTeam ?? NaN;
    f.projectileTeam[r] = explicitTeam ??
      (v.projectiles.sourceRow[r] < 0 ? NaN : v.bodies.team[v.projectiles.sourceRow[r]]);
    const budgetSource = sourceMap instanceof Map ? sourceMap.get(p.sourceShipId) : undefined;
    const budgetSourceRow = budgetSource ? v.rowOf.get(budgetSource) : undefined;
    f.budgetTeam[r] = p.teamId ?? (budgetSourceRow === undefined ? undefined : v.bodies.team[budgetSourceRow]) ?? explicitTeam ?? NaN;
  }
  const asteroids = world.asteroids;
  f.asteroidHp.length = asteroids.length;
  for (let r = 0; r < asteroids.length; r++) {
    const a = asteroids[r];
    f.asteroidX[r] = a.pos.x; f.asteroidY[r] = a.pos.y; f.asteroidVx[r] = a.vel.x; f.asteroidVy[r] = a.vel.y;
    f.asteroidRadius[r] = a.radius; f.asteroidHp[r] = a.hp;
  }
  const ranks = tieRanks([...v.ships.map(ship => ship.id), ...v.projectileRefs.map(p => p.id)]);
  f.shipTie = ranks.slice(0, v.bodyCount);
  f.projectileTie = ranks.slice(v.bodyCount);
  f.epoch = v.epoch; f.revision = v.revision; f.projectileCount = v.projectileCount;
  return f;
}

/** Some worlds restrict contacts (e.g. parent/module update). Compile membership
 * once per actual roster/epoch, not inside any weapon or candidate query. */
export function fireScope(v: StageView, f: FireInputs, world: FireControlWorld): Uint8Array {
  let scope = f.scopeByRoster.get(world.ships);
  if (!scope) {
    scope = new Uint8Array(v.bodyCount);
    for (const ship of world.ships) { const row = v.rowOf.get(ship); if (row !== undefined) scope[row] = 1; }
    f.scopeByRoster.set(world.ships, scope);
  }
  return scope;
}

/** The root's filtered snapshot can predate newly spawned missiles present in
 * the wing's live projectile roster. Cache each actual array separately within
 * this publication; membership does not reorder the existing stage-row scan
 * (native missile rosters are subsequences of the projectile list). */
export function fireMissileScope(v: StageView, f: FireInputs, world: FireControlWorld): Uint8Array {
  let scope = f.missileScopeByRoster.get(world.missiles);
  if (!scope) {
    scope = new Uint8Array(v.projectileCount);
    for (const missile of world.missiles) {
      const row = v.projectileRowOf.get(missile);
      if (row !== undefined) scope[row] = 1;
    }
    f.missileScopeByRoster.set(world.missiles, scope);
  }
  return scope;
}

export function fireAvailable(v: StageView, row: number): boolean {
  return !(v.bodies.flags[row] & (BodyFlag.DEAD | BodyFlag.PHASED | BodyFlag.OVERLOADED | BodyFlag.VENTING));
}
