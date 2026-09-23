import type {OriginalNativeFleetMember,OriginalFleetLifecycleServices} from './OriginalFleetData.mjs';
import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
import type {OriginalNativeMemberStatus} from './OriginalNativeRepair.mjs';
export interface OriginalAutoresolveDamage {memberRef:string;maxHits:number;shields:number;hits:number}
export function applyOriginalNativeAutoresolveDamage(member:OriginalNativeFleetMember,data:OriginalAutoresolveDamage,globalRandom:OriginalJavaRandomState,services?:OriginalFleetLifecycleServices):OriginalNativeMemberStatus;
