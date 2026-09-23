import type {OriginalNativeFleetMember} from './OriginalFleetData.mjs';
import type {OriginalStorageVariant} from './OriginalStorage.mjs';
import type {OriginalPayrollPerson,OriginalPlayerEconomyState} from './OriginalPlayerEconomy.mjs';
import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
import type {OriginalMemberEffectPlugins} from './OriginalMemberEffects.mjs';
import type {OriginalFleetCompositionServices} from './OriginalFleetComposition.mjs';
export interface OriginalCreatedVariant extends OriginalStorageVariant {hullVariantId:string;displayName:string;variantSource:'STOCK'|'HULL'|null;sourceDetail:string|null;goalVariant:boolean;mayAutoAssignWeapons:boolean;originalVariant:string|null;groupSpecs:{type:string|null;autofire:boolean;slots:string[]}[]}
export interface OriginalCreatedFleetMember extends OriginalNativeFleetMember {nativeConstruction:'fleet-member-string';id:string;owner:number;type:'SHIP'|'FIGHTER_WING';specId:string;shipName:string|null;isFlagship:boolean;captain:OriginalPayrollPerson;captainRef:string;variant:OriginalCreatedVariant}
export interface OriginalCreatedNullFleetMember extends OriginalNativeFleetMember {nativeConstruction:'fleet-member-string';id:string;owner:-1;type:'NULL';specId:null;shipName:string|null;isFlagship:boolean;captain:OriginalPayrollPerson;captainRef:string;variant:null;stats:null}
export interface OriginalFleetNaming {scope:'native-fleet-data-naming';prefix:string|null;sourceFactionId:string|null;sources:{items:string[];weights:number[];total:number;random:OriginalJavaRandomState|null}|null}
export interface OriginalFleetMemberFactory {scope:'native-fleet-member-factory';/** Absent on old checkpoints; never auto-filled during restore. */defaultHullRegistry?:import('./OriginalDefaultHullModules.mjs').OriginalDefaultHullRegistryState;members:(OriginalCreatedFleetMember|OriginalCreatedNullFleetMember)[];stockVariants:Record<string,OriginalCreatedVariant>;names:{scope:'web-current-ship-name-store';tables:{groups:Record<string,string[]>;all:string[]};uses:Record<string,number>;useRomanNumerals:boolean;staticRandom:OriginalJavaRandomState|null;mathRandom:OriginalJavaRandomState}}
export interface OriginalFleetMemberReference {extraEffects:Record<string,{constants:Record<string,number>;hullSizeMap:Record<string,number>;hullSizeBonusMap?:Record<string,number>}>;schemaVersion:1;originalReference:string;scope:string;sources:Record<string,{sha256:string}>;errorShipVariant:string;hulls:Record<string,{name:string;slots:Record<string,string>;noAutoPenalty:boolean}>;variants:Record<string,{displayName:string;source:'STOCK'|'HULL';goalVariant:boolean;groupSpecs:OriginalCreatedVariant['groupSpecs'];defaultHullModulesPending:boolean}>;names:{groups:Record<string,string[]>;all:string[]};factions:Record<string,{prefix:string;entries:{item:string;weight:number}[]}>}
export const ORIGINAL_FLEET_MEMBERS:Readonly<OriginalFleetMemberReference>;
export function originalFleetStockVariant(factory:OriginalFleetMemberFactory,id:string):OriginalCreatedVariant;
export function createOriginalFleetMemberFactory(mathRandom:OriginalJavaRandomState):OriginalFleetMemberFactory;
export function createOriginalFleetMember(factory:OriginalFleetMemberFactory,player:OriginalPlayerEconomyState,specId:string,type?:'SHIP'|'FIGHTER_WING',plugins?:OriginalMemberEffectPlugins):OriginalCreatedFleetMember;
export function createOriginalNullFleetMember(factory:OriginalFleetMemberFactory,player:OriginalPlayerEconomyState):OriginalCreatedNullFleetMember;
export function setOriginalFleetMemberName(member:OriginalCreatedFleetMember,name:string|null):void;
export function originalConstructedMemberHullSize(member:OriginalNativeFleetMember):number;
export function originalConstructedMemberHints(member:OriginalNativeFleetMember):readonly string[];
export function originalConstructedMemberCivilian(member:OriginalNativeFleetMember):boolean;
export function createOriginalFleetNaming(prefix:string|null,sourceFactionId:string|null,reference?:OriginalFleetMemberReference):OriginalFleetNaming;
export function pickOriginalShipName(factory:OriginalFleetMemberFactory,member:OriginalCreatedFleetMember|null,random:OriginalJavaRandomState|null,prefix:string|null,source:string|null):string;
export function pickOriginalShipNameFromAll(factory:OriginalFleetMemberFactory,member:OriginalCreatedFleetMember|null,prefix:string|null):string;
export function pickOriginalFleetShipName(factory:OriginalFleetMemberFactory,naming:OriginalFleetNaming,member:OriginalCreatedFleetMember,random:OriginalJavaRandomState|null):string;
export function pickOriginalFleetMemberNameOnAdd(factory:OriginalFleetMemberFactory,naming:OriginalFleetNaming,member:OriginalNativeFleetMember,random:OriginalJavaRandomState|null):string;
export function validateOriginalFleetNaming(naming:OriginalFleetNaming):OriginalFleetNaming;
export function validateOriginalFleetMemberFactory(factory:OriginalFleetMemberFactory,player:OriginalPlayerEconomyState|null,mathRandom:OriginalJavaRandomState):OriginalFleetMemberFactory;
export function originalFleetMemberConstructionServices(factory:OriginalFleetMemberFactory,player:OriginalPlayerEconomyState,naming:OriginalFleetNaming|null,plugins?:OriginalMemberEffectPlugins):Pick<OriginalFleetCompositionServices<OriginalCreatedFleetMember>,'createMember'|'pickShipName'|'setShipName'|'memberFP'|'memberCivilian'|'memberHullSize'|'memberHints'>;
