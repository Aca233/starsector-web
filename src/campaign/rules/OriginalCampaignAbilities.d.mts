import type {OriginalConstructedCampaignFleet,OriginalBaseCampaignEntity} from './OriginalCampaignFleet.mjs';
import type {OriginalFleetLocationRegistry} from './OriginalFleetWorld.mjs';
import type {OriginalNativeFleet} from './OriginalFleetData.mjs';
import type {OriginalCampaignMemoryServices} from './OriginalCampaignMemory.mjs';
export interface OriginalTravelAbilitySpec {id:string;name:string;plugin:string;tags:string[];activationDays:number;activationCooldown:number;deactivationDays:number;deactivationCooldown:number;musicSuppression:number;uiOn:string|null;uiOff:string|null;uiLoop:string|null;worldOn:string|null;worldOff:string|null;worldLoop:string|null;icon:string}
export interface OriginalCampaignAbility {scope:'native-campaign-toggle-ability';id:string;spec:OriginalTravelAbilitySpec;fleet:OriginalConstructedCampaignFleet;entity:OriginalBaseCampaignEntity;disableFrames:number;turnedOn:boolean;cooldownLeft:number;isActivateCooldown:boolean;level:number}
export type OriginalAbilityPlugin=OriginalCampaignAbility|{objectRef:string;[key:string]:unknown};
export interface OriginalAbilityContext {playerFleet:OriginalNativeFleet|null;currentLocation:OriginalFleetLocationRegistry|null;paused:boolean;secondsPerDay:number}
export interface OriginalAbilityEffect {scope:'native-campaign-ability-effect';type:'world-sound'|'ui-sound'|'world-loop'|'ui-loop'|'floating-text';abilityId:string;fleetRef:string;soundId?:string;volume?:number;pitch?:number;musicSuppression?:number;position?:[number,number];velocity?:[number,number];text?:string;duration?:number;color?:[number,number,number,number]}
export interface OriginalAbilityServices {memoryServices?:OriginalCampaignMemoryServices;readAbilityContext?(ability:OriginalCampaignAbility):OriginalAbilityContext;isFleetVisibleToPlayer?(fleet:OriginalConstructedCampaignFleet):boolean;reportPlayerAbility?(ability:OriginalCampaignAbility,active:boolean):void;reportAbilityToListener?(listener:unknown,ability:OriginalCampaignAbility,active:boolean,param:null):void}
export function isOriginalCampaignAbility(value:unknown):value is OriginalCampaignAbility;
export function originalFleetAbilityEntries(fleet:OriginalConstructedCampaignFleet):{id:string;plugin:OriginalAbilityPlugin}[];
export function originalFleetAbilities(fleet:OriginalConstructedCampaignFleet):OriginalAbilityPlugin[];
export function originalFleetAbility(fleet:OriginalConstructedCampaignFleet,id:string):OriginalAbilityPlugin|null;
export function validateOriginalCampaignAbility(ability:OriginalCampaignAbility,fleet?:OriginalConstructedCampaignFleet):OriginalCampaignAbility;
export function validateOriginalFleetAbilities(fleet:OriginalConstructedCampaignFleet):OriginalConstructedCampaignFleet;
export function addOriginalFleetAbility(fleet:OriginalConstructedCampaignFleet,id:string):OriginalCampaignAbility;
export function originalAbilityLayers(ability:OriginalCampaignAbility):null;
export function originalAbilitiesCompatible(ability:OriginalCampaignAbility,other:OriginalCampaignAbility):boolean;
export function originalAbilityCooldownFraction(ability:OriginalCampaignAbility):number;
export function originalAbilityUsable(ability:OriginalCampaignAbility):boolean;
export function forceDisableOriginalAbility(ability:OriginalCampaignAbility):void;
export function changeOriginalFleetAbility(ability:OriginalCampaignAbility,action:'activate'|'deactivate'|'press',context:Omit<OriginalAbilityContext,'paused'>&{paused?:boolean},services?:OriginalAbilityServices):{effects:OriginalAbilityEffect[];active:boolean;level:number;readyForAuthority:false};
export function advanceOriginalCampaignAbility(ability:OriginalCampaignAbility,seconds:number,context:OriginalAbilityContext,services?:OriginalAbilityServices):{effects:OriginalAbilityEffect[]};
export function removeOriginalFleetAbility(fleet:OriginalConstructedCampaignFleet,id:string,context:OriginalAbilityContext,services?:OriginalAbilityServices):{effects:OriginalAbilityEffect[]};
export function clearOriginalFleetAbilities(fleet:OriginalConstructedCampaignFleet,context:OriginalAbilityContext,services?:OriginalAbilityServices):{effects:OriginalAbilityEffect[]};
