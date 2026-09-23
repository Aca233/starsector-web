import {parseFactionText} from '../import-campaign-factions.mjs';
import {restoreOriginalSavedSkillOrder,originalPersonDefaultAfterReadResolve,readOriginalAdministrator} from '../../src/campaign/rules/OriginalAdministrator.mjs';
import {ORIGINAL_CHARACTER_INDUSTRY_STATS} from '../../src/campaign/rules/OriginalCharacterIndustryStats.mjs';
const ensure=(v,message)=>{if(!v)throw Error('NATIVE_SAVE_ADMINISTRATOR: '+message);};
function person(g,r,p){
 if(p===null)return null;
 ensure(!p.attributes.cl||p.attributes.cl==='Person','Unexpected administrator class');
 const stats=g.child(p,'stats');ensure(!stats?.attributes.cl||stats.attributes.cl==='CharacterStats','Unexpected administrator stats class');
 ensure(!g.child(stats,'skills'),'Skill list is transient; serialized s must be decoded');
 const s=r.value(stats,'s'),raw=s===null?{}:parseFactionText(s,'CharacterStats.s');
 ensure(raw!==null&&typeof raw==='object'&&!Array.isArray(raw),'Expected saved skill JSON object');
 const savedSkills=restoreOriginalSavedSkillOrder(Object.entries(raw).map(([skillId,level])=>({skillId,level})));
 const spr=g.child(p,'spr');ensure(!(spr&&Object.hasOwn(p.attributes,'spr')),'Ambiguous portrait capture');
 const portrait=Object.hasOwn(p.attributes,'spr')?p.attributes.spr:spr?.text??null;
 return {objectRef:r.ref(p),statsRef:stats?r.ref(stats):null,isDefault:originalPersonDefaultAfterReadResolve(portrait),aiCoreId:r.value(p,'aiCoreId'),savedSkills};
}
export function captureNativeAdministrator(g,r,m){
 const input={playerOwned:r.value(m,'playerOwned',true)==='true',administrator:person(g,r,g.child(m,'admin')),player:person(g,r,g.child(g.child(g.root,'characterData'),'person'))};
 readOriginalAdministrator(input);
 const marketModifiers=dynamicModifiers(g,r,g.child(m,'stats'),{combatFleetSize:'combat_fleet_size_mult',groundDefenses:'ground_defenses_mod'});
 const character=p=>{const stats=g.child(p,'stats');return stats?dynamicModifiers(g,r,stats,ORIGINAL_CHARACTER_INDUSTRY_STATS.keys):null;};
 return {input,marketModifiers,characterIndustryModifiers:{administrator:character(g.child(m,'admin')),player:character(g.child(g.child(g.root,'characterData'),'person'))}};
}
function dynamicModifiers(g,r,stats,keys){
 const mods=g.child(g.child(stats,'dynamic'),'mods'),captured=Object.fromEntries(Object.keys(keys).map(k=>[k,null])),seen=new Set();
 for(const e of r.members(mods)){
  ensure(e.name==='e'&&e.children.length===2,'Invalid market dynamic modifier map');const key=g.resolve(e.children[0]).text.trim();
  const target=Object.keys(keys).find(k=>keys[k]===key);
  if(target){ensure(!seen.has(key),'Duplicate governed dynamic modifier');seen.add(key);const value=g.resolve(e.children[1]);ensure((value.attributes.cl??value.name)==='SBonus','Expected audited StatBonus map value, not MutableStat or an unknown alias');captured[target]=r.bonus(value);}
 }
 return captured;
}
