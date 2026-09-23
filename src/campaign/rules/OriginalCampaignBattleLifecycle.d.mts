import type {OriginalCampaignBattle,OriginalBattleSide} from './OriginalCampaignBattle.mjs';
import type {OriginalBattleFrameServices} from './OriginalCampaignBattleFrame.mjs';
import type {OriginalConstructedCampaignFleet,OriginalFleetConstructionFaction} from './OriginalCampaignFleet.mjs';
import type {OriginalFleetRosterServices} from './OriginalFleetRoster.mjs';
import type {OriginalNativeFleetMember} from './OriginalFleetData.mjs';
import type {OriginalPayrollPerson} from './OriginalPlayerEconomy.mjs';
import type {OriginalMemberEffectPlugins} from './OriginalMemberEffects.mjs';
type Fleet=OriginalConstructedCampaignFleet;type AI=NonNullable<Fleet['campaign']['ai']>;
export interface OriginalBattleCombinedIdentity {scope:'native-battle-combined-identity';battle:OriginalCampaignBattle;side:'ONE'|'TWO'}
export interface OriginalBattleLifecycleServices extends OriginalBattleFrameServices {
 readBattleSectorGeneration?():boolean;readBattleDevMode?():boolean;
 battleCharacterDependencies?:Record<string,unknown>;battleMemberEffectPlugins?:OriginalMemberEffectPlugins;
 createBattleCombinedFleet?(faction:OriginalFleetConstructionFaction):Fleet;
 /** Must construct the real four-module AI; null and invented inert defaults are not accepted. */
 createBattleCombinedAI?(fleet:Fleet):AI;
 readBattleFleetRoster?(fleet:Fleet):OriginalFleetRosterServices;
 readBattleFleetCommander?(fleet:Fleet):OriginalPayrollPerson;
 setBattleFleetCommander?(fleet:Fleet,person:OriginalPayrollPerson):void;
 refreshBattleCommander?(person:OriginalPayrollPerson,refreshOutposts:false):void;
 readBattleMemberFlagship?(member:OriginalNativeFleetMember):boolean;isBattleMemberStation?(member:OriginalNativeFleetMember):boolean;
 isBattleAICurrentAssignment?(ai:AI,assignment:'STANDING_DOWN',owner:Fleet):boolean;
 addBattleAIAssignmentAtStart?(ai:AI,assignment:'STANDING_DOWN',target:Fleet,days:number,text:null,owner:Fleet):void;
 pickBattleAutoresolver?(battle:OriginalCampaignBattle):object|null;resolveBattleAutoresolver?(resolver:object):void;
 readBattleResolverContext?(resolver:object):object;
 pickBattleAIEncounterOption?(ai:AI|null,context:object,other:Fleet,owner:Fleet):string|null;
 readBattleResolverWinner?(context:object):Fleet|null;
 reportBattleOccurred?(winner:Fleet,battle:OriginalCampaignBattle):void;reportBattleFinished?(winner:Fleet,battle:OriginalCampaignBattle):void;
}
export function setOriginalBattleMemberCommander(member:OriginalNativeFleetMember,person:OriginalPayrollPerson|null):void;
export function generateOriginalBattleCombined(battle:OriginalCampaignBattle,services?:OriginalBattleLifecycleServices,withStations?:boolean,removeEmpty?:boolean):OriginalCampaignBattle;
export function uncombineOriginalBattle(battle:OriginalCampaignBattle,services?:OriginalBattleLifecycleServices):void;
export function leaveOriginalBattle(battle:OriginalCampaignBattle,fleet:Fleet,engaged:boolean,services?:OriginalBattleLifecycleServices):void;
export function finishOriginalBattle(battle:OriginalCampaignBattle,winner:OriginalBattleSide|null,engaged?:boolean,services?:OriginalBattleLifecycleServices):void;
export function resolveOriginalBattleRound(battle:OriginalCampaignBattle,services?:OriginalBattleLifecycleServices):void;
