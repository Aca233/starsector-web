import type {EconomyBonus,EconomyMutable} from './OriginalMarketEconomy.mjs';
export type OriginalFleetStatKey='accelerationMult'|'fuelUseHyperMult'|'fuelUseNormalMult'|'movementSpeedMod'|'fleetwideMaxBurnMod'|'sensorStrengthMod'|'sensorProfileMod'|'sensorRangeMod'|'detectedRangeMod';
export interface OriginalFleetStats {
 objectRef:string;fields:Record<OriginalFleetStatKey,string>;
 accelerationMult:EconomyMutable;fuelUseHyperMult:EconomyMutable;fuelUseNormalMult:EconomyMutable;
 movementSpeedMod:EconomyBonus;fleetwideMaxBurnMod:EconomyBonus;sensorStrengthMod:EconomyBonus;sensorProfileMod:EconomyBonus;sensorRangeMod:EconomyBonus;detectedRangeMod:EconomyBonus;
 dynamic:Record<string,EconomyBonus>;dynamicStats:Record<string,EconomyMutable>;dynamicRefs:{mods:Record<string,string>;stats:Record<string,string>};
 targets:{objectRef:string;kind:'mutable'|'bonus';value:EconomyMutable|EconomyBonus;temporary:{id:string;timeRemaining:number}[];descriptions?:Record<'flat'|'percent'|'mult',Record<string,string|null>>}[];
 tempMods:{objectRef?:string;source:string;timeRemaining:number;stat:EconomyBonus|null;statRef:string|null;mStat:EconomyMutable|null;mStatRef:string|null}[];
}
export const ORIGINAL_FLEET_STAT_DEFAULTS:Readonly<Record<OriginalFleetStatKey,number|null>>;
export function createOriginalFleetStats(objectRef:string):OriginalFleetStats;
export function restoreOriginalFleetStats(stats:OriginalFleetStats):OriginalFleetStats;
export function removeOriginalFleetTemporaryMod(stats:OriginalFleetStats,source:string):void;
export function addOriginalFleetTemporaryMod(stats:OriginalFleetStats,target:EconomyBonus|EconomyMutable,source:string,timeRemaining:number,channel:'flat'|'percent'|'mult',value:number,description?:string|null):void;
export function advanceOriginalFleetStats(stats:OriginalFleetStats,days:number):void;
export function originalNativeFleetDynamicStat(stats:OriginalFleetStats,key:string):EconomyMutable;

export function originalNativeFleetDynamicMod(stats:OriginalFleetStats,key:string):EconomyBonus;
export function restoreOriginalNativeStatTargets<T>(stats:T,defaults:Readonly<Record<string,number|null>>):T;
export function modifyOriginalNativeStatTarget(target:OriginalFleetStats['targets'][number],channel:'flat'|'percent'|'mult',id:string,value:number,options?:{remove?:boolean;always?:boolean;description?:string|null}):void;
