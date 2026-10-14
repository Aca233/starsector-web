import type { FireControlWorld } from '../AutofireController';
import { POLICY_TUNING, shipPolicyAction } from '../learning/CombatPolicy';
import { BodyFlag as B, ProjectileFlag as P, assertStageReadable } from './StageProtocol';
import type { StageView } from './StageBridge';
import type { WeaponMount, Projectile } from '../../simulation/Weapon';
import type { Ship } from '../../simulation/Ship';
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
export { FireHint, fireAvailable, assertFireInputs } from './FireProtocol';
export type { FireWeaponInput, FireArmorInput, FireData, FireReadInputs } from './FireProtocol';
import { FireHint, type FireWeaponInput, type FireData } from './FireProtocol';

export interface FireTeamScope {
  readonly hostileBodies: readonly number[];
  readonly friendlyBlockers: readonly number[];
  readonly friendlyNonFighterBlockers: readonly number[];
}

/** Mutable producer storage plus object-roster membership caches. */
export interface FireInputs extends FireData {
  budgetOwner?: object;
  armorSynced: Uint8Array;
  scopeByRoster: WeakMap<readonly object[], Uint8Array>;
  teamScopeByRoster: WeakMap<readonly object[], Map<number, FireTeamScope>>;
  missileScopeByRoster: WeakMap<readonly object[], Uint8Array>;
  missileRowsByRoster: WeakMap<readonly object[], readonly number[]>;
  cachedShipIds?: string[];
  cachedShipOrder?: number[];
  cachedShipOnlyTie?: number[];
  rawShipTie: number[];
  rawProjectileTie: number[];
  tieSynced: boolean;
  currentView?: StageView;
}

const inputs = new WeakMap<object, FireInputs>();
const types = ['KINETIC', 'HIGH_EXPLOSIVE', 'ENERGY', 'FRAGMENTATION'] as const;
const weaponHintCache = new WeakMap<readonly string[], { hintMask: number; hasPdHint: boolean }>();
interface CachedWeaponInput {
  spec: WeaponMount['spec'];
  mountType: WeaponMount['mountType'];
  offsets: readonly number[] | undefined;
  barrelCount: number;
  barrelIndex: number;
  input: FireWeaponInput;
}
const weaponMountCache = new WeakMap<WeaponMount, CachedWeaponInput>();
const shipArmorCache = new WeakMap<Ship, FireInputs['armor'][number]>();
const specNoFireThroughCache = new WeakMap<Ship['spec'], number>();

const EMPTY_SCOPE = new Uint8Array(0);
const EMPTY_ROWS: readonly number[] = Object.freeze([]);

