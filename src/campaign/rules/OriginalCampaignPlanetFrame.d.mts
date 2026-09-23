import type {OriginalCampaignPlanet} from './OriginalCampaignPlanet.mjs';
import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
import type {OriginalFleetContactContext,OriginalFleetContactEffect,OriginalFleetContactLevel} from './OriginalFleetContact.mjs';
import type {OriginalEntityFrameServices} from './OriginalCampaignEntityFrame.mjs';
import type {OriginalFleetConstructionFaction,NativeRGBA} from './OriginalCampaignFleet.mjs';
import type {OriginalSensorEntity} from './OriginalSensors.mjs';
export interface OriginalCampaignPlanetFrameContext extends OriginalFleetContactContext {paused:boolean}
export interface OriginalCampaignPlanetFrameServices extends OriginalEntityFrameServices {
 isPlanetVisibleToPlayer?(planet:OriginalCampaignPlanet):boolean;readPlanetVisibilityToPlayer?(planet:OriginalCampaignPlanet):OriginalFleetContactLevel;
 readPlanetIndicatorFaction?(planet:OriginalCampaignPlanet):OriginalFleetConstructionFaction;
 reportDetectedPlanet?(planet:OriginalCampaignPlanet,level:OriginalFleetContactLevel):void;pickDiscoverPlanetPlugin?(planet:OriginalCampaignPlanet):object|null;discoverPlanet?(plugin:object,planet:OriginalCampaignPlanet):void;
 readNeutralIndicatorFaction?():OriginalFleetConstructionFaction;readPlayerFactionBaseUIColor?():NativeRGBA;invalidateIndicatorList?(list:unknown):void;
}
export type OriginalCampaignPlanetContactEffect=Exclude<OriginalFleetContactEffect,{kind:'sensor-ping'}>|{kind:'sensor-ping';entity:OriginalCampaignPlanet;id:'new_sensor_contact';color:NativeRGBA};
export function advanceOriginalCampaignPlanetFrame(planet:OriginalCampaignPlanet,seconds:number,days:number,random:OriginalJavaRandomState,context:OriginalCampaignPlanetFrameContext,services?:OriginalCampaignPlanetFrameServices):{scope:'native-campaign-planet-frame';effects:OriginalCampaignPlanetContactEffect[];readyForAuthority:false};
export function advanceOriginalCampaignPlanetEvenIfPaused(planet:OriginalCampaignPlanet,seconds:number,context:OriginalCampaignPlanetFrameContext,services?:OriginalCampaignPlanetFrameServices):void;
export function originalCampaignPlanetSensorEntity(planet:OriginalCampaignPlanet):OriginalSensorEntity;
