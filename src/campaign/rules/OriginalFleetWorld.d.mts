import type {OriginalCampaignPlanet} from './OriginalCampaignPlanet.mjs';
import type {OriginalCargoPods} from './OriginalCargoPods.mjs';
import type {OriginalConstructedCampaignFleet} from './OriginalCampaignFleet.mjs';
import type {OriginalFleetRosterBinding} from './OriginalFleetRoster.mjs';
import type {OriginalFleetLifecycleServices} from './OriginalFleetData.mjs';
import type {OriginalPatrolState} from './OriginalMilitaryPatrols.mjs';
export interface OriginalFleetWorldListener {objectRef:string;kind:string;state?:OriginalPatrolState;[field:string]:unknown}
export type OriginalRepositoryListener=OriginalFleetWorldListener|import('./OriginalCampaignEngine.mjs').OriginalCampaignEngineState;
export interface OriginalFleetAbilityRenderer {scope:'native-fleet-ability-renderer';objectRef:string;fleet:OriginalConstructedCampaignFleet;layers:string[]|null}
export type OriginalWorldEntity=OriginalConstructedCampaignFleet|OriginalCargoPods|OriginalCampaignPlanet;
export type OriginalFleetRenderable=OriginalWorldEntity|OriginalFleetAbilityRenderer;
export interface OriginalFleetLocationRegistry {scope:'native-location-fleet-registry';objectRef:string;hyperspaceMode:boolean;repository:{contains:OriginalWorldEntity[];lists:{key:string;values:OriginalWorldEntity[]}[];listener:OriginalRepositoryListener|null};renderer:{layers:{key:string;values:OriginalFleetRenderable[]}[]}|null}
export interface OriginalFleetWorld {refitScreenListeners?:{saved:OriginalFleetWorldListener[];transient:OriginalFleetWorldListener[]}|null;fleetInflationListeners?:{saved:OriginalFleetWorldListener[];transient:OriginalFleetWorldListener[]}|null;scope:'native-current-fleet-world-registration';sectorRef:string;planetSerial?:number;hullmodItemSerial?:number;locations:OriginalFleetLocationRegistry[];campaignListeners:{saved:OriginalFleetWorldListener[];transient:OriginalFleetWorldListener[];timed:OriginalFleetWorldListener[];timeouts?:import('./OriginalCampaignListenerTimeouts.mjs').OriginalCampaignListenerTimeouts};managedFleetListeners:{saved:OriginalFleetWorldListener[];transient:OriginalFleetWorldListener[]};detectedEntityListeners:{saved:OriginalFleetWorldListener[];transient:OriginalFleetWorldListener[]}|null;cargoScreenListeners:{saved:OriginalFleetWorldListener[];transient:OriginalFleetWorldListener[]}|null}
export interface OriginalFleetWorldServices extends OriginalFleetLifecycleServices {
 reportFleetInflatedToListener?(listener:OriginalFleetWorldListener,fleet:OriginalConstructedCampaignFleet,inflater:object|null):void;
 reportDetectedEntityToListener?(listener:OriginalFleetWorldListener,fleet:OriginalWorldEntity,level:import('./OriginalFleetContact.mjs').OriginalFleetContactLevel):void;
 objectAdded?(listener:OriginalRepositoryListener,fleet:OriginalWorldEntity):void;
 objectRemoved?(listener:OriginalRepositoryListener,fleet:OriginalWorldEntity):void;
 reportFleetSpawned?(listener:OriginalFleetWorldListener,fleet:OriginalConstructedCampaignFleet):void;
 reportFleetDespawned?(listener:OriginalFleetWorldListener,fleet:OriginalConstructedCampaignFleet,reason:string,param:unknown):void;
 reportFleetDespawnedToListener?(listener:OriginalFleetWorldListener,fleet:OriginalConstructedCampaignFleet,reason:string,param:unknown):void;
 reportCoreScriptUnclaimedCargo?(listener:OriginalFleetWorldListener,cargo:import('./OriginalPlayerEconomy.mjs').OriginalPlayerCargo):void;
 reportPlayerDidNotTakeCargoToListener?(listener:OriginalFleetWorldListener,cargo:import('./OriginalPlayerEconomy.mjs').OriginalPlayerCargo):void;
 reportPlayerLeftCargoPodsToListener?(listener:OriginalFleetWorldListener,entity:OriginalCargoPods):void;
 reportNonMarketTransactionToListener?(listener:OriginalFleetWorldListener,transaction:import('./OriginalLootCargoTransaction.mjs').OriginalLootNonMarketTransaction,dialog:object):void;
 readFleetAbilities?(fleet:OriginalConstructedCampaignFleet):unknown[];
 readAbilityLayers?(ability:unknown):string[]|null;
}
export function createOriginalFleetWorld(sectorRef:string):OriginalFleetWorld;
export function createOriginalFleetLocationRegistry(objectRef:string,hyperspaceMode:boolean):OriginalFleetLocationRegistry;
export function addOriginalFleetWorldLocation(world:OriginalFleetWorld,location:OriginalFleetLocationRegistry):OriginalFleetLocationRegistry;
export function originalFleetWorldLocation(world:OriginalFleetWorld,ref:string):OriginalFleetLocationRegistry;
export function originalWorldLocationObjects(location:OriginalFleetLocationRegistry,className:'com.fs.starfarer.campaign.fleet.CampaignFleet'):OriginalConstructedCampaignFleet[];
export function originalWorldLocationObjects(location:OriginalFleetLocationRegistry,className:'com.fs.starfarer.campaign.CampaignPlanet'):OriginalCampaignPlanet[];
export function originalWorldLocationObjects(location:OriginalFleetLocationRegistry,className?:string):OriginalWorldEntity[];
export function originalFleetAbilityRenderer(fleet:OriginalConstructedCampaignFleet):OriginalFleetAbilityRenderer;
export function recompileOriginalFleetRenderable(location:OriginalFleetLocationRegistry,object:OriginalFleetRenderable):void;
export function updateOriginalFleetAbilityLayers(fleet:OriginalConstructedCampaignFleet,services?:OriginalFleetWorldServices):boolean;
export function addOriginalFleetToLocation(world:OriginalFleetWorld,location:OriginalFleetLocationRegistry,fleet:OriginalConstructedCampaignFleet|null,services?:OriginalFleetWorldServices):void;
export function removeOriginalFleetFromLocation(world:OriginalFleetWorld,location:OriginalFleetLocationRegistry,fleet:OriginalConstructedCampaignFleet|null,services?:OriginalFleetWorldServices):void;
export function addOriginalFleetEventListener(fleet:OriginalConstructedCampaignFleet,listener:OriginalFleetWorldListener):void;
export function despawnOriginalWorldFleet(world:OriginalFleetWorld,binding:OriginalFleetRosterBinding,reason?:string,param?:unknown,services?:OriginalFleetWorldServices):{aborted:boolean};
export function setOriginalWorldFleetExpired(fleet:OriginalConstructedCampaignFleet,expired:boolean):void;
export function finishOriginalFleetAfterView(world:OriginalFleetWorld,binding:OriginalFleetRosterBinding,services?:OriginalFleetWorldServices):{aborted:boolean}|null;
export function removeExpiredOriginalWorldFleets(world:OriginalFleetWorld,location:OriginalFleetLocationRegistry,services?:OriginalFleetWorldServices):OriginalConstructedCampaignFleet[];
export function validateOriginalFleetWorld(world:OriginalFleetWorld,knownFleets?:OriginalConstructedCampaignFleet[]):OriginalFleetWorld;

