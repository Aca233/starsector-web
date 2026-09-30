import type { Ship } from '../../Ship';
import type { Projectile } from '../../Weapon';
import type { Vector2 } from '../../../math/Vector2';
import type { WeaponSimContext } from './WeaponSimContext';
import { sameTeam } from '../../CombatTeams';
import { projectileOutgoingMultiplier } from './OutgoingDamage';

/** Immutable-at-contact field footprint; a lingering explosion must not replay a
 * shield hit, follow its carrier around, or leak through after that shield falls. */
export interface VoidAreaScreen {
  center: Vector2;
  radius: number;
  teamId: number;
  fraction: number;
}
export type VoidAreaScreens = Map<string, VoidAreaScreen>;

/** One exterior blast crosses each hostile field once, not once per protected ship. */
export function screenVoidArea(p: Projectile, ships: Ship[], origin: Vector2, radius: number,
  scale: (distance: number) => number, ctx: WeaponSimContext, screens: VoidAreaScreens = new Map()): VoidAreaScreens {
  for (const candidate of ships) {
    const root = candidate.assemblyRoot;
    if (screens.has(root.id) || sameTeam(root,p)) continue;
    const alreadyIntercepted = p.voidShieldBlockedRoot === root.id;
    if (!alreadyIntercepted && (!root.shield.voidShield || !root.shield.isActive || root.isDead || root.isCollisionless)) continue;
    const center = root.getShieldCenter(), delta = origin.clone().sub(center), length = delta.length();
    const remember = (fraction: number) => screens.set(root.id, {center:center.clone(),radius:root.shield.radius,teamId:root.teamId,fraction});
    // A missile fully stopped by the last layer cannot detonate through its own impact.
    if (alreadyIntercepted) { remember(0); continue; }
    // Detonations already inside the field are not outside impacts.
    if (length < root.shield.radius - .001) continue;
    const distance = Math.max(0, length - root.shield.radius);
    if (distance > radius) continue;
    const point = center.clone().addScaled(delta.normalize(), root.shield.radius);
    const damage = p.damage * scale(distance) * projectileOutgoingMultiplier(p, root, point, ctx) * root.crDamageTakenMultiplier;
    if (!(damage > 0)) continue;
    const result = root.shield.absorbImpact(damage, p.damageType, delta.heading());
    remember(result.remainingFraction);
    ctx.statsTracker?.recordDamageDealt(p.isPlayer ?? false, p.damageType, result.absorbed, 'SHIELD', 0, root.isPlayer);
    ctx.fx.addFloatingDamage(point, result.absorbed, [120, 185, 255]);
  }
  return screens;
}

/** Protection is spatial and allied, not an unconditional assembly/team-wide buff.
 * Use the actual nearest hull/shield contact: protruding hulls remain exposed. */
export function voidAreaDamageFraction(screens: VoidAreaScreens, ship: Ship, point: Vector2): number {
  let fraction = 1;
  for (const screen of screens.values()) {
    if (!sameTeam(ship,screen)) continue;
    const dx=point.x-screen.center.x,dy=point.y-screen.center.y;
    if (dx*dx+dy*dy <= screen.radius*screen.radius + 1e-5) fraction=Math.min(fraction,screen.fraction);
  }
  return fraction;
}
