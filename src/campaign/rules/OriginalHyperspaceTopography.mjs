/** Native HyperspaceTopographyEventIntel character-refresh effects, not event progress or terrain simulation. */
import R from '../data/reference-fleet-sync.json' with {type:'json'};
import {requireThat,canonicalJSON} from '../core/Values.mjs';
import {functional} from './OriginalIndustryState.mjs';
import {originalNativeFleetDynamicStat,modifyOriginalNativeStatTarget} from './OriginalNativeFleetStats.mjs';
const T=R.topography,C=T.constants,f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_HYPERSPACE_TOPOGRAPHY',m),id='hypertopology1';
const number=(n,label)=>{check(typeof n==='number'&&Number.isFinite(n)&&f(n)===n,'Actual native float required: '+label);return n;};
const integer=(n,label)=>{check(Number.isInteger(n)&&n>=-2147483648&&n<=2147483647,'Actual native int required: '+label);return n;};
const blank=()=>({flat:[],percent:[],mult:[]});
export function originalTopographyStageActive(event,stage){
 check(event?.scope==='native-hyperspace-topography-effects'&&Array.isArray(event.stages),'Actual native event stages required');integer(event.progress,'event progress');check(T.stageIds.includes(stage),'Unknown native topography stage');
 const data=event.stages.find(s=>s.id===stage);return data?integer(data.progress,'stage threshold')<=event.progress:false;
}
export function originalSensorArrayBonus(market,systems,range=C.RANGE_WITHIN_WHICH_SENSOR_ARRAYS_HELP_LY){
 number(range,'array range');check(Array.isArray(systems),'Actual registered star systems required');const loc=market.location;check(loc,'Actual market hyperspace position required');number(loc.x,'market x');number(loc.y,'market y');let domain=0,makeshift=0;
 for(const system of systems){check(system.location&&Array.isArray(system.sensorArrays),'Actual star system and sensor array roster required');
  const dx=f(loc.x-number(system.location.x,'system x')),dy=f(loc.y-number(system.location.y,'system y'));
  let dist=f(f(Math.sqrt(f(f(dx*dx)+f(dy*dy))))/R.settings.unitsPerLightYear);
  if(dist>range&&f(Math.floor(f(dist*10)+0.5))<=f(range*10))dist=range;if(!(dist<=range))continue;
  for(const entity of system.sensorArrays){check(Array.isArray(entity.tags)&&(entity.factionId===null||typeof entity.factionId==='string'),'Actual array ownership and tags required');if(!entity.tags.includes('sensor_array')||entity.factionId!=='player')continue;if(entity.tags.includes('makeshift'))makeshift++;else domain++;}
 }
 const base=f(f(Math.min(domain,C.MAX_SENSOR_ARRAYS))*C.RANGE_PER_DOMAIN_SENSOR_ARRAY),used=Math.max(0,Math.min(C.MAX_SENSOR_ARRAYS-domain,makeshift));return f(base+f(f(used)*C.RANGE_PER_MAKESHIFT_SENSOR_ARRAY));
}
function marketBonus(market){
 const state=market.slipstreamDetection;check(state?.scope==='native-slipstream-detection-stat'&&typeof state.statsRef==='string','Actual market detection stat capture required');
 if(state.bonus===null)state.bonus={objectRef:'created:'+state.statsRef+':slipstream_reveal_range_ly_mod',kind:'bonus',value:blank(),temporary:[],descriptions:blankDescriptions()};
 check(state.bonus.kind==='bonus','Invalid detection stat kind');return state.bonus;
}
function blankDescriptions(){return {flat:{},percent:{},mult:{}};}
export function updateOriginalTopographyMarketRanges(event,markets,systems){
 if(!originalTopographyStageActive(event,'SLIPSTREAM_DETECTION'))return {visited:0,modified:0};check(Array.isArray(markets),'Actual registered economy markets required');let visited=0,modified=0;
 for(const market of markets){check(typeof market.hidden==='boolean','Actual market visibility required');if(market.hidden)continue;visited++;check(typeof market.playerOwned==='boolean'&&Array.isArray(market.industries),'Actual market ownership/industry list required');
  const port=market.industries.find(i=>i.state.industryId==='spaceport')??market.industries.find(i=>i.state.industryId==='megaport'),applicable=port&&functional(port.operating),target=marketBonus(market);
  if(!market.playerOwned||!applicable){for(const key of ['hypertopology1','hypertopology2','hypertopology3','hypertopology4'])for(const channel of ['flat','percent','mult'])modifyOriginalNativeStatTarget(target,channel,key,0,{remove:true});modified++;continue;}
  modifyOriginalNativeStatTarget(target,'flat',id,C.BASE_DETECTION_RANGE_LY,{description:'基础探测距离'});
  modifyOriginalNativeStatTarget(target,'flat','hypertopology2',f(integer(market.size,'market size')),{description:'殖民地规模'});
  const range=C.RANGE_WITHIN_WHICH_SENSOR_ARRAYS_HELP_LY;
  modifyOriginalNativeStatTarget(target,'flat','hypertopology3',originalSensorArrayBonus(market,systems,range),{always:true,description:'在你控制下'+Math.trunc(range)+'光年内，最多 '+C.MAX_SENSOR_ARRAYS+'座传感器阵列'});modified++;
 }
 return {visited,modified};
}
export function applyOriginalTopographyFleetEffects(event,fleet,location){
 check(fleet?.stats&&location&&typeof location.currentLocationRef==='string'&&typeof location.hyperspaceRef==='string','Actual player fleet and current sector location required');
 const stats=fleet.stats,burn=stats.targets.find(t=>t.value===stats.fleetwideMaxBurnMod);check(burn,'Shared fleet burn stat required');
 modifyOriginalNativeStatTarget(burn,'flat',id,0,{remove:true});const fuel=originalNativeFleetDynamicStat(stats,'fuel_use_not_shown_on_map_mult'),target=stats.targets.find(t=>t.value===fuel);
 modifyOriginalNativeStatTarget(target,'mult',id,0,{remove:true});let slipstream=false,burnBonus=false;
 if(location.currentLocationRef===location.hyperspaceRef){
  if(originalTopographyStageActive(event,'SLIPSTREAM_NAVIGATION'))for(const mod of fuel.modifiers.mult){check(Object.hasOwn(target.descriptions?.mult??{},mod.id),'Fuel modifier descriptions were not captured; recapture native stats');if(target.descriptions.mult[mod.id]!==T.slipstreamFuelDescription)continue;
   modifyOriginalNativeStatTarget(target,'mult',id,C.SLIPSTREAM_FUEL_MULT,{description:T.slipstreamFuelDescription+' (超空间测绘)'});slipstream=true;break;
  }
  if(originalTopographyStageActive(event,'HYPERFIELD_OPTIMIZATION')){modifyOriginalNativeStatTarget(burn,'flat',id,C.HYPER_BURN_BONUS,{description:'超空间测绘'});burnBonus=true;}
 }
 return {slipstream,burnBonus};
}
export function refreshOriginalHyperspaceTopography(event,{markets,systems,playerFleet,location}){
 const market=updateOriginalTopographyMarketRanges(event,markets,systems),fleet=applyOriginalTopographyFleetEffects(event,playerFleet,location);return {market,fleet};
}

/** Shared array entities may appear in more than one native repository; JSON must not split them. */
export function restoreOriginalTopographyWorld(world){
 check(world?.scope==='native-topography-world-inputs'&&Array.isArray(world.unresolved),'Invalid topography world capture');if(world.systems===null)return world;check(Array.isArray(world.systems),'Actual system roster required');const entities=new Map();
 for(const system of world.systems)system.sensorArrays=system.sensorArrays.map(entity=>{const old=entities.get(entity.objectRef);if(old){check(canonicalJSON(old)===canonicalJSON(entity),'Conflicting shared sensor array');return old;}entities.set(entity.objectRef,entity);return entity;});return world;
}
