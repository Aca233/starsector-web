import type {OriginalRelationshipFaction} from './OriginalRelationships.mjs';
export type OriginalProductionItemType='SHIP'|'FIGHTER'|'WEAPON';
export interface OriginalProductionItem {scope:'native-faction-production-item';type:OriginalProductionItemType;specId:string;quantity:number;buildDelay:number;timeInterrupted:number}
export interface OriginalFactionProduction {scope:'native-faction-production';faction:OriginalRelationshipFaction;gatheringPoint:object|null;current:OriginalProductionItem[];interrupted:OriginalProductionItem[];accruedProduction:number;costMult:number}
export interface OriginalProductionItemServices {readProductionItemBaseBuildDelay?(item:OriginalProductionItem):number;readProductionItemMaxQuantity?(item:OriginalProductionItem):number}
export interface OriginalFactionProductionTimeServices {convertFactionSecondsToDays(seconds:number):number}
export function createOriginalProductionItem(type:OriginalProductionItemType,specId:string,quantity:number,services?:OriginalProductionItemServices):OriginalProductionItem;
export function createOriginalFactionProduction(faction:OriginalRelationshipFaction):OriginalFactionProduction;
export function validateOriginalFactionProduction(state:OriginalFactionProduction,faction?:OriginalRelationshipFaction):OriginalFactionProduction;
export function advanceOriginalFactionProduction(state:OriginalFactionProduction,seconds:number,services:OriginalFactionProductionTimeServices):void;
export function addOriginalProductionItem(state:OriginalFactionProduction,type:OriginalProductionItemType,specId:string,quantity?:number,limit?:number,services?:OriginalProductionItemServices):boolean;
export function removeOriginalProductionItem(state:OriginalFactionProduction,type:OriginalProductionItemType,specId:string,quantity:number,services?:OriginalProductionItemServices):void;
export function clearOriginalFactionProduction(state:OriginalFactionProduction,services?:OriginalProductionItemServices):void;
export function originalProductionCount(state:OriginalFactionProduction,type:OriginalProductionItemType,specId:string):number;
export function copyOriginalFactionProduction(state:OriginalFactionProduction):OriginalFactionProduction;
export function resetOriginalFactionProductionFromCopy(state:OriginalFactionProduction,copy:OriginalFactionProduction):void;
export function originalFactionProductionSameAsCopy(state:OriginalFactionProduction,copy:OriginalFactionProduction|null):boolean;

export function originalProductionGatheringPoint(state:OriginalFactionProduction,markets:readonly {playerOwned:boolean}[],services:{isProductionMarketInEconomy(market:object):boolean;readProductionMarketAge(market:object):number}):object|null;

export interface OriginalProductionPricingServices extends OriginalProductionItemServices {
 readProductionBaseValue?(type:OriginalProductionItemType,specId:string):number;
 readProductionWeaponCostOverride?(specId:string):number|null;
}
export function originalProductionBaseCost(item:Pick<OriginalProductionItem,'type'|'specId'>,services?:OriginalProductionPricingServices):number;
export function originalProductionUnitCost(state:OriginalFactionProduction,type:OriginalProductionItemType,specId:string,services?:OriginalProductionPricingServices):number;
export function originalProductionTotalCurrentCost(state:OriginalFactionProduction,services?:OriginalProductionPricingServices):number;
export function originalProductionCapacityForMarket(maxSupply:number,available:number):number;
export function originalMonthlyProductionCapacity<T extends {playerOwned:boolean}>(markets:readonly T[],services:{readProductionMarketSupply(market:T):{maxSupply:number;available:number};applyProductionCapacityModifier(base:number):number}):number;
export function originalProductionCapacityModified(base:number,modifiers:{flat:{id:string;value:number}[];percent:{id:string;value:number}[];mult:{id:string;value:number}[]}):number;
