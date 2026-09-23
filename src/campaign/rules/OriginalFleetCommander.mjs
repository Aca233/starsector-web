/** FleetData.getCommander is NOT the nullable commander field used by sync/setCommander. */
import {requireThat} from '../core/Values.mjs';
import {modifyOriginalNativeStatTarget} from './OriginalNativeFleetStats.mjs';
const check=(value,message)=>requireThat(value,'UNSUPPORTED_NATIVE_FLEET_COMMANDER',message);
export function originalFleetCommanderRef(fleet){
 const ref=fleet.commanderRef??fleet.defaultCommanderRef??null;
 check(ref===null||typeof ref==='string','Actual commander reference required');return ref;
}
function personForField(fleet,ref){
 if(ref===null)return null;
 const found=fleet.statPeople.filter(p=>p.objectRef===ref);
 check(found.length===1&&found[0].stats?.nativeCharacterStatsVersion===1,'Actual shared commander CharacterStats required');return found[0];
}
/** Source setter: even the same Person is detached/rebound; only a different
 * Person triggers refresh(false). Never set Person.fleet or implicitly dirty/sync
 * FleetData. Services bind the actual global character refresh lifecycle. */
export function setOriginalFleetCommander(fleet,person,services){
 check(fleet?.nativeSyncScope==='native-fleet-data-sync-inputs'&&typeof fleet.attachedToCampaignFleet==='boolean'&&Array.isArray(fleet.statPeople),'Actual FleetData commander context required');
 check(fleet.commanderRef===null||typeof fleet.commanderRef==='string','Actual nullable commander field required');
 const old=personForField(fleet,fleet.commanderRef),changed=old!==person;
 if(person!==null){
  check(typeof person?.objectRef==='string'&&person.stats?.nativeCharacterStatsVersion===1,'Actual new commander Person/CharacterStats required');
  const existing=fleet.statPeople.filter(p=>p.objectRef===person.objectRef);
  check(existing.length<=1&&(!existing.length||existing[0]===person),'Split commander Person identity');
  if(changed)check(typeof services?.refreshCharacterStatsEffects==='function','Actual commander character refresh required');
  if(existing.length===0)fleet.statPeople.push(person);
 }
 if(old!==null)old.stats.fleetRef=null;
 fleet.commanderRef=person?.objectRef??null;
 if(person!==null)person.stats.fleetRef=fleet.attachedToCampaignFleet?fleet.objectRef:null;
 // This capture field projects getCommander().getStats(), not native mutable state.
 // Refresh callbacks must already see the new getter target, not the old projection.
 // Missing historical defaultCommander is left unavailable, never invented.
 const effective=originalFleetCommanderRef(fleet);
 fleet.commanderTravelSpeedBonus=effective===null?null:personForField(fleet,effective).stats.travelSpeedBonus;
 if(person!==null&&changed){const result=services.refreshCharacterStatsEffects(person,false);check(!result||typeof result.then!=='function','Commander refresh must be synchronous');}
 return person;
}
/** Only CampaignFleet constructor's random-person/command-points/setCommander
 * subphase. The caller still owes BaseCampaignEntity, view, accidents, logistics,
 * sensors and world registration before claiming a constructed CampaignFleet. */
export function initializeOriginalCampaignFleetCommander(fleet,services){
 check(fleet.commanderRef===null,'Commander initialization requires a fresh nullable commander field');
 check(typeof services?.createRandomPerson==='function','Actual faction random-person factory required');
 const person=services.createRandomPerson(),stats=person?.stats;
 check(stats?.nativeCharacterStatsVersion===1&&Array.isArray(stats.targets),'Actual generated commander CharacterStats required');
 const target=stats.targets.find(t=>t.objectRef===stats.fields.commandPoints);
 check(target?.kind==='mutable'&&target.value===stats.commandPoints,'Actual shared command-points stat required');
 modifyOriginalNativeStatTarget(target,'flat','default_commander',10);
 return setOriginalFleetCommander(fleet,person,services);
}
