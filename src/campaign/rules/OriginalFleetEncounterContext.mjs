import {adjustOriginalEncounterPlayerReputation,originalEncounterLowRepImpact,originalEncounterNoRepImpact,didOriginalPlayerWinEncounterOutright,didOriginalPlayerWinLatestEncounterBattle} from './OriginalEncounterReputation.mjs';
import {gainOriginalEncounterXP,gainOriginalEncounterOfficerXP,addOriginalEncounterPotentialOfficer,applyOriginalEncounterAfterBattleEffects} from './OriginalEncounterAftermath.mjs';
import {lootOriginalEncounterWeapons,lootOriginalEncounterWings,lootOriginalEncounterHullmods} from './OriginalEncounterEquipment.mjs';
import {originalEncounterSalvageMultiplier,originalEncounterGantryValue} from './OriginalEncounterPlayerLoot.mjs';
import {generateOriginalEncounterLoot,autoLootOriginalEncounter,lootOriginalEncounterCargo,originalEncounterPlayerContribution} from './OriginalEncounterLoot.mjs';
/** FleetEncounterContext processing backed by actual state, not recording callbacks. */
import {originalBattleFleetMembers,originalBattleIsInvolved,originalBattleIsPlayerSide,originalBattleSideFor} from './OriginalCampaignBattle.mjs';
import {uncombineOriginalBattle,generateOriginalBattleCombined} from './OriginalCampaignBattleLifecycle.mjs';
import {originalFleetPointCost} from './OriginalFleetData.mjs';
import {applyOriginalEncounterResultsToFleets,recoverOriginalEncounterVictoryCR,recoverOriginalEncounterCrew,fixOriginalEncounterFighters} from './OriginalEncounterLosses.mjs';
import {encounterCheck as check,encounterCall as call,encounterBool as bool,encounterFloat as num,createOriginalEncounterState,originalEncounterSide,originalEncounterSource as source} from './OriginalEncounterState.mjs';
const f=Math.fround;
function validateResult(result){
 check(result&&Object.hasOwn(result,'lastCombatDamageData')&&typeof result.playerOutBeforeEnd==='boolean','Actual engagement result fields required');
 for(const side of [result.winnerResult,result.loserResult]){check(side&&side.fleet,'Actual engagement fleet required');for(const key of ['deployed','reserves','destroyed','disabled','retreated'])check(Array.isArray(side[key]),'Actual result list required: '+key);check(side.allEverDeployed===null||Array.isArray(side.allEverDeployed),'Actual nullable tactical deployment records required');}
}
function cleanSources(state,result){for(const key of ['deployed','reserves','destroyed','disabled','retreated'])for(let i=0;i<result[key].length;)if(source(state,result[key][i])===null)result[key].splice(i,1);else i++;}
function updateDeployed(state,result,services){const side=originalEncounterSide(state,result.fleet);side.memberToDeployedMap.length=0;if(result.allEverDeployed!==null&&result.allEverDeployed.length>0)call(services,'updateEncounterDeployedMap',state,side,result);}
function playerResult(state,result,services){const b=state.battle,side=result.fleet===b.combinedOne?b.sideOne:result.fleet===b.combinedTwo?b.sideTwo:null;return originalBattleIsPlayerSide(b,side,services);}
function saveLastLists(data,result){for(const [field,key]of [['deployedInLastEngagement','deployed'],['retreatedFromLastEngagement','retreated'],['inReserveDuringLastEngagement','reserves'],['disabledInLastEngagement','disabled'],['destroyedInLastEngagement','destroyed']]){data[field].length=0;data[field].push(...result[key]);}}
function addCasualties(list,result){for(const member of result.destroyed)list.push({member,status:'DESTROYED'});for(const member of result.disabled)list.push({member,status:'DISABLED'});}
function resetDeployments(state,result,services){
 if(result.allEverDeployed!==null)call(services,'resetEncounterDeploymentResult',result);
 originalEncounterSide(state,result.fleet).memberToDeployedMap.length=0;
}
export function processOriginalEncounterResults(state,result,services={}){
 validateResult(result);check(state.battle,'Actual encounter Battle required');state.engagedInHostilities=true;state.engagedInActualBattle=true;
 const winner=result.winnerResult,loser=result.loserResult;cleanSources(state,winner);cleanSources(state,loser);
 if(result.lastCombatDamageData!==null){if(state.runningDamageTotal===null)state.runningDamageTotal=result.lastCombatDamageData;else call(services,'addEncounterCombatDamage',state.runningDamageTotal,result.lastCombatDamageData);call(services,'computeEncounterFPHullDamage',state);}
 if(originalBattleIsInvolved(state.battle,call(services,'readBattlePlayerFleet')))call(services,'reportPlayerEncounterEngagement',result);
 updateDeployed(state,winner,services);updateDeployed(state,loser,services);applyOriginalEncounterResultsToFleets(state,result,services);
 if(playerResult(state,winner,services)&&winner.goal!=='ESCAPE'){state.playerOnlyRetreated=false;if(loser.goal==='ESCAPE')state.playerPursued=true;}
 else if(playerResult(state,loser,services)&&loser.goal!=='ESCAPE'){state.playerOnlyRetreated=false;if(winner.goal==='ESCAPE')state.playerPursued=true;}
 const win=originalEncounterSide(state,winner.fleet),lose=originalEncounterSide(state,loser.fleet);
 win.wonLastEngagement=true;win.enemyCanCleanDisengage=bool(winner.enemyCanCleanDisengage);lose.wonLastEngagement=false;lose.enemyCanCleanDisengage=bool(loser.enemyCanCleanDisengage);win.didEnoughToDisengage=true;
 // The original computes but does not use damageInFP; preserve the actual member getter visits.
 for(const member of [...winner.disabled,...winner.destroyed,...winner.retreated])originalFleetPointCost(member);
 lose.didEnoughToDisengage=bool(winner.enemyCanCleanDisengage);win.lastGoal=winner.goal;lose.lastGoal=loser.goal;
 saveLastLists(win,winner);saveLastLists(lose,loser);addCasualties(lose.ownCasualties,loser);addCasualties(win.ownCasualties,winner);
 for(const [data,side]of [[win,winner],[lose,loser]])if(side.allEverDeployed!==null&&side.allEverDeployed.length>0)call(services,'tallyEncounterOfficerTime',state,data,side);
 resetDeployments(state,winner,services);resetDeployments(state,loser,services);
 addCasualties(lose.enemyCasualties,winner);addCasualties(win.enemyCasualties,loser);
 const total=originalBattleFleetMembers(lose.fleet,services).length===0,winnerPlayer=originalBattleIsPlayerSide(state.battle,originalBattleSideFor(state.battle,winner.fleet),services);
 if(result.playerOutBeforeEnd){
  const playerGoal=winnerPlayer?winner.goal:loser.goal,otherGoal=winnerPlayer?loser.goal:winner.goal;
  const kind=playerGoal==='ATTACK'?(otherGoal==='ATTACK'?'BATTLE':'PURSUIT'):'ESCAPE';state.lastOutcome=kind+'_PLAYER_OUT_FIRST_'+(bool(winner.isPlayer)?'WIN':'LOSS');
 }else if(total&&originalBattleFleetMembers(win.fleet,services).length===0)state.lastOutcome='MUTUAL_DESTRUCTION';
 else if(winnerPlayer){
  if(winner.goal==='ATTACK'&&loser.goal==='ATTACK')state.lastOutcome=total?'BATTLE_PLAYER_WIN_TOTAL':'BATTLE_PLAYER_WIN';
  else if(winner.goal==='ESCAPE')state.lastOutcome=total?'ESCAPE_PLAYER_WIN_TOTAL':'ESCAPE_PLAYER_WIN';
  else if(loser.goal==='ESCAPE')state.lastOutcome=total?'ESCAPE_ENEMY_LOSS_TOTAL':'ESCAPE_ENEMY_SUCCESS';
 }else if(winner.goal==='ATTACK'&&loser.goal==='ATTACK')state.lastOutcome=total?'BATTLE_ENEMY_WIN_TOTAL':'BATTLE_ENEMY_WIN';
 else if(winner.goal==='ESCAPE')state.lastOutcome=total?'ESCAPE_ENEMY_WIN_TOTAL':'ESCAPE_ENEMY_WIN';
 else if(loser.goal==='ESCAPE')state.lastOutcome=total?'ESCAPE_PLAYER_LOSS_TOTAL':'ESCAPE_PLAYER_SUCCESS';
 uncombineOriginalBattle(state.battle,services);generateOriginalBattleCombined(state.battle,services);
}
function sideAdapter(state){
 const api={state,disengaged:()=>state.disengaged};
 const getters={getFleet:'fleet',getMaxTimeDeployed:'maxTimeDeployed',getOfficerData:'officerData',getFleetMemberDeploymentData:'fleetMemberDeploymentData',getMembersWithOfficerOrPlayerAsOrigCaptain:'membersWithOfficerOrPlayerAsOrigCaptain',getCrewLossesDuringLastEngagement:'crewLossesDuringLastEngagement',getRecoverableCrewLosses:'recoverableCrewLosses',getOwnCasualties:'ownCasualties',getEnemyCasualties:'enemyCasualties',getDeployedInLastEngagement:'deployedInLastEngagement',getRetreatedFromLastEngagement:'retreatedFromLastEngagement',getInReserveDuringLastEngagement:'inReserveDuringLastEngagement',getDisabledInLastEngagement:'disabledInLastEngagement',getDestroyedInLastEngagement:'destroyedInLastEngagement',getMemberToDeployedMap:'memberToDeployedMap',isWonLastEngagement:'wonLastEngagement',getLastGoal:'lastGoal',isDidEnoughToDisengage:'didEnoughToDisengage',isEnemyCanCleanDisengage:'enemyCanCleanDisengage'};
 for(const [method,field]of Object.entries(getters))api[method]=()=>state[field];
 for(const field of ['disengaged','wonLastEngagement','didEnoughToDisengage','enemyCanCleanDisengage'])api['set'+field[0].toUpperCase()+field.slice(1)]=value=>{state[field]=bool(value);};
 api.setMaxTimeDeployed=value=>{state.maxTimeDeployed=num(value);};api.setLastGoal=value=>{check(value===null||value==='ATTACK'||value==='ESCAPE','Actual fleet goal required');state.lastGoal=value;};
 for(const [label,field]of [['Own','ownCasualties'],['Enemy','enemyCasualties']]){
  api['add'+label]=(member,status)=>state[field].push({member,status});
  api['remove'+label+'Casualty']=member=>{const index=state[field].findIndex(row=>row.member===member);if(index>=0)state[field].splice(index,1);};
  api['change'+label]=(member,status)=>{const row=state[field].find(row=>row.member===member);if(row)row.status=status;};
 }
 return api;
}
/** The returned facade has methods; ONLY its state is eligible for graph serialization. */
export function bindOriginalFleetEncounterContext(state,services={}){
 check(state?.scope==='native-fleet-encounter-context','Actual encounter context state required');const sides=new WeakMap();
 const side=value=>{if(value===null)return null;if(!sides.has(value))sides.set(value,sideAdapter(value));return sides.get(value);};
 const winner=()=>state.sideData.find(data=>!data.disengaged)??null,loser=()=>state.sideData.find(data=>data.disengaged)??null;
 return {state,getBattle:()=>state.battle,setBattle:battle=>{state.battle=battle;},isAutoresolve:()=>state.isAutoresolve,setAutoresolve:value=>{state.isAutoresolve=bool(value);},
  getDataFor:fleet=>side(originalEncounterSide(state,fleet)),getWinnerData:()=>side(winner()),getLoserData:()=>side(loser()),getWinner:()=>winner()?.fleet??null,getLoser:()=>loser()?.fleet??null,
  getLastEngagementOutcome:()=>state.lastOutcome,isEngagedInHostilities:()=>state.engagedInHostilities,isEngagedInActualBattle:()=>state.engagedInActualBattle,
  setEngagedInHostilities:value=>{state.engagedInHostilities=bool(value);},setEngagedInActualBattle:value=>{state.engagedInActualBattle=bool(value);},setOtherFleetHarriedPlayer:value=>{state.otherFleetHarriedPlayer=bool(value);},isOtherFleetHarriedPlayer:()=>state.otherFleetHarriedPlayer,
  processEngagementResults:result=>processOriginalEncounterResults(state,result,services),performPostVictoryRecovery:result=>recoverOriginalEncounterVictoryCR(state,result.winnerResult,result.loserResult,services),
  performPostEngagementRecoveryBoth:result=>f(f(recoverOriginalEncounterVictoryCR(state,result.winnerResult,result.loserResult,services)+recoverOriginalEncounterVictoryCR(state,result.loserResult,result.winnerResult,services))/2),
  fixFighters:result=>fixOriginalEncounterFighters(state,result,services),recoverCrew:fleet=>recoverOriginalEncounterCrew(state,fleet,services),
  generateLoot:(recovered,withCredits)=>services.generateEncounterLoot?call(services,'generateEncounterLoot',state,recovered,withCredits):generateOriginalEncounterLoot(state,recovered,withCredits,services),autoLoot:()=>services.autoLootEncounter?call(services,'autoLootEncounter',state):autoLootOriginalEncounter(state,services),
  getCreditsLooted:()=>state.creditsLooted,getSalvageMult:originalEncounterSalvageMultiplier,getSalvageValueModPlayerShips:()=>originalEncounterGantryValue(call(services,'readBattlePlayerFleet'),services),
  lootWeapons:(member,variant,own,mult,module=false)=>lootOriginalEncounterWeapons(state,member,variant,own,mult,module,services),lootWings:(member,variant,own,mult)=>lootOriginalEncounterWings(state,member,variant,own,mult,services),lootHullMods:(member,variant,mult)=>lootOriginalEncounterHullmods(state,member,variant,mult,services),
  handleCargoLooting:(recovered,takingFromPlayer)=>lootOriginalEncounterCargo(state,recovered,takingFromPlayer,services),getLoot:()=>state.loot,computePlayerContribFraction:()=>originalEncounterPlayerContribution(state,services),getSalvageRandom:()=>state.salvageRandom,setSalvageRandom:random=>{state.salvageRandom=random;},
  adjustPlayerReputation:(dialog,ffText=null,ally=true,enemy=true)=>adjustOriginalEncounterPlayerReputation(state,dialog,ffText,ally,enemy,services),
  isLowRepImpact:()=>originalEncounterLowRepImpact(state,services),isNoRepImpact:()=>originalEncounterNoRepImpact(state,services),didPlayerWinEncounterOutright:()=>didOriginalPlayerWinEncounterOutright(state,services),didPlayerWinMostRecentBattleOfEncounter:()=>didOriginalPlayerWinLatestEncounterBattle(state,services),
  gainXP:()=>gainOriginalEncounterXP(state,services),gainOfficerXP:(side,xp)=>gainOriginalEncounterOfficerXP(state,side.state,xp,services),addPotentialOfficer:()=>addOriginalEncounterPotentialOfficer(state,services),
  applyAfterBattleEffectsIfThereWasABattle:()=>services.applyEncounterAfterBattleEffects?call(services,'applyEncounterAfterBattleEffects',state):applyOriginalEncounterAfterBattleEffects(state,services),
 };
}
export function createOriginalFleetEncounterContext(services={}){return bindOriginalFleetEncounterContext(createOriginalEncounterState(call(services,'createEncounterLootCargo')),services);}
