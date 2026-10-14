import { randomId } from '../shared/RandomId';
import { packageVariants, packageRefit } from '../engine/modding/ShipPackCatalog';
import '../engine/modding/ModManager';
import type { PackFit, PackVariant } from '../engine/modding/ShipPack';
import type { Design } from './DesignModel';
export function designFromPackVariant(variant: PackVariant, current?: Pick<Design, 'wings'>): Design {
  const copy = (fit: PackFit, root = false): Design => {
    const {modules, ...equipment} = structuredClone(fit);
    return {...equipment, version: 1, id: randomId(), name: root ? variant.name : `${packageRefit().ships[fit.hullId].name} · 方案 01`, updatedAt: Date.now(),
      ...(modules ? {modules: Object.fromEntries(Object.entries(modules).map(([slot, module]) => [slot, copy(module)]))} : {})};
  };
  const design = copy(variant.fit, true);
  if (variant.preserveWings && current?.wings !== undefined) design.wings = [...current.wings];
  return design;
}
export function createPackDesign(hullId: string, variantId: string, current?: Pick<Design, 'wings'>): Design {
  const variant = packageVariants(hullId).find(entry => entry.id === variantId);
  if (!variant) throw new Error('该单舰包或配装未启用：' + variantId);
  return designFromPackVariant(variant, current);
}
