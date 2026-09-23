import type { DeepReadonly } from '../Types.js';
import type { EconomyBonus, EconomyMutable } from './OriginalMarketEconomy.mjs';
import type { OriginalIndustryCommodityPassInput, OriginalIndustryCommodityEntry } from './OriginalIndustryCommodityPass.mjs';
import type { OriginalPopulationStabilityResult, OriginalMarketStabilityResult } from './OriginalMarketStability.mjs';
import type { OriginalPortItemContext } from './OriginalPortItems.mjs';
import type { OriginalIndustryFinanceResult } from './OriginalMarketFinance.mjs';
export interface OriginalLiveIndustryEconomicMarket {
    size:number; previousStability:number; factionId:string; freePort:boolean; factionIllegalCommodityIds:string[];
    conditions:OriginalIndustryCommodityPassInput['conditions']; industries:OriginalIndustryCommodityEntry[];
    commodities:Record<string,{available:EconomyMutable}>;
    military:import('./OriginalMilitaryBases.mjs').OriginalMilitaryMarketState|null;economyBonuses:Record<string,EconomyBonus>|null;
    groundDefenses:EconomyBonus;stability:EconomyMutable;incomeMult:EconomyMutable;upkeepMult:EconomyMutable;hazard:EconomyMutable;
    accessibility:EconomyBonus;maxIndustries:EconomyBonus;hasSpaceport:boolean;
    production:NonNullable<OriginalIndustryCommodityPassInput['production']>|null;
    special:NonNullable<OriginalIndustryCommodityPassInput['special']>|null;
}
export interface OriginalLiveIndustryEffectsResult {
    scope:'ordered-live-industry-economic-effects-only';industryCount:number;
    financialReads:{industryId:string;incomeMult:number;upkeepMult:number;income:number;upkeep:number}[];
    militaryReads:import('./OriginalMilitaryBases.mjs').OriginalMilitaryResult[];
    groundDefenseReads:import('./OriginalGroundDefenses.mjs').OriginalGroundDefenseResult[];
    deficitReads:OriginalMarketStabilityResult['diagnostics']['deficitReads'];
    population:OriginalPopulationStabilityResult|null;
    pending:['fleet-and-defense-runtime','industry-listeners','player-commerce-submarket-lifecycle'];
}
/** Trusted mutable authority/draft state; callbacks must be synchronous. */
export function reapplyOriginalLiveIndustryEffects(runtime:{
    market:OriginalLiveIndustryEconomicMarket;
    context:{constructionQueue:string[];portItemContext:OriginalPortItemContext|null};
    readAdministratorIndustryInputs?(industryId:string):{adminSupplyBonus:number;adminDemandReduction:number;adminFuelSupplyBonus?:number};
    readCommodityAvailable(commodityId:string):number;
    updateResourceImmigration?(entry:OriginalIndustryCommodityEntry,add:boolean):void;
    readPlanetIsGasGiant?():boolean|null;
    reapplyResourceIndustry?(entry:OriginalIndustryCommodityEntry):{finance:DeepReadonly<OriginalIndustryFinanceResult>};
    reapplyCivicIndustry?(entry:OriginalIndustryCommodityEntry):import('./OriginalCivicIndustryEffects.mjs').OriginalCivicEffectsResult;
    modifyPopulationStability():DeepReadonly<OriginalPopulationStabilityResult>;
    applyFinances(industryId:string):DeepReadonly<OriginalIndustryFinanceResult>;
    reapplyImmigrationRegistrations():DeepReadonly<import('./OriginalColonyEnvironment.mjs').OriginalImmigrationObjectLists>;
}):DeepReadonly<OriginalLiveIndustryEffectsResult>;
