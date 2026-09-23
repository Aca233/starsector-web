import type {OriginalEncounterState} from './OriginalEncounterState.mjs';
import type {OriginalFleetEncounterServices} from './OriginalFleetEncounterContext.mjs';
import type {OriginalConstructedCampaignFleet} from './OriginalCampaignFleet.mjs';
export interface OriginalEncounterReputationDialog {getTextPanel():{addParagraph(text:string):unknown}}
export function originalEncounterLowRepImpact(state:OriginalEncounterState,services?:OriginalFleetEncounterServices):boolean;
export function originalEncounterNoRepImpact(state:OriginalEncounterState,services?:OriginalFleetEncounterServices):boolean;
export function didOriginalPlayerWinEncounterOutright(state:OriginalEncounterState,services?:OriginalFleetEncounterServices):boolean;
export function didOriginalPlayerWinLatestEncounterBattle(state:OriginalEncounterState,services?:OriginalFleetEncounterServices):boolean;
export function markOriginalEncounterLowRepImpact(fleet:OriginalConstructedCampaignFleet,services?:OriginalFleetEncounterServices):boolean;
export function adjustOriginalEncounterPlayerReputation(state:OriginalEncounterState,dialog:OriginalEncounterReputationDialog,ffText?:string|null,okToAdjustAlly?:boolean,okToAdjustEnemy?:boolean,services?:OriginalFleetEncounterServices):boolean;
