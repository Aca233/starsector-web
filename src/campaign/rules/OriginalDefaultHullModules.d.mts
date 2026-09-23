import type {DeepReadonly} from '../Types.js';
export interface OriginalDefaultHullRegistryState {scope:'native-default-hull-registry';origin:'new-web-current-member-factory';referenceId:string}
export interface OriginalHullRestoration {hullId:string;isDefaultDHull:boolean;isRestoreToBase:boolean;dParentHullId:string|null;baseHullId:string|null;defaultModuleHullId:string}
export interface OriginalDefaultHullVariantRecipe {hullId:string;displayName:string;initialDisplayName:string;stationModules:[string,string][];templateId:string|null;registryIndex:number}
export interface OriginalDefaultHullModulesReference {
 schemaVersion:1;originalReference:string;scope:'public-core-new-registry-default-hull-modules-not-saved-class-history';oracleMethod:string;referenceId:string;
 registryOrder:string[];registrationEvents:[string,string,string][];legacyIds:string[];
 hullRestoration:Record<string,OriginalHullRestoration>;hullVariants:Record<string,OriginalDefaultHullVariantRecipe>;sources:Record<string,{sha256:string}>;
}
export const ORIGINAL_DEFAULT_HULL_MODULES:DeepReadonly<OriginalDefaultHullModulesReference>;
export function createOriginalDefaultHullRegistryState():OriginalDefaultHullRegistryState;
export function validateOriginalDefaultHullRegistryState(state:OriginalDefaultHullRegistryState):OriginalDefaultHullRegistryState;
export function originalDefaultHullVariantRecipe(id:string):DeepReadonly<OriginalDefaultHullVariantRecipe>|null;
export function originalHullRestoration(id:string):Readonly<OriginalHullRestoration>;
