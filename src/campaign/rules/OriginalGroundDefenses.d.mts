import type {DeepReadonly} from '../Types.js';
import type {EconomyBonus,EconomyMutable} from './OriginalMarketEconomy.mjs';
import type {OriginalIndustryCommodityEntry} from './OriginalIndustryCommodityPass.mjs';
export const ORIGINAL_GROUND_DEFENSES:DeepReadonly<{schemaVersion:1;originalReference:string;scope:'ground-defense-stat-effects-only';sources:Record<string,{sha256:string}>;industries:string[];constants:Record<'DEFENSE_BONUS_BASE'|'DEFENSE_BONUS_BATTERIES'|'IMPROVE_DEFENSE_BONUS'|'ALPHA_CORE_BONUS',number>;item:{id:string;industryIds:string[];multiplier:number;requirements:string[]}}>;
export interface OriginalGroundDefenseMarket {stability:EconomyMutable;groundDefenses:EconomyBonus}
export interface OriginalGroundDefenseDeficit {commodityId:string|null;deficit:number}
export interface OriginalGroundDefenseResult {scope:'ground-defense-stat-effects-only';industryId:string;operating:boolean;stabilityDeficit:OriginalGroundDefenseDeficit;defenseDeficit:OriginalGroundDefenseDeficit;descriptionDeficit:OriginalGroundDefenseDeficit|null;maxDemand:number;deficitMult:number;multiplier:number}
export function isSupportedOriginalGroundDefenseItem(industryId:string,itemId:unknown):boolean;
export function unapplyOriginalGroundDefenseEffects(market:OriginalGroundDefenseMarket,industry:OriginalIndustryCommodityEntry):void;
export function applyOriginalGroundDefenseBaseEffects(market:OriginalGroundDefenseMarket,industry:OriginalIndustryCommodityEntry):void;
export function applyOriginalGroundDefenseEffects(market:OriginalGroundDefenseMarket,industry:OriginalIndustryCommodityEntry,readAvailable:(commodityId:string)=>number):DeepReadonly<OriginalGroundDefenseResult>;
