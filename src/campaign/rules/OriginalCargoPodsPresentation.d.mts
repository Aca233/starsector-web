import type {OriginalCargoPods,OriginalCargoPodsFieldManager} from './OriginalCargoPods.mjs';
import type {OriginalConstructedCampaignFleet} from './OriginalCampaignFleet.mjs';
import type {OriginalFleetLocationRegistry} from './OriginalFleetWorld.mjs';
import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
import type {OriginalCargoPodsContactPresentation,OriginalCargoPodsContactServices,OriginalCargoPodsContactEffect,OriginalFleetContactLevel} from './OriginalFleetContact.mjs';
import type {OriginalCampaignMemory} from './OriginalCampaignMemory.mjs';
import type {OriginalFleetDrawFrame} from './OriginalFleetDraw.mjs';
export interface OriginalCargoPodsPresentationServices extends OriginalCargoPodsContactServices {readLocationEntityState?(entity:object):{position:[number,number];tags:string[]|null}}
export interface OriginalCargoPodsObserverPresentation {scope:'native-observer-cargo-pods-presentation';pod:OriginalCargoPods;observer:OriginalConstructedCampaignFleet;contact:OriginalCargoPodsContactPresentation;field:OriginalCargoPodsFieldManager;emptyMemory:OriginalCampaignMemory;random:OriginalJavaRandomState}
export interface OriginalCargoPodsObserverContext {currentLocation:OriginalFleetLocationRegistry|null;paused:boolean}
export interface OriginalCargoPodsRenderContext extends OriginalCargoPodsObserverContext {alpha:number;isNearViewport(position:[number,number],radius:number):boolean}
export interface OriginalObserverCargoPodsLayers {scope:'native-observer-cargo-pods-layers';terrain:OriginalFleetDrawFrame;contacts:OriginalFleetDrawFrame}
export type OriginalCargoPodsObserverEffect=OriginalCargoPodsContactEffect|{kind:'observed-entity';entity:OriginalCargoPods;visibility:OriginalFleetContactLevel}|{kind:'observed-discoverable-entity';plugin:object;entity:OriginalCargoPods};
export function renderOriginalCargoPodsGraphics(pod:OriginalCargoPods,random:OriginalJavaRandomState,context:OriginalCargoPodsRenderContext&{layer:string},services?:OriginalCargoPodsPresentationServices,manager?:OriginalCargoPodsFieldManager,contact?:{sensorFader:{currBrightness:number};sensorContactFader:{currBrightness:number}}):OriginalFleetDrawFrame;
export function createOriginalCargoPodsObserverPresentation(pod:OriginalCargoPods,observer:OriginalConstructedCampaignFleet,seed:string):OriginalCargoPodsObserverPresentation;
export function advanceOriginalCargoPodsObserver(state:OriginalCargoPodsObserverPresentation,seconds:number,days:number,context:OriginalCargoPodsObserverContext,services?:OriginalCargoPodsPresentationServices):{effects:OriginalCargoPodsObserverEffect[]};
export function renderOriginalCargoPodsObserverLayers(state:OriginalCargoPodsObserverPresentation,context:OriginalCargoPodsRenderContext,services?:OriginalCargoPodsPresentationServices):OriginalObserverCargoPodsLayers;
export function validateOriginalCargoPodsObserverPresentation(state:OriginalCargoPodsObserverPresentation):OriginalCargoPodsObserverPresentation;

export function rebindOriginalCargoPodsObserverPresentation(state:OriginalCargoPodsObserverPresentation,pod:OriginalCargoPods,observer:OriginalConstructedCampaignFleet):OriginalCargoPodsObserverPresentation;
