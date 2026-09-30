import { Vector2 } from '../../math/Vector2';
import { weaponMuzzle, shipSegmentEntry } from '../../ai/FireControlGeometry';
import { sameTeam } from '../CombatTeams';
import type { Ship } from '../Ship';
import type { AsteroidFXCallbacks } from './AsteroidSystem';
import { gravityLineClear, liveGravityShip, resolveGravityBody, releaseGravityTractor, type GravityWorld } from './GravityTractor';
import { applyComponentDamage } from './weapon/ComponentDamage';
import { outgoingDamageMultiplier } from './weapon/OutgoingDamage';
import { combatWeaponRange } from '../WeaponRange';

type GravityDamageFX = Pick<AsteroidFXCallbacks, 'spawnShieldRipple' | 'spawnArmorDamageSparks' | 'addFloatingDamage'> & {
  recordDamage?: (owner: Ship, target: Ship, amount: number, area: 'SHIELD' | 'ARMOR' | 'HULL') => void;
};

/** A real ENERGY hit at the field's contact side, using native shield/armor grids.
 * No synthetic projectile/beam, shield bypass, position overwrite or damage to allies. */
export function applyGravityTidalHit(owner: Ship, target: Ship, from: Vector2, raw: number, strength: number,
  continuous: boolean, fx?: GravityDamageFX): Vector2 | undefined {
  if (!(raw > 0) || !liveGravityShip(target) || sameTeam(owner, target)) return;
  const entry = shipSegmentEntry(target, from, target.pos);
  if (entry === null) return;
  const point = Vector2.lerp(from, target.pos, entry);
  let damage = raw * owner.getWeaponDamageMultiplier('ENERGY') * owner.crDamageDealtMultiplier * outgoingDamageMultiplier(owner, target, 'ENERGY', from, point) * target.crDamageTakenMultiplier;
  if (target.isShieldPointBlocked(point)) {
    const angle = point.clone().sub(target.getShieldCenter()).heading();
    const impact = target.shield.absorbImpact(damage, 'ENERGY', angle);
    // Physical tidal compression is an original hard-flux attack, not a native laser beam.
    target.flux.increaseShieldFlux(impact.flux, true);
    fx?.recordDamage?.(owner, target, impact.absorbed, 'SHIELD');
    damage *= impact.remainingFraction;
    fx?.spawnShieldRipple(point, continuous ? 12 : 45, [65, 175, 215]);
  }
  if (damage > 0) {
    const local = point.clone().sub(target.pos).rotate(-target.facingRad);
    const result = target.armor.takeDamage(local, damage, 'ENERGY', strength, continuous);
    applyComponentDamage(target, local, result, 0, owner);
    const hullDamage = target.applyHullDamage(result.hullDamage);
    fx?.recordDamage?.(owner, target, result.armorDamage, 'ARMOR');
    fx?.recordDamage?.(owner, target, hullDamage, 'HULL');
    fx?.spawnArmorDamageSparks(target, local, result.armorDamage);
    if (hullDamage > 0) fx?.addFloatingDamage(point, hullDamage, [100, 215, 235]);
  }
  return point;
}

/** Called once by the authoritative fixed step after force/controller validity checks. */
export function advanceGravityDamage(dt: number, world: GravityWorld, fx?: GravityDamageFX): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  for (const owner of world.ships) {
    if (!liveGravityShip(owner) || owner.retreating || owner.flux.isVenting || owner.flux.isOverloaded
      || (owner.runtimeModifiers.value.disableSystems ?? 0) > 0) {
      for(const system of owner.allSystems)if(system.definition.gravityCollapse&&system.gravityField){system.gravityField=undefined;system.deactivate();}
      continue;
    }
    for (const mount of owner.weapons) {
      const spec = mount.spec.gravityTractor, state = mount.gravityTractor;
      if (!spec?.tidalDamagePerSecond || !state || state.phase !== 'HOLD' || !state.target || mount.isDisabled) continue;
      const body = resolveGravityBody(state.target, world), from = weaponMuzzle(owner, mount);
      if (!body?.ship || sameTeam(owner, body.ship)) { state.damageClock = 0; continue; }
      const entry = shipSegmentEntry(body.ship, from, body.pos);
      if (entry === null || from.distanceTo(Vector2.lerp(from, body.pos, entry)) > combatWeaponRange(owner, mount.spec) || !gravityLineClear(owner, body, from, world)) {
        releaseGravityTractor(mount, '潮汐连接中断'); continue;
      }
      const cost = (spec.tidalFluxPerSecond ?? 0) * dt;
      if (owner.flux.totalFlux + cost > owner.flux.maxFlux) { releaseGravityTractor(mount, '潮汐幅能不足'); continue; }
      owner.flux.increaseFlux(cost, false);
      state.damageClock = (state.damageClock ?? 0) + dt;
      // Fixed 0.1s packets preserve DPS/armor strength across 30/60/120 Hz and bound FX rate.
      const steps = Math.floor((state.damageClock + 1e-9) / .1);
      if (steps <= 0) continue;
      state.damageClock -= steps * .1;
      const point = applyGravityTidalHit(owner, body.ship, from, spec.tidalDamagePerSecond * steps * .1, spec.tidalDamagePerSecond, true, fx);
      if (point) { state.contactX = point.x; state.contactY = point.y; state.status = '敌舰 · 潮汐撕扯'; }
    }
    for (const system of owner.allSystems) {
      const spec = system.definition.gravityCollapse, field = system.gravityField;
      if (spec && system.disabled) { system.gravityField = undefined; system.deactivate(); continue; }
      if (spec && field && system.state !== 'IN' && system.state !== 'ACTIVE') { system.gravityField = undefined; continue; }
      if (!spec || field?.kind !== 'COLLAPSE' || system.state !== 'ACTIVE') continue;
      field.age+=dt;
      if(field.collapseApplied)continue;
      field.collapseApplied = true;
      const from = new Vector2(field.x, field.y), roots = new Set<Ship>();
      const targets = world.ships.filter(s => liveGravityShip(s) && !sameTeam(owner, s))
        .map(ship => { const entry = shipSegmentEntry(ship, from, ship.pos); return { ship, distance: entry === null ? Infinity : from.distanceTo(Vector2.lerp(from, ship.pos, entry)) }; })
        .filter(row => row.distance <= spec.radius).sort((a, b) => a.distance - b.distance || a.ship.id.localeCompare(b.ship.id));
      for (const { ship, distance } of targets) {
        const root = ship.assemblyRoot;
        if (roots.has(root) || roots.size >= spec.maxShips) continue;
        const body = resolveGravityBody({ kind: 'SHIP', id: ship.id }, world);
        if (!body || !gravityLineClear(owner, { ...body, pos: ship.pos, ship }, from, world)) continue;
        roots.add(root);
        const raw = spec.edgeDamage + (spec.damage - spec.edgeDamage) * Math.max(0, 1 - distance / spec.radius);
        applyGravityTidalHit(owner, ship, from, raw, raw, false, fx);
        field.shipHits.push(root.id);
      }
    }
  }
}
