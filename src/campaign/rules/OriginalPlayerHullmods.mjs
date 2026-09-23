/** Actual CharacterStats -> CampaignUI -> Faction player hullmod knowledge, independent of UI presentation. */
import R from '../data/reference-player-hullmods.json' with {type:'json'};
import {requireThat} from '../core/Values.mjs';
import {createOriginalJavaStringSet,validateOriginalJavaStringSet,addOriginalJavaStringSet,removeOriginalJavaStringSet} from './OriginalJavaStringSet.mjs';
const check=(ok,message)=>requireThat(ok,'UNSUPPORTED_NATIVE_PLAYER_HULLMODS',message);
function call(s,key,...args){check(typeof s[key]==='function','Actual player hullmod service required: '+key);const result=s[key](...args);check(!result||typeof result.then!=='function','Player hullmod services must be synchronous');return result;}
function defaults(services){return {readSkillHullmodEffects:id=>{check(Object.hasOwn(R.skills,id),'Actual registered skill unlocks required: '+id);return R.skills[id];},readPlayerHullmodSpecs:()=>R.hullmods,...services};}
export function originalCharacterHullmodUnlocks(stats,services={}){
 check(Array.isArray(stats?.skills),'Actual current character skills required');const s=defaults(services),levels=new Map();for(const row of stats.skills){check(typeof row.skillId==='string'&&typeof row.level==='number'&&Number.isFinite(row.level)&&Math.fround(row.level)===row.level&&!levels.has(row.skillId),'Actual unique skill levels required');levels.set(row.skillId,row.level);}
 const result=[];for(const row of stats.skills){const effects=call(s,'readSkillHullmodEffects',row.skillId);check(Array.isArray(effects),'Actual skill hullmod-unlock effects required');for(const effect of effects){const level=levels.get(effect.governingSkill)??0;if(!(level>0)||effect.unlocks===null)continue;check(Array.isArray(effect.unlocks),'Actual nullable hullmod-unlock list required');for(const entry of effect.unlocks){check(typeof entry.id==='string'&&Number.isInteger(entry.level),'Actual hullmod unlock ID and level required');if(entry.level<=level)result.push(entry.id);}}}return result;
}
export function originalPlayerAvailableHullmods(character,services={}){
 const result=createOriginalJavaStringSet();if(character===null||character.player===null)return result.entries;
 const s=defaults(services);for(const id of originalCharacterHullmodUnlocks(character.player?.stats,s))addOriginalJavaStringSet(result,id);
 const specs=call(s,'readPlayerHullmodSpecs');check(Array.isArray(specs),'Actual ordered HullModSpec roster required');for(const spec of specs){check(typeof spec?.id==='string'&&typeof spec.hidden==='boolean'&&typeof spec.alwaysUnlocked==='boolean','Actual hullmod unlock/hidden metadata required');if(!result.entries.includes(spec.id)&&!spec.hidden&&spec.alwaysUnlocked)addOriginalJavaStringSet(result,spec.id);}
 check(Object.hasOwn(character,'hullMods'),'Actual PlayerCharacterData hullMods history required');for(const id of validateOriginalJavaStringSet(character.hullMods).entries)addOriginalJavaStringSet(result,id);return result.entries;
}
export function originalPlayerFactionHullmods(character,services={}){return createOriginalJavaStringSet(originalPlayerAvailableHullmods(character,services),true).entries;}
export function addOriginalPlayerHullmod(character,id){check(character&&Object.hasOwn(character,'hullMods'),'Actual PlayerCharacterData hullMods history required');addOriginalJavaStringSet(character.hullMods,id);}
export function removeOriginalPlayerHullmod(character,id){check(character&&Object.hasOwn(character,'hullMods'),'Actual PlayerCharacterData hullMods history required');removeOriginalJavaStringSet(character.hullMods,id);}
