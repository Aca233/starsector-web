/** Native MilitaryBase/BaseIndustry lifecycle. Explicit industry phase, not Market.advance or fleet spawning. */
import {requireThat,immutableJSON} from '../core/Values.mjs';
import {buildNextOriginalConstructionQueue,validateOriginalConstructionQueue} from './OriginalConstructionQueue.mjs';
import {advanceOriginalBaseIndustryFrame} from './OriginalBaseIndustryFrame.mjs';
import {blank,put,functional} from './OriginalIndustryState.mjs';
import {newOriginalCivicIndustry} from './OriginalCivicIndustries.mjs';
import {ORIGINAL_MILITARY_BASES as R,unapplyOriginalMilitaryBase} from './OriginalMilitaryBases.mjs';
import {originalMemoryFlagBoolean,originalMemoryFlagExpire,setOriginalMemoryTrue,unsetOriginalMemoryFlag} from './OriginalMemoryFlags.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_MILITARY_LIFECYCLE',m);
export const MILITARY_DISRUPTION_KEY='$core_disrupted_MilitaryBase';
const nativeFloat=(v)=>Number.isFinite(v)&&f(v)===v;
const military=id=>Object.hasOwn(R.industries,id);
function spec(id){const result=R.industrySpecs[id];check(result,'Actual industry spec required');return result;}
function current(m,id){const row=m.industryLifecycle?.industries.find(row=>row.active&&row.entry.state.industryId===id);check(row,'Actual active military industry required');return row;}
export function restoreOriginalMilitaryLifecycle(saved,m,patrols,shareSpecial=value=>value){
 const queue=saved.industryInputCapture.marketEffects?.constructionQueueState;
 const selected=saved.industries.filter(i=>military(i.industryId));
 if(!queue||!m.military?.memory.keys.includes(MILITARY_DISRUPTION_KEY)||selected.some(i=>!Object.hasOwn(i,'buildCostOverride')||!patrols?.industries.some(p=>p.objectRef===i.objectRef)))return null;
 return {scope:'native-military-industry-lifecycle',nextObjectId:0,queue:m.constructionQueueState??structuredClone(queue),messages:[],industries:selected.map(i=>({
  objectRef:i.objectRef,active:true,entry:m.industries.find(e=>e.state.industryId===i.industryId),finances:m.finances.find(e=>e.industryId===i.industryId),patrol:patrols.industries.find(p=>p.objectRef===i.objectRef),
  buildProgress:i.buildProgress,buildTime:Math.max(1,i.buildTime??0),wasDisrupted:i.wasDisrupted,buildCostOverride:i.buildCostOverride,special:i.specialItem?shareSpecial(structuredClone(i.specialItem)):null,
 }))};
}
export function validateOriginalMilitaryLifecycle(m,patrols){
 const s=m.industryLifecycle;check(s?.scope==='native-military-industry-lifecycle'&&Number.isSafeInteger(s.nextObjectId)&&s.nextObjectId>=0,'Actual lifecycle capture required');
 validateOriginalConstructionQueue(m);
 check(Array.isArray(s.industries)&&new Set(s.industries.map(r=>r.objectRef)).size===s.industries.length&&Array.isArray(s.messages),'Invalid industry lifecycle roster');
 check(typeof s.queue?.objectRef==='string'&&Array.isArray(s.queue.items)&&s.queue.items.length===m.constructionQueue.length,'Invalid shared construction queue');
 s.queue.items.forEach((q,i)=>check(typeof q.objectRef==='string'&&q.industryId===m.constructionQueue[i]&&Number.isInteger(q.cost)&&q.cost>=-2147483648&&q.cost<=2147483647,'Queue projection or original cost was lost'));
 for(const row of s.industries){
  const id=row.entry?.state.industryId;check(military(id)&&typeof row.active==='boolean'&&typeof row.wasDisrupted==='boolean','Invalid military lifecycle plugin');
  check(nativeFloat(row.buildProgress)&&nativeFloat(row.buildTime)&&(row.buildCostOverride===null||nativeFloat(row.buildCostOverride)),'Actual construction floats required');
  check(row.patrol?.objectRef===row.objectRef&&patrols?.industries.includes(row.patrol)&&row.patrol.marketId===m.marketId&&row.patrol.industryId===id,'Lost shared military tracker identity');
  check(row.finances?.industryId===id&&m.industries.includes(row.entry)===row.active&&m.finances.includes(row.finances)===row.active,'Lost current/retired industry handles');
  check((row.special?.id??null)===row.entry.modifiers.specialItemId,'Lost installed special-item identity');functional(row.entry.operating);
 }
 check(m.industries.filter(e=>military(e.state.industryId)).every(e=>s.industries.some(r=>r.active&&r.entry===e)),'Missing active lifecycle object');
 return s;
}
export function syncOriginalMilitaryDisruption(m){
 const disrupted=originalMemoryFlagBoolean(m.military.memory,MILITARY_DISRUPTION_KEY);
 for(const row of m.industryLifecycle.industries)row.entry.operating.disrupted=disrupted;
 return disrupted;
}
export function setOriginalMilitaryDisrupted(m,id,days,useMax=false){
 current(m,id);check(nativeFloat(days)&&typeof useMax==='boolean','Actual disruption float required');
 const duration=useMax?Math.max(days,originalMemoryFlagExpire(m.military.memory,MILITARY_DISRUPTION_KEY)):days;
 if(duration<=0)unsetOriginalMemoryFlag(m.military.memory,MILITARY_DISRUPTION_KEY);else setOriginalMemoryTrue(m.military.memory,MILITARY_DISRUPTION_KEY,duration);
 // MilitaryBase inherits the empty notifyDisrupted; setting a flag is not an apply/unapply.
 return syncOriginalMilitaryDisruption(m);
}
export function instantiateOriginalMilitaryIndustry(m,id,runtime){
 check(military(id),'Non-military industry constructor/lifecycle is not connected');const s=m.industryLifecycle,ref='created-military-industry:'+m.objectRef+':'+s.nextObjectId++;
 const roll=runtime.randomDouble();check(Number.isFinite(roll)&&roll>=0&&roll<1,'Actual random double required for IntervalUtil constructor');
 const average=R.settings.averagePatrolSpawnInterval,min=f(average*f(0.7)),max=f(average*f(1.3));
 const tracker={objectRef:ref+':tracker',minInterval:min,maxInterval:max,currInterval:f(min+f(f(max-min)*f(roll))),elapsed:0,intervalElapsed:false,randomRef:null};
 const entry={state:structuredClone(newOriginalCivicIndustry(id)),operating:{building:false,upgradeId:null,disrupted:originalMemoryFlagBoolean(m.military.memory,MILITARY_DISRUPTION_KEY)},modifiers:{aiCoreId:null,improved:false,specialItemId:null,adminSupplyBonus:0,adminDemandReduction:0,supplyBonusFromOther:blank(),demandReductionFromOther:blank()}};
 return {objectRef:ref,active:false,entry,finances:{industryId:id,income:blank(),upkeep:blank()},patrol:{objectRef:ref,industryId:id,marketId:m.marketId,marketRef:m.objectRef,tracker,returningPatrolValue:0},buildProgress:0,buildTime:1,wasDisrupted:false,buildCostOverride:null,special:null};
}
export function addOriginalMilitaryIndustry(m,patrols,id,runtime){
 const existing=m.industryLifecycle.industries.find(r=>r.active&&r.entry.state.industryId===id);if(existing)return existing;
 const row=instantiateOriginalMilitaryIndustry(m,id,runtime);row.active=true;m.industryLifecycle.industries.push(row);patrols.industries.push(row.patrol);m.industries.push(row.entry);m.finances.push(row.finances);runtime.apply(row);return row;
}
function reapply(m,row,runtime){unapplyOriginalMilitaryBase(m,row.entry);runtime.apply(row);}
function message(m,row,kind,runtime,cost=null){if(m.playerOwned)m.industryLifecycle.messages.push({marketId:m.marketId,industryId:row.entry.state.industryId,industryRef:row.objectRef,kind,cost,timestamp:runtime.timestamp(),clickAction:'COLONY_INFO'});}
export function startBuildingOriginalMilitaryIndustry(m,row){row.entry.operating.building=true;row.entry.operating.upgradeId=null;row.buildProgress=0;row.buildTime=spec(row.entry.state.industryId).buildTime;unapplyOriginalMilitaryBase(m,row.entry);}
export function buildNextOriginalMilitaryQueue(m,patrols,runtime){
 validateOriginalMilitaryLifecycle(m,patrols);syncOriginalMilitaryDisruption(m);
 return buildNextOriginalConstructionQueue(m,{instantiate:id=>instantiateOriginalMilitaryIndustry(m,id,runtime),isAvailable:()=>m.industries.some(e=>functional(e.operating)&&spec(e.state.industryId).tags.includes('spaceport')),add:id=>addOriginalMilitaryIndustry(m,patrols,id,runtime),startBuilding:row=>startBuildingOriginalMilitaryIndustry(m,row),refundCredits:runtime.refundCredits,message:(row,kind,cost)=>message(m,row,kind,runtime,cost)});
}
/** Engine hook only: does not implement UI admission, charging, confirmation, or multiplayer authorization. */
export function startOriginalMilitaryUpgrade(m,id){const row=current(m,id),upgrade=spec(id).upgradeId;check(upgrade!==null&&military(upgrade),'Actual military upgrade required');row.entry.operating.building=true;row.entry.operating.upgradeId=upgrade;row.buildProgress=0;row.buildTime=spec(upgrade).buildTime;}
export function cancelOriginalMilitaryUpgrade(m,id){const row=current(m,id);row.entry.operating.building=false;row.entry.operating.upgradeId=null;row.buildProgress=0;}
function finish(m,patrols,row,runtime){
 const e=row.entry;e.operating.building=false;row.buildProgress=0;row.buildTime=1;
 if(e.operating.upgradeId!==null){
  const target=e.operating.upgradeId;check(military(target),'Actual upgrade plugin required');
  // forUpgrade=true: no core/item refund. The removed object stays alive for existing routes/listeners.
  unapplyOriginalMilitaryBase(m,e);m.industries.splice(m.industries.indexOf(e),1);m.finances.splice(m.finances.indexOf(row.finances),1);row.active=false;
  const next=addOriginalMilitaryIndustry(m,patrols,target,runtime);next.entry.modifiers.aiCoreId=e.modifiers.aiCoreId;next.entry.modifiers.improved=e.modifiers.improved;
  message(m,next,'finished',runtime);
  if(next.special?.id===R.item.id)put({modifiers:m.economyBonuses.combat_fleet_size_mult},'flat',R.item.id,0,true);
  next.special=row.special;next.entry.modifiers.specialItemId=e.modifiers.specialItemId;
  next.patrol.tracker.elapsed=next.patrol.tracker.currInterval;reapply(m,next,runtime);return next.objectRef;
 }
 message(m,row,'finished',runtime);if(runtime.buildNextInQueue)runtime.buildNextInQueue();else buildNextOriginalMilitaryQueue(m,patrols,runtime);
 row.patrol.tracker.elapsed=row.patrol.tracker.currInterval;reapply(m,row,runtime);return row.objectRef;
}
export function advanceOriginalMilitaryIndustry(m,patrols,id,days,runtime,{colonyDebug=false}={}){
 validateOriginalMilitaryLifecycle(m,patrols);check(nativeFloat(days)&&days>=0&&typeof colonyDebug==='boolean','Actual days and debug flag required');
 const row=current(m,id),finishedRef=advanceOriginalBaseIndustryFrame(row,days,{colonyDebug},{isDisrupted:()=>syncOriginalMilitaryDisruption(m),disruptionFinished:()=>{},finishBuildingOrUpgrading:()=>finish(m,patrols,row,runtime)});
 // Java keeps executing this old instance after an upgrade; never run the new tracker instead.
 const patrol=runtime.advancePatrol(row);return immutableJSON({scope:'military-base-and-patrol-industry-phase',industryRef:row.objectRef,finishedRef,patrol});
}
