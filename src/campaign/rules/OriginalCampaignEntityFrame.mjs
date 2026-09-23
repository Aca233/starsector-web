import {isOriginalCampaignAbility,validateOriginalCampaignAbility,advanceOriginalCampaignAbility} from './OriginalCampaignAbilities.mjs';
/** Shared BaseCampaignEntity tail and actual Misc.fadeAndExpire scripts.
 * Contact/color dispatch precedes this tail in each concrete entity, never a no-op contact. */
import {requireThat} from '../core/Values.mjs';
import {advanceOriginalFader,fadeOriginalFader} from './OriginalFader.mjs';
import {advanceOriginalCampaignMemory} from './OriginalCampaignMemory.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_ENTITY_FRAME',m);
const bool=v=>{check(typeof v==='boolean','Actual entity Boolean required');return v;};
const call=(s,k,...a)=>{check(typeof s[k]==='function','Actual entity frame service required: '+k);const v=s[k](...a);check(!v||typeof v.then!=='function','Synchronous entity service required');return v;};
const scalar=n=>{check(Number.isFinite(n)&&Number.isFinite(f(n)),'Finite entity frame float required');return f(n);};
export function validateOriginalEntityFadeScript(script,entity){check(script?.scope==='native-entity-fade-expire-script'&&script.entity===entity,'Lost fade script/entity identity');check(scalar(script.elapsed)===script.elapsed&&scalar(script.seconds)===script.seconds&&script.seconds>0,'Actual fade script clock required');return script;}
export function startOriginalEntityFadeAndExpire(entity,seconds=1){
 seconds=scalar(seconds);check(seconds>0,'Positive fade duration required');check(Array.isArray(entity.scripts)&&(entity.tags===null||Array.isArray(entity.tags)),'Actual entity scripts/tags required');entity.tags??=[];
 if(entity.tags.includes('fading_out_and_expiring'))return false;
 for(const tag of ['non_clickable','fading_out_and_expiring'])if(!entity.tags.includes(tag))entity.tags.push(tag);
 entity.scripts.push({scope:'native-entity-fade-expire-script',entity,elapsed:0,seconds});return true;
}
function floating(entity,seconds,services){if(entity.floatingText===null)return;check(Array.isArray(entity.floatingText),'Actual floating text required');for(let i=0;i<entity.floatingText.length;){const text=entity.floatingText[i];if(bool(call(services,'isFloatingTextDone',text)))entity.floatingText.splice(i,1);else{call(services,'advanceFloatingText',text,seconds);i++;}}if(entity.floatingText.length===0)entity.floatingText=null;}
function runScripts(entity,seconds,context,services){
 check(Array.isArray(entity.scripts),'Actual ordered entity scripts required');const effects=[];const remove=s=>{const i=entity.scripts.indexOf(s);if(i>=0)entity.scripts.splice(i,1);};
 for(const script of [...entity.scripts]){
  if(isOriginalCampaignAbility(script)){validateOriginalCampaignAbility(script);check(script.entity===entity,'Lost script/entity identity');if(!context.paused)effects.push(...advanceOriginalCampaignAbility(script,seconds,call(services,'readAbilityContext',script),services).effects);continue;}
  if(script?.scope==='native-entity-fade-expire-script'){
   validateOriginalEntityFadeScript(script,entity);if(entity.expired){remove(script);continue;}if(context.paused)continue;
   script.elapsed=f(script.elapsed+seconds);if(script.elapsed>script.seconds)entity.expired=true;
   const brightness=Math.max(0,Math.min(1,f(1-f(script.elapsed/script.seconds))));entity.sensorFader.currBrightness=Math.min(entity.sensorFader.currBrightness,brightness);entity.alwaysUseSensorFaderBrightness=true;
   if(entity.expired)remove(script);continue;
  }
  if(bool(call(services,'isEntityScriptDone',script))){remove(script);continue;}
  if(!bool(call(services,'entityScriptRunsWhilePaused',script))&&context.paused)continue;
  call(services,'advanceEntityScript',script,seconds);if(bool(call(services,'isEntityScriptDone',script)))remove(script);
 }
 return effects;
}
export function advanceOriginalEntityBaseTail(entity,seconds,days,context,services={}){
 seconds=scalar(seconds);days=scalar(days);bool(context.paused);bool(context.isPlayerFleet);
 if(!context.isPlayerFleet)fadeOriginalFader(entity.selectionIndicator.fader,'IN');advanceOriginalFader(entity.selectionIndicator.fader,seconds);
 advanceOriginalFader(entity.sensorFader,seconds);advanceOriginalFader(entity.sensorContactFader,seconds);
 if(entity.memory!==null)advanceOriginalCampaignMemory(entity.memory,days,{paused:context.paused},services.memoryServices);
 if(entity.market!==null&&bool(call(services,'isPlanetConditionMarketOnly',entity.market)))call(services,'advancePlanetConditionMarket',entity.market,seconds);
 floating(entity,seconds,services);return runScripts(entity,seconds,context,services);
}
export function advanceOriginalEntityEvenIfPaused(entity,seconds,context,services={}){
 seconds=scalar(seconds);bool(context.paused);bool(context.isPlayerFleet);if(context.paused)runScripts(entity,seconds,context,services);if(context.paused&&context.isPlayerFleet)floating(entity,seconds,services);
}
