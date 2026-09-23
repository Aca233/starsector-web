import type {OriginalNativeCampaignMemberView,OriginalMemberViewServices} from './OriginalCampaignFleetMemberView.mjs';
import type {OriginalFleetDrawFrame,FleetDrawVec,FleetDrawRGBA} from './OriginalFleetDraw.mjs';
export interface OriginalMemberRenderServices extends OriginalMemberViewServices {
 readMemberViewLightSource?(fleet:OriginalNativeCampaignMemberView['fleet']):object|null;
 memberViewLightHasTag?(source:object,tag:string):boolean;
 renderMemberViewModules?(view:OriginalNativeCampaignMemberView,frame:OriginalFleetDrawFrame,position:FleetDrawVec):void;
 renderMemberViewDecorativeWeapons?(view:OriginalNativeCampaignMemberView,slots:[string,string][],frame:OriginalFleetDrawFrame,position:FleetDrawVec,alpha:number):void;
 readMemberViewJitterOffsets?(jitter:object,maxRange:number,copies:number):FleetDrawVec[];
}
export function renderOriginalCampaignFleetMemberView(view:OriginalNativeCampaignMemberView,lightAngle:number,lightColor:FleetDrawRGBA|null,alpha:number,lightMultiplier:number,services?:OriginalMemberRenderServices,frame?:OriginalFleetDrawFrame):OriginalFleetDrawFrame;
export function renderOriginalCampaignEngineGlow(view:OriginalNativeCampaignMemberView,frame:OriginalFleetDrawFrame,position:FleetDrawVec,alpha:number):void;
