import {createOriginalCampaignPluginRegistry,validateOriginalCampaignPluginRegistry} from './OriginalCampaignPluginPicks.mjs';
import {createOriginalGenericPluginManager,validateOriginalGenericPluginManager} from './OriginalGenericPlugins.mjs';
import {createOriginalAnimationManager,validateOriginalAnimationManager} from './OriginalCampaignAnimations.mjs';
import {validateOriginalActionIndicator,validateOriginalPingScript} from './OriginalCampaignPings.mjs';
import {validateOriginalCampaignUIDataFrame} from './OriginalCampaignUIData.mjs';
import {validateOriginalCampaignEventManager} from './OriginalCampaignEvents.mjs';
import {createOriginalIntelManager,validateOriginalIntelManager} from './OriginalIntelManager.mjs';
import {createOriginalImportantPeople,validateOriginalImportantPeople} from './OriginalImportantPeople.mjs';
/** CampaignEngine.advance ordering. Location/manager implementations remain real dependencies.
 * This scheduler alone is NOT a complete Sector or permission-safe network tick. */
import {requireThat} from '../core/Values.mjs';
import {validateOriginalFleetWorld} from './OriginalFleetWorld.mjs';
import {validateOriginalCampaignMemory} from './OriginalCampaignMemory.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_ENGINE_FRAME',m);
const call=(s,name,...args)=>{check(typeof s[name]==='function','Actual engine frame service required: '+name);const v=s[name](...args);check(!v||typeof v.then!=='function','Engine frame services must be synchronous: '+name);return v;};
const bool=v=>{check(typeof v==='boolean','Actual engine frame Boolean required');return v;};
const number=v=>{check(Number.isFinite(v)&&Number.isFinite(f(v)),'Finite engine frame float required');return f(v);};
const remove=(list,value)=>{const at=list.indexOf(value);if(at>=0)list.splice(at,1);};
/** Only for a NEW engine whose lists/frame are genuinely empty/zero; never restores history. */
export function createOriginalCampaignEngineState(world,hyperspace,starSystems,currentLocation){
 const state={scope:'native-campaign-engine-frame-state',objectRef:world.sectorRef,kind:'campaign-engine',world,frame:'0',hyperspace,starSystems:[...starSystems],currentLocation,removeAsap:[],scripts:[],transientScripts:[],pings:[],animationManager:createOriginalAnimationManager(),genericPlugins:createOriginalGenericPluginManager(),campaignPlugins:createOriginalCampaignPluginRegistry(),memory:null,importantPeople:createOriginalImportantPeople(),intelManager:createOriginalIntelManager(),idMapDirty:true,activeLocations:[hyperspace,...starSystems].map(location=>({location,activeThisFrame:false}))};return validateOriginalCampaignEngineState(state,world);
}
export function validateOriginalCampaignEngineState(state,world){
 check(state?.scope==='native-campaign-engine-frame-state'&&world?.scope==='native-current-fleet-world-registration'&&state.world===world,'Actual engine/world state required');
 check((state.objectRef===undefined||state.objectRef===world.sectorRef)&&(state.kind===undefined||state.kind==='campaign-engine'),'Lost actual engine identity');for(const location of world.locations)if(location.repository.listener?.scope==='native-campaign-engine-frame-state')check(location.repository.listener===state,'Split engine repository-listener identity');
 check(typeof state.frame==='string'&&/^-?(0|[1-9][0-9]*)$/.test(state.frame),'Actual native long frame required');const frame=BigInt(state.frame);check(frame===BigInt.asIntN(64,frame)&&String(frame)===state.frame,'Frame outside native long range');
 check(world.locations.includes(state.hyperspace)&&state.hyperspace.hyperspaceMode,'Actual hyperspace identity required');check(Array.isArray(state.starSystems)&&new Set(state.starSystems).size===state.starSystems.length&&state.starSystems.every(l=>world.locations.includes(l)&&l!==state.hyperspace&&!l.hyperspaceMode),'Actual ordered star-system identities required');
 validateOriginalFleetWorld(world);const locations=[state.hyperspace,...state.starSystems];check(world.locations.includes(state.currentLocation),'Current location is not in this engine world');check(Array.isArray(state.activeLocations)&&new Set(state.activeLocations.map(r=>r.location)).size===state.activeLocations.length&&state.activeLocations.every(r=>world.locations.includes(r.location)&&typeof r.activeThisFrame==='boolean')&&[...locations,state.currentLocation].every(l=>state.activeLocations.some(r=>r.location===l)),'Active-location state lost shared identity');
 for(const key of ['removeAsap','scripts','transientScripts','pings'])check(Array.isArray(state[key])&&state[key].every(v=>v&&typeof v==='object'),'Actual engine list required: '+key);check(state.removeAsap.every(l=>world.locations.includes(l)&&l!==state.hyperspace&&!l.hyperspaceMode),'Removed system must be an actual registered star system');check(typeof state.idMapDirty==='boolean','Actual ID cache status required');if(state.memory!==null)validateOriginalCampaignMemory(state.memory);if(Object.hasOwn(state,'animationManager'))validateOriginalAnimationManager(state.animationManager);if(Object.hasOwn(state,'genericPlugins'))validateOriginalGenericPluginManager(state.genericPlugins);if(Object.hasOwn(state,'campaignPlugins'))validateOriginalCampaignPluginRegistry(state.campaignPlugins);for(const ping of state.pings)if(ping.scope==='native-campaign-action-indicator')validateOriginalActionIndicator(ping);for(const script of [...state.scripts,...state.transientScripts])if(script.scope==='native-campaign-ping-script')validateOriginalPingScript(script);if(Object.hasOwn(state,'uiDataFrame'))validateOriginalCampaignUIDataFrame(state.uiDataFrame);if(Object.hasOwn(state,'eventManager'))validateOriginalCampaignEventManager(state.eventManager);if(Object.hasOwn(state,'importantPeople'))validateOriginalImportantPeople(state.importantPeople);if(Object.hasOwn(state,'intelManager'))validateOriginalIntelManager(state.intelManager,[...state.scripts,...state.transientScripts].filter(s=>typeof s.objectRef==='string'));return state;
}
function active(state,location,value){const row=state.activeLocations.find(r=>r.location===location);check(row,'Missing actual active-location state');row.activeThisFrame=value;}
function scripts(list,seconds,context,services,effects){for(const script of [...list]){if(bool(call(services,'isEngineScriptDone',script))){remove(list,script);continue;}if(!bool(call(services,'engineScriptRunsWhilePaused',script))&&bool(context.paused))continue;const result=call(services,'advanceEngineScript',script,seconds);if(result?.effects!==undefined){check(Array.isArray(result.effects),'Ordered engine-script effects required');effects.push(...result.effects);}if(bool(call(services,'isEngineScriptDone',script)))remove(list,script);}}
/** Context getters are LIVE: earlier managers/scripts may pause or change the current location. */
export function advanceOriginalCampaignEngine(state,seconds,context,services){
 seconds=number(seconds);check(seconds>=0,'Negative engine dt');check(state?.scope==='native-campaign-engine-frame-state','Actual engine frame state required');
 bool(context.paused);if(!bool(context.paused))state.frame=String(BigInt.asIntN(64,BigInt(state.frame)+1n));
 for(const location of state.removeAsap){call(services,'removeStarSystem',location);check(!state.starSystems.includes(location),'removeStarSystem must remove the actual system');}state.removeAsap.length=0;
 call(services,'readdChangeListeners');if(!bool(context.paused)&&state.idMapDirty){call(services,'rebuildIDToEntityMap');state.idMapDirty=false;}
 // campaign/OOoO.super returns immediately for null input, without touching tooltip history.
 // An empty input list is NOT null and still requires the real UI manager.
 if(services.advanceTooltipManager!==undefined)call(services,'advanceTooltipManager',seconds,context.input);else check(context.input===null,'Actual tooltip manager required for non-null input');
 call(services,'advanceIntelManager',seconds);call(services,'advanceEventManager',seconds);call(services,'advanceImportantPeople',seconds);call(services,'advanceUIData',seconds);
 const days=number(call(services,'convertToDays',seconds));if(!bool(context.paused))call(services,'advanceListenersWithTimeout',days);
 const economy=bool(context.paused)?call(services,'advanceMarketConditionsWhenPaused',seconds):call(services,'advanceEconomyBeforeClock',seconds);
 const memorySeconds=bool(context.paused)?0:seconds;if(state.memory!==null)call(services,'advanceEngineMemory',state.memory,memorySeconds);call(services,'advanceCharacterMemory',memorySeconds);
 const factions=call(services,'readAllFactions');check(Array.isArray(factions),'Actual faction manager roster required');for(const faction of factions)call(services,'advanceFaction',faction,memorySeconds);
 if(bool(context.paused)&&context.playerFleet!==null)call(services,'updatePlayerSpeedBonus',context.playerFleet);
 let clock=null;const advances=[],effects=[];const advanceLocation=(location,dt,input)=>{const playerFleet=context.playerFleet,result=call(services,'advanceLocation',location,dt,input);if(result?.effects!==undefined){check(Array.isArray(result.effects),'Ordered location frame effects required');for(const entry of result.effects)effects.push({...entry,location,playerFleet});}advances.push({locationRef:location.objectRef,seconds:dt});};
 if(bool(context.fastAdvance)){
  if(!bool(context.paused)){call(services,'advanceAnimations',seconds);clock=call(services,'advanceClock',seconds);active(state,state.hyperspace,true);call(services,'advanceLocationEvenIfPaused',state.hyperspace,seconds,context.input);advanceLocation(state.hyperspace,seconds,null);for(const location of state.starSystems){active(state,location,true);call(services,'advanceLocationEvenIfPaused',location,seconds,context.input);advanceLocation(location,seconds,null);}}
 }else{
  call(services,'advanceLocationEvenIfPaused',state.currentLocation,seconds,context.input);
  if(!bool(context.paused)){call(services,'advanceAnimations',seconds);clock=call(services,'advanceClock',seconds);for(let i=0;i<state.pings.length;){const ping=state.pings[i];call(services,'advancePing',ping,seconds);if(bool(call(services,'canCleanUpPing',ping)))state.pings.splice(i,1);else i++;}}
  const phase=BigInt(state.frame)%60n,backgroundSeconds=f(seconds*60);let index=0;
  if(state.currentLocation!==state.hyperspace){if(phase===BigInt(index%60)){active(state,state.hyperspace,true);call(services,'advanceLocationEvenIfPaused',state.hyperspace,backgroundSeconds,context.input);if(!bool(context.paused))advanceLocation(state.hyperspace,backgroundSeconds,null);}else active(state,state.hyperspace,false);}index++;
  for(const location of state.starSystems){if(state.currentLocation!==location){if(phase===BigInt(index%60)){active(state,location,true);call(services,'advanceLocationEvenIfPaused',location,backgroundSeconds,context.input);if(!bool(context.paused))advanceLocation(location,backgroundSeconds,null);}else active(state,location,false);}index++;}
  if(!bool(context.paused)){active(state,state.currentLocation,true);advanceLocation(state.currentLocation,seconds,context.input);}
 }
 scripts(state.scripts,seconds,context,services,effects);scripts(state.transientScripts,seconds,context,services,effects);
 if(context.campaignHelp!==null&&!bool(context.fastAdvance))call(services,'advanceCampaignHelp',context.campaignHelp,seconds);
 return {scope:'native-campaign-engine-dispatch',frame:state.frame,economy,clock,advances,effects,readyForAuthority:false};
}

/** New engines have a real manager; an old checkpoint without it is unobserved history, never empty. */
export function originalCampaignGenericPlugins(state){
 check(state?.scope==='native-campaign-engine-frame-state'&&Object.hasOwn(state,'genericPlugins'),'Actual GenericPluginManager history required; old checkpoint is unavailable');
 return validateOriginalGenericPluginManager(state.genericPlugins);
}
