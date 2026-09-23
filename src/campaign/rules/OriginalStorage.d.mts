import type { DeepReadonly } from '../Types.js';
import type { OriginalConstructedCargo,OriginalConstructedFleetData } from './OriginalFleetDataFactory.mjs';
import type { OriginalResourceCargo,OriginalResourceStack,OriginalOpaqueCargoStack } from './OriginalResourceCargo.mjs';
export interface OriginalVariantEffects {hullMods:string[];permaMods:string[];sMods:string[];sModdedBuiltIns:string[];suppressedMods:string[];tags:string[];fluxVents:number;fluxCapacitors:number;stationModules:[string,string][]}
export interface OriginalStorageVariantInput {objectRef?:string;hullId:string;weapons:[string,string][];weaponGroups?:[string,string][][];wings:(string|null)[];effects?:OriginalVariantEffects|null;/** Absent = unknown historical map, null = native empty override map. */moduleVariants?:[string,OriginalStorageVariant][]|null}
export interface OriginalStorageVariant extends OriginalStorageVariantInput {objectRef:string;weaponMapCapacity:number;hasOpAffectingMods?:boolean|null;statsForOpCosts?:import('./OriginalFleetMemberStats.mjs').OriginalVariantShipStats|null}
export interface OriginalStoredMemberInput {objectRef:string;type:'SHIP'|'FIGHTER_WING'|'NULL';specId:string|null;savedVariant:OriginalStorageVariantInput|null;source?:unknown}
export interface OriginalStoredMember extends OriginalStoredMemberInput {variant:OriginalStorageVariant|null;valuationLifecycle:'null-member'|'wing-stats-required'|'no-wing-base-valuation'|'current-fleet-variant'|'unresolved'}
export interface OriginalStorageCargo extends OriginalResourceCargo {objectRef:string;unresolved:string[];mothballedShipsRef:string|null;mothballedShips?:OriginalConstructedFleetData|null}
export interface OriginalStorageState {scope:'native-storage-current-objects';pluginRef:string|null;classAlias:string|null;playerPaidToUnlock:boolean|null;factionId:string|null;factionRef:string|null;cargo:OriginalStorageCargo|null;mothballed:{objectRef:string;factionId:string|null;members:(OriginalStoredMember|null)[];unresolved:string[]}|OriginalConstructedFleetData|null;unresolved:string[]}
export interface OriginalStorageConstructorServices {createStorageCargo?(storage:OriginalStorageState):OriginalConstructedCargo;initializeStorageMothballedShips?(cargo:OriginalConstructedCargo,factionId:string):unknown}
export interface OriginalStorageDependencies extends OriginalStorageConstructorServices {readStorageFleetMembers?(fleet:OriginalConstructedFleetData):OriginalStoredMember[];readSpecialItemPrice?(stack:OriginalOpaqueCargoStack,market:null,submarket:null):number;readCurrentStoredVariant?(member:OriginalStoredMember):OriginalStorageVariant}
export const ORIGINAL_STORAGE:DeepReadonly<{schemaVersion:1;originalReference:string;scope:string;settings:Record<string,number>;weapons:Record<string,number>;wings:Record<string,{baseValue:number;variantId:string}>;hulls:Record<string,{hullId:string;baseValue:number;builtInWeapons:Record<string,string>;builtInWings:string[];builtInMods:string[]}>;variants:Record<string,OriginalStorageVariantInput>;sources:Record<string,{sha256:string}>;unsupportedHulls:{id:string;reason:string}[];duplicateHullSources:{id:string;ignoredEquivalentSource:string}[]}>;
export function setOriginalVariantWeapon(variant:OriginalStorageVariant,slotId:string,weaponId:string):void;
export function clearOriginalVariantWeapon(variant:OriginalStorageVariant,slotId:string):void;
export function setOriginalVariantWing(variant:OriginalStorageVariant,index:number,wingId:string|null):void;
export function restoreOriginalStorageVariant(input:OriginalStorageVariantInput,options?:{stock?:boolean}):Omit<OriginalStorageVariant,'objectRef'>;
export function cloneOriginalStorageVariant<Variant extends OriginalStorageVariant>(input:Variant,objectRef:string):Variant;
export function restoreOriginalStoredMember(member:OriginalStoredMemberInput):OriginalStoredMember;
export function originalStorageAccess(storage:OriginalStorageState):boolean;
export function ensureOriginalStorageCargo(storage:OriginalStorageState,services?:OriginalStorageConstructorServices):OriginalStorageCargo;
export function originalStorageStackBaseValue(stack:OriginalResourceStack|OriginalOpaqueCargoStack,dependencies?:OriginalStorageDependencies):number;
export function originalStoredMemberBaseValue(member:OriginalStoredMember,dependencies?:OriginalStorageDependencies):number;
export function originalStorageValues(storage:OriginalStorageState,dependencies?:OriginalStorageDependencies):{cargo:number;ships:number};
export function validateOriginalStorageState(storage:OriginalStorageState):void;
