/** LogisticsModule getters and advance, on the shared native fleet/cargo state. */
import R from '../data/reference-fleet-sync.json' with {type:'json'};
import {requireThat} from '../core/Values.mjs';
import {resolveOriginalEconomyMutable as effective} from './OriginalMarketEconomy.mjs';
import {originalResourceQuantity,removeOriginalResourceCargo} from './OriginalResourceCargo.mjs';
import {getOriginalMemberStats} from './OriginalMemberEffects.mjs';
import {originalNativeFleetDynamicStat} from './OriginalNativeFleetStats.mjs';
import {originalNativeMemberStatus,originalNativeMemberNeedsRepairs,originalNativeMemberMaxCR,advanceOriginalNativeMemberRepairs} from './OriginalNativeRepair.mjs';
import {updateOriginalFleetCargoSpace} from './OriginalFleetData.mjs';
const f=Math.fround,S=R.settings,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_LOGISTICS',m);
const number=(n,label)=>{check(typeof n==='number'&&Number.isFinite(n)&&f(n)===n,'Actual native float required: '+label);return n;};
const int=n=>Math.max(-2147483648,Math.min(2147483647,Math.trunc(n))),round=n=>int(Math.floor(n+0.5));
const bonus=(base,modifiers)=>effective({base,modifiers});
function roster(fleet){check(Array.isArray(fleet.membersWithoutNull),'Actual synchronized native roster required');return fleet.membersWithoutNull;}
function hull(member){const h=R.hulls[member.variant?.hullId];check(h,'Actual native hull required');return h;}
function wingCount(member){if(member.type!=='FIGHTER_WING')return 1;check(Object.hasOwn(R.wings,member.specId),'Actual native wing required');return f(R.wings[member.specId].numFighters);}
function quantities(cargo){
 const crew=(int(originalResourceQuantity(cargo,'crew'))+int(number(cargo.extraCrewUsed,'extra crew')))|0;
 const marines=(int(originalResourceQuantity(cargo,'marines'))+int(number(cargo.extraMarinesUsed,'extra marines')))|0;
 return {crew,marines,supplies:f(originalResourceQuantity(cargo,'supplies')+f(int(number(cargo.extraSuppliesUsed,'extra supplies')))),fuel:f(originalResourceQuantity(cargo,'fuel')+number(cargo.extraFuelUsed,'extra fuel'))};
}
export function originalNativeDeploymentSupplyCost(member,fleet){const s=getOriginalMemberStats(member,fleet),modified=effective(s.suppliesToRecover),base=s.suppliesToRecover.base;let cost=f(round(f(modified*wingCount(member))));if(base>0&&cost<1)cost=1;else if(base>1&&cost===base&&modified<base)cost=f(base-1);return cost;}
export function originalNativeRecoverySuppliesPerDay(member,fleet,services={}){
 const repair=originalNativeMemberNeedsRepairs(member,services),recovery=member.repairTracker.cr<originalNativeMemberMaxCR(member,fleet),s=getOriginalMemberStats(member,fleet),count=wingCount(member),h=hull(member);
 const supplies=originalNativeDeploymentSupplyCost(member,fleet);let deploy=f(f(bonus(h.crToDeploy,s.cRPerDeploymentPercent)/100)*count),rate=number(member.repairTracker.recoveryRate,'recovery rate');
 if(repair&&!recovery){deploy=f(f(h.crToDeploy/100)*count);rate=f(s.baseCRRecoveryRatePercentPerDay.base*f(0.01));}
 deploy=Math.max(f(0.01),deploy);return rate>0?f(f(supplies*rate)/deploy):0;
}
export function originalNativeMaintenanceSuppliesPerDay(fleet,mode='all',services={}){
 check(['all','without-recovery','fully-recovered','recovering','mothballed'].includes(mode),'Unknown maintenance scope');let total=0;
 for(const member of roster(fleet)){
  const t=member.repairTracker;check(t&&typeof t.suspendRepairs==='boolean'&&typeof t.mothballed==='boolean','Actual repair flags required');const stopped=t.suspendRepairs||number(t.recoveryRate,'recovery rate')<=0;
  if(mode==='fully-recovered'&&(t.mothballed||t.cr<originalNativeMemberMaxCR(member,fleet))||mode==='without-recovery'&&t.mothballed||mode==='recovering'&&(t.mothballed||stopped||t.cr>=originalNativeMemberMaxCR(member,fleet)&&!originalNativeMemberNeedsRepairs(member,services))||mode==='mothballed'&&!t.mothballed)continue;
  let monthly=effective(getOriginalMemberStats(member,fleet).suppliesPerMonth);if(member.type==='FIGHTER_WING')monthly=f(monthly*f(originalNativeMemberStatus(member,services).modules.filter(m=>m.hullFraction>0).length));
  let daily=f(monthly/30);
  if(!(t.mothballed||stopped||mode==='without-recovery'||t.cr>=originalNativeMemberMaxCR(member,fleet)&&!originalNativeMemberNeedsRepairs(member,services)))daily=f(daily+originalNativeRecoverySuppliesPerDay(member,fleet,services));
  total=f(total+daily);
 }
 return total;
}
export function quoteOriginalNativeLogistics(fleet,services={}){
 const c=fleet.cargo,q=quantities(c),marines=f(f(q.marines)*S.suppliesPerMarinePerDay),crew=f(f(q.crew)*S.suppliesPerCrewPerDay),maintenance=originalNativeMaintenanceSuppliesPerDay(fleet,'all',services);
 const over=(n,rate)=>n>0?Math.min(S.maxSuppliesPerDayForOverCapacity,f(n*rate)):0;
 const excessCargo=over(f(number(c.spaceUsed,'space used')-number(c.maxCapacity,'cargo capacity')),S.suppliesPerCargoUnitOverCapacity);
 const excessFuel=over(f(q.fuel-number(c.maxFuel,'fuel capacity')),S.suppliesPerFuelUnitOverCapacity);
 const excessPersonnel=over(f(f((q.crew+q.marines)|0)-number(c.maxPersonnel,'personnel capacity')),S.suppliesPerPersonnelUnitOverCapacity);
 const shipCount=f(roster(fleet).length),excessShips=shipCount<=S.maxShipsInFleet?0:f(originalNativeMaintenanceSuppliesPerDay(fleet,'without-recovery',services)*f(S.suppliesPerShipOverMaxInFleet*f(shipCount-S.maxShipsInFleet)));
 const excess=f(f(f(excessCargo+excessFuel)+excessPersonnel)+excessShips),suppliesPerDay=f(f(f(marines+crew)+maintenance)+excess);
 return {marines,crew,maintenance,excessCargo,excessFuel,excessPersonnel,excessShips,suppliesPerDay};
}
export function originalNativeBaseFuelPerLightYear(fleet){let total=0;for(const m of roster(fleet))total=f(total+bonus(hull(m).fuelUse,getOriginalMemberStats(m,fleet).fuelUseMod));return total;}
/** Days, not real seconds. Failed adapters poison/discard the parent draft; never publish half an advance. */
export function advanceOriginalNativeFleetLogistics(fleet,days,services={}){
 number(days,'logistics days');check(days>=0&&typeof fleet.aiMode==='boolean','Actual AI mode and nonnegative days required');let hasSupplies=true,supplyCost=0,fuelCost=0;
 if(!fleet.aiMode){const quote=quoteOriginalNativeLogistics(fleet,services);supplyCost=f(quote.suppliesPerDay*days);const supplies=quantities(fleet.cargo).supplies;if(!(supplyCost<=supplies&&supplies>0)){supplyCost=supplies;hasSupplies=supplies>0;}removeOriginalResourceCargo(fleet.cargo,'supplies',supplyCost,()=>updateOriginalFleetCargoSpace(fleet.cargo));}
 if(days>0)for(const m of roster(fleet)){m.fleetDataRef=fleet.dataRef;advanceOriginalNativeMemberRepairs(m,fleet,days,hasSupplies,services);}
 if(!fleet.aiMode){
  const base=originalNativeBaseFuelPerLightYear(fleet),environment=fleet.logisticsEnvironment;check(environment&&typeof environment.inHyperspace==='boolean'&&fleet.stats,'Actual native fleet environment/stats required');
  let hyper=f(base*effective(fleet.stats.fuelUseHyperMult));if(!environment.inHyperspace)hyper=0;
  let normal=f(base*effective(fleet.stats.fuelUseNormalMult));if(environment.inHyperspace)normal=0;
  const costPerLY=f(f(hyper+normal)*effective(originalNativeFleetDynamicStat(fleet.stats,'fuel_use_not_shown_on_map_mult')));
  if(costPerLY>0){check(Array.isArray(environment.velocity)&&environment.velocity.length===2,'Actual native velocity required');const [x,y]=environment.velocity.map(n=>number(n,'velocity'));let speed=f(Math.sqrt(f(f(x*x)+f(y*y))));const maxSpeed=f(f(20*S.speedPerBurnLevel)+S.baseTravelSpeed),mult=speed>maxSpeed?f(maxSpeed/speed):1;speed=f(speed*number(environment.secondsPerDay,'seconds per day'));fuelCost=f(f(f(f(costPerLY*speed)/S.unitsPerLightYear)*days)*mult);if(fuelCost>0)removeOriginalResourceCargo(fleet.cargo,'fuel',fuelCost,()=>updateOriginalFleetCargoSpace(fleet.cargo));}
 }
 return {hasSupplies,supplyCost,fuelCost};
}
