import type {OriginalConstructedFleetData,OriginalFleetDataFactory} from './OriginalFleetDataFactory.mjs';
import type {OriginalFleetRosterBinding} from './OriginalFleetRoster.mjs';
import type {OriginalPlayerEconomyState,OriginalPayrollPerson} from './OriginalPlayerEconomy.mjs';
import type {OriginalFleetLifecycleServices} from './OriginalFleetData.mjs';
import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
import type {OriginalFader} from './OriginalFader.mjs';
import type {OriginalSmoothMovement,OriginalSmoothFacing} from './OriginalMovement.mjs';
export type NativeRGBA=[number,number,number,number];
export interface OriginalFleetConstructionFaction {scope:'native-current-faction-fleet-construction';objectRef:string;factionId:string;shipNamePrefix:string|null;specColor:NativeRGBA|null;specBaseUIColor?:NativeRGBA|null;secondaryUIColor:NativeRGBA|null;specSecondarySegments:number}
export interface OriginalConstructorTexture {kind:'native-texture-source';path:string;sha256:string;width:number;height:number;texWidth:number;texHeight:number}
export interface OriginalCampaignResources {scope:'native-campaign-construction-resources';textures:Record<string,OriginalConstructorTexture>;selectionColor:NativeRGBA;combatReadinessPlugin:string}
export interface OriginalConstructorSprite {objectRef:string;texture:OriginalConstructorTexture;textureId:string;width:number;height:number;texX:number;texY:number;texWidth:number;texHeight:number;angle:number;color:NativeRGBA;alphaMult:number;colorUL:NativeRGBA;colorUR:NativeRGBA;colorLL:NativeRGBA;colorLR:NativeRGBA;centerX:number;centerY:number;offsetX:number;offsetY:number;blendSrc:number;blendDest:number;texClamp:boolean}
export interface OriginalEngineInterval {minInterval:number;maxInterval:number;currInterval:number;elapsed:number;intervalElapsed:boolean}
export interface OriginalEntityIndicator {objectRef:string;entityRef:string;fader:OriginalFader;pulse:OriginalFader;color:NativeRGBA;secondaryColor:NativeRGBA|null;typeOrdinal:number;pendingTypeOrdinal:number|null;pendingColor:NativeRGBA|null;radius:number;lineWidth:number;renderList:null;texture:OriginalConstructorTexture;radiusOverride:number;alternateGeometry:boolean;brightnessMult:number;brightnessOverride:number;specialMode:boolean;secondarySegments:number}
export interface OriginalBaseCampaignEntity {sensorContactIndicatorManager:import('./OriginalFleetContact.mjs').OriginalFleetContactManager<import('./OriginalFleetWorld.mjs').OriginalWorldEntity>|null;memory:import('./OriginalCampaignMemory.mjs').OriginalCampaignMemory|null;objectRef:string;id:string;position:[number,number];velocity:[number,number];name:string|null;expired:boolean;factionRef:string;facing:number;transponderOn:boolean;containingLocation:import('./OriginalFleetWorld.mjs').OriginalFleetLocationRegistry|null;indicator:OriginalEntityIndicator;selectionIndicator:{objectRef:string;entityRef:string;color:NativeRGBA;fader:OriginalFader};sensorFader:OriginalFader;sensorContactFader:OriginalFader;[field:string]:unknown}
export interface OriginalCampaignFleetConstruction {
 /** Web graph identity for actual constructed composites, not imported historical metadata. */
 battleCombination?:import('./OriginalCampaignBattleLifecycle.mjs').OriginalBattleCombinedIdentity;
 schemaVersion:1;scope:'native-constructed-campaign-fleet';entity:OriginalBaseCampaignEntity;faction:OriginalFleetConstructionFaction;arrow:OriginalConstructorSprite;
 view:import('./OriginalCampaignFleetView.mjs').OriginalFleetView;
 movement:OriginalSmoothMovement<string>;facing:OriginalSmoothFacing;desiredFacing:number;moveDestination:[number,number]|null;moveOverride:boolean;noCombat:OriginalFader|null;noCombatPulse:OriginalFader;ai:{objectRef:string;[key:string]:unknown}|null;interactionTarget:string|null;flags:Record<string,boolean|null>;despawnListeners:import('./OriginalFleetWorld.mjs').OriginalFleetWorldListener[]|null;abilityRenderer:import('./OriginalFleetWorld.mjs').OriginalFleetAbilityRenderer|null;nullAIActionText:string|null;layers:['FLEETS'];jumpDestination:null;moveDestinationSetWhileInLocation:string|null;
 accidents:{objectRef:string;fleetRef:string;randomSeed:string;random:OriginalJavaRandomState;tracker:OriginalEngineInterval;currentChance:number;context:{daysWithoutSupplies:number};risks:{kind:'native-low-cr-ship-loss';fleetDataRef:string;cargo:OriginalConstructedFleetData['cargo'];random:OriginalJavaRandomState}[]};
 logistics:{objectRef:string;fleetRef:string;plugin:{objectRef:string;className:string}};
 sensorRangeIndicator:{fleetRef:string;color:NativeRGBA|null;fader:OriginalFader;phase:number;texture:OriginalConstructorTexture;renderList:null;radius:number;lineWidth:number};
 rendering:'source-state-only-not-rendered';worldRegistered:boolean;
}
export interface OriginalConstructedCampaignFleet extends OriginalConstructedFleetData {campaign:OriginalCampaignFleetConstruction;id:string;facing:number;name:string|null;position:[number,number]}
export interface OriginalCampaignFleetConstructionServices {resources:OriginalCampaignResources;globalRandom:OriginalJavaRandomState;createFleetData(prefix:string|null,factionId:string):OriginalFleetRosterBinding & {fleet:OriginalConstructedFleetData};initializeCommander(fleet:OriginalConstructedFleetData,factionId:string,isInSectorGen:boolean):OriginalPayrollPerson}
export function validateOriginalFleetConstructionFaction(faction:OriginalFleetConstructionFaction):OriginalFleetConstructionFaction;
export function initializeOriginalCampaignResources(factory:OriginalFleetDataFactory):OriginalCampaignResources;
export function validateOriginalCampaignResources(resources:OriginalCampaignResources):OriginalCampaignResources;
export function constructOriginalCampaignFleet(player:OriginalPlayerEconomyState,faction:OriginalFleetConstructionFaction,context:{isInSectorGen:boolean;secondsPerDay:number},services:OriginalCampaignFleetConstructionServices):OriginalFleetRosterBinding & {fleet:OriginalConstructedCampaignFleet};
export function createOriginalEngineInterval(min:number,max:number,random:OriginalJavaRandomState):OriginalEngineInterval;
export function advanceOriginalEngineInterval(state:OriginalEngineInterval,amount:number,random:OriginalJavaRandomState):OriginalEngineInterval;
export function setOriginalConstructedFleetLocation(fleet:OriginalConstructedCampaignFleet,x:number,y:number):void;
export function setOriginalConstructedFleetVelocity(fleet:OriginalConstructedCampaignFleet,x:number,y:number):void;
export function setOriginalConstructedFleetFacing(fleet:OriginalConstructedCampaignFleet,angle:number):void;
export function advanceOriginalConstructedFleetLogistics(fleet:OriginalConstructedCampaignFleet,days:number,services?:OriginalFleetLifecycleServices):{hasSupplies:boolean;supplyCost:number;fuelCost:number};
export function validateOriginalConstructedCampaignFleet(fleet:OriginalConstructedCampaignFleet,resources:OriginalCampaignResources):OriginalConstructedCampaignFleet;

export function createOriginalBaseCampaignEntity(objectRef:string,id:string,resources:OriginalCampaignResources):OriginalBaseCampaignEntity;
