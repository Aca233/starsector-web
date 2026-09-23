import type {DeepReadonly} from '../Types.js';
import type {OriginalGovernedSkill} from './OriginalGovernedSkills.mjs';
export const ORIGINAL_ADMINISTRATORS:DeepReadonly<{schemaVersion:1;originalReference:string;scope:string;sources:Record<string,{sha256:string}>;defaultPortrait:string;javaVersion:string;bucketBounds:{capacity:number;max:number}[];knownSkillIds:string[]}>;
export interface OriginalAdministratorPerson {objectRef:string;statsRef:string|null;isDefault:boolean;aiCoreId:string|null;savedSkills:OriginalGovernedSkill[]}
export interface OriginalAdministratorInput {playerOwned:boolean;administrator:OriginalAdministratorPerson|null;player:OriginalAdministratorPerson|null}
export interface OriginalAdministratorReadback {scope:'administrator-identity-and-governed-skill-input-draft';selection:'existing'|'default-creation-required'|'player-default-replacement';selectedPersonRef:string|null;selectedStatsRef:string|null;adminIsPlayer:boolean|null;aiCoreId:string|null;governedSkills:OriginalGovernedSkill[]|null;lifecycle:string[];unresolved:string[]}
export function restoreOriginalSavedSkillOrder(entries:DeepReadonly<OriginalGovernedSkill[]>):DeepReadonly<OriginalGovernedSkill[]>;
export function originalPersonDefaultAfterReadResolve(portrait:string|null):boolean;
export function readOriginalAdministrator(input:DeepReadonly<OriginalAdministratorInput>):DeepReadonly<OriginalAdministratorReadback>;
