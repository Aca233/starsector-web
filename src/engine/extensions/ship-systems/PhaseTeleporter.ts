import { sameTeam } from "../../simulation/CombatTeams";
import { Vector2 } from '../../math/Vector2';
import type { Ship } from '../../simulation/Ship';
import type { ShipSystem } from '../../simulation/ShipSystem';
import type { ShipSystemDefinition, SystemWorld } from './Types';

/** Native controller: decompiled/starfarer_obf/com/fs/starfarer/combat/systems/int.java.
 * useSystem selects a destination; systemActivated relocates after IN. Displacers
 * follow velocity above 5 units/s (facing otherwise); ordinary teleports follow aim.
 */
interface TeleportPlan { destination: Vector2; facing: number; }
const plans = new WeakMap<ShipSystem, TeleportPlan>();

function finitePoint(point: Vector2): boolean { return Number.isFinite(point.x) && Number.isFinite(point.y); }

function clearLanding(ship: Ship, point: Vector2, world: SystemWorld): boolean {
  // Missing obstacle context is NOT permission to teleport through unknown terrain.
  if (!world.asteroids || !finitePoint(point)) return false;
  const radius = Math.max(1, ship.spec.collisionRadius);
  for (const other of world.ships) {
    // Native clearance excludes fighters, but includes hulks and phased hulls.
    if (other === ship || other.spec.hullSize === 'FIGHTER') continue;
    if (point.distanceTo(other.pos) < radius + other.spec.collisionRadius + 1) return false;
  }
  for (const asteroid of world.asteroids) {
    if (asteroid.hp !== undefined && asteroid.hp <= 0) continue;
    if (point.distanceTo(asteroid.pos) < radius + asteroid.radius + 1) return false;
  }
  return true;
}

/** Bounded deterministic version of the source's 10 rings / 30-degree search.
 * Deliberately safer than native: never select a random occupied fallback or extend
 * beyond the advertised range. No walls exist in this Web world.
 */
export function findTeleportDestination(ship: Ship, desired: Vector2, range: number, world: SystemWorld): Vector2 | null {
  if (!world.asteroids || !finitePoint(desired) || !finitePoint(ship.pos) || !Number.isFinite(range) || range <= 0) return null;
  const delta = desired.clone().sub(ship.pos);
  const distance = delta.length();
  const clamped = distance > range ? ship.pos.clone().addScaled(delta, range / distance) : desired.clone();
  if (clearLanding(ship, clamped, world)) return clamped;
  const step = Math.max(1, ship.spec.collisionRadius);
  for (let ring = 1; ring <= 10; ring++) {
    for (let angle = 0; angle < 12; angle++) {
      const candidate = clamped.clone().add(Vector2.fromAngle(angle * Math.PI / 6, ring * step));
      if (candidate.distanceTo(ship.pos) <= range + 1e-6 && clearLanding(ship, candidate, world)) return candidate;
    }
  }
  return null;
}

function facingAfterJump(ship: Ship, destination: Vector2, world: SystemWorld, displacer: boolean, input: ShipSystem['activationInput']): number {
  const selected = input ? input.target : ship.currentTargetShip;
  if (selected && !selected.isDead && selected.isVisibleTo(ship.teamId) && destination.distanceTo(selected.pos) < 1500) return selected.pos.clone().sub(destination).heading();
  // Native player skimmers fall back to the cursor direction at the departure point.
  if (displacer && ship.fireControlMode === 'MANUAL') return (input?.point??ship.aimTargetWorld).clone().sub(input?.origin??ship.pos).heading();
  let nearest: Ship | undefined;
  let distance = 1000;
  for (const other of world.ships) {
    if (other === ship || other.isDead || sameTeam(other, ship) || other.spec.hullSize === 'FIGHTER' || !other.isVisibleTo(ship.teamId)) continue;
    const current = destination.distanceTo(other.pos);
    if (current < distance) { nearest = other; distance = current; }
  }
  if (nearest) return nearest.pos.clone().sub(destination).heading();
  const delta = destination.clone().sub(ship.pos);
  return displacer || delta.length() <= 10 ? ship.facingRad : delta.heading();
}

