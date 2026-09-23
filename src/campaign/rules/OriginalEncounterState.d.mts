import type {OriginalCampaignBattle} from './OriginalCampaignBattle.mjs';
import type {OriginalConstructedCampaignFleet} from './OriginalCampaignFleet.mjs';
import type {OriginalNativeFleet,OriginalNativeFleetMember} from './OriginalFleetData.mjs';
import type {OriginalPlayerCargo} from './OriginalPlayerEconomy.mjs';
import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
import type {OriginalFleetEncounterServices} from './OriginalFleetEncounterContext.mjs';
type Fleet=OriginalConstructedCampaignFleet;type Member=OriginalNativeFleetMember;
export interface OriginalEncounterCrew {objectRef?:string;crew:number;marines:number}
export interface OriginalEncounterCasualty {member:Member;status:string}
export interface OriginalEncounterOfficerDeployment {person:import('./OriginalPlayerEconomy.mjs').OriginalPayrollPerson;sourceFleet:Fleet|null;timeDeployed:number}
export interface OriginalEncounterSideState {fleet:Fleet;maxTimeDeployed:number;officerData:OriginalEncounterOfficerDeployment[];fleetMemberDeploymentData:object[];ownCasualties:OriginalEncounterCasualty[];enemyCasualties:OriginalEncounterCasualty[];deployedInLastEngagement:Member[];retreatedFromLastEngagement:Member[];inReserveDuringLastEngagement:Member[];disabledInLastEngagement:Member[];destroyedInLastEngagement:Member[];memberToDeployedMap:{member:Member;deployed:object}[];membersWithOfficerOrPlayerAsOrigCaptain:Member[];crewLossesDuringLastEngagement:OriginalEncounterCrew;recoverableCrewLosses:OriginalEncounterCrew;wonLastEngagement:boolean;lastGoal:'ATTACK'|'ESCAPE'|null;disengaged:boolean;didEnoughToDisengage:boolean;enemyCanCleanDisengage:boolean}
export interface OriginalEncounterState {scope:'native-fleet-encounter-context';sideData:OriginalEncounterSideState[];engagedInHostilities:boolean;engagedInActualBattle:boolean;playerOnlyRetreated:boolean;playerPursued:boolean;playerDidSeriousDamage:boolean;battle:OriginalCampaignBattle|null;otherFleetHarriedPlayer:boolean;ongoingBattle:boolean;isAutoresolve:boolean;runningDamageTotal:object|null;origSourceForRecoveredShips:{member:Member;fleet:Fleet}[];alreadyAdjustedRep:boolean;textPanelForXPGain:object|null;noHarryBecauseOfStation:boolean;lastOutcome:string|null;recoverableShips:Member[];storyRecoverableShips:Member[];playerFPHullDamageToEnemies:number;allyFPHullDamageToEnemies:number;playerFPHullDamageToAllies:number;playerFPHullDamageToAlliesByFaction:{faction:import('./OriginalRelationships.mjs').OriginalRelationshipFaction;damage:number}[];xpGained:number;loot:OriginalPlayerCargo;creditsLooted:number;salvageRandom:OriginalJavaRandomState|null;preEngagementCRForWinner:{member:Member;cr:number}[];difficulty:number;computedDifficulty:boolean}
export function encounterCheck(ok:unknown,message:string):asserts ok;
export function encounterFloat(value:number):number;
export function encounterBool(value:boolean):boolean;
export function encounterCall(services:object,key:string,...args:unknown[]):unknown;
export function createOriginalEncounterCrew():OriginalEncounterCrew;
export function createOriginalEncounterState(loot:OriginalPlayerCargo):OriginalEncounterState;
export function originalEncounterCombined(battle:OriginalCampaignBattle,fleet:Fleet):Fleet|null;
export function createOriginalEncounterSide(fleet:Fleet):OriginalEncounterSideState;
export function originalEncounterSide(state:OriginalEncounterState,fleet:Fleet):OriginalEncounterSideState;
export function originalEncounterSource(state:OriginalEncounterState,member:Member):Fleet|null;
export function originalEncounterMemberFleet(state:OriginalEncounterState,member:Member,services?:OriginalFleetEncounterServices):OriginalNativeFleet|null;
export function originalEncounterMemberCrew(member:Member):OriginalEncounterCrew;
export function clearOriginalEncounterCrew(crew:OriginalEncounterCrew):void;
export function addOriginalEncounterCrew(crew:OriginalEncounterCrew,amount:number,kind?:'crew'|'marines'):void;
export function transferOriginalEncounterCrew(from:OriginalEncounterCrew,amount:number,to?:OriginalEncounterCrew|null):number;

export function validateOriginalEncounterState(state:OriginalEncounterState,options?:{forCheckpoint?:boolean}):OriginalEncounterState;
