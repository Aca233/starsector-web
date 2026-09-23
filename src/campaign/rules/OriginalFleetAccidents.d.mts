import type {OriginalFleetRosterBinding} from './OriginalFleetRoster.mjs';
import type {OriginalConstructedCampaignFleet} from './OriginalCampaignFleet.mjs';
import type {OriginalNativeFleetMember,OriginalFleetLifecycleServices} from './OriginalFleetData.mjs';
import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
export type OriginalAccidentBinding=OriginalFleetRosterBinding & {fleet:OriginalConstructedCampaignFleet};
export type OriginalAccidentLoss={kind:'ship';lossType:'DAMAGED'|'DESTROYED';member:OriginalNativeFleetMember;crLost:number;title:string;description:string}|{kind:'cargo';type:'RESOURCES'|'WEAPONS'|'FIGHTER_CHIP';itemId:string;quantity:number;title:string;description:string};
export interface OriginalAccidentReport {scope:'native-low-cr-accident-report';severity:'MAJOR';prefix:string;cause:string;advice:string;losses:OriginalAccidentLoss[]}
export function originalFleetAccidentSeverity(binding:OriginalAccidentBinding,services?:OriginalFleetLifecycleServices):'NONE'|'MAJOR';
export function addOriginalAccidentLoss(report:OriginalAccidentReport,loss:OriginalAccidentLoss):void;
export function generateOriginalFleetAccident(binding:OriginalAccidentBinding,globalRandom:OriginalJavaRandomState,services?:OriginalFleetLifecycleServices):OriginalAccidentReport|null;
export function advanceOriginalFleetAccidents(binding:OriginalAccidentBinding,days:number,globalRandom:OriginalJavaRandomState,services?:OriginalFleetLifecycleServices):{scope:'native-fleet-accident-phase';report:OriginalAccidentReport|null;showPlayerReport:boolean;readyForAuthority:false};
