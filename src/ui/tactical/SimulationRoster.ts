import { deploymentCost } from '../../engine/simulation/CombatDeployment';
import source from '../../engine/data/generated/simulation-roster.json';
import variantText from '../../engine/data/generated/simulation-variants.json?raw';
import { evaluate, data, hulls, createDesign } from '../../studio/DesignModel';
import { importNativeVariant } from '../../studio/NativeVariantImport';
import { modManager } from '../../engine/modding/ModManager';
import { contentRegistry } from '../../engine/content/ContentRegistry';
import type { ShipSpec } from '../../engine/content/ShipSpec';

export const simulationHullCost = (id: string): number => deploymentCost(modManager.requireShip(id));
export interface SimulationOption {
  id: string; hullId: string; name: string; variantName: string; cost: number; spec: ShipSpec;
  warnings: string[]; errors: string[]; civilian: boolean; preset: boolean;
}
const variants = JSON.parse(variantText) as Record<string, Record<string, unknown>[]>;
const prepare = new WeakMap<SimulationOption, () => SimulationOption>();
const prepared = new WeakMap<SimulationOption, SimulationOption>();
/** All runtime refittable hulls and their native fits, not the 30-entry stock opponent shortlist.
 * Listing uses existing hull metadata; compile a fit only when inspected or selected. */
export function simulationRoster(): SimulationOption[] {
  const ranks: Record<string, number> = { CAPITAL_SHIP: 4, CRUISER: 3, DESTROYER: 2, FRIGATE: 1 };
  const presets = new Set(source.roster.map(entry => entry.variantId));
  const civilian = new Set(source.roster.filter(entry=>entry.civilian).map(entry=>entry.variant.hullId));
  const roster:SimulationOption[]=[];
  for (const hull of hulls) {
    const fits = variants[hull.id]?.length ? variants[hull.id] : [undefined];
    for (const raw of fits) {
      const variantId=raw?String(raw.variantId):'default-'+hull.id;
      const duplicated=!!raw&&fits.filter(fit=>fit?.variantId===raw.variantId).length>1;
      const id=duplicated?variantId+'--'+Array.from(new TextEncoder().encode(String(raw.catalogSourcePath)),byte=>byte.toString(16).padStart(2,'0')).join(''):variantId;
      const errors:string[]=[];
      let cost=0;
      try { cost=deploymentCost(hull); } catch(error) { errors.push(error instanceof Error?error.message:String(error)); }
      const option:SimulationOption={id, hullId:hull.id, name:data.ships[hull.id].name,
        variantName:raw ? String(raw.displayName ?? raw.variantId)+(duplicated?' · '+String(raw.catalogSourcePath).split('/').at(-1)?.replace('.variant',''):'') : '舰体默认装配',
        cost, spec:hull, errors, warnings:[], preset:presets.has(variantId),
        civilian:civilian.has(hull.id)||!!hull.sourceHullTraits?.includes('CIVILIAN')};
      prepare.set(option,()=>{
        if(option.errors.length)return option;
        try {
          const imported=raw?importNativeVariant(raw):{design:createDesign(hull.id),warnings:['此舰体没有独立原版方案，使用已导入的舰体默认装配。']};
          const result=evaluate(imported.design);
          // Never overwrite studio-prototype or the design under test.
          const nameKey='sim.'+id+'.name';
          const spec:ShipSpec={...result.spec,id:'sim-'+id,sourceHullId:hull.id,deploymentPoints:cost,nameKey,
            i18n:{zh_CN:{[nameKey]:imported.design.name},en_US:{[nameKey]:imported.design.name}}};
          return {...option,spec,warnings:imported.warnings,errors:result.errors};
        } catch(error) { return {...option,errors:[error instanceof Error?error.message:String(error)]}; }
      });
      roster.push(option);
    }
  }
  return roster.sort((a,b)=>Number(a.civilian)-Number(b.civilian)
    ||(ranks[b.spec.hullSize??'']??0)-(ranks[a.spec.hullSize??'']??0)||b.cost-a.cost||a.name.localeCompare(b.name,'zh-CN')||a.variantName.localeCompare(b.variantName,'zh-CN'));
}
export function prepareSimulationOption(option:SimulationOption):SimulationOption {
  let result=prepared.get(option);
  if(!result){result=prepare.get(option)?.()??option;prepared.set(option,result);}
  return result;
}
export const simulationOptionErrors = (option:SimulationOption):string[] => (prepared.get(option)??option).errors;
export function registerSimulationOption(option: SimulationOption): string {
  const resolved=prepareSimulationOption(option);
  if(resolved.errors.length)throw new Error(resolved.name+'：'+resolved.errors.join('；'));
  modManager.registerShip(resolved.spec,{allowExistingId:!!contentRegistry.getShip(resolved.spec.id)});
  return resolved.spec.id;
}