export function reportOriginalDetectedEntity(world:OriginalFleetWorld,fleet:OriginalWorldEntity,level:import('./OriginalFleetContact.mjs').OriginalFleetContactLevel,services?:OriginalFleetWorldServices):void;

export function addOriginalCustomEntityToLocation(world:OriginalFleetWorld,location:OriginalFleetLocationRegistry,entity:OriginalCargoPods,services?:OriginalFleetWorldServices):void;
export function removeOriginalCustomEntityFromLocation(world:OriginalFleetWorld,location:OriginalFleetLocationRegistry,entity:OriginalCargoPods,services?:OriginalFleetWorldServices):void;
export function reportOriginalPlayerLeftCargoPods(world:OriginalFleetWorld,entity:OriginalCargoPods,services?:OriginalFleetWorldServices):void;
export function reportOriginalPlayerDidNotTakeCargo(world:OriginalFleetWorld,cargo:import('./OriginalPlayerEconomy.mjs').OriginalPlayerCargo,services?:OriginalFleetWorldServices):void;
export function reportOriginalNonMarketTransaction(world:OriginalFleetWorld,transaction:import('./OriginalLootCargoTransaction.mjs').OriginalLootNonMarketTransaction,dialog:object,services?:OriginalFleetWorldServices):void;

export function addOriginalPlanetToLocation(world:OriginalFleetWorld,location:OriginalFleetLocationRegistry,planet:OriginalCampaignPlanet,services?:OriginalFleetWorldServices):void;
export function removeOriginalPlanetFromLocation(world:OriginalFleetWorld,location:OriginalFleetLocationRegistry,planet:OriginalCampaignPlanet,services?:OriginalFleetWorldServices):void;

export function reportOriginalFleetInflated(world:OriginalFleetWorld,fleet:OriginalConstructedCampaignFleet,inflater:object|null,services?:OriginalFleetWorldServices):void;

export function reportOriginalRefitVariantSaved(world:OriginalFleetWorld,member:import('./OriginalHullmodItems.mjs').OriginalHullmodItemMember,market:object|null,services:{reportRefitVariantSavedToListener(listener:OriginalFleetWorldListener,member:import('./OriginalHullmodItems.mjs').OriginalHullmodItemMember,market:object|null):void}):void;
