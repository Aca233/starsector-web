import type {OriginalNativeFleetMember,OriginalNativeFleet} from './OriginalFleetData.mjs';
export interface OriginalMemberBuff {objectRef?:string;className:string;id:string|null;dur?:number;mult?:number;delta?:number;frames?:number}
export interface OriginalMemberBuffManager {objectRef:string;memberRef:string;buffs:OriginalMemberBuff[]}
export type OriginalMemberBuffPlugins=Record<string,{advance(buff:OriginalMemberBuff,days:number):void;expired(buff:OriginalMemberBuff):boolean;apply(buff:OriginalMemberBuff,member:OriginalNativeFleetMember,fleet:OriginalNativeFleet):void}>;
export function addOriginalMemberBuff(member:OriginalNativeFleetMember,buff:OriginalMemberBuff):void;
export function addOriginalMemberBuffOnlyUpdateStat(member:OriginalNativeFleetMember,buff:OriginalMemberBuff,fleet:OriginalNativeFleet,plugins?:OriginalMemberBuffPlugins):void;
export function removeOriginalMemberBuff(member:OriginalNativeFleetMember,id:string|null):void;
export function getOriginalMemberBuff(member:OriginalNativeFleetMember,id:string|null):OriginalMemberBuff|null;
export function advanceOriginalMemberBuffs(member:OriginalNativeFleetMember,days:number,plugins?:OriginalMemberBuffPlugins):void;
export function applyOriginalMemberBuffs(member:OriginalNativeFleetMember,fleet:OriginalNativeFleet,plugins?:OriginalMemberBuffPlugins):void;