function updateTieRanks(f: FireInputs, v: StageView): void {
  f.tieSynced = true;
  const shipTie = f.rawShipTie, projectileTie = f.rawProjectileTie;
  const bodyCount = v.bodyCount, projCount = v.projectileCount;
  let shipIds = f.cachedShipIds;
  let shipOrder = f.cachedShipOrder;
  let shipOnlyTie = f.cachedShipOnlyTie;
  let shipsUnchanged = !!shipIds && !!shipOrder && !!shipOnlyTie && shipIds.length === bodyCount;
  if (shipsUnchanged) {
    for (let i = 0; i < bodyCount; i++) {
      if (shipIds![i] !== v.ships[i].id) { shipsUnchanged = false; break; }
    }
  }
  if (!shipsUnchanged) {
    shipIds = new Array<string>(bodyCount);
    shipOrder = new Array<number>(bodyCount);
    shipOnlyTie = new Array<number>(bodyCount);
    for (let i = 0; i < bodyCount; i++) {
      shipIds[i] = String(v.ships[i].id);
      shipOrder[i] = i;
    }
    shipOrder.sort((a, b) => shipIds![a].localeCompare(shipIds![b]));
    let rank = 0;
    for (let i = 0; i < bodyCount; i++) {
      if (i && shipIds[shipOrder[i]].localeCompare(shipIds[shipOrder[i - 1]]) !== 0) rank++;
      shipOnlyTie[shipOrder[i]] = rank;
    }
    f.cachedShipIds = shipIds;
    f.cachedShipOrder = shipOrder;
    f.cachedShipOnlyTie = shipOnlyTie;
  }
  shipTie.length = bodyCount;
  projectileTie.length = projCount;
  const projOrder: number[] = [];
  for (let i = 0; i < projCount; i++) {
    projectileTie[i] = 0;
    if (f.missileHp[i] > 0 || f.decoy[i]) projOrder.push(i);
  }
  if (projOrder.length === 0) {
    for (let i = 0; i < bodyCount; i++) shipTie[i] = shipOnlyTie![i];
    return;
  }
  const projIds = new Array<string>(projCount);
  for (let i = 0; i < projOrder.length; i++) {
    const r = projOrder[i];
    projIds[r] = String(v.projectileRefs[r].id);
  }
  projOrder.sort((a, b) => projIds[a].localeCompare(projIds[b]));
  let sIdx = 0, pIdx = 0, rank = 0;
  let prevStr: string | undefined;
  while (sIdx < bodyCount || pIdx < projOrder.length) {
    let takeShip: boolean;
    if (sIdx >= bodyCount) takeShip = false;
    else if (pIdx >= projOrder.length) takeShip = true;
    else takeShip = shipIds![shipOrder![sIdx]].localeCompare(projIds[projOrder[pIdx]]) <= 0;
    if (takeShip) {
      const sRow = shipOrder![sIdx++];
      const str = shipIds![sRow];
      if (prevStr !== undefined && str.localeCompare(prevStr) !== 0) rank++;
      shipTie[sRow] = rank;
      prevStr = str;
    } else {
      const pRow = projOrder[pIdx++];
      const str = projIds[pRow];
      if (prevStr !== undefined && str.localeCompare(prevStr) !== 0) rank++;
      projectileTie[pRow] = rank;
      prevStr = str;
    }
  }
}

