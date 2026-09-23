import type {OriginalPayrollPerson} from './OriginalPlayerEconomy.mjs';
import type {OriginalNativeCharacterStats} from './OriginalNativeCharacterStats.mjs';
import type {OriginalCampaignMemoryServices} from './OriginalCampaignMemory.mjs';
export interface OriginalCharacterExperience {nativeExperienceVersion:1;xp:string;bonusXp:string;deferredBonusXp:string;xpAtLastStoryPointGain:string;level:number;points:number;storyPoints:number;bonusXPGainReason:string|null;onlyAddBonusXPDoNotSpendStoryPoints:boolean}
export interface OriginalOfficerExperience {objectRef:string;person:OriginalPayrollPerson;skillPicks?:string[];madePicks?:boolean}
export interface OriginalCharacterLevelupPlugin {getMaxLevel():number;getPointsAtLevel(level:number):number;getStoryPointsPerLevel():number;getBonusXPUseMultAtMaxLevel():number;getXPForLevel(level:number):bigint}
export interface OriginalExperienceServices {
 readExperienceSetting?(key:string):number;readExperiencePlayerStats?():object;readCharacterLevelupPlugin?():OriginalCharacterLevelupPlugin;
 reportExperienceEvent?(event:{kind:string;stats:OriginalCharacterExperience;panel:object|null;[key:string]:unknown}):void;
 appendExperiencePlaythroughLog?(text:string):void;setExperienceCharacterTabOpened?(value:boolean):void;
 readOfficerXPForLevel?(level:number):string;readOfficerMaxLevel?(person:OriginalPayrollPerson):number;
 readOfficerFleetCommanderStats?(person:OriginalPayrollPerson):OriginalNativeCharacterStats|null;
 readExperiencePlayerOfficers?():OriginalOfficerExperience[]|null;pickOfficerLevelupSkills?(person:OriginalPayrollPerson,random:null):string[];
 memoryServices?:OriginalCampaignMemoryServices;
}
export function originalExperienceLong(value:string):bigint;
export function originalExperienceFloatToLong(value:number):bigint;
export function initializeOriginalCharacterExperience<T extends object>(stats:T):T&OriginalCharacterExperience;
export function validateOriginalCharacterExperience(stats:object):OriginalCharacterExperience;
export function originalExperienceSetting(key:string,services?:OriginalExperienceServices):number;
export function originalCharacterLevelupPlugin(services?:OriginalExperienceServices):OriginalCharacterLevelupPlugin;
export function originalCharacterStoryThreshold(stats:OriginalCharacterExperience,previous:bigint,services?:OriginalExperienceServices):bigint;
export function originalCharacterBonusForStoryPoint(stats:OriginalCharacterExperience,services?:OriginalExperienceServices):bigint;
export function spendOriginalCharacterStoryPoints(stats:object,points:number,bonusFraction:number,panel?:object|null,services?:OriginalExperienceServices,options?:{sendMessage?:boolean;asMessage?:boolean;logText?:string|null}):void;
export function levelUpOriginalCharacterIfNeeded(stats:object,panel?:object|null,services?:OriginalExperienceServices):void;
export function addOriginalCharacterXP(stats:object,amount:string,panel?:object|null,services?:OriginalExperienceServices,options?:{sendMessage?:boolean;useBonus?:boolean;levelUp?:boolean}):void;
export function originalOfficerXPForLevel(level:number,services?:OriginalExperienceServices):bigint;
export function originalOfficerMaxLevel(person:OriginalPayrollPerson,services?:OriginalExperienceServices):number;
export function originalOfficerCanLevelUp(officer:OriginalOfficerExperience,services?:OriginalExperienceServices):boolean;
export function addOriginalOfficerXP(officer:OriginalOfficerExperience,amount:string,panel?:object|null,services?:OriginalExperienceServices,applyMax?:boolean):void;
