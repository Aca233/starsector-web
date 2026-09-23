import type {OriginalCampaignBattle} from './OriginalCampaignBattle.mjs';
import type {OriginalConstructedCampaignFleet} from './OriginalCampaignFleet.mjs';
import type {OriginalNativeFleet,OriginalNativeFleetMember} from './OriginalFleetData.mjs';
import type {OriginalBattleLifecycleServices} from './OriginalCampaignBattleLifecycle.mjs';
import type {OriginalBattleMemberDamageServices} from './OriginalBattleMemberDamage.mjs';
import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
type Fleet=OriginalConstructedCampaignFleet;
export type OriginalBattleMemberOutcome='DISABLED'|'HEAVY_DAMAGE'|'MEDIUM_DAMAGE'|'LIGHT_DAMAGE'|'UNSCATHED';
export interface OriginalBattleMemberData {member:OriginalNativeFleetMember;strength:number;shieldRatio:number;combatReady:boolean}
export interface OriginalBattleFleetData {fleet:Fleet;fightingStrength:number;members:OriginalBattleMemberData[]}
export interface OriginalBattleFleetResult {fleet:Fleet|null;goal:'ATTACK'|'ESCAPE'|null;winner:boolean;deployed:OriginalNativeFleetMember[];reserves:OriginalNativeFleetMember[];destroyed:OriginalNativeFleetMember[];disabled:OriginalNativeFleetMember[];retreated:OriginalNativeFleetMember[];allEverDeployed:null;isPlayer:false;enemyCanCleanDisengage:false}
export interface OriginalBattleEngagementResult {scope:'native-autoresolve-engagement-result';battle:OriginalCampaignBattle;winnerResult:OriginalBattleFleetResult;loserResult:OriginalBattleFleetResult;playerOutBeforeEnd:false;lastCombatDamageData:null}
/** Integration contract for the REAL encounter context. Recording adapters only prove dispatch. */
export interface OriginalBattleEncounterContext {
 setAutoresolve(value:boolean):void;setBattle(battle:OriginalCampaignBattle):void;getBattle():OriginalCampaignBattle|null;getWinner():Fleet|null;
 processEngagementResults(result:OriginalBattleEngagementResult):void;
 performPostVictoryRecovery(result:OriginalBattleEngagementResult):void;
 getDataFor(fleet:Fleet):{setDisengaged(value:boolean):void;setWonLastEngagement(value:boolean):void;setLastGoal(goal:'ATTACK'|'ESCAPE'):void};
 generateLoot(winner:null,withCredits:true):unknown;autoLoot():void;recoverCrew(fleet:Fleet):void;applyAfterBattleEffectsIfThereWasABattle():void;
}
export interface OriginalBattleAutoresolver {scope:'native-default-battle-autoresolver';battle:OriginalCampaignBattle;one:Fleet|null;two:Fleet|null;playerPursuitAutoresolveMode:boolean;playerShipsToDeploy:OriginalNativeFleetMember[]|null;result:OriginalBattleEngagementResult|null;context:OriginalBattleEncounterContext|null}
export interface OriginalBattleAutoresolverServices extends OriginalBattleLifecycleServices,OriginalBattleMemberDamageServices {
 createBattleEncounterContext?():OriginalBattleEncounterContext;
 modifyBattleAutoresolveData?(data:OriginalBattleFleetData):void;
 /** Persisted independent stream for Collections.shuffle, not Math.random or Battle.seed. */
 readBattleShuffleRandom?():OriginalJavaRandomState;
 readBattleAutoresolveDamageMult?():number;
}
export function createOriginalBattleAutoresolver(battle:OriginalCampaignBattle,services?:OriginalBattleAutoresolverServices):OriginalBattleAutoresolver;
export function computeOriginalBattleMemberData(member:OriginalNativeFleetMember,fleet:OriginalNativeFleet,pursuit?:boolean,services?:OriginalBattleAutoresolverServices):OriginalBattleMemberData;
export function computeOriginalBattleFleetData(resolver:OriginalBattleAutoresolver,fleet:Fleet,services?:OriginalBattleAutoresolverServices):OriginalBattleFleetData;
export function originalBattleOutcomeWeights(data:OriginalBattleMemberData,advantage:number,maxDamage:number,escaping:boolean,enemyEscaping:boolean,services?:OriginalBattleAutoresolverServices):[OriginalBattleMemberOutcome,number][];
export function computeOriginalBattleMemberOutcome(data:OriginalBattleMemberData,fleet:OriginalNativeFleet,advantage:number,maxDamage:number,escaping:boolean,enemyEscaping:boolean,services?:OriginalBattleAutoresolverServices):OriginalBattleMemberOutcome;
export function resolveOriginalBattleEngagement(resolver:OriginalBattleAutoresolver,context:OriginalBattleEncounterContext,oneEscaping:boolean,twoEscaping:boolean,services?:OriginalBattleAutoresolverServices):OriginalBattleEngagementResult|undefined;
export function resolveOriginalBattleAutoresolver(resolver:OriginalBattleAutoresolver,services?:OriginalBattleAutoresolverServices):OriginalBattleEngagementResult|undefined;
export function resolveOriginalBattlePlayerPursuit(resolver:OriginalBattleAutoresolver,context:OriginalBattleEncounterContext,selected:OriginalNativeFleetMember[],services?:OriginalBattleAutoresolverServices):OriginalBattleEngagementResult|undefined;
