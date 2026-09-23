/** Native patrol scheduling and RouteManager time phase. Does not replace BaseIndustry.advance or spawn fleet entities. */
import {createOriginalJavaRandom,originalJavaNextFloat} from './OriginalJavaRandom.mjs';
import {immutableJSON,requireThat,canonicalJSON} from '../core/Values.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_PATROL',m),types=['HEAVY','COMBAT','FAST'];
const fleetTypes={FAST:'patrolSmall',COMBAT:'patrolMedium',HEAVY:'patrolLarge'};
function number(v,label){check(Number.isFinite(v)&&f(v)===v,'Actual float required: '+label);return v;}
function long(v,label){check(typeof v==='string'&&/^-?\d+$/.test(v),'Native long string required: '+label);const n=BigInt(v);check(BigInt.asIntN(64,n)===n,'Long overflow: '+label);return n;}
function random(runtime){const v=runtime.randomDouble();check(Number.isFinite(v)&&v>=0&&v<1,'Actual global random double required');return v;}
function nextInterval(t,runtime){check(t.randomRef===null,'A tracker with its own Random requires a native Random adapter');t.currInterval=f(t.minInterval+f(f(t.maxInterval-t.minInterval)*f(random(runtime))));t.elapsed=0;t.intervalElapsed=false;}
function advanceTracker(t,days,runtime){if(t.intervalElapsed)nextInterval(t,runtime);t.elapsed=f(t.elapsed+days);if(t.elapsed>=t.currInterval)t.intervalElapsed=true;}
export function validateOriginalPatrolState(s,{allowUnresolved=false}={}){
 check(s?.scope==='native-patrol-route-state'&&s.schemaVersion===1&&Array.isArray(s.unresolved)&&(allowUnresolved||s.unresolved.length===0),'Complete native patrol capture required');
 check(typeof s.objectRef==='string'&&Number.isSafeInteger(s.nextObjectId)&&s.nextObjectId>=0,'Invalid route-manager identity');
 for(const key of ['routes','industries','markets'])check(Array.isArray(s[key]),'Invalid patrol roster');
 check(new Set(s.routes.map(r=>r.objectRef)).size===s.routes.length&&new Set(s.industries.map(i=>i.objectRef)).size===s.industries.length,'Duplicate patrol identity');
 for(const i of s.industries){number(i.returningPatrolValue,'returning patrol value');if(!i.tracker){check(allowUnresolved,'Missing native patrol tracker');continue;}const t=i.tracker;for(const k of ['minInterval','maxInterval','currInterval','elapsed'])number(t[k],k);check(typeof t.intervalElapsed==='boolean'&&(t.randomRef===null||typeof t.randomRef==='string'),'Invalid native patrol tracker');}
 for(const r of s.routes){for(const k of ['delay','daysSinceSeenByPlayer','elapsed'])number(r[k],k);if(r.seed!==null)long(r.seed,'route seed');long(r.timestamp,'route timestamp');check(Array.isArray(r.segments)&&(r.current===null||r.segments.includes(r.current)),'Lost current route segment identity');for(const seg of r.segments){number(seg.elapsed,'segment elapsed');number(seg.daysMax,'segment length');}if(r.custom?.kind==='military-patrol')check(types.includes(r.custom.type)&&Number.isInteger(r.custom.spawnFP),'Invalid native patrol custom state');}
 return s;
}
/** Native JSON capture records identities; rebuild aliases once, never repair a corrupt live checkpoint. */
export function restoreCapturedOriginalPatrolState(capture){
 const s=structuredClone(capture),segments=new Map(),trackers=new Map();
 const shared=(map,value)=>{const old=map.get(value.objectRef);if(old){check(canonicalJSON(old)===canonicalJSON(value),'Conflicting native patrol object identity');return old;}map.set(value.objectRef,value);return value;};
 for(const i of s.industries)if(i.tracker)i.tracker=shared(trackers,i.tracker);
 for(const r of s.routes){r.segments=r.segments.map(segment=>shared(segments,segment));if(r.current){const current=r.segments.find(segment=>segment.objectRef===r.current.objectRef);check(current&&canonicalJSON(current)===canonicalJSON(r.current),'Captured current route segment differs');r.current=current;}}
 return validateOriginalPatrolState(s,{allowUnresolved:true});
}
/** RouteData.getRandom creates a FRESH java.util.Random(seed) on every call. */
export function originalPatrolCombatFP(type,seed){
 check(types.includes(type),'Unknown patrol type');long(seed,'route seed');
 const roll=originalJavaNextFloat(createOriginalJavaRandom(seed)),[base,spread]=type==='FAST'?[3,2]:type==='COMBAT'?[6,3]:[10,5];return Math.floor(f(base+f(roll*spread))+0.5)*5;
}
export function originalPatrolRouteCounts(s,marketId){const counts={FAST:0,COMBAT:0,HEAVY:0};for(const r of s.routes)if(r.source===marketId+'_military'&&r.custom?.kind==='military-patrol')counts[r.custom.type]++;return counts;}
/** Call only AFTER native BaseIndustry.advance. Random/quality callbacks must be the current shared-world services. */
export function advanceOriginalMilitaryPatrolAfterBase(s,industryRef,input,runtime){
 validateOriginalPatrolState(s);const i=s.industries.find(i=>i.objectRef===industryRef);check(i,'Actual military industry identity required');
 const days=number(input.days,'days');check(days>=0&&['simMode','functional','inNewGameAdvance','fastPatrolSpawn'].every(k=>typeof input[k]==='boolean'),'Explicit patrol phase inputs required');
 if(input.simMode||!input.functional)return immutableJSON({scope:'military-patrol-after-base-only',createdRouteRef:null,advanced:false});
 number(input.spawnRate,'spawn rate');let rate=input.spawnRate;if(input.inNewGameAdvance)rate=f(rate*3);let extra=0;
 if(i.returningPatrolValue>0){extra=f(i.tracker.currInterval*days);i.returningPatrolValue=Math.max(0,f(i.returningPatrolValue-days));}
 advanceTracker(i.tracker,f(f(days*rate)+extra),runtime);if(input.fastPatrolSpawn)advanceTracker(i.tracker,f(f(days*rate)*100),runtime);
 if(!i.tracker.intervalElapsed)return immutableJSON({scope:'military-patrol-after-base-only',createdRouteRef:null,advanced:true});
 const counts=originalPatrolRouteCounts(s,i.marketId),weights=[];let total=0;
 for(const type of types){const limit=runtime.maxPatrols(i.marketId,type);check(Number.isInteger(limit),'Native truncated patrol capacity required');const weight=f(limit-counts[type]);if(weight>0){weights.push({type,weight});total=f(total+weight);}}
 if(!weights.length)return immutableJSON({scope:'military-patrol-after-base-only',createdRouteRef:null,advanced:true});
 const roll=Math.min(total,f(random(runtime)*total));let sum=0,type=weights.at(-1).type;for(const row of weights){sum=f(sum+row.weight);if(roll<=sum){type=row.type;break;}}
 const factionId=runtime.factionId(i.marketId),quality=number(runtime.shipQuality(i.marketId,factionId),'route quality');
 const seed=runtime.newRouteSeed();long(seed,'new route seed');const timestamp=runtime.timestamp();long(timestamp,'timestamp');
 const identity=kind=>'created-'+kind+':'+s.objectRef+':'+s.nextObjectId++;
 const route={objectRef:identity('route'),source:i.marketId+'_military',marketId:i.marketId,marketRef:i.marketRef,seed,timestamp,delay:0,elapsed:0,daysSinceSeenByPlayer:1000,activeFleetRef:null,spawnerRef:i.objectRef,spawnerKind:'MilitaryBase',custom:{objectRef:identity('patrol-custom'),kind:'military-patrol',type,spawnFP:0},extra:{objectRef:identity('route-extra'),strength:null,quality,fp:null,factionId,fleetType:fleetTypes[type],damage:null},segments:[],current:null};
 s.routes.push(route); // Native addRoute happens BEFORE adjusted-strength's second quality getter.
 let strength=originalPatrolCombatFP(type,seed);strength=f(strength*Math.max(f(0.25),f(0.5+Math.min(1,number(runtime.shipQuality(i.marketId,null),'strength quality')))));
 strength=f(strength*number(runtime.fleetSize(i.marketId),'fleet size'));
 const officer=number(runtime.officerQuality(i.marketId),'officer quality');strength=f(strength*f(1+f(f(officer-1)/4)));route.extra.strength=strength;
 const daysMax=f(35+f(f(random(runtime))*10)),fromRef=runtime.primaryEntityRef(i.marketId);check(typeof fromRef==='string','Actual primary entity required');
 const segment={objectRef:identity('route-segment'),id:null,elapsed:0,daysMax,fromRef,toRef:null,customRef:null};route.segments.push(segment);route.current=segment;
 return immutableJSON({scope:'military-patrol-after-base-only',createdRouteRef:route.objectRef,advanced:true});
}
/** Exact RouteManager.advanceRoutes phase. Spawn/despawn follows separately; no fake fleet creation. */
export function advanceOriginalRouteTime(s,days,runtime){
 validateOriginalPatrolState(s);number(days,'route days');check(days>=0,'Negative route time');const removed=[];
 for(let index=0;index<s.routes.length;){const r=s.routes[index];let remove=false;
  if(r.delay>0){r.delay=Math.max(0,f(r.delay-days));if(r.delay>0){index++;continue;}const cancel=r.spawnerKind==='MilitaryBase'?false:runtime.shouldCancelAfterDelay(r);check(typeof cancel==='boolean','Actual route cancellation callback required');if(cancel)remove=true;else {r.timestamp=runtime.timestamp();long(r.timestamp,'route timestamp');}}
  if(!remove&&r.current===null&&r.segments.length===0)remove=true;
  if(!remove){if(r.current===null)r.current=r.segments[0];r.current.elapsed=f(r.current.elapsed+days);r.daysSinceSeenByPlayer=f(r.daysSinceSeenByPlayer+days);r.elapsed=f(r.elapsed+days);
   if(r.activeFleetRef===null&&r.current.elapsed>=r.current.daysMax){const at=r.segments.indexOf(r.current);if(at<r.segments.length-1)r.current=r.segments[at+1];else {const repeat=r.spawnerKind==='MilitaryBase'?false:runtime.shouldRepeat(r);check(typeof repeat==='boolean','Actual route repeat callback required');if(repeat){r.current=null;for(const segment of r.segments)segment.elapsed=0;}else remove=true;}}
  }
  if(remove){removed.push(r.objectRef);s.routes.splice(index,1);}else index++;
 }
 return immutableJSON({scope:'route-time-phase-without-spawn-despawn',removed});
}
/** MilitaryBase's listener runs while the actual RouteManager entry still exists. */
export function reportOriginalPatrolReturned(s,industryRef,input){
 validateOriginalPatrolState(s);const i=s.industries.find(i=>i.objectRef===industryRef);check(i&&typeof input.functional==='boolean','Actual military return listener required');if(!input.functional||input.reason!=='REACHED_DESTINATION')return 0;
 const r=s.routes.find(r=>r.source===i.marketId+'_military'&&r.activeFleetRef===input.fleetRef);check(r,'Returning patrol has no route');if(r.custom?.kind!=='military-patrol'||r.custom.spawnFP<=0)return 0;
 check(Number.isInteger(input.fleetPoints)&&input.fleetPoints>=0,'Actual current fleet points required');const fraction=Math.trunc(input.fleetPoints/r.custom.spawnFP);i.returningPatrolValue=f(i.returningPatrolValue+fraction);return fraction;
}