export function teleportDefinition(id: string, sourceId: string, name: string, range: number, charges?: number, regen?: number): ShipSystemDefinition {
  const skimmer = sourceId !== 'phaseteleporter';
  return {
    id, sourceIds: [sourceId], name,
    description: skimmer
      ? `沿当前速度方向闪现最多 ${range} 距离（低速时向前）；短暂相位免疫，储存 ${charges} 次，恢复速率 ${regen}/秒。`
      : '向瞄准点传送最多 1500 距离，传送后速度减半；预热时可受击，退相位期间免疫，冷却 15 秒。',
    implementationDetails: '按原版时序、方向、相位窗口与速度规则执行；用接受指令时的输入锁定目的地，到达前复查舰船/小行星。沿用圆形净空与确定性环搜索，限制最大跳距；无安全落点则原地消耗次数/冷却，不使用原版随机重叠回退。系统期间禁止武器/护盾；Web AI，无专用残影/镜头/音效。',
    chargeUp: skimmer ? .25 : .5, active: 0, chargeDown: skimmer ? .25 : .5, cooldown: skimmer ? 0 : 15,
    ...(skimmer ? { charges, chargeRegen: regen } : {}),
    hardFlux: true,
    phase: { vulnerableChargeUp: !skimmer, vulnerableChargeDown: false },
    controls: { blockWeapons: true, blockShields: true, blockFluxDissipation: skimmer },
    onActivate: (ship, world, system) => {
      const effectiveRange = range * ship.hullStats.systemRangeMultiplier;
      plans.delete(system);
      const input=system.activationInput;
      let desired: Vector2;
      if (skimmer) {
        const velocity=input?.velocity??ship.vel;
        const direction = velocity.length() > 5 ? velocity.heading() : input?.facing??ship.facingRad;
        desired = (input?.origin??ship.pos).clone().add(Vector2.fromAngle(direction, effectiveRange));
      } else desired = (input?.point??ship.aimTargetWorld).clone();
      const destination = findTeleportDestination(ship, desired, effectiveRange, world);
      if (destination) plans.set(system, { destination, facing: facingAfterJump(ship, destination, world, skimmer, input) });
    },
    onActive: (ship, world, system) => {
      const plan = plans.get(system);
      plans.delete(system);
      if (!plan || ship.isDead || ship.hullHp <= 0 || ship.flux.isOverloaded || ship.flux.isVenting) return;
      // Ships and asteroids can move during charge-up. Never trust a stale clearance result.
      const destination = findTeleportDestination(ship, plan.destination, range * ship.hullStats.systemRangeMultiplier, world);
      if (!destination) return;
      ship.pos.copy(destination);
      // A jump is not a swept movement segment; do not collide/render across the intervening space.
      ship.prevPos.copy(destination);
      ship.facingRad = ship.prevFacingRad = plan.facing;
      if (!skimmer) ship.vel.scale(.5);
    },
    onAdvance: (_ship, _dt, _world, system) => { if (!system.isActive) plans.delete(system); },
    advanceAI: ({ ship, target, distance, tactical, system = ship.system }) => {
      if (!system.available || system.disabled || system.isActive || system.isCoolingDown
        || ship.isDead || ship.isPhased || ship.flux.isOverloaded || ship.flux.isVenting || target.isDead) return;
      if (system.charges <= 0 || tactical?.waypoint) return;
      const desiredRange = tactical?.desiredRange ?? 600;
      if (skimmer) {
        const direction = ship.vel.length() > 5 ? ship.vel.heading() : ship.facingRad;
        const endpoint = ship.pos.clone().add(Vector2.fromAngle(direction, range * ship.hullStats.systemRangeMultiplier));
        const after = endpoint.distanceTo(target.pos);
        const retreat = tactical?.withdrawing && after > distance + 100;
        const positioning = !tactical?.withdrawing && Math.abs(after - desiredRange) + 100 < Math.abs(distance - desiredRange);
        if (retreat || positioning) system.activate();
      } else if (!tactical?.withdrawing && distance > desiredRange + 700 && !target.isPhased) {
        // Web AI aims at a standoff point rather than teleporting into the target's hull.
        const away = ship.pos.clone().sub(target.pos).normalize();
        ship.aimTargetWorld.copy(target.pos.clone().addScaled(away, desiredRange));
        system.activate();
      }
    }
  };
}

// ship_systems.csv and {displacer,displacer_degraded,phaseteleporter}.system.
export const displacer = teleportDefinition('DISPLACER', 'displacer', '闪现', 300, 3, .1);
export const displacerDegraded = teleportDefinition('DISPLACER_DEGRADED', 'displacer_degraded', '低效闪现', 300, 2, .067);
export const phaseTeleporter = teleportDefinition('PHASE_TELEPORTER', 'phaseteleporter', '相位传送器', 1500);
/** skimmer_drone.system / CSV: 200 range, 3 uses, .25/s recovery, 5% base capacity hard flux.
 * Uses the same documented deterministic safe-landing adapter instead of native +/-25 scatter. */
export const droneSkimmer: ShipSystemDefinition = {
  ...teleportDefinition('SKIMMER_DRONE', 'skimmer_drone', '闪现（无人机）', 200, 3, .25),
  fluxPerUseFraction: .05,
  description: '沿速度方向闪现最多200距离；3次储备，每4秒恢复1次，消耗基础容量5%的硬幅能。采用确定性安全落点，不包含原版25距离随机散布。',
};
