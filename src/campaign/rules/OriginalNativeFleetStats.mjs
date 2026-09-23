/** MutableFleetStats: defaults, temporary mods and shared target identity. */
import {canonicalJSON,requireThat} from '../core/Values.mjs';
import {resolveOriginalEconomyMutable,resolveOriginalEconomyBonus} from './OriginalMarketEconomy.mjs';
import {put} from './OriginalIndustryState.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_FLEET_STATS',m);
const blank=()=>({flat:[],percent:[],mult:[]});
export const ORIGINAL_FLEET_STAT_DEFAULTS=Object.freeze({accelerationMult:1,fuelUseHyperMult:1,fuelUseNormalMult:0,movementSpeedMod:null,fleetwideMaxBurnMod:null,sensorStrengthMod:null,sensorProfileMod:null,sensorRangeMod:null,detectedRangeMod:null});
export function createOriginalFleetStats(objectRef){
 check(typeof objectRef==='string','Fleet stats identity required');
 const s={objectRef,fields:{},dynamic:{},dynamicStats:{},dynamicRefs:{mods:{},stats:{}},targets:[],tempMods:[]};
 for(const [key,base]of Object.entries(ORIGINAL_FLEET_STAT_DEFAULTS)){
  const ref='created:'+objectRef+':'+key,value=base===null?blank():{base,modifiers:blank()};
  s[key]=value;s.fields[key]=ref;s.targets.push({objectRef:ref,kind:base===null?'bonus':'mutable',value,temporary:[],descriptions:{flat:{},percent:{},mult:{}}});
 }
 return s;
}
/** Rebind a JSON capture; graph checkpoints retain these aliases directly. */
export function restoreOriginalFleetStats(s){return restoreOriginalNativeStatTargets(s,ORIGINAL_FLEET_STAT_DEFAULTS);}
export function restoreOriginalNativeStatTargets(s,defaults){
 check(s&&Array.isArray(s.targets)&&Array.isArray(s.tempMods),'Actual fleet stats capture required');const byRef=new Map();
 for(const t of s.targets){check(typeof t.objectRef==='string'&&!byRef.has(t.objectRef)&&['mutable','bonus'].includes(t.kind),'Invalid/duplicate fleet stat target');byRef.set(t.objectRef,t);if(t.kind==='mutable')resolveOriginalEconomyMutable(t.value);else resolveOriginalEconomyBonus(t.value);}
 const bind=(ref,kind,value)=>{const t=byRef.get(ref);check(t&&t.kind===kind&&canonicalJSON(t.value)===canonicalJSON(value),'Conflicting fleet stat target');return t.value;};
 for(const [key,base]of Object.entries(defaults))s[key]=bind(s.fields[key],base===null?'bonus':'mutable',s[key]);
 for(const [space,kind]of [['mods','bonus'],['stats','mutable']]){const values=space==='mods'?s.dynamic:s.dynamicStats;for(const [key,ref]of Object.entries(s.dynamicRefs[space]))values[key]=bind(ref,kind,values[key]);}
 const seen=new Set();for(const t of s.tempMods){check(typeof t.source==='string'&&!seen.has(t.source)&&typeof t.timeRemaining==='number'&&Number.isFinite(t.timeRemaining)&&f(t.timeRemaining)===t.timeRemaining,'Invalid temporary fleet mod');seen.add(t.source);for(const [key,kind]of [['stat','bonus'],['mStat','mutable']]){const ref=t[key+'Ref'];check(ref!==undefined,'Missing temporary fleet target identity');if(ref===null)check(t[key]===null,'Invalid null temporary target');else t[key]=bind(ref,kind,t[key]);}}
 return s;
}
export function removeOriginalFleetTemporaryMod(s,source){
 const i=s.tempMods.findIndex(t=>t.source===source);if(i<0)return;const [t]=s.tempMods.splice(i,1);
 for(const target of [t.stat,t.mStat])if(target){const handle=s.targets.find(h=>h.value===target);check(handle,'Lost temporary stat target');for(const c of ['flat','percent','mult'])modifyOriginalNativeStatTarget(handle,c,source,0,{remove:true});}
}
export function addOriginalFleetTemporaryMod(s,target,source,timeRemaining,channel,value,description=null){
 check(['flat','percent','mult'].includes(channel)&&[timeRemaining,value].every(n=>typeof n==='number'&&Number.isFinite(n)&&f(n)===n),'Invalid temporary fleet modifier');
 const handle=s.targets.find(t=>t.value===target);check(handle,'Actual shared fleet stat target required');
 let t=s.tempMods.find(t=>t.source===source);if(!t){t={source,timeRemaining,stat:null,statRef:null,mStat:null,mStatRef:null};const key=handle.kind==='bonus'?'stat':'mStat';t[key]=target;t[key+'Ref']=handle.objectRef;s.tempMods.push(t);}
 t.timeRemaining=timeRemaining;check((handle.kind==='bonus'?t.stat:t.mStat)===target,'Attempting to modify multiple stats with the same source');modifyOriginalNativeStatTarget(handle,channel,source,value,{description});
}
export function advanceOriginalFleetStats(s,days){
 check(typeof days==='number'&&Number.isFinite(days)&&f(days)===days,'Actual float days required');
 for(let i=0;i<s.tempMods.length;){const t=s.tempMods[i];t.timeRemaining=f(t.timeRemaining-days);if(t.timeRemaining<=0)removeOriginalFleetTemporaryMod(s,t.source);else i++;}
}

