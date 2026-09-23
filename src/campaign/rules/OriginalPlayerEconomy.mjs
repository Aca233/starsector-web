import {createOriginalCampaignMemory,validateOriginalCampaignMemory} from './OriginalCampaignMemory.mjs';
import {validateOriginalJavaStringSet} from './OriginalJavaStringSet.mjs';
import {readOriginalPersonMemoryEntry} from './OriginalPersonAdvance.mjs';
import {validateOriginalMarketPersonnel} from './OriginalMarketPersonnel.mjs';
import {restoreOriginalTopographyWorld} from './OriginalHyperspaceTopography.mjs';
import {restoreOriginalCharacterStats,validateOriginalCharacterStats} from './OriginalNativeCharacterStats.mjs';
import {restoreOriginalNativeFleet} from './OriginalFleetData.mjs';
import { synchronizeOriginalPlayerFleet,validateOriginalNativeFleet } from './OriginalFleetData.mjs';
/** Current personnel/cargo getters used by CoreScript and PlaythroughLog. Does not simulate fleet sync. */
import { requireThat, immutableJSON, canonicalJSON } from '../core/Values.mjs';
import { validateOriginalResourceCargo, originalResourceQuantity } from './OriginalResourceCargo.mjs';
const f=Math.fround,check=(ok,message)=>requireThat(ok,'UNSUPPORTED_PLAYER_ECONOMY',message);
const int=n=>Number.isNaN(n)?0:Math.max(-2147483648,Math.min(2147483647,Math.trunc(n)));
const trim=s=>{let start=0,end=s.length;while(start<end&&s.charCodeAt(start)<=32)start++;while(end>start&&s.charCodeAt(end-1)<=32)end--;return s.slice(start,end);};
function scalarText(entry){check(entry.present&&entry.value&&['st','bp','fp','ip','lp','dp','java.lang.String','java.lang.Boolean','java.lang.Float','java.lang.Integer','java.lang.Long','java.lang.Double'].includes(entry.value.type),'Actual primitive personnel memory value required');return entry.value.text;}
function memoryBoolean(entry){return entry.present&&trim(scalarText(entry).toLowerCase())==='true';}
function memoryFloat(entry,dependencies){
 if(!entry.present)return 0;const text=trim(scalarText(entry));
 if(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[fFdD]?$/.test(text))return f(Number(text.replace(/[fFdD]$/,'')));
 if(['NaN','Infinity','+Infinity','-Infinity'].includes(text))return f(Number(text));
 check(typeof dependencies.readPersonnelMemoryFloat==='function','Personnel Memory.parseFloat locale/hex input requires native parser');
 const result=dependencies.readPersonnelMemoryFloat(entry);check(typeof result==='number','Native memory parser must return float');return f(result);
}
export function originalPersonnelFullName(person){
 check(person?.name&&[person.name.first,person.name.last].every(v=>v===null||typeof v==='string'),'Actual person name required');
 return trim(String(person.name.first)+' '+String(person.name.last));
}
function entry(person,key){const value=readOriginalPersonMemoryEntry(person,key);check(value&&value.key===key&&typeof value.present==='boolean','Actual personnel memory key required: '+key);return value;}
/** PlayerCharacterData memory is distinct from player Person memory and Sector tutorial memory. */
export function originalPlayerCharacterMemoryWithoutUpdate(state){check(typeof state?.characterRef==='string'&&Object.hasOwn(state,'characterMemory'),'Actual complete PlayerCharacterData Memory required; historical queries are insufficient');if(state.characterMemory===null)state.characterMemory=createOriginalCampaignMemory();return validateOriginalCampaignMemory(state.characterMemory);}
export function originalPlayerLevel(state){const level=state.player?.stats?.level;check(Number.isInteger(level)&&level>=-2147483648&&level<=2147483647,'Actual player stats level required');return level;}
export function originalTutorialInProgress(state){check(state.tutorial?.key==='$tutorialRespawn'&&typeof state.tutorial.present==='boolean','Actual tutorial flag required');return state.tutorial.present;}
export function originalOfficerPayroll(state){
 check(state.fleet&&Array.isArray(state.fleet.officers),'Actual player officer roster required');
 return state.fleet.officers.map(officer=>{const p=officer.person;check(typeof p.id==='string'&&Number.isInteger(p.stats?.level),'Actual officer ID/level required');return {id:p.id,objectRef:officer.objectRef,name:originalPersonnelFullName(p),level:p.stats.level,mercenary:memoryBoolean(entry(p,'$isMercenary'))};});
}
export function originalAdministratorPayroll(state,dependencies={}){
 check(Array.isArray(state.administrators),'Actual character administrator roster required');
 return state.administrators.map(admin=>{const p=admin.person;check(typeof p.id==='string','Actual administrator ID required');const market=admin.market;check(market===null||typeof market.name==='string','Actual assigned market name required');return {id:p.id,objectRef:admin.objectRef,name:originalPersonnelFullName(p),tier:int(memoryFloat(entry(p,'$ome_adminTier'),dependencies)),marketName:market===null?null:market.name};});
}
/** Delegate only the actual missing native lifecycle, never accept fabricated payroll/quantity totals. */
function currentCargo(state,dependencies){
 const fleet=state.fleet;check(fleet&&fleet.cargo,'Actual player fleet cargo required');const sync=fleet.synchronization;
 check(sync&&typeof sync.needsSync==='boolean'&&typeof sync.forceNoSync==='boolean','Actual fleet synchronization state required');
 if(!(sync.forceNoSync&&sync.lifecycle==='synchronizing')&&(sync.lifecycle!=='current'||sync.needsSync&&!sync.forceNoSync)){
  const nativeReady=fleet.nativeSyncScope==='native-fleet-data-sync-inputs'&&fleet.syncUnresolved?.length===0;
  check(nativeReady||dependencies.nativeFleetServices||typeof dependencies.synchronizePlayerFleet==='function','Actual FleetData.syncIfNeeded service required before player cargo getters');
  const value=dependencies.nativeFleetServices?synchronizeOriginalPlayerFleet(state,dependencies.nativeFleetServices):typeof dependencies.synchronizePlayerFleet==='function'?dependencies.synchronizePlayerFleet(state):synchronizeOriginalPlayerFleet(state);check(!value||typeof value.then!=='function','Fleet synchronization must be synchronous');
  check(fleet===state.fleet&&sync===fleet.synchronization&&sync.lifecycle==='current'&&(!sync.needsSync||sync.forceNoSync),'Fleet service must update the shared live state, not return cached totals');
 }
 const cargo=fleet.cargo;check(cargo.carryingFleetRef===fleet.dataRef,'Player cargo must belong to the actual shared FleetData');
 check(cargo.creditsRef===fleet.credits.objectRef,'Player cargo credit handle changed outside the shared ledger');
 check(cargo.unresolved.every(reason=>reason==='carrying-fleet-sync-not-restored'),'Other player cargo lifecycle remains unresolved');validateOriginalResourceCargo(cargo);
 if(sync.lifecycle==='current')cargo.unresolved=[]; // This source-load gap is closed only after the real fleet lifecycle is current.
 return cargo;
}
function extra(cargo,key){const value=cargo[key];check(typeof value==='number'&&Number.isFinite(value)&&value===f(value),'Actual current cargo transient required: '+key);return value;}
function quantity(cargo,kind){
 if(kind==='crew')return int(originalResourceQuantity(cargo,'crew'));
 if(kind==='marines')return (int(originalResourceQuantity(cargo,'marines'))+int(extra(cargo,'extraMarinesUsed')))|0;
 if(kind==='supplies')return f(originalResourceQuantity(cargo,'supplies')+f(int(extra(cargo,'extraSuppliesUsed'))));
 if(kind==='fuel')return f(originalResourceQuantity(cargo,'fuel')+extra(cargo,'extraFuelUsed'));
 check(kind==='cargo','Unknown player cargo statistic');return extra(cargo,'spaceUsed');
}
export function originalPlayerFleetPayroll(state,dependencies={}){
 // CoreScript calls fleet.getCargo() separately for the crew and marine getters.
 const crew=quantity(currentCargo(state,dependencies),'crew'),marines=quantity(currentCargo(state,dependencies),'marines');
 return {crew,marines,officers:originalOfficerPayroll(state)};
}
export function originalPlayerCargoStat(state,kind,dependencies={}){return quantity(currentCargo(state,dependencies),kind);}
/** Strict JSON capture boundary. Current shared worlds use the reference validator after graph decoding. */
export function validateOriginalPlayerEconomy(state){
 check(state?.scope==='native-current-player-economy'&&state.schemaVersion===1&&Array.isArray(state.administrators),'Invalid player economy state');immutableJSON(state);return validateOriginalPlayerEconomyReferences(state);
}
/** Identity/field validation only, for an already validated shared graph; not an input boundary.
 * No side effects and never marks a native-readResolve fleet synchronized. */
