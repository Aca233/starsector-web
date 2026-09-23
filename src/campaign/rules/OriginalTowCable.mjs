/** Native TowCable member effect. Persistent identity belongs to the Sector entry, not to a fleet.
 * An unknown imported entry is null at the owner; never reconstruct it from active target buffs. */
import {requireThat} from '../core/Values.mjs';
import R from '../data/reference-fleet-sync.json' with {type:'json'};
import {synchronizeOriginalFleet} from './OriginalFleetData.mjs';
import {getOriginalMemberStats,originalMemberPlayerCommander} from './OriginalMemberEffects.mjs';
import {originalMemberCrewFraction,originalMemberCurrentCR} from './OriginalFleetMemberStats.mjs';
import {resolveOriginalEconomyMutable as effective} from './OriginalMarketEconomy.mjs';
import {addOriginalMemberBuff,getOriginalMemberBuff,removeOriginalMemberBuff} from './OriginalMemberBuffs.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_TOW_CABLE',m);
const HULLMOD='tow_cable',KEY='TowCable_PersistentBuffs',BUFF='com.fs.starfarer.api.impl.campaign.TowCable$TowCableBuff';
/** Only for a genuinely new Sector with this key known absent, not an imported save. */
export function createOriginalTowCablePersistentEntry(){return {scope:'native-sector-tow-cable-entry',key:KEY,entries:null};}
export function validateOriginalTowCablePersistentEntry(state,knownMembers=[]){
 check(state?.scope==='native-sector-tow-cable-entry'&&state.key===KEY,'Actual Sector persistent tow-cable entry required');
 check(state.entries===null||Array.isArray(state.entries)&&state.entries.length<=65536,'Invalid persistent tow-cable map');
 const members=new Map(),buffs=new Map(),keys=new Set();
 const bind=(map,value,label)=>{check(typeof value?.objectRef==='string','Actual '+label+' identity required');const old=map.get(value.objectRef);check(!old||old===value,'Split shared '+label+' identity');map.set(value.objectRef,value);};
 for(const member of [...knownMembers,...(state.entries??[]).map(row=>row.member)]){bind(members,member,'tow member');for(const buff of member.buffManager?.buffs??[])if(buff.objectRef!==undefined)bind(buffs,buff,'tow buff');}
 for(const row of state.entries??[]){check(!keys.has(row.member),'Duplicate persistent member key');keys.add(row.member);const buff=row.buff;bind(buffs,buff,'tow buff');check(buff.className===BUFF&&typeof buff.id==='string'&&Number.isInteger(buff.frames)&&buff.frames>=-2147483648&&buff.frames<=2147483647,'Invalid persistent native tow buff');}
 return state;
}
function getBuffBy(state,member,create){
 validateOriginalTowCablePersistentEntry(state);state.entries??=[];
 const existing=state.entries.find(row=>row.member===member);if(existing)return existing.buff;if(!create)return null;
 check(member.id===null||typeof member.id==='string','Actual member ID required');
 const buff={objectRef:'created-tow-cable-buff:'+member.objectRef,className:BUFF,id:'tow_cable_'+String(member.id),frames:0};state.entries.push({member,buff});return buff;
}
/** FleetMember.canBeDeployedForCombat reads current stats directly here; it does not call getStats. */
export function originalMemberCanDeployForCombat(member,fleet){
 check(typeof member.repairTracker?.mothballed==='boolean','Actual mothball state required');if(member.repairTracker.mothballed)return false;
 const context={playerCommander:originalMemberPlayerCommander(member,fleet)},cr=()=>originalMemberCurrentCR(member,fleet,context);
 if(member.type==='FIGHTER_WING'&&cr()<=0)return false;
 check(Number.isFinite(R.settings.noDeployCRPercent)&&Number.isFinite(R.settings.noDeployCrewPercent),'Audited combat-deployment settings required');
 return cr()>=f(R.settings.noDeployCRPercent*f(.01))&&originalMemberCrewFraction(member,fleet,context)>=f(R.settings.noDeployCrewPercent*f(.01));
}
export function originalMaxBurnWithoutTowCables(member,fleet){
 const burn=getOriginalMemberStats(member,fleet).maxBurnLevel;let sub=0;
 for(const mod of burn.modifiers.flat){check(typeof mod.id==='string','Actual modifier source required');if(mod.id.startsWith(HULLMOD))sub=f(sub+1);}
 return Math.max(0,f(effective(burn)-sub));
}
function membersCopy(fleet,services){synchronizeOriginalFleet(fleet,services);check(Array.isArray(fleet.membersWithoutNull),'Synchronized actual members required');return [...fleet.membersWithoutNull];}
function cleanUp(member,fleet,state,services){const buff=getBuffBy(state,member,false);if(buff!==null)for(const target of membersCopy(fleet,services))removeOriginalMemberBuff(target,buff.id);}
function slowest(all,cutoff,cables,fleet){let target=null,min=3.4028234663852886e38;
 for(const member of all){if(member.type==='FIGHTER_WING')continue;const base=originalMaxBurnWithoutTowCables(member,fleet),bonus=cables.get(member)??0,burn=f(base+f(bonus));if(bonus>=1||burn>=cutoff||!(burn<min))continue;min=burn;target=member;}return target;
}
/** amount is seconds at this hook, but native TowCable ignores its magnitude (including zero). */
export function advanceOriginalTowCable(member,_seconds,fleet,state,services={}){
 if(member.fleetDataRef===null)return;
 check(fleet?.dataRef===member.fleetDataRef,'Tow member belongs to a different FleetData');if(!fleet.attachedToCampaignFleet)return;
 check(typeof fleet.isPlayerFleet==='boolean','Actual player-fleet identity required');if(!fleet.isPlayerFleet)return;
 // Nested getMembers may invoke zero-time hullmod sync; retain the same Sector dependency.
 services={...services,towCableState:state};
 check(Array.isArray(member.variant?.effects?.hullMods),'Actual member hullmods required');
 if(!member.variant.effects.hullMods.includes(HULLMOD)||!originalMemberCanDeployForCombat(member,fleet)){cleanUp(member,fleet,state,services);return;}
 const all=membersCopy(fleet,services);let count=0,index=-1;
 for(const current of all){if(!originalMemberCanDeployForCombat(current,fleet)||!current.variant.effects.hullMods.includes(HULLMOD))continue;if(current===member)index=count;count++;}
 if(count<=0||index===-1){cleanUp(member,fleet,state,services);return;}
 const buff=getBuffBy(state,member,true),cables=new Map(),speed=effective(getOriginalMemberStats(member,fleet).maxBurnLevel);let target=null;
 for(let cableIndex=0;cableIndex<count;cableIndex++){
  const candidate=slowest(all,speed,cables,fleet);if(candidate===null)break;cables.set(candidate,(cables.get(candidate)??0)+1);
  if(cableIndex===index){target=candidate;const existing=getOriginalMemberBuff(candidate,buff.id);buff.frames=0;if(existing!==buff)addOriginalMemberBuff(candidate,buff);break;}
 }
 for(const current of all)if(current!==target)removeOriginalMemberBuff(current,buff.id);
}
