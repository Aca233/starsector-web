import type {OriginalEncounterState} from './OriginalEncounterState.mjs';
import type {OriginalFleetEncounterServices} from './OriginalFleetEncounterContext.mjs';
import type {OriginalConstructedCampaignFleet} from './OriginalCampaignFleet.mjs';
import type {OriginalNativeFleetMember} from './OriginalFleetData.mjs';
export function originalEncounterSnapshotFor(state:OriginalEncounterState,fleet:OriginalConstructedCampaignFleet):OriginalConstructedCampaignFleet[]|null;
export function originalEncounterPlayerContribution(state:OriginalEncounterState,services?:OriginalFleetEncounterServices):number;
export function lootOriginalEncounterCargo(state:OriginalEncounterState,recoveredShips:OriginalNativeFleetMember[]|null,takingFromPlayer:boolean,services?:OriginalFleetEncounterServices):void;
export function autoLootOriginalEncounter(state:OriginalEncounterState,services?:OriginalFleetEncounterServices):void;
export function generateOriginalEncounterLoot(state:OriginalEncounterState,recoveredShips:OriginalNativeFleetMember[]|null,withCredits:boolean,services?:OriginalFleetEncounterServices):void;