export function validateOriginalPlayerEconomyReferences(state){
 check(state?.scope==='native-current-player-economy'&&state.schemaVersion===1&&Array.isArray(state.administrators),'Invalid player economy state');
 if(Object.hasOwn(state,'hullMods'))validateOriginalJavaStringSet(state.hullMods);
 const people=new Map(),stats=new Map(),names=new Map(),memories=new Map();
 const bind=(map,value,label)=>{check(value&&typeof value.objectRef==='string','Missing '+label+' identity');const old=map.get(value.objectRef);check(!old||old===value,'Lost shared '+label+' identity');map.set(value.objectRef,value);};
 const person=p=>{bind(people,p,'person');bind(stats,p.stats,'person stats');if(p.stats.nativeCharacterStatsVersion===1)validateOriginalCharacterStats(p.stats);bind(names,p.name,'person name');bind(memories,p.memory,'person memory');check(typeof p.id==='string'&&Number.isInteger(p.stats.level),'Invalid person ID/level');originalPersonnelFullName(p);if(Object.hasOwn(p.memory,'nativeState')){check(typeof p.advanced==='boolean'&&p.nativeMemoryAllocated===(p.memory.nativeState!==null),'Invalid actual person memory state');if(p.memory.nativeState!==null)validateOriginalCampaignMemory(p.memory.nativeState);}else{entry(p,'$isMercenary');entry(p,'$ome_adminTier');}};
 person(state.player);originalTutorialInProgress(state);if(Object.hasOwn(state,'characterMemory')&&state.characterMemory!==null)validateOriginalCampaignMemory(state.characterMemory);
 for(const admin of state.administrators){check(typeof admin.objectRef==='string','Missing admin data reference');person(admin.person);check(admin.market===null||typeof admin.market.objectRef==='string','Missing assigned market reference');}
 if(state.fleet){const fleet=state.fleet;if(fleet.nativeSyncScope)validateOriginalNativeFleet(fleet);for(const p of fleet.statPeople??[])person(p);check(typeof fleet.objectRef==='string'&&typeof fleet.dataRef==='string'&&Array.isArray(fleet.officers),'Invalid player fleet');for(const o of fleet.officers){check(typeof o.objectRef==='string','Missing officer data reference');person(o.person);}
  check(fleet.cargo&&fleet.credits&&fleet.cargo.creditsRef===fleet.credits.objectRef,'Lost shared player credit binding');validateOriginalResourceCargo(fleet.cargo);
  const sync=fleet.synchronization;check(['native-read-resolve-pending','native-constructed-pending','member-lists-only','current'].includes(sync?.lifecycle)&&typeof sync.needsSync==='boolean'&&typeof sync.forceNoSync==='boolean'&&typeof sync.onlySyncMemberLists==='boolean','Invalid fleet synchronization lifecycle');
 }
 for(const p of state.marketPersonnel?.people??[])person(p);validateOriginalMarketPersonnel(state);
 return state;
}

