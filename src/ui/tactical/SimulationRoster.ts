import source from '../../engine/data/generated/simulation-roster.json';
import { evaluate, data } from '../../studio/DesignModel';
import { importNativeVariant } from '../../studio/NativeVariantImport';
import { modManager } from '../../engine/modding/ModManager';
import { contentRegistry } from '../../engine/content/ContentRegistry';
import type { ShipSpec } from '../../engine/content/ShipSpec';

export const simulationHullCost = (id: string): number => (source.costs as Record<string, number>)[id] ?? 0;
export interface SimulationOption {
  id: string; name: string; variantName: string; cost: number; spec: ShipSpec;
  warnings: string[]; errors: string[]; civilian: boolean;
}
/** Original default simulator roster. Loadouts use the same validated refit adapter. */
export function simulationRoster(): SimulationOption[] {
  const ranks: Record<string, number> = { CAPITAL_SHIP: 4, CRUISER: 3, DESTROYER: 2, FRIGATE: 1 };
  return source.roster.map(entry => {
    const imported = importNativeVariant(entry.variant as unknown as Record<string, unknown>);
    const result = evaluate(imported.design);
    const spec = result.spec;
    // Never overwrite studio-prototype: it owns the user's current design.
    spec.id = 'sim-' + entry.variantId;
    spec.nameKey = 'sim.' + entry.variantId + '.name';
    spec.i18n = { zh_CN: { [spec.nameKey]: imported.design.name }, en_US: { [spec.nameKey]: imported.design.name } };
    return { id: entry.variantId, name: data.ships[entry.variant.hullId].name, variantName: entry.variant.displayName,
      cost: entry.cost, civilian: entry.civilian, spec, warnings: imported.warnings, errors: result.errors };
  }).sort((a, b) => Number(a.civilian) - Number(b.civilian)
    || (ranks[b.spec.hullSize ?? ''] ?? 0) - (ranks[a.spec.hullSize ?? ''] ?? 0) || b.cost - a.cost || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
export function registerSimulationOption(option: SimulationOption): string {
  if (option.errors.length) throw new Error(option.name + '：' + option.errors.join('；'));
  modManager.registerShip(option.spec, { allowExistingId: !!contentRegistry.getShip(option.spec.id) });
  return option.spec.id;
}
