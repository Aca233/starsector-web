import { glorianaCraftRole } from '../../content/GlorianaAviation';
import type { FireControlWorld } from '../../ai/AutofireController';
import { Vector2 } from '../../math/Vector2';
import { sameTeam } from '../CombatTeams';
import type { Ship } from '../Ship';
import type { Projectile, Beam } from '../Weapon';
import type { BomberAIState, FighterAIState } from '../CombatTypes';
import type { FighterFXCallbacks } from './FighterSystem';
import { aimFlight, attackFlight, carrierOperational, dogfightTarget, flightHostile,
  incomingFlightThreat, payloadNeedsRearm, steerFlight, strikeMounts, wingCanReach } from './FighterTactics';

interface FlightContext {
  craft: Ship; carrier: Ship; fallback: Ship; crafts: readonly Ship[]; projectiles: readonly Projectile[];
  mode: FighterAIState | BomberAIState; dt: number; index: number; range: number; fx: FighterFXCallbacks;
  world?: FireControlWorld;
  spawnProj: (p: Projectile) => void; spawnBeam: (b: Beam) => void;
  spawnFlash: (pos: Vector2, angleRad: number, size: number, color: [number, number, number]) => void;
}
function station(carrier: Ship, index: number, aft = false): Vector2 {
  // Preserve the enlarged craft's distinct stations, with a short moving-carrier lead.
  return carrier.pos.clone().add(new Vector2((aft ? -1 : 1) * (carrier.spec.collisionRadius + 130 + Math.floor(index / 4) * 150),
    (index % 4 - 1.5) * 145).rotate(carrier.facingRad)).addScaled(carrier.vel, .35);
}
/** Geometry-aware front-shield check; soft-flux level alone is NOT a shield opening. */
function shieldCovers(craft: Ship, target: Ship): boolean {
  const root = target.assemblyRoot;
  if (root.shield.voidShield?.armed && !root.shield.voidShield.suppressed && root.shield.voidShield.integrity > 0) return true;
  const shield = target.shield;
  if (!shield.isActive || shield.type === 'NONE' || shield.type === 'PHASE' || shield.currentArcDeg <= 0
    || target.flux.isOverloaded || target.flux.isVenting) return false;
  const center = target.getShieldCenter(), direction = craft.pos.clone().sub(center);
  return target.isShieldPointBlocked(center.addScaled(direction, shield.radius / Math.max(.001, direction.length())));
}

/** Only approved enemies enter acquisition; all allies/terrain still block a shot.
 * Do not forward full-roster query certificates: they would reopen forbidden targets.
 * This prevents autonomous PD/retargeting from bypassing recall or the Starhawk's shield window. */
function tacticalFireWorld(ctx: FlightContext, target: Ship | null, missile: Projectile | null): FireControlWorld {
  const roster = ctx.world?.ships ?? [...ctx.carrier.assemblyShips, ...ctx.crafts, ctx.craft, ctx.fallback];
  const ships = [...new Set(roster.filter(s => sameTeam(s, ctx.craft) || s === target))];
  if (!ships.includes(ctx.craft)) ships.push(ctx.craft);
  if (target && !ships.includes(target)) ships.push(target);
  return { ships, missiles: missile ? [missile] : [], asteroids: ctx.world?.asteroids ?? [] };
}

