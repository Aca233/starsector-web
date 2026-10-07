import { Ship, hasNativeCoreCollisionHooks, nativeGetShieldCenter, nativeGetMotionStats } from '../../simulation/Ship';
import type { Projectile, Beam, WeaponMount } from '../../simulation/Weapon';
import type { CombatEngine } from '../../simulation/CombatEngine';
import { combatTeam } from '../../simulation/CombatTeams';
import { FireControlQueryRoster } from '../FireControlQueryBatch';
import { weaponMuzzle, weaponMuzzleExtent } from '../FireControlGeometry';
import { weaponRange, weaponDps } from '../ShipCombatProfile';
import { combatProjectileSpeed } from '../../simulation/WeaponRange';
import { hasOnlyNativeRangeModifiers } from '../../extensions/HullMods';
import { Vector2 } from '../../math/Vector2';
import { remainingProjectileLifetime } from '../../simulation/systems/weapon/SourceMissileLifecycle';
import { createStageAIData, prepareStageAI, captureStageAIShip, captureStageAIMount, captureStageAIProjectile } from './StageAIProducer';
import {
  BodyFlag as F, WeaponFlag as W, ProjectileFlag as P, DamageCode,
  bodyKeys, weaponKeys, projectileKeys, beamKeys, contactBodyKeys, contactProjectileKeys,
  type Columns, type StageGeometry, type StageInputs, type StageKind, type StageView
} from './StageProtocol';
export * from './StageProtocol';

export const numericDecisionCoreEnabled = import.meta.env?.VITE_COMBAT_NUMERIC_DECISION_CORE === 'true';

const leases = new WeakMap<object, StageView>();
const owners = new WeakMap<object, Producer>();
export interface StageCoverageCounts {
  attempts: number;
  admitted: number;
  rejected: number;
  captures: number;
  invalidations: number;
  refreshedBodies: number;
  refreshedProjectiles: number;
  lastEpoch: number;
  bodyCount: number;
  weaponCount: number;
  projectileCount: number;
  beamCount: number;
  lastRejection: string | null;
}
export type StageCoverage = Record<StageKind, StageCoverageCounts>;
const coverage = new WeakMap<object, StageCoverage>();
function stageCounts(owner: object): StageCoverage {
  let counts = coverage.get(owner);
  if (!counts) {
    counts = Object.fromEntries((['AI_PLAN', 'AI_EFFECT_READ', 'FIRE_QUERY', 'PROJECTILE_CONTACT'] as const).map(kind => [kind, {
      attempts: 0, admitted: 0, rejected: 0, captures: 0, invalidations: 0,
      refreshedBodies: 0, refreshedProjectiles: 0, lastEpoch: -1,
      bodyCount: 0, weaponCount: 0, projectileCount: 0, beamCount: 0, lastRejection: null
    }])) as StageCoverage;
    coverage.set(owner, counts);
  }
  return counts;
}
/** D's production-wired cumulative counts. Snapshot/diff without starting a
 * sampler; captures are admission, NOT proof that a hot consumer used the view. */
export function readStageCoverage(owner: object): StageCoverage {
  return Object.fromEntries(Object.entries(stageCounts(owner)).map(([kind, counts]) => [kind, { ...counts }])) as StageCoverage;
}
/** SUPPORTED CONTRACT: the private data-command worker creates raw numeric
 * state/vectors/specs; references do not escape. This is NOT an arbitrary JS
 * monkeypatch sandbox. Custom accessors/prototype edits of raw numeric fields
 * must use the explicit generic backend, not inherit worker admission. Audited
 * registry hook identities are checked at boundaries; unknown callbacks are
 * generic commits/invalidation, never permission for stale observations.
 * No per-projectile/spec/vector descriptor graphs or full method-table scans. */
