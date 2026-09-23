import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
import type {OriginalNativeFleet,OriginalNativeFleetMember} from './OriginalFleetData.mjs';
export interface OriginalNativeShipStatus {objectRef:string;hullFraction:number;armorCellFractions:number[][]|null;gridWidth:number;gridHeight:number;detached:boolean|null;permaDetached:boolean|null;moduleSlotId:string|null;inactive:boolean|null;hullDamageTaken?:number;armorDamageTaken?:number}
export interface OriginalNativeMemberStatus {objectRef:string;random?:OriginalJavaRandomState|null;hullFractions:number[];modules:OriginalNativeShipStatus[]}
export interface OriginalNativeCREvent {objectRef?:string;crAmount:number;text:string|null;elapsed:number;id:string|null}
export interface OriginalNativeRepairTracker {objectRef:string;mothballed:boolean;cr:number;crOverride:number|null;recoveryRate:number;decreaseRate:number;crPriorToMothballing:number;suspendRepairs:boolean;losingCR:boolean;crashMothballed:boolean;recentEvents:OriginalNativeCREvent[];noSuppliesCRLoss:OriginalNativeCREvent[]}
export interface OriginalNativeRepairServices {
 createMemberStatus?(member:OriginalNativeFleetMember):OriginalNativeMemberStatus;
 readCommanderRepairRateMult?(commanderRef:string,fleet:OriginalNativeFleet):number;
 isModuleActive?(member:OriginalNativeFleetMember,moduleSlotId:string):boolean;
 reportRepairsComplete?(member:OriginalNativeFleetMember,fleet:OriginalNativeFleet):void;
}
export function originalNativeMemberStatus(member:OriginalNativeFleetMember,services?:OriginalNativeRepairServices):OriginalNativeMemberStatus;
export function originalNativeMemberHullFraction(member:OriginalNativeFleetMember,services?:OriginalNativeRepairServices):number;
export function originalNativeMemberNeedsRepairs(member:OriginalNativeFleetMember,services?:OriginalNativeRepairServices):boolean;
export function originalNativeMemberMaxCR(member:OriginalNativeFleetMember,fleet:OriginalNativeFleet):number;
export function originalNativeMemberRepairRate(member:OriginalNativeFleetMember,fleet:OriginalNativeFleet,services?:OriginalNativeRepairServices):number;
export function advanceOriginalNativeMemberRepairs(member:OriginalNativeFleetMember,fleet:OriginalNativeFleet,days:number,hasSupplies:boolean,services?:OriginalNativeRepairServices):void;

export function applyOriginalNativeCREvent(member:OriginalNativeFleetMember,amount:number,text:string|null):void;

export function setOriginalNativeMemberMothballed(member:OriginalNativeFleetMember,fleet:OriginalNativeFleet|null,value:boolean,plugins?:import('./OriginalMemberEffects.mjs').OriginalMemberEffectPlugins):void;
