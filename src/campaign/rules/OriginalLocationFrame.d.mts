import type {OriginalFleetWorld,OriginalFleetLocationRegistry,OriginalFleetWorldServices} from './OriginalFleetWorld.mjs';
import type {OriginalCampaignMemory,OriginalCampaignMemoryServices} from './OriginalCampaignMemory.mjs';
import type {OriginalFader} from './OriginalFader.mjs';
import type {OriginalViewShifter,ViewRGBA} from './OriginalFleetViewShifters.mjs';
import type {OriginalConstructedCampaignFleet,OriginalEntityIndicator} from './OriginalCampaignFleet.mjs';
import type {OriginalLocationEncounterServices,OriginalLocationEncounterContext} from './OriginalLocationEncounters.mjs';
export interface OriginalLocationBackground {scope:'native-location-background-advance';warpingRenderer:object|null;colorShifter:OriginalViewShifter<ViewRGBA>|null;particleColorShifter:OriginalViewShifter<ViewRGBA>|null}
/** Only the BaseLocation advance state, not a complete location constructor or generic entity registry. */
export interface OriginalLocationFrame {scope:'native-location-natural-frame';world:OriginalFleetWorld;location:OriginalFleetLocationRegistry;kind:'base'|'star-system';center:object|null;background:OriginalLocationBackground|object|null;lightColor:ViewRGBA;lightHeight:OriginalFader;memory:OriginalCampaignMemory|null;scripts:(object|null)[];hitParticles:{scope:'native-location-hit-particles';limit:number;particles:object[]};spawnPoints:object[];idMapDirty:boolean;lastPlayerVisitTimestamp:string}
/** In-process only; source identity must never be JSON-serialized as a graph. */
export interface OriginalLocationFrameEffect {entity:object;effect:unknown}
export interface OriginalLocationFrameContext extends OriginalLocationEncounterContext {currentLocation:OriginalFleetLocationRegistry|null;paused:boolean;isFastForwardIteration:boolean;input?:unknown}
export interface OriginalLocationFrameServices extends OriginalLocationEncounterServices,OriginalFleetWorldServices {
 memoryServices?:OriginalCampaignMemoryServices;
 readLocationObjects?(location:OriginalFleetLocationRegistry,className:string):(object|null)[];
 invalidateIndicatorList?(list:unknown):void;
 readLocationOrbitFocus?(entity:object,orbit:unknown):object|null;
 isLocationPlanet?(entity:object):boolean;isLocationStar?(entity:object):boolean;readStarLightColorOverride?(entity:object):ViewRGBA|null;
 setLocationEntityLight?(entity:object,source:object|null,color:ViewRGBA):void;
 advanceLocationEntityIndicator?(entity:object,seconds:number):void;
 advanceLocationFleetEvenIfPaused?(fleet:OriginalConstructedCampaignFleet,seconds:number,context:OriginalLocationFrameContext):void;
 advanceLocationFleet?(fleet:OriginalConstructedCampaignFleet,seconds:number,context:OriginalLocationFrameContext):unknown;
 advanceLocationEntityEvenIfPaused?(entity:object,seconds:number,context:OriginalLocationFrameContext):void;
 advanceLocationEntity?(entity:object,seconds:number,context:OriginalLocationFrameContext):void;
 isLocationScriptDone?(script:object):boolean;locationScriptRunsWhilePaused?(script:object):boolean;advanceLocationScript?(script:object,seconds:number,context:OriginalLocationFrameContext):void;
 advanceLocationBackground?(background:object,seconds:number):void;advanceLocationBackgroundWarp?(warper:object,seconds:number):void;
 advanceLocationParticle?(particle:object,seconds:number):void;isLocationParticleExpired?(particle:object):boolean;
 readLocationEntityVelocity?(entity:object):[number,number];removeLocationEntity?(location:OriginalFleetLocationRegistry,entity:object):void;
 convertLocationSecondsToDays?(seconds:number):number;readLocationClockTimestamp?():string|number;
 advanceLocationEncounters?(state:OriginalLocationFrame,context:OriginalLocationFrameContext):unknown;
 advanceLocationSpawnPoint?(point:object,location:OriginalFleetLocationRegistry):void;
}
export function createOriginalLocationFrame(world:OriginalFleetWorld,location:OriginalFleetLocationRegistry,options:{kind:OriginalLocationFrame['kind'];center:object|null;background:OriginalLocationFrame['background']}):OriginalLocationFrame;
export function validateOriginalLocationFrame(state:OriginalLocationFrame,world:OriginalFleetWorld):OriginalLocationFrame;
export function advanceOriginalLocationIndicator(indicator:OriginalEntityIndicator,seconds:number,services?:OriginalLocationFrameServices):void;
export function advanceOriginalLocationEvenIfPaused(state:OriginalLocationFrame,seconds:number,context:OriginalLocationFrameContext,services?:OriginalLocationFrameServices):{scope:'native-location-even-if-paused';entities:number;readyForAuthority:false};
export function advanceOriginalLocationFrame(state:OriginalLocationFrame,seconds:number,context:OriginalLocationFrameContext,services?:OriginalLocationFrameServices):{scope:'native-location-natural-frame-result';advanced:number;removed:number;tokens:number;encounters:unknown;effects:OriginalLocationFrameEffect[];zeroTimeReturn:boolean;readyForAuthority:false};
