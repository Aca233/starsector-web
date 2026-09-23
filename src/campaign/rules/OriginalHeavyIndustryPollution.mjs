import { identifier, finite, requireThat, immutableJSON } from '../core/Values.mjs';
import { economyShape } from './OriginalMarketEconomy.mjs';
import { bool, stat, put } from './OriginalIndustryState.mjs';
import { ORIGINAL_PRODUCTION_INDUSTRIES } from './OriginalProductionIndustries.mjs';
import { ORIGINAL_IMMIGRATION } from './OriginalColonyEnvironment.mjs';
const check=(ok,message)=>requireThat(ok,'UNSUPPORTED_HEAVY_POLLUTION',message),f=Math.fround;
const nativeDays=n=>{finite(n,'native elapsed days',0,2**31);check(n===f(n),'Elapsed days must preserve native float precision');return n;};
export function newOriginalHeavyIndustryPollution(){return immutableJSON({daysWithNanoforge:0,permaPollution:false,addedPollution:false});}
/** Called AFTER the BaseIndustry part of advance/setSpecialItem. Emits condition callbacks, never fabricates a condition object ID. */
export function updateOriginalHeavyIndustryPollution(input){
 economyShape(input,['state','event','specialItemId','days','habitable','pollutionPresent'],'heavy-industry pollution callback');
 economyShape(input.state,['daysWithNanoforge','permaPollution','addedPollution'],'native heavy pollution state');nativeDays(input.state.daysWithNanoforge);bool(input.state.permaPollution,'permanent pollution');bool(input.state.addedPollution,'industry-added pollution');bool(input.habitable,'habitable presence');bool(input.pollutionPresent,'pollution presence');
 check(['advance','special-item-set','update-status'].includes(input.event),'Unknown heavy-industry callback');check([null,'corrupted_nanoforge','pristine_nanoforge'].includes(input.specialItemId),'Unknown heavy-industry item');
 if(input.event==='advance')nativeDays(input.days);else check(input.days===null,'Only advance accepts resolved native days');
 const state=structuredClone(input.state),conditionEffects=[];let pollutionPresent=input.pollutionPresent;
 const special=input.specialItemId!==null;
 if(input.event==='advance'&&special){state.daysWithNanoforge=f(state.daysWithNanoforge+input.days);nativeDays(state.daysWithNanoforge);}
 if(input.habitable&&(input.event!=='advance'||special)){
  if(special){
   if(!state.addedPollution&&state.daysWithNanoforge>=ORIGINAL_PRODUCTION_INDUSTRIES.pollution.daysBeforePollution){
    if(pollutionPresent)state.permaPollution=true;
    else{conditionEffects.push({action:'add',conditionId:'pollution'});pollutionPresent=true;state.addedPollution=true;}
   }
   if(state.addedPollution&&!state.permaPollution&&state.daysWithNanoforge>ORIGINAL_PRODUCTION_INDUSTRIES.pollution.daysBeforePermanent)state.permaPollution=true;
  }else if(state.addedPollution&&!state.permaPollution){conditionEffects.push({action:'remove',conditionId:'pollution'});pollutionPresent=false;state.addedPollution=false;}
 }
 return immutableJSON({scope:'heavy-industry-pollution-callback-effects-only',state,pollutionPresent,conditionEffects});
}
/** The actual Pollution.apply/unapply effects; apply is not a reapply. Caller owns condition lifetime and native modifier ID. */
export function applyOriginalPollutionCondition(input){
 economyShape(input,['action','modId','hazard','transientModifiers'],'pollution condition callback');check(['apply','unapply'].includes(input.action),'Unknown condition callback');identifier(input.modId);stat(input.hazard);
 check(Array.isArray(input.transientModifiers)&&input.transientModifiers.length<=256,'Expected native transient callback set');const seen=new Set();
 for(const m of input.transientModifiers){economyShape(m,['kind','id'],'immigration callback');identifier(m.id);check(['condition','industry'].includes(m.kind),'Unknown callback kind');const key=m.kind+':'+m.id;check(!seen.has(key),'Duplicate transient callback');seen.add(key);}
 const hazard=structuredClone(input.hazard),transientModifiers=structuredClone(input.transientModifiers),apply=input.action==='apply';
 put(hazard,'flat',input.modId,ORIGINAL_IMMIGRATION.conditions.pollution.hazard,!apply);
 const index=transientModifiers.findIndex(m=>m.kind==='condition'&&m.id===input.modId);
 if(apply&&index<0){check(transientModifiers.length<256,'Transient callback set exceeds supported bound');transientModifiers.push({kind:'condition',id:input.modId});}
 else if(!apply&&index>=0)transientModifiers.splice(index,1);
 stat(hazard);return immutableJSON({hazard,transientModifiers});
}