/** JSON captures encode native references by objectRef; checkpoint restore instead verifies graph identity. */
export function restoreOriginalPlayerEconomy(state){
 const result=structuredClone(state),people=new Map(),stats=new Map(),names=new Map(),memories=new Map(),characterTargets=new Map();
 const bind=(map,value,label)=>{check(value&&typeof value.objectRef==='string','Missing '+label+' identity');const old=map.get(value.objectRef);if(old){check(canonicalJSON(old)===canonicalJSON(value),'Conflicting shared '+label+' capture');return old;}map.set(value.objectRef,value);return value;};
 const person=p=>{if(p.stats.nativeCharacterStatsVersion===1){p.stats.targets=p.stats.targets.map(t=>bind(characterTargets,t,'character stat target'));restoreOriginalCharacterStats(p.stats);}p.stats=bind(stats,p.stats,'stats');p.name=bind(names,p.name,'name');p.memory=bind(memories,p.memory,'memory');return bind(people,p,'person');};
 result.player=person(result.player);for(const a of result.administrators)a.person=person(a.person);for(const o of result.fleet?.officers??[])o.person=person(o.person);if(result.fleet?.statPeople)result.fleet.statPeople=result.fleet.statPeople.map(person);
 if(result.marketPersonnel){
  result.marketPersonnel.people=result.marketPersonnel.people.map(person);
  const directories=new Map(),entries=new Map();
  for(const m of result.marketPersonnel.markets)if(m.commDirectory){m.commDirectory.entries=m.commDirectory.entries.map(e=>bind(entries,e,'communication entry'));m.commDirectory=bind(directories,m.commDirectory,'communication directory');}
 }
 if(result.fleet?.nativeSyncScope)restoreOriginalNativeFleet(result.fleet);
 if(result.characterRefresh?.topographyWorld)restoreOriginalTopographyWorld(result.characterRefresh.topographyWorld);
 return validateOriginalPlayerEconomy(result);
}
