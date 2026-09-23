import {originalExperienceLong} from '../../src/campaign/rules/OriginalCharacterExperience.mjs';
/** Read-only native CharacterStats inputs, with shared mutable targets and actual listener registrations. */
import {captureNativeTopographyEvent,captureNativeTopographyWorld} from './campaign-native-topography.mjs';
import R from '../../src/campaign/data/reference-fleet-sync.json' with {type:'json'};
import {parseFactionText} from '../import-campaign-factions.mjs';
import {createOriginalCharacterStats,restoreOriginalCharacterStats} from '../../src/campaign/rules/OriginalNativeCharacterStats.mjs';
const check=(v,m)=>{if(!v)throw Error('NATIVE_CHARACTER_CAPTURE: '+m);};
export function captureNativeCharacterStats(g,r,node,sharedTargets=new Map()){
 const s=createOriginalCharacterStats(r.ref(node));
 const fields={xp:'xp',bonusXp:'bx',deferredBonusXp:'db',xpAtLastStoryPointGain:'x2',points:'pt',storyPoints:'sp',level:'l'},saved=Object.fromEntries(Object.entries(fields).map(([key,alias])=>[key,r.attr(node,alias)]));
 // Salary-only legacy captures may lack these fields. Never silently initialize those XP values to zero.
 if(Object.values(saved).every(v=>v!==null)){for(const key of ['xp','bonusXp','deferredBonusXp','xpAtLastStoryPointGain']){originalExperienceLong(saved[key]);s[key]=saved[key];}for(const key of ['points','storyPoints','level']){const n=Number(saved[key]);check(saved[key]!==''&&Number.isInteger(n)&&n>=-2147483648&&n<=2147483647,'Invalid character '+key);s[key]=n;}s.nativeExperienceVersion=1;s.bonusXPGainReason=null;s.onlyAddBonusXPDoNotSpendStoryPoints=false;}

 const target=(n,kind)=>{const ref=r.ref(n);if(sharedTargets.has(ref)){const t=sharedTargets.get(ref);check(t.kind===kind,'Shared character target kind mismatch');return t;}
  const value=kind==='mutable'?r.stat(n):null,t={objectRef:ref,kind,value:value?value.state:r.bonus(n),temporary:value?.temporary??[],descriptions:{flat:{},percent:{},mult:{}}};
  for(const [i,channel]of ['flat','percent','mult'].entries())for(const child of n.children.filter(c=>c.name===(kind==='mutable'?['fMs','pMs','mMs']:['fBs','pBs','mBs'])[i])){const mod=g.resolve(child),desc=r.attr(mod,'d')??r.value(mod,'d');if(desc!==null)t.descriptions[channel][mod.attributes.s]=desc;}
  sharedTargets.set(ref,t);return t;
 };
 const add=t=>{if(!s.targets.some(old=>old.objectRef===t.objectRef))s.targets.push(t);};
 // readResolve discards every other saved scalar stat, but preserves these two when non-null.
 for(const key of ['repairRateMult','commandPoints']){const n=g.child(node,key);if(n){const t=target(n,'mutable');s[key]=t.value;s.fields[key]=t.objectRef;add(t);}}
 const dynamic=g.child(node,'dynamic');for(const [space,kind]of [['stats','mutable'],['mods','bonus']])for(const entry of r.members(g.child(dynamic,space))){
  check(entry.name==='e'&&entry.children.length===2,'Invalid character dynamic map');const key=g.resolve(entry.children[0]).text.trim();check(key.length>0&&!['__proto__','prototype','constructor'].includes(key)&&!Object.hasOwn(s.dynamicRefs[space],key),'Invalid dynamic key');const t=target(g.resolve(entry.children[1]),kind);add(t);(space==='mods'?s.dynamic:s.dynamicStats)[key]=t.value;s.dynamicRefs[space][key]=t.objectRef;
 }
 const used=new Set([...Object.values(s.fields),...Object.values(s.dynamicRefs.mods),...Object.values(s.dynamicRefs.stats)]);s.targets=s.targets.filter(t=>used.has(t.objectRef));
 const text=r.value(node,'a'),aptitudes=text===null?{}:parseFactionText(text,'CharacterStats.a');check(aptitudes&&typeof aptitudes==='object'&&!Array.isArray(aptitudes),'Invalid aptitude map');
 s.aptitudes=Object.entries(aptitudes).map(([aptitudeId,level])=>{const spec=R.character.aptitudes.find(a=>a.id===aptitudeId);check(spec&&typeof level==='number'&&Number.isFinite(level),'Unknown aptitude');return {aptitudeId,level:Math.fround(level),maxTier:0};}).sort((a,b)=>R.character.aptitudes.find(s=>s.id===a.aptitudeId).order-R.character.aptitudes.find(s=>s.id===b.aptitudeId).order);
 return restoreOriginalCharacterStats(s);
}
// Source audit found only HyperspaceTopographyEventIntel implementing CharacterStatsRefreshListener.
// Unknown names stay unresolved; an obfuscated "i" is ignored only by its actual PirateActivity owner identity.
const unrelated=new Set(['LocalResourcesSubmarketPlugin','com.fs.starfarer.api.impl.campaign.terrain.HyperspaceAbyssPluginImpl','com.fs.starfarer.api.impl.campaign.HullModItemManager','PlayerFleetPersonnelTracker','EncounterManager','OfficerManagerEvent','WarSimScript','com.fs.starfarer.api.impl.combat.threat.DisposableThreatFleetManager','PlaythroughLog','LuddicPathBaseIntel','PirateBaseIntel','GalatianAcademyStipend','SystemBountyIntel']);
export function captureNativeCharacterWorld(g,r){
 const unresolved=[],manager=g.child(g.root,'listenerManager'),repository=g.child(manager,'listeners'),saved=g.child(repository,'saved');
 if(!manager||!repository)unresolved.push('missing-character-listener-manager');
 const pirateObjects=new Set([...g.objects.values()].filter(n=>(n.attributes.cl??n.name)==='PirateActivity').map(n=>g.child(n,'i')));
 const listeners=[...new Set(r.members(saved))].map(n=>{const classAlias=n.attributes.cl??n.name,kind=classAlias==='com.fs.starfarer.api.impl.campaign.intel.events.ht.HyperspaceTopographyEventIntel'?'hyperspace-topography':unrelated.has(classAlias)||pirateObjects.has(n)?'not-character-refresh':'unsupported';if(kind==='unsupported')unresolved.push('unclassified-character-listener:'+classAlias);return {objectRef:r.ref(n),classAlias,kind,...(kind==='hyperspace-topography'?{event:captureNativeTopographyEvent(g,r,n)}:{})};});
 const memory=g.child(g.root,'memory'),recoveryTags={memoryRef:memory?r.ref(memory):null,key:'$core_recoveryTags',present:false,objectRef:null,values:[],expires:[]};if(!memory)unresolved.push('missing-character-sector-memory');
 for(const e of r.members(g.child(memory,'d'))){check(e.name==='e'&&e.children.length===2,'Invalid sector memory map');if(g.resolve(e.children[0]).text!==recoveryTags.key)continue;check(!recoveryTags.present,'Duplicate recovery tag memory');const value=g.resolve(e.children[1]);recoveryTags.present=true;recoveryTags.objectRef=r.ref(value);check(['set','java.util.HashSet'].includes(value.attributes.cl??value.name),'Unsupported recovery tag set');recoveryTags.values=r.members(value).map(n=>{check((n.attributes.cl??n.name)==='st'&&!n.children.length,'Invalid recovery tag string');return n.text;});check(new Set(recoveryTags.values).size===recoveryTags.values.length,'Duplicate recovery tags');}
 for(const e of r.members(g.child(memory,'e')))if(e.attributes.k===recoveryTags.key){const time=Math.fround(Number(e.attributes.t));check(Number.isFinite(time),'Invalid recovery tag expiry');recoveryTags.expires.push(time);}
 return {scope:'native-character-refresh-world',listeners,recoveryTags,topographyWorld:captureNativeTopographyWorld(g,r),unresolved};
}