/** DynamicStats.getStat: create the actual base-one stat and register its shared target. */
export function originalNativeFleetDynamicStat(s,key){
 check(typeof key==='string'&&key.length>0&&key.length<=128&&!['__proto__','prototype','constructor'].includes(key),'Invalid fleet dynamic stat key');
 if(!Object.hasOwn(s.dynamicStats,key)){const value={base:1,modifiers:blank()},objectRef='created:'+s.objectRef+':dynamic:'+key;s.dynamicStats[key]=value;s.dynamicRefs.stats[key]=objectRef;s.targets.push({objectRef,kind:'mutable',value,temporary:[],descriptions:{flat:{},percent:{},mult:{}}});}
 return s.dynamicStats[key];
}

/** DynamicStats.getMod creates a bonus, separate from getStat's base-one namespace. */
export function originalNativeFleetDynamicMod(s,key){
 check(typeof key==='string'&&key.length>0&&key.length<=128&&!['__proto__','prototype','constructor'].includes(key),'Invalid native dynamic mod key');
 if(!Object.hasOwn(s.dynamic,key)){const value=blank(),objectRef='created:'+s.objectRef+':dynamic-mod:'+key;s.dynamic[key]=value;s.dynamicRefs.mods[key]=objectRef;s.targets.push({objectRef,kind:'bonus',value,temporary:[],descriptions:{flat:{},percent:{},mult:{}}});}
 return s.dynamic[key];
}

/** Preserve descriptions: terrain listeners use them as gameplay inputs, not just tooltip text. */
export function modifyOriginalNativeStatTarget(target,channel,id,value,{remove=false,always=false,description=null}={}){
 check(target&&['flat','percent','mult'].includes(channel)&&typeof id==='string'&&!['__proto__','prototype','constructor'].includes(id),'Invalid native stat mutation');
 check(typeof value==='number'&&Number.isFinite(value)&&f(value)===value,'Native modifier float required');check(description===null||typeof description==='string','Invalid stat description');
 const stat=target.kind==='mutable'?target.value:{modifiers:target.value},mods=stat.modifiers[channel];
 if(always&&!remove){const at=mods.findIndex(m=>m.id===id),row={id,value};if(at<0)mods.push(row);else mods[at]=row;}else put(stat,channel,id,value,remove);
 target.descriptions??={flat:{},percent:{},mult:{}};
 if(remove)delete target.descriptions[channel][id];else if(mods.some(m=>m.id===id))target.descriptions[channel][id]=description;
}