function weaponInput(m: WeaponMount, old?: FireWeaponInput): FireWeaponInput {
  const s = m.spec;
  const cached = weaponMountCache.get(m);
  if (cached && cached.spec === s && cached.mountType === m.mountType) {
    const input = cached.input;
    input.idle = m.aimIdleSeconds ?? 15.1;
    input.reload = m.reloadDelayRemaining ?? 0;
    input.reserved = !!m.burstFluxReserved;
    input.baseAngle = m.baseAngleDeg;
    input.arc = m.arcDeg;
    input.relativeX = m.relativePos.x;
    input.relativeY = m.relativePos.y;
    if (cached.barrelCount > 1 && cached.barrelIndex !== m.barrelIndex) {
      cached.barrelIndex = m.barrelIndex;
      const index = (m.barrelIndex % cached.barrelCount) * 2;
      const offsets = cached.offsets!;
      input.offsetX = offsets[index] ?? 0;
      input.offsetY = offsets[index + 1] ?? 0;
    }
    return input;
  }
  const hints = s.aiHints;
  let hintMask = 0, hasPdHint = false;
  if (hints) {
    const cached = weaponHintCache.get(hints);
    if (cached !== undefined) {
      hintMask = cached.hintMask;
      hasPdHint = cached.hasPdHint;
    } else {
      for (let i = 0; i < hints.length; i++) {
        const h = hints[i];
        if (h === 'PD' || h === 'PD_ONLY') hasPdHint = true;
        const bit = (FireHint as unknown as Record<string, number>)[h];
        if (bit) hintMask |= bit;
      }
      if (Object.isFrozen(hints)) weaponHintCache.set(hints, { hintMask, hasPdHint });
    }
  }
  const primary = m.mountType === 'HARDPOINT' ? s.hardpointOffsets : s.turretOffsets;
  const secondary = m.mountType === 'HARDPOINT' ? s.turretOffsets : s.hardpointOffsets;
  const offsets = primary && primary.length >= 2 ? primary : secondary;
  const barrelCount = offsets ? Math.floor(offsets.length / 2) : 0;
  const index = barrelCount > 0 ? (m.barrelIndex % barrelCount) * 2 : -1;
  const beamBurst = s.isBeam && s.beamVisualMode === 'BURST';
  let cycle = s.isBeam
    ? (s.beamDuration ?? 0) + (s.beamBurstDelay ?? 0) + (s.beamSourceChargeupTime ?? 0) + (s.beamSourceChargedownTime ?? 0)
    : (s.burstSize ?? 1) > 50 ? 3
      : Math.max(0, (s.burstSize ?? 1) - 1) * (s.burstDelay ?? 0) + s.refireDelay + (s.chargeTime ?? 0);
  if (s.isBeam && !(cycle > 0)) cycle = 3;
  const sizeScale = s.isPointDefense || hasPdHint || s.mountSize === 'SMALL'
    ? .25 : s.mountSize === 'MEDIUM' ? .5 : 1;
  let out: FireWeaponInput;
  if (old) {
    old.hints = hintMask;
    old.passFighters = !!s.passThroughFighters && !s.passThroughFightersOnlyWhenDestroyed;
    old.missileBody = !!s.isRocket || s.spawnType === 'MISSILE';
    old.beamBurst = !!beamBurst;
    old.proximity = s.proximityFuse?.range ?? 0;
    old.hasProximity = !!s.proximityFuse;
    old.weaponMissile = s.weaponType === 'MISSILE';
    old.regen = s.ammoRegenPerSec ?? 0;
    old.sizeScale = sizeScale;
    old.accuracyBonus = s.autofireAccuracyBonus ?? 0;
    old.idle = m.aimIdleSeconds ?? 15.1;
    old.hasMuzzleOffset = !!offsets && offsets.length >= 2;
    old.offsetX = offsets?.[index] ?? 0;
    old.offsetY = offsets?.[index + 1] ?? 0;
    old.reload = m.reloadDelayRemaining ?? 0;
    old.reserved = !!m.burstFluxReserved;
    old.interruptible = !!s.interruptibleBurst;
    old.sourceCharge = s.beamSourceChargeupTime ?? 0;
    old.cycle = cycle;
    old.cooldownRate = 1;
    old.baseRange = s.range;
    old.baseSpeed = s.projSpeed;
    old.baseAngle = m.baseAngleDeg;
    old.arc = m.arcDeg;
    old.relativeX = m.relativePos.x;
    old.relativeY = m.relativePos.y;
    old.tractor = !!s.gravityTractor;
    old.deflector = !!s.gravityDeflector;
    out = old;
  } else {
    out = {
      hints: hintMask,
      passFighters: !!s.passThroughFighters && !s.passThroughFightersOnlyWhenDestroyed,
      missileBody: !!s.isRocket || s.spawnType === 'MISSILE', beamBurst: !!beamBurst,
      proximity: s.proximityFuse?.range ?? 0, hasProximity: !!s.proximityFuse,
      weaponMissile: s.weaponType === 'MISSILE', regen: s.ammoRegenPerSec ?? 0,
      sizeScale,
      accuracyBonus: s.autofireAccuracyBonus ?? 0, idle: m.aimIdleSeconds ?? 15.1,
      hasMuzzleOffset: !!offsets && offsets.length >= 2,
      offsetX: offsets?.[index] ?? 0, offsetY: offsets?.[index + 1] ?? 0,
      reload: m.reloadDelayRemaining ?? 0, reserved: !!m.burstFluxReserved,
      interruptible: !!s.interruptibleBurst, sourceCharge: s.beamSourceChargeupTime ?? 0,
      cycle, cooldownRate: 1, baseRange: s.range, baseSpeed: s.projSpeed,
      baseAngle: m.baseAngleDeg, arc: m.arcDeg, relativeX: m.relativePos.x, relativeY: m.relativePos.y,
      tractor: !!s.gravityTractor, deflector: !!s.gravityDeflector,
    };
  }
  if (Object.isFrozen(s) && (!offsets || Object.isFrozen(offsets))) {
    weaponMountCache.set(m, { spec: s, mountType: m.mountType, offsets, barrelCount, barrelIndex: m.barrelIndex, input: out });
  }
  return out;
}

function syncTargetArmor(v: StageView, f: FireInputs, r: number): void {
  if (f.armorSynced[r]) return;
  f.armorSynced[r] = 1;
  const a = f.armor[r];
  if (!a || !a.native) return;
  const armor = v.ships[r].armor;
  a.cells = armor.copyCellsInto(a.cells);
  a.effective = armor.effectiveArmorMultiplier;
  a.dynamicEffective = armor.dynamicEffectiveArmorMultiplier?.() ?? 1;
  a.residual = armor.maxArmorRating * .05 * armor.minArmorFractionMultiplier;
  a.reduction = armor.maxDamageReduction;
  for (let t = 0; t < types.length; t++) {
    const modifiers = armor.damageTakenModifiers?.(types[t]);
    a.armorMult[t] = modifiers?.armor ?? 1; a.hullMult[t] = modifiers?.hull ?? 1;
  }
}

