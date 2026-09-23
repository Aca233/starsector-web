/** Person.advance on actual current Memory, not a reconstruction of saved query projections. */
import {requireThat} from '../core/Values.mjs';
import {createOriginalCampaignMemory,advanceOriginalCampaignMemory,validateOriginalCampaignMemory,originalCampaignMemoryContains,originalCampaignMemoryGet} from './OriginalCampaignMemory.mjs';
const check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_PERSON_ADVANCE',m);
export function originalPersonMemoryWithoutUpdate(person){
 check(person?.memory&&Object.hasOwn(person.memory,'nativeState'),'Actual complete Person Memory state required; historical query projections are insufficient');
 if(person.memory.nativeState===null)person.memory.nativeState=createOriginalCampaignMemory();person.nativeMemoryAllocated=true;return validateOriginalCampaignMemory(person.memory.nativeState);
}
export function advanceOriginalPerson(person,seconds,days,context,services={}){
 check(Number.isFinite(seconds)&&Number.isFinite(days)&&typeof context?.paused==='boolean','Actual person frame time/context required');
 check(person?.memory&&Object.hasOwn(person.memory,'nativeState'),'Actual complete Person Memory state required; historical query projections are insufficient');
 if(person.memory.nativeState!==null)advanceOriginalCampaignMemory(validateOriginalCampaignMemory(person.memory.nativeState),days,context,services);
 person.advanced=true;
}
/** Compatible query shape, derived at read time. Stored entries remain capture-time projections. */
export function readOriginalPersonMemoryEntry(person,key,services={}){
 if(!Object.hasOwn(person.memory,'nativeState')){const entry=person.memory.entries[key];check(entry&&entry.key===key,'Actual personnel memory key required: '+key);return entry;}
 const memory=originalPersonMemoryWithoutUpdate(person),present=originalCampaignMemoryContains(memory,key,services),value=present?originalCampaignMemoryGet(memory,key,services):null;
 const type=typeof value==='string'?'st':typeof value==='boolean'?'bp':typeof value==='number'?'fp':'object';
 return {key,present,value:present?{type,text:value===null?'null':String(value)}:null,expires:memory?.expire.filter(e=>e.key===key).map(e=>e.timeLeft)??[]};
}
