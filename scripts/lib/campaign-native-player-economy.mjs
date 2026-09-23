import {createOriginalJavaStringSet} from '../../src/campaign/rules/OriginalJavaStringSet.mjs';
import {captureNativeCharacterStats,captureNativeCharacterWorld} from './campaign-native-character-stats.mjs';
import {parseFactionText} from '../import-campaign-factions.mjs';
import {ORIGINAL_ADMINISTRATORS,restoreOriginalSavedSkillOrder} from '../../src/campaign/rules/OriginalAdministrator.mjs';
import { captureNativeFleetSync } from './campaign-native-fleet-sync.mjs';
import { captureNativeResourceCargo } from './campaign-native-retail-inputs.mjs';
import { validateOriginalPlayerEconomy } from '../../src/campaign/rules/OriginalPlayerEconomy.mjs';
const check=(ok,message)=>{if(!ok)throw Error('NATIVE_PLAYER_ECONOMY: '+message);};
const integer=(text,label)=>{const n=Number(text);check(text!==null&&text!==''&&Number.isInteger(n)&&n>=-2147483648&&n<=2147483647,'Missing/invalid '+label);return n;};
const float=(text,label)=>{const n=Math.fround(Number(text));check(text!==null&&text!==''&&Number.isFinite(n),'Missing/invalid '+label);return n;};
const bool=(text,label)=>{check(text==='true'||text==='false','Missing/invalid '+label);return text==='true';};
function retained(node,top=true){if(!node)return null;if(!top&&node.attributes.z)return {name:node.name,attributes:{ref:node.attributes.z},children:[],text:''};return {name:node.name,attributes:{...node.attributes},children:node.children.map(n=>retained(n,false)),text:node.text};}
/** Capture actual rosters and selected Memory entries; not a general Sector/Person Memory advance implementation. */
export function captureNativePlayerEconomy(g,r){
 const characterTargets=new Map();
 const unresolved=[],people=new Map(),statsHandles=new Map(),nameHandles=new Map(),memoryHandles=new Map(),marketHandles=new Map();
 const ref=n=>n?r.ref(n):null,missing=reason=>{unresolved.push(reason);return null;};
 const shared=(map,node,make)=>{const id=ref(node);if(!map.has(id))map.set(id,make(id));return map.get(id);};
 function memoryEntry(memory,key){
  const result={key,present:false,value:null,expires:[]};
  for(const e of r.members(g.child(memory,'d'))){check(e.name==='e'&&e.children.length===2,'Invalid memory map');if(g.resolve(e.children[0]).text!==key)continue;check(!result.present,'Duplicate payroll memory key');const datum=g.resolve(e.children[1]);result.present=true;result.value={type:datum.attributes.cl??datum.name,text:datum.text,source:retained(datum)};}
  for(const e of r.members(g.child(memory,'e')))if(e.attributes.k===key)result.expires.push(float(e.attributes.t,'person memory expiration'));
  return result;
 }
 function person(node,problems=unresolved){
  const missingPerson=reason=>{problems.push(reason);return null;};
  if(!node)return missingPerson('missing-payroll-person');check(!node.attributes.cl||node.attributes.cl==='Person','Unsupported person class');
  return shared(people,node,objectRef=>{
   const n=g.child(node,'n'),s=g.child(node,'stats'),m=g.child(node,'m');
   if(!n||!s||r.attr(node,'id')===null||r.attr(s,'l')===null)return missingPerson('incomplete-payroll-person');
   check((!s.attributes.cl||s.attributes.cl==='CharacterStats')&&(!n.attributes.cl||n.attributes.cl==='FullName')&&(!m?.attributes.cl||m.attributes.cl==='Memory'),'Unsupported personnel getter class');
   const name=shared(nameHandles,n,id=>({objectRef:id,first:r.attr(n,'f'),last:r.attr(n,'l'),gender:r.attr(n,'g')??r.value(n,'g')}));
   const stats=shared(statsHandles,s,id=>{check(!g.child(s,'skills'),'Serialized skill list must use native s format');const text=r.value(s,'s'),raw=text===null?{}:parseFactionText(text,'CharacterStats.s');check(raw&&typeof raw==='object'&&!Array.isArray(raw),'Invalid skill map');return {...captureNativeCharacterStats(g,r,s,characterTargets),objectRef:id,level:integer(r.attr(s,'l'),'person level'),skills:structuredClone(restoreOriginalSavedSkillOrder(Object.entries(raw).map(([skillId,level])=>({skillId,level})))),fleetRef:ref(g.child(s,'fleet')),source:retained(s)};});
   const memory=m?shared(memoryHandles,m,id=>({objectRef:id,entries:Object.fromEntries(['$isMercenary','$ome_adminTier'].map(key=>[key,memoryEntry(m,key)])),source:retained(m)})):{objectRef:'created-person-memory:'+objectRef,entries:Object.fromEntries(['$isMercenary','$ome_adminTier'].map(key=>[key,memoryEntry(null,key)])),source:null};
   const aiCoreId=r.attr(node,'aiCoreId')??r.value(node,'aiCoreId');
   return {objectRef,fleetRef:ref(g.child(node,'fleet')),id:r.attr(node,'id'),personalityId:r.attr(node,'pid'),portraitSprite:r.attr(node,'spr')??ORIGINAL_ADMINISTRATORS.defaultPortrait,factionId:r.attr(node,'fid'),marketRef:ref(g.child(node,'market')),aiCoreId,isAICore:aiCoreId!==null,name,stats,memory,source:retained(node)};
  });
 }
 function market(node){if(!node)return null;return shared(marketHandles,node,objectRef=>{const id=r.value(node,'id'),name=r.value(node,'name');if(id===null||name===null)return missing('missing-assigned-market-details');return {objectRef,marketId:id,name};});}
 const character=g.child(g.root,'characterData');if(!character)return {scope:'native-saved-player-economy',state:null,unresolved:['missing-character-data']};
 const player=person(g.child(character,'person')),administrators=[];
 for(const node of r.members(g.child(character,'admins'))){check((node.attributes.cl??node.name)==='AdminData','Unsupported administrator data class');administrators.push({objectRef:ref(node),person:person(g.child(node,'person')),market:market(g.child(node,'market')),source:retained(node)});}
 const sectorMemory=g.child(g.root,'memory');if(!sectorMemory)missing('missing-sector-memory');
 const tutorial=memoryEntry(sectorMemory,'$tutorialRespawn');let fleet=null;
 const fleetNode=g.child(g.root,'playerFleet');
 if(fleetNode){const data=g.child(fleetNode,'fD'),cargoNode=g.child(data,'cargo');
  if(!data||!cargoNode||!g.child(cargoNode,'s'))missing('missing-player-cargo');
  else{
   const cargo=captureNativeResourceCargo(g,r,cargoNode),creditsNode=g.child(cargoNode,'c'),officers=[];
   // Extra cargo fields are transient in CargoData, not saved quantities or last month's personnel totals.
   Object.assign(cargo,{extraCrewUsed:0,extraMarinesUsed:0,extraFuelUsed:0,extraSuppliesUsed:0});
   if(cargo.carryingFleetRef!==ref(data))missing('player-cargo-owner-mismatch');
   for(const o of r.members(g.child(data,'o'))){check((o.attributes.cl??o.name)==='OfficerData','Unsupported officer data class');const picks=g.child(o,'skillPicks'),made=r.value(o,'madePicks');officers.push({objectRef:ref(o),person:person(g.child(o,'person')),source:retained(o),...(made===null?{}:{madePicks:bool(made,'officer made picks'),skillPicks:r.members(picks).map(n=>{check((n.attributes.cl??n.name)==='st','Invalid officer skill pick');return n.text;})})});}
   if(!creditsNode)missing('missing-player-credits');
   fleet={objectRef:ref(fleetNode),dataRef:ref(data),cargo,credits:creditsNode?{objectRef:ref(creditsNode),value:float(r.value(creditsNode,'value',true),'credits')}:null,officers,
    synchronization:{lifecycle:'native-read-resolve-pending',needsSync:true,forceNoSync:false,onlySyncMemberLists:bool(r.attr(data,'oSML'),'onlySyncMemberLists')},memberRefs:r.members(g.child(data,'m')).map(ref),source:retained(data),...captureNativeFleetSync(g,r,fleetNode,data)};
   const personNodes=[g.child(data,'c'),...r.members(g.child(data,'m')).map(n=>g.child(n,'c'))].filter(Boolean);
   fleet.statPeople=[...new Map(personNodes.map(n=>{const p=person(n);return [ref(n),p];})).values()];fleet.playerPersonRef=player.objectRef;
  }
 }
 // The personnel sub-capture is independent of wages: old salary-only inputs remain usable,
 // but an absent economy roster is never interpreted as an empty personnel world.
 const marketPersonnel={scope:'native-market-personnel-registry',markets:[],people:[],unresolved:[]};
 const roster=g.child(g.child(g.child(g.root,'economy'),'econ'),'markets'),previousPeople=new Set(people.keys());
 const directories=new Map(),entries=new Map();
 if(!roster)marketPersonnel.unresolved.push('missing-economy-market-roster');
 else for(const node of r.members(roster)){
  const admin=g.child(node,'admin'),savedPeople=g.child(node,'people'),comm=g.child(node,'commDirectory');
  if(admin)person(admin,marketPersonnel.unresolved);
  const commDirectory=comm?shared(directories,comm,objectRef=>({objectRef,entries:r.members(g.child(comm,'entries')).map(e=>shared(entries,e,id=>({objectRef:id,id:r.value(e,'id'),type:r.value(e,'type'),entryDataRef:ref(g.child(e,'entryData')),hidden:bool(r.value(e,'hidden'),'comm entry hidden'),source:retained(e)})))})):null;
  marketPersonnel.markets.push({scope:'native-market-personnel',marketRef:ref(node),marketId:r.value(node,'id'),adminRef:ref(admin),peopleRefs:savedPeople?r.members(savedPeople).map(ref):null,commDirectory});
 }
 marketPersonnel.people=[...people].filter(([id,p])=>p&&!previousPeople.has(id)).map(([,p])=>p);
 const nextId=r.value(g.root,'nextId');let nativeUID=null;
 if(nextId!==null){check(/^-?\d+$/.test(nextId)&&BigInt.asIntN(64,BigInt(nextId))===BigInt(nextId),'Invalid Sector UID counter');nativeUID={scope:'native-sector-uid',sectorRef:ref(g.root),nextId};}
 if(unresolved.length)return {scope:'native-saved-player-economy',state:null,unresolved};
 // Native PlayerCharacterData.readResolve creates an empty HashSet only when its XML field is absent/null.
 const learned=g.child(character,'hullMods');check(!learned?.attributes.cl||['set','java.util.HashSet'].includes(learned.attributes.cl),'Unsupported player hullmod collection class');
 const hullMods=createOriginalJavaStringSet(r.members(learned).map(n=>{check((n.attributes.cl??n.name)==='st'&&typeof n.text==='string','Actual learned hullmod ID required');return n.text;}));
 const state={scope:'native-current-player-economy',schemaVersion:1,characterRef:ref(character),hullMods,player,administrators,tutorial,fleet,nativeUID,marketPersonnel,characterRefresh:captureNativeCharacterWorld(g,r)};
 validateOriginalPlayerEconomy(state);return {scope:'native-saved-player-economy',state,unresolved};
}
