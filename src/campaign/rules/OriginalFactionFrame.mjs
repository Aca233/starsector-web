/** Faction.advance and getMemoryWithoutUpdate on the actual registered faction.
 * An absent nativeFrame means uncaptured history, NOT an empty production queue. */
import {requireThat} from '../core/Values.mjs';
import {createOriginalCampaignMemory,validateOriginalCampaignMemory,advanceOriginalCampaignMemory} from './OriginalCampaignMemory.mjs';
import {createOriginalFactionProduction,validateOriginalFactionProduction,advanceOriginalFactionProduction} from './OriginalFactionProduction.mjs';
const f=Math.fround,check=(ok,message)=>requireThat(ok,'UNSUPPORTED_NATIVE_FACTION_FRAME',message);
const call=(services,name,...args)=>{check(typeof services[name]==='function','Actual faction service required: '+name);const result=services[name](...args);check(!result||typeof result.then!=='function','Faction services must be synchronous');return result;};
/** Explicit new-faction constructor only; never invoked to fill missing historical fields. */
export function createOriginalFactionFrame(faction){return validateOriginalFactionFrame({scope:'native-current-faction-frame',faction,memory:null,production:createOriginalFactionProduction(faction)},faction);}
export function validateOriginalFactionFrame(frame,faction=frame?.faction){
 check(frame?.scope==='native-current-faction-frame'&&faction&&typeof faction.objectRef==='string'&&typeof faction.factionId==='string'&&frame.faction===faction,'Actual shared Faction frame required; unknown history cannot be fabricated');
 if(frame.memory!==null)validateOriginalCampaignMemory(frame.memory);if(frame.production!==null)validateOriginalFactionProduction(frame.production,faction);return frame;
}
export function originalFactionMemoryWithoutUpdate(frame){validateOriginalFactionFrame(frame);if(frame.memory===null)frame.memory=createOriginalCampaignMemory();return frame.memory;}
export function advanceOriginalFactionFrame(frame,seconds,context,services){
 check(typeof seconds==='number'&&Number.isFinite(seconds)&&Number.isFinite(f(seconds)),'Actual finite Faction frame time required');seconds=f(seconds);check(typeof context.paused==='boolean','Actual campaign pause state required');
 if(frame.memory!==null){const days=context.paused?0:call(services,'convertFactionSecondsToDays',seconds);advanceOriginalCampaignMemory(frame.memory,days,context,services.memoryServices);}
 if(frame.production!==null){if(services.advanceFactionProduction)call(services,'advanceFactionProduction',frame.production,seconds);else advanceOriginalFactionProduction(frame.production,seconds,services);}
}
