import type { Ship } from '../simulation/Ship';
import type { TacticalOrder } from '../simulation/CombatTypes';
import { isPointDefense } from './AutofireController';
import { weaponDps, weaponRange } from './ShipCombatProfile';

export type FleetRole = 'LINE' | 'BRAWLER' | 'ARTILLERY' | 'SKIRMISHER' | 'CARRIER' | 'UNARMED';
export type FleetTask = 'PRESSURE' | 'FINISH' | 'SCREEN' | 'SUPPORT' | 'REGROUP' | 'DISENGAGE' | 'SEARCH';
/** Frame-local advice, not a player order. Scalars/IDs only so owners can share the same plan. */
export interface FleetAssignment {
  targetId: string | null;
  role: FleetRole;
  task: FleetTask;
  score: number;
  pressureRatio: number;
  assignedPower: number;
  carrierRange: number;
  anchorId: string | null;
  /** Absolute bearing from target toward this ship's approach lane; null preserves stationkeeping. */
  approachBearing: number | null;
}
export type FleetPlan = ReadonlyMap<string, FleetAssignment>;

/** Explicit Web heuristics, not native doctrine/personality or a damage simulator. */
export const fleetPolicy = Object.freeze({
  closeRange: 650, artilleryRange: 1000, skirmisherSpeed: 120,
  commitmentSeconds: 6, travelSeconds: 8, targetStickiness: 1.4,
  regroupPressure: 2.5, resumePressure: 1.6, lowHull: .25, disengageDistanceHysteresis: 200,
  pressureRetreatFlux: .75, pressureResumeFlux: .5, pressureRetreatHull: .5,
  maximumLaneAngle: .55, carrierRangeFallback: 2500,
});
/** An attack window, not an order to ram: retain own flux/hull and local-pressure reserves. */
export function hasAttackOpportunity(ship: Ship, target: Ship, pressureRatio = 1): boolean {
  if (ship.flux.fluxPercent > .7 || ship.hullHp / Math.max(1, ship.maxHullHp) < fleetPolicy.lowHull
    || pressureRatio > fleetPolicy.regroupPressure || target.isCollisionless) return false;
  return target.flux.isOverloaded || target.flux.isVenting || target.hullHp / Math.max(1, target.maxHullHp) < .3
    || (target.flux.fluxPercent >= .75 && target.flux.fluxPercent - ship.flux.fluxPercent >= .2);
}
interface Readiness {
  ship: Ship; role: FleetRole; power: number; range: number; speed: number;
  hull: number; carrierRange: number;
}
const alive = (s: Ship) => !s.isDead && s.hullHp > 0 && !s.isRetreated && !s.isDocked;
const capital = (s: Ship) => s.spec.hullSize !== 'FIGHTER' && !s.isSystemDrone;
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const distance = (a: Ship, b: Ship) => a.pos.distanceTo(b.pos);
const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

