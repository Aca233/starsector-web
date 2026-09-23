import raw from '../data/reference-character-industry-stats.json' with {type:'json'};
import {immutableJSON,requireThat,identifier} from '../core/Values.mjs';
import {economyShape,economyFloat} from './OriginalMarketEconomy.mjs';
import {stat,put,blank} from './OriginalIndustryState.mjs';
export const ORIGINAL_CHARACTER_INDUSTRY_STATS=immutableJSON(raw);
const R=ORIGINAL_CHARACTER_INDUSTRY_STATS,check=(v,message)=>requireThat(v,'UNSUPPORTED_CHARACTER_INDUSTRY_STATS',message);
export function validateOriginalCharacterIndustryModifiers(modifiers){
 economyShape(modifiers,Object.keys(R.keys),'captured character industry modifiers');
 for(const value of Object.values(modifiers))if(value!==null)stat({base:0,modifiers:value});
}
/** DynamicStats.getValue(key, 0): absent mods do not get created, stats namespace is irrelevant. */
export function readOriginalAdministratorIndustryInputs(modifiers){
 validateOriginalCharacterIndustryModifiers(modifiers);
 const get=key=>modifiers[key]===null?0:stat({base:0,modifiers:modifiers[key]});
 return immutableJSON({adminSupplyBonus:get('supplyBonus'),adminDemandReduction:get('demandReduction'),adminFuelSupplyBonus:get('fuelSupplyBonus')});
}
/** Only the audited four-channel projection of refreshCharacterStatsEffects; no listeners/fleet/world mutation. */
export function reapplyOriginalCharacterIndustryStats(input){
 economyShape(input,['skills','modifiers','skipRefresh'],'character industry stat projection');
 check(typeof input.skipRefresh==='boolean','Explicit native skipRefresh state is required');validateOriginalCharacterIndustryModifiers(input.modifiers);
 check(Array.isArray(input.skills)&&input.skills.length<=R.knownSkillIds.length,'Expected actual ordered skills');const seen=new Set();
 for(const s of input.skills){economyShape(s,['skillId','level'],'character skill');identifier(s.skillId);check(R.knownSkillIds.includes(s.skillId)&&!seen.has(s.skillId),'Unknown/unloaded or duplicate skill');seen.add(s.skillId);economyFloat(s.level,'skill level',-65536,65536);check(Math.fround(s.level)===s.level,'Skill levels must retain native float precision');}
 const modifiers=structuredClone(input.modifiers),applied=[];
 const callback=(effect,remove)=>{const {target,channel,value}=effect.operation;const id=effect.skillId+'_stats_'+effect.index;if(modifiers[target]===null)modifiers[target]=blank().modifiers;put({modifiers:modifiers[target]},channel,id,value,remove);if(!remove)applied.push(id);};
 if(!input.skipRefresh){for(const effect of R.effects)callback(effect,true);for(const s of input.skills)for(const effect of R.effects)if(effect.skillId===s.skillId&&s.level>=effect.requiredLevel)callback(effect,false);}
 validateOriginalCharacterIndustryModifiers(modifiers);
 return immutableJSON({scope:'character-industry-stat-projection-only',modifiers,industryInputs:readOriginalAdministratorIndustryInputs(modifiers),execution:{skipped:input.skipRefresh,unapplied:input.skipRefresh?0:R.effects.length,applied},unresolved:['full-character-stats-fleet-aptitude-and-listener-refresh']});
}
