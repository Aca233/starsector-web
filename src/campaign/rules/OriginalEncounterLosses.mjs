/** FleetEncounterContext ship/CR/crew effects on actual shared fleets and cargo. */
import R from '../data/reference-battle-autoresolver.json' with {type:'json'};
import SYNC from '../data/reference-fleet-sync.json' with {type:'json'};
import {originalBattleFleetMembers,originalBattleIsInvolved,originalBattlePlayerSide,originalBattleIsPlayerSide,originalBattleSideFor} from './OriginalCampaignBattle.mjs';
import {getOriginalMemberStats,originalMemberPlayerCommander} from './OriginalMemberEffects.mjs';
import {originalMemberCurrentCR} from './OriginalFleetMemberStats.mjs';
import {originalNativeMemberStatus,originalNativeMemberHullFraction,originalNativeMemberMaxCR,applyOriginalNativeCREvent} from './OriginalNativeRepair.mjs';
import {resetOriginalBattleDamageTaken} from './OriginalBattleMemberDamage.mjs';
import {synchronizeOriginalFleet,originalMemberLogistics,originalMemberDeploymentPoints,updateOriginalFleetCapacities,updateOriginalFleetCargoSpace} from './OriginalFleetData.mjs';
import {originalFleetViewForMember} from './OriginalCampaignFleetView.mjs';
import {originalResourceQuantity,removeOriginalResourceCargo,addOriginalResourceCargo} from './OriginalResourceCargo.mjs';
import {resolveOriginalEconomyMutable as effective} from './OriginalMarketEconomy.mjs';
import {originalJavaNextDouble} from './OriginalJavaRandom.mjs';
import {encounterCheck as check,encounterCall as call,encounterFloat as num,encounterBool as bool,originalEncounterSide,originalEncounterSource as source,originalEncounterMemberFleet as owner,originalEncounterMemberCrew,createOriginalEncounterCrew,clearOriginalEncounterCrew,addOriginalEncounterCrew,transferOriginalEncounterCrew} from './OriginalEncounterState.mjs';
const f=Math.fround,int=n=>Number.isNaN(n)?0:Math.max(-2147483648,Math.min(2147483647,Math.trunc(n))),round=n=>int(Math.floor(n+.5));
const stats=(s,m,ops)=>getOriginalMemberStats(m,owner(s,m,ops));
const currentCR=(s,m,ops)=>{const fleet=owner(s,m,ops);return originalMemberCurrentCR(m,fleet,{playerCommander:originalMemberPlayerCommander(m,fleet)});};
const deployed=(s,r,m)=>originalEncounterSide(s,r.fleet).memberToDeployedMap.find(row=>row.member===m)?.deployed??null;
export function originalEncounterCargo(fleet,services={}){synchronizeOriginalFleet(fleet,services);check(fleet.cargo,'Actual fleet cargo required');return fleet.cargo;}
function changeCargo(fleet,cargo,id,amount,add){
 if(amount<=0)return;
 (add?addOriginalResourceCargo:removeOriginalResourceCargo)(cargo,id,amount,()=>updateOriginalFleetCargoSpace(cargo),()=>{
  if(id==='crew'&&cargo.carryingFleetRef!==null){check(cargo.carryingFleetRef===fleet.dataRef,'Actual carrying FleetData required');fleet.synchronization.needsSync=true;}
 });
}
export function originalEncounterDeployCost(state,member,services={}){
 const s=stats(state,member,services),h=SYNC.hulls[member.variant.hullId];check(h,'Actual deployment hull required');
 let cost=f(effective({base:h.crToDeploy,modifiers:s.cRPerDeploymentPercent})/100);
 if(member.type==='FIGHTER_WING'){const wing=SYNC.wings[member.specId];check(wing,'Actual fighter wing required');cost=f(cost*f(wing.numFighters));}return cost;
}
export function removeOriginalEncounterShip(state,fleet,member,services={}){
 const current=call(services,'readEncounterCurrentLocation'),visible=current===fleet.campaign.entity.containingLocation;
 call(call(services,'readBattleFleetRoster',fleet),'removeMember',member);
 // getViewForMember happens even when the fleet is not in the current location.
 const view=originalFleetViewForMember(fleet,member);
 if(view!==null&&visible)call(services,'showEncounterMemberDestruction',view,fleet,member);
}
function applyShipLosses(state,result,services){
 for(const list of [result.destroyed,result.disabled])for(const member of list){const fleet=source(state,member);if(fleet===null)continue;removeOriginalEncounterShip(state,fleet,member,services);call(call(services,'readBattleFleetRoster',result.fleet),'removeMember',member);}
}
function extendedCR(state,result,member,services){const detail=deployed(state,result,member);if(detail===null)return;call(services,'applyEncounterExtendedCRLoss',state,result,member,detail);}
export function applyOriginalEncounterCR(state,result,services={}){
 const won=bool(result.winner);
 if(won){state.preEngagementCRForWinner.length=0;for(const member of [...originalBattleFleetMembers(result.fleet,services)])state.preEngagementCRForWinner.push({member,cr:currentCR(state,member,services)});}
 for(const member of [...result.disabled,...result.destroyed])applyOriginalNativeCREvent(member,-1,'在战斗中停机');
 for(const member of result.deployed){const cost=originalEncounterDeployCost(state,member,services);applyOriginalNativeCREvent(member,f(-cost),member.type==='FIGHTER_WING'?'在战斗中部署战机':'在战斗中部署');extendedCR(state,result,member,services);}
 const retreatMult=services.readEncounterRetreatLossMult?num(call(services,'readEncounterRetreatLossMult')):R.settings.crLossMultForRetreatInLoss;
 for(const member of result.retreated){const cost=originalEncounterDeployCost(state,member,services);applyOriginalNativeCREvent(member,f(-cost),member.type==='FIGHTER_WING'?'在战斗中部署战机':'在战斗中部署');extendedCR(state,result,member,services);const extra=f(cost*retreatMult);if(!won&&result.goal!=='ESCAPE'&&extra>0)applyOriginalNativeCREvent(member,f(-extra),'撤退中的交战');}
}
export function originalEncounterCrewLossFraction(state,member,result,hullFraction,hullDamage,services={}){
 num(hullFraction);num(hullDamage);const random=()=>f(originalJavaNextDouble(services.globalRandom));
 if(member===null&&hullFraction===0)return f(f(.75)+f(random()*f(.25)));
 check(member,'Actual crew-loss member required');
 const detail=result===null?null:deployed(state,result,member);
 // Detailed tactical craft/deployment records need their real combat adapter, never zeroed data.
 if(detail!==null)return num(call(services,'computeEncounterDetailedCrewLoss',state,member,result,hullFraction,hullDamage,detail));
 if(member.type==='FIGHTER_WING'&&result!==null){const base=f(f(.25)+f(f(random()*f(.75))*random()));return f(f(base*effective(stats(state,member,services).crewLossMult))*hullDamage);}
 if(hullFraction===0){const base=f(f(.75)+f(random()*f(.25)));return Math.min(1,f(base*effective(stats(state,member,services).crewLossMult)));}
 const squared=f(hullDamage*hullDamage),randomFactor=f(f(.5)+f(random()*f(.5)));
 return Math.min(1,f(f(squared*randomFactor)*effective(stats(state,member,services).crewLossMult)));
}
function damageTaken(member,services){const status=originalNativeMemberStatus(member,services);let total=0;for(const module of status.modules)total=f(total+num(module.hullDamageTaken));return f(total/f(status.modules.length));}
export function applyOriginalEncounterCrewLosses(state,result,playerInvolved,services={}){
 bool(playerInvolved);const data=originalEncounterSide(state,result.fleet),recoverable=data.recoverableCrewLosses;
 const all=[...result.disabled,...result.deployed,...result.destroyed,...result.retreated,...result.reserves];
 for(const member of result.reserves)resetOriginalBattleDamageTaken(member,services);
 const playerLosses=data.crewLossesDuringLastEngagement;clearOriginalEncounterCrew(playerLosses);const losses=createOriginalEncounterCrew();let playerFleet=null,capacityLost=0;
 for(const member of all){
  const fleet=source(state,member);if(fleet===null)continue;const player=bool(fleet.isPlayerFleet),crew=originalEncounterMemberCrew(member);
  const damage=damageTaken(member,services),hull=originalNativeMemberHullFraction(member,services);resetOriginalBattleDamageTaken(member,services);
  const fraction=originalEncounterCrewLossFraction(state,member,result,hull,damage,services);
  if(result.disabled.includes(member)||result.destroyed.includes(member)){
   if(playerInvolved&&!originalBattlePlayerSide(state.battle,services).includes(fleet))state.playerDidSeriousDamage=true;
   if(player){if(fraction<1)addOriginalEncounterCrew(recoverable,f(f(1-fraction)*crew.crew));addOriginalEncounterCrew(playerLosses,crew.crew);capacityLost=f(capacityLost+originalMemberLogistics(member).maxCrew);}
   addOriginalEncounterCrew(losses,crew.crew);crew.crew=0;
  }else{
   if(fraction>1)addOriginalEncounterCrew(losses,f(f(fraction-1)*crew.crew));const lost=f(crew.crew*fraction);transferOriginalEncounterCrew(crew,lost,losses);
   if(player){addOriginalEncounterCrew(playerLosses,lost);capacityLost=f(capacityLost+f(originalMemberLogistics(member).maxCrew*fraction));}
  }
  if(player&&(losses.crew>0||losses.marines>0))playerFleet=fleet;
  // Native getCargo sync can reassign surviving crews between successive members.
  const cargo=originalEncounterCargo(fleet,services);changeCargo(fleet,cargo,'crew',f(int(losses.crew)),false);changeCargo(fleet,cargo,'marines',f(int(losses.marines)),false);clearOriginalEncounterCrew(losses);
 }
 if(playerFleet!==null){
  updateOriginalFleetCapacities(playerFleet);const cargo=originalEncounterCargo(playerFleet,services),maxCrew=num(cargo.maxPersonnel);
  const totalCrew=f((int(originalResourceQuantity(cargo,'crew'))+int(num(cargo.extraCrewUsed)))|0),marines=f((int(originalResourceQuantity(cargo,'marines'))+int(num(cargo.extraMarinesUsed)))|0),recoverableTotal=f(recoverable.crew+recoverable.marines);
  let total=f(f(totalCrew+marines)+recoverableTotal);if(f(maxCrew+capacityLost)>0)total=f(total*f(capacityLost/f(maxCrew+capacityLost)));
  let toLose=f(total-maxCrew);
  if(total>maxCrew&&toLose>0){
   transferOriginalEncounterCrew(recoverable,Math.min(recoverableTotal,toLose));toLose=f(toLose-recoverableTotal);total=f(total-recoverableTotal);
   if(toLose>0&&total>0){const crew=f(int(originalResourceQuantity(cargo,'crew')));clearOriginalEncounterCrew(losses);addOriginalEncounterCrew(losses,f(int(Math.ceil(f(f(crew/total)*toLose)))));addOriginalEncounterCrew(losses,f(int(Math.ceil(f(f(marines/total)*toLose)))),'marines');addOriginalEncounterCrew(playerLosses,losses.crew);addOriginalEncounterCrew(playerLosses,losses.marines,'marines');changeCargo(playerFleet,cargo,'crew',f(int(losses.crew)),false);changeCargo(playerFleet,cargo,'marines',f(int(losses.marines)),false);clearOriginalEncounterCrew(losses);}
  }
 }
}
export function applyOriginalEncounterResultsToFleets(state,result,services={}){
 applyShipLosses(state,result.winnerResult,services);applyShipLosses(state,result.loserResult,services);
 applyOriginalEncounterCR(state,result.winnerResult,services);applyOriginalEncounterCR(state,result.loserResult,services);
 const involved=originalBattleIsInvolved(state.battle,call(services,'readBattlePlayerFleet'));
 applyOriginalEncounterCrewLosses(state,result.winnerResult,involved,services);applyOriginalEncounterCrewLosses(state,result.loserResult,involved,services);
}
export function recoverOriginalEncounterCrew(state,fleet,services={}){
 if(!originalBattleIsPlayerSide(state.battle,originalBattleSideFor(state.battle,fleet),services))return;
 const data=originalEncounterSide(state,fleet),player=call(services,'readBattlePlayerFleet'),cargo=originalEncounterCargo(player,services),crew=data.recoverableCrewLosses;
 changeCargo(player,cargo,'crew',crew.crew,true);changeCargo(player,cargo,'marines',f(int(crew.marines)),true);
 // The native method does not clear recoverable crew; callers govern repeat invocation.
}
export function recoverOriginalEncounterVictoryCR(state,winnerResult,loserResult,services={}){
 const winner=originalEncounterSide(state,winnerResult.fleet),loser=originalEncounterSide(state,loserResult.fleet);let destroyed=0,left=0;
 for(const member of [...loser.retreatedFromLastEngagement,...loser.inReserveDuringLastEngagement])left=f(left+originalMemberDeploymentPoints(member));
 for(const member of [...loser.destroyedInLastEngagement,...loser.disabledInLastEngagement])destroyed=f(destroyed+originalMemberDeploymentPoints(member));
 for(const member of loser.retreatedFromLastEngagement){if(member.type!=='FIGHTER_WING')continue;const detail=deployed(state,loserResult,member);if(detail!==null)destroyed=f(destroyed+num(call(services,'readEncounterExtraFighterLossDP',state,member,detail)));}
 let total=0,count=0;
 for(const member of winner.deployedInLastEngagement){
  const dp=originalMemberDeploymentPoints(member);let fraction=f(Math.max(0,f(f(dp*f(1.25))-destroyed))/dp);
  if(destroyed>f(left*2))fraction=f(Math.max(0,f(f(dp*f(.75))-destroyed))/dp);if(fraction>1)fraction=1;if(destroyed<=0)fraction=1;
  const cost=originalEncounterDeployCost(state,member,services);
  // Native reads/clamps a local prevCR but never uses it to cap this recovery.
  let amount=f(f(round(f(f(cost*fraction)*100)))/100);
  const tags=services.readEncounterHullTags?call(services,'readEncounterHullTags',member):R.hulls[member.variant.hullId]?.tags;check(Array.isArray(tags),'Actual hull recovery tags required');
  if(tags.includes('full_cr_recovery'))amount=f(originalNativeMemberMaxCR(member,owner(state,member,services))-currentCR(state,member,services));
  total=f(total+amount);count=f(count+1);if(amount>0)applyOriginalNativeCREvent(member,amount,'现场维修');
 }
 return count<=0?0:f(f(round(f(f(total/count)*100)))/100);
}
export function fixOriginalEncounterFighters(state,result,services={}){
 const carriers=new Set();for(const list of [result.reserves,result.deployed,result.retreated])for(const member of list){const fleet=source(state,member);if(fleet===null||bool(member.repairTracker.mothballed)||int(effective(stats(state,member,services).numFighterBays))<=0)continue;carriers.add(fleet);}
 const saved=result.destroyed.filter(member=>source(state,member)!==null&&carriers.has(source(state,member))&&member.type==='FIGHTER_WING');
 for(let i=result.destroyed.length-1;i>=0;i--)if(saved.includes(result.destroyed[i]))result.destroyed.splice(i,1);result.retreated.push(...saved);
 for(const member of [...result.deployed,...result.retreated]){const fleet=source(state,member);if(fleet===null||member.type!=='FIGHTER_WING')continue;const status=originalNativeMemberStatus(member,services);
  for(const module of status.modules)if(module.permaDetached!==true&&(carriers.has(fleet)||module.hullFraction>0)){module.detached=null;module.hullFraction=1;module.armorCellFractions=null;}status.hullFractions=status.modules.map(m=>m.hullFraction);
 }
}
