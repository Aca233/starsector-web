import { isImmutableMetadata } from '../extensions/Immutable';
import { fighterWeaponRangeFlat, hullModRangePercent, hullModRangeFlat, hullModRangeBaseFlat, hullModRangeMultiplier, hullModRangeThresholdStats, hasOnlyNativeRangeModifiers } from '../extensions/HullMods';
import type { ShipSpec } from '../content/ShipSpec';
import type { Ship } from './Ship';
import type { WeaponSpec } from './Weapon';
import type { SystemModifiers } from '../extensions/ship-systems/Types';

interface RangeEntry {
  range: number; weaponType: WeaponSpec['weaponType']; mountSize: WeaponSpec['mountSize'];
  mountTypeOverride: WeaponSpec['mountTypeOverride']; isPointDefense: WeaponSpec['isPointDefense'];
  missileBody: boolean;
  isBeam: WeaponSpec['isBeam']; aiHints: WeaponSpec['aiHints']; rangefinderPD: boolean | undefined;
  baseRange: number; percent: number; multiplier: number; flat: number;
  rangeThreshold: number; rangePastThresholdMultiplier: number;
  /** Only the neutral-runtime result is memoized; dynamic inputs stay live. */
  value?: number;
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
export function combatWeaponRange(ship: Ship, weapon: WeaponSpec, modifiers?: Readonly<SystemModifiers>): number {
  const percent = modifiers ? weapon.weaponType ? modifiers.weapons?.[weapon.weaponType]?.rangePercent ?? 0 : 0
    : ship.system.getWeaponRangePercent(weapon.weaponType);
  return resolveWeaponRange(ship.spec, weapon, 1 - ship.ecmRangePenalty / 100, percent, ship.sourceCarrier ? fighterWeaponRangeFlat(ship.sourceCarrier.spec, weapon) : 0);
}
export function combatProjectileSpeed(ship: Ship, weapon: WeaponSpec, modifiers?: Readonly<SystemModifiers>): number {
  const basePercent = weapon.projectileSpeedBonusPercent ?? 0;
  const percent = modifiers ? weapon.weaponType ? modifiers.weapons?.[weapon.weaponType]?.projectileSpeedPercent ?? 0 : 0
    : ship.system.getProjectileSpeedPercent(weapon.weaponType);
  return weapon.projSpeed * (1 + (basePercent + percent) / 100) / (1 + basePercent / 100);
}
function resolveWeaponRange(ship: ShipSpec, weapon: WeaponSpec, runtimeMultiplier: number, runtimePercent: number, runtimeFlat = 0): number {
  const dynamic = runtimeMultiplier !== 1 || runtimePercent !== 0 || runtimeFlat !== 0;
  let cache = rangeCaches.get(ship);
  if (cache === undefined && isImmutableMetadata(ship)) {
    cache = hasOnlyNativeRangeModifiers(ship) ? new WeakMap<WeaponSpec, RangeEntry>() : null;
    rangeCaches.set(ship, cache);
  }
  let entry = cache?.get(weapon);
  if (cache) {
    if (!entry || !isImmutableMetadata(weapon)) {
      const missileBody = !!weapon.isRocket || weapon.spawnType === 'MISSILE';
      const hints = weapon.aiHints;
      const rangefinderPD = entry && hints && entry.aiHints === hints && (isImmutableMetadata(hints) || Object.isFrozen(hints))
        ? entry.rangefinderPD
        : hints ? hints.includes('PD') : weapon.isPointDefense;
      if (!entry || entry.range !== weapon.range || entry.weaponType !== weapon.weaponType
        || entry.mountSize !== weapon.mountSize || entry.mountTypeOverride !== weapon.mountTypeOverride
        || entry.isPointDefense !== weapon.isPointDefense || entry.isBeam !== weapon.isBeam
        || entry.missileBody !== missileBody || entry.rangefinderPD !== rangefinderPD) {
        const baseRange = weapon.range + hullModRangeBaseFlat(ship, weapon);
        const percent = hullModRangePercent(ship, weapon);
        const multiplier = hullModRangeMultiplier(ship, weapon);
        const flat = hullModRangeFlat(ship, weapon);
        const stats = hullModRangeThresholdStats(ship);
        entry = { range: weapon.range, weaponType: weapon.weaponType,
          mountSize: weapon.mountSize, mountTypeOverride: weapon.mountTypeOverride,
          isPointDefense: weapon.isPointDefense, isBeam: weapon.isBeam, missileBody, aiHints: hints, rangefinderPD,
          baseRange, percent, multiplier, flat, ...stats };
        cache.set(weapon, entry);
      }
    }
    if (!dynamic && entry.value !== undefined) return entry.value;
    const range = (entry.baseRange * (1 + (entry.percent + runtimePercent) / 100) * entry.multiplier * runtimeMultiplier
      + entry.flat + runtimeFlat) * (ship.weaponRangeMult ?? 1);
    const value = Math.max(0, weapon.weaponType === 'MISSILE' || range <= entry.rangeThreshold ? range
      : entry.rangeThreshold + (range - entry.rangeThreshold) * entry.rangePastThresholdMultiplier);
    if (!dynamic) entry.value = value;
    return value;
  }
  // Source order: WeaponBaseRangeModifier, percent/mult, extra flat, threshold.
  // Weapon type, not projectile spawnType, controls missile exclusions (e.g. bombs).
  const baseRange = weapon.range + hullModRangeBaseFlat(ship, weapon);
  const range = (baseRange * (1 + (hullModRangePercent(ship, weapon) + runtimePercent) / 100) * hullModRangeMultiplier(ship, weapon) * runtimeMultiplier
    + hullModRangeFlat(ship, weapon) + runtimeFlat) * (ship.weaponRangeMult ?? 1);
  const stats = hullModRangeThresholdStats(ship);
  const value = Math.max(0, weapon.weaponType === 'MISSILE' || range <= stats.rangeThreshold ? range
    : stats.rangeThreshold + (range - stats.rangeThreshold) * stats.rangePastThresholdMultiplier);

  return value;
}
