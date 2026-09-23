import type {OriginalConstructedCampaignFleet} from './OriginalCampaignFleet.mjs';
import type {OriginalFleetFrameContext} from './OriginalCampaignFleetFrame.mjs';
import type {OriginalFleetLocationRegistry} from './OriginalFleetWorld.mjs';
/** World-space lower-left and extents, not browser pixels. Read-only camera service input. */
export interface OriginalCampaignViewport {llx:number;lly:number;visibleWidth:number;visibleHeight:number;everythingNearViewport:boolean;inset:OriginalCampaignViewport|null}
export interface OriginalFleetViewportServices {
 readFleetViewport?():OriginalCampaignViewport;
 readFleetRadius?(fleet:OriginalConstructedCampaignFleet):number;
 readFleetJumpDestination?(fleet:OriginalConstructedCampaignFleet):{position:[number,number];containingLocation:OriginalFleetLocationRegistry|null};
}
export function originalIsNearViewport(viewport:OriginalCampaignViewport,position:[number,number],radius:number):boolean;
export function originalFleetIsVisible(fleet:OriginalConstructedCampaignFleet,margin:number,context:Pick<OriginalFleetFrameContext,'currentLocation'>,services:OriginalFleetViewportServices):boolean;
export function originalFleetWillBeVisible(fleet:OriginalConstructedCampaignFleet,context:Pick<OriginalFleetFrameContext,'currentLocation'|'playerFleet'>,services:OriginalFleetViewportServices):boolean;
