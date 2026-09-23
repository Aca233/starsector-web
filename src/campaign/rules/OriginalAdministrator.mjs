import raw from '../data/reference-administrators.json' with {type:'json'};
import {ORIGINAL_GOVERNED_SKILLS} from './OriginalGovernedSkills.mjs';
import {immutableJSON,requireThat,identifier,canonicalJSON} from '../core/Values.mjs';
import {economyShape,economyFloat} from './OriginalMarketEconomy.mjs';
export const ORIGINAL_ADMINISTRATORS=immutableJSON(raw);
const R=ORIGINAL_ADMINISTRATORS,check=(v,message)=>requireThat(v,'UNSUPPORTED_NATIVE_ADMINISTRATOR',message);
const ref=value=>check(typeof value==='string'&&/^\d+$/.test(value)&&value.length<=256,'Expected saved identity');
function hash(s){let h=0;for(let i=0;i<s.length;i++)h=(Math.imul(31,h)+s.charCodeAt(i))|0;return (h^(h>>>16))>>>0;}
/** Exact JSONObject.getNames ordering only for the audited closed set of 58 loaded skill IDs. */
export function restoreOriginalSavedSkillOrder(entries){
 check(Array.isArray(entries)&&entries.length<=R.knownSkillIds.length,'Expected bounded serialized skills');const seen=new Set();
 const result=entries.map(e=>{economyShape(e,['skillId','level'],'saved skill');identifier(e.skillId);check(R.knownSkillIds.includes(e.skillId)&&!seen.has(e.skillId),'Unknown/unloaded or duplicate saved skill');seen.add(e.skillId);economyFloat(e.level,'saved skill level',-65536,65536);return {skillId:e.skillId,level:Math.fround(e.level)};});
 let capacity=16;while(result.length>capacity*0.75)capacity*=2;
 // All possible buckets stay below treeification for this closed key set; resize preserves chain order.
 return immutableJSON(result.sort((a,b)=>(hash(a.skillId)&(capacity-1))-(hash(b.skillId)&(capacity-1))));
}
export function originalPersonDefaultAfterReadResolve(portrait){check(portrait===null||typeof portrait==='string'&&portrait.length<=4096,'Invalid captured portrait');return (portrait??R.defaultPortrait)===R.defaultPortrait;}
function person(p){
 if(p===null)return;
 economyShape(p,['objectRef','statsRef','isDefault','aiCoreId','savedSkills'],'saved administrator person');ref(p.objectRef);if(p.statsRef!==null)ref(p.statsRef);
 check(typeof p.isDefault==='boolean','Missing default portrait getter');if(p.aiCoreId!==null)identifier(p.aiCoreId);
 check(canonicalJSON(restoreOriginalSavedSkillOrder(p.savedSkills))===canonicalJSON(p.savedSkills),'Saved skill ordering/float capture is inconsistent');
 check(p.statsRef!==null||p.savedSkills.length===0,'Skills cannot originate from missing CharacterStats');
}
/** Plans native identity resolution only; does not mutate people/comm directories or run listeners. */
export function readOriginalAdministrator(input){
 economyShape(input,['playerOwned','administrator','player'],'native administrator identity');check(typeof input.playerOwned==='boolean','Missing ownership');person(input.administrator);person(input.player);
 if(input.administrator&&input.player&&input.administrator.objectRef===input.player.objectRef)check(canonicalJSON(input.administrator)===canonicalJSON(input.player),'Conflicting shared player/admin identity');
 const lifecycle=[];let selected=input.administrator,selection='existing';
 if(selected===null){lifecycle.push('create-default-person','set-default-admin','refresh-default-governed-effects');selection='default-creation-required';}
 if(input.playerOwned&&(selected===null||selected.isDefault)){
  check(input.player!==null,'Player administrator cannot be inferred without its actual Person capture');
  lifecycle.push('set-admin-null','assign-player-direct','refresh-player-governed-effects');selected=input.player;selection='player-default-replacement';
 }
 const governedIds=new Set(ORIGINAL_GOVERNED_SKILLS.effects.map(e=>e.skillId));
 return immutableJSON({scope:'administrator-identity-and-governed-skill-input-draft',selection,selectedPersonRef:selected?.objectRef??null,selectedStatsRef:selected?.statsRef??null,adminIsPlayer:selected?(input.player!==null&&input.player.objectRef===selected.objectRef):null,aiCoreId:selected?.aiCoreId??null,governedSkills:selected?selected.savedSkills.filter(s=>governedIds.has(s.skillId)):null,lifecycle,unresolved:['character-stats-aptitude-and-listener-refresh',...(selected&&selected.statsRef===null?['missing-character-stats-construction']:[]),...(lifecycle.length?['administrator-identity-lifecycle']:[])]});
}
