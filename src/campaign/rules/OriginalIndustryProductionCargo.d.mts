import type {OriginalIndustryCommodityEntry} from './OriginalIndustryCommodityPass.mjs';
import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
import type {OriginalCampaignMemory,OriginalCampaignMemoryServices} from './OriginalCampaignMemory.mjs';
import type {EconomyMutable} from './OriginalMarketEconomy.mjs';
import type {OriginalPlayerCargo,OriginalPlayerEconomyState} from './OriginalPlayerEconomy.mjs';
import type {OriginalNativeCargoStack} from './OriginalNativeCargo.mjs';
import type {OriginalRelationshipFaction} from './OriginalRelationships.mjs';
import type {OriginalShipSelectionState} from './OriginalShipSelection.mjs';
import type {OriginalFactionEquipmentServices} from './OriginalFactionEquipment.mjs';
import type {OriginalPlayerHullmodServices} from './OriginalPlayerHullmods.mjs';
export interface OriginalIndustryProductionDrop {chances:number;maxChances:number;value:number;valueMult:number;group:string}
export interface OriginalIndustryProductionContext {
 /** Exact market.nativeFrame.memory (also shared by any bound lifecycle); never clone. */
 marketMemory:OriginalCampaignMemory;
 conditions:readonly {id:string}[];
 /** market.special.techMiningMult: the dynamic stat, NOT the depletion memory float. */
 techMiningMult:EconomyMutable;
 playerFaction:OriginalRelationshipFaction;
 /** Existing live faction ship membership; required only for ship blueprint filtering without a knowledge service. */
 shipSelection?:OriginalShipSelectionState;
 /** Existing PlayerCharacterData/skills/hullMods for native hullmod knowledge. */
 playerEconomy?:OriginalPlayerEconomyState;
}
export type OriginalIndustryProductionBlueprints={kind:'blueprint';ships:string[]|null;weapons:string[]|null;fighters:string[]|null;industries:string[]|null}|{kind:'hullmod';id:string};
export interface OriginalIndustryProductionServices {
 memory?:OriginalCampaignMemoryServices;
 factionEquipment?:OriginalFactionEquipmentServices;
 playerHullmods?:OriginalPlayerHullmodServices;
 /** Reuses OriginalFleetEncounterLootServices.generateEncounterExtraDrops. Must generate nonempty drop-group inputs using real SalvageEntity rules, including difficulty and native sorting. */
 generateEncounterExtraDrops?(random:OriginalJavaRandomState,valueMult:number,overallMult:number,fuelMult:number,dropValue:OriginalIndustryProductionDrop[],dropRandom:OriginalIndustryProductionDrop[]):OriginalPlayerCargo;
 /** Required only for a nonnumeric historical Memory value; exact native Memory.getFloat coercion. */
 readIndustryProductionMemoryFloat?(value:unknown):number;
 /** Real plugin getters. null means not a BlueprintProviderItem/ModSpecItemPlugin, NOT unavailable. */
 readIndustryProductionBlueprints?(stack:OriginalNativeCargoStack):OriginalIndustryProductionBlueprints|null;
 /** Ship fallback/override; industry knowledge is not yet captured by existing Faction state. Weapons/fighters/hullmods use existing native modules. */
 isIndustryProductionBlueprintKnown?(faction:OriginalRelationshipFaction,kind:'ship'|'industry',id:string):boolean;
}
export const ORIGINAL_TECH_MINING_MEMORY_KEY:'$core_techMiningMult';
export const ORIGINAL_INDUSTRY_PRODUCTION_CARGO:Readonly<{schemaVersion:1;originalReference:string;scope:string;sources:Record<string,{sha256:string}>;industries:Record<string,{plugin:string;kind:'base-null'|'techmining'}>;techMiningDecay:number;dropRandom:OriginalIndustryProductionDrop[];dropValue:OriginalIndustryProductionDrop[]}>;
export function originalTechMiningRuinSizeModifier(conditions:readonly {id:string}[]):number;
export function originalTechMiningMult(memory:OriginalCampaignMemory,services?:OriginalIndustryProductionServices):number;
export function filterOriginalTechMiningCargo(cargo:OriginalPlayerCargo,context:OriginalIndustryProductionContext,services?:OriginalIndustryProductionServices):OriginalPlayerCargo;
/** BaseIndustry does not require context, services or random. Inoperative TechMining also returns null before context access. Run functional TechMining inside the existing atomic Runtime operation. */
export function generateOriginalIndustryProductionCargo(industry:Pick<OriginalIndustryCommodityEntry,'state'|'operating'>,random:OriginalJavaRandomState|null,context?:OriginalIndustryProductionContext,services?:OriginalIndustryProductionServices):OriginalPlayerCargo|null;
