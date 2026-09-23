import type {OriginalNativeFleet,OriginalNativeFleetMember,OriginalFleetLifecycleServices} from './OriginalFleetData.mjs';
import type {OriginalMemberBuff} from './OriginalMemberBuffs.mjs';
export interface OriginalTowCableBuff extends OriginalMemberBuff {objectRef:string;className:'com.fs.starfarer.api.impl.campaign.TowCable$TowCableBuff';id:string;frames:number}
export interface OriginalTowCablePersistentEntry {scope:'native-sector-tow-cable-entry';key:'TowCable_PersistentBuffs';entries:{member:OriginalNativeFleetMember;buff:OriginalTowCableBuff}[]|null}
export function createOriginalTowCablePersistentEntry():OriginalTowCablePersistentEntry;
export function validateOriginalTowCablePersistentEntry(state:OriginalTowCablePersistentEntry,knownMembers?:OriginalNativeFleetMember[]):OriginalTowCablePersistentEntry;
export function originalMemberCanDeployForCombat(member:OriginalNativeFleetMember,fleet:OriginalNativeFleet):boolean;
export function originalMaxBurnWithoutTowCables(member:OriginalNativeFleetMember,fleet:OriginalNativeFleet):number;
export function advanceOriginalTowCable(member:OriginalNativeFleetMember,seconds:number,fleet:OriginalNativeFleet,state:OriginalTowCablePersistentEntry|null|undefined,services?:OriginalFleetLifecycleServices):void;
