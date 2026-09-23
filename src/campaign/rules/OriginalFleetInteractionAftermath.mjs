/** FleetInteractionDialogPluginImpl's post-recovery salvage, loot-close and leave paths.
 * This is not the initial encounter/recovery/rule-trigger implementation. UI facades are transient.
 */
import R from '../data/reference-battle-autoresolver.json' with {type:'json'};
import {originalBattleFleetMembers,originalBattlePlayerSide,originalBattleSnapshotFor,originalBattleSide} from './OriginalCampaignBattle.mjs';
import {leaveOriginalBattle,finishOriginalBattle} from './OriginalCampaignBattleLifecycle.mjs';
import {applyOriginalBattleVisibility} from './OriginalCampaignBattleFrame.mjs';
import {originalEncounterSide,encounterCheck as check,encounterCall as call,encounterBool as bool,encounterFloat as num} from './OriginalEncounterState.mjs';
import {originalEncounterDerivedRandom} from './OriginalEncounterPlayerLoot.mjs';
import {originalJavaNextLong,validateOriginalJavaRandom} from './OriginalJavaRandom.mjs';
import {originalEntityMemoryWithoutUpdate,originalCampaignMemoryGet,originalCampaignMemoryBoolean,setOriginalCampaignMemory} from './OriginalCampaignMemory.mjs';
import {originalPersonMemoryWithoutUpdate} from './OriginalPersonAdvance.mjs';
const f=Math.fround,int=n=>Math.max(-2147483648,Math.min(2147483647,Math.trunc(n)));
const boolFields=['dismissOnLeave','withSalvage','lootCredits','impactsEnemyReputation','impactsAllyReputation','printXPToDialog','straightToEngage'];
const phases=['awaiting-end-path','loot-option','loot-open','leave-option','continue-leave','finished'];
export function createOriginalFleetAftermathConfig(overrides={}){
 return {dismissOnLeave:true,withSalvage:true,lootCredits:true,impactsEnemyReputation:true,impactsAllyReputation:true,printXPToDialog:false,straightToEngage:false,noSalvageLeaveOptionText:null,delegate:null,salvageRandom:null,...overrides};
}
export function createOriginalFleetInteractionAftermath(context,playerFleet,otherFleet,progress,config=createOriginalFleetAftermathConfig()){
 check(progress&&['ongoingBattle','harryEndedBattle','allyEngagementChoiceNoBattle','firedVictoryTriggers','recoveredCrew','didRecoveryCheck'].every(k=>typeof progress[k]==='boolean'),'Actual interaction progress required; recovery and victory triggers cannot be assumed complete');
 check(Array.isArray(progress.pulledIn)&&Array.isArray(progress.recoveredShips),'Actual pulled-in/recovered lists required');
 return validateOriginalFleetInteractionAftermath({scope:'native-fleet-interaction-aftermath',context,playerFleet,otherFleet,config,ongoingBattle:progress.ongoingBattle,harryEndedBattle:progress.harryEndedBattle,allyEngagementChoiceNoBattle:progress.allyEngagementChoiceNoBattle,firedVictoryTriggers:progress.firedVictoryTriggers,recoveredCrew:progress.recoveredCrew,didRecoveryCheck:progress.didRecoveryCheck,pulledIn:[...progress.pulledIn],recoveredShips:[...progress.recoveredShips],cleanedUp:false,lootedCredits:false,creditsLooted:null,phase:'awaiting-end-path'});
}
export function validateOriginalFleetInteractionAftermath(state){
 check(state?.scope==='native-fleet-interaction-aftermath'&&state.context?.scope==='native-fleet-encounter-context','Actual interaction aftermath required');check(state.playerFleet?.campaign&&state.otherFleet?.campaign,'Actual interaction fleets required');
 for(const key of ['ongoingBattle','harryEndedBattle','allyEngagementChoiceNoBattle','firedVictoryTriggers','recoveredCrew','didRecoveryCheck','cleanedUp','lootedCredits'])bool(state[key]);
 check(phases.includes(state.phase)&&Array.isArray(state.pulledIn)&&Array.isArray(state.recoveredShips),'Actual interaction phase/lists required');check(state.creditsLooted===null||typeof state.creditsLooted==='string','Actual nullable credits display required');
 check(state.config&&typeof state.config==='object','Actual FIDConfig required');for(const key of boolFields)bool(state.config[key]);check(state.config.noSalvageLeaveOptionText===null||typeof state.config.noSalvageLeaveOptionText==='string','Actual nullable leave text required');check(state.config.delegate===null||typeof state.config.delegate==='object','Actual nullable FIDDelegate required');if(state.config.salvageRandom!==null)validateOriginalJavaRandom(state.config.salvageRandom);return state;
}
export function originalInteractionValidPlayerFleet(fleet,services={}){
 for(const member of originalBattleFleetMembers(fleet,services)){
  const v=member.variant;if(v!==null){check(v.effects&&Array.isArray(v.effects.hullMods)&&Array.isArray(v.effects.tags),'Actual variant hullmods/tags required');const tags=services.readEncounterHullTags?call(services,'readEncounterHullTags',member):R.hulls[v.hullId]?.tags;check(Array.isArray(tags),'Actual hull tags required');if(v.effects.hullMods.includes('automated')||v.effects.tags.includes('automated')||tags.includes('automated'))continue;}
  if(member.type==='FIGHTER_WING')continue;const captain=call(services,'readEncounterCaptain',member);if(captain!==null&&originalCampaignMemoryGet(originalPersonMemoryWithoutUpdate(captain),'$captain_unremovable',services.memoryServices)===true)continue;return true;
 }return false;
}
// CargoData.isEmpty tests NULL type, NOT size; do not collapse zero-sized real slots here.
const empty=cargo=>{check(Array.isArray(cargo?.slots),'Actual loot cargo required');return cargo.slots.every(s=>s===null||s.type==='NULL');};
const globalPlayer=s=>call(s,'readBattlePlayerFleet');
const ui=(dialog,name)=>call(dialog,name);
const text=(s,state,id)=>call(s,'readInteractionString',state,id);
const addText=(dialog,s,state,id)=>call(ui(dialog,'getTextPanel'),'addParagraph',text(s,state,id));
const highlight=s=>call(s,'readInteractionHighlightColor');
function contextFor(state,context){validateOriginalFleetInteractionAftermath(state);check(context?.state===state.context,'Lost interaction/context identity');check(state.phase!=='finished','Interaction is already finished');return context;}
function markDefeated(state,services){
 const battle=state.context.battle;if(battle===null)return;const side=originalBattlePlayerSide(battle,services),enemies=side===battle.sideOne?battle.sideTwo:battle.sideOne;
 for(const other of enemies){const memory=originalEntityMemoryWithoutUpdate(other.campaign.entity);if(!originalCampaignMemoryBoolean(memory,'$cfai_recentlyDefeatedByPlayer',services.memoryServices))setOriginalCampaignMemory(memory,'$cfai_recentlyDefeatedByPlayer',true,f(.5));}
}
export function cleanUpOriginalFleetInteractionBattle(state,context,services={}){
 if(state.cleanedUp)return false;contextFor(state,context);state.cleanedUp=true;const battle=context.getBattle();check(battle!==null,'Actual interaction Battle required');
 const beforeSide=originalBattlePlayerSide(battle,services),playerCombined=beforeSide===battle.sideOne?battle.combinedOne:battle.combinedTwo,otherCombined=beforeSide===battle.sideOne?battle.combinedTwo:battle.combinedOne;
 const enemyData=context.getDataFor(otherCombined),playerData=context.getDataFor(playerCombined);if(enemyData!==null&&playerData!==null&&enemyData.disengaged()&&!playerData.disengaged())markDefeated(state,services);
 const engaged=bool(context.isEngagedInHostilities())||bool(context.isOtherFleetHarriedPlayer());leaveOriginalBattle(battle,globalPlayer(services),engaged,services);
 const playerSide=originalBattlePlayerSide(battle,services)===battle.sideOne?'ONE':'TWO',otherSide=playerSide==='ONE'?'TWO':'ONE';let winner=context.didPlayerWinMostRecentBattleOfEncounter()?playerSide:otherSide;if(!engaged)winner='NO_JOIN';
 if(!state.ongoingBattle){finishOriginalBattle(battle,winner,engaged,services);const player=globalPlayer(services);player.synchronization.needsSync=true;call(call(services,'readBattleFleetRoster',player),'sync');}
 else{let finished=false;const last=context.getLastEngagementOutcome(),other=originalBattleSide(battle,otherSide);if(last==='BATTLE_PLAYER_WIN_TOTAL'&&other!==null&&other.length===1){const fleet=other[0];check(Object.hasOwn(fleet.campaign.flags,'stationMode'),'Actual station flag required');if(fleet.campaign.flags.stationMode!==null){finishOriginalBattle(battle,winner,true,services);finished=true;}}
  if(!finished){if(['ESCAPE_ENEMY_SUCCESS','ESCAPE_PLAYER_SUCCESS'].includes(last)||state.harryEndedBattle||context.isOtherFleetHarriedPlayer()||state.allyEngagementChoiceNoBattle)finishOriginalBattle(battle,winner,true,services);else for(const fleet of state.pulledIn)leaveOriginalBattle(battle,fleet,engaged,services);}
 }
 if(context.isEngagedInHostilities())applyOriginalBattleVisibility(globalPlayer(services),services);return true;
}
/** Corresponds to winningPath AFTER its rule triggers, crew recovery and ship-recovery choice. */
export function completeOriginalFleetVictorySalvage(state,context,dialog,services={}){
 contextFor(state,context);check(['awaiting-end-path','loot-option','leave-option'].includes(state.phase),'Cannot generate salvage while the core loot window is open');check(state.firedVictoryTriggers&&state.recoveredCrew&&state.didRecoveryCheck,'Native victory triggers and recovery stages must actually finish first');
 const options=ui(dialog,'getOptionPanel');call(options,'clearOptions');context.adjustPlayerReputation(dialog,text(services,state,'friendlyFireRepLoss'),state.config.impactsAllyReputation,state.config.impactsEnemyReputation);
 const valid=originalInteractionValidPlayerFleet(state.playerFleet,services),battle=context.getBattle();let startedWithAllies=false;if(battle!==null){const side=originalBattlePlayerSide(battle,services);check(side!==null,'Actual player Battle side required');startedWithAllies=originalBattleSnapshotFor(battle,side).length>1;}
 if(!state.lootedCredits&&state.config.withSalvage){let reset=null;if(state.config.salvageRandom!==null){context.setSalvageRandom(state.config.salvageRandom);reset=originalEncounterDerivedRandom(originalJavaNextLong(state.config.salvageRandom),11,services);}context.generateLoot(state.recoveredShips,state.config.lootCredits);if(reset!==null)state.config.salvageRandom=reset;
  if(state.config.delegate!==null)call(services,'postInteractionSalvageGeneration',state.config.delegate,dialog,context,context.getLoot());state.lootedCredits=true;const credits=f(context.getCreditsLooted());
  if(context.isEngagedInHostilities()&&context.getLastEngagementOutcome()!==null&&valid){if(credits<=0&&empty(context.getLoot()))addText(dialog,services,state,startedWithAllies?'noSalvageReportPlayerDidNothing':'noSalvageReport');else if(startedWithAllies)addText(dialog,services,state,'salvageReportPlayer');}
  state.creditsLooted=call(services,'formatInteractionCredits',f(int(credits)));check(typeof state.creditsLooted==='string','Actual credits display required');
  if(credits>0&&valid){addText(dialog,services,state,'creditsLootedReport');call(ui(dialog,'getTextPanel'),'highlightLastInLastPara',state.creditsLooted,highlight(services));const cash=globalPlayer(services).cargo.credits;check(cash,'Actual player Cargo credits required');cash.value=f(num(cash.value)+credits);}
 }
 if(!empty(context.getLoot())&&valid){call(options,'addOption','在残骸中挑选战利品','CONTINUE_LOOT',null);state.phase='loot-option';}
 else{if(!valid)addText(dialog,services,state,'finalOutcomeNoShipsLeft');let label='离开',escape=true;if(state.config.noSalvageLeaveOptionText!==null&&valid&&empty(context.getLoot())){label=state.config.noSalvageLeaveOptionText;escape=false;}call(options,'addOption',label,'LEAVE',null);if(escape)call(options,'setShortcut','LEAVE',1,false,false,false,true);state.phase='leave-option';}
}
function afterEffects(state,context,dialog){const panel=ui(dialog,'getTextPanel');if(state.config.printXPToDialog){state.context.textPanelForXPGain=panel;call(panel,'setFontSmallInsignia');}context.applyAfterBattleEffectsIfThereWasABattle();state.context.textPanelForXPGain=null;call(panel,'setFontInsignia');}
function finishDialog(state,dialog,fromLoot,services){
 if(state.config.dismissOnLeave){call(dialog,'dismiss');if(fromLoot){call(dialog,'hideTextPanel');call(dialog,'hideVisualPanel');}}
 else{if(fromLoot){call(dialog,'showTextPanel');call(dialog,'showVisualPanel');}call(dialog,'setOptionOnEscape','',null);call(dialog,'setOptionOnConfirm','',null);}
 if(state.config.delegate!==null)call(services,'notifyInteractionLeave',state.config.delegate,dialog);state.phase='finished';
}
export function dismissOriginalFleetLoot(state,context,dialog,services={}){
 if(state.phase==='finished')return false;contextFor(state,context);check(state.phase==='loot-open','No actual core loot window is open');afterEffects(state,context,dialog);cleanUpOriginalFleetInteractionBattle(state,context,services);finishDialog(state,dialog,true,services);return true;
}
export function openOriginalFleetLoot(state,context,dialog,services={}){
 contextFor(state,context);check(state.phase==='loot-option','CONTINUE_LOOT is not available');const visual=ui(dialog,'getVisualPanel');call(visual,'setVisualFade',0,0);call(dialog,'hideTextPanel');call(dialog,'hideVisualPanel');call(services,'reportInteractionLootGenerated',context,context.getLoot());if(services.prepareInteractionLootCargo)call(services,'prepareInteractionLootCargo',context.getLoot());state.phase='loot-open';
 // The bound listener is transient; after restoring the world the persisted phase drives a fresh dismiss call.
 call(visual,'showLoot','打捞发现',context.getLoot(),true,{coreUIDismissed:()=>services.dismissInteractionLoot?call(services,'dismissInteractionLoot'):dismissOriginalFleetLoot(state,context,dialog,services)});call(ui(dialog,'getOptionPanel'),'clearOptions');call(dialog,'setPromptText','');
}
export function leaveOriginalFleetInteraction(state,context,dialog,continued=false,services={}){
 if(state.phase==='finished')return false;contextFor(state,context);bool(continued);check(continued?state.phase==='continue-leave':['awaiting-end-path','leave-option'].includes(state.phase),'Leave option is not available');
 if(!continued&&context.adjustPlayerReputation(dialog,text(services,state,'friendlyFireRepLoss'),state.config.impactsAllyReputation,state.config.impactsEnemyReputation)){const options=ui(dialog,'getOptionPanel');call(options,'clearOptions');call(options,'addOption','继续','CONTINUE_LEAVE',null);if(!state.config.straightToEngage)call(options,'setShortcut','CONTINUE_LEAVE',1,false,false,false,true);state.phase='continue-leave';return true;}
 const player=originalEncounterSide(state.context,state.playerFleet),other=originalEncounterSide(state.context,state.otherFleet),hasWinner=context.getWinner()!==null&&context.getLoser()!==null,last=context.getLastEngagementOutcome();
 const battleOver=hasWinner||last!==null&&!['BATTLE_PLAYER_OUT_FIRST_WIN','BATTLE_PLAYER_OUT_FIRST_LOSS','BATTLE_ENEMY_WIN','BATTLE_PLAYER_WIN'].includes(last);
 if(battleOver||other.disengaged&&player.disengaged){if(!hasWinner){player.disengaged=!player.wonLastEngagement;other.disengaged=player.wonLastEngagement;}}
 else if(context.isEngagedInHostilities()){player.disengaged=true;other.disengaged=false;}else{player.disengaged=true;other.disengaged=true;}
 afterEffects(state,context,dialog);cleanUpOriginalFleetInteractionBattle(state,context,services);finishDialog(state,dialog,false,services);return true;
}
