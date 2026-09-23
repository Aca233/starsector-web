/** ImportantPeople roster/advance, not the mission-specific getPerson picker.
 * Native ImportantPeople converts seconds to days BEFORE Person.advance. Person's
 * Memory converts that argument again; this is confirmed in the original bytecode. */
import {requireThat} from '../core/Values.mjs';
import {advanceOriginalPerson} from './OriginalPersonAdvance.mjs';
import {validateOriginalCampaignMemory} from './OriginalCampaignMemory.mjs';
const check=(ok,message)=>requireThat(ok,'UNSUPPORTED_NATIVE_IMPORTANT_PEOPLE',message);
const call=(services,name,...args)=>{check(typeof services[name]==='function','Actual important-people service required: '+name);const value=services[name](...args);check(!value||typeof value.then!=='function','Important-people services must be synchronous');return value;};
const bump=state=>{state.listVersion=(state.listVersion+1)|0;};
export function createOriginalImportantPeople(){return {scope:'native-important-people',people:[],excludeFromGetPerson:null,idToPersonDataMap:null,lastGetPersonResultWasExistingPerson:false,listVersion:0};}
export function validateOriginalImportantPeople(state){
 check(state?.scope==='native-important-people'&&Array.isArray(state.people)&&typeof state.lastGetPersonResultWasExistingPerson==='boolean'&&Number.isInteger(state.listVersion)&&state.listVersion===(state.listVersion|0),'Actual ImportantPeople state required');
 for(const row of state.people){const p=row?.person;check(row?.scope==='native-important-person-data'&&typeof p?.objectRef==='string'&&typeof p.id==='string'&&typeof p.advanced==='boolean'&&Object.hasOwn(p.memory??{},'nativeState'),'Actual shared Person with known advancement/memory required');if(p.memory.nativeState!==null)validateOriginalCampaignMemory(p.memory.nativeState);check(row.location?.scope==='native-important-person-location'&&['market','entity'].every(k=>row.location[k]===null||typeof row.location[k]==='object')&&Array.isArray(row.checkedOutFor)&&row.checkedOutFor.every(v=>typeof v==='string')&&new Set(row.checkedOutFor).size===row.checkedOutFor.length,'Actual important person location and checkout set required');}
 check(state.excludeFromGetPerson===null||Array.isArray(state.excludeFromGetPerson)&&state.excludeFromGetPerson.every(p=>p&&typeof p.objectRef==='string'),'Actual excluded-person set required');
 if(state.idToPersonDataMap!==null){check(Array.isArray(state.idToPersonDataMap),'Actual person-ID cache required');const ids=new Set();for(const row of state.idToPersonDataMap){check(typeof row.id==='string'&&!ids.has(row.id)&&state.people.includes(row.data),'Lost PersonData cache identity');ids.add(row.id);}}
 return state;
}
const put=(map,id,data)=>{const row=map.find(row=>row.id===id);if(row)row.data=data;else map.push({id,data});};
function rebuild(state){if(state.idToPersonDataMap===null){state.idToPersonDataMap=[];for(const row of state.people)put(state.idToPersonDataMap,row.person.id,row);}}
export function originalImportantPersonData(state,id){rebuild(state);return state.idToPersonDataMap.find(row=>row.id===id)?.data??null;}
export function addOriginalImportantPerson(state,person,services){
 if(originalImportantPersonData(state,person.id)!==null)return;
 const row={scope:'native-important-person-data',person,location:{scope:'native-important-person-location',market:null,entity:null},checkedOutFor:[]};state.people.push(row);bump(state);
 const market=call(services,'readImportantPersonMarket',person);check(market===null||market&&typeof market==='object','Actual person market or known null required');if(market!==null)row.location.market=market;rebuild(state);put(state.idToPersonDataMap,person.id,row);
}
export function removeOriginalImportantPerson(state,id){const data=originalImportantPersonData(state,id);if(data===null)return;state.people.splice(state.people.indexOf(data),1);bump(state);rebuild(state);const index=state.idToPersonDataMap.findIndex(row=>row.id===id);if(index>=0)state.idToPersonDataMap.splice(index,1);}
export function advanceOriginalImportantPeople(state,seconds,context,services){
 check(typeof context.paused==='boolean','Actual ImportantPeople pause state required');if(context.paused)return;
 const days=call(services,'convertImportantPeopleSecondsToDays',seconds),version=state.listVersion,list=state.people;let cursor=0;
 // ArrayList iterator checks structural changes on next(), not on hasNext().
 while(cursor!==list.length){check(version===state.listVersion,'Native ImportantPeople concurrent modification');const person=list[cursor++].person;
  if(!person.advanced){if(services.advanceImportantPerson)call(services,'advanceImportantPerson',person,days);else advanceOriginalPerson(person,days,person.memory.nativeState===null||context.paused?0:call(services,'convertImportantPeopleSecondsToDays',days),context,services.memoryServices);}
  person.advanced=false;
 }
}
