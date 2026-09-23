import type {EconomyBonus,EconomyMutable} from './OriginalMarketEconomy.mjs';
import type {OriginalFleetStats} from './OriginalNativeFleetStats.mjs';
import type {OriginalNativeFleet,OriginalNativeFleetMember} from './OriginalFleetData.mjs';
export interface OriginalNativeCharacterStats extends Pick<OriginalFleetStats,'targets'|'dynamic'|'dynamicStats'|'dynamicRefs'|'tempMods'>, Partial<import('./OriginalCharacterExperience.mjs').OriginalCharacterExperience> {
 objectRef:string;nativeCharacterStatsVersion:1;lifecycle:'native-read-resolve-pending'|'resolving'|'current';skipRefresh:boolean;
 skills:{skillId:string;level:number}[];aptitudes:{aptitudeId:string;level:number;maxTier:number}[];fleetRef:string|null;fields:Record<string,string>;
 weaponOPCostMult:EconomyMutable;marineEffectivnessMult:EconomyMutable;officerNumber:EconomyMutable;adminNumber:EconomyMutable;outpostNumber:EconomyMutable;repairRateMult:EconomyMutable;commandPoints:EconomyMutable;
 smallWeaponOPCost:EconomyBonus;mediumWeaponOPCost:EconomyBonus;largeWeaponOPCost:EconomyBonus;shipOrdnancePointBonus:EconomyBonus;combatDeploymentCost:EconomyBonus;maxCapacitorsBonus:EconomyBonus;maxVentsBonus:EconomyBonus;travelSpeedBonus:EconomyBonus;
}
export interface OriginalCharacterWorld {isPlayer:boolean;fleet:OriginalNativeFleet|null}
export interface OriginalCharacterRefreshResult {skipped:boolean;unapplied?:number;applied?:string[]}
export interface OriginalCharacterServices {
 reportBeforeCharacterStatsRefresh(stats:OriginalNativeCharacterStats,world:OriginalCharacterWorld):void;
 reportAfterCharacterStatsRefresh(stats:OriginalNativeCharacterStats,world:OriginalCharacterWorld):void;
 refreshPlayerOutposts(stats:OriginalNativeCharacterStats,world:OriginalCharacterWorld):void;
 changeAllowedRecoveryTag(tag:string,add:boolean):void;
 readFleetMembers(fleet:OriginalNativeFleet):OriginalNativeFleetMember[];
 readMemberDeploymentPoints(member:OriginalNativeFleetMember,fleet:OriginalNativeFleet):number;
 effects?:Record<string,(target:OriginalNativeCharacterStats|OriginalFleetStats,id:string,level:number,remove:boolean,context:{character:OriginalNativeCharacterStats;world:OriginalCharacterWorld})=>void>;
}
export interface OriginalCharacterWorldCapture {
 scope:'native-character-refresh-world';unresolved:string[];topographyWorld?:import('./OriginalHyperspaceTopography.mjs').OriginalTopographyWorld;
 listeners:{objectRef:string;classAlias:string;kind:'not-character-refresh'|'hyperspace-topography'|'unsupported';event?:import('./OriginalHyperspaceTopography.mjs').OriginalTopographyEvent}[];
 recoveryTags:{memoryRef:string|null;key:'$core_recoveryTags';present:boolean;objectRef:string|null;values:string[];expires:number[]};
}
export function createOriginalCharacterStats(objectRef:string):OriginalNativeCharacterStats;
export function restoreOriginalCharacterStats(stats:OriginalNativeCharacterStats):OriginalNativeCharacterStats;
export function refreshOriginalCharacterStats(stats:OriginalNativeCharacterStats,world:OriginalCharacterWorld,services:OriginalCharacterServices,refreshOutposts?:boolean):OriginalCharacterRefreshResult;
export function readResolveOriginalCharacterStats(stats:OriginalNativeCharacterStats,world:OriginalCharacterWorld,services:OriginalCharacterServices):OriginalCharacterRefreshResult;
export function setOriginalCharacterSkillLevel(stats:OriginalNativeCharacterStats,id:string,level:number,world:OriginalCharacterWorld,services:OriginalCharacterServices):OriginalCharacterRefreshResult;
export function setOriginalCharacterAptitudeLevel(stats:OriginalNativeCharacterStats,id:string,level:number,world:OriginalCharacterWorld,services:OriginalCharacterServices):void;
export function originalNativeCommanderStats(fleet:OriginalNativeFleet):OriginalNativeCharacterStats;
export function validateOriginalCharacterStats(stats:OriginalNativeCharacterStats):OriginalNativeCharacterStats;
export function constructOriginalCharacterStats(objectRef:string):OriginalNativeCharacterStats & import('./OriginalCharacterExperience.mjs').OriginalCharacterExperience;

export function originalNativeCharacterDynamicValue(stats:OriginalNativeCharacterStats,key:string,base?:number):number;
export function originalNativeCharacterOutpostLimit(stats:OriginalNativeCharacterStats):number;
