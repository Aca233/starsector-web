import type {OriginalNativeFleet,OriginalNativeFleetMember} from './OriginalFleetData.mjs';
import type {OriginalNativeRepairServices,OriginalNativeMemberStatus} from './OriginalNativeRepair.mjs';
import type {OriginalStorageVariant} from './OriginalStorage.mjs';
import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
import type {OriginalMemberViewServices} from './OriginalCampaignFleetMemberView.mjs';
export interface OriginalBattleDamageHull {hitpoints:number;armorRating:number;shieldType:string|null;shieldFluxPerDamage:number}
export interface OriginalBattleMemberDamageServices extends OriginalNativeRepairServices,Pick<OriginalMemberViewServices,'readMemberViewHull'|'readMemberViewStockVariant'|'readMemberViewModuleVariant'> {
 globalRandom?:OriginalJavaRandomState;
 readBattleDamageHull?(variant:OriginalStorageVariant):OriginalBattleDamageHull;
 readBattleDamageGeometry?(variant:OriginalStorageVariant):{gridWidth:number;gridHeight:number};
 isBattleModuleActive?(variant:OriginalStorageVariant):boolean;
 readBattleVariantWeaponGroups?(variant:OriginalStorageVariant):unknown[];
 /** Missing historical state is not an inferred null. New status constructors explicitly set null. */
 readBattleStatusRandom?(member:OriginalNativeFleetMember,status:OriginalNativeMemberStatus):OriginalJavaRandomState|null;
}
export function originalBattleDamageHull(variant:OriginalStorageVariant,services?:OriginalBattleMemberDamageServices):OriginalBattleDamageHull;
export function originalBattleModuleActive(variant:OriginalStorageVariant,services?:OriginalBattleMemberDamageServices):boolean;
export function resetOriginalBattleDamageTaken(member:OriginalNativeFleetMember,services?:OriginalBattleMemberDamageServices):OriginalNativeMemberStatus;
export function applyOriginalBattleHullFractionDamage(member:OriginalNativeFleetMember,fleet:OriginalNativeFleet,fraction:number,index?:number,services?:OriginalBattleMemberDamageServices):OriginalNativeMemberStatus;
export function applyOriginalBattleMemberDamage(member:OriginalNativeFleetMember,fleet:OriginalNativeFleet,fraction:number,services?:OriginalBattleMemberDamageServices):OriginalNativeMemberStatus|undefined;
