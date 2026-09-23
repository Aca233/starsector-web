import {originalFleetCommanderRef} from './OriginalFleetCommander.mjs';
import {originalNativeCommanderStats} from './OriginalNativeCharacterStats.mjs';
import {restoreOriginalFleetStats} from './OriginalNativeFleetStats.mjs';
import {advanceOriginalMemberBuffs,applyOriginalMemberBuffs} from './OriginalMemberBuffs.mjs';
import {reportOriginalHullmodFleetSync,advanceOriginalMemberHullmods,originalFleetwideTotalMod} from './OriginalFleetEffects.mjs';
import {originalNativeMemberStrength} from './OriginalNativeStrength.mjs';
import {updateOriginalNativeFleetCounts,updateOriginalNativeFleetSizeCount} from './OriginalNativeFleetCounts.mjs';
import {advanceOriginalNativeFleetLogistics} from './OriginalNativeLogistics.mjs';
/** Native fleet sync lifecycle; character/world services must still provide actual current state. */
import reference from '../data/reference-fleet-sync.json' with {type:'json'};
import {updateOriginalMemberStats,applyOriginalCommanderFleetwideStats,setOriginalCommanderStatsFleet,originalMemberPlayerCommander} from './OriginalMemberEffects.mjs';
import {createOriginalFleetMemberStats,updateOriginalMemberCrewAndCRStats,updateOriginalMemberRepairRates,unmodifyOriginalMemberStat} from './OriginalFleetMemberStats.mjs';
import { immutableJSON, requireThat,canonicalJSON } from '../core/Values.mjs';
import { resolveOriginalEconomyMutable,resolveOriginalEconomyBonus } from './OriginalMarketEconomy.mjs';
import { ORIGINAL_MARKET_REFERENCE } from './OriginalMarketPricing.mjs';
import { originalResourceQuantity,validateOriginalResourceCargo } from './OriginalResourceCargo.mjs';
export const ORIGINAL_FLEET_SYNC=immutableJSON(reference);
const R=ORIGINAL_FLEET_SYNC,f=Math.fround,check=(ok,message)=>requireThat(ok,'UNSUPPORTED_NATIVE_FLEET_SYNC',message);
const truth=(value,label)=>{check(typeof value==='boolean','Actual Boolean required: '+label);return value;};
const number=(n,label)=>{check(typeof n==='number'&&Number.isFinite(n)&&n===f(n),'Actual finite native float required: '+label);return n;};
const int=n=>Number.isNaN(n)?0:Math.max(-2147483648,Math.min(2147483647,Math.trunc(n)));
const round=n=>int(Math.floor(number(n,'round operand')+0.5));
const blank=()=>({flat:[],percent:[],mult:[]});
const effective=(base,modifiers)=>resolveOriginalEconomyMutable({base,modifiers});
const own=(o,id)=>typeof id==='string'&&Object.hasOwn(o,id)?o[id]:undefined;
const call=(services,name,...args)=>{check(typeof services?.[name]==='function','Actual fleet lifecycle service required: '+name);const v=services[name](...args);check(!v||typeof v.then!=='function','Fleet lifecycle must be synchronous: '+name);return v;};
const playerCommander=(member,fleet,services)=>services?.isPlayerCommanderForStats?truth(call(services,'isPlayerCommanderForStats',member),'player commander'):originalMemberPlayerCommander(member,fleet);
function hull(member){const h=own(R.hulls,member.variant?.hullId);check(h,'Missing native hull inputs: '+member.variant?.hullId);return h;}
function wing(member){if(member.type!=='FIGHTER_WING')return null;const w=own(R.wings,member.specId);check(w,'Missing native wing inputs');return w;}
function updateStats(member,fleet,services){if(member.stats&&!member.forceNoMoreStatsUpdates)member.stats.lifecycle='rebuilding';if(services?.updateMemberStats)call(services,'updateMemberStats',member,fleet);else updateOriginalMemberStats(member,fleet);current(member);member.statUpdateNeeded=false;member.valuationLifecycle='current-fleet-variant';}
function current(member){check(member.type!=='NULL'&&member.stats?.lifecycle==='current','Actual member stat effects/CR lifecycle required');return member.stats;}
/** Complete native base stat creation, not a completed skills/hullmods updateStats operation. */
export function newOriginalFleetMemberStats(member){return createOriginalFleetMemberStats(member);}
export function applyOriginalMemberMothballStats(member){
 const s=member.stats;check(s&&member.repairTracker,'Actual member stats and repair tracker required');
 const set=(mod,value)=>{if(!member.repairTracker.mothballed){for(const channel of ['flat','percent','mult']){const a=mod[channel],i=a.findIndex(m=>m.id==='mothballed_mod_id');if(i>=0)a.splice(i,1);}return;}const a=mod.mult,i=a.findIndex(m=>m.id==='mothballed_mod_id'),row={id:'mothballed_mod_id',value};if(i<0)a.push(row);else a[i]=row;};
 set(s.suppliesPerMonth.modifiers,R.settings.supplyConsumptionMothballedMult);for(const key of ['cargoMod','fuelMod','maxCrewMod','minCrewMod'])set(s[key],0);
}
export function originalFleetPointCost(member){return wing(member)?.fleetPoints??hull(member).fleetPoints;}
export function originalMemberDeploymentPoints(member){const s=current(member),base=number(s.suppliesToRecover.base,'deployment base');s.dynamic.deployment_points_mod??=blank();return f(f(round(effective(base,s.dynamic.deployment_points_mod)))*f(wing(member)?.numFighters??1));}
export function originalMemberLogistics(member){const h=hull(member),s=current(member),count=f(wing(member)?.numFighters??1);return {
 cargo:f(int(effective(h.cargo,s.cargoMod))),fuel:f(int(effective(h.fuel,s.fuelMod))),
 minCrew:f(Math.ceil(f(effective(h.minCrew,s.minCrewMod)*count))),maxCrew:f(f(int(effective(h.maxCrew,s.maxCrewMod)))*count),
 fuelUse:f(effective(h.fuelUse,s.fuelUseMod)*count),maxBurn:resolveOriginalEconomyMutable(s.maxBurn),
 };}
