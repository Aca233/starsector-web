import type { AIStageData } from './AIInputs';
import type { StageInputs, StageView } from './StageProtocol';
import type { Ship } from '../../simulation/Ship';
import { hasNativeMotionBoundary } from '../../simulation/Ship';
import { installedHullMods } from '../../extensions/HullMods';

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
  for (const key of keys) if (data[key].length < size) {
    const next = new Float64Array(Math.max(size, Math.ceil(data[key].length * 1.5), 8));
    next.set(data[key]); data[key] = next;
  }
}
/** Capture-only adapter for A's frozen supplement. No query or object solver. */
export function captureStageAIShip(v: StageView, ship: Ship, row: number, strafeMultiplier: number): void {
  const a = v.ai; if (!a) return;
  a.ids[row] = ship.id; a.currentTargetId[row] = ship.currentTargetShip?.id;
  a.previousTask[row] = ship.tacticalAI?.fleetTask; a.systemMode[row] = ship.system.tacticalMode;
  a.engineState[row] = ship.engineController.state;
  a.attachmentKey[row] = JSON.stringify([ship.parentShip?.id, ship.moduleMount?.slotId,
    ship.moduleMount?.x, ship.moduleMount?.y, ship.moduleMount?.angleDeg]);
  a.strafeMultiplier[row] = strafeMultiplier; a.specSpeed[row] = ship.spec.maxSpeed;
  a.specArmor[row] = ship.spec.armorRating; a.rawShieldActive[row] = Number(ship.shield.isActive);
  a.shieldThreatHalfArc[row] = ship.shield.maxArcDeg * Math.PI / 360;
  const wings = ship.fighterRecall || ship.hullStats.fighterWingRangeMultiplier <= 0 ? []
    : (ship.spec.fighterWings ?? []).slice(0, Math.max(0, ship.hullStats.fighterBays)).filter(wing => wing.count > 0 && (wing.range ?? Infinity) > 0);
  a.wingPower[row] = wings.reduce((sum, wing) => sum + wing.count * 80, 0);
  a.carrierRange[row] = wings.length ? wings.reduce((min, wing) => Math.min(min, Number.isFinite(wing.range) ? wing.range! : 2500), Infinity)
    * ship.hullStats.fighterWingRangeMultiplier * .75 : 0;
  a.vastBulk[row] = Number(ship.hasVastBulk); a.systemDrone[row] = Number(ship.isSystemDrone);
  a.player[row] = Number(ship.isPlayer); a.retreating[row] = Number(ship.retreating);
  a.doNotBackOff[row] = Number(ship.hullStats.doNotBackOff); a.systemActive[row] = Number(ship.system.isActive);
  a.systemLocksTurning[row] = Number(ship.system.locksTurning); a.forcesAutofire[row] = Number(ship.system.forcesAutofire);
  a.shieldPhased[row] = Number(ship.shield.isPhased); a.systemPhased[row] = Number(ship.system.isPhased);
  a.tacticalPresent[row] = Number(!!ship.tacticalAI);
  a.nativeForecast[row] = Number(ship.hasNativeThreatPhaseHooks);
  // Same attached-only optimization boundary, not permission to skip module AI.
  a.attachedMotion[row] = Number(!!ship.parentShip && !!ship.moduleMount && v.rowOf.has(ship.parentShip)
    && !ship.isStation && !ship.spec.sourceHullTraits?.includes('INDEPENDENT_ROTATION')
    && ship.hasOwnedLocalThreatUpdate && hasNativeMotionBoundary(ship)
    && installedHullMods(ship.spec).every(mod => !mod.advanceCombat)
    && ship.allSystems.every(system => system.type === 'NONE'));
  // Offline training WeakMap overrides cannot enter a private data-command worker.
  // Its standalone generic path retains shipPolicyAction; numeric worker uses bundled policy.
  a.trainingAction[row] = -1;
}
export function captureStageAIMount(v: StageView, row: number): void {
  const a = v.ai; if (!a) return;
  const mount = v.mounts[row]; a.slotIds[row] = mount.slotId;
  a.localBaseAngle[row] = mount.baseAngleDeg * Math.PI / 180;
  a.authoredHalfArc[row] = mount.arcDeg * Math.PI / 360;
  a.fixedMount[row] = Number(mount.mountType === 'HARDPOINT' || (mount.spec.turnRateDegPerSec ?? 1) <= 0);
  a.profileDelay[row] = mount.firingState === 'CHARGING' ? Math.max(0, mount.firingStateTimer)
    : mount.firingState === 'IDLE' && mount.burstRemaining <= 0
      ? mount.spec.isBeam ? mount.spec.beamSourceChargeupTime ?? 0 : mount.spec.chargeTime ?? 0 : 0;
  a.positionTurnRate[row] = (mount.spec.turnRateDegPerSec ?? 0) * Math.PI / 180;
  a.blockedLaneTarget[row] = mount.fireControl?.reason === 'FRIENDLY_BLOCKED' && mount.fireControl.targetKind === 'SHIP'
    && mount.fireControlTargetShipId ? v.rowById.get(mount.fireControlTargetShipId) ?? -1 : -1;
}
export function captureStageAIProjectile(v: StageView, row: number): void {
  const a = v.ai; if (!a) return;
  grow(a, projectileColumns, row + 1);
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
  const asteroids = (inputs.asteroids ?? []).filter(asteroid => asteroid.hp > 0);
  const hulks = (inputs.hulkFragments ?? []).filter(hulk => hulk.gravityManaged || hulk.gravityFixed);
  data.asteroidCount = asteroids.length; data.obstacleCount = asteroids.length + hulks.length;
  grow(data, obstacleColumns, data.obstacleCount);
  let row = 0;
  for (const asteroid of asteroids) {
    data.obstacleX[row] = asteroid.pos.x; data.obstacleY[row] = asteroid.pos.y;
    data.obstacleVx[row] = asteroid.vel.x; data.obstacleVy[row] = asteroid.vel.y; data.obstacleRadius[row++] = asteroid.radius;
  }
  for (const hulk of hulks) {
    data.obstacleX[row] = hulk.pos.x; data.obstacleY[row] = hulk.pos.y;
    data.obstacleVx[row] = hulk.vel.x; data.obstacleVy[row] = hulk.vel.y; data.obstacleRadius[row++] = hulk.collisionRadius;
  }
}
