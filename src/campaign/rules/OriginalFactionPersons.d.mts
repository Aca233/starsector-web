import type {OriginalPlayerEconomyState,OriginalPayrollPerson} from './OriginalPlayerEconomy.mjs';
import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
import type {DeepReadonly} from '../Types.js';
export type OriginalPersonGender='MALE'|'FEMALE';
export type OriginalPersonImportance='VERY_LOW'|'LOW'|'MEDIUM'|'HIGH'|'VERY_HIGH';
export interface OriginalPersonPicker {items:string[];weights:number[];total:number;random:OriginalJavaRandomState|null}
export interface OriginalPersonNameTable {order:string[];lists:Record<string,string[]>}
export interface OriginalFactionPersonInputs {nameCategories:OriginalPersonPicker;portraits:Record<OriginalPersonGender,OriginalPersonPicker>;voices:Record<'LOW'|'MEDIUM'|'HIGH',OriginalPersonPicker>}
export interface OriginalFactionPersonReference {schemaVersion:1;originalReference:string;scope:string;sources:Record<string,{sha256:string}>;rows:number;names:Record<OriginalPersonGender,Record<'FIRST'|'LAST',OriginalPersonNameTable>>;factions:Record<string,OriginalFactionPersonInputs>}
export interface OriginalFactionPersonFactory {scope:'native-current-faction-person-factory';names:OriginalFactionPersonReference['names'];factions:OriginalFactionPersonReference['factions'];generated:OriginalPayrollPerson[];random:{scope:'web-new-java-random-seeds';sourceSha256:string;newRandomSeeds:OriginalJavaRandomState;mathRandom:OriginalJavaRandomState}}
export interface OriginalFactionPersonOptions {gender?:OriginalPersonGender|'ANY'|null;random?:OriginalJavaRandomState|null;isInSectorGen:boolean}
export const ORIGINAL_FACTION_PERSONS:DeepReadonly<OriginalFactionPersonReference>;
export function createOriginalFactionPersonFactory(sourceSha256:string,mathRandom:OriginalJavaRandomState,reference?:OriginalFactionPersonReference|DeepReadonly<OriginalFactionPersonReference>):OriginalFactionPersonFactory;
export function pickOriginalFactionPersonName(factory:OriginalFactionPersonFactory,factionId:string,gender:OriginalPersonGender,random?:OriginalJavaRandomState|null):{first:string;last:string;gender:OriginalPersonGender};
export function pickOriginalFactionVoice(factory:OriginalFactionPersonFactory,factionId:string,importance:OriginalPersonImportance,random?:OriginalJavaRandomState|null):string|null;
export function createOriginalFactionPerson(factory:OriginalFactionPersonFactory,player:OriginalPlayerEconomyState,factionId:string,options:OriginalFactionPersonOptions):OriginalPayrollPerson;
export function validateOriginalFactionPersonFactory(factory:OriginalFactionPersonFactory,player:OriginalPlayerEconomyState|null,mathRandom:OriginalJavaRandomState):OriginalFactionPersonFactory;
