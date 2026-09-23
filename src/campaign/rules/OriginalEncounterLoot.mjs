import {generateOriginalEncounterPlayerLoot} from './OriginalEncounterPlayerLoot.mjs';
/** Actual FleetEncounterContext cargo losses and weighted post-battle distribution. */
import R from '../data/reference-battle-autoresolver.json' with {type:'json'};
import {originalBattleFleetPoints,originalBattleSideFor,originalBattleSnapshot,originalBattleSnapshotFor,originalBattleIsPlayerSide,originalBattlePlayerSide,originalBattleIsInvolved} from './OriginalCampaignBattle.mjs';
import {updateOriginalFleetCapacities,originalMemberLogistics} from './OriginalFleetData.mjs';
import {originalResourceQuantity} from './OriginalResourceCargo.mjs';
import {originalJavaNextDouble,originalJavaNextFloat,validateOriginalJavaRandom} from './OriginalJavaRandom.mjs';
import {originalEncounterCargo} from './OriginalEncounterLosses.mjs';
import {originalNativeCargoItemSpec,originalNativeCargoStackUnit,addOriginalNativeCargoStack,addOriginalNativeCargoItems,clearOriginalNativeCargo,sortOriginalNativeCargo} from './OriginalNativeCargo.mjs';
import {encounterCheck as check,encounterCall as call,encounterFloat as num,encounterBool as bool,originalEncounterSource} from './OriginalEncounterState.mjs';
const f=Math.fround,int=n=>Number.isNaN(n)?0:Math.max(-2147483648,Math.min(2147483647,Math.trunc(n))),round=n=>f(int(Math.floor(n+.5)));
const winner=s=>s.sideData.find(data=>!data.disengaged)??null,loser=s=>s.sideData.find(data=>data.disengaged)??null;
export function originalEncounterSnapshotFor(state,fleet){
 const b=state.battle,one=originalBattleSnapshot(b,'ONE'),two=originalBattleSnapshot(b,'TWO');
 if(one.includes(fleet))return one;if(two.includes(fleet))return two;
 if(b.sideOne.includes(fleet))return one;if(b.sideTwo.includes(fleet))return two;
 return b.combinedOne===fleet?one:b.combinedTwo===fleet?two:null;
}
export function originalEncounterPlayerContribution(state,services={}){
 const total=f(num(state.playerFPHullDamageToEnemies)+num(state.allyFPHullDamageToEnemies)),b=state.battle;
 if(total<=0){if(b===null)return 1;if(!originalBattleIsInvolved(b,call(services,'readBattlePlayerFleet')))return 0;const side=originalBattlePlayerSide(b,services);check(side!==null,'Actual player side required');return originalBattleSnapshotFor(b,side).length<=1||side.length<=1?1:0;}
 let startedWithAllies=false;if(b!==null){const side=originalBattlePlayerSide(b,services);check(side!==null,'Actual player side required for recorded player damage');startedWithAllies=originalBattleSnapshotFor(b,side).length>1;}
 return startedWithAllies?Math.min(1,f(state.playerFPHullDamageToEnemies/total)):1;
}
function cargoRandom(state,services){
 check(state.salvageRandom!==undefined,'Actual nullable salvage random required');const r=state.salvageRandom===null?call(services,'readEncounterMiscRandom'):state.salvageRandom;validateOriginalJavaRandom(r);
 if(state.salvageRandom===null)check(r!==services.globalRandom,'Misc.random must be independent of Math.random');return r;
}
/** recoveredShips is intentionally unused by the native cargo-only method. */
export function lootOriginalEncounterCargo(state,recoveredShips,takingFromPlayer,services={}){
 bool(takingFromPlayer);const win=winner(state),lose=loser(state);if(win===null||lose===null)return;
 updateOriginalFleetCapacities(lose.fleet);const combinedCargo=originalEncounterCargo(lose.fleet,services);
 let maxCargo=f(int(num(combinedCargo.maxCapacity))),maxFuel=f(int(num(combinedCargo.maxFuel))),lostCargo=0,lostFuel=0,totalLoss=0;const fractions=new Map();
 for(const data of win.enemyCasualties){
  const member=data.member,override=state.origSourceForRecoveredShips.find(row=>row.member===member)?.fleet;
  const fleet=override??originalEncounterSource(state,member),capacity=originalMemberLogistics(member);
  if(fleet!==null){
   const cargo=originalEncounterCargo(fleet,services);let loss=fractions.get(cargo);
   if(!loss){loss={maxCargo:f(int(num(cargo.maxCapacity))),maxFuel:f(int(num(cargo.maxFuel))),lostCargo:0,lostFuel:0};fractions.set(cargo,loss);}
   loss.lostCargo=f(loss.lostCargo+capacity.cargo);loss.lostFuel=f(loss.lostFuel+capacity.fuel);loss.maxCargo=f(loss.maxCargo+capacity.cargo);loss.maxFuel=f(loss.maxFuel+capacity.fuel);totalLoss=f(totalLoss+f(loss.maxCargo+loss.maxFuel));
  }else{lostCargo=f(lostCargo+capacity.cargo);lostFuel=f(lostFuel+capacity.fuel);maxCargo=f(maxCargo+capacity.cargo);maxFuel=f(maxFuel+capacity.fuel);totalLoss=f(totalLoss+f(maxCargo+maxFuel));}
 }
 if(totalLoss<=0)return;maxCargo=Math.max(1,maxCargo);maxFuel=Math.max(1,maxFuel);
 let recovery=services.readEncounterCargoRecoveryFraction?num(call(services,'readEncounterCargoRecoveryFraction')):R.settings.salvageCargoFraction;
 if(originalBattleIsPlayerSide(state.battle,originalBattleSideFor(state.battle,win.fleet),services))recovery=f(recovery*originalEncounterPlayerContribution(state,services));
 const cargoFraction=lostCargo>maxCargo?1:f(lostCargo/maxCargo),fuelFraction=lostFuel>maxFuel?1:f(lostFuel/maxFuel),losers=originalEncounterSnapshotFor(state,lose.fleet);if(losers===null)return;
 const stacks=[];for(const fleet of losers){const cargo=originalEncounterCargo(fleet,services);for(const stack of [...cargo.slots])stacks.push({cargo:originalEncounterCargo(fleet,services),stack});}
 for(const {cargo,stack}of stacks){
  if(stack===null||stack.type==='NULL'||stack.size<1||stack.type==='RESOURCES'&&['crew','marines'].includes(stack.commodityId))continue;
  let cargoLost=cargoFraction,fuelLost=fuelFraction;const loss=fractions.get(cargo);
  if(loss){cargoLost=loss.lostCargo>loss.maxCargo?1:f(loss.lostCargo/loss.maxCargo);fuelLost=loss.lostFuel>loss.maxFuel?1:f(loss.lostFuel/loss.maxFuel);}
  if(takingFromPlayer&&(stack.type==='SPECIAL'||stack.type==='RESOURCES'&&originalNativeCargoItemSpec(stack).tags.includes('no_loss_from_combat')))continue;
  const random=cargoRandom(state,services);let lost=f((stack.type==='RESOURCES'&&stack.commodityId==='fuel'?fuelLost:cargoLost)*num(stack.size));
  let taken=round(f(lost*f(f(.5)+f(originalJavaNextFloat(random)*f(.5)))));
  if(lost<1){if(originalJavaNextFloat(random)<lost)lost=1;else{lost=0;taken=0;}}
  if(lost<=0)continue;addOriginalNativeCargoStack(cargo,stack,f(-lost),services);
  const recovered=f(taken*recovery);if(recovered>=1)addOriginalNativeCargoItems(state.loot,stack,recovered,services);
 }
 const side=originalBattleSideFor(state.battle,lose.fleet);check(side!==null,'Actual loser side required');for(const fleet of side)if(fleet.isPlayerFleet){sortOriginalNativeCargo(originalEncounterCargo(fleet,services),services);break;}
}
function pickerFor(fleets,services){let total=0;const entries=[];for(const fleet of fleets){const weight=f(originalBattleFleetPoints(fleet,services));if(weight<=0)continue;entries.push({fleet,weight});total=f(total+weight);}return {entries,total};}
function pick(picker,services){if(picker.entries.length===0)return null;let chosen=picker.entries.at(-1),sum=0;const roll=Math.min(picker.total,f(originalJavaNextDouble(services.globalRandom)*picker.total));for(const row of picker.entries){sum=f(sum+row.weight);if(roll<=sum){chosen=row;break;}}return chosen;}
export function autoLootOriginalEncounter(state,services={}){
 const win=winner(state),lose=loser(state);if(win===null||lose===null)return;const side=originalBattleSideFor(state.battle,win.fleet);check(side!==null,'Actual winner side required');
 for(const fuelPass of [false,true]){
  const picker=pickerFor(side,services);
  for(const stack of [...state.loot.slots]){
   if(stack===null||stack.type==='NULL'||(stack.type==='RESOURCES'&&stack.commodityId==='fuel')!==fuelPass)continue;
   const chosen=pick(picker,services);if(chosen===null)break;const cargo=originalEncounterCargo(chosen.fleet,services);
   // Native fuel path really uses maxCapacity, NOT maxFuel (javap verified).
   const space=fuelPass?f(f(int(num(cargo.maxCapacity)))-f(originalResourceQuantity(cargo,'fuel')+num(cargo.extraFuelUsed))):Math.max(0,f(num(cargo.maxCapacity)-num(cargo.spaceUsed)));
   if(space<=0){picker.entries.splice(picker.entries.indexOf(chosen),1);picker.total=f(picker.total-chosen.weight);continue;}
   let max=f(int(f(space/originalNativeCargoStackUnit(stack))));if(max>stack.size)max=stack.size;
   // Math.round(double) returns long here, then converts to float; do not round the factor to float.
   max=f(Math.floor(max*(originalJavaNextDouble(services.globalRandom)*.5+.5)+.5));addOriginalNativeCargoItems(cargo,stack,max,services);
  }
 }
}
export function generateOriginalEncounterLoot(state,recoveredShips,withCredits,services={}){
 bool(withCredits);check(recoveredShips===null||Array.isArray(recoveredShips),'Actual nullable recovered ships required');state.creditsLooted=0;clearOriginalNativeCargo(state.loot);
 const win=winner(state);if(originalBattleIsPlayerSide(state.battle,originalBattleSideFor(state.battle,win?.fleet??null),services)){if(services.generateEncounterPlayerLoot)call(services,'generateEncounterPlayerLoot',state,recoveredShips,withCredits);else generateOriginalEncounterPlayerLoot(state,recoveredShips,withCredits,services);}
 else lootOriginalEncounterCargo(state,recoveredShips,true,services);
 sortOriginalNativeCargo(state.loot,services);
}
