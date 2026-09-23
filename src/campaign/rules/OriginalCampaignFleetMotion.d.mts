import type {OriginalConstructedCampaignFleet} from './OriginalCampaignFleet.mjs';
import type {OriginalFleetLifecycleServices} from './OriginalFleetData.mjs';
export interface OriginalFleetMotionContext {isFastForwardIteration:boolean}
export function setOriginalConstructedFleetDestination(fleet:OriginalConstructedCampaignFleet,x:number,y:number,override?:boolean):void;
export function getOriginalConstructedFleetDestination(fleet:OriginalConstructedCampaignFleet):[number,number];
export function setOriginalConstructedFleetDesiredFacing(fleet:OriginalConstructedCampaignFleet,angle:number):void;
export function requestOriginalConstructedFleetGoSlow(fleet:OriginalConstructedCampaignFleet,stop?:boolean):void;
export function originalConstructedFleetGoSlowBurn(fleet:OriginalConstructedCampaignFleet,services?:OriginalFleetLifecycleServices):number;
export function applyOriginalConstructedFleetGoSlow(fleet:OriginalConstructedCampaignFleet,seconds:number,context:OriginalFleetMotionContext,services?:OriginalFleetLifecycleServices):void;
export function advanceOriginalConstructedFleetMotion(fleet:OriginalConstructedCampaignFleet,seconds:number,context:OriginalFleetMotionContext,services?:OriginalFleetLifecycleServices):{scope:'native-fleet-counts-and-motion-phase';moved:boolean;readyForAuthority:false};
