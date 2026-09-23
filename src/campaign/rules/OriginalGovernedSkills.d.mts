import type {DeepReadonly} from '../Types.js';
import type {EconomyMutable,EconomyBonus} from './OriginalMarketEconomy.mjs';
export interface OriginalGovernedSkill {skillId:string;level:number}
export interface OriginalGovernedSkillState {accessibility:EconomyBonus;stability:EconomyMutable;combatFleetSize:EconomyBonus|null;groundDefenses:EconomyBonus|null}
export interface OriginalGovernedSkillsCapture {skills:OriginalGovernedSkill[];combatFleetSize:EconomyBonus|null;groundDefenses:EconomyBonus|null}
export interface OriginalGovernedSkillsResult {scope:'governed-market-skill-stat-effects-only';state:OriginalGovernedSkillState;execution:{unapplied:number;applied:string[]}}
export const ORIGINAL_GOVERNED_SKILLS:DeepReadonly<{schemaVersion:1;originalReference:string;scope:string;sources:Record<string,{sha256:string}>;knownSkillIds:string[];effects:{skillId:string;index:number;requiredLevel:number;script:string;operation:{target:'accessibility'|'stability'|'combatFleetSize'|'groundDefenses';channel:'flat'|'mult';value:number}}[]}>;
export function reapplyOriginalGovernedSkills(input:DeepReadonly<{skills:OriginalGovernedSkill[];state:OriginalGovernedSkillState}>):DeepReadonly<OriginalGovernedSkillsResult>;
