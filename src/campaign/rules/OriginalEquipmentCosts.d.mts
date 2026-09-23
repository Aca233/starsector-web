import type {EconomyBonus} from './OriginalMarketEconomy.mjs';
import type {OriginalNativeCharacterStats} from './OriginalNativeCharacterStats.mjs';
export interface OriginalEquipmentCostStats {dynamic:Record<string,EconomyBonus>;listenerManager:object|null}
export interface OriginalWeaponCostSpec {baseOPCost:number;size:'SMALL'|'MEDIUM'|'LARGE';type:string;beam:boolean;aiHints:string[]}
export interface OriginalFighterCostSpec {baseOPCost:number;role:string}
export interface OriginalOPCostListeners {
 readOPCostListeners?(stats:OriginalEquipmentCostStats,kind:'weapon'|'fighter'):object[];
 modifyWeaponOPCost?(listener:object,stats:OriginalEquipmentCostStats,spec:OriginalWeaponCostSpec,value:number):number;
 modifyFighterOPCost?(listener:object,stats:OriginalEquipmentCostStats,spec:OriginalFighterCostSpec,value:number):number;
}
export function originalCostInt(n:number):number;
export function originalCostBonus(bonus:EconomyBonus,value:number):number;
export function originalCostDynamic(stats:OriginalEquipmentCostStats,key:string,value:number):number;
export function originalWeaponOPCost(spec:OriginalWeaponCostSpec,character:OriginalNativeCharacterStats|null,stats:OriginalEquipmentCostStats|null,services?:OriginalOPCostListeners):number;
export function originalFighterOPCost(spec:OriginalFighterCostSpec,stats:OriginalEquipmentCostStats|null,services?:OriginalOPCostListeners):number;
