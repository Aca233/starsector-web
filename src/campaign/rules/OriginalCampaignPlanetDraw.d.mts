import type {OriginalCampaignPlanet} from './OriginalCampaignPlanet.mjs';
import type {OriginalFleetDrawFrame} from './OriginalFleetDraw.mjs';
import type {OriginalMemberViewTexture} from './OriginalCampaignFleetMemberView.mjs';
export function originalCampaignPlanetTexture(path:string):OriginalMemberViewTexture;
export function renderOriginalCampaignPlanetLayers(planet:OriginalCampaignPlanet,context:{alpha:number;lightHeightBrightness?:number|null;isNearViewport:(position:[number,number],margin:number)=>boolean},services?:{readTexture?:(path:string)=>OriginalMemberViewTexture;readLightEntity?:(entity:{objectRef:string})=>{position:[number,number];tags:string[]}}):{planets:OriginalFleetDrawFrame;above:OriginalFleetDrawFrame};
