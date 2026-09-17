import reloadMetadata from './generated/weapon-reload-metadata.json';
import presentation from './PresentationPolicy';
import type { WeaponSpec } from '../simulation/Weapon';
import sourceWeapons from './generated/weapons.json';
import adapters from './generated/weapon-adapters.json';
import refitSource from './generated/refit-source.json';
import { i18n } from '../i18n/LocalizationManager';
for (const locale of ['zh_CN','en_US'] as const) {
  const strings = Object.fromEntries(Object.entries(refitSource.weapons).map(([id, meta]) => ['weapon.' + id + '.name', meta.name]));
  i18n.registerStrings(locale, strings);
}

// Source gameplay/material values must not silently regress through engine adapters.
// Only audio aliases and the legacy muzzle-flash fallback belong in this layer.
const ADAPTER_KEYS = new Set(['soundKey', 'muzzleFlashColor', 'muzzleFlashSize']);
for (const [id, adapter] of Object.entries(adapters)) {
  const forbidden = Object.keys(adapter).filter(key => !ADAPTER_KEYS.has(key));
  if (forbidden.length) throw new Error('Built-in weapon adapter overrides source fields: ' + id + ': ' + forbidden.join(', '));
}

/** Source fields are generated together; engine-only adapters are explicit and independently reviewable. */
export const WEAPON_REGISTRY: Record<string, WeaponSpec> = Object.fromEntries(
  Object.entries(sourceWeapons).map(([id, source]) => [id, {
    ...structuredClone(source),
    ...(reloadMetadata as Record<string, { tags: string[]; ordnancePointCost: number }>)[id],
    ...structuredClone((presentation.weapons as Record<string, Partial<WeaponSpec>>)[id]),
    ...structuredClone(adapters[id as keyof typeof adapters])
  } as WeaponSpec])
);
