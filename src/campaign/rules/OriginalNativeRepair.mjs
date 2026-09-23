/** Native RepairTracker.advanceCRAndRepairs and FleetMemberStatus.repairFraction. */
import {originalNativeCommanderStats} from './OriginalNativeCharacterStats.mjs';
import R from '../data/reference-fleet-sync.json' with {type:'json'};
import {requireThat} from '../core/Values.mjs';
import {resolveOriginalEconomyMutable as effective} from './OriginalMarketEconomy.mjs';
import {getOriginalMemberStats,originalMemberPlayerCommander,updateOriginalMemberStats} from './OriginalMemberEffects.mjs';
import {originalMemberCrewFraction,updateOriginalMemberRepairRates} from './OriginalFleetMemberStats.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_REPAIR',m);
const number=(n,label)=>{check(typeof n==='number'&&Number.isFinite(n)&&n===f(n),'Actual float required: '+label);return n;};
const bool=(b,label)=>{check(typeof b==='boolean','Actual Boolean required: '+label);return b;};
function call(services,key,...args){check(typeof services[key]==='function','Actual repair lifecycle service required: '+key);const result=services[key](...args);check(!result||typeof result.then!=='function','Repair lifecycle must be synchronous');return result;}
/** RepairTracker.setMothballed: real stat rebuild and FleetData invalidation on changes. */
export function setOriginalNativeMemberMothballed(member,fleet,value,plugins={}){
 bool(value,'mothballed');const tracker=member.repairTracker;check(tracker,'Actual repair tracker required');
 const changed=bool(tracker.mothballed,'mothballed')!==value;tracker.mothballed=value;if(!changed)return;
 if(value){tracker.crPriorToMothballing=number(tracker.cr,'cr');tracker.cr=0;}else tracker.cr=number(tracker.crPriorToMothballing,'crPriorToMothballing');
 updateOriginalMemberStats(member,fleet,plugins);
 if(member.fleetDataRef!==null){check(fleet?.dataRef===member.fleetDataRef&&fleet.synchronization,'Actual attached FleetData required');fleet.synchronization.needsSync=true;}
}
export function originalNativeMemberStatus(member,services={}){
 check(member.status!==undefined,'Actual member status capture required');
 if(member.status===null){
  check(member.variant?.effects,'Actual member variant required');let count=1;
  if(member.type==='FIGHTER_WING'){const wing=R.wings[member.specId];check(wing,'Actual wing spec required');count=wing.numFighters;}
  else if(member.variant.effects.stationModules.length>0){member.status=call(services,'createMemberStatus',member);}
  if(member.status===null)member.status={objectRef:'created-status:'+member.objectRef,random:null,hullFractions:Array(count).fill(1),modules:Array.from({length:count},(_,i)=>({objectRef:'created-module-status:'+member.objectRef+':'+i,hullFraction:1,armorCellFractions:null,gridWidth:0,gridHeight:0,detached:null,permaDetached:null,moduleSlotId:null,inactive:null,hullDamageTaken:0,armorDamageTaken:0}))};
 }
 const s=member.status;check(Array.isArray(s.modules)&&s.modules.length>0&&s.modules.length===s.hullFractions.length,'Full native module/armor capture required');return s;
}
export function originalNativeMemberHullFraction(member,services={}){const s=originalNativeMemberStatus(member,services);let total=0;for(const m of s.modules)total=f(total+number(m.hullFraction,'hull fraction'));return f(total/f(s.modules.length));}
export function originalNativeMemberNeedsRepairs(member,services={}){const s=originalNativeMemberStatus(member,services);return originalNativeMemberHullFraction(member,services)<1||s.modules.some(m=>m.armorCellFractions!==null||m.detached===true);}
export function originalNativeMemberMaxCR(member,fleet){return Math.max(0,Math.min(1,effective(getOriginalMemberStats(member,fleet).maxCombatReadiness)));}
export function originalNativeMemberRepairRate(member,fleet,services={}){
 const s=getOriginalMemberStats(member,fleet);let rate=f(effective(s.repairRatePercentPerDay)/100);
 if(member.fleetDataRef!==null&&fleet.commanderRef!==null)rate=f(rate*number(services.readCommanderRepairRateMult?call(services,'readCommanderRepairRateMult',fleet.commanderRef,fleet):effective(originalNativeCommanderStats(fleet).repairRateMult),'commander repair multiplier'));
 return f(rate*originalMemberCrewFraction(member,fleet,{playerCommander:originalMemberPlayerCommander(member,fleet)}));
}
function captainIsAI(member,fleet){if(member.captainRef===null)return false;const person=fleet.statPeople?.find(p=>p.objectRef===member.captainRef);return bool(person?.isAICore,'captain AI core');}
function repairModules(member,amount,services){
 const s=originalNativeMemberStatus(member,services);
 for(let index=0;index<s.modules.length;index++){
  const module=s.modules[index];if(module.permaDetached===true)continue;
  if(module.hullFraction<1){
   module.hullFraction=Math.max(0,Math.min(1,f(module.hullFraction+amount)));
   if(module.inactive===null)module.inactive=module.moduleSlotId===null?false:!bool(call(services,'isModuleActive',member,module.moduleSlotId),'active module');
   if(module.hullFraction>=(module.inactive?f(0.75):f(0.25))&&module.detached!==null)module.detached=null;
  }else module.detached=null;
  if(module.armorCellFractions===null)continue;
  const grid=module.armorCellFractions,w=module.gridWidth,h=module.gridHeight;
  check(Number.isInteger(w)&&Number.isInteger(h)&&w>=0&&h>=0&&grid.length===w&&grid.every(col=>Array.isArray(col)&&col.length===h),'Invalid native armor grid');
  let capacity=f(amount*f((w*h)|0)),exhausted=false;
  outer:for(let y=h-1;y>=0;y--)for(let x=0;x<w;x++){
   const needed=f(1-number(grid[x][y],'armor fraction'));if(needed<=0)continue;const used=Math.min(needed,capacity);grid[x][y]=Math.min(1,f(grid[x][y]+used));capacity=f(capacity-used);if(capacity<=0){exhausted=true;break outer;}
  }
  if(!exhausted){module.armorCellFractions=null;module.gridWidth=0;module.gridHeight=0;}
 }
 // Compatibility projection only; modules (including repeated shared objects) are authoritative.
 s.hullFractions=s.modules.map(m=>m.hullFraction);
}
export function advanceOriginalNativeMemberRepairs(member,fleet,days,hasSupplies,services={}){
 number(days,'repair days');check(days>=0,'Negative repair advance');bool(hasSupplies,'supplies available');if(member.fleetDataRef===null)return;
 const t=member.repairTracker;check(t,'Actual repair tracker required');const maxCR=originalNativeMemberMaxCR(member,fleet);
 if(days>0){t.crPriorToMothballing=0;t.crashMothballed=false;}updateOriginalMemberRepairRates(member);
 if(!bool(t.mothballed,'mothballed')){
  if(t.cr>maxCR||!hasSupplies){const loss=f(t.decreaseRate*days);t.cr=f(t.cr-loss);
   if(!hasSupplies){t.noSuppliesCRLoss??=[];let event=t.noSuppliesCRLoss.at(-1);if(!event||event.elapsed>=1){event={crAmount:0,text:'缺乏补给维护',elapsed:0,id:null};t.noSuppliesCRLoss.push(event);}event.crAmount=f(event.crAmount-f(loss+Math.min(0,t.cr)));}
   if(days>0&&captainIsAI(member,fleet)&&t.cr>maxCR)t.cr=maxCR;if(t.cr<maxCR&&hasSupplies)t.cr=maxCR;t.losingCR=true;
  }else if(t.cr<maxCR&&hasSupplies&&!bool(t.suspendRepairs,'suspend repairs')){t.cr=Math.min(maxCR,f(t.cr+f(t.recoveryRate*days)));t.losingCR=false;}else t.losingCR=false;
  t.cr=Math.max(0,Math.min(1,t.cr));
 }
 if(hasSupplies&&originalNativeMemberNeedsRepairs(member,services)&&!t.mothballed&&!t.suspendRepairs&&member.type!=='FIGHTER_WING'){
  repairModules(member,f(originalNativeMemberRepairRate(member,fleet,services)*days),services);
  if(!originalNativeMemberNeedsRepairs(member,services)&&bool(fleet.isPlayerFleet,'player fleet'))call(services,'reportRepairsComplete',member,fleet);
 }
 for(const key of ['recentEvents','noSuppliesCRLoss']){t[key]??=[];check(Array.isArray(t[key]),'Actual CR event list required');for(let i=0;i<t[key].length;){const event=t[key][i];event.elapsed=f(number(event.elapsed,'CR event elapsed')+days);if(event.elapsed>7)t[key].splice(i,1);else i++;}}
}

/** RepairTracker.applyCREvent(amount,text): append unbounded event amount, clamp only base CR. */
export function applyOriginalNativeCREvent(member,amount,text){
 number(amount,'CR event amount');check(text===null||typeof text==='string','Actual CR event text required');const tracker=member.repairTracker;check(tracker,'Actual repair tracker required');
 if(tracker.recentEvents===null)tracker.recentEvents=[];check(Array.isArray(tracker.recentEvents),'Actual recent CR events required');
 tracker.recentEvents.push({crAmount:amount,text,elapsed:0,id:null});tracker.cr=Math.max(0,Math.min(1,f(number(tracker.cr,'base CR')+amount)));
}
