import type {OriginalCargoPods} from './OriginalCargoPods.mjs';
import type {OriginalWorldEntity} from './OriginalFleetWorld.mjs';
import type {OriginalFleetDrawFrame} from './OriginalFleetDraw.mjs';
import type {OriginalConstructedCampaignFleet,OriginalFleetConstructionFaction,NativeRGBA} from './OriginalCampaignFleet.mjs';
import type {OriginalFader} from './OriginalFader.mjs';
import type {OriginalFleetWorldServices,OriginalFleetLocationRegistry} from './OriginalFleetWorld.mjs';
import type {OriginalNativeFleet} from './OriginalFleetData.mjs';
import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
import type {OriginalCampaignMemoryServices} from './OriginalCampaignMemory.mjs';
export type OriginalFleetContactLevel='NONE'|'SENSOR_CONTACT'|'COMPOSITION_DETAILS'|'COMPOSITION_AND_FACTION_DETAILS';
export interface OriginalFleetContactManager<Owner=OriginalConstructedCampaignFleet> {scope:'native-fleet-contact-indicator-manager';fleet:Owner;questionMark:null;sensorInds:{manager:OriginalFleetContactManager<Owner>;offset:[number,number];fader:OriginalFader}[]|null;sinceLastNoticedPing:number;sinceLastLostSightPing:number;prevLevel:OriginalFleetContactLevel|null}
export type OriginalFleetContactEffect={kind:'sensor-ping';entity:OriginalConstructedCampaignFleet;id:'new_sensor_contact'|'noticed_player'|'lost_sight_of_player';color:NativeRGBA}|{kind:'campaign-sound';id:'lost_sight_of_by_player';pitch:1;volume:1;position:[number,number];velocity:[number,number]};
export interface OriginalFleetContactContext {playerFleet:OriginalNativeFleet|null;currentLocation:OriginalFleetLocationRegistry|null}
export interface OriginalFleetContactServices extends OriginalFleetWorldServices {
 readContactMemory?(entity:OriginalConstructedCampaignFleet):import('./OriginalCampaignMemory.mjs').OriginalCampaignMemory;
 memoryServices?:OriginalCampaignMemoryServices;
 readFleetRadius?(fleet:OriginalConstructedCampaignFleet):number;
 isFleetVisibleToPlayer?(fleet:OriginalConstructedCampaignFleet):boolean;
 readVisibilityToPlayer?(fleet:OriginalConstructedCampaignFleet):OriginalFleetContactLevel;
 readPlayerVisibilityToFleet?(fleet:OriginalConstructedCampaignFleet):OriginalFleetContactLevel;
 readFleetIndicatorFaction?(fleet:OriginalConstructedCampaignFleet):OriginalFleetConstructionFaction|null;
 readNeutralIndicatorFaction?():OriginalFleetConstructionFaction;
 readPlayerFactionColor?():NativeRGBA;
 readPlayerFactionBaseUIColor?():NativeRGBA;
 invalidateIndicatorList?(list:unknown):void;
 reportDetectedEntity?(fleet:OriginalConstructedCampaignFleet,level:OriginalFleetContactLevel):void;
 pickDiscoverEntityPlugin?(fleet:OriginalConstructedCampaignFleet):object|null;
 discoverEntity?(plugin:object,fleet:OriginalConstructedCampaignFleet):void;
}
export interface OriginalFleetContactPresentation {fleet?:OriginalConstructedCampaignFleet;sensorContactIndicatorManager:OriginalFleetContactManager<OriginalWorldEntity>|null;sensorFader:OriginalFader;sensorContactFader:OriginalFader;indicator:{color:NativeRGBA;secondaryColor:NativeRGBA|null;secondarySegments:number;renderList:unknown}}
export function createOriginalFleetContactPresentation(fleet:OriginalConstructedCampaignFleet):OriginalFleetContactPresentation & {fleet:OriginalConstructedCampaignFleet};
export function originalFleetContactManager(fleet:OriginalConstructedCampaignFleet,presentation?:OriginalFleetContactPresentation):OriginalFleetContactManager;
export function validateOriginalFleetContact(fleet:OriginalConstructedCampaignFleet,presentation?:OriginalFleetContactPresentation):OriginalFleetContactManager|null;
export function setOriginalFleetIndicatorColors(fleet:OriginalConstructedCampaignFleet,primary:NativeRGBA|null,secondary:NativeRGBA|null,segments:number,services?:OriginalFleetContactServices,presentation?:OriginalFleetContactPresentation):void;
export function originalFleetContactMarkerLimit(fleet:OriginalConstructedCampaignFleet,services?:OriginalFleetContactServices):number;
export function advanceOriginalFleetContact(fleet:OriginalConstructedCampaignFleet,seconds:number,globalRandom:OriginalJavaRandomState|undefined,context:OriginalFleetContactContext,services?:OriginalFleetContactServices,presentation?:OriginalFleetContactPresentation):{effects:OriginalFleetContactEffect[]};

export function renderOriginalFleetContact(fleet:OriginalConstructedCampaignFleet,alpha:number,context:OriginalFleetContactContext,services?:OriginalFleetContactServices,presentation?:OriginalFleetContactPresentation):OriginalFleetDrawFrame;

export type OriginalCargoPodsContactEffect=Exclude<OriginalFleetContactEffect,{kind:'sensor-ping'}>|{kind:'sensor-ping';entity:OriginalCargoPods;id:'new_sensor_contact';color:NativeRGBA};
export interface OriginalCargoPodsContactServices {memoryServices?:OriginalCampaignMemoryServices;isCargoPodsVisibleToPlayer?(entity:OriginalCargoPods):boolean;readCargoPodsVisibilityToPlayer?(entity:OriginalCargoPods):OriginalFleetContactLevel;reportDetectedCargoPods?(entity:OriginalCargoPods,level:OriginalFleetContactLevel):void;pickDiscoverCargoPodsPlugin?(entity:OriginalCargoPods):object|null;discoverCargoPods?(plugin:object,entity:OriginalCargoPods):void;readNeutralIndicatorFaction?():OriginalFleetConstructionFaction;readPlayerFactionBaseUIColor?():NativeRGBA;readPlayerFactionColor?():NativeRGBA;invalidateIndicatorList?(list:unknown):void}
export function advanceOriginalCargoPodsContact(pod:OriginalCargoPods,seconds:number,random:OriginalJavaRandomState,context:OriginalFleetContactContext,services?:OriginalCargoPodsContactServices,presentation?:OriginalCargoPodsContactPresentation):{effects:OriginalCargoPodsContactEffect[]};
export function validateOriginalFleetContact(pod:OriginalCargoPods,presentation?:OriginalCargoPodsContactPresentation):OriginalFleetContactManager<OriginalCargoPods>|null;

export type OriginalCargoPodsContactPresentation=Omit<OriginalFleetContactPresentation,'fleet'>&{fleet?:OriginalCargoPods};
export function createOriginalFleetContactPresentation(pod:OriginalCargoPods):OriginalCargoPodsContactPresentation&{fleet:OriginalCargoPods};
export function renderOriginalFleetContact(pod:OriginalCargoPods,alpha:number,context:OriginalFleetContactContext,services?:OriginalCargoPodsContactServices,presentation?:OriginalCargoPodsContactPresentation):OriginalFleetDrawFrame;

export function validateOriginalFleetContact(planet:import('./OriginalCampaignPlanet.mjs').OriginalCampaignPlanet,presentation?:Omit<OriginalFleetContactPresentation,'fleet'>):OriginalFleetContactManager<import('./OriginalCampaignPlanet.mjs').OriginalCampaignPlanet>|null;
