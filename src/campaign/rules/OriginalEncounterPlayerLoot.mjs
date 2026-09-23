/** Player-side equipment, credits and basic salvage; nonempty scripted drop groups require their real generator. */
import R from '../data/reference-battle-autoresolver.json' with {type:'json'};
import {createOriginalJavaRandom,originalJavaNextLong,originalJavaNextFloat} from './OriginalJavaRandom.mjs';
import {originalBattleFleetMembers,originalBattlePlayerSide} from './OriginalCampaignBattle.mjs';
import {originalFleetPointCost} from './OriginalFleetData.mjs';
import {getOriginalMemberStats,originalMemberPlayerCommander} from './OriginalMemberEffects.mjs';
import {originalMemberCurrentCR} from './OriginalFleetMemberStats.mjs';
import {resolveOriginalEconomyMutable as effective} from './OriginalMarketEconomy.mjs';
import {originalResourceQuantity} from './OriginalResourceCargo.mjs';
import {originalNativeCargoItemSpec,addOriginalNativeCargoItems,sortOriginalNativeCargo} from './OriginalNativeCargo.mjs';
import {originalEntityMemoryWithoutUpdate,originalCampaignMemoryContains,originalCampaignMemoryGet,unsetOriginalCampaignMemory} from './OriginalCampaignMemory.mjs';
import {originalEncounterPlayerContribution,originalEncounterSnapshotFor,lootOriginalEncounterCargo} from './OriginalEncounterLoot.mjs';
import {originalEncounterSalvageRandom,originalEncounterSalvageSetting as setting,originalEncounterFleetDynamic,lootOriginalEncounterWeapons,lootOriginalEncounterWings,lootOriginalEncounterHullmods} from './OriginalEncounterEquipment.mjs';
import {encounterCheck as check,encounterCall as call,encounterFloat as num,encounterBool as bool} from './OriginalEncounterState.mjs';
const f=Math.fround,round=n=>Math.max(-2147483648,Math.min(2147483647,Math.floor(n+.5)));
export function originalEncounterSalvageMultiplier(status){return status==='CAPTURED'?f(.1):1;}
export function originalEncounterDerivedRandom(seed,level,services={}){
 if(BigInt(seed)===0n)return originalEncounterSalvageRandom({salvageRandom:null},services);
 const source=createOriginalJavaRandom(seed);for(let i=0;i<level;i++)originalJavaNextLong(source);return createOriginalJavaRandom(originalJavaNextLong(source));
}
export function originalEncounterShipSalvageSeed(member,loserFleet,extraSeed,services={}){
 let signature=member.variant.hullId;const variant=member.variant;
 if(variant!==null){check(Array.isArray(variant.groupSpecs),'Actual ordered weapon groups required for salvage signature');for(const group of variant.groupSpecs)for(const slot of group.slots){const id=variant.weapons.find(row=>row[0]===slot)?.[1]??null;if(id!==null)signature+=id;}}
 if(loserFleet!==null){const members=originalBattleFleetMembers(loserFleet,services),index=members.indexOf(member);if(index>=0)signature+=index;}
 let hash=0;for(let i=0;i<signature.length;i++)hash=(Math.imul(hash,31)+signature.charCodeAt(i))|0;
 return BigInt.asIntN(64,BigInt(hash)*143234234234n*BigInt(extraSeed)).toString();
}
export function originalEncounterGantryValue(fleet,services={}){
 let max=0,total=0;
 for(const member of originalBattleFleetMembers(fleet,services)){
  if(bool(member.repairTracker.mothballed)||originalMemberCurrentCR(member,fleet,{playerCommander:originalMemberPlayerCommander(member,fleet)})<R.gantry.MIN_CR)continue;
  const s=getOriginalMemberStats(member,fleet);check(s.dynamic,'Actual member dynamic modifiers required');s.dynamic.salvage_value_bonus_ship??={flat:[],percent:[],mult:[]};const value=effective({base:0,modifiers:s.dynamic.salvage_value_bonus_ship});if(value<=0)continue;max=Math.max(max,value);total=f(total+value);
 }
 if(max<=0)return 0;const units=f(total/max);if(units<=1)return f(max*R.gantry.BATTLE_SALVAGE_MULT);
 const mult=f(f(Math.log(units)/Math.log(f(2.5)))+1);let result=f(f(total*mult)/units);if(result<=0)result=0;else result=Math.max(f(round(f(result*100))/100),f(.01));return f(result*R.gantry.BATTLE_SALVAGE_MULT);
}
function hullTags(member,services){const tags=services.readEncounterHullTags?call(services,'readEncounterHullTags',member):R.hulls[member.variant.hullId]?.tags;check(Array.isArray(tags),'Actual salvage hull tags required');return tags;}
const addAll=(target,source,services)=>{check(Array.isArray(source?.slots),'Actual extra salvage Cargo required');for(const stack of [...source.slots])if(stack!==null)addOriginalNativeCargoItems(target,stack,stack.size,services);};
function combinedExtra(fleet,services){
 const m=originalEntityMemoryWithoutUpdate(fleet.campaign.entity),extra=call(services,'createEncounterLootCargo');
 for(const key of ['$extraSpecialSalvage','$tempExtraSpecialSalvage'])if(originalCampaignMemoryContains(m,key,services.memoryServices)){
  const value=originalCampaignMemoryGet(m,key,services.memoryServices);if(value===null)continue;check(Object.hasOwn(value,'cargo'),'Actual ExtraSalvage object required');if(value.cargo!==null)addAll(extra,value.cargo,services);
 }
 return extra;
}
function extraDrops(random,valueMult,fuelMult,dropValue,dropRandom,services){
 if(services.generateEncounterExtraDrops)return call(services,'generateEncounterExtraDrops',random,valueMult,1,fuelMult,dropValue,dropRandom);
 check(dropValue.length===0&&dropRandom.length===0,'Actual nonempty SalvageEntity drop generator required');
 const result=call(services,'createEncounterLootCargo');call(services,'readEncounterCampaignDifficulty'); // Native performs this lookup even for empty lists.
 sortOriginalNativeCargo(result,services);return result;
}
export function generateOriginalEncounterPlayerLoot(state,recoveredShips,withCredits,services={}){
 const winner=state.sideData.find(side=>!side.disengaged),loser=state.sideData.find(side=>side.disengaged);if(!winner||!loser)return;bool(withCredits);
 let adjustedFP=0;const contribution=originalEncounterPlayerContribution(state,services),original=state.salvageRandom;let extraSeed='1340234324325';if(original!==null)extraSeed=originalJavaNextLong(original);
 for(const data of winner.enemyCasualties){
  if(data.status==='REPAIRED'||data.member!==null&&hullTags(data.member,services).includes('no_battle_salvage'))continue;const member=data.member;
  if(original!==null)state.salvageRandom=createOriginalJavaRandom(originalEncounterShipSalvageSeed(member,loser.fleet,extraSeed,services));
  const mult=f(originalEncounterSalvageMultiplier(data.status)*contribution);lootOriginalEncounterWeapons(state,member,member.variant,false,mult,false,services);lootOriginalEncounterHullmods(state,member,member.variant,mult,services);lootOriginalEncounterWings(state,member,member.variant,false,mult,services);adjustedFP=f(adjustedFP+f(f(originalFleetPointCost(member))*mult));
 }
 for(const data of winner.ownCasualties){
  if(bool(data.member.isAlly)||data.status==='CAPTURED'||data.status==='REPAIRED'||hullTags(data.member,services).includes('no_battle_salvage'))continue;const member=data.member,mult=originalEncounterSalvageMultiplier(data.status);
  lootOriginalEncounterWeapons(state,member,member.variant,true,mult,false,services);lootOriginalEncounterWings(state,member,member.variant,true,mult,services);adjustedFP=f(adjustedFP+f(f(originalFleetPointCost(member))*mult));
 }
 if(recoveredShips!==null)for(const member of recoveredShips)adjustedFP=f(adjustedFP+f(f(originalFleetPointCost(member))*originalEncounterSalvageMultiplier('CAPTURED')));
 state.salvageRandom=original;let reset=null,forDrops=null,forCargo=null,random;
 if(original!==null){random=original;reset=originalEncounterDerivedRandom(originalJavaNextLong(random),11,services);forDrops=originalEncounterDerivedRandom(originalJavaNextLong(random),17,services);forCargo=originalEncounterDerivedRandom(originalJavaNextLong(random),31,services);}
 else{
  random=originalEncounterSalvageRandom(state,services);const b=state.battle;if(b!==null){const playerSide=originalBattlePlayerSide(b,services),other=playerSide===b.sideOne?b.combinedTwo:playerSide===b.sideTwo?b.combinedOne:null;check(other,'Actual non-player combined fleet required');const memory=originalEntityMemoryWithoutUpdate(other.campaign.entity);if(originalCampaignMemoryContains(memory,'$salvageSeed',services.memoryServices))random=createOriginalJavaRandom(call(services,'readEncounterMemoryLong',memory,'$salvageSeed'));}
 }
 const min=setting('salvageFractionCreditsMin',services),max=setting('salvageFractionCreditsMax',services),creditFraction=f(f(min+f(f(max-min)*originalJavaNextFloat(random)))*contribution);
 let maxValue=f(adjustedFP*setting('salvageValuePerFP',services));if(call(services,'readEncounterCampaignDifficulty')==='easy')maxValue=f(maxValue*setting('easySalvageMult',services));
 const player=call(services,'readBattlePlayerFleet'),fleetValue=originalEncounterFleetDynamic(player,'battle_salvage_value_bonus_fleet'),shipValue=services.readEncounterGantryValue?num(call(services,'readEncounterGantryValue',player)):originalEncounterGantryValue(player,services),valueMult=f(fleetValue+shipValue);
 maxValue=f(maxValue*valueMult);state.creditsLooted=round(f(maxValue*creditFraction));if(!withCredits)state.creditsLooted=0;maxValue=f(maxValue-f(state.creditsLooted));
 let value=0,iterations=0;const weights=[['metals',20],['supplies',10],['fuel',10],['heavy_machinery',1]];
 while(value<maxValue){
  check(++iterations<=1000000,'Actual salvage value exceeds bounded per-operation work');const roll=f(originalJavaNextFloat(random)*41);let sum=0,id=weights.at(-1)[0];for(const row of weights){sum=f(sum+row[1]);if(roll<=sum){id=row[0];break;}}
  const item={type:'RESOURCES',commodityId:id},next=f(value+originalNativeCargoItemSpec(item).basePrice);check(next>value,'Salvage value made no float progress');value=next;addOriginalNativeCargoItems(state.loot,item,1,services);
 }
 const fuelMult=originalEncounterFleetDynamic(player,'fuel_salvage_value_mult_fleet'),fuel=f(originalResourceQuantity(state.loot,'fuel')+num(state.loot.extraFuelUsed));if(fuelMult>1)addOriginalNativeCargoItems(state.loot,{type:'RESOURCES',commodityId:'fuel'},f(round(f(fuel*f(fuelMult-1)))),services);
 const fleets=originalEncounterSnapshotFor(state,loser.fleet);if(fleets===null)return;const drops=[],values=[];
 for(const fleet of fleets){
  const entity=fleet.campaign.entity;for(const [key,target]of [['dropRandom',drops],['dropValue',values]]){check(Object.hasOwn(entity,key)&&(entity[key]===null||Array.isArray(entity[key])),'Actual nullable drop list required');if(entity[key]!==null)target.push(...entity[key]);}
  // Copy both before clearing either: scripts can deliberately share the two list identities.
  if(entity.dropRandom!==null)entity.dropRandom.length=0;if(entity.dropValue!==null)entity.dropValue.length=0;
  const extra=combinedExtra(fleet,services);addAll(state.loot,extra,services);const memory=originalEntityMemoryWithoutUpdate(entity);unsetOriginalCampaignMemory(memory,'$extraSpecialSalvage',services.memoryServices);unsetOriginalCampaignMemory(memory,'$tempExtraSpecialSalvage',services.memoryServices);
  if(extra.slots.some(stack=>stack!==null&&stack.type!=='NULL'))call(services,'reportEncounterExtraSalvageShown',fleet);
 }
 if(forDrops!==null)random=forDrops;const extra=extraDrops(random,valueMult,fuelMult,values,drops,services);addAll(state.loot,extra,services);
 if(forCargo!==null)state.salvageRandom=forCargo;lootOriginalEncounterCargo(state,recoveredShips,false,services);if(reset!==null)state.salvageRandom=reset;
}
