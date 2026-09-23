import type {OriginalResourceCargo} from './OriginalResourceCargo.mjs';
import type {DeepReadonly} from '../Types.js';
import type {EconomyBonus,EconomyMutable} from './OriginalMarketEconomy.mjs';
export interface OriginalLocalAccountingCargo extends OriginalResourceCargo {objectRef:string;unresolved?:string[];spaceUsed?:number;extraCargoUsed?:number}
export interface OriginalEconomyListenerObject {taken?:OriginalLocalAccountingCargo|null;left?:OriginalLocalAccountingCargo|null;objectRef:string;classAlias:string;kind:'ship-quality'|'local-resources'|'pirate-base'|'pather-base'|'unsupported';marketId:string|null;marketRef:string|null;ended:boolean|null;tier:string|null;large:boolean|null;submarketSpecId:string|null}
export interface OriginalEconomyListenerCapture {shipQualitySingleton?:{objectRef:string|null;classAlias:string|null};scope:'native-economy-update-listeners';roster:string[];managedRoster?:string[]|null;objects:Record<string,OriginalEconomyListenerObject>;unresolved:string[]}
export interface OriginalListenerMarket {playerOwned?:boolean;marketId:string;factionId:string;econGroup:string|null;hidden:boolean;economyBonuses:Record<string,EconomyBonus>|null;commodities:Record<string,{available:EconomyMutable;maxSupply:number;maxDemand:number}>;retail:{unresolved:string[];submarkets:{specId:string}[];otherSubmarkets:{specId:string}[]}|null}
export interface OriginalShipQualityData {econGroup:string|null;factionId:string;marketId:string|null;prod:number;qMod:number;quality:EconomyBonus}
export interface OriginalEconomyListenerRuntime {factionShipQualityContribution?(factionId:string):number;market(id:string):OriginalListenerMarket;marketIds():string[];getCommodityData(marketId:string,commodityId:string):unknown;getShipping(marketId:string):{readonly inFaction:number};isPaused():boolean;chargeRestocking?(marketId:string,commodityId:string,quantity:number):unknown}
export interface OriginalEconomyListenerCheckpoint {scope:'web-economy-listener-checkpoint';schemaVersion:1;capture:OriginalEconomyListenerCapture;quality:[string,[string,OriginalShipQualityData][]][]}
export class OriginalEconomyUpdateListeners {
 static fromCheckpoint(checkpoint:unknown,runtime:OriginalEconomyListenerRuntime):OriginalEconomyUpdateListeners;
 checkpoint():DeepReadonly<OriginalEconomyListenerCheckpoint>;
 constructor(capture:DeepReadonly<OriginalEconomyListenerCapture>,runtime:OriginalEconomyListenerRuntime);
 managedRoster():string[]|null;removeManagedListener(ref:string):void;
 reportEconomyTick(ref:string,iteration:number):{scope:'local-resources-economy-tick-only';registered:boolean;billedStacks:number};
 reportEconomyMonthEnd(ref:string):{scope:'local-resources-month-end-only';registered:boolean};
 roster():string[];listener(ref:string):OriginalEconomyListenerObject;expired(ref:string):boolean;remove(ref:string):void;commodityUpdated(ref:string,commodityId:string):void;economyUpdated(ref:string):void;
 shipQualityManagerRef():string;shipQuality(marketId?:string|null,factionId?:string|null):number;
 qualityData(ref:string,marketId:string):OriginalShipQualityData;
 snapshot():DeepReadonly<{scope:'native-economy-update-listener-state';shipQualitySingleton:{objectRef:string|null;classAlias:string|null}|null;roster:string[];managedRoster:string[]|null;objects:Record<string,OriginalEconomyListenerObject>;shipQuality:Record<string,Record<string,OriginalShipQualityData>>}>;
}