export function originalCargoStackSpace(stack){
 if(stack===null)return 0;let unit;
 if(stack.type==='RESOURCES'){const spec=own(ORIGINAL_MARKET_REFERENCE.commodities,stack.commodityId);check(spec&&!spec.plugin,'Actual commodity cargo-space definition required');unit=spec.cargoSpace;}
 else if(stack.type==='WEAPONS'){unit=own(R.weaponSpace,stack.itemId);check(unit!==undefined,'Actual weapon size required for cargo space');}
 else if(stack.type==='SPECIAL'){unit=own(R.specialSpace,stack.itemId);check(unit!==undefined,'Actual special-item spec required for cargo space');}
 else if(stack.type==='FIGHTER_CHIP'||stack.type==='NULL')unit=1;
 else check(false,'Unsupported cargo-space stack type');
 return f(number(unit,'stack space')*number(stack.size,'stack size'));
}
export function updateOriginalFleetCargoSpace(cargo){validateOriginalResourceCargo(cargo);let sum=0;for(const s of cargo.slots)sum=f(sum+originalCargoStackSpace(s));cargo.spaceUsed=f(sum+number(cargo.extraCargoUsed,'extra cargo'));return cargo.spaceUsed;}
/** Preserve original members, separate from the sorted copy. This native comparator sorts FP only (javap verified). */
export function syncOriginalMemberLists(fleet){
 check(Array.isArray(fleet.members),'Complete non-compressed fleet roster required');fleet.cacheClearedOnSync={};fleet.membersWithoutNull=[];
 for(const member of fleet.members){check(member&&['SHIP','FIGHTER_WING','NULL'].includes(member.type),'Invalid actual member');if(member.type==='NULL')continue;member.fleetDataRef=fleet.dataRef;fleet.membersWithoutNull.push(member);}
 fleet.sortedMembersWithoutNull=[...fleet.membersWithoutNull].sort((a,b)=>(originalFleetPointCost(b)-originalFleetPointCost(a))|0);fleet.sortedMembersWithoutNullWithFighters=[];
}
function newCrew(fleet,member,crew){fleet.crewSerial=(fleet.crewSerial??0)+1;if(member.stats?.nativeMemberStatsVersion===1)unmodifyOriginalMemberStat(member.stats,'maxCombatReadiness','crew_fraction');member.crewComposition={objectRef:'created-crew:'+fleet.dataRef+':'+fleet.crewSerial,crew:number(crew,'assigned crew'),marines:0};}
export function recrewOriginalFleet(fleet,services){
 check(Array.isArray(fleet.membersWithoutNull)&&(!fleet.attachedToCampaignFleet||typeof fleet.aiMode==='boolean'),'Synchronized member list and actual AI mode required');let playerControlled=false;
 if(fleet.attachedToCampaignFleet&&fleet.aiMode){for(const m of fleet.membersWithoutNull){if(playerCommander(m,fleet,services)){playerControlled=true;continue;}newCrew(fleet,m,originalMemberLogistics(m).minCrew);}if(!playerControlled)return;}
 const selected=[];let minimum=0;
 for(const m of fleet.membersWithoutNull){if(m.repairTracker===null||playerControlled&&!playerCommander(m,fleet,services))continue;if(m.repairTracker.mothballed){newCrew(fleet,m,0);continue;}selected.push(m);minimum=f(minimum+originalMemberLogistics(m).minCrew);}
 const cargo=playerControlled?call(services,'playerCargoWithoutSync'):fleet.cargo;check(cargo,'Actual crew cargo required');let remaining=f(int(originalResourceQuantity(cargo,'crew')));const fraction=minimum===0?0:Math.min(1,f(remaining/minimum));
 for(const m of selected){const needed=originalMemberLogistics(m).minCrew,rounded=f(round(f(needed*fraction))),allocated=Math.min(remaining,rounded);remaining=f(remaining-allocated);newCrew(fleet,m,allocated);updateStats(m,fleet,services);}
}
export function updateOriginalFleetCapacities(fleet){
 check(Array.isArray(fleet.membersWithoutNull)&&fleet.cargo,'Actual fleet roster/cargo required');let fuel=0,cargo=0,minCrew=0,maxCrew=0,fuelUse=0;
 for(const m of fleet.membersWithoutNull){const v=originalMemberLogistics(m),count=f(wing(m)?.numFighters??1);fuel=f(fuel+f(v.fuel*count));cargo=f(cargo+f(v.cargo*count));minCrew=f(minCrew+v.minCrew);maxCrew=f(maxCrew+v.maxCrew);fuelUse=f(fuelUse+f(v.fuelUse*count));}
 fleet.cargo.maxFuel=fuel;fleet.cargo.maxCapacity=cargo;fleet.cargo.maxPersonnel=maxCrew;updateOriginalFleetCargoSpace(fleet.cargo);fleet.minCrew=minCrew;fleet.fuelPerLightYear=fuelUse===0?1:fuelUse;
}
/** FleetData.getMinBurnLevel on the current synchronized member list, including mothballed ships. */
export function originalFleetMinBurnLevel(fleet){
 check(Array.isArray(fleet.membersWithoutNull),'Actual member list required');let burn=f(3.4028234663852886e38);for(const m of fleet.membersWithoutNull)burn=Math.min(burn,originalMemberLogistics(m).maxBurn);return burn;
}
export function originalFleetBurnLevel(fleet){
 let burn=originalFleetMinBurnLevel(fleet);
 if(fleet.attachedToCampaignFleet){check(fleet.fleetwideMaxBurnMod,'Actual current fleetwide burn stat required');const previous=burn,bonus=resolveOriginalEconomyBonus(fleet.fleetwideMaxBurnMod);
   // Native empty fleets start at Float.MAX_VALUE, outside the economic DTO range.
   // Preserve float overflow and Math.round(float)'s NaN/saturating-int behavior;
   // only the final burn is clamped. Do not relax the external economy validator.
   burn=f(f(f(burn+f(f(burn*bonus.percent)/100))+bonus.flat)*bonus.mult);const lowered=previous>burn;burn=f(int(Math.floor(burn+.5)));if(lowered&&burn===previous)burn=f(burn-1);
  }
 if(burn<1&&burn>0)burn=1;return Math.max(0,Math.min(20,burn));
}
export function updateOriginalFleetTravelSpeed(fleet){
 if(fleet.membersWithoutNull.length===0){fleet.travelSpeed=200;return 200;}
 const burn=originalFleetBurnLevel(fleet),person=fleet.statPeople?.find(p=>p.objectRef===originalFleetCommanderRef(fleet)),travelBonus=person?.stats?.nativeCharacterStatsVersion===1?originalNativeCommanderStats(fleet).travelSpeedBonus:fleet.commanderTravelSpeedBonus;check(travelBonus,'Actual commander travel-speed stat required');let speed=f(f(Math.max(1,burn)*R.settings.speedPerBurnLevel)+R.settings.baseTravelSpeed);speed=Math.max(0,effective(speed,travelBonus));if(burn<=0)speed=R.settings.minTravelSpeed;fleet.travelSpeed=speed;return speed;
}
/** Run the original ordering on the shared fleet. On error the parent transaction must be discarded. */
export function synchronizeOriginalFleet(fleet,services={}){
 const sync=fleet?.synchronization;check(fleet&&sync&&fleet.nativeSyncScope==='native-fleet-data-sync-inputs','Full native member/sync input capture required');
 check(Array.isArray(fleet.syncUnresolved)&&fleet.syncUnresolved.length===0,'Fleet source dependencies remain unresolved');
 if(fleet.attachedToCampaignFleet&&!(services.fleetStatsAvailable?truth(call(services,'fleetStatsAvailable',fleet),'fleet stats available'):fleet.stats!==null&&fleet.stats!==undefined))return {phase:'fleet-stats-unavailable'};
 if(!sync.needsSync||sync.forceNoSync)return {phase:'not-needed'};
 if(!Array.isArray(fleet.members)||fleet.members.some(m=>m.type!=='NULL'&&m.repairTracker===null)){fleet.membersWithoutNull=[];return {phase:'load-order-wait'};}
 if(sync.onlySyncMemberLists){sync.needsSync=false;sync.forceNoSync=true;syncOriginalMemberLists(fleet);sync.forceNoSync=false;sync.lifecycle='member-lists-only';return {phase:'member-lists-only'};}
 sync.needsSync=false;sync.forceNoSync=true;sync.lifecycle='synchronizing';
 if(fleet.commanderRef!==null){if(services?.setCommanderStatsFleet)call(services,'setCommanderStatsFleet',fleet.commanderRef,fleet);else setOriginalCommanderStatsFleet(fleet.commanderRef,fleet);}
 syncOriginalMemberLists(fleet);
 for(const m of fleet.membersWithoutNull)updateStats(m,fleet,services);
 fleet.cacheClearedOnSync={};for(const m of fleet.membersWithoutNull){if(services?.applyCommanderFleetwideStats)call(services,'applyCommanderFleetwideStats',m,fleet);else applyOriginalCommanderFleetwideStats(m,fleet);}
 recrewOriginalFleet(fleet,services);
 if(fleet.attachedToCampaignFleet){if(services.reportAllHullmodFleetSync)call(services,'reportAllHullmodFleetSync',fleet);else reportOriginalHullmodFleetSync(fleet);}
 let points=0,strength=0;for(const m of fleet.members){if(m.type==='NULL')continue;points=f(points+f(originalFleetPointCost(m)));strength=f(strength+number(services.readMemberStrength?call(services,'readMemberStrength',m,true,true,true):originalNativeMemberStrength(m,fleet,true,true,true,services),'member strength'));}fleet.fleetPointsUsed=points;fleet.effectiveStrength=strength;
 updateOriginalFleetCapacities(fleet);updateOriginalFleetTravelSpeed(fleet);
 if(fleet.attachedToCampaignFleet&&fleet.logisticsRef!==null){if(services.advanceFleetLogistics)call(services,'advanceFleetLogistics',fleet,0);else advanceOriginalNativeFleetLogistics(fleet,0,services);}
 for(const m of fleet.membersWithoutNull){if(m.buffManagerRef!==null){if(services.advanceMemberBuffs)call(services,'advanceMemberBuffs',m,0);else advanceOriginalMemberBuffs(m,0,services.memberBuffPlugins);}if(m.variant!==null){if(services.advanceMemberHullmods)call(services,'advanceMemberHullmods',m,0);else advanceOriginalMemberHullmods(m,0,fleet,services.memberHullmodPlugins,services);}}
 for(const m of fleet.members){if(m.type==='NULL'||m.variant===null)continue;if(m.statUpdateNeeded)updateStats(m,fleet,services);if(services?.updateMemberCrewAndCRStats)call(services,'updateMemberCrewAndCRStats',m);else updateOriginalMemberCrewAndCRStats(m,fleet,{playerCommander:playerCommander(m,fleet,services)});if(m.buffManagerRef!==null){if(services.applyMemberBuffs)call(services,'applyMemberBuffs',m);else applyOriginalMemberBuffs(m,fleet,services.memberBuffPlugins);}if(services?.updateMemberRepairRates)call(services,'updateMemberRepairRates',m);else updateOriginalMemberRepairRates(m);}
 if(fleet.attachedToCampaignFleet){if(services.updateFleetCounts)call(services,'updateFleetCounts',fleet);else updateOriginalNativeFleetCounts(fleet);if(services.updateFleetSizeCount)call(services,'updateFleetSizeCount',fleet);else updateOriginalNativeFleetSizeCount(fleet);const bonus=number(services.readFleetwideTotalMod?call(services,'readFleetwideTotalMod',fleet,'fleet_burn_bonus',0):originalFleetwideTotalMod(fleet,'fleet_burn_bonus',0),'fleet burn bonus');check(fleet.fleetwideMaxBurnMod,'Actual fleetwide burn stat required');const a=fleet.fleetwideMaxBurnMod.flat,i=a.findIndex(m=>m.id==='burn_bonus_from_ships');if(bonus>0){const row={id:'burn_bonus_from_ships',value:bonus};if(i<0)a.push(row);else a[i]=row;}else if(i>=0)a.splice(i,1);}
 sync.forceNoSync=false;sync.needsSync=false;sync.lifecycle='current';return {phase:'synchronized'};
}
export function synchronizeOriginalPlayerFleet(player,services={}){return synchronizeOriginalFleet(player.fleet,services);}
export function originalPlayerDeploymentPoints(player,dependencies={}){
 const fleet=player.fleet;check(fleet?.nativeSyncScope==='native-fleet-data-sync-inputs','Native member roster required for deployment points');
 const sync=fleet.synchronization;if(!(sync.forceNoSync&&sync.lifecycle==='synchronizing')&&(sync.lifecycle!=='current'||sync.needsSync&&!sync.forceNoSync)){synchronizeOriginalPlayerFleet(player,dependencies.nativeFleetServices);check(sync.lifecycle==='current'&&(!sync.needsSync||sync.forceNoSync),'Fleet statistics remain unavailable');}
 check(Array.isArray(fleet.membersWithoutNull),'Current native fleet member list required');return fleet.membersWithoutNull.map(originalMemberDeploymentPoints);
}

