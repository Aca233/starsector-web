import { deploymentCost } from '../simulation/CombatDeployment';
import source from '../data/generated/simulation-roster.json';
import { nativeVariantsForHull } from '../../studio/NativeVariantCatalog';
import { extensionVariantsForHull } from '../../studio/ExtensionVariantCatalog';
import { evaluate, data, hulls, createDesign, type Design } from '../../studio/DesignModel';
import { importNativeVariant } from '../../studio/NativeVariantImport';
import { modManager } from '../modding/ModManager';
import { contentRegistry } from '../content/ContentRegistry';
import type { ShipSpec } from '../content/ShipSpec';

export const simulationHullCost = (id: string): number => deploymentCost(modManager.requireShip(id));
export const savedSimulationId = (design: Pick<Design, 'id'>): string => 'saved-' + design.id;
export interface SimulationOption {
  id: string; hullId: string; name: string; variantName: string; cost: number; spec: ShipSpec;
  warnings: string[]; errors: string[]; civilian: boolean; preset: boolean;
  origin: 'native' | 'default' | 'extension' | 'saved';
  /** Saved content revision, so an edited selection requires confirmation again. */
  revision?: string;
  /** Exact inspected fit, populated lazily; not registered or deployed by reading. */
  design?: Design;
}
export const simulationOptionSourceLabel = (option: SimulationOption): string => ({
  native: '原版装配', default: '空白舰体', extension: 'Web扩展装配', saved: '已保存装配',
})[option.origin];
const prepare = new WeakMap<SimulationOption, () => SimulationOption>();
const prepared = new WeakMap<SimulationOption, SimulationOption>();
/** Storage-free catalogue shared by the browser and authority worker.
 * Listing uses hull metadata; compile a fit only when inspected or selected. */
export function simulationRoster(savedDesigns: readonly Design[] = []): SimulationOption[] {
  const ranks: Record<string, number> = { CAPITAL_SHIP: 4, CRUISER: 3, DESTROYER: 2, FRIGATE: 1 };
  const presets = new Set(source.roster.map(entry => entry.variantId));
  const civilian = new Set(source.roster.filter(entry=>entry.civilian).map(entry=>entry.variant.hullId));
  const roster: SimulationOption[] = [];
  const add = (hull: ShipSpec, id: string, name: string, origin: SimulationOption['origin'], preset: boolean,
    load: () => { design: Design; warnings: string[] }, revision?: string) => {
    const errors: string[] = [];
    let cost = 0;
    try { cost = deploymentCost(hull); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    const option: SimulationOption = { id, hullId: hull.id, name: data.ships[hull.id].name, variantName: name,
      cost, spec: hull, errors, warnings: [], preset, origin, revision,
      civilian: civilian.has(hull.id) || !!hull.sourceHullTraits?.includes('CIVILIAN') };
    prepare.set(option, () => {
      if (option.errors.length) return option;
      try {
        const imported = load(), result = evaluate(imported.design);
        // Never overwrite studio-prototype or any already-deployed ship's fit.
        const nameKey = 'sim.' + id + '.name';
        const spec: ShipSpec = { ...result.spec, id: 'sim-' + id, sourceHullId: hull.id, deploymentPoints: cost, nameKey,
          i18n: { zh_CN: { [nameKey]: imported.design.name }, en_US: { [nameKey]: imported.design.name } } };
        return { ...option, spec, design: imported.design, warnings: imported.warnings, errors: result.errors };
      } catch (error) { return { ...option, errors: [error instanceof Error ? error.message : String(error)] }; }
    });
    roster.push(option);
  };
  for (const hull of hulls) {
    const nativeFits = nativeVariantsForHull(hull.id);
    add(hull, 'default-' + hull.id, '空白舰体（保留内置）', 'default', false,
      () => ({ design: createDesign(hull.id), warnings: ['新舰体不预装可换装备；可手动选择预设或自己的保存方案。'] }));
    for (const choice of nativeFits) add(hull, choice.id, choice.name, 'native', presets.has(String(choice.raw.variantId)),
      () => importNativeVariant(choice.raw));
    for (const choice of extensionVariantsForHull(hull.id)) add(hull, choice.id, choice.name, 'extension', false,
      () => ({ design: choice.create(), warnings: ['Web扩展装配方案，并非原版预设。'] }));
    for (const saved of savedDesigns.filter(design => design.hullId === hull.id)) {
      const snapshot = structuredClone(saved);
      add(hull, savedSimulationId(snapshot), snapshot.name, 'saved', false,
        () => ({ design: snapshot, warnings: [] }), JSON.stringify(snapshot));
    }
  }
  return roster.sort((a,b)=>Number(a.civilian)-Number(b.civilian)
    ||(ranks[b.spec.hullSize??'']??0)-(ranks[a.spec.hullSize??'']??0)||b.cost-a.cost||a.name.localeCompare(b.name,'zh-CN')||a.variantName.localeCompare(b.variantName,'zh-CN'));
}
export function prepareSimulationOption(option: SimulationOption): SimulationOption {
  let result = prepared.get(option);
  if (!result) { result = prepare.get(option)?.() ?? option; prepared.set(option, result); }
  return result;
}
export const simulationOptionErrors = (option: SimulationOption): string[] => (prepared.get(option) ?? option).errors;
/** Only selected personal fits cross the worker boundary; native/extension IDs stay authoritative. */
export function selectedSimulationDesigns(options: readonly SimulationOption[]): Design[] {
  const saved = new Map<string, Design>();
  for (const option of options) if (option.origin === 'saved') {
    const resolved = prepareSimulationOption(option);
    if (!resolved.design || resolved.errors.length) throw new Error(resolved.errors.join('；') || '无法读取已保存装配。');
    saved.set(option.id, structuredClone(resolved.design));
  }
  return [...saved.values()];
}
export function registerSimulationOption(option: SimulationOption): string {
  const resolved = prepareSimulationOption(option);
  if (resolved.errors.length) throw new Error(resolved.name + '：' + resolved.errors.join('；'));
  modManager.registerShip(resolved.spec, { allowExistingId: !!contentRegistry.getShip(resolved.spec.id) });
  return resolved.spec.id;
}

export interface SimulationHull { hullId: string; options: SimulationOption[] }
/** Keep the original catalog order, but show each hull only once in the deployment grid. */
export function groupSimulationHulls(options: readonly SimulationOption[]): SimulationHull[] {
  const groups = new Map<string, SimulationHull>();
  for (const option of options) {
    let group = groups.get(option.hullId);
    if (!group) { group = { hullId: option.hullId, options: [] }; groups.set(option.hullId, group); }
    group.options.push(option);
  }
  return [...groups.values()];
}