function nativeObservationShip(ship: Ship, kind: StageKind): boolean {
  if (Object.getPrototypeOf(ship) !== Ship.prototype || Object.hasOwn(ship, 'getShieldCenter')
    || Object.hasOwn(ship, 'isCollisionless') || Object.hasOwn(ship, 'isPhased')
    || ship.getShieldCenter !== nativeGetShieldCenter || ship.externalPhaseEffects.size !== 0
    || !ship.system.hasNativeStats || !ship.defenseSystem.hasNativeStats) return false;
  if (kind === 'PROJECTILE_CONTACT') return true;
  if (Object.hasOwn(ship, 'getMotionStats') || ship.getMotionStats !== nativeGetMotionStats
    || !hasOnlyNativeRangeModifiers(ship.spec)
    || ship.sourceCarrier && !hasOnlyNativeRangeModifiers(ship.sourceCarrier.spec)) return false;
  return ship.hasExactThreatPhaseHooks || hasNativeCoreCollisionHooks(ship);
}
function nativeObservationInputs(inputs: StageInputs, kind: StageKind): boolean {
  return inputs.ships.every(ship => nativeObservationShip(ship, kind));
}
const emptyGeometry = (): StageGeometry => ({
  xy: new Float64Array(), offset: new Float64Array(), count: new Float64Array(),
  minX: new Float64Array(), minY: new Float64Array(), maxX: new Float64Array(), maxY: new Float64Array()
});
function columns<K extends readonly string[]>(keys: K, capacity = 0): Columns<K> {
  return Object.fromEntries(keys.map(key => [key, new Float64Array(capacity)])) as Columns<K>;
}
function grow<K extends readonly string[]>(table: Columns<K>, keys: K, size: number): void {
  if ((table[keys[0] as K[number]]?.length ?? 0) >= size) return;
  const capacity = Math.max(size, Math.ceil((table[keys[0] as K[number]]?.length ?? 0) * 1.5), 8);
  for (const key of keys as readonly K[number][]) {
    const next = new Float64Array(capacity); next.set(table[key]); table[key] = next;
  }
}
/** WeakMap admission, not a caller-provided native=true switch. Qualification is
 * done ONCE at each stage boundary, never per hot query. */
export function beginStage(owner: CombatEngine | undefined, kind: StageKind, inputs: StageInputs): StageView | undefined {
  if (!numericDecisionCoreEnabled) {
    if (owner) closeStageFor(owner);
    return undefined;
  }
  if (owner) closeStageFor(owner);
  if (!owner) return;
  const sources: StageInputs = {
    ...inputs, asteroids: inputs.asteroids ?? owner.asteroids, hulkFragments: inputs.hulkFragments ?? owner.hulkFragments
  };
  const counts = stageCounts(owner)[kind]; counts.attempts++;
  const reason = import.meta.env?.VITE_COMBAT_STAGE_KERNEL === 'false' ? 'stage-kernel-disabled'
    : !FireControlQueryRoster.isWorkerOwned(owner) ? 'not-private-worker-owned'
      : !nativeObservationInputs(sources, kind) ? 'unknown-stage-read-hook' : null;
  if (reason) { counts.rejected++; counts.lastRejection = reason; return; }
  let producer = owners.get(owner);
  if (!producer) { producer = new Producer(stageCounts(owner)); owners.set(owner, producer); }
  const view = producer.begin(kind, sources);
  bindStage(owner, view);
  counts.admitted++; counts.lastRejection = null;
  return view;
}
export function bindStage(world: object, view: StageView | undefined): void {
  if (view?.active) leases.set(world, view); else leases.delete(world);
}
export function stageFor(world: object): StageView | undefined {
  const view = leases.get(world);
  return view?.active && view.valid ? view : undefined;
}
export function closeStage(view: StageView | undefined): void { view?.close(); }
export function closeStageFor(owner: object): void {
  leases.get(owner)?.close(); leases.delete(owner);
}