function updateBudgetLedger(v: StageView, f: FireInputs, fireBudget: FireControlWorld['fireBudget']): void {
  f.budgetOwner = fireBudget;
  f.budgetComplete = true;
  if (f.budgetScope.length !== v.bodyCount) f.budgetScope = new Uint8Array(v.bodyCount);
  else f.budgetScope.fill(0);
  for (const rows of f.budgetRows) if (rows) rows.length = 0;
  const sourceMap = fireBudget
    ? Object.getOwnPropertyDescriptor(fireBudget, 'sources')?.value as Map<string, Ship> | undefined : undefined;
  const ledger = fireBudget
    ? Object.getOwnPropertyDescriptor(fireBudget, 'byTarget')?.value as Map<string, readonly Projectile[]> | undefined : undefined;
  const validSourceMap = sourceMap instanceof Map ? sourceMap : undefined;
  if (fireBudget && (!validSourceMap || !(ledger instanceof Map))) f.budgetComplete = false;
  if (validSourceMap) for (const source of validSourceMap.values()) {
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
    if (rows.length > 0) syncTargetArmor(v, f, target);
  }
  for (let r = 0; r < v.projectileCount; r++) {
    const p = v.projectileRefs[r];
    const pTeam = p.teamId;
    if (pTeam !== undefined && pTeam !== null) {
      f.budgetTeam[r] = pTeam;
      continue;
    }
    const budgetSource = validSourceMap ? validSourceMap.get(p.sourceShipId) : undefined;
    const budgetSourceRow = budgetSource ? v.rowOf.get(budgetSource) : undefined;
    f.budgetTeam[r] = (budgetSourceRow === undefined ? undefined : v.bodies.team[budgetSourceRow]) ?? f.explicitProjectileTeam[r] ?? NaN;
  }
}

