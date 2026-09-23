import {originalFleetCommanderRef} from './OriginalFleetCommander.mjs';
/** Native FleetData membership operations on existing current fleets; NOT a CampaignFleet constructor. */
import {requireThat} from '../core/Values.mjs';
import {synchronizeOriginalFleet,syncOriginalMemberLists,validateOriginalNativeFleet,originalFleetPointCost} from './OriginalFleetData.mjs';
import {validateOriginalFleetNaming,pickOriginalFleetMemberNameOnAdd,originalFleetMemberConstructionServices,originalConstructedMemberHullSize} from './OriginalFleetMembers.mjs';
import {validateOriginalJavaRandom} from './OriginalJavaRandom.mjs';
import {originalPersonnelByRef,createOriginalDefaultFleetCaptain} from './OriginalMarketPersonnel.mjs';
import {updateOriginalMemberStats} from './OriginalMemberEffects.mjs';
const check=(ok,message)=>requireThat(ok,'UNSUPPORTED_NATIVE_FLEET_ROSTER',message);
export function createOriginalFleetRosterState(){return {scope:'native-current-fleet-rosters',bindings:[]};}
export function registerOriginalFleetRoster(state,fleet,naming,shipNameRandom=null){
 check(state?.scope==='native-current-fleet-rosters'&&Array.isArray(state.bindings),'Current roster bindings required');
 validateOriginalNativeFleet(fleet);validateOriginalFleetNaming(naming);if(shipNameRandom!==null)validateOriginalJavaRandom(shipNameRandom);
 check(!state.bindings.some(b=>b.fleet.dataRef===fleet.dataRef),'FleetData already has a current roster binding');
 const binding={fleet,naming,shipNameRandom};state.bindings.push(binding);return binding;
}
export function validateOriginalFleetRosterState(state,player,factory){
 check(state?.scope==='native-current-fleet-rosters'&&Array.isArray(state.bindings),'Invalid current fleet roster state');
 const fleets=new Map(),members=new Map((factory?.members??[]).map(m=>[m.objectRef,m]));
 for(const b of state.bindings){
  const fleet=b.fleet;validateOriginalNativeFleet(fleet);validateOriginalFleetNaming(b.naming);if(b.shipNameRandom!==null)validateOriginalJavaRandom(b.shipNameRandom);
  check(!fleets.has(fleet.dataRef),'Duplicate FleetData binding');fleets.set(fleet.dataRef,fleet);
  if(fleet.dataRef===player?.fleet?.dataRef)check(fleet===player.fleet,'Lost shared player FleetData binding');
  for(const member of [...fleet.members,...(fleet.membersWithoutNull??[]),...(fleet.sortedMembersWithoutNull??[]),...(fleet.sortedMembersWithoutNullWithFighters??[])]){
   const old=members.get(member.objectRef);check(!old||old===member,'Lost shared roster/member-factory identity');members.set(member.objectRef,member);
  }
 }
 return state;
}
function current(binding){const fleet=binding?.fleet;check(fleet?.nativeSyncScope==='native-fleet-data-sync-inputs'&&fleet.synchronization&&Array.isArray(fleet.members),'Actual current FleetData required');return fleet;}
export function dirtyOriginalFleetRoster(binding){current(binding).synchronization.needsSync=true;}
export function originalFleetRosterMembers(binding,services={}){const fleet=current(binding);synchronizeOriginalFleet(fleet,services);return fleet.membersWithoutNull;}
export function originalFleetRosterMembersCopy(binding,services={}){const members=originalFleetRosterMembers(binding,services);return members===null?[]:[...members];}
export function originalFleetRosterSize(binding,services={}){const list=originalFleetRosterMembers(binding,services);check(Array.isArray(list),'Native member cache unavailable');return list.length;}
export function originalFleetRosterSortedMembers(binding,services={}){
 const fleet=current(binding);fleet.synchronization.onlySyncMemberLists=true;synchronizeOriginalFleet(fleet,services);fleet.synchronization.onlySyncMemberLists=false;return fleet.sortedMembersWithoutNull;
}
/** Java reference identity, not member ID; no dirty/name/flag changes when already present. */
export function addOriginalFleetRosterMember(binding,member,services){
 const fleet=current(binding);check(member&&['SHIP','FIGHTER_WING','NULL'].includes(member.type),'Cannot add null/unknown member');
 if(fleet.members.includes(member))return;
 check(Object.hasOwn(member,'shipName')&&typeof member.isFlagship==='boolean','Actual member name/flagship state required; recapture old inputs');
 const index=fleet.members.findIndex(m=>m.type==='NULL');
 // Native appends its static NULL_MEMBER and immediately replaces it; no placeholder escapes this operation.
 if(index<0)fleet.members.push(member);else fleet.members[index]=member;
 if(member.shipName===null&&member.type!=='FIGHTER_WING'){
  check(typeof services?.nameOnAdd==='function','Actual current FleetData naming service required');const name=services.nameOnAdd(member);check(typeof name==='string','Synchronous native ship name required');member.shipName=name;
 }
 member.fleetDataRef=fleet.dataRef;
 check(typeof services?.getCaptain==='function','Actual FleetMember.getCaptain lifecycle required');
 const captain=services.getCaptain(member);check(captain&&typeof captain.objectRef==='string'&&typeof captain.then!=='function','Native getCaptain must resolve an actual person synchronously');
 member.isFlagship=false;dirtyOriginalFleetRoster(binding);
}
/** Indexed overload deliberately skips naming, captain, fleet reference and flagship changes. */
export function insertOriginalFleetRosterMember(binding,index,member){
 const fleet=current(binding);check(Number.isInteger(index)&&index>=0&&index<=fleet.members.length,'Native insertion index out of bounds');
 check(member&&['SHIP','FIGHTER_WING','NULL'].includes(member.type),'Actual member required');fleet.members.splice(index,0,member);dirtyOriginalFleetRoster(binding);
}
export function removeOriginalFleetRosterMember(binding,member){const fleet=current(binding);check(member,'Actual member required');const i=fleet.members.indexOf(member);if(i>=0)fleet.members.splice(i,1);dirtyOriginalFleetRoster(binding);member.fleetDataRef=null;}
function nativeNullMember(binding){const nil=current(binding).nullMember;check(nil?.type==='NULL'&&nil.variant===null&&nil.stats===null&&nil.status?.modules?.length===1,'Actual shared FleetData NULL_MEMBER required');return nil;}
function expandSlots(binding,index){const members=current(binding).members,nil=nativeNullMember(binding);check(index<4096,'Native roster work limit');while(members.length<index+1)members.push(nil);return members;}
/** Different from addFleetMember(index,member): this overload extends the list and binds the member. */
export function insertOriginalFleetRosterAtIndex(binding,member,index,services){
 check(Number.isInteger(index),'Native integer member index required');if(index<0){addOriginalFleetRosterMember(binding,member,services);return;}
 const members=expandSlots(binding,index);member.fleetDataRef=current(binding).dataRef;members.splice(index,0,member);dirtyOriginalFleetRoster(binding);
}
export function setOriginalFleetRosterAtIndex(binding,member,index,services){
 check(Number.isInteger(index),'Native integer member index required');if(index<0){addOriginalFleetRosterMember(binding,member,services);return;}
 const members=expandSlots(binding,index);member.fleetDataRef=current(binding).dataRef;members[index]=member;dirtyOriginalFleetRoster(binding);
}
export function removeOriginalFleetRosterAtIndex(binding,index){
 check(Number.isInteger(index),'Native integer member index required');const members=current(binding).members;if(index<0||index>=members.length)return;
 const nil=nativeNullMember(binding),old=members[index];if(old!==null&&old!==nil)old.fleetDataRef=null;members[index]=nil;dirtyOriginalFleetRoster(binding);
}
export function removeOriginalFleetRosterWithoutCollapse(binding,member){removeOriginalFleetRosterAtIndex(binding,current(binding).members.indexOf(member));member.fleetDataRef=null;}
export function clearOriginalFleetRoster(binding,detach=true){check(typeof detach==='boolean','Actual detach option required');const fleet=current(binding);if(detach)for(const m of fleet.members)m.fleetDataRef=null;fleet.members.length=0;dirtyOriginalFleetRoster(binding);}
export function originalFleetRosterAtIndex(binding,index){check(Number.isInteger(index),'Native integer member index required');const members=current(binding).members;if(index<0||index>=members.length)return null;return members[index].type==='NULL'?null:members[index];}
export function swapOriginalFleetRosterMembers(binding,a,b){const fleet=current(binding),i=fleet.members.indexOf(a),j=fleet.members.indexOf(b);if(i>=0&&j>=0){fleet.members[i]=b;fleet.members[j]=a;}syncOriginalMemberLists(fleet);}
export function collapseOriginalFleetRosterSlots(binding){const members=current(binding).members;for(let i=members.length-1;i>=0;i--)if(members[i].type==='NULL')members.splice(i,1);}
function mothballed(member){check(typeof member.repairTracker?.mothballed==='boolean','Actual member mothball state required');return member.repairTracker.mothballed;}
export function sortOriginalFleetRoster(binding,services,preferredHullSize=null){
 const fleet=current(binding);dirtyOriginalFleetRoster(binding);synchronizeOriginalFleet(fleet,services);
 if(fleet.membersWithoutNull===null||fleet.members===null)return;
 check(preferredHullSize===null||Number.isInteger(preferredHullSize)&&preferredHullSize>=0&&preferredHullSize<=5,'Invalid preferred hull size');
 const ordered=[...fleet.membersWithoutNull].sort((a,b)=>{
  const am=mothballed(a),bm=mothballed(b);if(am!==bm)return am?1:-1;
  const as=originalConstructedMemberHullSize(a),bs=originalConstructedMemberHullSize(b);
  if(as===preferredHullSize&&bs!==preferredHullSize)return -1;if(as!==preferredHullSize&&bs===preferredHullSize)return 1;
  return bs-as||originalFleetPointCost(b)-originalFleetPointCost(a);
 });
 fleet.members.length=0;for(const m of ordered)addOriginalFleetRosterMember(binding,m,services);synchronizeOriginalFleet(fleet,services);
}
export function sortOriginalFleetRosterToMatchOrder(binding,order,services){
 const fleet=current(binding);dirtyOriginalFleetRoster(binding);synchronizeOriginalFleet(fleet,services);
 if(fleet.membersWithoutNull===null||fleet.members===null)return;
 const remaining=[...fleet.membersWithoutNull];fleet.members.length=0;
 for(const requested of order){check(typeof requested.id==='string','Actual native member ID required');const i=remaining.findIndex(m=>m.id===requested.id);if(i<0)continue;addOriginalFleetRosterMember(binding,remaining[i],services);remaining.splice(i,1);}
 for(const m of remaining)addOriginalFleetRosterMember(binding,m,services);
 // Original leaves this dirty; unlike sort(), it has no final syncIfNeeded().
}
/** CampaignFleet.getFlagship's lists-only query, including fallback, used by FleetMember.getCaptain. */
function flagship(binding,services){
 const fleet=current(binding),previous=fleet.synchronization.onlySyncMemberLists;fleet.synchronization.onlySyncMemberLists=true;
 const list=originalFleetRosterMembers(binding,services);check(Array.isArray(list),'Actual player flagship roster unavailable');let first=null,result=null;
 for(const m of list){if(m.type==='NULL'||m.type==='FIGHTER_WING')continue;if(m.isFlagship){result=m;break;}first??=m;}
 fleet.synchronization.onlySyncMemberLists=previous;return result??first??list[0]??null;
}
/** Binds real construction and member management; unknown fleet stats/plugins still reject in sync. */
export function originalFleetRosterServices(binding,factory,player,plugins={},lifecycle={}){
 const fleet=current(binding),services={...lifecycle};
 const bindPerson=p=>{check(Array.isArray(fleet.statPeople),'Actual fleet skill-person lookup required');const old=fleet.statPeople.find(v=>v.objectRef===p.objectRef);check(!old||old===p,'Split fleet captain lookup');if(!old)fleet.statPeople.push(p);return p;};
 // Indexed overloads bind references without calling getCaptain. Populate only the lookup projection
 // before stats consume those direct Person handles; do not add native getCaptain side effects.
 services.updateMemberStats??=((m,f)=>{for(const ref of [m.captainRef,m.fleetCommanderForStatsRef,originalFleetCommanderRef(f)])if(ref!==null&&ref!==undefined)bindPerson(originalPersonnelByRef(player,ref));updateOriginalMemberStats(m,f,plugins);});
 services.nameOnAdd??=(m=>pickOriginalFleetMemberNameOnAdd(factory,binding.naming,m,binding.shipNameRandom));
 services.getCaptain??=(m=>{
  // This array is a lookup projection. Keep the underlying captain available even when getCaptain
  // temporarily returns the player for a flagship that addFleetMember is about to unflag.
  let captain=null;if(m.captainRef!==null){captain=bindPerson(originalPersonnelByRef(player,m.captainRef));if(m.captain!==undefined)check(m.captain===captain,'Lost shared captain identity');}
  if(m.isFlagship&&m.fleetDataRef!==null&&player.fleet?.nativeSyncScope==='native-fleet-data-sync-inputs'&&flagship({fleet:player.fleet},services)===m)return player.player;
  if(captain===null){
   const faction=fleet.attachedToCampaignFleet?(services.fleetFactionId?.(fleet)??fleet.factionId):null;if(fleet.attachedToCampaignFleet)check(typeof faction==='string','Actual attached fleet faction required for lazy captain');
   captain=createOriginalDefaultFleetCaptain(player);if(fleet.attachedToCampaignFleet)captain.factionId=faction;m.captainRef=captain.objectRef;m.captain=captain;bindPerson(captain);
  }
  return captain;
 });
 return {...originalFleetMemberConstructionServices(factory,player,binding.naming,plugins),
  getCaptain:m=>services.getCaptain(m),
  addMember:m=>addOriginalFleetRosterMember(binding,m,services),removeMember:m=>removeOriginalFleetRosterMember(binding,m),
  membersCopy:()=>originalFleetRosterMembersCopy(binding,services),numMembers:()=>originalFleetRosterSize(binding,services),
  sortFleet:()=>sortOriginalFleetRoster(binding,services),sortPreferred:size=>sortOriginalFleetRoster(binding,services,size),
  sortToMatchOrder:order=>sortOriginalFleetRosterToMatchOrder(binding,order,services),
  sortedMembers:()=>originalFleetRosterSortedMembers(binding,services),sync:()=>synchronizeOriginalFleet(fleet,services),
  getMemberAtIndex:i=>originalFleetRosterAtIndex(binding,i),setMemberAtIndex:(m,i)=>setOriginalFleetRosterAtIndex(binding,m,i,services),insertMemberAtIndex:(m,i)=>insertOriginalFleetRosterAtIndex(binding,m,i,services),removeMemberAtIndex:i=>removeOriginalFleetRosterAtIndex(binding,i),removeWithoutCollapse:m=>removeOriginalFleetRosterWithoutCollapse(binding,m),clear:(detach=true)=>clearOriginalFleetRoster(binding,detach),
  insertMember:(i,m)=>insertOriginalFleetRosterMember(binding,i,m),swapMembers:(a,b)=>swapOriginalFleetRosterMembers(binding,a,b),collapseEmptySlots:()=>collapseOriginalFleetRosterSlots(binding),
 };
}
