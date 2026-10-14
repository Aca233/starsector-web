import { bundledHullTemplate } from '../engine/content/BundledHullTemplates';
import { createDesign, designFromModule, type Design } from './DesignModel';
import type { ShipSpec } from '../engine/content/ShipSpec';

/** Preset factories start from an empty draft to avoid inheriting another preset. */
export function createBundledPresetDesign(hullId: string): Design {
  const source = bundledHullTemplate(hullId);
  if (!source) throw new Error('没有该舰体的显式预设：' + hullId);
  const copy = (spec: ShipSpec): Design => {
    const draft = createDesign(spec.id, 'empty'), fit = designFromModule(spec);
    return { ...fit, id: draft.id, name: draft.name, updatedAt: draft.updatedAt,
      ...(spec.modules?.length ? { modules: Object.fromEntries(spec.modules.map(module => [module.slotId, copy(module.spec)])) } : {}) };
  };
  return copy(source);
}