/** Keep cached lists as shared member handles; a dirty fleet may legitimately retain an older cache. */
export function validateOriginalNativeFleet(fleet){
 check(fleet.nativeSyncScope==='native-fleet-data-sync-inputs'&&Array.isArray(fleet.syncUnresolved)&&Array.isArray(fleet.members)&&fleet.members.length<=4096,'Invalid native fleet capture');
 check(typeof fleet.attachedToCampaignFleet==='boolean'&&(typeof fleet.aiMode==='boolean'||fleet.aiMode===null),'Invalid fleet flags');
 if(fleet.stats)check(fleet.fleetStatsRef===fleet.stats.objectRef&&fleet.fleetwideMaxBurnMod===fleet.stats.fleetwideMaxBurnMod,'Lost shared fleet stats identity');
 const refs=new Map();for(const m of fleet.members){check(m&&typeof m.objectRef==='string'&&['SHIP','FIGHTER_WING','NULL'].includes(m.type),'Invalid fleet member');const old=refs.get(m.objectRef);check(!old||old===m,'Lost shared fleet member identity');refs.set(m.objectRef,m);}
 for(const key of ['membersWithoutNull','sortedMembersWithoutNull','sortedMembersWithoutNullWithFighters']){const list=fleet[key];check(list===null||Array.isArray(list),'Invalid fleet list cache');if(list)for(const m of list){check(m.type!=='NULL','NULL member in filtered list');const actual=refs.get(m.objectRef);if(actual)check(actual===m,'Lost cached member identity');}}
 if(fleet.counts?.mostExpensiveShip){const m=fleet.counts.mostExpensiveShip;check(!refs.has(m.objectRef)||refs.get(m.objectRef)===m,'Lost most-expensive member identity');}
 if(fleet.synchronization.lifecycle==='current'&&!fleet.synchronization.needsSync&&fleet.syncUnresolved.length===0){check(Array.isArray(fleet.membersWithoutNull),'Missing current member cache');const actual=fleet.members.filter(m=>m.type!=='NULL');check(actual.length===fleet.membersWithoutNull.length&&actual.every((m,i)=>m===fleet.membersWithoutNull[i]),'Current fleet roster differs from members');for(const m of actual)current(m);}
}

