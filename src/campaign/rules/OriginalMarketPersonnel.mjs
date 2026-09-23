/** Market.getAdmin/setAdmin and their actual person/comm/payroll identity side effects. */
import {requireThat} from '../core/Values.mjs';
import {ORIGINAL_ADMINISTRATORS} from './OriginalAdministrator.mjs';
import {constructOriginalCharacterStats} from './OriginalNativeCharacterStats.mjs';
const check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_MARKET_PERSONNEL',m);
function invoke(services,name,...args){check(typeof services?.[name]==='function','Actual personnel lifecycle service required: '+name);const result=services[name](...args);check(!result||typeof result.then!=='function','Personnel lifecycle must be synchronous');return result;}
export function originalPersonnelPeople(state){
 const all=[state.player,...state.administrators.map(a=>a.person),...(state.fleet?.officers??[]).map(o=>o.person),...(state.fleet?.statPeople??[]),...(state.marketPersonnel?.people??[])],byRef=new Map();
 for(const p of all){check(p&&typeof p.objectRef==='string','Actual personnel identity required');check(!byRef.has(p.objectRef)||byRef.get(p.objectRef)===p,'Split native person identity');byRef.set(p.objectRef,p);}return [...byRef.values()];
}
export function originalPersonnelByRef(state,objectRef){const person=originalPersonnelPeople(state).find(p=>p.objectRef===objectRef);check(person,'Uncaptured native person');return person;}
function personnel(market){const data=market.personnel;check(data?.scope==='native-market-personnel'&&data.marketRef===market.objectRef&&data.marketId===market.marketId,'Actual shared market personnel required');return data;}
function directory(market){const data=personnel(market);if(data.commDirectory===null)data.commDirectory={objectRef:'created-comm-directory:'+market.objectRef,entries:[]};check(Array.isArray(data.commDirectory.entries),'Actual communication directory required');return data.commDirectory;}
export function removeOriginalMarketPerson(market,person){
 const data=personnel(market);if(data.peopleRefs===null)return;check(Array.isArray(data.peopleRefs),'Actual market people set required');
 if(person!==null){const at=data.peopleRefs.indexOf(person.objectRef);if(at>=0)data.peopleRefs.splice(at,1);person.marketRef=null;}
 if(data.peopleRefs.length===0)data.peopleRefs=null;
}
export function addOriginalMarketPerson(market,person){
 if(person===null)return;const data=personnel(market);data.peopleRefs??=[];if(!data.peopleRefs.includes(person.objectRef))data.peopleRefs.push(person.objectRef);person.marketRef=market.objectRef;
}
export function setOriginalMarketAdministrator(state,market,person,services){
 const data=personnel(market),old=data.adminRef===null?null:originalPersonnelByRef(state,data.adminRef);
 if(person!==null)check(originalPersonnelByRef(state,person.objectRef)===person,'Administrator must be the shared person');const changed=old!==person;
 if(old!==null){removeOriginalMarketPerson(market,old);const comm=directory(market);comm.entries.splice(0,comm.entries.length,...comm.entries.filter(e=>!(e.type==='PERSON'&&e.entryDataRef===old.objectRef)));
  for(const admin of state.administrators)if(admin.person===old)admin.market=null;
 }
 data.adminRef=person?.objectRef??null;market.adminIsPlayer=person===state.player;market.adminAiCoreId=person?.aiCoreId??null;
 if(person!==null){addOriginalMarketPerson(market,person);if(changed)invoke(services,'refreshGovernedOutpostEffects',person.stats,market);}
 return person;
}
export function nextOriginalNativeUID(state){
 const counter=state.nativeUID;check(counter?.scope==='native-sector-uid'&&typeof counter.nextId==='string','Actual native Sector UID counter required');check(typeof counter.sectorRef==='string'&&/^-?\d+$/.test(counter.nextId),'Actual native Sector UID identity/value required');const value=BigInt(counter.nextId);check(BigInt.asIntN(64,value)===value,'Native UID long overflow');const id=BigInt.asUintN(64,value).toString(16);counter.nextId=BigInt.asIntN(64,value+1n).toString();return id;
}
function createDefaultPerson(state,factionId,nativeConstruction){
 check(typeof factionId==='string'&&factionId.length>0,'Actual market faction required');check(state.marketPersonnel?.scope==='native-market-personnel-registry'&&state.marketPersonnel.unresolved.length===0&&Array.isArray(state.marketPersonnel.people),'Complete shared personnel registry required');
 const id='p_'+nextOriginalNativeUID(state),objectRef='created-person:'+state.nativeUID.sectorRef+':'+id;check(!originalPersonnelPeople(state).some(p=>p.objectRef===objectRef||p.id===id),'Duplicate newly allocated person');
 const person={objectRef,id,personalityId:'steady',portraitSprite:ORIGINAL_ADMINISTRATORS.defaultPortrait,factionId,aiCoreId:null,isAICore:false,marketRef:null,fleetRef:null,
  name:{objectRef:'created-name:'+objectRef,first:'',last:'',gender:'ANY'},stats:constructOriginalCharacterStats('created-stats:'+objectRef),
  advanced:false,nativeMemoryAllocated:false,memory:{nativeState:null,objectRef:'created-person-memory:'+objectRef,entries:Object.fromEntries(['$isMercenary','$ome_adminTier'].map(key=>[key,{key,present:false,value:null,expires:[]}])) ,source:null},source:null,nativeConstruction};
 state.marketPersonnel.people.push(person);return person;
}
export function createOriginalDefaultAdministrator(state,factionId){return createDefaultPerson(state,factionId,'default-administrator');}
/** Person("steady") defaults; memory remains a query projection, not a native allocated Memory. */
export function createOriginalDefaultFleetCaptain(state){
 const person=createDefaultPerson(state,'neutral','default-fleet-captain');
 Object.assign(person,{rankId:'spaceCommander',postId:'fleetCommander',importance:'MEDIUM',contactWeight:1,wantsToContactReasonsCount:0,advanced:false,fleetRef:null,relToPlayer:null,tags:null,voiceOverride:null,nativeMemoryAllocated:false});return person;
}
export function getOriginalMarketAdministrator(state,market,services){
 const data=personnel(market);check(typeof market.playerOwned==='boolean','Actual market ownership required');
 if(data.adminRef===null)setOriginalMarketAdministrator(state,market,createOriginalDefaultAdministrator(state,market.factionId),services);
 let person=originalPersonnelByRef(state,data.adminRef);check(Object.hasOwn(person,'portraitSprite'),'Actual current portrait required for isDefault');
 if(market.playerOwned&&person.portraitSprite!==null&&person.portraitSprite===ORIGINAL_ADMINISTRATORS.defaultPortrait){
  setOriginalMarketAdministrator(state,market,null,services);person=state.player;data.adminRef=person.objectRef;market.adminIsPlayer=true;market.adminAiCoreId=person.aiCoreId??null;
  // Native direct assignment deliberately bypasses addPerson and the selected AdminData.market field.
  invoke(services,'refreshGovernedOutpostEffects',person.stats,market);
 }
 return person;
}

