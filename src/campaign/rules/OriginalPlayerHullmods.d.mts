import type {OriginalPlayerEconomyState} from './OriginalPlayerEconomy.mjs';
export interface OriginalSkillHullmodEffect {governingSkill:string;requiredLevel?:number;unlocks:{id:string;level:number}[]|null}
export interface OriginalPlayerHullmodServices {readSkillHullmodEffects?(id:string):OriginalSkillHullmodEffect[];readPlayerHullmodSpecs?():{id:string;hidden:boolean;alwaysUnlocked:boolean}[]}
export function originalCharacterHullmodUnlocks(stats:{skills:{skillId:string;level:number}[]},services?:OriginalPlayerHullmodServices):string[];
export function originalPlayerAvailableHullmods(character:OriginalPlayerEconomyState|null,services?:OriginalPlayerHullmodServices):string[];
export function originalPlayerFactionHullmods(character:OriginalPlayerEconomyState|null,services?:OriginalPlayerHullmodServices):string[];
export function addOriginalPlayerHullmod(character:OriginalPlayerEconomyState,id:string):void;
export function removeOriginalPlayerHullmod(character:OriginalPlayerEconomyState,id:string):void;
