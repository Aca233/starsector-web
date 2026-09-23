import {advanceOriginalTowCable} from './OriginalTowCable.mjs';
/** Registered HullModFleetEffect.onFleetSync and member campaign callbacks. */
import R from '../data/reference-fleet-sync.json' with {type:'json'};
import {requireThat} from '../core/Values.mjs';
import {put} from './OriginalIndustryState.mjs';
import {modifyOriginalNativeStatTarget} from './OriginalNativeFleetStats.mjs';
import {synchronizeOriginalFleet} from './OriginalFleetData.mjs';
import {originalEntityMemoryWithoutUpdate,originalCampaignMemoryBoolean,setOriginalCampaignMemory} from './OriginalCampaignMemory.mjs';
import {resolveOriginalEconomyMutable as effective} from './OriginalMarketEconomy.mjs';
import {getOriginalMemberStats,originalMemberPlayerCommander} from './OriginalMemberEffects.mjs';
import {originalMemberCurrentCR} from './OriginalFleetMemberStats.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_FLEET_EFFECT',m),prefix='com.fs.starfarer.api.impl.hullmods.';
const constants=name=>R.effectConstants[prefix+name].constants;
function members(fleet){check(Array.isArray(fleet.membersWithoutNull),'Synchronized native member list required');return fleet.membersWithoutNull;}
function cr(member,fleet){getOriginalMemberStats(member,fleet);return originalMemberCurrentCR(member,fleet,{playerCommander:originalMemberPlayerCommander(member,fleet)});}
const bonus=(base,modifiers)=>effective({base,modifiers});
const round=n=>Math.max(-2147483648,Math.min(2147483647,Math.floor(n+0.5)));
export function originalAdjustedHRSModifier(fleet,skipId=null,add=0){
 let max=0,total=0;for(const member of members(fleet)){
  if(member.repairTracker.mothballed||cr(member,fleet)<constants('HighResSensors').MIN_CR||skipId!==null&&member.id===skipId)continue;
  const s=getOriginalMemberStats(member,fleet);s.dynamic.hrs_sensor_range_mod??={flat:[],percent:[],mult:[]};const value=bonus(0,s.dynamic.hrs_sensor_range_mod);if(value<=0)continue;max=Math.max(max,value);total=f(total+value);
 }
 max=Math.max(max,add);total=f(total+add);if(max<=0)return 0;const units=f(total/max);if(units<=1)return max;
 const mult=f(f(Math.log(units)/Math.log(f(2.5)))+1);let result=f(f(total*mult)/units);if(result<=0)return 0;result=f(f(round(f(result*100)))/100);return Math.max(result,1);
}
/** Misc.findKth mutates the array; preserve that order for the subsequent float sum. */
export function originalTopKValuesSum(arr,k){
 k=Math.min(k,arr.length);const kth=arr.length-k;let value=-1;
 if(kth>=0&&kth<arr.length){let from=0,to=arr.length-1;while(from<to){let r=from,w=to;const mid=arr[Math.trunc((r+w)/2)];while(r<w){if(arr[r]>=mid){const tmp=arr[w];arr[w]=arr[r];arr[r]=tmp;w--;continue;}r++;}if(arr[r]>mid)r--;if(kth<=r)to=r;else from=r+1;}value=arr[kth];}
 let total=0,found=0;for(const n of arr)if(n>value){found++;total=f(total+n);}if(k>found)total=f(total+f(f(k-found)*value));return total;
}
export function originalPhaseFieldData(fleet,skipId=null,addProfile=0,addSensor=0){
 const profiles=[],sensors=[];for(const member of members(fleet)){
  if(skipId!==null&&member.id===skipId)continue;
  const s=getOriginalMemberStats(member,fleet);profiles.push(effective(s.sensorProfile));
  if(!member.repairTracker.mothballed&&cr(member,fleet)>=constants('PhaseField').MIN_CR&&member.variant.effects.hullMods.includes('phasefield'))sensors.push(effective(s.sensorStrength));
 }
 if(addProfile>0)profiles.push(addProfile);if(addSensor>0)sensors.push(addSensor);
 const profile=originalTopKValuesSum(profiles,R.settings.maxSensorShips),phaseSensors=originalTopKValuesSum(sensors,R.settings.maxSensorShips);
 let mult=f(profile/Math.max(f(profile+phaseSensors),1));if(phaseSensors<=0)mult=1;mult=Math.min(1,Math.max(constants('PhaseField').MIN_FIELD_MULT,mult));return {mult,profile,phaseSensors};
}
export function applyOriginalPhaseFieldFleetEffect(fleet){
 let {mult}=originalPhaseFieldData(fleet);check(typeof fleet.transponderOn==='boolean'&&fleet.stats?.detectedRangeMod,'Actual transponder and detected-range stat required');if(fleet.transponderOn)mult=1;
 const target=fleet.stats.targets.find(t=>t.value===fleet.stats.detectedRangeMod);check(target,'Actual shared detected-range target required');
 modifyOriginalNativeStatTarget(target,'mult','core_PhaseField',mult,{remove:mult<=0,description:'舰队中的相位舰'});
}
const syncHandlers={
 [prefix+'HighResSensors']:fleet=>{const value=originalAdjustedHRSModifier(fleet);check(fleet.stats?.sensorRangeMod,'Actual fleet sensor stat required');put({modifiers:fleet.stats.sensorRangeMod},'flat','core_HighResSensors',value,value<=0);},
 [prefix+'PhaseField']:applyOriginalPhaseFieldFleetEffect,
};
function invoke(fn,...args){check(typeof fn==='function','Unported fleet hullmod callback');const out=fn(...args);check(!out||typeof out.then!=='function','Fleet hullmod callbacks must be synchronous');}
export function reportOriginalHullmodFleetSync(fleet,plugins={}){for(const hook of R.fleetSyncHooks)invoke(Object.hasOwn(plugins,hook.script)?plugins[hook.script]:syncHandlers[hook.script],fleet);}
export function advanceOriginalMemberHullmods(member,seconds,fleet,plugins={},services={}){
 check(member.variant?.effects,'Actual member variant effects required');
 for(const id of member.variant.effects.hullMods){const info=R.hullmodLifecycle[id];check(info,'Unloaded hullmod: '+id);if(info.script!==null&&Object.hasOwn(plugins,info.script)){invoke(plugins[info.script],member,seconds,fleet);continue;}if(info.memberAdvance==='empty'||info.memberAdvance==='no-effect')continue;if(info.memberAdvance==='com.fs.starfarer.api.impl.campaign.TowCable'){advanceOriginalTowCable(member,seconds,fleet,services.readTowCableState?services.readTowCableState():services.towCableState,services);continue;}check(false,'Unported member campaign callback: '+info.memberAdvance);}
}
export function originalFleetwideTotalMod(fleet,key,base){let total=0;for(const m of members(fleet)){if(m.repairTracker.mothballed)continue;const s=getOriginalMemberStats(m,fleet);total=f(total+(Object.hasOwn(s.dynamic,key)?bonus(base,s.dynamic[key]):base));}return total;}

/** SpecStore.withAdvanceInCampaign registry in 0.98a-RC8 contains PhaseField only.
 * HighResSensors participates in sync, but explicitly returns false for this registry. */
export function advanceOriginalFleetCampaignHullmods(fleet,services={}){
 if(!fleet.isPlayerFleet)return;
 check(fleet.campaign?.entity,'Actual campaign entity memory required');const memory=originalEntityMemoryWithoutUpdate(fleet.campaign.entity);
 if(!originalCampaignMemoryBoolean(memory,'$updatedPhaseFieldModifier')&&originalCampaignMemoryBoolean(memory,'$justToggledTransponder')){
  synchronizeOriginalFleet(fleet,services);applyOriginalPhaseFieldFleetEffect(fleet);setOriginalCampaignMemory(memory,'$updatedPhaseFieldModifier',true,f(.1));
 }
}