export function publishFireInputs(v: StageView, world: FireControlWorld): FireInputs {
  assertStageReadable(v, 'FIRE_QUERY');
  let f = inputs.get(v.bodies);
  if (f && f.epoch === v.epoch && f.revision === v.revision && f.projectileCount === v.projectileCount) {
    f.currentView = v;
    if (f.budgetOwner === world.fireBudget) return f;
    if (!world.fireBudget) { f.budgetComplete = true; return f; }
    updateBudgetLedger(v, f, world.fireBudget);
    return f;
  }
  f ??= {
    epoch: -1, revision: -1, projectileCount: 0, shieldOn: [], targetRadius: [], vast: [], noFireThrough: [],
    pdIgnoreFlares: [], accuracy: [], currentTarget: [], autonomous: [], player: [], aimX: [], aimY: [],
    mainTrigger: [], finish: [], pressure: [], nativeThreat: [], armor: [], armorSynced: new Uint8Array(), weapons: [],
    decoy: [], flare: [], missileHp: [], flightLife: [], flightLifePresent: [], eligibleBudget: [],
    arming: [], sourceSpeed: [], projectileTeam: [], explicitProjectileTeam: [], budgetTeam: [],
    budgetRows: [], budgetScope: new Uint8Array(), budgetComplete: true,
    asteroidX: [], asteroidY: [], asteroidVx: [], asteroidVy: [], asteroidRadius: [], asteroidHp: [],
    rawShipTie: [], rawProjectileTie: [], tieSynced: false,
    get shipTie(): number[] {
      if (!this.tieSynced) updateTieRanks(this, this.currentView!);
      return this.rawShipTie;
    },
    get projectileTie(): number[] {
      if (!this.tieSynced) updateTieRanks(this, this.currentView!);
      return this.rawProjectileTie;
    },
    scopeByRoster: new WeakMap(), teamScopeByRoster: new WeakMap(),
    missileScopeByRoster: new WeakMap(), missileRowsByRoster: new WeakMap(),
  };
  inputs.set(v.bodies, f);
  f.currentView = v;
  f.tieSynced = false;
  f.scopeByRoster = new WeakMap();
  f.teamScopeByRoster = new WeakMap();
  f.missileScopeByRoster = new WeakMap();
  f.missileRowsByRoster = new WeakMap();
  if (f.armorSynced.length < v.bodyCount) f.armorSynced = new Uint8Array(v.bodyCount);
  else f.armorSynced.fill(0, 0, v.bodyCount);
  for (let r = 0; r < v.bodyCount; r++) {
    const ship = v.ships[r], armor = ship.armor, spec = ship.spec;
    f.shieldOn[r] = v.ai?.rawShieldActive[r] ?? +ship.shield.isActive;
    f.vast[r] = v.ai?.vastBulk[r] ?? +ship.hasVastBulk;
    f.targetRadius[r] = Math.max(v.bodies.radius[r], f.shieldOn[r]
      && v.bodies.shieldType[r] !== 0 && v.bodies.shieldType[r] !== 3
      ? v.bodies.shieldRadius[r] + coordinateLength(v.bodies.shieldX[r] - v.bodies.x[r], v.bodies.shieldY[r] - v.bodies.y[r]) : 0);
    let noFireThrough = specNoFireThroughCache.get(spec);
    if (noFireThrough === undefined) {
      noFireThrough = +(spec.sourceHullTraits?.includes('do_not_fire_through') ?? false);
      if (Object.isFrozen(spec) && (!spec.sourceHullTraits || Object.isFrozen(spec.sourceHullTraits))) {
        specNoFireThroughCache.set(spec, noFireThrough);
      }
    }
    f.noFireThrough[r] = noFireThrough;
    f.pdIgnoreFlares[r] = ship.hullStats.pdIgnoresFlares;
    f.accuracy[r] = ship.hullStats.autofireAimAccuracy;
    f.currentTarget[r] = ship.currentTargetShip ? v.rowOf.get(ship.currentTargetShip) ?? -1 : -1;
    f.autonomous[r] = +(ship.fireControlMode === 'AI'); f.player[r] = v.ai?.player[r] ?? +ship.isPlayer;
    f.aimX[r] = ship.aimTargetWorld.x; f.aimY[r] = ship.aimTargetWorld.y;
    f.mainTrigger[r] = +ship.isFiringMain;
    const tuning = POLICY_TUNING[shipPolicyAction(ship)];
    f.finish[r] = tuning.finish; f.pressure[r] = tuning.pressure;
    const nativeThreat = ship.hasNativeThreatPhaseHooks;
    f.nativeThreat[r] = +nativeThreat;
    const native = nativeThreat && ship.hasNativeFireBudgetPolicyInputs;
    let a = shipArmorCache.get(ship);
    if (!a) {
      a = { cols: 0, rows: 0, width: 0, height: 0, minX: 0, minY: 0,
        cells: new Float32Array(), effective: 1, dynamicEffective: 1, residual: 0, reduction: 0, armorMult: [], hullMult: [], native };
      shipArmorCache.set(ship, a);
    }
    a.native = native; a.cols = armor.cols; a.rows = armor.rows;
    a.width = armor.cellWidth; a.height = armor.cellHeight; a.minX = armor.minX; a.minY = armor.minY;
    f.armor[r] = a;
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
    const explicitTeam = v.projectiles.team[r];
    f.explicitProjectileTeam[r] = explicitTeam;
    f.projectileTeam[r] = Number.isNaN(explicitTeam)
      ? (v.projectiles.sourceRow[r] < 0 ? NaN : v.bodies.team[v.projectiles.sourceRow[r]])
      : explicitTeam;
  }
  updateBudgetLedger(v, f, world.fireBudget);
  const asteroids = world.asteroids;
  f.asteroidHp.length = asteroids.length;
  for (let r = 0; r < asteroids.length; r++) {
    const a = asteroids[r];
    f.asteroidX[r] = a.pos.x; f.asteroidY[r] = a.pos.y; f.asteroidVx[r] = a.vel.x; f.asteroidVy[r] = a.vel.y;
    f.asteroidRadius[r] = a.radius; f.asteroidHp[r] = a.hp;
  }
  f.epoch = v.epoch; f.revision = v.revision; f.projectileCount = v.projectileCount;
  return f;
}

