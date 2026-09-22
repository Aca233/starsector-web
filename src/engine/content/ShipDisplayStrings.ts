import type { ShipSpec } from './ShipSpec';
import { i18n } from '../i18n/LocalizationManager';

/** Definition-owned labels are presentation metadata, not new global hull registrations.
 * Call after validating a local definition or receiving a same-build presentation frame. */
export function registerShipDisplayStrings(spec: ShipSpec, seen = new WeakSet<ShipSpec>()): void {
  if (seen.has(spec)) return;
  seen.add(spec);
  for (const locale of ['zh_CN', 'en_US'] as const) {
    const strings = spec.i18n?.[locale];
    if (strings) i18n.registerStrings(locale, strings);
  }
  for (const mount of spec.modules ?? []) registerShipDisplayStrings(mount.spec, seen);
}
