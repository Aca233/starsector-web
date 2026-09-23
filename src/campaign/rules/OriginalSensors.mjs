/** Native visibility getters. No fleet synchronization, marker entities, or render/fader guesses. */
import raw from '../data/reference-sensors.json' with {type:'json'};
import {requireThat,immutableJSON,canonicalJSON} from '../core/Values.mjs';
import {resolveOriginalEconomyBonus,resolveOriginalEconomyMutable} from './OriginalMarketEconomy.mjs';
import {restoreOriginalFleetStats} from './OriginalNativeFleetStats.mjs';
import {originalRouteEntity} from './OriginalRouteSpace.mjs';
export const ORIGINAL_SENSORS=immutableJSON(raw);
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_SENSORS',m),finite=v=>Number.isFinite(v)&&f(v)===v;
const constants=env=>env.settings??ORIGINAL_SENSORS.settings;
const cap=(entity,env)=>entity.locationRef!==null&&entity.locationRef===env.hyperspaceRef?constants(env).sensorRangeMaxHyper:constants(env).sensorRangeMax;
export function originalFleetSensorRadius(fleet,settings=ORIGINAL_SENSORS.settings){
 const n=fleet.counts?.fleetSizeNum;check(Number.isInteger(n)&&n>=-2147483648&&n<=2147483647,'Actual current fleet size count required');
 return Math.min(f(settings.baseFleetSelectionRadius+f(f(n)*settings.fleetSelectionRadiusPerUnitSize)),settings.maxFleetSelectionRadius);
}
/** BaseCampaignEntity.getMaxSensorRangeToDetect; dynamic getValue does not create a stat. */
export function originalMaxSensorRange(observer,target,env){
 const C=constants(env),base=f((target.sensorProfile??0)+(observer.sensorStrength??0));
 const a=resolveOriginalEconomyBonus(target.detectedRangeMod),b=resolveOriginalEconomyBonus(observer.sensorRangeMod);
 let range=f(f(f(base+f(f(base*f(a.percent+b.percent))/100))+f(a.flat+b.flat))*f(a.mult*b.mult));
 if(range<0)range=0;
 if(observer.isPlayerFleet&&target.isFleet)range=f(range*target.detectedByPlayerRangeMult);
 if(observer.transponderOn&&target.transponderOn)range=f(range*C.detectionRangeTransponderMult);
 if(observer.isPlayerFleet&&env.difficulty==='easy')range=f(range+C.easySensorBonus);
 const maximum=f(cap(observer,env)+(target.extendedDetectedAtRange??0));return range>maximum?maximum:range;
}
/** BaseCampaignEntity.getVisibilityLevelTo. Preserve early returns and <= thresholds. */
export function originalSensorVisibility(observer,target,env){
 if(!env.sensorsOn&&observer.isPlayerFleet&&!target.ghost)return 'COMPOSITION_AND_FACTION_DETAILS';
 if(target.sensorProfile===null)return 'COMPOSITION_AND_FACTION_DETAILS';
 if(observer.sensorStrength===null)return 'NONE';
 if(observer.locationRef!==target.locationRef)return 'NONE';
 const dx=f(target.position.x-observer.position.x),dy=f(target.position.y-observer.position.y);
 let distance=f(f(Math.sqrt(f(f(dx*dx)+f(dy*dy))))-f(target.radius+observer.radius));if(distance<0)distance=0;
 if(distance>f(cap(target,env)+(target.extendedDetectedAtRange??0)))return 'NONE';
 const C=constants(env),range=originalMaxSensorRange(observer,target,env);let composition=f(range*C.detectionRangeDetailsMult),full=Math.max(f(range*C.detectionRangeDetailsAlwaysMult),C.detectionRangeDetailsAlwaysMin),noDetails=false;
 if(!target.isFleet){const mult=target.detectionRangeDetailsOverrideMult??C.detectionRangeDetailsAlwaysNonFleet;noDetails=target.detectionRangeDetailsOverrideMult!==null&&mult<0;full=Math.max(f(range*mult),C.detectionRangeDetailsAlwaysMin);if(composition>full)composition=full;}
 if(!noDetails&&(target.transponderOn&&distance<=range||distance<=full))return 'COMPOSITION_AND_FACTION_DETAILS';
 if(distance<=composition&&!noDetails)return 'COMPOSITION_DETAILS';
 if(distance<=range)return 'SENSOR_CONTACT';return 'NONE';
}
function sensorFields(fleet){return {objectRef:fleet.objectRef,sensorProfile:fleet.sensorProfile,sensorStrength:fleet.sensorStrength,transponderOn:fleet.transponderOn,counts:fleet.counts,stats:fleet.stats};}
/** Replace a captured getter-only handle when the actual world fleet has been reconstructed. */
export function bindOriginalSensorFleet(s,fleet,{checkCaptured=false}={}){
 const row=s.fleets.find(row=>row.objectRef===fleet.objectRef);check(row,'Fleet must already have a real sensor registration');
 if(checkCaptured)check(canonicalJSON(sensorFields(row.fleet))===canonicalJSON(sensorFields(fleet)),'Conflicting captured sensor fleet');row.fleet=fleet;
}
/** Add a newly constructed fleet to an existing, explicitly known sensor environment. */
export function registerOriginalConstructedSensorFleet(s,fleet){
 check(s?.scope==='native-route-fleet-sensors'&&fleet?.campaign?.scope==='native-constructed-campaign-fleet','Actual current sensor environment and constructed fleet required');
 const old=s.fleets.find(row=>row.objectRef===fleet.objectRef);check(!old||old.fleet===fleet,'Cannot replace a different captured sensor fleet');if(old)return;
 const entity=fleet.campaign.entity;s.fleets.push({objectRef:fleet.objectRef,tags:entity.tags??[],extendedDetectedAtRange:entity.extendedDetectedAtRange,fleet});
}
/** Capture JSON has no aliases; current graph checkpoints must already retain them. */
export function restoreCapturedOriginalFleetSensors(capture,playerFleet=null){
 const s=structuredClone(capture),stats=new Map(),targets=new Map();
 if(playerFleet&&s.fleets.some(row=>row.objectRef===playerFleet.objectRef))bindOriginalSensorFleet(s,playerFleet,{checkCaptured:true});
 // Seed the real player first so NPC shared stats never replace its live handles.
 const ordered=[...s.fleets].sort((a,b)=>Number(b.fleet===playerFleet)-Number(a.fleet===playerFleet));
 for(const row of ordered){const value=row.fleet.stats;if(!value)continue;const old=stats.get(value.objectRef);
  if(old){check(canonicalJSON(old)===canonicalJSON(value),'Conflicting captured fleet stats');row.fleet.stats=old;continue;}
  value.targets=value.targets.map(t=>{const existing=targets.get(t.objectRef);if(existing){check(canonicalJSON(existing)===canonicalJSON(t),'Conflicting captured sensor stat target');return existing;}targets.set(t.objectRef,t);return t;});
  restoreOriginalFleetStats(value);stats.set(value.objectRef,value);
 }
 return validateOriginalFleetSensors(s,{allowUnresolved:true,playerFleet});
}
export function validateOriginalFleetSensors(s,{allowUnresolved=false,playerFleet=null}={}){
 check(s?.scope==='native-route-fleet-sensors'&&s.schemaVersion===1&&Array.isArray(s.unresolved)&&(allowUnresolved||!s.unresolved.length),'Complete native sensor closure required');
 check(typeof s.sensorsOn==='boolean'&&typeof s.difficulty==='string'&&Array.isArray(s.fleets),'Invalid current sensor environment');
 const seen=new Set(),stats=new Map(),targets=new Map();
 for(const row of s.fleets){const fleet=row.fleet;check(typeof row.objectRef==='string'&&!seen.has(row.objectRef)&&fleet?.objectRef===row.objectRef,'Invalid sensor fleet identity');seen.add(row.objectRef);
  check(Array.isArray(row.tags)&&row.tags.every(t=>typeof t==='string')&&(row.extendedDetectedAtRange===null||finite(row.extendedDetectedAtRange)),'Invalid sensor entity metadata');
  check([fleet.sensorProfile,fleet.sensorStrength].every(v=>v===null||finite(v))&&typeof fleet.transponderOn==='boolean','Invalid native sensor fields');originalFleetSensorRadius(fleet);
  if(fleet.objectRef===playerFleet?.objectRef)check(fleet===playerFleet,'Lost shared current player sensor fleet');
  const value=fleet.stats;if(value===null){check(allowUnresolved,'Missing fleet sensor stats');continue;}
  check(value&&typeof value.objectRef==='string'&&Array.isArray(value.targets),'Actual sensor fleet stats required');const old=stats.get(value.objectRef);check(!old||old===value,'Lost shared fleet stats');stats.set(value.objectRef,value);
  const local=new Map();for(const t of value.targets){check(!local.has(t.objectRef),'Duplicate fleet sensor stat target');local.set(t.objectRef,t);const prior=targets.get(t.objectRef);check(!prior||prior===t,'Lost shared sensor stat target');targets.set(t.objectRef,t);if(t.kind==='mutable')resolveOriginalEconomyMutable(t.value);else{check(t.kind==='bonus','Invalid sensor stat kind');resolveOriginalEconomyBonus(t.value);}}
  const same=(ref,v)=>check(local.has(ref)&&local.get(ref).value===v,'Lost sensor stat alias');
  for(const [key,ref]of Object.entries(value.fields))same(ref,value[key]);
  for(const [space,values]of [['stats',value.dynamicStats],['mods',value.dynamic]])for(const [key,ref]of Object.entries(value.dynamicRefs[space]))same(ref,values[key]);
  for(const temp of value.tempMods)for(const key of ['stat','mStat'])if(temp[key+'Ref']!==null)same(temp[key+'Ref'],temp[key]);
 }
 return s;
}
/** Getters stay attached to current fleet/space objects, including after actual FleetData sync. */
export function originalFleetSensorEntity(s,space,ref,settings=ORIGINAL_SENSORS.settings,playerFleetRef=undefined){
 const row=s.fleets.find(row=>row.objectRef===ref);check(row,'Actual sensor fleet handle required');const fleet=row.fleet,spatial=()=>originalRouteEntity(space,ref);
 const stats=()=>{check(fleet.stats,'Actual current fleet stats required');return fleet.stats;};
 return {isFleet:true,get isPlayerFleet(){return ref===(playerFleetRef===undefined?space.playerFleetRef:playerFleetRef);},
  get locationRef(){return spatial().locationRef;},get position(){const position=spatial().position;check(position,'Actual local sensor position required');return position;},
  get radius(){return originalFleetSensorRadius(fleet,settings);},get ghost(){return (fleet.campaign?fleet.campaign.entity.tags??[]:row.tags).includes('ghost');},get extendedDetectedAtRange(){return fleet.campaign?fleet.campaign.entity.extendedDetectedAtRange:row.extendedDetectedAtRange;},detectionRangeDetailsOverrideMult:null,
  get sensorProfile(){return fleet.sensorProfile;},get sensorStrength(){return fleet.sensorStrength;},get transponderOn(){return fleet.transponderOn;},
  get detectedRangeMod(){return stats().detectedRangeMod;},get sensorRangeMod(){return stats().sensorRangeMod;},
  get detectedByPlayerRangeMult(){const values=stats().dynamicStats,key='detected_by_player_range_mult';return Object.hasOwn(values,key)?resolveOriginalEconomyMutable(values[key]):1;}
 };
}
export function originalRouteFleetVisibility(s,space,targetRef,observerRef=space.playerFleetRef){
 if(observerRef===null)return 'NONE';check(s?.scope==='native-route-fleet-sensors'&&s.unresolved.length===0,'Actual current sensor closure required');
 return originalSensorVisibility(originalFleetSensorEntity(s,space,observerRef),originalFleetSensorEntity(s,space,targetRef),{sensorsOn:s.sensorsOn,difficulty:s.difficulty,hyperspaceRef:space.hyperspaceRef});
}

/** A multiplayer player's own observation context, not a write to the singleton native player. */
export function originalRouteFleetVisibilityForPlayer(s,space,targetRef,playerRef,observerRef=playerRef){
 check(typeof playerRef==='string'&&s?.scope==='native-route-fleet-sensors'&&s.unresolved.length===0,'Actual observer and current sensor closure required');
 return originalSensorVisibility(originalFleetSensorEntity(s,space,observerRef,ORIGINAL_SENSORS.settings,playerRef),originalFleetSensorEntity(s,space,targetRef,ORIGINAL_SENSORS.settings,playerRef),{sensorsOn:s.sensorsOn,difficulty:s.difficulty,hyperspaceRef:space.hyperspaceRef});
}
