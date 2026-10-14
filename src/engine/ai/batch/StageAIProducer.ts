import type { AIStageData } from './StageAIData';
import type { StageInputs, StageView } from './StageBridge';
import type { Ship } from '../../simulation/Ship';
import { hasNativeMotionBoundary, readShipSystems } from '../../simulation/Ship';
import { hasAdvanceCombatHullMod } from '../../extensions/HullMods';
import { isImmutableMetadata } from '../../extensions/Immutable';

const bodyColumns = [
  'strafeMultiplier', 'specSpeed', 'specArmor', 'rawShieldActive', 'shieldThreatHalfArc', 'wingPower', 'carrierRange', 'vastBulk',
  'systemDrone', 'player', 'retreating', 'doNotBackOff', 'systemActive',
  'systemLocksTurning', 'forcesAutofire', 'shieldPhased', 'systemPhased',
  'tacticalPresent', 'nativeForecast', 'attachedMotion', 'trainingAction'
] as const;
const mountColumns = ['blockedLaneTarget', 'profileDelay', 'positionTurnRate', 'localBaseAngle', 'authoredHalfArc', 'fixedMount'] as const;
const projectileColumns = ['projectileFuse', 'projectileTurnRate', 'projectileMaxSpeed', 'projectileDidDamage'] as const;
const obstacleColumns = ['obstacleX', 'obstacleY', 'obstacleVx', 'obstacleVy', 'obstacleRadius'] as const;
export function createStageAIData(): AIStageData {
  return {
    ids: [], currentTargetId: [], previousTask: [], systemMode: [], engineState: [], attachmentKey: [],
    slotIds: [], projectileSourceId: [], obstacleCount: 0, asteroidCount: 0,
    ...Object.fromEntries([...bodyColumns, ...projectileColumns, ...obstacleColumns, ...mountColumns]
      .map(key => [key, new Float64Array()]))
  } as unknown as AIStageData;
}
function grow(data: AIStageData, keys: readonly (typeof bodyColumns[number] | typeof projectileColumns[number] | typeof obstacleColumns[number] | typeof mountColumns[number])[], size: number): void {
  if ((data[keys[0]]?.length ?? 0) >= size) return;
  const capacity = Math.max(size, Math.ceil((data[keys[0]]?.length ?? 0) * 1.5), 8);
  for (const key of keys) if (data[key].length < size) {
    const next = new Float64Array(capacity);
    next.set(data[key]); data[key] = next;
  }
}
const attachmentKeyCache = new WeakMap<Ship, { parentId?: string; slotId?: string; x?: number; y?: number; angleDeg?: number; key: string }>();
interface SpecAICache {
  independentRotation: boolean;
  hasAdvanceCombat: boolean;
  wingBays?: number;
  wingPower?: number;
  minWingRange?: number;
  hasWings?: boolean;
}
const specAICache = new WeakMap<Ship['spec'], SpecAICache>();

