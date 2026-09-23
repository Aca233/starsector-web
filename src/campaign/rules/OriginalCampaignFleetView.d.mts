import type {OriginalFleetDrawFrame} from './OriginalFleetDraw.mjs';
import type {OriginalMemberRenderServices} from './OriginalCampaignFleetMemberRender.mjs';
import type {OriginalMemberViewServices as importMemberServices} from './OriginalCampaignFleetMemberView.mjs';
import type {OriginalConstructedCampaignFleet} from './OriginalCampaignFleet.mjs';
import type {OriginalNativeFleetMember} from './OriginalFleetData.mjs';
import type {OriginalFader} from './OriginalFader.mjs';
import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
import type {OriginalFleetFrameContext} from './OriginalCampaignFleetFrame.mjs';
import type {OriginalCampaignContrails,renderOriginalCampaignContrails} from './OriginalCampaignContrails.mjs';
/** Shared member-view lifecycle fields, NOT a substitute for the real sprite/engine/movement state. */
export interface OriginalFleetMemberView {fleet:OriginalConstructedCampaignFleet;member:OriginalNativeFleetMember;fader:OriginalFader;shipSizeOrdinal:number;originLoc:[number,number];originFacing:number;useLight:boolean;[key:string]:unknown}
export interface OriginalFleetView {objectRef:string;fleetRef:string;lightSource:object|null;lightColor:[number,number,number,number]|null;contrails:OriginalCampaignContrails|null;shipViews:{delegateRef:string;views:{item:OriginalNativeFleetMember;view:OriginalFleetMemberView}[];sortedViews:OriginalFleetMemberView[];orphaned:OriginalNativeFleetMember[];notified:OriginalFleetMemberView[];comparator:'native-render-order-int-subtraction'}}
export interface OriginalFleetViewServices extends importMemberServices,OriginalMemberRenderServices {
 readSortedFleetViewMembers?(fleet:OriginalConstructedCampaignFleet):OriginalNativeFleetMember[];
 createFleetMemberView?(fleet:OriginalConstructedCampaignFleet,member:OriginalNativeFleetMember,context:OriginalFleetFrameContext,random:OriginalJavaRandomState):OriginalFleetMemberView;
 advanceFleetMemberView?(view:OriginalFleetMemberView,seconds:number,parent:OriginalFleetView,context:OriginalFleetFrameContext,random:OriginalJavaRandomState):void;
 readFleetViewLightPosition?(source:object):[number,number];
 renderFleetMemberView?(view:OriginalFleetMemberView,lightAngle:number,color:[number,number,number,number]|null,alpha:number,lightMultiplier:number,frame:OriginalFleetDrawFrame):void;
}
export function createOriginalFleetView(fleetRef:string):OriginalFleetView;
export function originalFleetSortedMembers(fleet:OriginalConstructedCampaignFleet,services?:object):OriginalNativeFleetMember[];
export function originalFleetViewForMember(fleet:OriginalConstructedCampaignFleet,member:OriginalNativeFleetMember,viewOverride?:OriginalFleetView):OriginalFleetMemberView|null;
export function originalFleetMemberViews(fleet:OriginalConstructedCampaignFleet,viewOverride?:OriginalFleetView):OriginalFleetMemberView[];
export function originalFleetViewContrails(fleet:OriginalConstructedCampaignFleet,viewOverride?:OriginalFleetView):OriginalCampaignContrails;
export function clearOriginalFleetView(fleet:OriginalConstructedCampaignFleet,viewOverride?:OriginalFleetView):void;
export function advanceOriginalFleetView(fleet:OriginalConstructedCampaignFleet,seconds:number,context:OriginalFleetFrameContext,random:OriginalJavaRandomState,services?:OriginalFleetViewServices,viewOverride?:OriginalFleetView):{selectedMembers:OriginalNativeFleetMember[];visibleViews:number};
export function renderOriginalFleetView(fleet:OriginalConstructedCampaignFleet,alpha:number,services?:OriginalFleetViewServices,viewOverride?:OriginalFleetView):OriginalFleetDrawFrame;
export function renderOriginalFleetViewContrails(fleet:OriginalConstructedCampaignFleet,alpha?:number,viewOverride?:OriginalFleetView):ReturnType<typeof renderOriginalCampaignContrails>;
export function renderOriginalFleetGraphics(fleet:OriginalConstructedCampaignFleet,alpha:number,services?:OriginalFleetViewServices,viewOverride?:OriginalFleetView):OriginalFleetDrawFrame;
export function validateOriginalFleetView(fleet:OriginalConstructedCampaignFleet,viewOverride?:OriginalFleetView):OriginalFleetView;
