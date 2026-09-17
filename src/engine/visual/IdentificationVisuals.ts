import { combatTeam } from "../simulation/CombatTeams";
import type { Projectile } from '../simulation/Weapon';
import type { Ship } from '../simulation/Ship';
import { Vector2 } from '../math/Vector2';

// renderers/OOoO.java and settings.json:textEnemyColor, not weapon/engine tint.
export const HOSTILE_INDICATOR_COLOR = [255, 100, 0] as const;
export const IDENTIFICATION_ALPHA = 0.3 * 0.37;

export interface IdentificationDiamond {
  pos: Vector2;
  radius: number;
  thickness: number;
  brightness: number;
  alpha: number;
}

/** Missile.render(FF_INDICATORS_LAYER): friendly missiles and flares are hidden. */
export function missileIdentification(p: Projectile, playerSide: number | boolean, alpha: number, age = p.elapsedTime): IdentificationDiamond | null {
  if (combatTeam(p) === (typeof playerSide === "boolean" ? (playerSide ? 0 : 1) : playerSide) || p.isFlare || p.renderTargetIndicator === false
    || !(p.isRocket || p.spawnType === 'MISSILE') || (p.hitpoints !== undefined && p.hitpoints <= 0)) return null;
  return {
    pos: Vector2.lerp(p.prevPos, p.pos, alpha),
    // Q's sprite collision radius, NOT sprite length or propulsion glow radius.
    radius: Math.max(p.radius, 15), thickness: 2.5,
    brightness: Math.min(1, Math.max(0, age) / 0.25), alpha: 1
  };
}

/** Regular hull path in Ship.render(FF_INDICATORS_LAYER), independent of selected target. */
export function shipIdentification(ship: Ship, playerSide: number | boolean, alpha: number, combatTime: number): IdentificationDiamond | null {
  if (ship.teamId === (typeof playerSide === "boolean" ? (playerSide ? 0 : 1) : playerSide) || ship.isDead) return null;
  const spec = ship.spec;
  const radius = Math.max(25, Math.min(Math.max(spec.shieldRadius * 0.9, 25), (spec.spriteWidth + spec.spriteHeight) * 0.5));
  const center = new Vector2(spec.shieldCenterX ?? 0, spec.shieldCenterY ?? 0).rotate(ship.interpolatedFacing(alpha));
  return {
    pos: ship.interpolatedPos(alpha).add(center), radius,
    thickness: spec.hullSize === 'FIGHTER' ? 3.5 : 5.5,
    brightness: Math.min(1, Math.max(0, combatTime) / 0.25),
    alpha: ship.shield.type === 'PHASE' ? 1 - 0.75 * ship.shield.phaseEffectLevel : 1
  };
}
