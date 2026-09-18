import variantText from '../engine/data/generated/simulation-variants.json?raw';

export interface NativeVariantChoice {
  /** File-disambiguated identity: native variantId is not globally unique. */
  id: string;
  hullId: string;
  name: string;
  raw: Record<string, unknown>;
}
const catalog = JSON.parse(variantText) as Record<string, Record<string, unknown>[]>;
const choices = new Map<string, readonly NativeVariantChoice[]>();

/** One complete native catalogue for refit, AI fleet and simulation; no hand-written fallback fits. */
export function nativeVariantsForHull(hullId: string): readonly NativeVariantChoice[] {
  let result = choices.get(hullId);
  if (!result) {
    const fits = catalog[hullId] ?? [];
    result = fits.map(raw => {
      const variantId = String(raw.variantId);
      const duplicated = fits.filter(fit => fit.variantId === raw.variantId).length > 1;
      const path = String(raw.catalogSourcePath);
      const suffix = duplicated ? '--' + Array.from(new TextEncoder().encode(path), byte => byte.toString(16).padStart(2, '0')).join('') : '';
      return { id: variantId + suffix, hullId, raw,
        name: String(raw.displayName ?? raw.variantId) + (duplicated ? ' · ' + path.split('/').at(-1)?.replace('.variant', '') : '') };
    });
    choices.set(hullId, result);
  }
  return result;
}
