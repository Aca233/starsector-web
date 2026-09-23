/** Actual FleetEncounterContext/DataForEncounterSide state, separate from bound methods. */
import {requireThat} from '../core/Values.mjs';
import {originalBattleSideFor} from './OriginalCampaignBattle.mjs';
import {validateOriginalResourceCargo} from './OriginalResourceCargo.mjs';
import {validateOriginalJavaRandom} from './OriginalJavaRandom.mjs';
export const encounterCheck=(ok,message)=>requireThat(ok,'UNSUPPORTED_NATIVE_ENCOUNTER_CONTEXT',message);
export const encounterFloat=value=>{encounterCheck(typeof value==='number'&&Number.isFinite(value)&&value===Math.fround(value),'Actual encounter float required');return value;};
export const encounterBool=value=>{encounterCheck(typeof value==='boolean','Actual encounter Boolean required');return value;};
export const encounterCall=(s,key,...args)=>{encounterCheck(typeof s?.[key]==='function','Actual encounter service required: '+key);const v=s[key](...args);encounterCheck(!v||typeof v.then!=='function','Synchronous encounter service required: '+key);return v;};
export const createOriginalEncounterCrew=()=>({crew:0,marines:0});
export function createOriginalEncounterState(loot){
 validateOriginalResourceCargo(loot);return {scope:'native-fleet-encounter-context',sideData:[],engagedInHostilities:false,engagedInActualBattle:false,playerOnlyRetreated:true,playerPursued:false,playerDidSeriousDamage:false,battle:null,otherFleetHarriedPlayer:false,ongoingBattle:false,isAutoresolve:false,runningDamageTotal:null,origSourceForRecoveredShips:[],alreadyAdjustedRep:false,textPanelForXPGain:null,noHarryBecauseOfStation:false,lastOutcome:null,recoverableShips:[],storyRecoverableShips:[],playerFPHullDamageToEnemies:0,allyFPHullDamageToEnemies:0,playerFPHullDamageToAllies:0,playerFPHullDamageToAlliesByFaction:[],xpGained:0,loot,creditsLooted:0,salvageRandom:null,preEngagementCRForWinner:[],difficulty:1,computedDifficulty:false};
}
export function originalEncounterCombined(battle,fleet){const side=originalBattleSideFor(battle,fleet);return side===battle.sideOne?battle.combinedOne:side===battle.sideTwo?battle.combinedTwo:null;}
export function createOriginalEncounterSide(fleet){return {fleet,maxTimeDeployed:0,officerData:[],fleetMemberDeploymentData:[],ownCasualties:[],enemyCasualties:[],deployedInLastEngagement:[],retreatedFromLastEngagement:[],inReserveDuringLastEngagement:[],disabledInLastEngagement:[],destroyedInLastEngagement:[],memberToDeployedMap:[],membersWithOfficerOrPlayerAsOrigCaptain:[],crewLossesDuringLastEngagement:createOriginalEncounterCrew(),recoverableCrewLosses:createOriginalEncounterCrew(),wonLastEngagement:false,lastGoal:null,disengaged:false,didEnoughToDisengage:false,enemyCanCleanDisengage:false};}
export function originalEncounterSide(state,fleet){
 encounterCheck(state?.scope==='native-fleet-encounter-context'&&state.battle,'Actual bound encounter required');const combined=originalEncounterCombined(state.battle,fleet);
 // Native does NOT register the detached participant's temporary DataForEncounterSide.
 if(combined===null)return createOriginalEncounterSide(fleet);
 let side=state.sideData.find(row=>row.fleet===combined);if(!side){side=createOriginalEncounterSide(combined);state.sideData.push(side);}return side;
}
export function originalEncounterSource(state,member){return state.battle.memberSource.find(row=>row.member===member)?.fleet??null;}
export function originalEncounterMemberFleet(state,member,services={}){
 // A detached member can retain commander-for-stats; its source supplies the Person lookup
 // but member.fleetDataRef remains null, so no fake fleet attachment is created.
 if(member.fleetDataRef===null)return originalEncounterSource(state,member);
 if(services.resolveEncounterFleetData)return encounterCall(services,'resolveEncounterFleetData',member.fleetDataRef);
 const b=state.battle,all=[b.combinedOne,b.combinedTwo,...b.sideOne,...b.sideTwo,...b.snapshotSideOne??[],...b.snapshotSideTwo??[]];
 const fleet=all.find(row=>row?.dataRef===member.fleetDataRef);encounterCheck(fleet,'Actual member FleetData required');return fleet;
}
export function originalEncounterMemberCrew(member){
 encounterCheck(member.crewComposition!==undefined,'Actual member crew capture required');
 if(member.crewComposition===null)member.crewComposition={objectRef:'created-encounter-crew:'+member.objectRef,crew:0,marines:0};
 encounterFloat(member.crewComposition.crew);encounterFloat(member.crewComposition.marines);return member.crewComposition;
}
export function clearOriginalEncounterCrew(crew){crew.crew=0;crew.marines=0;}
export function addOriginalEncounterCrew(crew,amount,kind='crew'){encounterCheck(kind==='crew'||kind==='marines','Actual personnel kind required');crew[kind]=Math.max(0,Math.fround(encounterFloat(crew[kind])+encounterFloat(amount)));}
export function transferOriginalEncounterCrew(from,amount,to=null){
 // CrewComposition.transfer only transfers CREW; marines stay where they are.
 const rounded=Math.fround(Math.max(-2147483648,Math.min(2147483647,Math.floor(encounterFloat(amount)+.5))));
 const moved=Math.min(rounded,encounterFloat(from.crew));from.crew=Math.fround(from.crew-moved);if(to!==null)addOriginalEncounterCrew(to,moved);return moved;
}