function readiness(ship: Ship): Readiness {
  const available = ship.weapons.filter(m => !m.isDisabled && m.ammo >= 1 && weaponDps(m) > 0);
  const offensive = available.filter(m => !isPointDefense(m));
  const sustained = offensive.filter(m => m.spec.weaponType !== 'MISSILE' && m.spec.spawnType !== 'MISSILE' && !m.spec.aiHints?.includes('STRIKE'));
  const battery = sustained.length ? sustained : offensive.length ? offensive : available;
  const ranges = battery.map(m => ({ range: weaponRange(ship, m), power: weaponDps(m) })).sort((a, b) => a.range - b.range);
  const batteryPower = ranges.reduce((sum, m) => sum + m.power, 0);
  let cumulative = 0, range = 0;
  for (const m of ranges) { cumulative += m.power; range = m.range; if (cumulative >= batteryPower / 2) break; }
  const wings = ship.fighterRecall || ship.hullStats.fighterWingRangeMultiplier <= 0 ? []
    : (ship.spec.fighterWings ?? []).slice(0, Math.max(0, ship.hullStats.fighterBays)).filter(w => w.count > 0 && (w.range ?? Infinity) > 0);
  const wingPower = wings.reduce((sum, w) => sum + w.count * 80, 0);
  const carrierRange = wings.length ? Math.min(...wings.map(w => Number.isFinite(w.range)
    ? w.range! : fleetPolicy.carrierRangeFallback)) * ship.hullStats.fighterWingRangeMultiplier * .75 : 0;
  const offensePower = offensive.reduce((sum, m) => sum + weaponDps(m), 0);
  const speed = ship.getMotionStats().maxSpeed;
  const role: FleetRole = carrierRange > 0 && offensePower < wingPower * 1.25 ? 'CARRIER'
    : !battery.length ? 'UNARMED' : range >= fleetPolicy.artilleryRange ? 'ARTILLERY'
    : speed >= fleetPolicy.skirmisherSpeed ? 'SKIRMISHER' : range <= fleetPolicy.closeRange ? 'BRAWLER' : 'LINE';
  const availability = ship.retreating || ship.flux.isOverloaded || ship.flux.isVenting ? .15
    : 1 - clamp(ship.flux.fluxPercent, 0, 1) * .6;
  return { ship, role, range: role === 'CARRIER' ? carrierRange : range, carrierRange, speed,
    hull: clamp(ship.hullHp / Math.max(1, ship.maxHullHp), 0, 1),
    power: (offensePower + (offensive.length ? 0 : batteryPower * .3) + wingPower) * availability };
}

/** One deterministic, immutable assignment pass per AI phase. No persistent world cache or RNG.
 * Weapon summaries are O(mounts); support/scoring are O(teams * ships²), never per-candidate arc scans.
 * Only team-visible enemies participate, including support estimates and approach lanes. */
