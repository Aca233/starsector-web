import type {EconomyMutable} from './OriginalMarketEconomy.mjs';
import type {OriginalFleetMemberStats,OriginalNativeFleetMember,OriginalNativeFleet} from './OriginalFleetData.mjs';
import type {OriginalStoredMember} from './OriginalStorage.mjs';
export interface OriginalMemberCrewContext {playerCommander:boolean}
export function createOriginalFleetMemberStats(member:OriginalStoredMember):OriginalFleetMemberStats;
export interface OriginalVariantShipStats extends OriginalFleetMemberStats {scope:'native-variant-ship-stats';variant:import('./OriginalStorage.mjs').OriginalStorageVariant;entity:null;fleetMember:null;listenerManager:object|null}
export function createOriginalVariantShipStats(variant:import('./OriginalStorage.mjs').OriginalStorageVariant):OriginalVariantShipStats;
export function modifyOriginalMemberStat(stats:OriginalFleetMemberStats,key:string,channel:'flat'|'percent'|'mult',id:string,value:number):void;
export function unmodifyOriginalMemberStat(stats:OriginalFleetMemberStats,key:string,id:string,channel?:'flat'|'percent'|'mult'|null):void;
export function originalMemberDynamicStat(stats:OriginalFleetMemberStats,key:string):EconomyMutable;
export function removeOriginalUnmodifiedMemberDynamics(stats:OriginalFleetMemberStats):void;
export function originalMemberCrewFraction(member:OriginalNativeFleetMember,fleet:OriginalNativeFleet|null,context?:OriginalMemberCrewContext):number;
export function originalMemberCurrentCR(member:OriginalNativeFleetMember,fleet:OriginalNativeFleet|null,context?:OriginalMemberCrewContext):number;
export function originalMemberCRThresholds(stats:OriginalFleetMemberStats):{malfunction:number;critical:number;shield:number;degrade:number;improve:number};
export function applyOriginalMemberCR(stats:OriginalFleetMemberStats,cr:number,hullSize:string):void;
export function updateOriginalMemberCrewAndCRStats(member:OriginalNativeFleetMember,fleet:OriginalNativeFleet|null,context?:OriginalMemberCrewContext):void;
export function updateOriginalMemberRepairRates(member:OriginalNativeFleetMember):void;
