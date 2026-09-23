import type {OriginalAbilityServices} from './OriginalCampaignAbilities.mjs';
import type {OriginalBaseCampaignEntity} from './OriginalCampaignFleet.mjs';
import type {OriginalCampaignMemoryServices} from './OriginalCampaignMemory.mjs';
export interface OriginalEntityFrameContext {paused:boolean;isPlayerFleet:boolean}
export interface OriginalEntityFrameServices extends OriginalAbilityServices {memoryServices?:OriginalCampaignMemoryServices;isPlanetConditionMarketOnly?(market:unknown):boolean;advancePlanetConditionMarket?(market:unknown,seconds:number):void;isFloatingTextDone?(text:unknown):boolean;advanceFloatingText?(text:unknown,seconds:number):void;isEntityScriptDone?(script:unknown):boolean;entityScriptRunsWhilePaused?(script:unknown):boolean;advanceEntityScript?(script:unknown,seconds:number):void}
export interface OriginalEntityFadeScript {scope:'native-entity-fade-expire-script';entity:OriginalBaseCampaignEntity;elapsed:number;seconds:number}
export function validateOriginalEntityFadeScript(script:OriginalEntityFadeScript,entity:OriginalBaseCampaignEntity):OriginalEntityFadeScript;
export function startOriginalEntityFadeAndExpire(entity:OriginalBaseCampaignEntity,seconds?:number):boolean;
export function advanceOriginalEntityBaseTail(entity:OriginalBaseCampaignEntity,seconds:number,days:number,context:OriginalEntityFrameContext,services?:OriginalEntityFrameServices):import('./OriginalCampaignAbilities.mjs').OriginalAbilityEffect[];
export function advanceOriginalEntityEvenIfPaused(entity:OriginalBaseCampaignEntity,seconds:number,context:OriginalEntityFrameContext,services?:OriginalEntityFrameServices):void;
