import type { OriginalResourceCargo } from '../../src/campaign/rules/OriginalResourceCargo.mjs';
import type { OriginalIndustryRuntimeInput } from '../../src/campaign/rules/OriginalIndustryRuntime.mjs';
import type { EconomyMutable, EconomyBonus } from '../../src/campaign/rules/OriginalMarketEconomy.mjs';
export interface NativeSaveNode { name: string; attributes: Record<string, string>; children: NativeSaveNode[]; text: string }
export interface NativeSaveGraph { root: NativeSaveNode; objects: Map<string, NativeSaveNode>; nodeCount: number; resolve(node: NativeSaveNode): NativeSaveNode; child(node: NativeSaveNode, name: string, required?: boolean): NativeSaveNode | null }
export interface NativeSavedStat { objectRef: string; state: EconomyMutable; serializedModified: number | null; temporary: { id: string; timeRemaining: number }[] }
export interface NativeSavedDemand { objectRef: string; demandClass: string; demand: NativeSavedStat }
export interface NativeSavedCommodity {
 commodityId: string; objectRef: string; demandRef: string; demandClass: string;
 stockpile: number; maxSupply: number; maxDemand: number; supplyLegal: boolean; demandLegal: boolean; savedExoticUtility: number;
 greed: NativeSavedStat; available: NativeSavedStat | null; tradeMod: NativeSavedStat | null; tradeModPlus: NativeSavedStat | null; tradeModMinus: NativeSavedStat | null;
 playerDemandMod: EconomyBonus | null; playerSupplyMod: EconomyBonus | null;
 network: 'transient-not-serialized'; priceCalculators: 'transient-requires-readResolve';
}
export interface NativeSavedIndustry {
 /** Absent in older captures; null for an unrecognized industry plugin. */
 runtimeInput?: OriginalIndustryRuntimeInput | null;
 /** Decoded SpID only, not applied installed-item effects. Absent in older captures. */
 specialItem?: { objectRef: string; id: string; data: string | null } | null;
 /** Mining primitive history (false when omitted in native XML); null for other classes. Absent in older JSON captures. */
 shownPlasmaNetVisuals?:boolean|null;
 buildCostOverride?:number|null;
 /** BaseIndustry boxed override: null when omitted in newly read native XML; true/false preserved.
  * Absent in older JSON captures means UNKNOWN. Check property presence before applying isHidden's null->false rule. */
 hiddenOverride?:boolean|null;
 heavyPollution?:{daysWithNanoforge:number;permaPollution:boolean;addedPollution:boolean}|null;
 objectRef: string; industryId: string; classAlias: string; building: boolean; buildProgress: number; wasDisrupted: boolean; buildTime: number | null;
 upgradeId: string | null; aiCoreId: string | null; improved: boolean | null;
 demandReduction: NativeSavedStat | null; supplyBonus: NativeSavedStat | null;
 cleanupFields: Record<'s' | 'd' | 'i' | 'u', 'serialized-requires-decoder' | 'omitted-requires-post-save-restore'>;
 specialItemRef: string | null; otherFields: string[];
}
export interface NativeConditionCallbackObject {
 kind: 'condition' | 'industry'; id: string; objectRef: string; currentPlugin: boolean;
}
export interface NativeConditionLoadCapture {
 scope: 'offline-native-condition-load-inputs';
 stability: NativeSavedStat | null; officerMercProbability: EconomyBonus | null;
 contextByModId: Record<string, import('../../src/campaign/rules/OriginalConditionPhase.mjs').OriginalConditionPhaseContext>;
 pluginState: { conditionRef: string; modId: string; pluginRef: string | null; restored: boolean; shippingLost: NativeSavedStat | null }[];
 permanentCallbacks: NativeConditionCallbackObject[]; unresolved: string[];
}
export interface NativeIndustryInputCapture {
 militaryCapture?:import('../../src/campaign/rules/OriginalMilitaryBases.mjs').OriginalMilitaryMarketState;
 economyBonuses?:Record<string,EconomyBonus|null>;
 scope:'native-industry-commodity-getter-inputs'; previousStability:number|null;
 immigration?:{maxMarketSize:EconomyBonus|null;incentives:{on:boolean;credits:number}};
 marketEffects?:{tags?:string[]|null;constructionQueueState?:{objectRef:string;items:{objectRef:string;industryId:string;cost:number}[]};hasSpaceport:boolean;constructionQueue:string[];maxIndustries:EconomyBonus|null};
 productionQuality:EconomyBonus|null; techMiningMult:NativeSavedStat|null;
 faction:{factionId:string;objectRef:string;illegalCommodityIds:string[]}|null;
 unresolved:string[];
}
export interface NativeNetworkLocationCapture {scope:'native-market-hyperspace-getter-input';primaryRef:string|null;locationRef:string|null;position:{x:number;y:number}|null;unresolved:string[]}
export interface NativeNetworkCapture {scope:'native-economy-network-getter-inputs';registeredFactionIds?:string[]|null;hostility:Record<string,Record<string,boolean>>;relationReadbacks:{from:string;to:string;objectRef:string|null;value:number;hostile:boolean}[];playerStatsRef:string|null;playerExportModifiers:Record<string,NativeSavedStat|null>;unresolved:string[]}
export interface NativePopulationCapture {
 scope:'native-saved-population-state';
 population:import('../../src/campaign/rules/OriginalPopulation.mjs').OriginalPopulationComposition|null;
 incoming:import('../../src/campaign/rules/OriginalPopulation.mjs').OriginalPopulationComposition|null;
}
export interface NativeGrowthMarketCapture {
 scope:'native-colony-growth-getters';
 church:{playerOwned:boolean;madeChurchDeal:boolean;habitable:boolean;adminId:string|null;defeatedExpedition:boolean;constructionQueue:{industryId:string;specExists:boolean}[]|null}|null;
}
export interface NativeGrowthListeners {
 scope:'native-restored-colony-size-listeners';
 permanent:{objectRef:string;type:'luddic-church'}[];transient:{objectRef:string;type:'luddic-church'}[];
 roster:{objectRef:string;className:string}[];unresolved:string[];
}
export interface NativeSavedResourceCargo extends OriginalResourceCargo {
 objectRef:string;spaceUsed:number|null;extraCargoUsed:number;creditsRef:string|null;mothballedShipsRef:string|null;carryingFleetRef:string|null;origSourceRef:string|null;
 nonResourceLifecycle:'retained-source-references-only';source:NativeSaveNode;unresolved:string[];
}
export interface NativeOpenRetailCapture {
 scope:'native-saved-open-resource-cargo';unresolved:string[];
 submarkets:{objectRef:string;specId:string;pluginRef:string|null;factionRef:string|null;timers:{minSWUpdateInterval:number|null;sinceSWUpdate:number|null;sinceLastCargoUpdate:number|null};cargo:NativeSavedResourceCargo|null;source:NativeSaveNode;pluginSource:NativeSaveNode|null;unresolved:string[]}[];
 otherSubmarkets:{objectRef:string;specId:string;pluginRef:string|null;source:NativeSaveNode;storage?:import('../../src/campaign/rules/OriginalStorage.mjs').OriginalStorageState}[];
}
export interface NativeSavedMarket {
 slipstreamDetection?:import('../../src/campaign/rules/OriginalHyperspaceTopography.mjs').OriginalSlipstreamDetection;
 retailCapture?:NativeOpenRetailCapture;
 growthCapture?:NativeGrowthMarketCapture;
 /** Absent in older captures; null population/incoming inside an existing capture are genuine native nulls. */
 populationCapture?:NativePopulationCapture;
 networkLocationCapture?:NativeNetworkLocationCapture;
 /** Actual saved policy and getters; absent in older captures. */
 industryInputCapture?:NativeIndustryInputCapture;
 /** Offline-load-only dependency slice, absent in older captures. */
 conditionLoadCapture?: NativeConditionLoadCapture;
 administratorCapture?: {input:import('../../src/campaign/rules/OriginalAdministrator.mjs').OriginalAdministratorInput;marketModifiers:{combatFleetSize:EconomyBonus|null;groundDefenses:EconomyBonus|null};characterIndustryModifiers?:{administrator:import('../../src/campaign/rules/OriginalCharacterIndustryStats.mjs').OriginalCharacterIndustryModifiers|null;player:import('../../src/campaign/rules/OriginalCharacterIndustryStats.mjs').OriginalCharacterIndustryModifiers|null}};
 /** Missing in older captures; never assume null PlanetEntity without this getter dependency slice. */
 planetInput?: import('../../src/campaign/rules/OriginalMarketPlanet.mjs').OriginalMarketPlanetInput;
 objectRef: string; marketId: string; name: string; factionId: string; size: number; econGroup: string | null; hidden: boolean | null; playerOwned: boolean; isFreePort: boolean;
 location: { x: number; y: number }; hazard: NativeSavedStat; incomeMult: NativeSavedStat; upkeepMult: NativeSavedStat;
 accessibility: EconomyBonus; demandPriceMod: EconomyBonus; supplyPriceMod: EconomyBonus;
 suppressedConditions: string[];
 conditions: { objectRef: string; id: string; unique: string; modId: string; surveyed: boolean; suppressed: boolean; pluginRef: string | null }[];
 industries: NativeSavedIndustry[]; demandClasses: NativeSavedDemand[]; commodities: NativeSavedCommodity[];
 unresolvedObjects: { field: string; objectRef: string }[];
}
export interface NativeClockCapture {
 scope:'native-campaign-clock-with-java-zone-table';state:import('../../src/campaign/rules/OriginalNativeClock.mjs').OriginalNativeClockState;
 readback:{timestamp:number;offset:number;date:import('../../src/campaign/rules/OriginalCalendar.mjs').OriginalCalendarDate};
 source:{runtimeVersion:string;zoneOrigin:'explicit-zone'|'bundled-jre-current-default-on-load';evidence:Record<string,string>};verifiedDateReadbacks:number;verifiedFrameAdvances:number;
}
export interface NativeMonthlyReportCapture {scope:'native-saved-monthly-accounts';sharedRef:string|null;coreRef:string|null;state:import('../../src/campaign/rules/OriginalMonthlyReport.mjs').OriginalMonthlyAccounts|null;runtimeEvidence?:{tutorialInProgress:boolean|null;playerProduction:{objectRef:string;gatheringPointRef:string|null}|null};unresolved:string[]}
export interface NativeSaveEconomyCapture {
 factionDoctrineCapture?:import('../../src/campaign/rules/OriginalFactionDoctrine.mjs').OriginalFactionDoctrineCapture;
 shipSelectionCapture?:import('../../src/campaign/rules/OriginalShipSelection.mjs').OriginalShipSelectionCapture;
 sensorCapture?:import('../../src/campaign/rules/OriginalSensors.mjs').OriginalFleetSensorState;
 routeSpaceCapture?:import('../../src/campaign/rules/OriginalRouteSpace.mjs').OriginalRouteSpace;
 patrolCapture?:import('../../src/campaign/rules/OriginalMilitaryPatrols.mjs').OriginalPatrolState;
 playerEconomyCapture?:import('../../src/campaign/rules/OriginalPlayerEconomy.mjs').OriginalPlayerEconomyCapture;
 economyNotificationCapture?:import('../../src/campaign/rules/OriginalEconomyNotifications.mjs').OriginalEconomyNotificationCapture;
 monthlyReportCapture?:NativeMonthlyReportCapture;
 economyListenerCapture?:import('../../src/campaign/rules/OriginalEconomyListeners.mjs').OriginalEconomyListenerCapture;
 clockCapture?:NativeClockCapture;
 growthListeners?:NativeGrowthListeners;
 /** Null/missing means unavailable, not a running-game false. */
 inNewGameAdvance?:boolean|null;
 networkCapture?:NativeNetworkCapture;
 schemaVersion: 1; scope: 'serialized-native-economy-inputs-not-restored-world'; gameVersion: '0.98a-RC8';
 source: { campaignSha256: string; descriptorSha256: string; campaignBytes: number; formatEvidence?: Record<string, { sha256: string }> };
 clock: { timestamp: string; secondsPerDay: number };
 scheduler: { state: string; elapsed: number; untilNext: number; iterationsLeft: number; previousMonth: number; queuedTaskCount: number };
 marketRoster: string[]; markets: NativeSavedMarket[];
 reconstruction: { readyForAuthority: false; missingIndustryCommodityPlugins: string[]; unrecognizedEnvironmentConditions: string[]; required: string[] };
}
export interface NativeSaveEconomySummary {
 scope: NativeSaveEconomyCapture['scope']; gameVersion: NativeSaveEconomyCapture['gameVersion']; source: NativeSaveEconomyCapture['source'];
 marketCount: number; commodityCount: number; demandClassCount: number; industryCount: number;
 missingIndustryCommodityPlugins: string[]; unrecognizedEnvironmentConditions: string[];
 industriesNeedingPostSaveRestore: number; temporaryModifierCount: number; readyForAuthority: false;
}
export function parseNativeSaveGraph(xml: string): NativeSaveGraph;
export function extractNativeSaveEconomy(campaignXML: string, descriptorXML: string): NativeSaveEconomyCapture;
export function summarizeNativeSaveEconomy(capture: NativeSaveEconomyCapture): NativeSaveEconomySummary;
