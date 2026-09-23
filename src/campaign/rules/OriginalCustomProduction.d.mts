import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
import type {OriginalFactionProduction,OriginalProductionPricingServices} from './OriginalFactionProduction.mjs';
import type {OriginalMonthlyAccounts} from './OriginalMonthlyReport.mjs';
import type {OriginalPlayerCargo} from './OriginalPlayerEconomy.mjs';
import type {OriginalNativeCargoServices} from './OriginalNativeCargo.mjs';
export interface OriginalCustomProductionState {scope:'native-core-custom-production';coreRef:string;random:OriginalJavaRandomState|null}
export interface OriginalProductionBatch {title:string|null;cargo:OriginalPlayerCargo}
export interface OriginalProductionDelivery<M=object> {gatheringPoint:M;batches:OriginalProductionBatch[];totalCost:number;accrued:number;noProductionThisMonth:boolean}
export interface OriginalCustomProductionContext<M extends {playerOwned:boolean}={playerOwned:boolean}> {
 gatheringPoint:M|null;storageCargo:OriginalPlayerCargo|null;production:OriginalFactionProduction;accounts:OriginalMonthlyAccounts;
 markets:M[];devMode:boolean;weaponsHaveCost:boolean;
 settings:{doctrineFleetQualityPerPoint:number;productionSuppliesBonusFraction:number;commodityPrices:{supplies:number;fuel:number;crew:number}};
}
export interface OriginalCustomProductionServices<M={playerOwned:boolean},Fleet=object,Member=object,Industry=object> {
 pricing?:OriginalProductionPricingServices;cargo?:OriginalNativeCargoServices;
 readMonthlyProductionCapacity():number;
 createProductionRandom?():OriginalJavaRandomState;
 readSharedMiscRandom?():OriginalJavaRandomState;
 createProductionCargo():OriginalPlayerCargo;
 initializeProductionMothballedShips(cargo:OriginalPlayerCargo):void;
 readProductionMarketQuality(market:M):number;
 readPlayerDoctrineQualityContribution():number;
 createProductionFleet():Fleet;
 attachProductionInflater(fleet:Fleet,params:{quality:number;mode:'PRIORITY_THEN_ALL';persistent:false;seed:string;timestamp:null;blockHullmodsWithItemReqs:true}):void;
 readProductionHullVariants(hullId:string):string[];
 addProductionFleetMember(fleet:Fleet,variantId:string):void;
 inflateProductionFleet(fleet:Fleet):void;
 readProductionFleetMembers(fleet:Fleet):Member[];
 addProductionMothballedMember(cargo:OriginalPlayerCargo,member:Member):void;
 /** Wing values first, then weapons, matching actual current non-built-in variant order. */
 readProductionMemberFittingValues(member:Member):number[];
 readProductionCargoMembers(cargo:OriginalPlayerCargo):Member[];
 isProductionCargoEmpty(cargo:OriginalPlayerCargo):boolean;
 readProductionIndustries(market:M):Industry[];
 generateIndustryProductionCargo(industry:Industry,random:OriginalJavaRandomState):OriginalPlayerCargo|null;
 readIndustryProductionCargoTitle(industry:Industry):string|null;
 /** Must call setMothballed(false) followed by setCR(0.5), not replace the actual member. */
 prepareProductionMemberForDelivery(member:Member):void;
 addProductionReportIntel(report:OriginalProductionDelivery<M>):void;
}
export type OriginalCustomProductionResult={skipped:'no-gathering-point'|'no-storage'}|{skipped:null;capacity:number;totalCost:number;weaponCost:number;accrued:number;wantedToDoProduction:boolean;unableToDoProduction:boolean;delivered:boolean;batches:OriginalProductionBatch[]};
export function createOriginalCustomProductionState(coreRef:string,seed:string):OriginalCustomProductionState;
export function validateOriginalCustomProductionState(state:OriginalCustomProductionState):OriginalCustomProductionState;
export function executeOriginalCustomProduction<M extends {playerOwned:boolean},Fleet,Member,Industry>(state:OriginalCustomProductionState,context:OriginalCustomProductionContext<M>,services:OriginalCustomProductionServices<M,Fleet,Member,Industry>):OriginalCustomProductionResult;

export function originalProductionMemberFittingValues(member:{variant:import('./OriginalStorage.mjs').OriginalStorageVariant|null}):number[];
