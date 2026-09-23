import type {OriginalStorageVariant,OriginalVariantEffects} from './OriginalStorage.mjs';
export type OriginalVariantSource = 'STOCK'|'MISSION_DESIGN'|'MISSION_SAVE'|'REFIT'|'HULL'|null;
/** Stable canonical hull object. A replacement service must retain this identity across reads. */
export interface OriginalEmptyVariantHull {
 readonly hullId:string;
 readonly builtInWeapons:Readonly<Record<string,string>>;
 readonly builtInMods:readonly string[];
 readonly builtInWings:readonly string[];
 readonly slots:Readonly<Record<string,string>>;
}
export interface OriginalModuleHullRestoration {
 hullId:string;isDefaultDHull:boolean;isRestoreToBase:boolean;dParentHullId:string|null;baseHullId:string|null;
}
export interface OriginalVariantObject extends OriginalStorageVariant {
 hullVariantId:string;displayName:string;variantSource:OriginalVariantSource;
 effects:OriginalVariantEffects;
 hullSpec?:OriginalEmptyVariantHull;
 sourceDetail?:string|null;sourcePath?:string|null;
 goalVariant?:boolean;mayAutoAssignWeapons?:boolean;originalVariant?:string|null;
 groupSpecs?:{type:string|null;autofire:boolean;slots:string[]}[];
 /** Absent on old projections = unknown, never inferred as 16 for a retained override map. */
 moduleVariantMapCapacity?:number|null;
 savedModuleVariants?:[string,OriginalStorageVariant][]|null;
}
export interface OriginalEmptyVariant extends OriginalVariantObject {
 hullSpec:OriginalEmptyVariantHull;sourceDetail:string|null;sourcePath:string|null;
 goalVariant:boolean;mayAutoAssignWeapons:boolean;originalVariant:string|null;
 groupSpecs:{type:string|null;autofire:boolean;slots:string[]}[];
 moduleVariants:[string,OriginalStorageVariant][]|null;moduleVariantMapCapacity:number|null;
 savedModuleVariants:[string,OriginalStorageVariant][]|null;
}
export interface OriginalEmptyVariantServices {
 readEmptyVariantHull?(hullId:string):OriginalEmptyVariantHull;
 /** Resolves the actual weapon spec; its canonical ID may differ from the lookup alias. */
 readEmptyVariantWeaponId?(weaponId:string):string;
 readEmptyVariantText?(kind:'standard'|'custom'):string;
}
export interface OriginalVariantModuleServices<Variant extends OriginalStorageVariant=OriginalVariantObject> extends OriginalEmptyVariantServices {
 /** Return the same registered object, not a fresh copy. Explicit null means absent; undefined rejects. */
 readRegisteredVariant?(variantId:string):Variant|null;
}
export interface OriginalDefaultHullModuleServices extends OriginalEmptyVariantServices {
 /** B.keySet snapshot after ordinary variants, before mission variants; no sorted/JSON surrogate. */
 readVariantRegistryOrder():string[];
 readRegisteredVariant(variantId:string):OriginalStorageVariant|null;
 readModuleHullRestoration(hullId:string):OriginalModuleHullRestoration;
}
export function originalEmptyVariantHull(hullId:string,services?:OriginalEmptyVariantServices):OriginalEmptyVariantHull;
/** objectRef must be allocated by the caller's persistent WEB object allocator, NOT native Sector UID. */
export function createOriginalEmptyVariant(objectRef:string,hullVariantId:string,hullId:string,services?:OriginalEmptyVariantServices):OriginalEmptyVariant;
/** Constructor stage, not automatic registration or completed default-module initialization. */
export function createOriginalRegisteredHullVariant(objectRef:string,hullId:string,services?:OriginalEmptyVariantServices):OriginalEmptyVariant;
export function originalVariantIsStock(variant:OriginalStorageVariant):boolean;
export function originalVariantIsEmptyHull(variant:OriginalStorageVariant,services?:OriginalEmptyVariantServices):boolean;
export function originalVariantOriginalId(variant:OriginalStorageVariant,services:{isVariantRegistered(id:string):boolean}):string|null;
export function originalVariantModuleSlots(variant:OriginalStorageVariant,services?:OriginalEmptyVariantServices):string[];
export function originalVariantModule<Variant extends OriginalStorageVariant>(variant:Variant,slotId:string,services?:OriginalVariantModuleServices<Variant>):Variant|null;
export function setOriginalVariantModule(variant:OriginalStorageVariant,slotId:string,module:OriginalStorageVariant|null):void;
/** Deep override/group/effects clone; shallow hullSpec, savedModuleVariants and OP cache references. */
export function cloneOriginalModuleVariant<Variant extends OriginalStorageVariant>(variant:Variant,objectRef:string):Variant;
export function originalDefaultModuleHullId(hull:OriginalModuleHullRestoration):string;
export function initializeOriginalDefaultHullModules(services:OriginalDefaultHullModuleServices):{scope:'native-default-hull-modules';templates:number;assigned:number};

export interface OriginalEmptyVariantFactoryServices {
 readInflaterStockVariant(id:string):OriginalVariantObject;
 createInflaterEmptyVariant(id:string,hullId:string):OriginalEmptyVariant;
 readModuleVariant<Variant extends OriginalStorageVariant>(variant:Variant,slotId:string):Variant|null;
 cloneVariant<Variant extends OriginalStorageVariant>(variant:Variant):Variant;
 setModuleVariant(variant:OriginalStorageVariant,slotId:string,module:OriginalStorageVariant|null):void;
}
/** Existing stockVariants cache stays the sole registry; pending default hulls keep their current refusal. */
export function originalEmptyVariantFactoryServices(
 memberFactory:import('./OriginalFleetMembers.mjs').OriginalFleetMemberFactory,
 allocateObjectRef:()=>string,
 services?:OriginalVariantModuleServices<OriginalStorageVariant>,
):OriginalEmptyVariantFactoryServices;