/** Some worlds restrict contacts (e.g. parent/module update). Compile membership
 * once per actual roster/epoch, not inside any weapon or candidate query. */
export function fireScope(v: StageView, f: FireInputs, world: FireControlWorld): Uint8Array {
  let scope = f.scopeByRoster.get(world.ships);
  if (!scope) {
    scope = new Uint8Array(v.bodyCount);
    const ships = world.ships, stageShips = v.ships, bodyCount = v.bodyCount;
    for (let i = 0; i < ships.length; i++) {
      const ship = ships[i];
      const row = i < bodyCount && stageShips[i] === ship ? i : v.rowOf.get(ship);
      if (row !== undefined) scope[row] = 1;
    }
    f.scopeByRoster.set(ships, scope);
  }
  return scope;
}

export function fireTeamScope(v: StageView, f: FireInputs, world: FireControlWorld, ownTeam: number, teamIndex: number): FireTeamScope {
  let byTeam = f.teamScopeByRoster.get(world.ships);
  if (!byTeam) {
    byTeam = new Map();
    f.teamScopeByRoster.set(world.ships, byTeam);
  }
  const key = Number.isNaN(ownTeam) ? -999999 : ownTeam;
  let cached = byTeam.get(key);
  if (!cached) {
    const scope = fireScope(v, f, world);
    const b = v.bodies;
    const hostileBodies: number[] = [];
    const friendlyBlockers: number[] = [];
    const friendlyNonFighterBlockers: number[] = [];
    const visStride = v.teams.length;
    for (let row = 0; row < v.bodyCount; row++) {
      if (!scope[row]) continue;
      if (b.team[row] !== ownTeam) {
        if (!f.vast[row] && !(b.flags[row] & (B.DEAD | B.COLLISIONLESS))
          && teamIndex >= 0 && v.visibility[row * visStride + teamIndex]) {
          hostileBodies.push(row);
        }
      } else if (!(b.flags[row] & (B.DEAD | B.PHASED))) {
        friendlyBlockers.push(row);
        if (!(b.flags[row] & B.FIGHTER)) friendlyNonFighterBlockers.push(row);
      }
    }
    cached = { hostileBodies, friendlyBlockers, friendlyNonFighterBlockers };
    byTeam.set(key, cached);
  }
  return cached;
}

/** The root's filtered snapshot can predate newly spawned missiles present in
 * the wing's live projectile roster. Cache each actual array separately within
 * this publication; membership does not reorder the existing stage-row scan
 * (native missile rosters are subsequences of the projectile list). */
export function fireMissileScope(v: StageView, f: FireInputs, world: FireControlWorld): Uint8Array {
  if (world.missiles.length === 0) return EMPTY_SCOPE;
  let scope = f.missileScopeByRoster.get(world.missiles);
  if (!scope) {
    scope = new Uint8Array(v.projectileCount);
    const missiles = world.missiles, stageProjs = v.projectileRefs, projCount = v.projectileCount;
    for (let i = 0; i < missiles.length; i++) {
      const missile = missiles[i];
      const row = i < projCount && stageProjs[i] === missile ? i : v.projectileRowOf.get(missile);
      if (row !== undefined) scope[row] = 1;
    }
    f.missileScopeByRoster.set(missiles, scope);
  }
  return scope;
}

export function fireMissileRows(v: StageView, f: FireInputs, world: FireControlWorld, missileScope: Uint8Array): readonly number[] {
  if (world.missiles.length === 0 || missileScope.length === 0) return EMPTY_ROWS;
  let rows = f.missileRowsByRoster.get(world.missiles);
  if (!rows) {
    const out: number[] = [];
    const pFlags = v.projectiles.flags;
    for (let p = 0, n = Math.min(v.projectileCount, missileScope.length); p < n; p++) {
      if (missileScope[p] && !(pFlags[p] & P.NO_COLLISION)
        && Number.isFinite(f.projectileTeam[p]) && f.missileHp[p] > 0 && f.flightLife[p] > 0) {
        out.push(p);
      }
    }
    rows = out;
    f.missileRowsByRoster.set(world.missiles, rows);
  }
  return rows;
}