/** Ref-only market edges keep checkpoints acyclic without losing Person identity. */
export function validateOriginalMarketPersonnel(state){
 const registry=state.marketPersonnel;if(registry===undefined)return state;
 check(registry?.scope==='native-market-personnel-registry'&&Array.isArray(registry.people)&&Array.isArray(registry.markets)&&Array.isArray(registry.unresolved)&&registry.unresolved.every(r=>typeof r==='string'),'Invalid personnel registry');
 const people=new Map(originalPersonnelPeople(state).map(p=>[p.objectRef,p])),markets=new Set(),ids=new Set(),directories=new Map(),entries=new Map();
 const ref=v=>typeof v==='string'&&v.length>0,optionalRef=v=>v===null||ref(v);
 const shared=(map,v)=>{check(ref(v?.objectRef),'Missing communication object identity');check(!map.has(v.objectRef)||map.get(v.objectRef)===v,'Split communication object identity');map.set(v.objectRef,v);};
 for(const p of people.values())check(optionalRef(p.marketRef)&&optionalRef(p.aiCoreId)&&optionalRef(p.portraitSprite),'Incomplete current personnel fields; recapture older inputs');
 for(const m of registry.markets){
  check(m.scope==='native-market-personnel'&&ref(m.marketRef)&&ref(m.marketId)&&!markets.has(m.marketRef)&&!ids.has(m.marketId),'Invalid or duplicate personnel market');markets.add(m.marketRef);ids.add(m.marketId);
  check(optionalRef(m.adminRef)&&(registry.unresolved.length>0||m.adminRef===null||people.has(m.adminRef)),'Uncaptured market administrator');
  check(m.peopleRefs===null||Array.isArray(m.peopleRefs)&&m.peopleRefs.every(ref)&&new Set(m.peopleRefs).size===m.peopleRefs.length,'Invalid market people set');
  if(m.commDirectory===null)continue;shared(directories,m.commDirectory);check(Array.isArray(m.commDirectory.entries),'Missing communication entries');
  for(const e of m.commDirectory.entries){shared(entries,e);check(optionalRef(e.id)&&optionalRef(e.type)&&optionalRef(e.entryDataRef)&&typeof e.hidden==='boolean','Invalid communication entry');}
 }
 if(state.nativeUID!==null&&state.nativeUID!==undefined){const c=state.nativeUID;check(c.scope==='native-sector-uid'&&ref(c.sectorRef)&&typeof c.nextId==='string'&&/^-?\d+$/.test(c.nextId)&&BigInt.asIntN(64,BigInt(c.nextId))===BigInt(c.nextId),'Invalid shared Sector UID counter');}
 return state;
}
