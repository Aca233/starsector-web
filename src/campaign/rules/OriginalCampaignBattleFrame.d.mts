import type {OriginalCampaignBattle,OriginalCampaignBattleServices,OriginalBattleSide} from './OriginalCampaignBattle.mjs';
import type {OriginalConstructedCampaignFleet} from './OriginalCampaignFleet.mjs';
import type {OriginalFleetLocationRegistry} from './OriginalFleetWorld.mjs';
type Fleet=OriginalConstructedCampaignFleet;
export interface OriginalBattleFrameContext {fastAdvance:boolean;currentLocation:OriginalFleetLocationRegistry|null}
export interface OriginalBattleFrameServices extends OriginalCampaignBattleServices {
 readBattleFleetRadius?(fleet:Fleet):number;
 readBattleVisibilitySettings?():{battleDetectabilityMult:number;battleDetectabilityFlat:number};
 convertBattleSecondsToDays?(seconds:number):number;
 /** These are actual unfinished Battle/plugin boundaries, NOT optional empty effects. */
 finishBattle?(battle:OriginalCampaignBattle,winner:OriginalBattleSide,engaged:boolean):void;
 resolveBattleRound?(battle:OriginalCampaignBattle):void;
 isBattlePositionNearViewport?(position:[number,number],radius:1000):boolean;
 /** Must enqueue the real native delayed animation; a recording callback only verifies dispatch. */
 scheduleBattleFlashAnimation?(battle:OriginalCampaignBattle,duration:number):void;
}
export function originalBattleFleetIsValid(fleet:Fleet,services?:OriginalBattleFrameServices):boolean;
export function removeOriginalBattleEmptyFleets(battle:OriginalCampaignBattle,services?:OriginalBattleFrameServices):void;
export function applyOriginalBattleVisibility(fleet:Fleet,services?:OriginalBattleFrameServices):void;
export function originalBattleMovementData(fleet:Fleet,battle:OriginalCampaignBattle,services?:OriginalBattleFrameServices):[number,number,number];
export function scheduleOriginalBattleFlashes(battle:OriginalCampaignBattle,context:OriginalBattleFrameContext,services?:OriginalBattleFrameServices):void;
export function advanceOriginalCampaignBattle(battle:OriginalCampaignBattle,seconds:number,context:OriginalBattleFrameContext,services?:OriginalBattleFrameServices):void;
