/** CoreReputationPlugin's combat/CUSTOM paths over real relationship delegates. */
import R from '../data/reference-battle-autoresolver.json' with {type:'json'};
import {requireThat} from '../core/Values.mjs';
import {originalFactionById,bindOriginalFactionRelationship,originalRepAtBest,originalRepAtWorst} from './OriginalRelationships.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_REPUTATION',m),num=n=>{check(typeof n==='number'&&Number.isFinite(n)&&Number.isFinite(f(n)),'Actual reputation float required');return f(n);};
const call=(s,k,...args)=>{check(typeof s[k]==='function','Actual reputation service required: '+k);const value=s[k](...args);check(!value||typeof value.then!=='function','Synchronous reputation service required');return value;};
const recognized=action=>typeof action==='string'?R.reputation.actions.includes(action):action?.scope==='native-rep-action-envelope';
export function createOriginalReputationEnvelope(action,param=null,textPanel=null){check(R.reputation.actions.includes(action),'Actual native RepActions value required');return {scope:'native-rep-action-envelope',action,param,textPanel,message:null,addMessageOnNoChange:true,withMessage:true,reason:null};}
export function originalCoreReputationImpact(action,param,services={}){
 const impact={delta:0,limit:null,ensureAtBest:null,ensureAtWorst:null,requireAtBest:null,requireAtWorst:null};
 switch(action){
 case 'CUSTOM':check(param&&typeof param==='object'&&Object.hasOwn(param,'delta'),'CUSTOM requires actual CustomRepImpact');Object.assign(impact,param);break;
 case 'COMBAT_HELP_MINOR':Object.assign(impact,{delta:f(.01),limit:'WELCOMING',requireAtWorst:'INHOSPITABLE'});break;
 case 'COMBAT_HELP_MAJOR':Object.assign(impact,{delta:f(.03),limit:'FRIENDLY',requireAtWorst:'INHOSPITABLE'});break;
 case 'COMBAT_HELP_CRITICAL':Object.assign(impact,{delta:f(.05),limit:'COOPERATIVE',requireAtWorst:'INHOSPITABLE'});break;
 case 'COMBAT_FRIENDLY_FIRE':{let hull=f(Math.ceil(num(param)));if(hull>=20){hull=0;impact.ensureAtBest='HOSTILE';}impact.delta=f(f(-1*hull)*f(.01));break;}
 case 'COMBAT_NORMAL':Object.assign(impact,{delta:f(-.03),limit:'VENGEFUL',ensureAtBest:'HOSTILE'});break;
 case 'COMBAT_AGGRESSIVE':Object.assign(impact,{delta:f(-.05),limit:'VENGEFUL',ensureAtBest:'HOSTILE'});break;
 case 'COMBAT_NORMAL_TOFF':Object.assign(impact,{delta:f(-.03),limit:'VENGEFUL'});break;
 case 'COMBAT_AGGRESSIVE_TOFF':Object.assign(impact,{delta:f(-.05),limit:'VENGEFUL'});break;
 case 'COMBAT_NO_DAMAGE_ESCAPE':break; // No switch branch in CoreReputationPlugin.
 default:Object.assign(impact,call(services,'resolveNativeReputationImpact',action,param));
 }
 impact.delta=num(impact.delta);for(const key of ['limit','ensureAtBest','ensureAtWorst','requireAtBest','requireAtWorst'])check(impact[key]===null||R.reputation.levels.some(l=>l.id===impact[key]),'Actual nullable RepLevel required: '+key);return impact;
}
export function handleOriginalCoreReputation(manager,actionObject,factionId,person,delegate,services={}){
 if(!recognized(actionObject)||factionId==='neutral')return {delta:0};const faction=originalFactionById(manager,factionId),playerFleet=call(services,'readNativeReputationPlayerFleet'); // Native getter visit even though the local is unused.
 void playerFleet;
 const envelope=typeof actionObject==='string'?createOriginalReputationEnvelope(actionObject):actionObject,{action,param,textPanel:panel,message,withMessage,addMessageOnNoChange,reason}=envelope;check(typeof withMessage==='boolean'&&typeof addMessageOnNoChange==='boolean','Actual envelope message flags required');const current=delegate.getLevel(),impact=originalCoreReputationImpact(action,param,services);let delta=impact.delta;
 if(delta<0&&delta>f(-.01))delta=f(-.01);if(delta>0&&delta<f(.01))delta=f(.01);delta=f(Math.floor(f(delta*100)+.5)/100);
 // RelationshipTarget is a wrapper. Preserve reference comparisons; do not unwrap its faction/person and change native semantics.
 if(delegate.getTarget()===manager.playerFaction)delta=0;if(delegate.getTarget()===call(services,'readNativeReputationPlayerPerson'))delta=0;
 const sign=Math.sign(delta),before=delegate.getRel();if(impact.ensureAtBest!==null)delegate.ensureAtBest(impact.ensureAtBest);if(impact.ensureAtWorst!==null)delegate.ensureAtWorst(impact.ensureAtWorst);
 if((impact.requireAtBest===null||originalRepAtBest(current,impact.requireAtBest))&&(impact.requireAtWorst===null||originalRepAtWorst(current,impact.requireAtWorst)))delegate.adjustRelationship(delta,impact.limit);
 const after=delegate.getRel();delta=f(after-before);
 if(withMessage){if(Math.abs(delta)>=f(.005))call(services,'reportNativeReputationMessage',{kind:'adjustment',delta,faction,person,message,panel,withCurrent:true,pad:0,reason});else if(sign!==0&&addMessageOnNoChange)call(services,'reportNativeReputationMessage',{kind:'no-change',deltaSign:sign,faction,person,message,panel,withCurrent:true,pad:0,reason});}
 if(delta!==0)call(services,'reportNativeReputationChange',person===null?faction.factionId:person,delta);return {delta};
}
export function adjustOriginalPlayerFactionReputation(manager,action,factionId,services={}){
 if(factionId==='player')return {delta:0};
 if(services.pickNativeReputationActionPlugin){const plugin=call(services,'pickNativeReputationActionPlugin',action,factionId);if(plugin===null)return {delta:0};check(typeof plugin?.handlePlayerReputationAction==='function','Actual reputation plugin required');return call(plugin,'handlePlayerReputationAction',action,factionId);}
 // CoreCampaignPluginImpl only picks its plugin for native enum/envelope actions.
 if(!recognized(action))return {delta:0};const faction=originalFactionById(manager,factionId);if(faction===null)return {delta:0};return handleOriginalCoreReputation(manager,action,factionId,null,bindOriginalFactionRelationship(manager,'player',faction),services);
}