/** Special tactics choose permission/targets; common flight and native per-mount fire control execute them. */
export function advanceGlorianaCraft(ctx: FlightContext): boolean {
  const { craft, carrier, mode, dt, index, range, fx } = ctx;
  const role = glorianaCraftRole(craft.spec);
  if (!role) return false;
  if (craft.isRetreated) return true;
  craft.clearInput(); craft.fireControlMode = 'AI'; craft.aiHoldOffensiveFire = true;
  craft.currentTargetShip = null;
  mode.timer = Math.max(0, mode.timer - dt);
  const bomber = 'hasTorpedo' in mode ? mode : undefined;
  const fighter = 'hasTorpedo' in mode ? undefined : mode;
  const launchers = strikeMounts(craft).filter(w => Number.isFinite(w.ammo));
  const carrierAlive = carrierOperational(carrier);
  const specific = fx.getOrder(craft.id), order = specific ?? (craft.isPlayer ? fx.getOrder('fleet') : undefined);
  const candidate = fx.findHostile ? fx.findHostile(craft, order?.targetShipId ?? carrier.playerTargetId ?? undefined) : ctx.fallback;
  const target = flightHostile(craft, candidate) ? candidate : null;
  let fireTarget: Ship | null = null, fireMissile: Projectile | null = null;
  const forced = !!order && ['ENGAGE', 'ASSAULT'].includes(order.type) && !!target && (!order.targetShipId || order.targetShipId === target.id);
  const inRange = (point: Vector2, radius = 0) => wingCanReach(carrier, range, point, radius);
  const guard = () => { mode.state = 'ESCORT'; steerFlight(craft, station(carrier, index, !!bomber), carrier.vel); };

  if (bomber?.state === 'DOCKED') {
    // Keep the specialized 12-second cycle and no free hull repair.
    craft.isDocked = true; craft.pos.copy(carrier.pos); craft.prevPos.copy(craft.pos); craft.vel.copy(carrier.vel);
    if (!carrierAlive) {
      craft.isDocked = false;
      if (carrier.isRetreated || carrier.assemblyRoot.isRetreated) craft.isRetreated = true;
      else { craft.isDead = true; craft.hullHp = 0; }
      carrier.deployedWingCraft.delete(craft); return true;
    }
    if (bomber.timer > 0) return true;
    for (const mount of launchers) { mount.ammo = mount.spec.maxAmmo ?? 0; mount.ammoRechargeProgress = 0; }
    bomber.hasTorpedo = true;
    if (carrier.fighterRecall) return true;
    craft.isDocked = false; craft.pos.copy(station(carrier, index, true)); craft.prevPos.copy(craft.pos); craft.vel.copy(carrier.vel);
    bomber.state = 'ESCORT';
  }
  if (bomber && payloadNeedsRearm(launchers)) { bomber.hasTorpedo = false; bomber.state = 'RETURN_TO_REARM'; }

  if (bomber && !bomber.hasTorpedo && carrierAlive) {
    bomber.state = 'RETURN_TO_REARM';
    const landing = station(carrier, index, true);
    steerFlight(craft, landing, carrier.vel, 15);
    if (craft.pos.distanceTo(landing) < 65 && craft.vel.clone().sub(carrier.vel).length() < 100) {
      bomber.state = 'DOCKED'; bomber.timer = 12; craft.isDocked = true; craft.clearInput();
      craft.pos.copy(carrier.pos); craft.prevPos.copy(craft.pos); craft.vel.copy(carrier.vel); return true;
    }
  } else if (!carrierAlive && (carrier.isRetreated || carrier.assemblyRoot.isRetreated)) {
    craft.isRetreated = true; carrier.deployedWingCraft.delete(craft); return true;
  } else if (carrierAlive && (carrier.fighterRecall || !inRange(craft.pos, craft.spec.collisionRadius) || range <= 0)) {
    guard();
  } else if (order?.type === 'WAYPOINT' && order.targetPos) {
    mode.state = 'ESCORT';
    if (carrierAlive && !inRange(order.targetPos)) guard();
    else if (craft.pos.distanceTo(order.targetPos) < 90) { if (specific) fx.cancelOrder(craft.id); craft.brakeInput = true; }
    else steerFlight(craft, order.targetPos);
  } else if (order && ['AVOID', 'DEFEND', 'ESCORT'].includes(order.type) && carrierAlive) {
    guard();
  } else if (role === 'fury') {
    const missile = incomingFlightThreat(craft, carrier, range, ctx.projectiles);
    const opponent = !missile ? dogfightTarget(craft, carrier, range, ctx.crafts, fighter?.targetUnitId) : undefined;
    // Preserve Fury's air-defense priority even during a forced capital attack.
    if (missile) {
      mode.state = 'INTERCEPT'; fireMissile = missile;
      aimFlight(craft, { kind: 'MISSILE', entity: missile });
      steerFlight(craft, craft.aimTargetWorld, missile.vel, 130);
    } else if (opponent) {
      mode.state = 'DOGFIGHT'; fireTarget = opponent; attackFlight(craft, opponent, index, false, .75);
    } else if (forced && target && (!carrierAlive || inRange(target.pos, target.spec.collisionRadius))) {
      mode.state = 'ATTACK'; fireTarget = target; attackFlight(craft, target, index, false, .75);
    } else guard();
  } else if (target && (!carrierAlive || inRange(target.pos, target.spec.collisionRadius))) {
    if (role === 'thunderhawk') {
      mode.state = 'ATTACK'; fireTarget = target;
      attackFlight(craft, target, index, false, .85); // 800 native range -> 680 preferred hull-edge distance.
    } else if (bomber?.hasTorpedo) {
      const launchWindow = forced || !shieldCovers(craft, target);
      bomber.state = launchWindow ? 'ATTACK_RUN' : 'ESCORT';
      attackFlight(craft, target, index, true, launchWindow ? 2 / 3 : .875);
      if (launchWindow) fireTarget = target;
    } else guard();
  } else guard();

  if (fighter) fighter.targetUnitId = fireTarget?.id;
  craft.currentTargetShip = fireTarget;
  craft.aiHoldOffensiveFire = !fireTarget && !fireMissile;
  if (craft.aiHoldOffensiveFire) craft.isFiringMain = false;
  craft.update(dt, fireTarget, ctx.spawnProj, ctx.spawnBeam, ctx.spawnFlash, tacticalFireWorld(ctx, fireTarget, fireMissile));
  if (bomber && payloadNeedsRearm(launchers)) { bomber.hasTorpedo = false; bomber.state = 'RETURN_TO_REARM'; }
  if (craft.hullHp <= 0 && !craft.isDead && fx.destructionSideEffectsEnabled()) fx.handleShipDestruction(craft);
  return true;
}
