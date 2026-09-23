import type {OriginalLocationBackground} from './OriginalLocationFrame.mjs';
import type {OriginalViewShifter,ViewRGBA} from './OriginalFleetViewShifters.mjs';
import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
import type {OriginalMemberViewTexture} from './OriginalCampaignFleetMemberView.mjs';
import type {OriginalFleetDrawFrame} from './OriginalFleetDraw.mjs';
export interface OriginalNormalSpaceBackground extends OriginalLocationBackground {warpingRenderer:null;colorShifter:OriginalViewShifter<ViewRGBA>;particleColorShifter:OriginalViewShifter<ViewRGBA>;visual:{scope:'native-normal-space-background-source';texturePath:string}}
export interface OriginalCampaignBackgroundView {scope:'native-observer-background';random:OriginalJavaRandomState;fields:{bounds:{x:number;y:number;width:number;height:number};groups:{x:number;y:number;size:number;color:ViewRGBA}[][]}[];sprite:{texture:OriginalMemberViewTexture;width:number;height:number};offset:[number,number];width:number;height:number;pixelScale:number;wasShifted:boolean}
export function originalCampaignBackgroundTexture(path:string):OriginalMemberViewTexture;
export function createOriginalNormalSpaceBackground(texturePath?:string):OriginalNormalSpaceBackground;
export function validateOriginalCampaignBackgroundSource(bg:OriginalNormalSpaceBackground):OriginalNormalSpaceBackground;
export function replaceOriginalCampaignBackgroundTexture(bg:OriginalNormalSpaceBackground,path:string|null):void;
export function setOriginalCampaignBackgroundOffset(view:OriginalCampaignBackgroundView,x:number,y:number):void;
export function createOriginalCampaignBackgroundView(source:OriginalNormalSpaceBackground,width:number,height:number,seed:string,pixelScale?:number):OriginalCampaignBackgroundView;
export function renderOriginalCampaignBackground(source:OriginalNormalSpaceBackground,view:OriginalCampaignBackgroundView,camera:{center:readonly [number,number];width:number;height:number;zoom:number},pixelScale?:number):OriginalFleetDrawFrame;
