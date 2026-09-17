import { signedAngle } from '../../math/Angles';
import { combatWeaponRange } from '../../simulation/WeaponRange';
import type { SystemAIContext, SystemWeaponType } from './Types';

/** Conservative Web policies, not a claim to reproduce native system AI. */
function canActivate({ ship }: SystemAIContext): boolean {
  return ship.system.available && !ship.system.disabled && !ship.system.isActive && !ship.system.isCoolingDown
    && !ship.isDead && ship.hullHp > 0 && !ship.isPhased && !ship.flux.isOverloaded && !ship.flux.isVenting;
}

export function advanceJetsAI(context: SystemAIContext): void {
  if (!canActivate(context)) return;
  const { ship, target, distance, angleDiff, tactical } = context;
  if (ship.getFlameoutRatio() >= 1) return;
  // Unlike Burn Drive these engines preserve steering, strafing, shields and fire.
  // They can assist a retreat or braking, rather than forcing a forward collision.
  const maneuvering = Math.abs(ship.turnInput) > .1 || Math.abs(ship.strafeInput) > .1 || ship.brakeInput;
  const closing = (!tactical || (tactical.forwardClear && !tactical.avoidingCollision))
    && ship.throttle > .1 && distance > (tactical?.desiredRange ?? 600) + 100;
  if ((tactical?.withdrawing && (maneuvering || Math.abs(ship.throttle) > .1))
    || (!target.isDead && (closing || (maneuvering && (Math.abs(angleDiff) > .2 || (tactical?.threat.imminentDamage ?? 0) > 0))))) {
    ship.system.activate();
  }
}

export function advanceWeaponBoostAI(context: SystemAIContext, weaponType: SystemWeaponType): void {
  if (!canActivate(context)) return;
  const { ship, target, tactical } = context;
  if (target.isDead || target.isPhased || tactical?.withdrawing || tactical?.waypoint || ship.system.blocksWeapons) return;
  if (ship.flux.totalFlux + ship.system.fluxCostPerUse > ship.flux.maxFlux * .8) return;
  const useful = ship.weapons.some(mount => {
    if (mount.spec.weaponType !== weaponType || mount.isDisabled || mount.ammo < 1
      || mount.cooldownTimer > ship.system.chargeUpDuration
      || (mount.spec.damagePerShot <= 0 && mount.spec.damagePerSecond <= 0)) return false;
    const muzzle = ship.pos.clone().add(mount.relativePos.clone().rotate(ship.facingRad));
    const delta = target.pos.clone().sub(muzzle);
    const range = delta.length();
    if (range > combatWeaponRange(ship, mount.spec) + target.spec.collisionRadius) return false;
    const aimTolerance = .15 + Math.asin(Math.min(1, target.spec.collisionRadius / Math.max(1, range)));
    return Math.abs(signedAngle(delta.heading() - mount.currentAngleRad)) <= aimTolerance;
  });
  if (useful) ship.system.activate();
}
