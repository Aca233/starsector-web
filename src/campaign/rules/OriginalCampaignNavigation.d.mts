import type {OriginalConstructedCampaignFleet,OriginalBaseCampaignEntity} from './OriginalCampaignFleet.mjs';
import type {OriginalWorldEntity} from './OriginalFleetWorld.mjs';
import type {OriginalVisibilityLevel} from './OriginalSensors.mjs';
export interface OriginalNavigationEntityInfo {entity:OriginalBaseCampaignEntity;radius:number;isFleet:boolean;hidden:boolean;showInCampaign:boolean;abyssalAlpha:number|null}
export interface OriginalNavigationServices {readNavigationEntity?(entity:object):OriginalNavigationEntityInfo;isNavigationEntityVisible?(entity:OriginalWorldEntity,observer:OriginalConstructedCampaignFleet):boolean;readNavigationVisibility?(entity:OriginalWorldEntity,observer:OriginalConstructedCampaignFleet):OriginalVisibilityLevel;readDaysSinceLastPlayerBattle?(fleet:OriginalConstructedCampaignFleet):number;resolveNavigationTarget?(ref:string):OriginalWorldEntity|null}
export interface OriginalFollowTargetResult {scope:'native-player-follow-target';followingDirectCommand:true;followMouse:false;effects:{kind:'target-indicator-pulse';entity:OriginalWorldEntity}[]}
export function originalNavigationEntity(entity:OriginalWorldEntity,services?:OriginalNavigationServices):OriginalNavigationEntityInfo;
export function findOriginalNavigationTarget(observer:OriginalConstructedCampaignFleet,point:[number,number],services?:OriginalNavigationServices,padding?:number):OriginalWorldEntity|null;
export function setOriginalPlayerMovementDestination(fleet:OriginalConstructedCampaignFleet,x:number,y:number):void;
export function followOriginalNavigationTarget(fleet:OriginalConstructedCampaignFleet,target:OriginalWorldEntity,services?:OriginalNavigationServices):OriginalFollowTargetResult;
export function advanceOriginalPlayerTargetNavigation(fleet:OriginalConstructedCampaignFleet,context:{paused:boolean},services?:OriginalNavigationServices):boolean;
