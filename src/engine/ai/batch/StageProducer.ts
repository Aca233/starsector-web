import { Ship, hasNativeCoreCollisionHooks, nativeGetShieldCenter, nativeGetMotionStats } from '../../simulation/Ship';
import { shipStageMotionStats, motionReaders } from '../../simulation/systems/ShipMotion';
import type { Projectile, Beam, WeaponMount } from '../../simulation/Weapon';
import type { CombatEngine } from '../../simulation/CombatEngine';
import { combatTeam } from '../../simulation/CombatTeams';
import { FireControlQueryRoster } from '../FireControlQueryBatch';
import { weaponMuzzle, weaponMuzzleExtent } from '../FireControlGeometry';
import { weaponRange, weaponDps } from '../ShipCombatProfile';
import { combatProjectileSpeed } from '../../simulation/WeaponRange';
import { hasOnlyNativeRangeModifiers } from '../../extensions/HullMods';
import type { SystemModifiers } from '../../extensions/ship-systems/Types';
import { Vector2 } from '../../math/Vector2';
import { remainingProjectileLifetime } from '../../simulation/systems/weapon/SourceMissileLifecycle';
import { isImmutableMetadata } from '../../extensions/Immutable';
import { createStageAIData, prepareStageAI, captureStageAIShip, captureStageAIMount, captureStageAIProjectile } from './StageAIProducer';
import {
  BodyFlag as F, WeaponFlag as W, ProjectileFlag as P, DamageCode,
  bodyKeys, weaponKeys, projectileKeys, beamKeys, contactBodyKeys, contactProjectileKeys,
  type Columns, type StageGeometry, type StageKind
} from './StageProtocol';
import type { StageInputs, StageView } from './StageBridge';
export * from './StageProtocol';
export type { StageInputs, StageView } from './StageBridge';

const stageModifierReaders = [...motionReaders, 'getShieldDamageMultiplier', 'getWeaponRangePercent', 'getProjectileSpeedPercent'] as const;
const weaponModifierReaders = ['getWeaponRangePercent', 'getProjectileSpeedPercent'] as const;
const hintMaskCache = new WeakMap<readonly string[], number>();
function getHintMask(hints: readonly string[]): number {
  const cached = hintMaskCache.get(hints);
  if (cached !== undefined) return cached;
  let mask = 0;
  for (let i = 0; i < hints.length; i++) {
    switch (hints[i]) {
      case 'PD': mask |= 1; break;
      case 'PD_ONLY': mask |= 2; break;
      case 'ANTI_FTR': mask |= 4; break;
      case 'STRIKE': mask |= 8; break;
      case 'USE_LESS_VS_SHIELDS': mask |= 16; break;
      case 'USE_LESS_VS_HULL': mask |= 32; break;
      case 'CONSERVE_AMMO': mask |= 64; break;
      case 'DO_NOT_AIM': mask |= 128; break;
      case 'GUIDED_POOR': mask |= 256; break;
    }
  }
  if (Object.isFrozen(hints)) hintMaskCache.set(hints, mask);
  return mask;
}

export const numericDecisionCoreEnabled = import.meta.env?.VITE_COMBAT_NUMERIC_DECISION_CORE !== 'false';

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

interface WeaponRowCache {
  mount: WeaponMount;
  ownerRow: number;
  slotId: string;
  mountType: WeaponMount['mountType'];
  arcDeg: number;
  baseAngleDeg: number;
  spec: WeaponMount['spec'];
  aiHints: WeaponMount['spec']['aiHints'];
  immutableHints: boolean;
  hintMask: number;
  baseFlags: number;
  range: number;
  weaponType: WeaponMount['spec']['weaponType'];
  mountSize: WeaponMount['spec']['mountSize'];
  mountTypeOverride: WeaponMount['spec']['mountTypeOverride'];
  isPointDefense: boolean | undefined;
  isBeam: boolean | undefined;
  isGuided: boolean | undefined;
  isRocket: boolean | undefined;
  spawnType: WeaponMount['spec']['spawnType'];
  alwaysFire: boolean | undefined;
  systemOnly: boolean | undefined;
  projSpeed: number;
  maxSpeed: number | undefined;
  projectileSpeedBonusPercent: number | undefined;
  turnRateDegPerSec: number | undefined;
  damagePerShot: number;
  damagePerSecond: number;
  type: WeaponMount['spec']['type'];
  empPerShot: number | undefined;
  maxAmmo: number | undefined;
  burstSize: number | undefined;
  burstDelay: number | undefined;
  refireDelay: number;
  beamDuration: number | undefined;
  beamSourceChargeupTime: number | undefined;
  chargeTime: number | undefined;
  fluxPerShot: number;
  fluxPerSecond: number | undefined;
  projRadius: number;
  hardpointOffsets: readonly number[] | undefined;
  turretOffsets: readonly number[] | undefined;
  immutableOffsets: boolean;
  shipSpec: Ship['spec'] | undefined;
  carrierSpec: Ship['spec'] | undefined;
  immutableSpecs: boolean;
  ecmPenalty: number;
  rangePercent: number;
  speedPercent: number;
  shipX: number;
  shipY: number;
  shipFacing: number;
  barrelIndex: number;
  firingState: WeaponMount['firingState'];
  firingStateTimer: number;
  isDisabled: boolean;
  isAutofire: boolean;
  spreadDeg: number;
  aiPopulated: boolean;
}

