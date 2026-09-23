import type {OriginalConstructedCampaignFleet} from './OriginalCampaignFleet.mjs';
import type {OriginalFleetRosterBinding} from './OriginalFleetRoster.mjs';
import type {OriginalNativeFleet,OriginalNativeFleetMember,OriginalFleetLifecycleServices} from './OriginalFleetData.mjs';
import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
import type {OriginalFleetMotionContext} from './OriginalCampaignFleetMotion.mjs';
import type {advanceOriginalFleetAccidents} from './OriginalFleetAccidents.mjs';
export type OriginalFleetPresentationEffect=
 |{kind:'campaign-message';text:string;colorRole:'enemy'}
 |{kind:'accident-report';report:NonNullable<ReturnType<typeof advanceOriginalFleetAccidents>['report']>;showPlayerReport:boolean}
 |{kind:'repairs-complete';member:OriginalNativeFleetMember;mergeExtraPrefix:'repairs_finished';initialExtra:'repairs_finished:1';initialText:string;mergedTextPrefix:'修理完毕 (共 ';mergedTextSuffix:' 艘舰船) ';colorRole:'base-player';icon:{category:'intel';key:'repairs_finished'};clickAction:'REFIT_TAB'};
export function setOriginalFleetNoEngaging(fleet:OriginalConstructedCampaignFleet,seconds:number):void;
export function updateOriginalFleetOvercapacitySpeed(fleet:OriginalConstructedCampaignFleet,services?:OriginalFleetLifecycleServices):void;
export function advanceOriginalFleetAfterBase(binding:OriginalFleetRosterBinding,seconds:number,days:number,globalRandom:OriginalJavaRandomState,context:OriginalFleetMotionContext&{playerFleet:OriginalNativeFleet|null},services?:OriginalFleetLifecycleServices):{scope:'native-fleet-after-base-through-member-effects';effects:OriginalFleetPresentationEffect[];accidents:ReturnType<typeof advanceOriginalFleetAccidents>|null;logistics:{hasSupplies:boolean;supplyCost:number;fuelCost:number};removedMembers:OriginalNativeFleetMember[];needsRepairs:boolean;motion:ReturnType<typeof import('./OriginalCampaignFleetMotion.mjs').advanceOriginalConstructedFleetMotion>;memberEffects:{membersAdvanced:number};readyForAuthority:false};
export function advanceOriginalFleetMemberCampaignEffects(fleet:OriginalNativeFleet,seconds:number,days:number,services?:OriginalFleetLifecycleServices):{membersAdvanced:number};
