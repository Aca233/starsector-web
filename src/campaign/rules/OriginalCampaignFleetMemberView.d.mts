import type {OriginalViewHull,OriginalViewWeapon} from './OriginalMemberViewResources.mjs';
import type {OriginalStorageVariant} from './OriginalStorage.mjs';
import type {OriginalConstructedCampaignFleet} from './OriginalCampaignFleet.mjs';
import type {OriginalNativeFleetMember} from './OriginalFleetData.mjs';
import type {OriginalFleetMemberView,OriginalFleetView} from './OriginalCampaignFleetView.mjs';
import type {OriginalFleetFrameContext} from './OriginalCampaignFleetFrame.mjs';
import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
import type {OriginalSmoothMovement,OriginalSmoothFacing} from './OriginalMovement.mjs';
import type {OriginalFader} from './OriginalFader.mjs';
import type {OriginalViewShifter,ViewRGBA} from './OriginalFleetViewShifters.mjs';
export interface OriginalMemberViewTexture {path:string;width:number;height:number;texWidth:number;texHeight:number;sha256:string}
export interface OriginalMemberViewSprite {texX?:number;texY?:number;texWidth?:number;texHeight?:number;texture:OriginalMemberViewTexture;width:number;height:number;centerX:number;centerY:number;angle:number;color:ViewRGBA;alphaMult:number;blendSrc:number;blendDest:number}
export interface OriginalMemberViewServices {
 /** Observer uses the published authority value, never triggers its own fleet synchronization. */
 readFleetViewTravelSpeed?(fleet:OriginalConstructedCampaignFleet):number;
 readMemberViewTexture?(path:string):OriginalMemberViewTexture;
 readMemberViewHull?(id:string):OriginalViewHull;
 readMemberViewWeapon?(id:string):OriginalViewWeapon;
 readMemberViewStockVariant?(id:string):OriginalStorageVariant;
 readMemberViewModuleVariant?(member:OriginalNativeFleetMember,slotId:string):OriginalStorageVariant;
 readMemberViewModules?(member:OriginalNativeFleetMember,scale:number,createIcons?:boolean):{icons:object[];size:{width:number;height:number}};
 readMemberViewFleet?(member:OriginalNativeFleetMember):OriginalConstructedCampaignFleet|null;
 readVisibilityToPlayer?(fleet:OriginalConstructedCampaignFleet):'NONE'|'SENSOR_CONTACT'|'COMPOSITION_DETAILS'|'COMPOSITION_AND_FACTION_DETAILS';
 convertMemberViewSecondsToDays?(seconds:number):number;
 /** Explicit host seed, not reconstructed JVM nanoTime. */
 newMemberViewJitterSeed?():string;
 updateMemberViewJitterSeed?(jitter:object):void;
}
export interface OriginalNativeCampaignMemberView extends OriginalFleetMemberView {
 scope:'native-campaign-fleet-member-view';scaleMult:number;moveSpeed:number;maxTurnRate:number;desiredOffset:[number,number];prevAngle:number;offsetOverridden:boolean;zero:[number,number];facing:number;windOffset:number;extraAlphaMult:number;
 sprite:OriginalMemberViewSprite;shadowMask:OriginalMemberViewSprite;windEffect:OriginalMemberViewSprite;moduleIcons:object[];
 movementModule:OriginalSmoothMovement;facingModule:OriginalSmoothFacing;formation:{type:'DIAMOND'|'BOX'|'V'|'CLAW'}|null;fighterMovement:(OriginalSmoothMovement|null)[]|null;desiredFighterOffsets:([number,number]|null)[]|null;
 jitterFader:OriginalFader|null;jr:object|null;jitterColor:ViewRGBA;jitterCopies:number;maxJitterRange:number;
 engineGlow:{member:OriginalNativeFleetMember;scaleMult:number;lengthMult:import('./OriginalMarketEconomy.mjs').EconomyMutable;slots:OriginalViewEngineSlot[];clusters:OriginalViewEngineSlot[];accelFader:OriginalFader;fullFader:OriginalFader;color:ViewRGBA;contrailColor:ViewRGBA;texture:OriginalMemberViewTexture;hitGlow:OriginalMemberViewSprite};
 engineColor:OriginalViewShifter<ViewRGBA>;engineGlowColor:OriginalViewShifter<ViewRGBA>;contrailColor:OriginalViewShifter<ViewRGBA>;glowColor:OriginalViewShifter<ViewRGBA>;windEffectColor:OriginalViewShifter<ViewRGBA>;
 engineWidthMult:OriginalViewShifter<number>;engineHeightMult:OriginalViewShifter<number>;engineGlowSizeMult:OriginalViewShifter<number>;contrailWidthMult:OriginalViewShifter<number>;contrailDurMult:OriginalViewShifter<number>;windEffectDirX:OriginalViewShifter<number>;windEffectDirY:OriginalViewShifter<number>;
}
export interface OriginalViewEngineSlot {angle:number;baseLength:number;glowSize:number;width:number;weight:number;offset:[number,number]}
export {ORIGINAL_FLEET_VIEW_INPUTS} from './OriginalMemberViewResources.mjs';
export function createOriginalCampaignFleetMemberView(fleet:OriginalConstructedCampaignFleet,member:OriginalNativeFleetMember,context:OriginalFleetFrameContext,random:OriginalJavaRandomState,services?:OriginalMemberViewServices):OriginalNativeCampaignMemberView;
export function advanceOriginalCampaignFleetMemberView(view:OriginalNativeCampaignMemberView,seconds:number,parent:OriginalFleetView|null,context:OriginalFleetFrameContext,random:OriginalJavaRandomState,services?:OriginalMemberViewServices):void;
export function regenerateOriginalMemberViewOffset(view:OriginalNativeCampaignMemberView,random:OriginalJavaRandomState):void;
export function overrideOriginalMemberViewOffset(view:OriginalNativeCampaignMemberView,x:number,y:number):void;
export function originalMemberViewAbsoluteLocation(view:OriginalNativeCampaignMemberView):[number,number];
export function originalMemberViewAbsoluteVelocity(view:OriginalNativeCampaignMemberView):[number,number];
export function validateOriginalCampaignFleetMemberView<T extends OriginalNativeCampaignMemberView>(view:T):T;

export function setOriginalMemberViewJitter(view:OriginalNativeCampaignMemberView,durationIn:number,durationOut:number,color:ViewRGBA,copies:number,maxRange:number,services?:OriginalMemberViewServices):void;
export function endOriginalMemberViewJitter(view:OriginalNativeCampaignMemberView):void;
export function setOriginalMemberViewJitterDirection(view:OriginalNativeCampaignMemberView,direction:[number,number]|null):void;
export function setOriginalMemberViewJitterLength(view:OriginalNativeCampaignMemberView,length:number):void;
export function setOriginalMemberViewCircularJitter(view:OriginalNativeCampaignMemberView,circular:boolean):void;
export function setOriginalMemberViewJitterBrightness(view:OriginalNativeCampaignMemberView,brightness:number):void;
