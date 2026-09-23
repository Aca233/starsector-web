import type {OriginalBaseCampaignEntity,OriginalCampaignResources,NativeRGBA} from './OriginalCampaignFleet.mjs';
import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
export interface OriginalPlanetSpec {
 scope:'native-planet-spec';planetType:string;name:string;aOrAn:string;texture:string;iconTexture:string;descriptionId:string;coronaTexture:string;
 cloudTexture:string|null;glowTexture:string|null;starscapeIcon:string|null;shieldTexture:string|null;shieldTexture2:string|null;
 tilt:number;pitch:number;rotation:number;cloudRotation:number;cloudAlpha:number;atmosphereThickness:number;atmosphereThicknessMin:number;scaleMultMapIcon:number;scaleMultStarscapeIcon:number;coronaSize:number;shieldThickness:number;shieldThickness2:number;
 planetColor:NativeRGBA;iconColor:NativeRGBA;atmosphereColor:NativeRGBA;cloudColor:NativeRGBA;glowColor:NativeRGBA;coronaColor:NativeRGBA;shieldColor:NativeRGBA|null;shieldColor2:NativeRGBA|null;
 isStar:boolean;isBlackHole:boolean;isNebulaCenter:boolean;isGasGiant:boolean;isPulsar:boolean;doNotShowInCombat:boolean;useReverseLightForGlow:boolean;lightPosition:[number,number,number];tags:string[];
}
export interface OriginalCampaignPlanet {
 scope:'native-campaign-planet';objectRef:string;id:string;type:string;entity:OriginalBaseCampaignEntity;position:[number,number];radius:number;angle:number;cloudAngle:number;spec:OriginalPlanetSpec|null;
 graphics:{scope:'native-campaign-planet-graphics';spec:OriginalPlanetSpec;renderCache?:{texture:string;cloudTexture:string|null;glowTexture:string|null;shieldTexture:string|null;shieldTexture2:string|null;coronaTexture:string;glowColor:NativeRGBA};angle:number;cloudAngle:number;position:[number,number];radius:number;tilt:number;pitch:number;lightPosition:[number,number,number]};
 lightColorOverrideIfStar:NativeRGBA|null;secondLightColor:NativeRGBA|null;secondLightLocation:[number,number,number]|null;descriptionIdOverride:string|null;layers:['PLANETS','ABOVE'];worldRegistered:boolean;
}
export interface OriginalCampaignPlanetInput {id:string;name:string|null;type:string;radius:number;position:[number,number];lightSource:{objectRef:string}|null}
export interface OriginalCampaignPlanetConstructionServices {resources:OriginalCampaignResources;mathRandom:OriginalJavaRandomState;readPlanetSpec?(type:string):OriginalPlanetSpec}
export const ORIGINAL_CAMPAIGN_PLANET_CLASSES:readonly string[];
export function isOriginalCampaignPlanet(object:unknown):object is OriginalCampaignPlanet;
export function createOriginalPlanetSpec(type:string,definition?:Record<string,unknown>,defaultCoronaTexture?:string):OriginalPlanetSpec;
export function validateOriginalPlanetSpec(spec:OriginalPlanetSpec):OriginalPlanetSpec;
export function cloneOriginalPlanetSpec(spec:OriginalPlanetSpec):OriginalPlanetSpec;
export function createOriginalCampaignPlanet(objectRef:string,input:OriginalCampaignPlanetInput,services:OriginalCampaignPlanetConstructionServices):OriginalCampaignPlanet;
export function getOriginalCampaignPlanetSpec(planet:OriginalCampaignPlanet):OriginalPlanetSpec;
export function applyOriginalCampaignPlanetSpec(planet:OriginalCampaignPlanet):OriginalCampaignPlanet;
export function setOriginalCampaignPlanetRadius(planet:OriginalCampaignPlanet,radius:number):void;
export function setOriginalCampaignPlanetSecondLight(planet:OriginalCampaignPlanet,position:[number,number,number]|null,color:NativeRGBA|null):void;
export function advanceOriginalCampaignPlanetGraphics(planet:OriginalCampaignPlanet,seconds:number):void;
export function validateOriginalCampaignPlanet(planet:OriginalCampaignPlanet):OriginalCampaignPlanet;
