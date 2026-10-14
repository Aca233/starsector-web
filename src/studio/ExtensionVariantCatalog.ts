import { packageVariants } from '../engine/modding/ShipPackCatalog';
import { designFromPackVariant } from './ShipPackDesign';
import type { Design } from './DesignModel';

export interface ExtensionVariantChoice {
  id: string;
  name: string;
  warnings?: readonly string[];
  create: (current?: Pick<Design, 'wings'>) => Design;
}
/** Refit and simulation share package-owned fits; no hull-specific UI dispatch. */
export function extensionVariantsForHull(hullId: string): readonly ExtensionVariantChoice[] {
  return packageVariants(hullId).map(variant => ({id: variant.id, name: variant.name, warnings: variant.warnings,
    create: current => designFromPackVariant(variant, current)}));
}