interface BodyRowCache {
  ship: Ship;
  spec: Ship['spec'];
  immutableSpec: boolean;
  geometry: number;
  hullReach: number;
  size: number;
  shieldCenterZero: boolean;
  posX: number;
  posY: number;
  facingRad: number;
  shieldArcDeg: number;
  movementMult: number;
  engineState: string;
  terrainSpeedMult: number;
  currentCR: number;
  boost: boolean;
  modifiers: Readonly<SystemModifiers> | undefined;
  strafeMultiplier: number;
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
  private readonly shapeReach: number[] = [];
  private shapeCount = 0;
  private shapePairs = 0;
  private inputs!: StageInputs;
  private admitted!: () => boolean;
  private live?: StageView;
  private readonly storageShipIds: string[] = [];
  private readonly storageProjIds: number[] = [];
  private readonly bodyCache: BodyRowCache[] = [];
  private readonly weaponCache: WeaponRowCache[] = [];
  private aiProjEpoch = -1;
  private readonly storage = {
    ships: [] as Ship[], mounts: [] as WeaponMount[], projectileRefs: [] as Projectile[], beamRefs: [] as Beam[],
    rowOf: new Map<Ship, number>(), rowById: new Map<string, number>(), mountRowOf: new Map<WeaponMount, number>(),
    projectileRowOf: new Map<Projectile, number>(), projectileRowById: new Map<number, number>(), beamRowOf: new Map<Beam, number>(),
    teams: [] as number[], damagedRows: new Map<number, Set<number>>(),
    bodies: columns(bodyKeys), weapons: columns(weaponKeys),
    projectiles: columns(projectileKeys), beams: columns(beamKeys), geometry: emptyGeometry(),
    visibility: new Float64Array()
  };
  private readonly contactStorage = {
    ships: [] as Ship[], mounts: [] as WeaponMount[], projectileRefs: [] as Projectile[], beamRefs: [] as Beam[],
    rowOf: new Map<Ship, number>(), rowById: new Map<string, number>(), mountRowOf: new Map<WeaponMount, number>(),
    projectileRowOf: new Map<Projectile, number>(), projectileRowById: new Map<number, number>(), beamRowOf: new Map<Beam, number>(),
    teams: [] as number[], damagedRows: new Map<number, Set<number>>(),
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
      bodyCount: 0, weaponCount: 0, projectileCount: 0, beamCount: 0,
      ...(kind === 'PROJECTILE_CONTACT' ? this.contactStorage : this.storage),
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
          if (view.kind !== 'PROJECTILE_CONTACT') {
            const first = view.bodies.weaponFirst[row], count = view.bodies.weaponCount[row];
            if (ship.weapons.length !== count) { view.invalidate(); view.recapture(); return; }
            for (let i = 0; i < count; i++) {
              if (ship.weapons[i] !== view.mounts[first + i]) { view.invalidate(); view.recapture(); return; }
            }
          }
          const modifiers = view.kind === 'PROJECTILE_CONTACT' ? undefined : ship.system.readModifierTable?.(stageModifierReaders);
          this.body(view, ship, row, modifiers, true);
          this.counts[view.kind].refreshedBodies++;
          if (view.kind !== 'PROJECTILE_CONTACT') {
            const weaponModifiers = modifiers ?? ship.system.readModifierTable?.(weaponModifierReaders);
            for (let m = view.bodies.weaponFirst[row], end = m + view.bodies.weaponCount[row]; m < end; m++)
              this.weapon(view, ship, view.mounts[m], m, row, weaponModifiers, true);
          }
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
          if (view.kind !== 'PROJECTILE_CONTACT') this.storageProjIds[row] = projectile.id;
          view.projectileRowById.set(projectile.id, row);
        }
        this.projectile(view, projectile, row, false);
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
    this.shapeReach[row] = Math.max(Math.abs(g.minX[row]), Math.abs(g.maxX[row]))
      + Math.max(Math.abs(g.minY[row]), Math.abs(g.maxY[row]));
    return row;
  }
  private readonly rowModifiers: (Readonly<SystemModifiers> | undefined)[] = [];
  private capture(v: StageView): void {
    v.valid = true; v.epoch = ++this.epoch; v.revision++;
    if (v.damagedRows.size > 0) v.damagedRows.clear();
    const inputShips = this.inputs.ships;
    const isContact = v.kind === 'PROJECTILE_CONTACT';
    let shipsMatch = v.ships.length === inputShips.length && v.rowOf.size === inputShips.length && v.rowById.size === inputShips.length;
    let totalMounts = 0;
    if (shipsMatch) {
      const useIds = !isContact && this.storageShipIds.length === inputShips.length;
      for (let i = 0; i < inputShips.length; i++) {
        const ship = inputShips[i];
        if (v.ships[i] !== ship || (useIds ? this.storageShipIds[i] !== ship.id : v.rowById.get(ship.id) !== i)) { shipsMatch = false; break; }
        totalMounts += ship.weapons.length;
      }
    }
    if (!shipsMatch) {
      v.ships.length = 0;
      if (!isContact) {
        this.storageShipIds.length = 0;
        this.bodyCache.length = 0;
      }
      v.rowOf.clear(); v.rowById.clear();
      totalMounts = 0;
      for (const ship of inputShips) {
        if (v.rowOf.has(ship)) continue;
        const row = v.ships.length; v.rowOf.set(ship, row); v.rowById.set(ship.id, row); v.ships.push(ship);
        if (!isContact) this.storageShipIds.push(ship.id);
        totalMounts += ship.weapons.length;
      }
      if (!isContact && this.storageShipIds.length !== v.rowById.size) this.storageShipIds.length = 0;
    }
    v.bodyCount = v.ships.length;
    v.teams.length = 0;
    if (isContact) {
      v.mounts.length = v.projectileRefs.length = v.beamRefs.length = 0;
      if (v.mountRowOf.size > 0) v.mountRowOf.clear();
      if (v.projectileRowOf.size > 0) v.projectileRowOf.clear();
      if (v.projectileRowById.size > 0) v.projectileRowById.clear();
      if (v.beamRowOf.size > 0) v.beamRowOf.clear();
      v.ai = undefined; v.weaponCount = v.beamCount = v.projectileCount = 0;
      grow(v.bodies, contactBodyKeys, v.bodyCount);
      grow(v.projectiles, contactProjectileKeys, this.inputs.projectiles?.length ?? 0);
      for (let row = 0; row < v.bodyCount; row++) this.contactBody(v, v.ships[row], row, shipsMatch);
      this.recordCapture(v); return;
    }
    for (let i = 0; i < v.bodyCount; i++) {
      const teamId = v.ships[i].teamId;
      if (!v.teams.includes(teamId)) v.teams.push(teamId);
    }
    if (v.kind === 'AI_PLAN' || v.kind === 'AI_EFFECT_READ') {
      prepareStageAI(v, this.ai, this.inputs, totalMounts, this.inputs.projectiles?.length ?? 0);
    } else v.ai = undefined;
    grow(v.bodies, bodyKeys, v.bodyCount);
    const visibleSize = v.bodyCount * v.teams.length;
    if (this.storage.visibility.length < visibleSize) this.storage.visibility = new Float64Array(Math.max(visibleSize, this.storage.visibility.length * 2));
    v.visibility = this.storage.visibility;
    let mountsMatch = shipsMatch && v.mounts.length === totalMounts && v.mountRowOf.size === totalMounts;
    if (mountsMatch) {
      let mIdx = 0;
      for (let row = 0; row < v.bodyCount; row++) {
        const weapons = v.ships[row].weapons;
        if (v.bodies.weaponFirst[row] !== mIdx || v.bodies.weaponCount[row] !== weapons.length) {
          mountsMatch = false; break;
        }
        for (let w = 0; w < weapons.length; w++) {
          if (v.mounts[mIdx++] !== weapons[w]) { mountsMatch = false; break; }
        }
        if (!mountsMatch) break;
      }
    }
    if (!mountsMatch) {
      v.mounts.length = 0;
      v.mountRowOf.clear();
      this.weaponCache.length = 0;
      for (let row = 0; row < v.bodyCount; row++) {
        const ship = v.ships[row];
        v.bodies.weaponFirst[row] = v.mounts.length;
        for (const mount of ship.weapons) { v.mountRowOf.set(mount, v.mounts.length); v.mounts.push(mount); }
        v.bodies.weaponCount[row] = ship.weapons.length;
      }
    }
    this.rowModifiers.length = v.bodyCount;
    for (let row = 0; row < v.bodyCount; row++) {
      const ship = v.ships[row];
      const modifiers = ship.system.readModifierTable?.(stageModifierReaders);
      this.rowModifiers[row] = modifiers;
      this.body(v, ship, row, modifiers, shipsMatch);
    }
    v.weaponCount = v.mounts.length; grow(v.weapons, weaponKeys, v.weaponCount);
    for (let row = 0; row < v.bodyCount; row++) {
      const ship = v.ships[row];
      const modifiers = this.rowModifiers[row] ?? ship.system.readModifierTable?.(weaponModifierReaders);
      for (let m = v.bodies.weaponFirst[row], end = m + v.bodies.weaponCount[row]; m < end; m++)
        this.weapon(v, ship, v.mounts[m], m, row, modifiers, mountsMatch);
    }
    this.rowModifiers.length = 0;
    const inputProjs = this.inputs.projectiles;
    v.projectileCount = inputProjs?.length ?? 0; grow(v.projectiles, projectileKeys, v.projectileCount);
    let projsMatch = v.projectileRefs.length === v.projectileCount
      && v.projectileRowOf.size === v.projectileCount && v.projectileRowById.size === v.projectileCount;
    if (projsMatch && inputProjs) {
      const useIds = this.storageProjIds.length === v.projectileCount;
      for (let row = 0; row < v.projectileCount; row++) {
        const p = inputProjs[row];
        if (v.projectileRefs[row] !== p || (useIds ? this.storageProjIds[row] !== p.id : v.projectileRowById.get(p.id) !== row)) {
          projsMatch = false; break;
        }
      }
    }
    if (!projsMatch) {
      v.projectileRefs.length = 0; this.storageProjIds.length = 0;
      v.projectileRowOf.clear(); v.projectileRowById.clear();
      for (let row = 0; row < v.projectileCount; row++) {
        const p = inputProjs![row]; v.projectileRefs.push(p); this.storageProjIds.push(p.id); v.projectileRowOf.set(p, row); v.projectileRowById.set(p.id, row);
      }
      if (this.storageProjIds.length !== v.projectileRowById.size) this.storageProjIds.length = 0;
    }
    const reuseProj = shipsMatch && projsMatch && (!v.ai || this.aiProjEpoch > 0);
    for (let row = 0; row < v.projectileCount; row++) this.projectile(v, v.projectileRefs[row], row, reuseProj);
    if (v.ai && projsMatch) this.aiProjEpoch = v.epoch;
    else if (v.ai) this.aiProjEpoch = v.epoch;
    else if (!projsMatch || !shipsMatch) this.aiProjEpoch = -1;
    v.beamRefs.length = 0;
    if (v.beamRowOf.size > 0) v.beamRowOf.clear();
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
  private body(v: StageView, ship: Ship, r: number, sampledModifiers?: Readonly<SystemModifiers>, reuseHandle = false): void {
    if (v.kind === 'PROJECTILE_CONTACT') { this.contactBody(v, ship, r, reuseHandle); return; }
    const b = v.bodies, shield = ship.shield, flux = ship.flux;
    const c = this.bodyCache[r];
    if (reuseHandle && b.handle[r] > 0 && c !== undefined && c.ship === ship && c.spec === ship.spec && c.immutableSpec) {
      b.x[r] = ship.pos.x; b.y[r] = ship.pos.y; b.vx[r] = ship.vel.x; b.vy[r] = ship.vel.y;
      b.facing[r] = ship.facingRad; b.angularVelocity[r] = ship.angularVelRad;
      b.team[r] = ship.teamId;
      b.flags[r] = (ship.isDead ? F.DEAD : 0) | (ship.isCollisionless ? F.COLLISIONLESS : 0)
        | (ship.isRetreated ? F.RETREATED : 0) | (ship.isDocked ? F.DOCKED : 0)
        | (c.size === 0 ? F.FIGHTER : 0) | (ship.isPhased ? F.PHASED : 0)
        | (flux.isOverloaded ? F.OVERLOADED : 0) | (flux.isVenting ? F.VENTING : 0)
        | (ship.system.blocksWeapons ? F.WEAPONS_BLOCKED : 0) | (ship.isAttachedModule ? F.ATTACHED : 0)
        | (ship.aiHoldOffensiveFire ? F.HOLD_FIRE : 0) | (ship.fireControlMode === 'MANUAL' ? F.MANUAL : 0);
      if (c.shieldCenterZero) {
        b.shieldX[r] = ship.pos.x; b.shieldY[r] = ship.pos.y;
      } else if (!Object.is(c.posX, ship.pos.x) || !Object.is(c.posY, ship.pos.y) || !Object.is(c.facingRad, ship.facingRad)) {
        const center = ship.getShieldCenter();
        b.shieldX[r] = center.x; b.shieldY[r] = center.y;
        c.posX = ship.pos.x; c.posY = ship.pos.y; c.facingRad = ship.facingRad;
      }
      b.shieldRadius[r] = shield.radius;
      if (!Object.is(c.shieldArcDeg, shield.currentArcDeg)) {
        b.shieldArc[r] = shield.currentArcDeg * Math.PI / 180;
        b.shieldHalfArcCos[r] = Math.cos((shield.currentArcDeg * Math.PI) / 360);
        c.shieldArcDeg = shield.currentArcDeg;
      }
      b.shieldFacing[r] = shield.type === 'FRONT' ? ship.facingRad : shield.facingAngleRad;
      b.shieldActive[r] = Number(shield.isActive && shield.currentArcDeg > 5 && shield.type !== 'NONE' && shield.type !== 'PHASE');
      b.shieldType[r] = shield.type === 'NONE' ? 0 : shield.type === 'FRONT' ? 1 : shield.type === 'OMNI' ? 2 : shield.type === 'PHASE' ? 3 : -1;
      b.shieldEfficiency[r] = shield.efficiency; b.shieldDamageMultiplier[r] = shield.damageTakenMultiplier;
      b.shieldEnergyMultiplier[r] = shield.energyDamageTakenMultiplier;
      b.shieldSystemMultiplier[r] = sampledModifiers ? sampledModifiers.shieldDamageMultiplier ?? 1 : ship.system.getShieldDamageMultiplier();
      b.shieldVoid[r] = Number(!!shield.voidShield); b.shieldMaxArc[r] = shield.maxArcDeg * Math.PI / 180;
      b.shieldUnfoldDuration[r] = shield.unfoldDuration; b.phaseUpDuration[r] = shield.phaseChargeUpDuration;
      b.phaseDownDuration[r] = shield.phaseChargeDownDuration; b.phaseCooldownDuration[r] = shield.phaseCooldownDuration;
      b.phaseEffectLevel[r] = shield.phaseEffectLevel;
      b.hp[r] = ship.hullHp; b.maxHp[r] = ship.maxHullHp; b.softFlux[r] = flux.softFlux; b.hardFlux[r] = flux.hardFlux;
      b.maxFlux[r] = flux.maxFlux; b.fluxPercent[r] = flux.fluxPercent; b.dissipation[r] = flux.effectiveDissipation;
      b.overloadTimer[r] = flux.overloadTimer; b.ventTime[r] = flux.getTimeToVent();
      const moveMult = ship.engineController.movementMultiplier, engState = ship.engineController.state;
      const terrainMult = ship.terrainSpeedMult, cr = ship.currentCR, boost = flux.isEngineBoostActive;
      if (sampledModifiers !== c.modifiers || !sampledModifiers || !Object.is(c.movementMult, moveMult)
        || c.engineState !== engState || !Object.is(c.terrainSpeedMult, terrainMult)
        || !Object.is(c.currentCR, cr) || c.boost !== boost || shield.type === 'PHASE' || !!ship.spec.modulePropulsion) {
        const motion = shipStageMotionStats(ship, sampledModifiers);
        b.crDamageMultiplier[r] = ship.crDamageTakenMultiplier;
        b.maxSpeed[r] = motion.maxSpeed; b.acceleration[r] = motion.acceleration; b.deceleration[r] = motion.deceleration;
        b.maxTurnRate[r] = motion.maxTurnRate; b.turnAcceleration[r] = motion.turnAcceleration; b.turnDeceleration[r] = motion.turnDeceleration;
        c.movementMult = moveMult; c.engineState = engState; c.terrainSpeedMult = terrainMult;
        c.currentCR = cr; c.boost = boost; c.modifiers = sampledModifiers; c.strafeMultiplier = motion.strafeMultiplier;
      }
      b.visibilityMask[r] = ship.visibilityMask;
      b.systemRecovery[r] = ship.system.blocksWeapons ? ship.system.chargeDownDuration : 0;
      b.armorRating[r] = ship.hullStats.armorRating;
      b.shieldPiercedMultiplier[r] = ship.shieldPiercedMultiplier;
      captureStageAIShip(v, ship, r, c.strafeMultiplier);
      for (let t = 0; t < v.teams.length; t++) v.visibility[r * v.teams.length + t] = Number(ship.isVisibleTo(v.teams[t]));
      return;
    }
    const motion = shipStageMotionStats(ship, sampledModifiers);
    const shieldCenterZero = (ship.spec.shieldCenterX || 0) === 0 && (ship.spec.shieldCenterY || 0) === 0;
    const center = shieldCenterZero ? ship.pos : ship.getShieldCenter();
    const geometry = this.geometry(ship.spec.bounds);
    const hullReach = geometry < 0 ? ship.spec.collisionRadius : this.shapeReach[geometry];
    const size = ship.spec.hullSize === 'FIGHTER' ? 0 : ship.spec.hullSize === 'FRIGATE' ? 1 : ship.spec.hullSize === 'DESTROYER' ? 2 : ship.spec.hullSize === 'CRUISER' ? 3 : ship.spec.hullSize === 'CAPITAL_SHIP' ? 4 : -1;
    if (!reuseHandle || !(b.handle[r] > 0)) b.handle[r] = this.handle(ship);
    b.generation[r] = 1;
    b.x[r] = ship.pos.x; b.y[r] = ship.pos.y; b.vx[r] = ship.vel.x; b.vy[r] = ship.vel.y;
    b.facing[r] = ship.facingRad; b.angularVelocity[r] = ship.angularVelRad; b.radius[r] = ship.spec.collisionRadius;
    b.team[r] = ship.teamId; if (!reuseHandle) b.assemblyRootRow[r] = v.rowOf.get(ship.assemblyRoot) ?? r;
    b.geometryRow[r] = geometry;
    b.hullReach[r] = hullReach;
    b.flags[r] = (ship.isDead ? F.DEAD : 0) | (ship.isCollisionless ? F.COLLISIONLESS : 0)
      | (ship.isRetreated ? F.RETREATED : 0) | (ship.isDocked ? F.DOCKED : 0)
      | (size === 0 ? F.FIGHTER : 0) | (ship.isPhased ? F.PHASED : 0)
      | (flux.isOverloaded ? F.OVERLOADED : 0) | (flux.isVenting ? F.VENTING : 0)
      | (ship.system.blocksWeapons ? F.WEAPONS_BLOCKED : 0) | (ship.isAttachedModule ? F.ATTACHED : 0)
      | (ship.aiHoldOffensiveFire ? F.HOLD_FIRE : 0) | (ship.fireControlMode === 'MANUAL' ? F.MANUAL : 0);
    b.shieldX[r] = center.x; b.shieldY[r] = center.y; b.shieldRadius[r] = shield.radius;
    b.shieldArc[r] = shield.currentArcDeg * Math.PI / 180;
    b.shieldHalfArcCos[r] = Math.cos((shield.currentArcDeg * Math.PI) / 360);
    b.shieldFacing[r] = shield.type === 'FRONT' ? ship.facingRad : shield.facingAngleRad;
    b.shieldActive[r] = Number(shield.isActive && shield.currentArcDeg > 5 && shield.type !== 'NONE' && shield.type !== 'PHASE');
    b.shieldType[r] = shield.type === 'NONE' ? 0 : shield.type === 'FRONT' ? 1 : shield.type === 'OMNI' ? 2 : shield.type === 'PHASE' ? 3 : -1;
    b.shieldEfficiency[r] = shield.efficiency; b.shieldDamageMultiplier[r] = shield.damageTakenMultiplier;
    b.shieldEnergyMultiplier[r] = shield.energyDamageTakenMultiplier;
    b.shieldSystemMultiplier[r] = sampledModifiers ? sampledModifiers.shieldDamageMultiplier ?? 1 : ship.system.getShieldDamageMultiplier();
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
    b.visibilityMask[r] = ship.visibilityMask;
    b.size[r] = size;
    b.systemRecovery[r] = ship.system.blocksWeapons ? ship.system.chargeDownDuration : 0;
    b.armorRating[r] = ship.hullStats.armorRating; b.mass[r] = ship.spec.mass;
    b.shieldPiercedMultiplier[r] = ship.shieldPiercedMultiplier;
    captureStageAIShip(v, ship, r, motion.strafeMultiplier);
    for (let t = 0; t < v.teams.length; t++) v.visibility[r * v.teams.length + t] = Number(ship.isVisibleTo(v.teams[t]));
    this.bodyCache[r] = {
      ship, spec: ship.spec, immutableSpec: isImmutableMetadata(ship.spec),
      geometry, hullReach, size, shieldCenterZero,
      posX: ship.pos.x, posY: ship.pos.y, facingRad: ship.facingRad, shieldArcDeg: shield.currentArcDeg,
      movementMult: ship.engineController.movementMultiplier, engineState: ship.engineController.state,
      terrainSpeedMult: ship.terrainSpeedMult, currentCR: ship.currentCR, boost: flux.isEngineBoostActive,
      modifiers: sampledModifiers, strafeMultiplier: motion.strafeMultiplier,
    };
  }
  private contactBody(v: StageView, ship: Ship, r: number, reuseHandle = false): void {
    const b = v.bodies, shield = ship.shield;
    const c = this.bodyCache[r];
    const validCache = c !== undefined && c.ship === ship && c.spec === ship.spec && c.immutableSpec;
    const shieldCenterZero = validCache ? c.shieldCenterZero : (ship.spec.shieldCenterX || 0) === 0 && (ship.spec.shieldCenterY || 0) === 0;
    const center = shieldCenterZero ? ship.pos : ship.getShieldCenter();
    const shape = validCache ? c.geometry : this.geometry(ship.spec.bounds);
    if (!reuseHandle || !(b.handle[r] > 0)) b.handle[r] = this.handle(ship);
    b.generation[r] = 1;
    b.x[r] = ship.pos.x; b.y[r] = ship.pos.y; b.facing[r] = ship.facingRad; b.radius[r] = ship.spec.collisionRadius;
    b.team[r] = ship.teamId; if (!reuseHandle) b.assemblyRootRow[r] = v.rowOf.get(ship.assemblyRoot) ?? r;
    b.flags[r] = (ship.isDead ? F.DEAD : 0) | (ship.isCollisionless ? F.COLLISIONLESS : 0);
    b.geometryRow[r] = shape;
    b.hullReach[r] = validCache ? c.hullReach : shape < 0 ? b.radius[r] : this.shapeReach[shape];
    b.shieldX[r] = center.x; b.shieldY[r] = center.y; b.shieldRadius[r] = shield.radius;
    const arcRad = shield.currentArcDeg * Math.PI / 180;
    if (!reuseHandle || !Object.is(b.shieldArc[r], arcRad)) {
      b.shieldArc[r] = arcRad;
      b.shieldHalfArcCos[r] = Math.cos((shield.currentArcDeg * Math.PI) / 360);
    }
    b.shieldFacing[r] = shield.type === 'FRONT' ? ship.facingRad : shield.facingAngleRad;
    b.shieldActive[r] = Number(shield.isActive && shield.currentArcDeg > 5 && shield.type !== 'NONE' && shield.type !== 'PHASE');
  }
  private weapon(v: StageView, ship: Ship, mount: WeaponMount, r: number, ownerRow: number, modifiers?: Readonly<SystemModifiers>, reuseHandle = false): void {
    const w = v.weapons, s = mount.spec;
    let c = this.weaponCache[r];
    if (reuseHandle && w.handle[r] > 0 && c !== undefined && c.mount === mount && c.ownerRow === ownerRow
      && c.slotId === mount.slotId && c.mountType === mount.mountType
      && Object.is(c.arcDeg, mount.arcDeg) && Object.is(c.baseAngleDeg, mount.baseAngleDeg)
      && c.spec === s && c.aiHints === s.aiHints && c.immutableHints
      && Object.is(c.range, s.range) && c.weaponType === s.weaponType && c.mountSize === s.mountSize
      && c.mountTypeOverride === s.mountTypeOverride && c.isPointDefense === s.isPointDefense
      && c.isBeam === s.isBeam && c.isGuided === s.isGuided && c.isRocket === s.isRocket
      && c.spawnType === s.spawnType && c.alwaysFire === s.alwaysFire && c.systemOnly === s.systemOnly
      && Object.is(c.projSpeed, s.projSpeed) && Object.is(c.maxSpeed, s.maxSpeed)
      && Object.is(c.projectileSpeedBonusPercent, s.projectileSpeedBonusPercent)
      && Object.is(c.turnRateDegPerSec, s.turnRateDegPerSec) && Object.is(c.damagePerShot, s.damagePerShot)
      && Object.is(c.damagePerSecond, s.damagePerSecond) && c.type === s.type && Object.is(c.empPerShot, s.empPerShot)
      && Object.is(c.maxAmmo, s.maxAmmo) && Object.is(c.burstSize, s.burstSize) && Object.is(c.burstDelay, s.burstDelay)
      && Object.is(c.refireDelay, s.refireDelay) && Object.is(c.beamDuration, s.beamDuration)
      && Object.is(c.beamSourceChargeupTime, s.beamSourceChargeupTime) && Object.is(c.chargeTime, s.chargeTime)
      && Object.is(c.fluxPerShot, s.fluxPerShot) && Object.is(c.fluxPerSecond, s.fluxPerSecond)
      && Object.is(c.projRadius, s.projRadius) && c.hardpointOffsets === s.hardpointOffsets
      && c.turretOffsets === s.turretOffsets && c.immutableOffsets) {
      const wt = s.weaponType;
      const rangePercent = modifiers ? wt ? modifiers.weapons?.[wt]?.rangePercent ?? 0 : 0 : ship.system.getWeaponRangePercent(wt);
      const speedPercent = s.isGuided ? 0 : modifiers ? wt ? modifiers.weapons?.[wt]?.projectileSpeedPercent ?? 0 : 0 : ship.system.getProjectileSpeedPercent(wt);
      const carrierSpec = ship.sourceCarrier?.spec;
      if (!c.immutableSpecs || c.shipSpec !== ship.spec || c.carrierSpec !== carrierSpec
        || !Object.is(c.ecmPenalty, ship.ecmRangePenalty)
        || !Object.is(c.rangePercent, rangePercent) || !Object.is(c.speedPercent, speedPercent)) {
        w.effectiveRange[r] = weaponRange(ship, mount, modifiers);
        w.speed[r] = s.isGuided ? s.maxSpeed ?? s.projSpeed : combatProjectileSpeed(ship, s, modifiers);
        c.shipSpec = ship.spec; c.carrierSpec = carrierSpec;
        c.immutableSpecs = isImmutableMetadata(ship.spec) && (!carrierSpec || isImmutableMetadata(carrierSpec));
        c.ecmPenalty = ship.ecmRangePenalty;
        c.rangePercent = rangePercent; c.speedPercent = speedPercent;
      }
      const relX = mount.relativePos.x, relY = mount.relativePos.y, angle = mount.currentAngleRad, barrel = mount.barrelIndex;
      const extentSame = Object.is(w.relativeX[r], relX) && Object.is(w.relativeY[r], relY) && Object.is(c.barrelIndex, barrel);
      if (!extentSame || !Object.is(c.shipX, ship.pos.x) || !Object.is(c.shipY, ship.pos.y)
        || !Object.is(c.shipFacing, ship.facingRad) || !Object.is(w.angle[r], angle)) {
        weaponMuzzle(ship, mount, this.muzzle);
        w.muzzleX[r] = this.muzzle.x; w.muzzleY[r] = this.muzzle.y;
        if (!extentSame) {
          w.muzzleExtent[r] = weaponMuzzleExtent(mount);
          w.relativeX[r] = relX; w.relativeY[r] = relY; c.barrelIndex = barrel;
        }
        w.angle[r] = angle; w.baseAngle[r] = ship.facingRad + mount.baseAngleDeg * Math.PI / 180;
        c.shipX = ship.pos.x; c.shipY = ship.pos.y; c.shipFacing = ship.facingRad;
      }
      const dynamicSame = c.firingState === mount.firingState && Object.is(c.firingStateTimer, mount.firingStateTimer)
        && Object.is(w.cooldown[r], mount.cooldownTimer) && Object.is(w.burstRemaining[r], mount.burstRemaining)
        && Object.is(w.burstTimer[r], mount.burstTimer) && Object.is(w.ammo[r], mount.ammo)
        && Object.is(w.health[r], mount.health) && c.isDisabled === mount.isDisabled
        && c.isAutofire === mount.isAutofire && Object.is(c.spreadDeg, mount.currentSpreadDeg);
      if (!dynamicSame) {
        w.chargeDelay[r] = mount.firingState === 'CHARGING' ? mount.firingStateTimer : s.isBeam ? s.beamSourceChargeupTime ?? 0 : s.chargeTime ?? 0;
        w.readiness[r] = mount.burstRemaining > 0 ? mount.burstTimer : Math.max(0, mount.cooldownTimer) + w.chargeDelay[r];
        w.ammo[r] = mount.ammo; w.disabled[r] = Number(mount.isDisabled);
        w.flags[r] = c.baseFlags | (mount.isDisabled ? W.DISABLED : 0) | (mount.isAutofire ? W.AUTOFIRE : 0);
        w.cooldown[r] = mount.cooldownTimer; w.burstRemaining[r] = mount.burstRemaining; w.burstTimer[r] = mount.burstTimer;
        w.spread[r] = mount.currentSpreadDeg * Math.PI / 180;
        w.firingState[r] = mount.firingState === 'IDLE' ? 0 : mount.firingState === 'CHARGING' ? 1 : mount.firingState === 'ACTIVE' ? 2 : mount.firingState === 'CHARGEDOWN' ? 3 : -1;
        w.health[r] = mount.health;
        c.firingState = mount.firingState; c.firingStateTimer = mount.firingStateTimer;
        c.isDisabled = mount.isDisabled; c.isAutofire = mount.isAutofire; c.spreadDeg = mount.currentSpreadDeg;
      }
      let groupRow = -1;
      if (v.kind === 'FIRE_QUERY') {
        const groups = ship.weaponGroups;
        for (let g = 0; g < groups.length; g++) {
          if (groups[g].weaponSlotIds.includes(mount.slotId)) { groupRow = g; break; }
        }
      }
      w.groupRow[r] = groupRow;
      if (v.ai) {
        if (!c.aiPopulated || !dynamicSame || mount.fireControl || v.ai.blockedLaneTarget[r] !== -1) {
          captureStageAIMount(v, r, c.aiPopulated);
          c.aiPopulated = true;
        }
      }
      return;
    }
    const hintMask = s.aiHints ? getHintMask(s.aiHints) : 0;
    weaponMuzzle(ship, mount, this.muzzle);
    if (!reuseHandle || !(w.handle[r] > 0)) w.handle[r] = this.handle(mount);
    w.generation[r] = 1; w.ownerRow[r] = ownerRow;
    w.muzzleX[r] = this.muzzle.x; w.muzzleY[r] = this.muzzle.y; w.muzzleExtent[r] = weaponMuzzleExtent(mount);
    w.angle[r] = mount.currentAngleRad; w.baseAngle[r] = ship.facingRad + mount.baseAngleDeg * Math.PI / 180;
    w.arc[r] = mount.arcDeg * Math.PI / 180;
    w.halfArc[r] = mount.mountType === 'HARDPOINT' || (s.turnRateDegPerSec ?? 1) <= 0 ? 0 : w.arc[r] / 2;
    w.effectiveRange[r] = weaponRange(ship, mount, modifiers);
    w.speed[r] = s.isGuided ? s.maxSpeed ?? s.projSpeed : combatProjectileSpeed(ship, s, modifiers);
    w.maxSpeed[r] = s.maxSpeed ?? s.projSpeed;
    w.chargeDelay[r] = mount.firingState === 'CHARGING' ? mount.firingStateTimer : s.isBeam ? s.beamSourceChargeupTime ?? 0 : s.chargeTime ?? 0;
    w.readiness[r] = mount.burstRemaining > 0 ? mount.burstTimer : Math.max(0, mount.cooldownTimer) + w.chargeDelay[r];
    w.turnRate[r] = (s.turnRateDegPerSec ?? 30) * Math.PI / 180; w.damage[r] = s.damagePerShot;
    w.dps[r] = weaponDps(mount); w.damageType[r] = DamageCode[s.type]; w.emp[r] = s.empPerShot ?? 0;
    w.ammo[r] = mount.ammo; w.maxAmmo[r] = s.maxAmmo ?? Infinity; w.disabled[r] = Number(mount.isDisabled);
    const baseFlags = (s.isPointDefense || (hintMask & 3) !== 0 ? W.PD : 0)
      | ((hintMask & 2) !== 0 ? W.PD_ONLY : 0) | (s.isBeam ? W.BEAM : 0) | (s.isGuided ? W.GUIDED : 0)
      | (s.weaponType === 'MISSILE' || s.spawnType === 'MISSILE' ? W.MISSILE : 0) | (mount.mountType === 'HARDPOINT' ? W.HARDPOINT : 0)
      | (s.alwaysFire ? W.ALWAYS_FIRE : 0) | (s.systemOnly ? W.SYSTEM_ONLY : 0);
    w.flags[r] = baseFlags | (mount.isDisabled ? W.DISABLED : 0) | (mount.isAutofire ? W.AUTOFIRE : 0);
    w.cooldown[r] = mount.cooldownTimer; w.burstRemaining[r] = mount.burstRemaining; w.burstTimer[r] = mount.burstTimer;
    w.burstSize[r] = s.burstSize ?? 1; w.burstDelay[r] = s.burstDelay ?? 0; w.refireDelay[r] = s.refireDelay;
    w.beamDuration[r] = s.beamDuration ?? Infinity; w.fluxCost[r] = s.fluxPerShot;
    w.fluxPerSecond[r] = s.fluxPerSecond ?? 0; w.spread[r] = mount.currentSpreadDeg * Math.PI / 180;
    w.firingState[r] = mount.firingState === 'IDLE' ? 0 : mount.firingState === 'CHARGING' ? 1 : mount.firingState === 'ACTIVE' ? 2 : mount.firingState === 'CHARGEDOWN' ? 3 : -1;
    w.health[r] = mount.health; w.projectileRadius[r] = s.projRadius;
    w.relativeX[r] = mount.relativePos.x; w.relativeY[r] = mount.relativePos.y;
    let groupRow = -1;
    if (v.kind === 'FIRE_QUERY') {
      const groups = ship.weaponGroups;
      for (let g = 0; g < groups.length; g++) {
        if (groups[g].weaponSlotIds.includes(mount.slotId)) { groupRow = g; break; }
      }
    }
    w.groupRow[r] = groupRow;
    w.hintMask[r] = hintMask;
    captureStageAIMount(v, r, false);
    const wt = s.weaponType;
    const rangePercent = modifiers ? wt ? modifiers.weapons?.[wt]?.rangePercent ?? 0 : 0 : ship.system.getWeaponRangePercent(wt);
    const speedPercent = s.isGuided ? 0 : modifiers ? wt ? modifiers.weapons?.[wt]?.projectileSpeedPercent ?? 0 : 0 : ship.system.getProjectileSpeedPercent(wt);
    const carrierSpec = ship.sourceCarrier?.spec;
    this.weaponCache[r] = {
      mount, ownerRow, slotId: mount.slotId, mountType: mount.mountType, arcDeg: mount.arcDeg, baseAngleDeg: mount.baseAngleDeg,
      spec: s, aiHints: s.aiHints, immutableHints: !s.aiHints || Object.isFrozen(s.aiHints), hintMask, baseFlags,
      range: s.range, weaponType: s.weaponType, mountSize: s.mountSize, mountTypeOverride: s.mountTypeOverride,
      isPointDefense: s.isPointDefense, isBeam: s.isBeam, isGuided: s.isGuided, isRocket: s.isRocket, spawnType: s.spawnType,
      alwaysFire: s.alwaysFire, systemOnly: s.systemOnly, projSpeed: s.projSpeed, maxSpeed: s.maxSpeed,
      projectileSpeedBonusPercent: s.projectileSpeedBonusPercent, turnRateDegPerSec: s.turnRateDegPerSec,
      damagePerShot: s.damagePerShot, damagePerSecond: s.damagePerSecond, type: s.type, empPerShot: s.empPerShot,
      maxAmmo: s.maxAmmo, burstSize: s.burstSize, burstDelay: s.burstDelay, refireDelay: s.refireDelay,
      beamDuration: s.beamDuration, beamSourceChargeupTime: s.beamSourceChargeupTime, chargeTime: s.chargeTime,
      fluxPerShot: s.fluxPerShot, fluxPerSecond: s.fluxPerSecond, projRadius: s.projRadius,
      hardpointOffsets: s.hardpointOffsets, turretOffsets: s.turretOffsets,
      immutableOffsets: (!s.hardpointOffsets || Object.isFrozen(s.hardpointOffsets)) && (!s.turretOffsets || Object.isFrozen(s.turretOffsets)),
      shipSpec: ship.spec, carrierSpec,
      immutableSpecs: isImmutableMetadata(ship.spec) && (!carrierSpec || isImmutableMetadata(carrierSpec)),
      ecmPenalty: ship.ecmRangePenalty, rangePercent, speedPercent,
      shipX: ship.pos.x, shipY: ship.pos.y, shipFacing: ship.facingRad, barrelIndex: mount.barrelIndex,
      firingState: mount.firingState, firingStateTimer: mount.firingStateTimer,
      isDisabled: mount.isDisabled, isAutofire: mount.isAutofire, spreadDeg: mount.currentSpreadDeg,
      aiPopulated: !!v.ai,
    };
  }
  private projectile(v: StageView, p: Projectile, r: number, reuseUnchanged = false): void {
    const c = v.projectiles;
    if (v.kind !== 'PROJECTILE_CONTACT' && reuseUnchanged && c.handle[r] > 0
      && !p.isGuided && !p.isRocket && !p.isMine && !p.isFlare && !p.damagedTargetIds?.length
      && p.facingRad === undefined && p.targetShipId === undefined && p.targetProjectileId === undefined
      && Object.is(c.x[r], p.pos.x) && Object.is(c.y[r], p.pos.y)
      && Object.is(c.vx[r], p.vel.x) && Object.is(c.vy[r], p.vel.y)
      && Object.is(c.elapsed[r], p.elapsedTime) && Object.is(c.rangeRemaining[r], p.rangeRemaining)
      && Object.is(c.damage[r], p.damage) && Object.is(c.hp[r], p.hitpoints ?? 100)
      && Boolean(c.flags[r] & P.NO_COLLISION) === Boolean(p.collisionDisabled)
      && Boolean(c.flags[r] & P.DISARMED) === Boolean(p.isDisarmed)
      && (!v.ai || v.ai.projectileSourceId[r] === p.sourceShipId && v.ai.projectileDidDamage[r] === Number(!!p.didDamage))) {
      return;
    }
    const sameVel = reuseUnchanged && c.handle[r] > 0 && p.facingRad === undefined && !p.isGuided && !p.isRocket
      && Object.is(c.vx[r], p.vel.x) && Object.is(c.vy[r], p.vel.y);
    const cachedFacing = sameVel ? c.facing[r] : undefined;
    if (!reuseUnchanged || !(c.handle[r] > 0)) c.handle[r] = this.handle(p);
    c.generation[r] = 1; c.id[r] = p.id;
    c.x[r] = p.pos.x; c.y[r] = p.pos.y; c.prevX[r] = p.prevPos.x; c.prevY[r] = p.prevPos.y;
    c.vx[r] = p.vel.x; c.vy[r] = p.vel.y; c.radius[r] = p.radius; c.team[r] = combatTeam(p) ?? NaN;
    c.sourceRow[r] = v.rowById.get(p.sourceShipId) ?? -1;
    if (v.kind === 'PROJECTILE_CONTACT') {
      c.flags[r] = p.isPlayer !== undefined ? P.FILTER_TEAM : 0;
      if (p.damagedTargetIds?.length) {
        const rows = new Set<number>();
        for (const id of p.damagedTargetIds) { const row = v.rowById.get(id); if (row !== undefined) rows.add(row); }
        v.damagedRows.set(r, rows);
      } else if (v.damagedRows.size > 0) v.damagedRows.delete(r);
      return;
    }
    c.flags[r] = (p.isRocket ? P.ROCKET : 0) | (p.isGuided ? P.GUIDED : 0) | (p.isFlare ? P.FLARE : 0)
      | (p.isMine ? P.MINE : 0) | (p.collisionDisabled ? P.NO_COLLISION : 0)
      | (p.isPlayer !== undefined ? P.FILTER_TEAM : 0) | (p.isDisarmed ? P.DISARMED : 0) | (p.inertialFlight ? P.INERTIAL : 0);
    c.damage[r] = p.damage; c.emp[r] = p.empDamage ?? 0; c.damageType[r] = DamageCode[p.damageType];
    c.remainingLife[r] = remainingProjectileLifetime(p);
    c.rangeRemaining[r] = p.rangeRemaining; c.elapsed[r] = p.elapsedTime; c.hp[r] = p.hitpoints ?? 100;
    c.facing[r] = p.facingRad ?? cachedFacing ?? p.vel.heading(); c.targetRow[r] = p.targetShipId ? v.rowById.get(p.targetShipId) ?? -1 : -1;
    c.targetProjectileRow[r] = p.targetProjectileId === undefined ? -1 : v.projectileRowById.get(p.targetProjectileId) ?? -1;
    if (p.damagedTargetIds?.length) {
      const rows = new Set<number>();
      for (const id of p.damagedTargetIds) { const row = v.rowById.get(id); if (row !== undefined) rows.add(row); }
      v.damagedRows.set(r, rows);
    } else if (v.damagedRows.size > 0) v.damagedRows.delete(r);
    captureStageAIProjectile(v, r);
  }
  private beam(v: StageView, beam: Beam, r: number): void {
    const c = v.beams, source = v.rowById.get(beam.sourceShipId) ?? -1;
    c.handle[r] = this.handle(beam); c.generation[r] = 1; c.id[r] = beam.id;
    c.startX[r] = beam.startPos.x; c.startY[r] = beam.startPos.y; c.endX[r] = beam.endPos.x; c.endY[r] = beam.endPos.y;
    c.duration[r] = beam.duration; c.maxDuration[r] = beam.maxDuration; c.dps[r] = beam.damagePerSec;
    c.emp[r] = beam.empPerSec ?? 0; c.damageType[r] = DamageCode[beam.damageType]; c.sourceRow[r] = source;
    let mountRow = -1;
    if (source >= 0) {
      const start = v.bodies.weaponFirst[source], end = start + v.bodies.weaponCount[source];
      for (let w = start; w < end; w++) {
        if (v.mounts[w].slotId === beam.slotId) { mountRow = w; break; }
      }
    }
    c.mountRow[r] = mountRow;
    c.team[r] = combatTeam(beam) ?? NaN; c.width[r] = beam.width; c.damageActive[r] = Number(beam.damageActive !== false); c.elapsed[r] = beam.elapsedTime;
  }
}
