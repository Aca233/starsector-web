/** Native combined fleet/member operations and Battle completion. Real AI and damage plugins are mandatory at their call sites. */
import {requireThat} from '../core/Values.mjs';
import {ORIGINAL_CAMPAIGN_BATTLE,validateOriginalCampaignBattle,originalBattlePrimary,originalBattleIsPlayerSide,originalBattleSide,originalBattleSideFor,originalBattleFleetMembers,takeOriginalBattleSnapshots,notifyOriginalBattleAbilitiesLeft} from './OriginalCampaignBattle.mjs';
import {removeOriginalBattleEmptyFleets,applyOriginalBattleVisibility} from './OriginalCampaignBattleFrame.mjs';
import {setOriginalConstructedFleetLocation,setOriginalConstructedFleetVelocity} from './OriginalCampaignFleet.mjs';
import {setOriginalFleetNoEngaging} from './OriginalCampaignFleetAdvance.mjs';
import {originalConstructedMemberHints} from './OriginalFleetMembers.mjs';
import {originalEntityMemoryWithoutUpdate,setOriginalCampaignMemory} from './OriginalCampaignMemory.mjs';
import {originalJavaNextDouble} from './OriginalJavaRandom.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_BATTLE_LIFECYCLE',m);
const call=(s,k,...args)=>{check(typeof s[k]==='function','Actual Battle lifecycle service required: '+k);const v=s[k](...args);check(!v||typeof v.then!=='function','Synchronous Battle lifecycle service required: '+k);return v;};
const bool=v=>{check(typeof v==='boolean','Actual native Battle Boolean required');return v;};
const campaign=fleet=>{check(fleet?.campaign?.scope==='native-constructed-campaign-fleet','Actual constructed Battle fleet required');return fleet.campaign;};
const player=fleet=>{campaign(fleet);return bool(fleet.isPlayerFleet);};
const station=fleet=>{const c=campaign(fleet);check(Object.hasOwn(c.flags,'stationMode'),'Actual nullable station flag required');return c.flags.stationMode!==null;};
const roster=(fleet,s)=>{campaign(fleet);const value=call(s,'readBattleFleetRoster',fleet);check(value&&typeof value==='object','Actual FleetData operations required');return value;};
const commander=(fleet,s)=>{campaign(fleet);const person=call(s,'readBattleFleetCommander',fleet);check(person&&typeof person.objectRef==='string','Actual commander Person required');return person;};
/** FleetMember setter deliberately ignores its FleetData argument (verified javap). */
export function setOriginalBattleMemberCommander(member,person){
 check(member&&Object.hasOwn(member,'fleetCommanderForStatsRef')&&typeof member.statUpdateNeeded==='boolean','Actual member commander/dirty state required');check(person===null||person&&typeof person.objectRef==='string','Actual nullable Person required');
 const changed=member.fleetCommanderForStatsRef!==(person?.objectRef??null);member.statUpdateNeeded=changed;if(changed)member.cachedStrength=-1;member.fleetCommanderForStatsRef=person?.objectRef??null;
}
function tags(entity){check(Object.hasOwn(entity,'tags')&&(entity.tags===null||Array.isArray(entity.tags)),'Actual nullable tags required');return entity.tags??[];}
function sourceMap(battle){if(battle.memberSource===null)battle.memberSource=[];check(Array.isArray(battle.memberSource),'Actual member-source map required');return battle.memberSource;}
function putSource(battle,member,fleet){const map=sourceMap(battle),entry=map.find(row=>row.member===member);if(entry){entry.memberRef=member.objectRef;entry.fleet=fleet;}else map.push({member,memberRef:member.objectRef,fleet});}
function generateSide(battle,list,combined,withStations,side,services){
 const isPlayerSide=originalBattleIsPlayerSide(battle,list,services);
 if(isPlayerSide){const current=call(services,'readBattlePlayerFleet');const at=list.indexOf(current);if(at>=0){list.splice(at,1);list.unshift(current);}}
 const primary=originalBattlePrimary(battle,list,services,!battle.playerInvolvedAtStart);
 if(primary===null){if(combined!==null)call(roster(combined,services),'clear',false);return combined;}
 if(combined===null){
  combined=call(services,'createBattleCombinedFleet',campaign(primary).faction);const c=campaign(combined);check(combined.members.length===0&&combined.battle===null&&!c.worldRegistered,'Fresh unregistered combined CampaignFleet required');
  // Web identity bookkeeping only. Native advance can clear its combined slots while these actual objects still exist.
  c.battleCombination={scope:'native-battle-combined-identity',battle,side};combined.synchronization.onlySyncMemberLists=true;
  const ai=call(services,'createBattleCombinedAI',combined);check(ai&&typeof ai==='object'&&typeof ai.objectRef==='string','Actual ModularFleetAI required, not null');c.ai=ai;
  c.entity.memory=originalEntityMemoryWithoutUpdate(campaign(primary).entity);
  const target=tags(c.entity);for(const tag of tags(campaign(primary).entity))if(!target.includes(tag))target.push(tag); // null getTags returns a disposable list.
  combined.battle=battle;
 }else call(roster(combined,services),'clear',false);
 combined.name=primary.name;call(services,'setBattleFleetCommander',combined,commander(primary,services));combined.aiMode=true;combined.battle=battle;
 const c=campaign(combined),location=campaign(primary).entity.containingLocation;c.entity.containingLocation=location;combined.logisticsEnvironment.inHyperspace=location?.hyperspaceMode??false; // Existing getter projection, not world registration.
 setOriginalConstructedFleetLocation(combined,...campaign(primary).entity.position);
 let firstFlagship=true;const ops=roster(combined,services);
 for(const fleet of list){if(!withStations&&station(fleet))continue;
  for(const member of [...originalBattleFleetMembers(fleet,services)]){
   const wasFlagship=bool(call(services,'readBattleMemberFlagship',member)),inherited=commander(fleet,services);setOriginalBattleMemberCommander(member,inherited);
   // statPeople is the Web getter lookup, not a native roster. Keep the actual inherited Person available for later member-stat reads.
   const known=combined.statPeople.find(person=>person.objectRef===inherited.objectRef);check(!known||known===inherited,'Split combined commander lookup identity');if(!known)combined.statPeople.push(inherited);
   call(ops,'addMember',member);
   if(wasFlagship&&firstFlagship){member.isFlagship=true;firstFlagship=false;}
   member.isAlly=isPlayerSide&&!player(fleet);putSource(battle,member,fleet);
  }
 }
 for(const member of call(ops,'membersCopy')){const isStation=services.isBattleMemberStation?bool(call(services,'isBattleMemberStation',member)):originalConstructedMemberHints(member).includes('STATION');if(!isStation)continue;call(ops,'removeMember',member);call(ops,'insertMember',0,member);}
 call(services,'refreshBattleCommander',commander(combined,services),false);return combined;
}
export function generateOriginalBattleCombined(battle,services={},withStations=true,removeEmpty=true){
 validateOriginalCampaignBattle(battle);bool(withStations);bool(removeEmpty);if(removeEmpty)removeOriginalBattleEmptyFleets(battle,services);
 battle.combinedOne=generateSide(battle,battle.sideOne,battle.combinedOne,withStations,'ONE',services);
 battle.combinedTwo=generateSide(battle,battle.sideTwo,battle.combinedTwo,withStations,'TWO',services);return battle;
}
export function uncombineOriginalBattle(battle,services={}){
 for(const combined of [battle.combinedOne,battle.combinedTwo]){if(combined===null)continue;const dirtied=new Set();
  for(const member of [...originalBattleFleetMembers(combined,services)]){
   const source=sourceMap(battle).find(row=>row.member===member)?.fleet??null;
   // Native dereferences source before its later null guard: a missing map is an error, not an orphan to silently skip.
   if(!dirtied.has(source)){dirtied.add(source);check(source!==null,'Native uncombine has no source fleet for member');source.synchronization.needsSync=true;}
   setOriginalBattleMemberCommander(member,null);if(source!==null)member.fleetDataRef=source.dataRef;
  }
 }
}
export function leaveOriginalBattle(battle,fleet,engaged,services={}){
 campaign(fleet);bool(engaged);for(const side of [battle.sideOne,battle.sideTwo]){const at=side.indexOf(fleet);if(at>=0)side.splice(at,1);}
 for(const member of [...originalBattleFleetMembers(fleet,services)]){setOriginalBattleMemberCommander(member,null);member.fleetDataRef=fleet.dataRef;}
 fleet.synchronization.needsSync=true;
 const dev=services.readBattleDevMode?bool(call(services,'readBattleDevMode')):ORIGINAL_CAMPAIGN_BATTLE.settings.devMode;
 if(dev&&fleet.battle!==null&&fleet.battle!==battle)check(false,'Fleet trying to leave a different Battle');
 notifyOriginalBattleAbilitiesLeft(fleet,battle,engaged,services);fleet.battle=null;generateOriginalBattleCombined(battle,services);
}
export function finishOriginalBattle(battle,winner,engaged=true,services={}){
 bool(engaged);uncombineOriginalBattle(battle,services);let decisive=true;if(winner===null||winner==='NO_JOIN'){winner='ONE';decisive=false;}
 const win=originalBattleSide(battle,winner);check(win!==null,'Actual winning Battle side required');
 for(const fleet of [...win]){
  leaveOriginalBattle(battle,fleet,engaged,services);setOriginalConstructedFleetVelocity(fleet,0,0);if(!engaged)continue;
  setOriginalFleetNoEngaging(fleet,3);applyOriginalBattleVisibility(fleet,services);const ai=campaign(fleet).ai;
  if(ai===null||!decisive||bool(call(services,'isBattleAICurrentAssignment',ai,'STANDING_DOWN',fleet)))continue;
  const days=f(f(.5)+f(f(.5)*f(originalJavaNextDouble(services.globalRandom))));call(services,'addBattleAIAssignmentAtStart',ai,'STANDING_DOWN',fleet,days,null,fleet);
 }
 const defeatedByPlayer=decisive&&originalBattleIsPlayerSide(battle,win,services)&&win.length<=1;
 const lose=winner==='ONE'?battle.sideTwo:battle.sideOne;
 for(const fleet of [...lose]){leaveOriginalBattle(battle,fleet,engaged,services);setOriginalConstructedFleetVelocity(fleet,0,0);if(!engaged)continue;setOriginalFleetNoEngaging(fleet,3);applyOriginalBattleVisibility(fleet,services);if(defeatedByPlayer)setOriginalCampaignMemory(originalEntityMemoryWithoutUpdate(campaign(fleet).entity),'$cfai_recentlyDefeatedByPlayer',true,7);}
 battle.sideOne.length=0;battle.sideTwo.length=0;battle.done=true;
}
const empty=(side,s)=>side.length===0||side.length===1&&originalBattleFleetMembers(side[0],s).length<=0;
/** Actual native orchestration around the still-external damage resolver and encounter-option AI. */
export function resolveOriginalBattleRound(battle,services={}){
 sourceMap(battle).length=0;takeOriginalBattleSnapshots(battle);generateOriginalBattleCombined(battle,services);
 const resolver=call(services,'pickBattleAutoresolver',battle);check(resolver===null||resolver&&typeof resolver==='object','Actual autoresolver plugin or known null required');if(resolver===null)return;
 call(services,'resolveBattleAutoresolver',resolver);
 const optionOne=call(services,'pickBattleAIEncounterOption',campaign(battle.combinedOne).ai,call(services,'readBattleResolverContext',resolver),battle.combinedTwo,battle.combinedOne);
 const optionTwo=call(services,'pickBattleAIEncounterOption',campaign(battle.combinedTwo).ai,call(services,'readBattleResolverContext',resolver),battle.combinedOne,battle.combinedTwo);
 let winner=null;if(call(services,'readBattleResolverWinner',call(services,'readBattleResolverContext',resolver))!==null)winner=originalBattlePrimary(battle,originalBattleSideFor(battle,call(services,'readBattleResolverWinner',call(services,'readBattleResolverContext',resolver))),services);
 if(winner!==null)call(services,'reportBattleOccurred',winner,battle);
 removeOriginalBattleEmptyFleets(battle,services);
 if(empty(battle.sideOne,services)||empty(battle.sideTwo,services)||optionOne==='DISENGAGE'||optionTwo==='DISENGAGE'){
  let side='TWO';if(empty(battle.sideTwo,services)||optionTwo==='DISENGAGE')side='ONE';finishOriginalBattle(battle,side,true,services);if(winner!==null)call(services,'reportBattleFinished',winner,battle);
 }
}
