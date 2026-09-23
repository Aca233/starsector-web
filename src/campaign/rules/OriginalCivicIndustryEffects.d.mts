import type {EconomyBonus,EconomyMutable} from './OriginalMarketEconomy.mjs';
import type {OriginalCivicLifecycleRow} from './OriginalCivicLifecycle.mjs';
import type {OriginalImmigrationObjectLists} from './OriginalColonyEnvironment.mjs';
import type {OriginalIndustryFinanceResult} from './OriginalMarketFinance.mjs';
import type {OriginalPopulationIndustryEffectsRuntime} from './OriginalPopulationIndustryEffects.mjs';
import type {OriginalPopulationStabilityResult} from './OriginalMarketStability.mjs';
import type {DeepReadonly} from '../Types.js';
export interface OriginalCivicEffectsMarket {
 size:number;hasSpaceport:boolean;accessibility:EconomyBonus;stability:EconomyMutable;groundDefenses:EconomyBonus;
 economyBonuses:Record<string,EconomyBonus>|null;immigrationModifiers:OriginalImmigrationObjectLists|null;
 /** Population-only fields: required at runtime for population, never defaulted for ports/defenses. */
 conditions?:{id:string}[];incomeMult?:EconomyMutable;upkeepMult?:EconomyMutable;maxIndustries?:EconomyBonus;
}
export interface OriginalPopulationCivicEffectsMarket extends OriginalCivicEffectsMarket {
 conditions:{id:string}[];incomeMult:EconomyMutable;upkeepMult:EconomyMutable;
 /** Already a bonus; do not wrap it in another {modifiers:...} when passing the market. */
 maxIndustries:EconomyBonus;
}
export interface OriginalPopulationCivicServices {
 /** Mutates this same market before Base.apply; no detached projection or historical fallback. */
 modifyStability():DeepReadonly<OriginalPopulationStabilityResult>;
 dynamic:OriginalPopulationIndustryEffectsRuntime;
 /** Actual Misc.getNumIndustries: includes native upgrading and construction-queue contributions. */
 readIndustryCount():number;
 /** Effective native flag: first queued industry has spaceport tag AND no current construction. */
 isSpaceportFirstInQueue():boolean;
}
export interface OriginalPopulationCivicDeficitRead {commodityIds:string[];commodityId:string|null;deficit:number}
export interface OriginalPopulationCivicEffectsResult {
 /** Ordered scans, including the initial food scan before non-habitable food+organics. */
 deficitReads:OriginalPopulationCivicDeficitRead[];
 industryCount:number;maxIndustries:number;
}
export interface OriginalCivicEffectsResult {
 finance:DeepReadonly<OriginalIndustryFinanceResult>;
 portDeficit:{commodityId:string|null;deficit:number}|null;
 defense:DeepReadonly<import('./OriginalGroundDefenses.mjs').OriginalGroundDefenseResult>|null;
 /** Present only for ordinary no-item population; diagnostics, never replacement market state. */
 population?:DeepReadonly<OriginalPopulationStabilityResult>;
 /** Complete ordinary population apply diagnostics, separate from the established stability result. */
 populationEffects?:OriginalPopulationCivicEffectsResult;
}
export interface OriginalCivicIndustryEffectsRuntime {
 /** Runtime supplies this synchronous getter; optional only for direct helper callers.
  * Population invokes it AFTER modifyStability; every plugin invokes it BEFORE updateBonuses.
  * Returned values must be actual native floats, not historical/defaulted administrator data.
  */
 readAdministratorIndustryInputs?():{adminSupplyBonus:number;adminDemandReduction:number};
 applyFinances():DeepReadonly<OriginalIndustryFinanceResult>;
 readCommodityAvailable(id:string):number;
 portItemContext:import('./OriginalPortItems.mjs').OriginalPortItemContext|null;
 /** Optional for other civic plugins; mandatory for population. All methods are synchronous. */
 population?:OriginalPopulationCivicServices;
}
export function hasOriginalCivicFrame(id:string):boolean;
/** Includes population, but special items/lamp are separately rejected. */
export function hasOriginalCivicEffects(id:string):boolean;
export function unapplyOriginalCivicItem(m:OriginalCivicEffectsMarket,row:OriginalCivicLifecycleRow):void;
/** Exact ordinary population cleanup is supported; never clears its supply/demand history. */
export function unapplyOriginalCivicIndustry(m:OriginalCivicEffectsMarket,row:OriginalCivicLifecycleRow):void;
export function applyOriginalLiveCivicIndustry(m:OriginalCivicEffectsMarket,row:OriginalCivicLifecycleRow,runtime:OriginalCivicIndustryEffectsRuntime):OriginalCivicEffectsResult;
