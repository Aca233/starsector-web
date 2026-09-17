import { applyComponentDamage } from '../../simulation/systems/weapon/ComponentDamage';
import { isWithinEmpShieldArc, pickEmpShipTarget } from '../../simulation/systems/weapon/TachyonLanceEffect';
import type { Ship } from '../../simulation/Ship';
import type { Vector2 } from '../../math/Vector2';
import type { SystemWorld } from './Types';

/** Actual EMP damage, not a visual-only arc. Shield interception is evaluated at discharge time. */
export function systemEmpArc(source: Ship, target: Ship, from: Vector2, world: SystemWorld, damage: number, emp: number): void {
  if (source.isDead || target.isDead || target.hullHp <= 0 || target.isDocked) return;
  const point = pickEmpShipTarget(target, from, world.combatRandom);
  const end = point.local.clone().rotate(target.facingRad).add(target.pos);
  world.spawnSystemArc?.(from, end);
  if (target.isCollisionless) return;
  if (isWithinEmpShieldArc(target, from)) {
    if (damage > 0) target.flux.increaseShieldFlux(damage * target.crDamageTakenMultiplier * target.system.getShieldDamageMultiplier() * target.shield.efficiency * target.shield.damageTakenMultiplierFor('ENERGY'), true);
    return;
  }
  const result = target.armor.takeDamage(point.local, damage * target.crDamageTakenMultiplier, 'ENERGY');
  target.applyHullDamage(result.hullDamage);
  applyComponentDamage(target, point.local, result, emp, source);
}
