export type NativeContrailVector=[number,number];
export interface OriginalCampaignContrailParams {color:[number,number,number,number];width:number;duration:number;minSegLength:number;maxSegLength:number;widthMultiplier:number;mode:'WIDEN'|'NARROW'|'CONSTANT';blendMode:'GLOW'|'SMOKE'}
export interface OriginalCampaignContrailPoint {point:NativeContrailVector;dirToNext:NativeContrailVector|null;perp:NativeContrailVector;vel:NativeContrailVector;width:number;duration:number;maxWidth:number;maxBrightness:number;elapsed:number;progress:number;distToPrev:number;texCoord:number;fadeOut:boolean;origMax:number;lastProximityMult:number;elapsedWhenFadeOut:number}
export interface OriginalCampaignContrail extends OriginalCampaignContrailParams {source:string;texturePath:'graphics/fx/contrail64b.png';remove:boolean;points:OriginalCampaignContrailPoint[];totalLength:number;lastPoint:NativeContrailVector|null;autoCleanup:boolean}
export interface OriginalCampaignContrails {scope:'native-campaign-contrail-engine-v2';capacity:number;contrails:OriginalCampaignContrail[]}
export interface OriginalCampaignContrailStrip {source:string;texturePath:string;blendSrc:'SRC_ALPHA';blendDest:'ONE'|'ONE_MINUS_SRC_ALPHA';primitive:'QUAD_STRIP';color:[number,number,number,number];vertices:{position:NativeContrailVector;uv:NativeContrailVector;color:[number,number,number,number]}[]}
export function createOriginalCampaignContrails():OriginalCampaignContrails;
export function initOriginalCampaignContrail(engine:OriginalCampaignContrails,source:string,params:OriginalCampaignContrailParams&{autoCleanup:boolean}):OriginalCampaignContrail;
export function updateOriginalCampaignContrail(engine:OriginalCampaignContrails,source:string,params:OriginalCampaignContrailParams):OriginalCampaignContrail|null;
export function getOriginalCampaignContrail(engine:OriginalCampaignContrails,source:string):OriginalCampaignContrail|null;
export function clearOriginalCampaignContrails(engine:OriginalCampaignContrails):void;
export function addOriginalCampaignContrailPoint(engine:OriginalCampaignContrails,source:string,position:NativeContrailVector,velocity:NativeContrailVector,brightness:number):void;
export function terminateOriginalCampaignContrail(engine:OriginalCampaignContrails,source:string):void;
export function removeOriginalCampaignContrail(engine:OriginalCampaignContrails,source:string):void;
export function advanceOriginalCampaignContrails(engine:OriginalCampaignContrails,seconds:number):void;
/** Mutates render-side fading exactly once; output is geometry, not a GPU submission. */
export function renderOriginalCampaignContrails(engine:OriginalCampaignContrails,alpha?:number):{scope:'native-campaign-contrail-quad-strips';strips:OriginalCampaignContrailStrip[]};
export function validateOriginalCampaignContrails<T extends OriginalCampaignContrails>(engine:T):T;