/** Capture-only adapter for A's frozen supplement. No query or object solver. */
export function captureStageAIShip(v: StageView, ship: Ship, row: number, strafeMultiplier: number): void {
  const a = v.ai; if (!a) return;
  a.ids[row] = ship.id; a.currentTargetId[row] = ship.currentTargetShip?.id;
  a.previousTask[row] = ship.tacticalAI?.fleetTask; a.systemMode[row] = ship.system.tacticalMode;
  a.engineState[row] = ship.engineController.state;
  if (!ship.parentShip && !ship.moduleMount) {
    a.attachmentKey[row] = '[null,null,null,null,null]';
  } else {
    const parentId = ship.parentShip?.id, mount = ship.moduleMount;
    const slotId = mount?.slotId, x = mount?.x, y = mount?.y, angleDeg = mount?.angleDeg;
    let cached = attachmentKeyCache.get(ship);
    if (!cached || cached.parentId !== parentId || cached.slotId !== slotId || cached.x !== x || cached.y !== y || cached.angleDeg !== angleDeg) {
      cached = { parentId, slotId, x, y, angleDeg, key: JSON.stringify([parentId, slotId, x, y, angleDeg]) };
      attachmentKeyCache.set(ship, cached);
    }
    a.attachmentKey[row] = cached.key;
  }
  a.strafeMultiplier[row] = strafeMultiplier; a.specSpeed[row] = ship.spec.maxSpeed;
  a.specArmor[row] = ship.spec.armorRating; a.rawShieldActive[row] = Number(ship.shield.isActive);
  a.shieldThreatHalfArc[row] = ship.shield.maxArcDeg * Math.PI / 360;
  let sc = specAICache.get(ship.spec);
  if (!sc && isImmutableMetadata(ship.spec)) {
    sc = {
      independentRotation: !!ship.spec.sourceHullTraits?.includes('INDEPENDENT_ROTATION'),
      hasAdvanceCombat: hasAdvanceCombatHullMod(ship.spec),
    };
    specAICache.set(ship.spec, sc);
  }
  let wingPower = 0, minWingRange = Infinity, hasWings = false;
  if (!ship.fighterRecall && ship.hullStats.fighterWingRangeMultiplier > 0 && ship.spec.fighterWings) {
    const bays = ship.hullStats.fighterBays;
    if (sc && sc.wingBays === bays) {
      wingPower = sc.wingPower!; minWingRange = sc.minWingRange!; hasWings = sc.hasWings!;
    } else {
      const limit = Math.min(ship.spec.fighterWings.length, Math.max(0, bays));
      for (let i = 0; i < limit; i++) {
        const wing = ship.spec.fighterWings[i];
        if (wing.count > 0 && (wing.range ?? Infinity) > 0) {
          hasWings = true;
          wingPower += wing.count * 80;
          const wr = Number.isFinite(wing.range) ? wRange(wing.range!) : 2500;
          if (wr < minWingRange) minWingRange = wr;
        }
      }
      if (sc) { sc.wingBays = bays; sc.wingPower = wingPower; sc.minWingRange = minWingRange; sc.hasWings = hasWings; }
    }
  }
  a.wingPower[row] = wingPower;
  a.carrierRange[row] = hasWings ? minWingRange * ship.hullStats.fighterWingRangeMultiplier * .75 : 0;
  a.vastBulk[row] = Number(ship.hasVastBulk); a.systemDrone[row] = Number(ship.isSystemDrone);
  a.player[row] = Number(ship.isPlayer); a.retreating[row] = Number(ship.retreating);
  a.doNotBackOff[row] = Number(ship.hullStats.doNotBackOff); a.systemActive[row] = Number(ship.system.isActive);
  a.systemLocksTurning[row] = Number(ship.system.locksTurning); a.forcesAutofire[row] = Number(ship.system.forcesAutofire);
  a.shieldPhased[row] = Number(ship.shield.isPhased); a.systemPhased[row] = Number(ship.system.isPhased);
  a.tacticalPresent[row] = Number(!!ship.tacticalAI);
  a.nativeForecast[row] = Number(ship.hasNativeThreatPhaseHooks);
  // Same attached-only optimization boundary, not permission to skip module AI.
  a.attachedMotion[row] = Number(!!ship.parentShip && !!ship.moduleMount
    && !ship.isStation && !(sc ? sc.independentRotation : ship.spec.sourceHullTraits?.includes('INDEPENDENT_ROTATION'))
    && !(sc ? sc.hasAdvanceCombat : hasAdvanceCombatHullMod(ship.spec))
    && (!ship.systems[1]
      ? ship.system.type === 'NONE' && ship.defenseSystem.type === 'NONE'
      : readShipSystems(ship).every(system => system.type === 'NONE'))
    && v.rowOf.has(ship.parentShip)
    && hasNativeMotionBoundary(ship) && ship.hasOwnedLocalThreatUpdate);
  // Offline training WeakMap overrides cannot enter a private data-command worker.
  // Its standalone generic path retains shipPolicyAction; numeric worker uses bundled policy.
  a.trainingAction[row] = -1;
}
function wRange(r: number): number { return r; }
export function captureStageAIMount(v: StageView, row: number, reuseStatic = false): void {
  const a = v.ai; if (!a) return;
  const mount = v.mounts[row];
  if (!reuseStatic) {
    a.slotIds[row] = mount.slotId;
    a.localBaseAngle[row] = mount.baseAngleDeg * Math.PI / 180;
    a.authoredHalfArc[row] = mount.arcDeg * Math.PI / 360;
    a.fixedMount[row] = Number(mount.mountType === 'HARDPOINT' || (mount.spec.turnRateDegPerSec ?? 1) <= 0);
    a.positionTurnRate[row] = (mount.spec.turnRateDegPerSec ?? 0) * Math.PI / 180;
  }
  a.profileDelay[row] = mount.firingState === 'CHARGING' ? Math.max(0, mount.firingStateTimer)
    : mount.firingState === 'IDLE' && mount.burstRemaining <= 0
      ? mount.spec.isBeam ? mount.spec.beamSourceChargeupTime ?? 0 : mount.spec.chargeTime ?? 0 : 0;
  a.blockedLaneTarget[row] = mount.fireControl?.reason === 'FRIENDLY_BLOCKED' && mount.fireControl.targetKind === 'SHIP'
    && mount.fireControlTargetShipId ? v.rowById.get(mount.fireControlTargetShipId) ?? -1 : -1;
}
export function captureStageAIProjectile(v: StageView, row: number): void {
  const a = v.ai; if (!a) return;
  if (a.projectileFuse.length <= row) grow(a, projectileColumns, row + 1);
  const p = v.projectileRefs[row];
  a.projectileSourceId[row] = p.sourceShipId; a.projectileFuse[row] = p.proximityFuse?.range ?? 0;
  a.projectileTurnRate[row] = (p.maxTurnRate ?? 0) * Math.PI / 180;
  a.projectileMaxSpeed[row] = p.maxSpeed ?? p.vel.length(); a.projectileDidDamage[row] = Number(!!p.didDamage);
}
export function prepareStageAI(v: StageView, data: AIStageData, inputs: StageInputs, mountCount: number, projectileCount: number): void {
  v.ai = data;
  grow(data, bodyColumns, v.bodyCount); grow(data, mountColumns, mountCount);
  grow(data, projectileColumns, projectileCount);
  data.ids.length = data.currentTargetId.length = data.previousTask.length = data.systemMode.length
    = data.engineState.length = data.attachmentKey.length = v.bodyCount;
  data.slotIds.length = mountCount; data.projectileSourceId.length = projectileCount;
  const rawAsteroids = inputs.asteroids;
  const rawHulks = inputs.hulkFragments;
  let asteroidCount = 0, hulkCount = 0;
  if (rawAsteroids) for (let i = 0; i < rawAsteroids.length; i++) if (rawAsteroids[i].hp > 0) asteroidCount++;
  if (rawHulks) for (let i = 0; i < rawHulks.length; i++) {
    const h = rawHulks[i];
    if (h.gravityManaged || h.gravityFixed) hulkCount++;
  }
  data.asteroidCount = asteroidCount; data.obstacleCount = asteroidCount + hulkCount;
  grow(data, obstacleColumns, data.obstacleCount);
  let row = 0;
  if (rawAsteroids) for (let i = 0; i < rawAsteroids.length; i++) {
    const asteroid = rawAsteroids[i];
    if (asteroid.hp <= 0) continue;
    data.obstacleX[row] = asteroid.pos.x; data.obstacleY[row] = asteroid.pos.y;
    data.obstacleVx[row] = asteroid.vel.x; data.obstacleVy[row] = asteroid.vel.y; data.obstacleRadius[row++] = asteroid.radius;
  }
  if (rawHulks) for (let i = 0; i < rawHulks.length; i++) {
    const hulk = rawHulks[i];
    if (!hulk.gravityManaged && !hulk.gravityFixed) continue;
    data.obstacleX[row] = hulk.pos.x; data.obstacleY[row] = hulk.pos.y;
    data.obstacleVx[row] = hulk.vel.x; data.obstacleVy[row] = hulk.vel.y; data.obstacleRadius[row++] = hulk.collisionRadius;
  }
}