/** JSON captures duplicate shared handles; restore native caches and known stat aliases. */
export function restoreOriginalNativeFleet(fleet){
 const membersByRef=new Map(),buffsByRef=new Map(),statusesByRef=new Map(),modulesByRef=new Map(),eventsByRef=new Map();
 const bind=(map,value)=>{const old=map.get(value.objectRef);if(old){check(canonicalJSON(old)===canonicalJSON(value),'Conflicting captured fleet handle');return old;}map.set(value.objectRef,value);return value;};
 const member=value=>{
  if(value.stats?.nativeMemberStatsVersion===1){for(const [alias,key]of Object.entries({...R.memberStatAliases,maxBurn:'maxBurnLevel',fighterBays:'numFighterBays'})){check(canonicalJSON(value.stats[alias])===canonicalJSON(value.stats[key]),'Conflicting member stat alias');value.stats[alias]=value.stats[key];}}
  if(value.buffManager)for(let i=0;i<value.buffManager.buffs.length;i++){const b=value.buffManager.buffs[i];if(b.objectRef)value.buffManager.buffs[i]=bind(buffsByRef,b);}
  if(value.status?.modules){value.status.modules=value.status.modules.map(m=>bind(modulesByRef,m));check(value.status.hullFractions.length===value.status.modules.length&&value.status.hullFractions.every((v,i)=>v===value.status.modules[i].hullFraction),'Conflicting member hull projection');value.status=bind(statusesByRef,value.status);}
  if(value.repairTracker)for(const key of ['recentEvents','noSuppliesCRLoss'])if(value.repairTracker[key])value.repairTracker[key]=value.repairTracker[key].map(e=>e.objectRef?bind(eventsByRef,e):e);
  return bind(membersByRef,value);
 };
 fleet.members=fleet.members.map(member);for(const key of ['membersWithoutNull','sortedMembersWithoutNull','sortedMembersWithoutNullWithFighters'])if(fleet[key])fleet[key]=fleet[key].map(member);
 if(fleet.counts?.mostExpensiveShip)fleet.counts.mostExpensiveShip=member(fleet.counts.mostExpensiveShip);
 if(fleet.stats){restoreOriginalFleetStats(fleet.stats);check(canonicalJSON(fleet.fleetwideMaxBurnMod)===canonicalJSON(fleet.stats.fleetwideMaxBurnMod),'Conflicting fleet burn alias');fleet.fleetwideMaxBurnMod=fleet.stats.fleetwideMaxBurnMod;}
 return fleet;
}
