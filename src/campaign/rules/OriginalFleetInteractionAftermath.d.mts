import type {OriginalEncounterState} from './OriginalEncounterState.mjs';
import type {OriginalConstructedCampaignFleet as Fleet} from './OriginalCampaignFleet.mjs';
import type {OriginalNativeFleetMember as Member} from './OriginalFleetData.mjs';
import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
import type {OriginalFleetEncounterContext,OriginalFleetEncounterServices} from './OriginalFleetEncounterContext.mjs';
import type {OriginalFleetWorldServices} from './OriginalFleetWorld.mjs';
import type {OriginalLootConfirmationServices} from './OriginalLootCargoTransaction.mjs';
import type {OriginalPlayerCargo} from './OriginalPlayerEconomy.mjs';
export interface OriginalFleetAftermathConfig {dismissOnLeave:boolean;withSalvage:boolean;lootCredits:boolean;impactsEnemyReputation:boolean;impactsAllyReputation:boolean;printXPToDialog:boolean;straightToEngage:boolean;noSalvageLeaveOptionText:string|null;delegate:object|null;salvageRandom:OriginalJavaRandomState|null}
export interface OriginalFleetInteractionProgress {ongoingBattle:boolean;harryEndedBattle:boolean;allyEngagementChoiceNoBattle:boolean;firedVictoryTriggers:boolean;recoveredCrew:boolean;didRecoveryCheck:boolean;pulledIn:Fleet[];recoveredShips:Member[]}
export interface OriginalFleetInteractionAftermath extends OriginalFleetInteractionProgress {scope:'native-fleet-interaction-aftermath';context:OriginalEncounterState;playerFleet:Fleet;otherFleet:Fleet;config:OriginalFleetAftermathConfig;cleanedUp:boolean;lootedCredits:boolean;creditsLooted:string|null;phase:'awaiting-end-path'|'loot-option'|'loot-open'|'leave-option'|'continue-leave'|'finished'}
export interface OriginalFleetInteractionDialog {getTextPanel():object;getOptionPanel():object;getVisualPanel():object;dismiss():void;hideTextPanel():void;hideVisualPanel():void;showTextPanel():void;showVisualPanel():void;setOptionOnEscape(text:string,value:null):void;setOptionOnConfirm(text:string,value:null):void;setPromptText(text:string):void}
export interface OriginalFleetInteractionServices extends OriginalFleetEncounterServices,OriginalLootConfirmationServices,OriginalFleetWorldServices {
 readCustomEntityLightSource?(location:import('./OriginalFleetWorld.mjs').OriginalFleetLocationRegistry):object|null;
 readInteractionString?(state:OriginalFleetInteractionAftermath,id:string):string;
 readInteractionHighlightColor?():unknown;
 formatInteractionCredits?(credits:number):string;
 postInteractionSalvageGeneration?(delegate:object,dialog:OriginalFleetInteractionDialog,context:OriginalFleetEncounterContext,loot:OriginalPlayerCargo):void;
 notifyInteractionLeave?(delegate:object,dialog:OriginalFleetInteractionDialog):void;
 reportInteractionLootGenerated?(context:OriginalFleetEncounterContext,loot:OriginalPlayerCargo):void;
 prepareInteractionLootCargo?(loot:OriginalPlayerCargo):void;
 dismissInteractionLoot?():boolean;
}
export function createOriginalFleetAftermathConfig(overrides?:Partial<OriginalFleetAftermathConfig>):OriginalFleetAftermathConfig;
export function createOriginalFleetInteractionAftermath(context:OriginalEncounterState,player:Fleet,other:Fleet,progress:OriginalFleetInteractionProgress,config?:OriginalFleetAftermathConfig):OriginalFleetInteractionAftermath;
export function validateOriginalFleetInteractionAftermath(state:OriginalFleetInteractionAftermath):OriginalFleetInteractionAftermath;
export function originalInteractionValidPlayerFleet(fleet:Fleet,services?:OriginalFleetInteractionServices):boolean;
export function completeOriginalFleetVictorySalvage(state:OriginalFleetInteractionAftermath,context:OriginalFleetEncounterContext,dialog:OriginalFleetInteractionDialog,services?:OriginalFleetInteractionServices):void;
export function cleanUpOriginalFleetInteractionBattle(state:OriginalFleetInteractionAftermath,context:OriginalFleetEncounterContext,services?:OriginalFleetInteractionServices):boolean;
export function openOriginalFleetLoot(state:OriginalFleetInteractionAftermath,context:OriginalFleetEncounterContext,dialog:OriginalFleetInteractionDialog,services?:OriginalFleetInteractionServices):void;
export function dismissOriginalFleetLoot(state:OriginalFleetInteractionAftermath,context:OriginalFleetEncounterContext,dialog:OriginalFleetInteractionDialog,services?:OriginalFleetInteractionServices):boolean;
export function leaveOriginalFleetInteraction(state:OriginalFleetInteractionAftermath,context:OriginalFleetEncounterContext,dialog:OriginalFleetInteractionDialog,continued?:boolean,services?:OriginalFleetInteractionServices):boolean;
