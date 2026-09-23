import type {OriginalNativeFleet,OriginalNativeFleetMember} from './OriginalFleetData.mjs';
import type {OriginalNativeRepairServices} from './OriginalNativeRepair.mjs';
export interface OriginalNativeInflater {objectRef:string;className:string;parameters:{objectRef:string;quality:number;averageSMods:number|null}|null}
export interface OriginalNativeStrengthSource {objectRef:string;inflated:boolean;inflater:OriginalNativeInflater|null}
export interface OriginalNativeBattleStrength {objectRef:string;memberSource:{memberRef:string;fleet:OriginalNativeStrengthSource}[]}
export interface OriginalNativeStrengthServices extends OriginalNativeRepairServices {readVariantOPCost?(member:OriginalNativeFleetMember):number;readInflaterStrength?(inflater:OriginalNativeInflater,source:OriginalNativeStrengthSource):{quality:number;sMods:number}}
export function originalNativeVariantOPCost(member:OriginalNativeFleetMember):number;
export function originalNativeMemberIsCivilian(member:OriginalNativeFleetMember):boolean;
export function originalNativeBaseMemberStrength(member:OriginalNativeFleetMember,fleet:OriginalNativeFleet,services?:OriginalNativeStrengthServices):number;
export function originalNativeMemberStrength(member:OriginalNativeFleetMember,fleet:OriginalNativeFleet,withHull?:boolean,withQuality?:boolean,withCaptain?:boolean,services?:OriginalNativeStrengthServices):number;
