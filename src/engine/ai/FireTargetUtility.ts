import type { Ship } from '../simulation/Ship';
import type { WeaponMount } from '../simulation/Weapon';
import { POLICY_TUNING, type PolicyAction } from './learning/CombatPolicy';

const fraction = (n: number) => Math.max(0, Math.min(1, n));
/** Utility only ranks already-legal, reachable ship contacts. It never authorizes a shot. */
export function fireTargetUtility(ship: Ship, mount: WeaponMount, target: Ship,
  shieldCovered: boolean, retained: boolean, traverse: number, flightTime: number,
  action: PolicyAction = 'BALANCED'): number {
  const tuning = POLICY_TUNING[action];
  const hull = fraction(target.hullHp / Math.max(1, target.maxHullHp));
  const vulnerable = target.flux.isOverloaded || target.flux.isVenting;
  // Match damage to the surface actually facing this muzzle, not merely 'shield is on'.
  const shield = shieldCovered && !vulnerable;
  const effectiveness = mount.spec.type === 'KINETIC' ? (shield ? 2 : .5)
    : mount.spec.type === 'HIGH_EXPLOSIVE' ? (shield ? .5 : 2)
    : mount.spec.type === 'FRAGMENTATION' ? (target.spec.hullSize === 'FIGHTER' ? 1.5 : .25) : 1;
  const finiteAmmo = Number.isFinite(mount.ammo) && !(mount.spec.ammoRegenPerSec! > 0);
  const shieldConservation = shield && mount.spec.aiHints?.includes('USE_LESS_VS_SHIELDS');
  return effectiveness * .65
    + (target === ship.currentTargetShip ? .45 : 0) + (retained ? .22 : 0)
    + tuning.finish * ((1 - hull) * .55 + (vulnerable ? .55 : 0))
    + tuning.pressure * (shield ? fraction(target.flux.fluxPercent) * .35 : 0)
    - (shieldConservation ? 1.8 : 0) - (finiteAmmo && shield && mount.spec.type === 'HIGH_EXPLOSIVE' ? .6 : 0)
    - Math.min(Math.PI, Math.abs(traverse)) * .14 - Math.min(4, Math.max(0, flightTime)) * .06;
}
