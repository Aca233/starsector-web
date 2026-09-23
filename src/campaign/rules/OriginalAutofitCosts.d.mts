import type {OriginalCoreAutofitServices,OriginalAutofitHullmodSpec} from './OriginalCoreAutofit.mjs';
import type {OriginalStorageVariant} from './OriginalStorage.mjs';
import type {OriginalVariantShipStats} from './OriginalFleetMemberStats.mjs';
import type {OriginalOPCostListeners} from './OriginalEquipmentCosts.mjs';
export interface OriginalCostHullmodSpec extends OriginalAutofitHullmodSpec {costs:Record<'FRIGATE'|'DESTROYER'|'CRUISER'|'CAPITAL_SHIP',number>;affectsOPCosts:boolean}
export interface OriginalAutofitCostAdapters extends OriginalCoreAutofitServices,OriginalOPCostListeners {
 createVariantStats?(variant:OriginalStorageVariant):OriginalVariantShipStats;
 applyVariantHullmod?(stats:OriginalVariantShipStats,variant:OriginalStorageVariant,spec:OriginalCostHullmodSpec):void;
}
export type OriginalAutofitCostServices=Required<Pick<OriginalCoreAutofitServices,'readVariantOPCost'|'readOrdnancePoints'|'readWeaponOPCost'|'readFighterOPCost'|'readMaxFluxBonus'|'computeNumFighterBays'|'readHullmodCost'|'readSModOPCost'>> & Omit<OriginalCoreAutofitServices,'readCostStats'|'readHullmodSpec'|'readVariantOPCost'> & {
 readCostStats(variant:OriginalStorageVariant):OriginalVariantShipStats|null;
 readHullmodSpec(id:string):OriginalAutofitHullmodSpec|null;
 readVariantOPCost(variant:OriginalStorageVariant,stats:import('./OriginalFleetInflater.mjs').OriginalCoreAutofitSession['stats']):number;
 createVariantStats(variant:OriginalStorageVariant):OriginalVariantShipStats;
 applyVariantHullmod(stats:OriginalVariantShipStats,variant:OriginalStorageVariant,spec:OriginalCostHullmodSpec):void;
};
export function createOriginalAutofitCostServices(services?:OriginalAutofitCostAdapters):OriginalAutofitCostServices;
export function invalidateOriginalVariantOPCosts(variant:OriginalStorageVariant):void;
export const originalAutofitCosts:OriginalAutofitCostServices;
