/** Faction equipment knowledge, priority and blueprint time on the actual retained Faction. */
import {requireThat} from '../core/Values.mjs';
const check=(ok,message)=>requireThat(ok,'UNSUPPORTED_NATIVE_FACTION_EQUIPMENT',message);
const fields={weapon:['knownWeapons','priorityWeapons','weaponTimestamps','autoEnableKnownWeapons'],fighter:['knownFighters','priorityFighters','fighterTimestamps','autoEnableKnownFighters'],hullmod:['knownHullMods','priorityHullMods']};
const id=value=>{check(typeof value==='string'&&value.length>0,'Actual equipment ID required');return value;};
function keys(kind,timed=false){check(Object.hasOwn(fields,kind)&&(!timed||kind!=='hullmod'),'Actual equipment kind required');return fields[kind];}
function long(value){check(typeof value==='string'&&/^-?(0|[1-9][0-9]*)$/.test(value)&&String(BigInt.asIntN(64,BigInt(value)))===value,'Actual signed-long blueprint timestamp required');return value;}
function strings(list){check(Array.isArray(list)&&list.every(v=>typeof v==='string'&&v.length>0)&&new Set(list).size===list.length,'Actual ordered unique equipment IDs required');return list;}
function call(services,key,...args){check(typeof services[key]==='function','Actual faction equipment service required: '+key);const result=services[key](...args);check(!result||typeof result.then!=='function','Faction equipment services must be synchronous');return result;}
function state(faction){return validateOriginalFactionEquipment(faction?.equipment,faction);}
export function validateOriginalFactionEquipment(value,faction=value?.faction){
 check(value?.scope==='native-current-faction-equipment'&&faction&&typeof faction.objectRef==='string'&&typeof faction.factionId==='string'&&value.faction===faction,'Actual shared Faction equipment history required');
 for(const names of Object.values(fields)){strings(value[names[0]]);strings(value[names[1]]);if(names.length===2)continue;
  const entries=value[names[2]];check(Array.isArray(entries),'Actual blueprint timestamp map required');const seen=new Set();for(const row of entries){check(Array.isArray(row)&&row.length===2&&!seen.has(row[0]),'Actual unique blueprint timestamp entries required');seen.add(id(row[0]));if(row[1]!==null)long(row[1]);}
  check(typeof value[names[3]]==='boolean','Actual auto-enable knowledge flag required');
 }
 check(typeof value.updatingDoctrineInReadResolve==='boolean','Actual doctrine restoration phase required');return value;
}
/** Full explicit inputs only: never fill missing old histories with a new empty faction. */
export function restoreOriginalFactionEquipment(faction,inputs){return validateOriginalFactionEquipment({...inputs,scope:'native-current-faction-equipment',faction},faction);}
export function originalFactionKnownEquipment(faction,kind,services={}){
 const [known]=keys(kind);
 // Native player getter ignores Faction.knownHullMods, including when that history is unavailable.
 if(kind==='hullmod'&&faction?.factionId==='player')return [...strings(call(services,'readPlayerKnownHullmods'))];
 return state(faction)[known];
}
export function originalFactionEquipmentPriority(faction,kind,equipmentId){const [,priority]=keys(kind);return state(faction)[priority].includes(id(equipmentId));}
export function originalFactionEquipmentKnownAt(faction,kind,equipmentId,timestamp){
 const [known,,times]=keys(kind,true),s=state(faction);id(equipmentId);
 if(timestamp!==null){long(timestamp);const learned=s[times].find(([key])=>key===equipmentId)?.[1]??null;if(learned!==null&&BigInt(learned)>BigInt(timestamp))return false;}
 return s[known].includes(equipmentId);
}
const add=(list,value)=>{if(!list.includes(value))list.push(value);};
const remove=(list,value)=>{const at=list.indexOf(value);if(at>=0)list.splice(at,1);};
export function setOriginalFactionEquipmentPriority(faction,kind,equipmentId,enabled){const [,priority]=keys(kind),s=state(faction);id(equipmentId);check(typeof enabled==='boolean','Actual equipment-priority boolean required');if(enabled)add(s[priority],equipmentId);else remove(s[priority],equipmentId);}
export function addOriginalFactionKnownEquipment(faction,kind,equipmentId,recordTimestamp,services={}){
 const [known,priority,times,auto]=keys(kind,true),s=state(faction);id(equipmentId);check(typeof recordTimestamp==='boolean','Actual record-timestamp boolean required');if(s[known].includes(equipmentId))return;
 const entries=s[times],at=entries.findIndex(([key])=>key===equipmentId);
 if(recordTimestamp){const now=long(call(services,'readFactionEquipmentTimestamp'));if(at<0)entries.push([equipmentId,now]);else entries[at][1]=now;}else if(at>=0)entries.splice(at,1);
 s[known].push(equipmentId);if(s[auto])add(s[priority],equipmentId);
 if(!s.updatingDoctrineInReadResolve&&faction.factionId==='player'){
  const spec=call(services,'readFactionEquipmentSpec',kind,equipmentId);check(spec===null||spec&&Array.isArray(spec.tags),'Actual nullable codex equipment spec required');
  if(spec!==null&&spec.tags.includes('codex_unlockable'))call(services,'reportPlayerAwareOfEquipment',kind,equipmentId,true);
 }
}
export function removeOriginalFactionKnownEquipment(faction,kind,equipmentId){const [known,priority,times]=keys(kind,true),s=state(faction);id(equipmentId);const at=s[times].findIndex(([key])=>key===equipmentId);if(at>=0)s[times].splice(at,1);remove(s[known],equipmentId);remove(s[priority],equipmentId);}
export function createOriginalFactionEquipmentServices(services={}){return {
 readInflaterKnownHullmods:faction=>originalFactionKnownEquipment(faction,'hullmod',services),
 readInflaterKnownWeapons:faction=>originalFactionKnownEquipment(faction,'weapon'),
 readInflaterKnownFighters:faction=>originalFactionKnownEquipment(faction,'fighter'),
 isInflaterWeaponKnownAt:(faction,equipmentId,timestamp)=>originalFactionEquipmentKnownAt(faction,'weapon',equipmentId,timestamp),
 isInflaterFighterKnownAt:(faction,equipmentId,timestamp)=>originalFactionEquipmentKnownAt(faction,'fighter',equipmentId,timestamp),
 isInflaterWeaponPriority:(faction,equipmentId)=>originalFactionEquipmentPriority(faction,'weapon',equipmentId),
 isInflaterFighterPriority:(faction,equipmentId)=>originalFactionEquipmentPriority(faction,'fighter',equipmentId),
};}
