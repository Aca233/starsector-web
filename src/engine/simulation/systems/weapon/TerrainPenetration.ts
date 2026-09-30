import { contentRegistry } from '../../../content/ContentRegistry';
import type { Projectile } from '../../Weapon';

/** Not a damage threshold for all weapons: explicit opt-in, bounded obstacle size and energy cost. */
export function terrainPenetrationCost(p: Projectile, kind: 'wreck' | 'asteroid', radius: number, hp = 0): number | undefined {
  const profile = contentRegistry.getWeapon(p.specId)?.terrainPenetration;
  if (!profile || !Number.isFinite(radius) || radius > profile.maxRadius || !(profile.minDamageCost > 0)) return;
  const cost = Math.max(profile.minDamageCost, kind === 'wreck' ? radius * profile.wreckDamagePerRadius : hp);
  return Number.isFinite(cost) && p.damage > cost ? cost : undefined;
}

/** Preserve range-fade attenuation after penetration; never restore the original payload next tick. */
export function spendTerrainPenetration(p: Projectile, key: string, cost: number): void {
  const remaining = Math.max(0, 1 - cost / Math.max(.001, p.damage));
  (p.damagedTargetIds ??= []).push(key);
  p.unfadedDamage = (p.unfadedDamage ?? p.damage) * remaining;
  p.unfadedEmp = (p.unfadedEmp ?? p.empDamage ?? 0) * remaining;
  p.damage *= remaining;
  if (p.empDamage !== undefined) p.empDamage *= remaining;
  if (p.baseDamage !== undefined) p.baseDamage *= remaining;
}
