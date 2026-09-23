import raw from '../data/reference-governed-skills.json' with { type:'json' };
import {immutableJSON,requireThat,identifier} from '../core/Values.mjs';
import {economyShape,economyFloat} from './OriginalMarketEconomy.mjs';
import {stat,put,blank} from './OriginalIndustryState.mjs';
export const ORIGINAL_GOVERNED_SKILLS=immutableJSON(raw);
const R=ORIGINAL_GOVERNED_SKILLS,check=(v,message)=>requireThat(v,'UNSUPPORTED_GOVERNED_SKILLS',message);
/** Native refreshGovernedOutpostEffects only. Character-stats skills/administrator selection are separate. */
export function reapplyOriginalGovernedSkills(input) {
 economyShape(input,['skills','state'],'governed market skills');
 economyShape(input.state,['accessibility','stability','combatFleetSize','groundDefenses'],'governed skill market state');
 stat(input.state.stability);stat({base:0,modifiers:input.state.accessibility});
 for(const key of ['combatFleetSize','groundDefenses'])if(input.state[key]!==null)stat({base:0,modifiers:input.state[key]});
 check(Array.isArray(input.skills)&&input.skills.length<=128,'Expected actual ordered administrator skill list');
 const seen=new Set();
 for(const skill of input.skills){economyShape(skill,['skillId','level'],'administrator skill');identifier(skill.skillId);check(R.knownSkillIds.includes(skill.skillId)&&!seen.has(skill.skillId),'Unknown, unloaded or duplicate skill');seen.add(skill.skillId);economyFloat(skill.level,'native skill level',-65536,65536);check(Math.fround(skill.level)===skill.level,'Skill level must retain native float precision');}
 const state=structuredClone(input.state),applied=[];
 const callback=(effect,remove)=>{
  const {target,channel,value}=effect.operation,id=effect.skillId+'_GO_'+effect.index;
  if(state[target]===null)state[target]=blank().modifiers;
  put(target==='stability'?state.stability:{modifiers:state[target]},channel,id,value,remove);
  if(!remove)applied.push(id);
 };
 // Every loaded effect unapplies, including skills this administrator has never possessed.
 // These eight callbacks own distinct IDs/channels; cleanup cache order is numerically independent.
 for(const effect of R.effects)callback(effect,true);
 for(const skill of input.skills)for(const effect of R.effects)if(effect.skillId===skill.skillId&&skill.level>=effect.requiredLevel)callback(effect,false);
 stat(state.stability);for(const key of ['accessibility','combatFleetSize','groundDefenses'])stat({base:0,modifiers:state[key]});
 return immutableJSON({scope:'governed-market-skill-stat-effects-only',state,execution:{unapplied:R.effects.length,applied}});
}