class Producer {
  constructor(private readonly counts: StageCoverage) {}
  private serial = 0;
  private epoch = 0;
  private readonly handles = new WeakMap<object, number>();
  private readonly muzzle = new Vector2();
  private readonly ai = createStageAIData();
  private readonly shapes = new WeakMap<object, number>();
  private readonly immutableShapes = new WeakSet<object>();
  private shapeCount = 0;
  private shapePairs = 0;
  private inputs!: StageInputs;
  private admitted!: () => boolean;
  private live?: StageView;
  private readonly storage = {
    bodies: columns(bodyKeys), weapons: columns(weaponKeys),
    projectiles: columns(projectileKeys), beams: columns(beamKeys), geometry: emptyGeometry(),
    visibility: new Float64Array()
  };
  private readonly contactStorage = {
    bodies: columns(bodyKeys), weapons: columns(weaponKeys),
    projectiles: columns(projectileKeys), beams: columns(beamKeys),
    geometry: this.storage.geometry, visibility: new Float64Array()
  };
  private handle(object: object): number {
    let handle = this.handles.get(object);
    if (handle === undefined) { handle = ++this.serial; this.handles.set(object, handle); }
    return handle;
  }
  begin(kind: StageKind, inputs: StageInputs): StageView {
    this.live?.close();
    this.inputs = inputs;
    this.admitted = () => nativeObservationInputs(inputs, kind);
    // A new lease prevents an old world WeakMap binding reviving when storage
    // is reused for fire/contact. Arrays are reused, observation leases are not.
    const view: StageView = {
      abi: 1, active: true, valid: true, epoch: 0, revision: 0, kind,
      ships: [], mounts: [], projectileRefs: [], beamRefs: [],
      rowOf: new Map(), rowById: new Map(), mountRowOf: new Map(),
      projectileRowOf: new Map(), projectileRowById: new Map(), beamRowOf: new Map(),
      bodyCount: 0, weaponCount: 0, projectileCount: 0, beamCount: 0,
      ...(kind === 'PROJECTILE_CONTACT' ? this.contactStorage : this.storage), teams: [], damagedRows: new Map(),
      recapture: () => {
        if (!view.active) return;
        if (!this.admitted()) {
          this.counts[view.kind].rejected++; this.counts[view.kind].lastRejection = 'recapture-observation-boundary-changed';
          view.close(); return;
        }
        this.capture(view);
      },
      refreshChanged: ships => {
        if (!view.active) return;
        if (!view.valid) { view.recapture(); return; }
        for (const ship of ships) {
          const row = view.rowOf.get(ship);
          if (row === undefined) { view.invalidate(); view.recapture(); return; }
          if (view.kind !== 'PROJECTILE_CONTACT' && (ship.weapons.length !== view.bodies.weaponCount[row]
            || ship.weapons.some((mount, i) => mount !== view.mounts[view.bodies.weaponFirst[row] + i]))) {
            view.invalidate(); view.recapture(); return;
          }
          this.body(view, ship, row);
          this.counts[view.kind].refreshedBodies++;
          if (view.kind !== 'PROJECTILE_CONTACT')
            for (let m = view.bodies.weaponFirst[row], end = m + view.bodies.weaponCount[row]; m < end; m++)
              this.weapon(view, ship, view.mounts[m], m, row);
        }
        view.revision++;
      },
      refreshProjectile: projectile => {
        if (!view.active) return -1;
        if (!view.valid) view.recapture();
        if (!view.active) return -1;
        let row = view.projectileRowOf.get(projectile);
        if (row === undefined) {
          row = view.projectileCount++;
          grow(view.projectiles, view.kind === 'PROJECTILE_CONTACT' ? contactProjectileKeys : projectileKeys, view.projectileCount);
          view.projectileRowOf.set(projectile, row); view.projectileRefs[row] = projectile;
          view.projectileRowById.set(projectile.id, row);
        }
        this.projectile(view, projectile, row);
        this.counts[view.kind].refreshedProjectiles++;
        this.counts[view.kind].projectileCount = view.projectileCount;
        return row;
      },
      invalidate: () => {
        if (view.valid) this.counts[view.kind].invalidations++;
        view.valid = false; view.revision++;
      },
      close: () => { view.active = false; view.valid = false; }
    };
    this.live = view;
    try { this.capture(view); return view; }
    catch (error) { view.close(); throw error; }
  }
  private geometry(points: [number, number][] | undefined): number {
    if (!points || points.length < 3) return -1;
    const cached = this.shapes.get(points);
    if (cached !== undefined && this.immutableShapes.has(points)) return cached;
    const immutable = Object.isFrozen(points) && points.every(Object.isFrozen);
    const g = this.storage.geometry;
    if (cached !== undefined) {
      if (immutable || (g.count[cached] === points.length && points.every(([x, y], i) =>
        Object.is(g.xy[(g.offset[cached] + i) * 2], x) && Object.is(g.xy[(g.offset[cached] + i) * 2 + 1], y)))) return cached;
    }
    const row = this.shapeCount++;
    this.shapes.set(points, row);
    if (immutable) this.immutableShapes.add(points);
    for (const key of ['offset', 'count', 'minX', 'minY', 'maxX', 'maxY'] as const) {
      if (g[key].length <= row) { const next = new Float64Array(Math.max(row + 1, g[key].length * 2, 8)); next.set(g[key]); g[key] = next; }
    }
    const required = (this.shapePairs + points.length) * 2;
    if (g.xy.length < required) { const next = new Float64Array(Math.max(required, g.xy.length * 2, 16)); next.set(g.xy); g.xy = next; }
    g.offset[row] = this.shapePairs; g.count[row] = points.length;
    g.minX[row] = g.minY[row] = Infinity; g.maxX[row] = g.maxY[row] = -Infinity;
    for (const [x, y] of points) {
      g.xy[this.shapePairs * 2] = x; g.xy[this.shapePairs * 2 + 1] = y; this.shapePairs++;
      g.minX[row] = Math.min(g.minX[row], x); g.minY[row] = Math.min(g.minY[row], y);
      g.maxX[row] = Math.max(g.maxX[row], x); g.maxY[row] = Math.max(g.maxY[row], y);
    }
    return row;
  }
  private capture(v: StageView): void {
    v.valid = true; v.epoch = ++this.epoch; v.revision++;
    v.ships.length = v.mounts.length = v.projectileRefs.length = v.beamRefs.length = 0;
    v.rowOf.clear(); v.rowById.clear(); v.mountRowOf.clear(); v.projectileRowOf.clear(); v.projectileRowById.clear(); v.beamRowOf.clear(); v.damagedRows.clear();
    for (const ship of this.inputs.ships) {
      if (v.rowOf.has(ship)) continue;
      const row = v.ships.length; v.rowOf.set(ship, row); v.rowById.set(ship.id, row); v.ships.push(ship);
    }
    v.bodyCount = v.ships.length;
    if (v.kind === 'PROJECTILE_CONTACT') {
      v.ai = undefined; v.teams = []; v.weaponCount = v.beamCount = v.projectileCount = 0;
      grow(v.bodies, contactBodyKeys, v.bodyCount);
      grow(v.projectiles, contactProjectileKeys, this.inputs.projectiles?.length ?? 0);
      for (let row = 0; row < v.bodyCount; row++) this.contactBody(v, v.ships[row], row);
      this.recordCapture(v); return;
    }
    v.teams = [...new Set(v.ships.map(ship => ship.teamId))];
    if (v.kind === 'AI_PLAN' || v.kind === 'AI_EFFECT_READ') {
      prepareStageAI(v, this.ai, this.inputs, v.ships.reduce((count, ship) => count + ship.weapons.length, 0), this.inputs.projectiles?.length ?? 0);
    } else v.ai = undefined;
    grow(v.bodies, bodyKeys, v.bodyCount);
    const visibleSize = v.bodyCount * v.teams.length;
    if (this.storage.visibility.length < visibleSize) this.storage.visibility = new Float64Array(Math.max(visibleSize, this.storage.visibility.length * 2));
    v.visibility = this.storage.visibility;
    for (let row = 0; row < v.bodyCount; row++) {
      const ship = v.ships[row];
      v.bodies.weaponFirst[row] = v.mounts.length;
      for (const mount of ship.weapons) { v.mountRowOf.set(mount, v.mounts.length); v.mounts.push(mount); }
      v.bodies.weaponCount[row] = ship.weapons.length;
      this.body(v, ship, row);
    }
    v.weaponCount = v.mounts.length; grow(v.weapons, weaponKeys, v.weaponCount);
    for (let row = 0; row < v.bodyCount; row++) {
      for (let m = v.bodies.weaponFirst[row], end = m + v.bodies.weaponCount[row]; m < end; m++)
        this.weapon(v, v.ships[row], v.mounts[m], m, row);
    }
    v.projectileCount = this.inputs.projectiles?.length ?? 0; grow(v.projectiles, projectileKeys, v.projectileCount);
    for (let row = 0; row < v.projectileCount; row++) {
      const p = this.inputs.projectiles![row]; v.projectileRefs.push(p); v.projectileRowOf.set(p, row); v.projectileRowById.set(p.id, row);
    }
    for (let row = 0; row < v.projectileCount; row++) this.projectile(v, v.projectileRefs[row], row);
    v.beamCount = this.inputs.beams?.length ?? 0; grow(v.beams, beamKeys, v.beamCount);
    for (let row = 0; row < v.beamCount; row++) {
      const beam = this.inputs.beams![row]; v.beamRefs.push(beam); v.beamRowOf.set(beam, row); this.beam(v, beam, row);
    }
    this.recordCapture(v);
  }
  private recordCapture(v: StageView): void {
    const counts = this.counts[v.kind];
    counts.captures++; counts.lastEpoch = v.epoch; counts.bodyCount = v.bodyCount;
    counts.weaponCount = v.weaponCount; counts.projectileCount = v.projectileCount; counts.beamCount = v.beamCount;
  }
  private body(v: StageView, ship: Ship, r: number): void {
    if (v.kind === 'PROJECTILE_CONTACT') { this.contactBody(v, ship, r); return; }
    const b = v.bodies, shield = ship.shield, flux = ship.flux, motion = ship.getMotionStats();
    const center = ship.getShieldCenter(), geometry = this.geometry(ship.spec.bounds);
    b.handle[r] = this.handle(ship); b.generation[r] = 1;
    b.x[r] = ship.pos.x; b.y[r] = ship.pos.y; b.vx[r] = ship.vel.x; b.vy[r] = ship.vel.y;
    b.facing[r] = ship.facingRad; b.angularVelocity[r] = ship.angularVelRad; b.radius[r] = ship.spec.collisionRadius;
    b.team[r] = ship.teamId; b.assemblyRootRow[r] = v.rowOf.get(ship.assemblyRoot) ?? r;
    b.geometryRow[r] = geometry;
    b.hullReach[r] = geometry < 0 ? b.radius[r] : Math.max(Math.abs(v.geometry.minX[geometry]), Math.abs(v.geometry.maxX[geometry]))
      + Math.max(Math.abs(v.geometry.minY[geometry]), Math.abs(v.geometry.maxY[geometry]));
    b.flags[r] = (ship.isDead ? F.DEAD : 0) | (ship.isCollisionless ? F.COLLISIONLESS : 0)
      | (ship.isRetreated ? F.RETREATED : 0) | (ship.isDocked ? F.DOCKED : 0)
      | (ship.spec.hullSize === 'FIGHTER' ? F.FIGHTER : 0) | (ship.isPhased ? F.PHASED : 0)
      | (flux.isOverloaded ? F.OVERLOADED : 0) | (flux.isVenting ? F.VENTING : 0)
      | (ship.system.blocksWeapons ? F.WEAPONS_BLOCKED : 0) | (ship.isAttachedModule ? F.ATTACHED : 0)
      | (ship.aiHoldOffensiveFire ? F.HOLD_FIRE : 0) | (ship.fireControlMode === 'MANUAL' ? F.MANUAL : 0);
    b.shieldX[r] = center.x; b.shieldY[r] = center.y; b.shieldRadius[r] = shield.radius;
    b.shieldArc[r] = shield.currentArcDeg * Math.PI / 180;
    b.shieldHalfArcCos[r] = Math.cos((shield.currentArcDeg * Math.PI) / 360);
    b.shieldFacing[r] = shield.type === 'FRONT' ? ship.facingRad : shield.facingAngleRad;
    b.shieldActive[r] = Number(shield.isActive && shield.currentArcDeg > 5 && shield.type !== 'NONE' && shield.type !== 'PHASE');
    b.shieldType[r] = ['NONE', 'FRONT', 'OMNI', 'PHASE'].indexOf(shield.type);
    b.shieldEfficiency[r] = shield.efficiency; b.shieldDamageMultiplier[r] = shield.damageTakenMultiplier;
    b.shieldEnergyMultiplier[r] = shield.energyDamageTakenMultiplier; b.shieldSystemMultiplier[r] = ship.system.getShieldDamageMultiplier();
    b.shieldVoid[r] = Number(!!shield.voidShield); b.shieldMaxArc[r] = shield.maxArcDeg * Math.PI / 180;
    b.shieldUnfoldDuration[r] = shield.unfoldDuration; b.phaseUpDuration[r] = shield.phaseChargeUpDuration;
    b.phaseDownDuration[r] = shield.phaseChargeDownDuration; b.phaseCooldownDuration[r] = shield.phaseCooldownDuration;
    b.phaseEffectLevel[r] = shield.phaseEffectLevel;
    b.hp[r] = ship.hullHp; b.maxHp[r] = ship.maxHullHp; b.softFlux[r] = flux.softFlux; b.hardFlux[r] = flux.hardFlux;
    b.maxFlux[r] = flux.maxFlux; b.fluxPercent[r] = flux.fluxPercent; b.dissipation[r] = flux.effectiveDissipation;
    b.overloadTimer[r] = flux.overloadTimer; b.ventTime[r] = flux.getTimeToVent();
    b.crDamageMultiplier[r] = ship.crDamageTakenMultiplier;
    b.maxSpeed[r] = motion.maxSpeed; b.acceleration[r] = motion.acceleration; b.deceleration[r] = motion.deceleration;
    b.maxTurnRate[r] = motion.maxTurnRate; b.turnAcceleration[r] = motion.turnAcceleration; b.turnDeceleration[r] = motion.turnDeceleration;
    b.visibilityMask[r] = ship.visibilityMask; b.size[r] = ['FIGHTER', 'FRIGATE', 'DESTROYER', 'CRUISER', 'CAPITAL_SHIP'].indexOf(ship.spec.hullSize);
    b.systemRecovery[r] = ship.system.blocksWeapons ? ship.system.chargeDownDuration : 0;
    b.armorRating[r] = ship.hullStats.armorRating; b.mass[r] = ship.spec.mass;
    b.shieldPiercedMultiplier[r] = ship.shieldPiercedMultiplier;
    captureStageAIShip(v, ship, r, motion.strafeMultiplier);
    for (let t = 0; t < v.teams.length; t++) v.visibility[r * v.teams.length + t] = Number(ship.isVisibleTo(v.teams[t]));
  }
  private contactBody(v: StageView, ship: Ship, r: number): void {
    const b = v.bodies, shield = ship.shield, center = ship.getShieldCenter(), shape = this.geometry(ship.spec.bounds);
    b.handle[r] = this.handle(ship); b.generation[r] = 1;
    b.x[r] = ship.pos.x; b.y[r] = ship.pos.y; b.facing[r] = ship.facingRad; b.radius[r] = ship.spec.collisionRadius;
    b.team[r] = ship.teamId; b.assemblyRootRow[r] = v.rowOf.get(ship.assemblyRoot) ?? r;
    b.flags[r] = (ship.isDead ? F.DEAD : 0) | (ship.isCollisionless ? F.COLLISIONLESS : 0);
    b.geometryRow[r] = shape;
    b.hullReach[r] = shape < 0 ? b.radius[r] : Math.max(Math.abs(v.geometry.minX[shape]), Math.abs(v.geometry.maxX[shape]))
      + Math.max(Math.abs(v.geometry.minY[shape]), Math.abs(v.geometry.maxY[shape]));
    b.shieldX[r] = center.x; b.shieldY[r] = center.y; b.shieldRadius[r] = shield.radius;
    b.shieldArc[r] = shield.currentArcDeg * Math.PI / 180;
    b.shieldHalfArcCos[r] = Math.cos((shield.currentArcDeg * Math.PI) / 360);
    b.shieldFacing[r] = shield.type === 'FRONT' ? ship.facingRad : shield.facingAngleRad;
    b.shieldActive[r] = Number(shield.isActive && shield.currentArcDeg > 5 && shield.type !== 'NONE' && shield.type !== 'PHASE');
  }
  private weapon(v: StageView, ship: Ship, mount: WeaponMount, r: number, ownerRow: number): void {
    const w = v.weapons, s = mount.spec, hints = s.aiHints ?? [];
    weaponMuzzle(ship, mount, this.muzzle);
    w.handle[r] = this.handle(mount); w.generation[r] = 1; w.ownerRow[r] = ownerRow;
    w.muzzleX[r] = this.muzzle.x; w.muzzleY[r] = this.muzzle.y; w.muzzleExtent[r] = weaponMuzzleExtent(mount);
    w.angle[r] = mount.currentAngleRad; w.baseAngle[r] = ship.facingRad + mount.baseAngleDeg * Math.PI / 180;
    w.arc[r] = mount.arcDeg * Math.PI / 180;
    w.halfArc[r] = mount.mountType === 'HARDPOINT' || (s.turnRateDegPerSec ?? 1) <= 0 ? 0 : w.arc[r] / 2;
    w.effectiveRange[r] = weaponRange(ship, mount);
    w.speed[r] = s.isGuided ? s.maxSpeed ?? s.projSpeed : combatProjectileSpeed(ship, s);
    w.maxSpeed[r] = s.maxSpeed ?? s.projSpeed;
    w.chargeDelay[r] = mount.firingState === 'CHARGING' ? mount.firingStateTimer : s.isBeam ? s.beamSourceChargeupTime ?? 0 : s.chargeTime ?? 0;
    w.readiness[r] = mount.burstRemaining > 0 ? mount.burstTimer : Math.max(0, mount.cooldownTimer) + w.chargeDelay[r];
    w.turnRate[r] = (s.turnRateDegPerSec ?? 30) * Math.PI / 180; w.damage[r] = s.damagePerShot;
    w.dps[r] = weaponDps(mount); w.damageType[r] = DamageCode[s.type]; w.emp[r] = s.empPerShot ?? 0;
    w.ammo[r] = mount.ammo; w.maxAmmo[r] = s.maxAmmo ?? Infinity; w.disabled[r] = Number(mount.isDisabled);
    w.flags[r] = (mount.isDisabled ? W.DISABLED : 0) | (s.isPointDefense || hints.includes('PD') || hints.includes('PD_ONLY') ? W.PD : 0)
      | (hints.includes('PD_ONLY') ? W.PD_ONLY : 0) | (s.isBeam ? W.BEAM : 0) | (s.isGuided ? W.GUIDED : 0)
      | (s.weaponType === 'MISSILE' || s.spawnType === 'MISSILE' ? W.MISSILE : 0) | (mount.mountType === 'HARDPOINT' ? W.HARDPOINT : 0)
      | (s.alwaysFire ? W.ALWAYS_FIRE : 0) | (mount.isAutofire ? W.AUTOFIRE : 0) | (s.systemOnly ? W.SYSTEM_ONLY : 0);
    w.cooldown[r] = mount.cooldownTimer; w.burstRemaining[r] = mount.burstRemaining; w.burstTimer[r] = mount.burstTimer;
    w.burstSize[r] = s.burstSize ?? 1; w.burstDelay[r] = s.burstDelay ?? 0; w.refireDelay[r] = s.refireDelay;
    w.beamDuration[r] = s.beamDuration ?? Infinity; w.fluxCost[r] = s.fluxPerShot;
    w.fluxPerSecond[r] = s.fluxPerSecond ?? 0; w.spread[r] = mount.currentSpreadDeg * Math.PI / 180;
    w.firingState[r] = ['IDLE', 'CHARGING', 'ACTIVE', 'CHARGEDOWN'].indexOf(mount.firingState);
    w.health[r] = mount.health; w.projectileRadius[r] = s.projRadius;
    w.relativeX[r] = mount.relativePos.x; w.relativeY[r] = mount.relativePos.y;
    w.groupRow[r] = ship.weaponGroups.findIndex(group => group.weaponSlotIds.includes(mount.slotId));
    w.hintMask[r] = ['PD', 'PD_ONLY', 'ANTI_FTR', 'STRIKE', 'USE_LESS_VS_SHIELDS', 'USE_LESS_VS_HULL', 'CONSERVE_AMMO', 'DO_NOT_AIM', 'GUIDED_POOR']
      .reduce((mask, hint, i) => mask | (hints.includes(hint) ? 1 << i : 0), 0);
    captureStageAIMount(v, r);
  }
  private projectile(v: StageView, p: Projectile, r: number): void {
    const c = v.projectiles;
    c.handle[r] = this.handle(p); c.generation[r] = 1; c.id[r] = p.id;
    c.x[r] = p.pos.x; c.y[r] = p.pos.y; c.prevX[r] = p.prevPos.x; c.prevY[r] = p.prevPos.y;
    c.vx[r] = p.vel.x; c.vy[r] = p.vel.y; c.radius[r] = p.radius; c.team[r] = combatTeam(p) ?? NaN;
    c.sourceRow[r] = v.rowById.get(p.sourceShipId) ?? -1;
    if (v.kind === 'PROJECTILE_CONTACT') {
      c.flags[r] = p.isPlayer !== undefined ? P.FILTER_TEAM : 0;
      if (p.damagedTargetIds?.length) {
        const rows = new Set<number>();
        for (const id of p.damagedTargetIds) { const row = v.rowById.get(id); if (row !== undefined) rows.add(row); }
        v.damagedRows.set(r, rows);
      } else v.damagedRows.delete(r);
      return;
    }
    c.flags[r] = (p.isRocket ? P.ROCKET : 0) | (p.isGuided ? P.GUIDED : 0) | (p.isFlare ? P.FLARE : 0)
      | (p.isMine ? P.MINE : 0) | (p.collisionDisabled ? P.NO_COLLISION : 0)
      | (p.isPlayer !== undefined ? P.FILTER_TEAM : 0) | (p.isDisarmed ? P.DISARMED : 0) | (p.inertialFlight ? P.INERTIAL : 0);
    c.damage[r] = p.damage; c.emp[r] = p.empDamage ?? 0; c.damageType[r] = DamageCode[p.damageType];
    c.remainingLife[r] = remainingProjectileLifetime(p);
    c.rangeRemaining[r] = p.rangeRemaining; c.elapsed[r] = p.elapsedTime; c.hp[r] = p.hitpoints ?? 100;
    c.facing[r] = p.facingRad ?? p.vel.heading(); c.targetRow[r] = p.targetShipId ? v.rowById.get(p.targetShipId) ?? -1 : -1;
    c.targetProjectileRow[r] = p.targetProjectileId === undefined ? -1 : v.projectileRowById.get(p.targetProjectileId) ?? -1;
    if (p.damagedTargetIds?.length) {
      const rows = new Set<number>();
      for (const id of p.damagedTargetIds) { const row = v.rowById.get(id); if (row !== undefined) rows.add(row); }
      v.damagedRows.set(r, rows);
    } else v.damagedRows.delete(r);
    captureStageAIProjectile(v, r);
  }
  private beam(v: StageView, beam: Beam, r: number): void {
    const c = v.beams, source = v.rowById.get(beam.sourceShipId) ?? -1;
    c.handle[r] = this.handle(beam); c.generation[r] = 1; c.id[r] = beam.id;
    c.startX[r] = beam.startPos.x; c.startY[r] = beam.startPos.y; c.endX[r] = beam.endPos.x; c.endY[r] = beam.endPos.y;
    c.duration[r] = beam.duration; c.maxDuration[r] = beam.maxDuration; c.dps[r] = beam.damagePerSec;
    c.emp[r] = beam.empPerSec ?? 0; c.damageType[r] = DamageCode[beam.damageType]; c.sourceRow[r] = source;
    c.mountRow[r] = source < 0 ? -1 : v.mounts.findIndex(mount => mount.slotId === beam.slotId && v.weapons.ownerRow[v.mountRowOf.get(mount)!] === source);
    c.team[r] = combatTeam(beam) ?? NaN; c.width[r] = beam.width; c.damageActive[r] = Number(beam.damageActive !== false); c.elapsed[r] = beam.elapsedTime;
  }
}
