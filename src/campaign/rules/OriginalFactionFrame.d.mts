import type {OriginalRelationshipFaction} from './OriginalRelationships.mjs';
import type {OriginalCampaignMemory,OriginalCampaignMemoryServices} from './OriginalCampaignMemory.mjs';
import type {OriginalFactionProduction,OriginalFactionProductionTimeServices} from './OriginalFactionProduction.mjs';
export interface OriginalFactionFrame {scope:'native-current-faction-frame';faction:OriginalRelationshipFaction;memory:OriginalCampaignMemory|null;production:OriginalFactionProduction|null}
export interface OriginalFactionFrameServices extends OriginalFactionProductionTimeServices {memoryServices?:OriginalCampaignMemoryServices;advanceFactionProduction?(production:OriginalFactionProduction,seconds:number):void}
export function createOriginalFactionFrame(faction:OriginalRelationshipFaction):OriginalFactionFrame;
export function validateOriginalFactionFrame(frame:OriginalFactionFrame,faction?:OriginalRelationshipFaction):OriginalFactionFrame;
export function originalFactionMemoryWithoutUpdate(frame:OriginalFactionFrame):OriginalCampaignMemory;
export function advanceOriginalFactionFrame(frame:OriginalFactionFrame,seconds:number,context:{paused:boolean},services:OriginalFactionFrameServices):void;
