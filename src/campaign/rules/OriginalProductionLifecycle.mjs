/** Real BaseIndustry/production lifecycle. Requires a complete market Memory, never inferred from captured flags. */
import {requireThat} from '../core/Values.mjs';
import {blank,functional} from './OriginalIndustryState.mjs';
import {ORIGINAL_MILITARY_BASES as catalog} from './OriginalMilitaryBases.mjs';
import {ORIGINAL_PRODUCTION_INDUSTRIES as P,newOriginalProductionIndustry,unapplyOriginalProductionIndustry,unapplyOriginalProductionItem} from './OriginalProductionIndustries.mjs';
import {advanceOriginalBaseIndustryFrame} from './OriginalBaseIndustryFrame.mjs';
import {originalIndustryDisruptionKey} from './OriginalIndustryRuntime.mjs';
import {validateOriginalCampaignMemory,originalCampaignMemoryContains,originalCampaignMemoryBoolean,setOriginalCampaignMemory,unsetOriginalCampaignMemory} from './OriginalCampaignMemory.mjs';
import {updateOriginalHeavyIndustryPollution} from './OriginalHeavyIndustryPollution.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_PRODUCTION_LIFECYCLE',m),float=v=>Number.isFinite(v)&&f(v)===v;
const supported=id=>Object.hasOwn(P.industries,id),heavy=id=>supported(id)&&P.industries[id].className==='HeavyIndustry';
function current(m,id){const row=m.productionLifecycle?.industries.find(row=>row.active&&row.entry.state.industryId===id);check(row,'Actual active production industry required');return row;}
function spec(id){check(supported(id),'Actual production plugin required');return catalog.industrySpecs[id];}
export function restoreOriginalProductionLifecycle(saved,m,shareSpecial=value=>value){
 const selected=saved.industries.filter(i=>supported(i.industryId));
 if(selected.some(i=>!Object.hasOwn(i,'buildCostOverride')||!Object.hasOwn(i,'specialItem')||!i.runtimeInput||heavy(i.industryId)&&!i.heavyPollution))return null;
 const disruptions=[];for(const i of selected){const d=i.runtimeInput.disruption,old=disruptions.find(row=>row.key===d.key);check(!old||JSON.stringify(old)===JSON.stringify(d),'Conflicting shared production disruption capture');if(!old)disruptions.push(structuredClone(d));}
 return {scope:'native-production-industry-lifecycle',nextObjectId:0,memory:null,disruptions,messages:[],industries:selected.map(i=>({objectRef:i.objectRef,active:true,entry:m.industries.find(e=>e.state.industryId===i.industryId),finances:m.finances.find(e=>e.industryId===i.industryId),buildProgress:i.buildProgress,buildTime:Math.max(1,i.buildTime??0),buildCostOverride:i.buildCostOverride,wasDisrupted:i.wasDisrupted,special:i.specialItem?shareSpecial(structuredClone(i.specialItem)):null,pollution:heavy(i.industryId)?structuredClone(i.heavyPollution):null}))};
}
export function validateOriginalProductionLifecycle(m){
 const s=m.productionLifecycle;check(s?.scope==='native-production-industry-lifecycle'&&Number.isSafeInteger(s.nextObjectId)&&s.nextObjectId>=0&&Array.isArray(s.industries)&&new Set(s.industries.map(row=>row.objectRef)).size===s.industries.length&&Array.isArray(s.messages),'Actual production lifecycle state required');
 if(s.memory!==null){validateOriginalCampaignMemory(s.memory);check(s.disruptions===null,'Bound production lifecycle cannot keep a second disruption state');}else{const keys=new Set(s.industries.map(row=>originalIndustryDisruptionKey(row.entry.state.industryId)));check(Array.isArray(s.disruptions)&&s.disruptions.length===keys.size&&new Set(s.disruptions.map(d=>d.key)).size===keys.size&&s.disruptions.every(d=>keys.has(d.key)&&typeof d.present==='boolean'&&Array.isArray(d.expires)&&d.expires.every(float)&&(d.present?['boolean','string','number'].includes(typeof d.value):d.value===null)),'Actual complete unbound disruption capture required');}
 check(new Set(s.industries.map(row=>row.entry)).size===s.industries.length&&new Set(s.industries.map(row=>row.finances)).size===s.industries.length,'Split production instance identities');
 const pollutionStates=s.industries.filter(row=>row.pollution!==null).map(row=>row.pollution);check(new Set(pollutionStates).size===pollutionStates.length,'Each HeavyIndustry owns separate pollution history');
 for(const row of s.industries){const id=row.entry?.state.industryId;check(supported(id)&&typeof row.objectRef==='string'&&typeof row.active==='boolean'&&typeof row.wasDisrupted==='boolean','Invalid production industry row');functional(row.entry.operating);
  check(float(row.buildProgress)&&float(row.buildTime)&&row.buildTime>=1&&(row.buildCostOverride===null||float(row.buildCostOverride)),'Actual BaseIndustry floats required');
  check(m.industries.includes(row.entry)===row.active&&m.finances.includes(row.finances)===row.active&&row.finances.industryId===id,'Lost shared production industry/finance identity');
  check((row.special?.id??null)===row.entry.modifiers.specialItemId&&(row.special===null||typeof row.special.objectRef==='string'&&Object.hasOwn(P.items,row.special.id)&&P.items[row.special.id].industryIds.includes(id)),'Lost supported production SpecialItemData');
  if(heavy(id))check(row.pollution&&float(row.pollution.daysWithNanoforge)&&row.pollution.daysWithNanoforge>=0&&typeof row.pollution.permaPollution==='boolean'&&typeof row.pollution.addedPollution==='boolean','Actual heavy pollution history required');else check(row.pollution===null,'Unexpected pollution plugin state');
 }
 check(m.industries.filter(e=>supported(e.state.industryId)).every(e=>s.industries.some(row=>row.active&&row.entry===e)),'Missing current production instance');return s;
}
export function bindOriginalProductionMemory(m,memory){
 const s=validateOriginalProductionLifecycle(m);validateOriginalCampaignMemory(memory);
 if(s.memory!==null){check(s.memory===memory,'Cannot replace bound production Memory');return;}
 for(const d of s.disruptions){const data=memory.data.find(row=>row.key===d.key),expires=memory.expire.filter(row=>row.key===d.key);check(Boolean(data)===d.present&&(!d.present||Object.is(data.value,d.value))&&expires.length===d.expires.length&&expires.every((row,i)=>Object.is(row.timeLeft,d.expires[i])),'Complete Memory disagrees with captured production disruption');}
 s.memory=memory;s.disruptions=null;
}
function memory(m){const s=validateOriginalProductionLifecycle(m);check(s.memory!==null,'Production frames require complete bound market Memory');return s.memory;}
function isDisrupted(m,row,services){const mem=memory(m),key=originalIndustryDisruptionKey(row.entry.state.industryId),value=originalCampaignMemoryContains(mem,key,services)&&originalCampaignMemoryBoolean(mem,key,services);row.entry.operating.disrupted=value;return value;}
export function syncOriginalProductionDisruption(m,services={}){for(const row of validateOriginalProductionLifecycle(m).industries)isDisrupted(m,row,services);}
export function setOriginalProductionDisrupted(m,id,days,useMax=false,services={}){
 const row=current(m,id),mem=memory(m),key=originalIndustryDisruptionKey(id);check(float(days)&&typeof useMax==='boolean','Actual disruption duration required');isDisrupted(m,row,services);
 const duration=useMax?Math.max(days,mem.expire.find(e=>e.key===key)?.timeLeft??-1):days;if(duration<=0)unsetOriginalCampaignMemory(mem,key,services);else setOriginalCampaignMemory(mem,key,true,duration);
 // All five supported plugins inherit the empty notifyDisrupted and disruptionFinished hooks.
 syncOriginalProductionDisruption(m,services);return row.entry.operating.disrupted;
}
export function unapplyOriginalProductionRow(m,row){const result=unapplyOriginalProductionIndustry({state:row.entry.state,productionQuality:m.production.productionQuality,specialItemId:row.entry.modifiers.specialItemId});row.entry.state=structuredClone(result.state);for(const channel of ['flat','percent','mult'])m.production.productionQuality[channel].splice(0,m.production.productionQuality[channel].length,...structuredClone(result.productionQuality[channel]));}
function pollution(m,row,event,days,runtime){
 if(!heavy(row.entry.state.industryId))return;
 const result=updateOriginalHeavyIndustryPollution({state:row.pollution,event,days,specialItemId:row.entry.modifiers.specialItemId,habitable:m.conditions.some(c=>c.id==='habitable'),pollutionPresent:m.conditions.some(c=>c.id==='pollution')});
 if(event==='advance'&&row.special!==null)row.pollution.daysWithNanoforge=result.state.daysWithNanoforge;
 for(const effect of result.conditionEffects){if(effect.action==='add')runtime.addPollution();else runtime.removePollution();}Object.assign(row.pollution,result.state);
}
export function setOriginalProductionSpecialItem(m,row,special,runtime){
 check(special===null||typeof special.objectRef==='string'&&P.items[special.id]?.industryIds.includes(row.entry.state.industryId),'Actual compatible SpecialItemData required');
 unapplyOriginalProductionItem(row.entry.state,m.production.productionQuality,row.entry.modifiers.specialItemId);row.special=special;row.entry.modifiers.specialItemId=special?.id??null;pollution(m,row,'special-item-set',null,runtime);
}
function message(m,row,runtime){if(m.playerOwned)m.productionLifecycle.messages.push({marketId:m.marketId,industryId:row.entry.state.industryId,industryRef:row.objectRef,kind:'finished',timestamp:runtime.timestamp(),clickAction:'COLONY_INFO'});}
export function instantiateOriginalProductionIndustry(m,id){
 validateOriginalProductionLifecycle(m);spec(id);
 const row={objectRef:'created-production-industry:'+m.objectRef+':'+m.productionLifecycle.nextObjectId++,active:false,entry:{state:structuredClone(newOriginalProductionIndustry(id)),operating:{building:false,upgradeId:null,disrupted:false},modifiers:{aiCoreId:null,improved:false,specialItemId:null,adminSupplyBonus:0,adminDemandReduction:0,supplyBonusFromOther:blank(),demandReductionFromOther:blank()}},finances:{industryId:id,income:blank(),upkeep:blank()},buildProgress:0,buildTime:1,buildCostOverride:null,wasDisrupted:false,special:null,pollution:heavy(id)?{daysWithNanoforge:0,permaPollution:false,addedPollution:false}:null};
 return row;
}
export function addOriginalProductionIndustry(m,id,runtime){
 const existing=m.productionLifecycle.industries.find(row=>row.active&&row.entry.state.industryId===id);if(existing)return existing;
 const row=instantiateOriginalProductionIndustry(m,id);memory(m);row.active=true;
 m.productionLifecycle.industries.push(row);m.industries.push(row.entry);m.finances.push(row.finances);isDisrupted(m,row,runtime.memoryServices);runtime.apply(row);return row;
}
export function startBuildingOriginalProductionIndustry(m,row){row.entry.operating.building=true;row.entry.operating.upgradeId=null;row.buildProgress=0;row.buildTime=spec(row.entry.state.industryId).buildTime;unapplyOriginalProductionRow(m,row);}
function reapply(m,row,runtime){unapplyOriginalProductionRow(m,row);runtime.apply(row);}
function finish(m,row,runtime){
 const e=row.entry;e.operating.building=false;row.buildProgress=0;row.buildTime=1;
 if(e.operating.upgradeId!==null){const target=e.operating.upgradeId;spec(target);unapplyOriginalProductionRow(m,row);m.industries.splice(m.industries.indexOf(e),1);m.finances.splice(m.finances.indexOf(row.finances),1);row.active=false;
  const next=addOriginalProductionIndustry(m,target,runtime);next.entry.modifiers.aiCoreId=e.modifiers.aiCoreId;next.entry.modifiers.improved=e.modifiers.improved;message(m,next,runtime);setOriginalProductionSpecialItem(m,next,row.special,runtime);reapply(m,next,runtime);return next.objectRef;
 }
 message(m,row,runtime);runtime.buildNextInQueue();reapply(m,row,runtime);return row.objectRef;
}
export function startOriginalProductionUpgrade(m,id){const row=current(m,id),target=spec(id).upgradeId;check(target!==null&&supported(target),'Actual supported production upgrade required');row.entry.operating.building=true;row.entry.operating.upgradeId=target;row.buildProgress=0;row.buildTime=spec(target).buildTime;}
export function cancelOriginalProductionUpgrade(m,id){const row=current(m,id);row.entry.operating.building=false;row.entry.operating.upgradeId=null;row.buildProgress=0;}
export function advanceOriginalProductionIndustryFrame(m,row,days,runtime,{colonyDebug=false}={}){
 const s=validateOriginalProductionLifecycle(m);check(s.industries.includes(row),'Actual current or retained industry instance required');memory(m);
 const finishedRef=advanceOriginalBaseIndustryFrame(row,days,{colonyDebug},{isDisrupted:()=>isDisrupted(m,row,runtime.memoryServices),disruptionFinished:()=>{},finishBuildingOrUpgrading:()=>finish(m,row,runtime)});
 // Continue this exact old instance after an upgrade; never substitute the replacement's pollution history.
 pollution(m,row,'advance',days,runtime);return {scope:'native-production-industry-frame',industryRef:row.objectRef,finishedRef};
}
