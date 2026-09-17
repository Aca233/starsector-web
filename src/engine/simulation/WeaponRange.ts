import { isImmutableMetadata } from '../extensions/Immutable';
import { hullModRangePercent, hullModRangeFlat, hullModRangeBaseFlat, hullModRangeMultiplier, hullModRangeThresholdStats, hasOnlyNativeRangeModifiers } from '../extensions/HullMods';
import type { ShipSpec } from '../content/ShipSpec';
import type { Ship } from './Ship';
import type { WeaponSpec } from './Weapon';

interface RangeEntry {
  range: number; weaponType: WeaponSpec['weaponType']; mountSize: WeaponSpec['mountSize'];
  mountTypeOverride: WeaponSpec['mountTypeOverride']; isPointDefense: WeaponSpec['isPointDefense'];
  missileBody: boolean;
  isBeam: WeaponSpec['isBeam']; rangefinderPD: boolean | undefined; value: number;
}
const rangeCaches = new WeakMap<ShipSpec, WeakMap<WeaponSpec, RangeEntry> | null>();

/** Source data/hullmods/{AdvancedTargetingCore,IntegratedTargetingUnit,DedicatedTargetingCore}.java.
 * One definition for fire control, projectile/beam lifetime, AI, arcs and inspection UI.
 * Only explicitly installed, supported hullmods participate; no hidden hull-ID multipliers.
 */
export function effectiveWeaponRange(ship: ShipSpec, weapon: WeaponSpec): number {
  return resolveWeaponRange(ship, weapon, 1, 0);
}
/** Dynamic combat modifiers are never memoized against shared content definitions. */
export function combatWeaponRange(ship: Ship, weapon: WeaponSpec): number {
  return resolveWeaponRange(ship.spec, weapon, 1 - ship.ecmRangePenalty / 100, ship.system.getWeaponRangePercent(weapon.weaponType));
}
export function combatProjectileSpeed(ship: Ship, weapon: WeaponSpec): number {
  const basePercent = weapon.projectileSpeedBonusPercent ?? 0;
  return weapon.projSpeed * (1 + (basePercent + ship.system.getProjectileSpeedPercent(weapon.weaponType)) / 100) / (1 + basePercent / 100);
}
function resolveWeaponRange(ship: ShipSpec, weapon: WeaponSpec, runtimeMultiplier: number, runtimePercent: number): number {
  const dynamic = runtimeMultiplier !== 1 || runtimePercent !== 0;
  let cache = dynamic ? null : rangeCaches.get(ship);
  if (cache === undefined && isImmutableMetadata(ship)) {
    cache = hasOnlyNativeRangeModifiers(ship) ? new WeakMap<WeaponSpec, RangeEntry>() : null;
    rangeCaches.set(ship, cache);
  }
  // Mount specs remain mutable. Compare every weapon input read by the audited native
  // range hooks (including in-place PD hint edits); never memoize arbitrary mod behavior.
  const missileBody = !!weapon.isRocket || weapon.spawnType === 'MISSILE';
  const rangefinderPD = weapon.aiHints ? weapon.aiHints.includes('PD') : weapon.isPointDefense;
  const entry = cache?.get(weapon);
  if (entry && entry.range === weapon.range && entry.weaponType === weapon.weaponType
    && entry.mountSize === weapon.mountSize && entry.mountTypeOverride === weapon.mountTypeOverride
    && entry.isPointDefense === weapon.isPointDefense && entry.isBeam === weapon.isBeam
    && entry.missileBody === missileBody && entry.rangefinderPD === rangefinderPD) return entry.value;
  // Source order: WeaponBaseRangeModifier, percent/mult, extra flat, threshold.
  // Weapon type, not projectile spawnType, controls missile exclusions (e.g. bombs).
  const baseRange = weapon.range + hullModRangeBaseFlat(ship, weapon);
  const range = (baseRange * (1 + (hullModRangePercent(ship, weapon) + runtimePercent) / 100) * hullModRangeMultiplier(ship, weapon) * runtimeMultiplier
    + hullModRangeFlat(ship, weapon)) * (ship.weaponRangeMult ?? 1);
  const stats = hullModRangeThresholdStats(ship);
  const value = Math.max(0, weapon.weaponType === 'MISSILE' || range <= stats.rangeThreshold ? range
    : stats.rangeThreshold + (range - stats.rangeThreshold) * stats.rangePastThresholdMultiplier);
  if (cache) cache.set(weapon, { range: weapon.range, weaponType: weapon.weaponType,
    mountSize: weapon.mountSize, mountTypeOverride: weapon.mountTypeOverride,
    isPointDefense: weapon.isPointDefense, isBeam: weapon.isBeam, missileBody, rangefinderPD, value });
  return value;
}
