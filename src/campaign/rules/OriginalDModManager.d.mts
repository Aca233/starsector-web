import type {DeepReadonly} from '../Types.js';
import type {OriginalStorageVariant} from './OriginalStorage.mjs';
import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
import type {OriginalEmptyVariantHull} from './OriginalEmptyVariants.mjs';
export interface OriginalDModHull extends OriginalEmptyVariantHull {hullId:string;hints:readonly string[];tags:readonly string[];phase:boolean;shieldType:string;fighterBays:number;noCRLossTime:number;isDefaultDHull:boolean;isRestoreToBase:boolean;dParentHullId:string|null;baseHullId:string|null}
export interface OriginalDModSpec {id:string;tags:readonly string[]}
export interface OriginalDModClassState {scope:'native-dmod-class-state';reduceNextDmodsBy:number;assumeAllShipsAreAutomated:boolean;maxDModsFromCombat:number}
export interface OriginalDModAdderParams {variant:OriginalStorageVariant;destroyed:boolean;own:boolean;canAddDestroyedMods:boolean;num:number;recoverer:object|null;random:OriginalJavaRandomState}
export interface OriginalDModServices {readDModHull?(hullId:string):OriginalDModHull;readDModSpecs?():readonly OriginalDModSpec[];createDModRandom?():OriginalJavaRandomState;pickDModAdderPlugin?(params:OriginalDModAdderParams):object|null;runDModAdderPlugin?(plugin:object,params:OriginalDModAdderParams):void;readDModRecoveryReduction?(recoverer:object):number}
export const ORIGINAL_DMODS:DeepReadonly<{schemaVersion:1;scope:string;originalReference:string;maxDModsAddedByCombat:number;hulls:Record<string,OriginalDModHull>;mods:OriginalDModSpec[]}>;
export const ORIGINAL_DMOD_ADDER_TYPE:'com.fs.starfarer.api.plugins.DModAdderPlugin';
export function createOriginalDModClassState():OriginalDModClassState;
export function validateOriginalDModClassState(state:OriginalDModClassState):OriginalDModClassState;
export function originalDModCount(variant:OriginalStorageVariant,tags?:string[],services?:OriginalDModServices):number;
export function originalNonBuiltInDModCount(variant:OriginalStorageVariant,services?:OriginalDModServices):number;
export function setOriginalDHull(variant:OriginalStorageVariant,services?:OriginalDModServices):boolean;
export function removeOriginalDMod(variant:OriginalStorageVariant,id:string,services?:OriginalDModServices):void;
export function addOriginalDMods(variant:OriginalStorageVariant,canAddDestroyedMods:boolean,num:number,random:OriginalJavaRandomState|null,state:OriginalDModClassState,services:OriginalDModServices):void;
export function addOriginalCombatDMods(variant:OriginalStorageVariant,destroyed:boolean,own:boolean,recoverer:object|null,random:OriginalJavaRandomState|null,state:OriginalDModClassState,services:OriginalDModServices):void;