/** Validate serializable context data without replacing any referenced world objects. */
export function validateOriginalEncounterState(state,{forCheckpoint=false}={}){
 encounterCheck(state?.scope==='native-fleet-encounter-context','Actual encounter context state required');
 for(const key of ['engagedInHostilities','engagedInActualBattle','playerOnlyRetreated','playerPursued','playerDidSeriousDamage','otherFleetHarriedPlayer','ongoingBattle','isAutoresolve','alreadyAdjustedRep','noHarryBecauseOfStation','computedDifficulty'])encounterBool(state[key]);
 for(const key of ['playerFPHullDamageToEnemies','allyFPHullDamageToEnemies','playerFPHullDamageToAllies','xpGained','difficulty'])encounterFloat(state[key]);
 encounterCheck(Number.isInteger(state.creditsLooted)&&state.creditsLooted>=-2147483648&&state.creditsLooted<=2147483647,'Actual int creditsLooted required');
 encounterCheck(state.lastOutcome===null||typeof state.lastOutcome==='string','Actual nullable encounter outcome required');
 encounterCheck(state.battle===null||state.battle?.scope==='native-current-campaign-battle','Actual nullable encounter Battle required');
 encounterCheck(state.runningDamageTotal===null||typeof state.runningDamageTotal==='object','Actual nullable combat damage data required');
 encounterCheck(state.textPanelForXPGain===null||!forCheckpoint&&typeof state.textPanelForXPGain==='object','Clear transient XP text panel before saving encounter');
 if(state.salvageRandom!==null)validateOriginalJavaRandom(state.salvageRandom);
 validateOriginalResourceCargo(state.loot);
 const array=(object,key)=>{encounterCheck(Array.isArray(object[key]),'Actual encounter list required: '+key);return object[key];};
 const ref=value=>encounterCheck(value&&typeof value.objectRef==='string'&&value.objectRef.length>0,'Actual encounter object reference required');
 const unique=(rows,key,label)=>{const seen=new Set();for(const row of rows){const object=key===null?row:row[key];ref(object);encounterCheck(!seen.has(object),'Duplicate encounter '+label+' identity');seen.add(object);}};
 const crew=value=>{encounterCheck(value&&typeof value==='object','Actual crew-loss data required');encounterFloat(value.crew);encounterFloat(value.marines);};
 unique(array(state,'sideData'),'fleet','side');
 for(const side of state.sideData){
  encounterFloat(side.maxTimeDeployed);for(const key of ['wonLastEngagement','disengaged','didEnoughToDisengage','enemyCanCleanDisengage'])encounterBool(side[key]);
  encounterCheck(side.lastGoal===null||side.lastGoal==='ATTACK'||side.lastGoal==='ESCAPE','Actual nullable side goal required');
  crew(side.crewLossesDuringLastEngagement);crew(side.recoverableCrewLosses);
  for(const key of ['ownCasualties','enemyCasualties'])for(const row of array(side,key)){ref(row.member);encounterCheck(typeof row.status==='string','Actual casualty status required');}
  for(const key of ['deployedInLastEngagement','retreatedFromLastEngagement','inReserveDuringLastEngagement','disabledInLastEngagement','destroyedInLastEngagement','membersWithOfficerOrPlayerAsOrigCaptain'])for(const member of array(side,key))ref(member);
  unique(array(side,'membersWithOfficerOrPlayerAsOrigCaptain'),null,'original-captain member');unique(array(side,'officerData'),'person','officer');
  for(const row of side.officerData){if(row.sourceFleet!==null)ref(row.sourceFleet);encounterFloat(row.timeDeployed);}
  unique(array(side,'memberToDeployedMap'),'member','deployment');for(const row of side.memberToDeployedMap)encounterCheck(row.deployed&&typeof row.deployed==='object','Actual deployed-member data required');
  array(side,'fleetMemberDeploymentData');
 }
 for(const key of ['recoverableShips','storyRecoverableShips'])for(const member of array(state,key))ref(member);
 unique(array(state,'origSourceForRecoveredShips'),'member','recovery source');for(const row of state.origSourceForRecoveredShips)ref(row.fleet);
 unique(array(state,'playerFPHullDamageToAlliesByFaction'),'faction','friendly-fire faction');for(const row of state.playerFPHullDamageToAlliesByFaction)encounterFloat(row.damage);
 unique(array(state,'preEngagementCRForWinner'),'member','pre-engagement CR');for(const row of state.preEngagementCRForWinner)encounterFloat(row.cr);
 return state;
}
