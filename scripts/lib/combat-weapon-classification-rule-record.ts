import { AcquisitionRole as Role } from '../../src/engine/ai/WeaponAcquisitionKernel';
import { isImmutableMetadata } from '../../src/engine/extensions/Immutable';
import type { WeaponSpec } from '../../src/engine/simulation/Weapon';

/** Audit-only prototype: no production import, cache, owner certificate or spec mutation.
 * A successful snapshot says nothing about later writes to its mutable source.
 * Persistent reuse requires the owner/publication boundary described in the audit.
 */
export interface WeaponClassificationRuleRecord {
  readonly staticRoles: number;
  readonly limitedMissileCandidate: boolean;
  readonly beam: boolean;
  readonly guided: boolean;
  readonly alwaysAim: boolean;
}

const keys = ['isBeam', 'isGuided', 'alwaysFire', 'isPointDefense', 'weaponType',
  'passThroughFighters', 'passThroughFightersOnlyWhenDestroyed', 'aiHints'] as const;

/** Match the existing data-descriptor admission, conservatively rejecting non-native
 * scalar types. Read no unknown getter; retain no spec/hints references. Proxies and
 * mutated realm intrinsics are NOT certified by this helper. Rejections use legacy logic.
 */
export function snapshotWeaponClassificationRule(spec: WeaponSpec): WeaponClassificationRuleRecord | undefined {
  if (Object.getPrototypeOf(spec) !== Object.prototype) return;
  const values: Partial<Record<typeof keys[number], unknown>> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(spec, key);
    if (!descriptor) {
      if (key in spec) return;
      continue;
    }
    if (!('value' in descriptor)) return;
    const value: unknown = descriptor.value;
    if (key === 'aiHints') {
      if (value !== undefined && (!Array.isArray(value) || !isImmutableMetadata(value))) return;
    } else if (key === 'weaponType') {
      if (value !== undefined && value !== 'BALLISTIC' && value !== 'ENERGY' && value !== 'MISSILE') return;
    } else if (value !== undefined && typeof value !== 'boolean') return;
    values[key] = value;
  }
  const hints = values.aiHints as readonly string[] | undefined;
  const has = (hint: string) => hints?.includes(hint) ?? false;
  let staticRoles = 0;
  if (has('PD_ONLY')) staticRoles |= Role.PDOnly;
  if (has('ANTI_FTR')) staticRoles |= Role.AntiFighter;
  if (values.passThroughFighters && !values.passThroughFightersOnlyWhenDestroyed) staticRoles |= Role.PassFighters;
  if (has('STRIKE')) staticRoles |= Role.Strike;
  if (has('USE_VS_FRIGATES')) staticRoles |= Role.UseFrigates;
  if (values.isPointDefense || has('PD') || has('PD_ONLY')) staticRoles |= Role.PD;
  const guided = !!values.isGuided;
  return Object.freeze({
    staticRoles,
    limitedMissileCandidate: values.weaponType === 'MISSILE' && !has('DO_NOT_AIM'),
    beam: !!values.isBeam,
    guided,
    alwaysAim: guided && !!(values.alwaysFire || has('DO_NOT_AIM') || has('GUIDED_POOR')),
  });
}

/** Keep live resource semantics outside the immutable rule record. Zero/negative
 * finite ammo still sets this role in the current kernel; this is NOT permission to fire.
 */
export function classificationRoles(record: WeaponClassificationRuleRecord, ammo: number): number {
  return record.staticRoles | (record.limitedMissileCandidate && Number.isFinite(ammo) ? Role.LimitedMissile : 0);
}
