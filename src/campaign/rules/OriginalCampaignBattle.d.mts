import type {OriginalConstructedCampaignFleet,OriginalEngineInterval,OriginalFleetConstructionFaction} from './OriginalCampaignFleet.mjs';
import type {OriginalFleetLifecycleServices,OriginalNativeFleetMember} from './OriginalFleetData.mjs';
import type {OriginalFleetLocationRegistry} from './OriginalFleetWorld.mjs';
import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
import type {OriginalCampaignMemoryServices} from './OriginalCampaignMemory.mjs';
type Fleet=OriginalConstructedCampaignFleet;
type AI=NonNullable<Fleet['campaign']['ai']>;
export type OriginalBattleSide='ONE'|'TWO'|'NO_JOIN';
/** Mutable actual identities. Not a complete autoresolver or a native historical save importer. */
export interface OriginalCampaignBattle {
 scope:'native-current-campaign-battle';schemaVersion:1;objectRef:string;location:OriginalFleetLocationRegistry;
 sideOne:Fleet[];sideTwo:Fleet[];snapshotSideOne:Fleet[]|null;snapshotSideTwo:Fleet[]|null;
 tracker:OriginalEngineInterval;flash:OriginalEngineInterval;
 memberSource:{member:OriginalNativeFleetMember;memberRef:string;fleet:Fleet}[];
 combinedOne:Fleet|null;combinedTwo:Fleet|null;primaryOne:Fleet|null;primaryTwo:Fleet|null;
 playerInvolvedAtStart:boolean;playerInvolvementFraction:number;seed:string;done:boolean;
}
export const ORIGINAL_CAMPAIGN_BATTLE:Readonly<{schemaVersion:1;version:string;sources:Readonly<Record<string,string>>;settings:Readonly<{autoresolveBaseInterval:number;battleDetectabilityMult:number;battleDetectabilityFlat:number;devMode:boolean}>}>;
export interface OriginalCampaignBattleServices extends OriginalFleetLifecycleServices {
 globalRandom?:OriginalJavaRandomState;memoryServices?:OriginalCampaignMemoryServices;
 newBattleSeed?():string;newBattleObjectRef?(first:Fleet,seed:string):string;
 readBattleAutoresolveInterval?():number;addBattleLocationScript?(location:OriginalFleetLocationRegistry,battle:OriginalCampaignBattle):void;
 readBattlePlayerFleet?():Fleet;readBattleFleetPoints?(fleet:Fleet):number;readBattleFleetHasUniqueSignature?(fleet:Fleet):boolean;
 readBattleAbilityKeys?(fleet:Fleet):string[];readBattleAbility?(fleet:Fleet,id:string):object;
 notifyBattleAbilityJoined?(ability:object,battle:OriginalCampaignBattle,fleet:Fleet):void;
 notifyBattleAbilityLeft?(ability:object,battle:OriginalCampaignBattle,fleet:Fleet,engaged:boolean):void;
 isBattleAIHostileTo?(ai:AI,target:Fleet,owner:Fleet):boolean;
 areBattleFactionsHostile?(first:OriginalFleetConstructionFaction,second:OriginalFleetConstructionFaction):boolean;
 /** Faction.isAtWorst(other, RepLevel.FRIENDLY), not merely non-hostile. */
 areBattleFactionsFriendly?(first:OriginalFleetConstructionFaction,second:OriginalFleetConstructionFaction):boolean;
 isBattleFleetHostileTo?(fleet:Fleet,target:Fleet):boolean;isBattleFleetFriendlyTo?(fleet:Fleet,target:Fleet):boolean;
}
export function createOriginalCampaignBattle(first:Fleet,second:Fleet,services?:OriginalCampaignBattleServices):OriginalCampaignBattle;
export function validateOriginalCampaignBattle(battle:OriginalCampaignBattle):OriginalCampaignBattle;
export function takeOriginalBattleSnapshots(battle:OriginalCampaignBattle):OriginalCampaignBattle;
export function originalBattleSnapshot(battle:OriginalCampaignBattle,side:'ONE'|'TWO'):Fleet[];
export function originalBattleSnapshotFor(battle:OriginalCampaignBattle,list:Fleet[]|null):Fleet[]|null;
export function originalBattleSide(battle:OriginalCampaignBattle,side:OriginalBattleSide):Fleet[]|null;
export function originalBattleSideFor(battle:OriginalCampaignBattle,fleet:Fleet|null):Fleet[]|null;
export function originalBattleIsInvolved(battle:OriginalCampaignBattle,fleet:Fleet|null):boolean;
export function originalBattleIsPlayerSide(battle:OriginalCampaignBattle,list:Fleet[]|null,services?:OriginalCampaignBattleServices):boolean;
export function originalBattlePlayerSide(battle:OriginalCampaignBattle,services?:OriginalCampaignBattleServices):Fleet[]|null;
export function originalBattlePrimary(battle:OriginalCampaignBattle,list:Fleet[]|null,services?:OriginalCampaignBattleServices,excludePlayer?:boolean):Fleet|null;
export function originalBattleIsPlayerPrimary(battle:OriginalCampaignBattle,services?:OriginalCampaignBattleServices):boolean;
export function originalBattleStationInvolved(battle:OriginalCampaignBattle):boolean;
export function originalBattleFleetKnowsPlayer(fleet:Fleet,services?:OriginalCampaignBattleServices):boolean;
export function originalBattleFleetHostileTo(fleet:Fleet,target:Fleet,services?:OriginalCampaignBattleServices):boolean;
export function originalBattleFleetFriendlyTo(fleet:Fleet,target:Fleet,services?:OriginalCampaignBattleServices):boolean;
export function pickOriginalBattleSide(battle:OriginalCampaignBattle,joining:Fleet,services?:OriginalCampaignBattleServices,respectTransponder?:boolean):OriginalBattleSide;
export function canJoinOriginalBattle(battle:OriginalCampaignBattle,fleet:Fleet,services?:OriginalCampaignBattleServices):boolean;
export function joinOriginalBattle(battle:OriginalCampaignBattle,fleet:Fleet,services?:OriginalCampaignBattleServices,side?:OriginalBattleSide):boolean;
export function originalBattleClosestFleet(battle:OriginalCampaignBattle,joining:Fleet):Fleet|null;
export function notifyOriginalBattleAbilitiesLeft(fleet:Fleet,battle:OriginalCampaignBattle,engaged:boolean,services?:OriginalCampaignBattleServices):void;
export function originalBattleFleetPoints(fleet:Fleet,services?:OriginalCampaignBattleServices):number;
export function originalBattleFleetMembers(fleet:Fleet,services?:OriginalCampaignBattleServices):import('./OriginalFleetData.mjs').OriginalNativeFleetMember[];