export function planFleetTactics(ships: readonly Ship[], orders: ReadonlyMap<string, TacticalOrder> = new Map(),
  manualIds: ReadonlySet<string> = new Set()): FleetPlan {
  const units = ships.filter(s => alive(s) && !s.hasVastBulk).map(readiness);
  const byId = new Map(units.map(u => [u.ship.id, u]));
  const actors = units.filter(u => capital(u.ship) && !u.ship.retreating);
  const orderFor = (s: Ship) => orders.get(s.id) ?? (s.isPlayer ? orders.get('fleet') : undefined);
  const plans = new Map<string, FleetAssignment>();
  for (const team of new Set(actors.map(u => u.ship.teamId))) {
    const friends = actors.filter(u => u.ship.teamId === team);
    const enemies = units.filter(u => u.ship.teamId !== team && u.ship.isVisibleTo(team));
    const major = enemies.filter(u => capital(u.ship));
    const candidates = major.length ? major : enemies;
    // Influence around each contact, not knowledge of hidden enemy reinforcements.
    const influence = (at: Ship, group: Readiness[]) => group.reduce((sum, u) => {
      const reach = Math.max(200, u.range) + u.ship.spec.collisionRadius + at.spec.collisionRadius;
      const gap = Math.max(0, distance(at, u.ship) - reach);
      return sum + u.power / (1 + gap / Math.max(100, u.speed * 4));
    }, 0);
    const danger = new Map(units.filter(u => u.ship.teamId === team || u.ship.isVisibleTo(team))
      .map(u => [u.ship.id, influence(u.ship, enemies) / Math.max(1, influence(u.ship, friends))]));
    const claims = new Map<string, number>();
    const previous = new Map<string, string>();
    const claim = (id: string, power: number) => claims.set(id, Math.max(0, (claims.get(id) ?? 0) + power));
    const canContribute = (u: Readiness, target: Ship) => distance(u.ship, target)
      <= u.range + target.spec.collisionRadius + u.ship.spec.collisionRadius + u.speed * fleetPolicy.commitmentSeconds;
    // Reserve explicit/manual engagements before allocating free ships. Seed previous commitments
    // then remove each ship's own claim before scoring, avoiding all-ships-switch-target oscillation.
    for (const u of friends) {
      const order = orderFor(u.ship);
      const id = order?.type === 'ENGAGE' ? order.targetShipId : u.ship.currentTargetShip?.id;
      const target = id ? byId.get(id)?.ship : undefined;
      if (target && target.teamId !== team && target.isVisibleTo(team) && canContribute(u, target)) {
        claim(target.id, u.power); previous.set(u.ship.id, target.id);
      }
    }
    const autonomous = friends.filter(u => !manualIds.has(u.ship.id)).sort((a, b) => {
      const priority = (s: Ship) => orderFor(s)?.type === 'ENGAGE' ? 0 : 1;
      return priority(a.ship) - priority(b.ship) || compareId(a.ship.id, b.ship.id);
    });
    for (const u of autonomous) {
      const ship = u.ship, order = orderFor(ship);
      const old = previous.get(ship.id); if (old) claim(old, -u.power);
      const ordered = (order?.type === 'ENGAGE' || order?.type === 'AVOID') && order.targetShipId
        ? enemies.find(e => e.ship.id === order.targetShipId) : undefined;
      let selected: Readiness | undefined, best = -Infinity;
      for (const e of ordered ? [ordered] : candidates) {
        const target = e.ship;
        const gap = Math.max(0, distance(ship, target) - u.range - target.spec.collisionRadius - ship.spec.collisionRadius);
        const travel = gap / Math.max(20, u.speed);
        const demand = Math.max(100, target.hullHp / fleetPolicy.commitmentSeconds + target.spec.armorRating * .5 + e.power * .75);
        let score = 7 / (1 + travel / fleetPolicy.travelSeconds);
        score += (1 - e.hull) * 2 + clamp(target.flux.fluxPercent, 0, 1) * 1.5;
        if (target.flux.isOverloaded || target.flux.isVenting) score += 2;
        if (target.shield.isPhased || target.system.isPhased) score -= 3;
        score -= Math.min(5, Math.max(0, (danger.get(target.id) ?? 1) - 1) * 1.6);
        score -= Math.min(6, ((claims.get(target.id) ?? 0) + u.power * .25) / demand * 2);
        if (ship.currentTargetShip === target) score += fleetPolicy.targetStickiness;
        if (u.role === 'SKIRMISHER') score += e.role === 'CARRIER' || e.hull < .4 ? 1 : 0;
        if (order?.type === 'DEFEND' && order.targetPos) score -= target.pos.distanceTo(order.targetPos) / Math.max(300, u.range);
        const escort = order?.type === 'ESCORT' ? byId.get(order.targetShipId ?? '') : undefined;
        if (escort) score -= distance(target, escort.ship) / Math.max(300, u.range);
        if (score > best + 1e-6 || Math.abs(score - best) <= 1e-6 && selected && compareId(target.id, selected.ship.id) < 0) {
          selected = e; best = score;
        }
      }
      const target = selected?.ship;
      const covers = friends.filter(a => a !== u && a.role !== 'UNARMED' && a.role !== 'CARRIER'
        && a.hull > .4 && !a.ship.flux.isVenting && !a.ship.flux.isOverloaded && a.ship.flux.fluxPercent < .8
        // An equal, equally exposed neighbor is not cover: do not assign mutual retreat loops.
        && (u.role === 'UNARMED' || a.hull > u.hull + .15 || a.power > u.power * 1.5
          || target && distance(a.ship, target) > distance(ship, target) + ship.spec.collisionRadius + a.ship.spec.collisionRadius));
      const anchor = covers.reduce<Readiness | undefined>((best, a) => !best || distance(ship, a.ship) < distance(ship, best.ship)
        || distance(ship, a.ship) === distance(ship, best.ship) && compareId(a.ship.id, best.ship.id) < 0 ? a : best, undefined);
      const pressure = danger.get(ship.id) ?? 0;
      const wasBackingOff = ship.tacticalAI?.fleetTask === 'REGROUP' || ship.tacticalAI?.fleetTask === 'DISENGAGE';
      const nearFight = target && distance(ship, target) < Math.max(u.range, selected!.range) + ship.spec.collisionRadius + target.spec.collisionRadius + 400
        + (wasBackingOff ? fleetPolicy.disengageDistanceHysteresis : 0);
      const opportunity = !!target && hasAttackOpportunity(ship, target, pressure);
      // Estimated enemy DPS alone is not a retreat order. Healthy gunships must
      // commit before their own guns can reach, even against a stronger contact.
      // Carriers retain stand-off safety; recovered gunships rejoin without waiting
      // for the enemy's paper firepower to disappear.
      const reservesThreatened = u.role === 'CARRIER' || u.hull < fleetPolicy.pressureRetreatHull
        || ship.flux.isOverloaded || ship.flux.isVenting
        || ship.flux.fluxPercent >= (wasBackingOff ? fleetPolicy.pressureResumeFlux : fleetPolicy.pressureRetreatFlux);
      // Retreat intent must not depend on finding cover. A supporting ally crossing
      // 80% flux cannot make an outmatched ship charge back into the same danger.
      // REGROUP and its no-cover fallback share pressure and distance hysteresis.
      const backingOff = !order && !ship.hullStats.doNotBackOff && (u.role === 'UNARMED' && (!!anchor || !!target)
        || nearFight && (u.hull < fleetPolicy.lowHull && (!!anchor || wasBackingOff) || !opportunity && reservesThreatened && pressure > (wasBackingOff ? fleetPolicy.resumePressure : fleetPolicy.regroupPressure)));
      const regroup = backingOff && !!anchor;
      const disengage = backingOff && !anchor && !!target;
      const task: FleetTask = regroup ? 'REGROUP' : disengage ? 'DISENGAGE' : !target ? 'SEARCH' : u.role === 'CARRIER' ? 'SUPPORT'
        : opportunity ? 'FINISH'
        : u.role === 'SKIRMISHER' ? 'SCREEN' : 'PRESSURE';
      const committed = target && canContribute(u, target) && !backingOff ? u.power : 0;
      if (target && committed) claim(target.id, committed);
      plans.set(ship.id, { targetId: target?.id ?? null, role: u.role, task, score: Number.isFinite(best) ? best : 0,
        pressureRatio: pressure, assignedPower: committed, carrierRange: u.carrierRange,
        anchorId: regroup ? anchor!.ship.id : null, approachBearing: null });
    }
    // Distinct approach lanes for autonomous attackers of the SAME team/target. Stable spatial
    // ordering avoids crossing each other simply because deployment IDs have a different order.
    for (const target of candidates) {
      const group = autonomous.filter(u => {
        const p = plans.get(u.ship.id)!;
        return p.targetId === target.ship.id && !orderFor(u.ship) && p.task !== 'REGROUP' && p.task !== 'DISENGAGE'
          && p.role !== 'CARRIER' && p.role !== 'UNARMED';
      });
      if (group.length < 2) continue;
      const x = group.reduce((sum, u) => sum + u.ship.pos.x - target.ship.pos.x, 0);
      const y = group.reduce((sum, u) => sum + u.ship.pos.y - target.ship.pos.y, 0);
      const bearing = Math.atan2(y, x), nx = -Math.sin(bearing), ny = Math.cos(bearing);
      group.sort((a, b) => (a.ship.pos.x - b.ship.pos.x) * nx + (a.ship.pos.y - b.ship.pos.y) * ny || compareId(a.ship.id, b.ship.id));
      group.forEach((u, i) => {
        const spread = fleetPolicy.maximumLaneAngle * (u.role === 'SKIRMISHER' ? 1.25 : 1);
        plans.get(u.ship.id)!.approachBearing = bearing + (i / (group.length - 1) * 2 - 1) * spread;
      });
    }
  }
  return plans;
}

/** Owner validation also compares the plan, so new scoring inputs cannot silently widen its read set. */
export function sameFleetPlan(a: FleetPlan, b: FleetPlan): boolean {
  if (a.size !== b.size) return false;
  for (const [id, p] of a) {
    const q = b.get(id);
    if (!q || p.targetId !== q.targetId || p.role !== q.role || p.task !== q.task || p.score !== q.score
      || p.pressureRatio !== q.pressureRatio || p.assignedPower !== q.assignedPower || p.carrierRange !== q.carrierRange
      || p.anchorId !== q.anchorId || p.approachBearing !== q.approachBearing) return false;
  }
  return true;
}
