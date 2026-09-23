import type {OriginalReputationServices,OriginalReputationEnvelope,OriginalReputationResult} from './OriginalCoreReputation.mjs';
import type {OriginalEncounterReputationDialog} from './OriginalEncounterReputation.mjs';
import type {OriginalExperienceServices} from './OriginalCharacterExperience.mjs';
import type {OriginalStorageVariant} from './OriginalStorage.mjs';
import type {OriginalNativeCargoItem,OriginalNativeCargoStack} from './OriginalNativeCargo.mjs';
import type {OriginalCampaignMemory} from './OriginalCampaignMemory.mjs';
import type {OriginalPayrollPerson} from './OriginalPlayerEconomy.mjs';
import type {OriginalNativeCargoServices} from './OriginalNativeCargo.mjs';
import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
import type {OriginalBattleAutoresolverServices,OriginalBattleEncounterContext,OriginalBattleEngagementResult,OriginalBattleFleetResult} from './OriginalBattleAutoresolver.mjs';
import type {OriginalEncounterState,OriginalEncounterSideState,OriginalEncounterCrew,OriginalEncounterCasualty} from './OriginalEncounterState.mjs';
import type {OriginalNativeFleet,OriginalNativeFleetMember} from './OriginalFleetData.mjs';
import type {OriginalConstructedCampaignFleet} from './OriginalCampaignFleet.mjs';
import type {OriginalPlayerCargo} from './OriginalPlayerEconomy.mjs';
import type {OriginalFleetLocationRegistry} from './OriginalFleetWorld.mjs';
import type {OriginalNativeCampaignMemberView} from './OriginalCampaignFleetMemberView.mjs';
type Fleet=OriginalConstructedCampaignFleet;type Member=OriginalNativeFleetMember;
export interface OriginalEncounterFleetResult extends Omit<OriginalBattleFleetResult,'allEverDeployed'|'isPlayer'|'enemyCanCleanDisengage'> {allEverDeployed:object[]|null;isPlayer:boolean;enemyCanCleanDisengage:boolean}
export interface OriginalEncounterEngagementResult extends Omit<OriginalBattleEngagementResult,'winnerResult'|'loserResult'|'lastCombatDamageData'|'playerOutBeforeEnd'> {winnerResult:OriginalEncounterFleetResult;loserResult:OriginalEncounterFleetResult;lastCombatDamageData:object|null;playerOutBeforeEnd:boolean}
export interface OriginalFleetEncounterServices extends OriginalBattleAutoresolverServices,OriginalNativeCargoServices,OriginalExperienceServices,OriginalReputationServices {
 adjustEncounterFactionReputation?(action:OriginalReputationEnvelope,factionId:string):OriginalReputationResult;
 readEncounterSModRecords?():{member:Member|null;spSpent:number;bonusXPFractionGained:number}[];
 readEncounterTutorialInProgress?():boolean;createEncounterPromoteOfficerIntel?(panel:object|null):object;addEncounterPromoteOfficerIntel?(intel:object,queued:false,panel:object|null):void;
 despawnEncounterFleet?(fleet:Fleet,reason:'DESTROYED_BY_BATTLE',battle:import('./OriginalCampaignBattle.mjs').OriginalCampaignBattle):void;
 isEncounterModularAI?(ai:NonNullable<Fleet['campaign']['ai']>):boolean;forceEncounterTargetReEval?(ai:NonNullable<Fleet['campaign']['ai']>):void;
 readEncounterCaptain?(member:Member):OriginalPayrollPerson|null;
 readEncounterStockVariant?(id:string):OriginalStorageVariant;
 readEncounterModuleVariant?(variant:OriginalStorageVariant,slotId:string):OriginalStorageVariant|null;
 readEncounterSalvageSetting?(key:string):number;isEncounterPlayerHullmodKnown?(id:string):boolean;allowEncounterKnownHullmodDrops?():boolean;
 readEncounterHullmodRequiredItem?(id:string):OriginalNativeCargoStack|null;
 readEncounterHullmodItemManager?():{scope:'native-hullmod-item-manager';map:{memberId:string;installed:{modId:string;item:OriginalNativeCargoItem}[]}[]};
 returnEncounterHullmodItems?(member:Member,cargo:OriginalPlayerCargo):void;
 readEncounterCampaignDifficulty?():string;readEncounterGantryValue?(fleet:Fleet):number;
 readEncounterMemoryLong?(memory:OriginalCampaignMemory,key:string):string;
 reportEncounterExtraSalvageShown?(fleet:Fleet):void;
 generateEncounterExtraDrops?(random:OriginalJavaRandomState,valueMult:number,overallMult:number,fuelMult:number,dropValue:object[],dropRandom:object[]):OriginalPlayerCargo;
 createEncounterLootCargo?():OriginalPlayerCargo;
 resolveEncounterFleetData?(dataRef:string):OriginalNativeFleet;
 readEncounterCurrentLocation?():OriginalFleetLocationRegistry|null;
 showEncounterMemberDestruction?(view:OriginalNativeCampaignMemberView,fleet:Fleet,member:Member):void;
 readEncounterRetreatLossMult?():number;readEncounterHullTags?(member:Member):string[];
 reportPlayerEncounterEngagement?(result:OriginalEncounterEngagementResult):void;
 updateEncounterDeployedMap?(state:OriginalEncounterState,side:OriginalEncounterSideState,result:OriginalEncounterFleetResult):void;
 resetEncounterDeploymentResult?(result:OriginalEncounterFleetResult):void;
 tallyEncounterOfficerTime?(state:OriginalEncounterState,side:OriginalEncounterSideState,result:OriginalEncounterFleetResult):void;
 addEncounterCombatDamage?(total:object,current:object):void;computeEncounterFPHullDamage?(state:OriginalEncounterState):void;
 applyEncounterExtendedCRLoss?(state:OriginalEncounterState,result:OriginalEncounterFleetResult,member:Member,deployed:object):void;
 computeEncounterDetailedCrewLoss?(state:OriginalEncounterState,member:Member,result:OriginalEncounterFleetResult,hullFraction:number,hullDamage:number,deployed:object):number;
 readEncounterExtraFighterLossDP?(state:OriginalEncounterState,member:Member,deployed:object):number;
 generateEncounterLoot?(state:OriginalEncounterState,recoveredShips:Member[]|null,withCredits:boolean):unknown;
 generateEncounterPlayerLoot?(state:OriginalEncounterState,recoveredShips:Member[]|null,withCredits:boolean):void;
 readEncounterCargoRecoveryFraction?():number;
 /** Real independent persistent Misc.random, not the Math.random stream. */
 readEncounterMiscRandom?():OriginalJavaRandomState;
 autoLootEncounter?(state:OriginalEncounterState):void;applyEncounterAfterBattleEffects?(state:OriginalEncounterState):void;
}
export interface OriginalEncounterSideFacade {
 state:OriginalEncounterSideState;getFleet():Fleet;getMaxTimeDeployed():number;setMaxTimeDeployed(value:number):void;
 getOfficerData():OriginalEncounterSideState['officerData'];getFleetMemberDeploymentData():object[];getMembersWithOfficerOrPlayerAsOrigCaptain():Member[];
 getCrewLossesDuringLastEngagement():OriginalEncounterCrew;getRecoverableCrewLosses():OriginalEncounterCrew;
 getOwnCasualties():OriginalEncounterCasualty[];getEnemyCasualties():OriginalEncounterCasualty[];
 addOwn(member:Member,status:string):void;addEnemy(member:Member,status:string):void;removeOwnCasualty(member:Member):void;removeEnemyCasualty(member:Member):void;changeOwn(member:Member,status:string):void;changeEnemy(member:Member,status:string):void;
 getDeployedInLastEngagement():Member[];getRetreatedFromLastEngagement():Member[];getInReserveDuringLastEngagement():Member[];getDisabledInLastEngagement():Member[];getDestroyedInLastEngagement():Member[];getMemberToDeployedMap():{member:Member;deployed:object}[];
 disengaged():boolean;setDisengaged(value:boolean):void;isWonLastEngagement():boolean;setWonLastEngagement(value:boolean):void;getLastGoal():'ATTACK'|'ESCAPE'|null;setLastGoal(value:'ATTACK'|'ESCAPE'|null):void;
 isDidEnoughToDisengage():boolean;setDidEnoughToDisengage(value:boolean):void;isEnemyCanCleanDisengage():boolean;setEnemyCanCleanDisengage(value:boolean):void;
}
export interface OriginalFleetEncounterContext extends OriginalBattleEncounterContext {
 adjustPlayerReputation(dialog:OriginalEncounterReputationDialog,ffText?:string|null,okToAdjustAlly?:boolean,okToAdjustEnemy?:boolean):boolean;isLowRepImpact():boolean;isNoRepImpact():boolean;didPlayerWinEncounterOutright():boolean;didPlayerWinMostRecentBattleOfEncounter():boolean;
 gainXP():void;gainOfficerXP(side:OriginalEncounterSideFacade,xp:number):void;addPotentialOfficer():void;
 state:OriginalEncounterState;generateLoot(recoveredShips:Member[]|null,withCredits:boolean):unknown;
 getCreditsLooted():number;getSalvageMult(status:string):number;getSalvageValueModPlayerShips():number;
 lootWeapons(member:Member,variant:OriginalStorageVariant|null,own:boolean,mult:number,module?:boolean):void;lootWings(member:Member,variant:OriginalStorageVariant|null,own:boolean,mult:number):void;lootHullMods(member:Member,variant:OriginalStorageVariant|null,mult:number):void;
 handleCargoLooting(recoveredShips:Member[]|null,takingFromPlayer:boolean):void;getLoot():OriginalPlayerCargo;
 computePlayerContribFraction():number;getSalvageRandom():OriginalJavaRandomState|null;setSalvageRandom(random:OriginalJavaRandomState|null):void;
 getDataFor(fleet:Fleet):OriginalEncounterSideFacade;getWinnerData():OriginalEncounterSideFacade|null;getLoserData():OriginalEncounterSideFacade|null;getLoser():Fleet|null;
 isAutoresolve():boolean;getLastEngagementOutcome():string|null;isEngagedInHostilities():boolean;isEngagedInActualBattle():boolean;setEngagedInHostilities(value:boolean):void;setEngagedInActualBattle(value:boolean):void;setOtherFleetHarriedPlayer(value:boolean):void;isOtherFleetHarriedPlayer():boolean;
 processEngagementResults(result:OriginalEncounterEngagementResult):void;performPostVictoryRecovery(result:OriginalEncounterEngagementResult):number;performPostEngagementRecoveryBoth(result:OriginalEncounterEngagementResult):number;fixFighters(result:OriginalEncounterFleetResult):void;
}
export function processOriginalEncounterResults(state:OriginalEncounterState,result:OriginalEncounterEngagementResult,services?:OriginalFleetEncounterServices):void;
export function bindOriginalFleetEncounterContext(state:OriginalEncounterState,services?:OriginalFleetEncounterServices):OriginalFleetEncounterContext;
export function createOriginalFleetEncounterContext(services?:OriginalFleetEncounterServices):OriginalFleetEncounterContext;
