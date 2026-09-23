/** CampaignUIPersistentData.advance fields only, not a replacement for all persistent UI data. */
import {requireThat} from '../core/Values.mjs';
import {createOriginalCampaignInterval,validateOriginalCampaignInterval,advanceOriginalCampaignInterval} from './OriginalCampaignInterval.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_UI_DATA_FRAME',m);
const scalar=v=>{check(typeof v==='number'&&Number.isFinite(v)&&Number.isFinite(f(v)),'Actual finite UI frame float required');return f(v);};
const call=(services,name,...args)=>{check(typeof services?.[name]==='function','Actual UI data service required: '+name);const result=services[name](...args);check(!result||typeof result.then!=='function','UI data services must be synchronous: '+name);return result;};
/** Explicit NEW UI advance state. Never use to invent missing historical UI state. */
export function createOriginalCampaignUIDataFrame(randomDouble){return {scope:'native-campaign-ui-data-frame',musicSuppressor:{maxLevel:0,currLevel:0},cleanupTracker:createOriginalCampaignInterval(.5,1.5,randomDouble)};}
export function validateOriginalCampaignUIDataFrame(state){
 check(state?.scope==='native-campaign-ui-data-frame'&&Object.keys(state).every(k=>['scope','musicSuppressor','cleanupTracker'].includes(k)),'Actual UI data advance state required');
 const music=state.musicSuppressor;check(music&&Object.keys(music).every(k=>['maxLevel','currLevel'].includes(k)),'Actual MusicSuppressor state required');
 for(const key of ['maxLevel','currLevel'])check(scalar(music[key])===music[key]&&music[key]>=0,'Actual saved nonnegative music float required');
 validateOriginalCampaignInterval(state.cleanupTracker);return state;
}
export function suppressOriginalCampaignMusic(state,level){validateOriginalCampaignUIDataFrame(state);level=scalar(level);if(level>state.musicSuppressor.maxLevel)state.musicSuppressor.maxLevel=level;}
/** Stock IntelTabData.performCleanup has an empty body (0.98a-RC8:109-110). */
export function cleanupOriginalIntelTabData(){}
export function advanceOriginalCampaignUIDataFrame(state,seconds,context,services){
 validateOriginalCampaignUIDataFrame(state);seconds=scalar(seconds);check(seconds>=0,'Negative UI data frame');
 const music=state.musicSuppressor,amount=f(.5*seconds);
 if(music.currLevel<music.maxLevel){music.currLevel=f(music.currLevel+amount);if(music.currLevel>music.maxLevel)music.currLevel=music.maxLevel;}
 if(music.currLevel>music.maxLevel){music.currLevel=f(music.currLevel-amount);if(music.currLevel<0)music.currLevel=0;}
 music.maxLevel=0;
 const paused=context.paused;check(typeof paused==='boolean','Actual UI data pause flag required');if(paused)return;
 const days=scalar(call(services,'convertUISecondsToDays',seconds));advanceOriginalCampaignInterval(state.cleanupTracker,days,()=>call(services,'randomDouble'));
 if(state.cleanupTracker.intervalElapsed){if(services.cleanupIntelData===undefined)cleanupOriginalIntelTabData();else call(services,'cleanupIntelData');}
}
