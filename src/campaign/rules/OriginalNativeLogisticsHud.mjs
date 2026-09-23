/** Objectnew's readouts, projected from THIS fleet, never from the singleton player account. */
import R from '../data/reference-fleet-sync.json' with {type:'json'};
import Sensors from '../data/reference-sensors.json' with {type:'json'};
import {requireThat} from '../core/Values.mjs';
import {resolveOriginalEconomyMutable,resolveOriginalEconomyBonus} from './OriginalMarketEconomy.mjs';
import {originalMemberCurrentCR} from './OriginalFleetMemberStats.mjs';
import {originalMemberPlayerCommander} from './OriginalMemberEffects.mjs';
import {originalResourceQuantity} from './OriginalResourceCargo.mjs';
import {quoteOriginalNativeLogistics,originalNativeBaseFuelPerLightYear} from './OriginalNativeLogistics.mjs';
import {originalFleetMinBurnLevel,updateOriginalFleetTravelSpeed} from './OriginalFleetData.mjs';
import {originalNativeMemberStatus,originalNativeMemberHullFraction,originalNativeMemberNeedsRepairs,originalNativeMemberMaxCR,originalNativeMemberRepairRate} from './OriginalNativeRepair.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_LOGISTICS_HUD',m);
const scalar=v=>{check(typeof v==='number'&&Number.isFinite(v),'Actual HUD quantity required');return f(v);};
const integer=v=>Math.max(-2147483648,Math.min(2147483647,Math.trunc(v)));
const round=v=>Number.isNaN(v)?0:integer(Math.floor(v+.5));
function repairedness(member){
 const status=originalNativeMemberStatus(member);let total=0;
 for(const module of status.modules){
  let armor=1;if(module.armorCellFractions!==null){const {gridWidth:w,gridHeight:h,armorCellFractions:grid}=module;check(Array.isArray(grid)&&Number.isInteger(w)&&Number.isInteger(h),'Actual native armor dimensions required');if(grid.length>=4&&grid.length===w&&Array.isArray(grid[0])&&grid[0].length>=4&&grid[0].length===h){check(grid.every(col=>Array.isArray(col)&&col.length===h),'Actual rectangular native armor grid required');let sum=0;for(let x=0;x<w;x++)for(let y=0;y<h;y++)sum=f(sum+scalar(grid[x][y]));armor=f(sum/f((w*h)|0));}}total=f(total+armor);
 }
 return Math.min(originalNativeMemberHullFraction(member),f(total/f(status.modules.length)));
}
export function projectOriginalNativeLogisticsHud(fleet,context){
 check(fleet?.cargo&&fleet.synchronization,'Actual native owned fleet required');const cargo=fleet.cargo,missing=[];
 const read=(name,fn)=>{try{return fn();}catch(error){if(typeof error?.code!=='string'||!error.code.startsWith('UNSUPPORTED_'))throw error;missing.push(name);return null;}};
 const resource=id=>scalar(originalResourceQuantity(cargo,id));
 const credits=read('credits',()=>{check(fleet.credits&&fleet.credits.objectRef===cargo.creditsRef,'Cargo account identity required');return integer(scalar(fleet.credits.value));});
 const supplies=read('supplies',()=>f(resource('supplies')+f(integer(scalar(cargo.extraSuppliesUsed))))),crew=read('crew',()=>((integer(resource('crew'))+integer(scalar(cargo.extraCrewUsed)))|0)),marines=read('marines',()=>((integer(resource('marines'))+integer(scalar(cargo.extraMarinesUsed)))|0)),fuel=read('fuel',()=>f(resource('fuel')+scalar(cargo.extraFuelUsed)));
 const synced=()=>check(fleet.synchronization.lifecycle==='current'&&!fleet.synchronization.needsSync,'Actual completed fleet synchronization required');
 const capacity=key=>read(key,()=>{synced();return scalar(cargo[key]);});
 // Null is the stock pristine-status sentinel. Allocate only on detached member wrappers.
 const memberFleet=()=>{synced();check(Array.isArray(fleet.membersWithoutNull),'Actual synchronized member roster required');const members=fleet.membersWithoutNull.map(member=>{check(member.statUpdateNeeded===false&&member.stats?.lifecycle==='current','Current member stat effects required before reading HUD');check(member.repairTracker&&typeof member.repairTracker.mothballed==='boolean'&&typeof member.repairTracker.suspendRepairs==='boolean','Actual repair flags required');return {...member};});return {...fleet,membersWithoutNull:members};};
 const suppliesPerDay=read('supplies-per-day',()=>quoteOriginalNativeLogistics(memberFleet()).suppliesPerDay);
 const cr=read('readiness',()=>{const copy=memberFleet();let count=0,current=0,max=0;for(const member of copy.membersWithoutNull){if(member.repairTracker.mothballed)continue;current=f(current+originalMemberCurrentCR(member,copy,{playerCommander:originalMemberPlayerCommander(member,copy)}));max=f(max+originalNativeMemberMaxCR(member,copy));count=f(count+1);}return {value:count===0?0:f(f(current/count)*100),max:count===0?0:f(f(max/count)*100)};});
 const hull=read('repairedness',()=>{const copy=memberFleet();let total=0,weights=0;for(const member of copy.membersWithoutNull){if(member.repairTracker.mothballed||member.type==='FIGHTER_WING')continue;const spec=R.hulls[member.variant?.hullId];check(spec,'Actual hull size required');const weight=({CAPITAL_SHIP:5,CRUISER:3,DESTROYER:2,FIGHTER:1,FRIGATE:1,DEFAULT:1})[spec.hullSize];check(weight!==undefined,'Known original hull-size weight required');total=f(total+f(repairedness(member)*weight));weights=f(weights+weight);}return weights===0?0:round(f(f(total/weights)*100));});
 const repairs=read('repair-time',()=>{check(supplies!==null,'Actual supplies required');if(supplies<=0)return {active:false,days:0};const copy=memberFleet();let active=false,max=0;for(const member of copy.membersWithoutNull){if(member.type==='FIGHTER_WING'||member.repairTracker.mothballed||member.repairTracker.suspendRepairs||!originalNativeMemberNeedsRepairs(member))continue;active=true;const days=f(f(1-repairedness(member))/originalNativeMemberRepairRate(member,copy));if(days>max)max=days;}return {active,days:round(max)};});
 const sensor=(kind,mod)=>read(kind,()=>{synced();check(fleet.stats?.[mod],'Actual sensor stat modifiers required');let value=resolveOriginalEconomyMutable({base:scalar(fleet[kind]),modifiers:fleet.stats[mod]});if(kind==='sensorStrength'){check(context&&typeof context.playerObserver==='boolean'&&['easy','normal'].includes(context.difficulty),'Actual observing player difficulty required');if(context.playerObserver&&context.difficulty==='easy')value=f(value+Sensors.settings.easySensorBonus);}else value=Math.max(0,value);return value;});
 // coreui.C reads the committed entity velocity, not movementModule's pending velocity.
 const speed=()=>{const e=fleet.logisticsEnvironment;check(e&&Array.isArray(e.velocity)&&e.velocity.length===2,'Actual fleet velocity required');const [x,y]=e.velocity.map(scalar),v=f(Math.sqrt(f(f(x*x)+f(y*y))));check(Number.isFinite(v),'Finite fleet speed required');return v;};
 const burnForSpeed=v=>{v=f(v-R.settings.baseTravelSpeed);if(v<0||v<=f(R.settings.minTravelSpeed+1))v=0;return round(f(v/R.settings.speedPerBurnLevel));};
 const currentBurn=read('current-burn',()=>Math.min(999,burnForSpeed(speed())));
 const burnLimits=read('burn-limits',()=>{const copy=memberFleet();check(copy.stats?.movementSpeedMod&&copy.stats?.fleetwideMaxBurnMod,'Actual movement and burn modifiers required');const maximum=burnForSpeed(resolveOriginalEconomyMutable({base:updateOriginalFleetTravelSpeed(copy),modifiers:copy.stats.movementSpeedMod}));
  const min=originalFleetMinBurnLevel(copy);
  // Empty fleets use Float.MAX_VALUE; preserve native float overflow/saturating round.
  const {flat,percent,mult}=resolveOriginalEconomyBonus(copy.stats.fleetwideMaxBurnMod);
  const adjusted=f(f(f(min+f(f(min*percent)/100))+flat)*mult),delta=round(f(adjusted-min));return {maximum,bonus:Math.max(0,delta),penalty:Math.max(0,-delta)};});
 const fuelUse=read('fuel-use',()=>{check(fuel!==null,'Actual fuel required');if(fuel<=0)return {status:'empty',perDay:null};const e=fleet.logisticsEnvironment;check(e&&typeof e.inHyperspace==='boolean'&&fleet.stats?.fuelUseHyperMult&&fleet.stats?.fuelUseNormalMult,'Actual fuel environment and modifiers required');const hyper=resolveOriginalEconomyMutable(fleet.stats.fuelUseHyperMult),normal=resolveOriginalEconomyMutable(fleet.stats.fuelUseNormalMult);if(f((e.inHyperspace?hyper:0)+normal)<=0)return {status:'not-used',perDay:null};
  const copy=memberFleet(),actual=speed(),rounded=round(actual<10?0:actual),seconds=scalar(e.secondsPerDay);check(seconds>0&&fleet.stats.dynamicStats,'Actual clock and dynamic stats required');const perLY=f(originalNativeBaseFuelPerLightYear(copy)*hyper);let perDay=f(f(f(rounded*seconds)/R.settings.unitsPerLightYear)*perLY);const cap=f(R.settings.baseTravelSpeed+f(20*R.settings.speedPerBurnLevel));if(rounded>cap)perDay=f(perDay*f(cap/actual));
  const hidden=fleet.stats.dynamicStats.fuel_use_not_shown_on_map_mult;perDay=f(perDay*(hidden===undefined?1:resolveOriginalEconomyMutable(hidden)));check(Number.isFinite(perDay),'Finite fuel readout required');return {status:'consuming',perDay};});
 return {scope:'native-fleet-logistics-hud',currentBurn,burnLimits,fuelUse,credits,supplies,crew,marines,fuel,cargoUsed:read('cargo-used',()=>{synced();return scalar(cargo.spaceUsed);}),cargoCapacity:capacity('maxCapacity'),personnelUsed:crew===null||marines===null?null:(crew+marines)|0,personnelCapacity:capacity('maxPersonnel'),fuelCapacity:capacity('maxFuel'),minimumCrew:read('minimum-crew',()=>{synced();return integer(scalar(fleet.minCrew));}),suppliesPerDay,readiness:cr?.value??null,maximumReadiness:cr?.max??null,repairedness:hull,repairing:repairs?.active??null,repairDays:repairs?.days??null,sensorStrength:sensor('sensorStrength','sensorRangeMod'),sensorProfile:sensor('sensorProfile','detectedRangeMod'),missing};
}
