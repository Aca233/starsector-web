/** GroundDefenses plugin stat callbacks. Fleet combat and raid resolution are separate. */
import raw from '../data/reference-ground-defenses.json' with {type:'json'};
import {immutableJSON,requireThat} from '../core/Values.mjs';
import {stat,put,get,functional,bool} from './OriginalIndustryState.mjs';
export const ORIGINAL_GROUND_DEFENSES=immutableJSON(raw);
const R=ORIGINAL_GROUND_DEFENSES,C=R.constants,f=Math.fround,commodities=['supplies','marines','hand_weapons'];
const check=(v,m)=>requireThat(v,'UNSUPPORTED_GROUND_DEFENSES',m),round=n=>Math.max(-2147483648,Math.min(2147483647,Math.floor(n+0.5)));
export function isSupportedOriginalGroundDefenseItem(industryId,itemId){return itemId===R.item.id&&R.item.industryIds.includes(industryId);}
function validate(m,entry){
 check(R.industries.includes(entry.state.industryId),'Actual supported ground defense industry required');
 check(entry.modifiers.specialItemId===null||isSupportedOriginalGroundDefenseItem(entry.state.industryId,entry.modifiers.specialItemId),'Unknown/incompatible defense item');
 check([null,'alpha_core','beta_core','gamma_core'].includes(entry.modifiers.aiCoreId),'Unknown defense AI core');bool(entry.modifiers.improved,'ground defense improvement');
 stat({base:0,modifiers:m.groundDefenses});stat(m.stability);functional(entry.operating);
}
function modify(m,id,value,remove=false){put({modifiers:m.groundDefenses},'mult',id,value,remove);}
/** Base.unapply: no-core -> temporarily-unimproved -> installed item; then stability and main effect. */
export function unapplyOriginalGroundDefenseEffects(m,entry){
 validate(m,entry);const id='ind_'+entry.state.industryId;
 modify(m,id+'_1',0,true);modify(m,'ground_defenses_improve',0,true);
 if(entry.modifiers.specialItemId===R.item.id)modify(m,R.item.id,0,true);
 put(m.stability,'flat',id,0,true);modify(m,id,0,true);
}
/** Base.apply phase, after financial reads and before GroundDefenses writes its demand. */
export function applyOriginalGroundDefenseBaseEffects(m,entry){
 validate(m,entry);const id='ind_'+entry.state.industryId;
 if(entry.modifiers.aiCoreId==='alpha_core')modify(m,id+'_1',f(1+C.ALPHA_CORE_BONUS));
 else if(entry.modifiers.aiCoreId===null)modify(m,id+'_1',0,true); // Beta/gamma base callbacks are empty.
 modify(m,'ground_defenses_improve',f(1+C.IMPROVE_DEFENSE_BONUS),!entry.modifiers.improved);
 if(entry.modifiers.specialItemId===R.item.id)modify(m,R.item.id,R.item.multiplier);
}
/** Each deficit scan calls the actual lazy getter separately; no up-front commodity snapshot. */
function maxDeficit(entry,readAvailable){
 let deficit=0,commodityId=null;
 for(const id of commodities){
  const demand=Math.trunc(stat(get(entry.state,'demand',id))),available=readAvailable(id);
  check(Number.isInteger(available)&&available>=0&&available<=2147483647,'Actual current commodity availability required');
  const next=Math.max(demand-available,0);if(next>deficit){deficit=next;commodityId=id;}
 }
 return {commodityId,deficit};
}
export function applyOriginalGroundDefenseEffects(m,entry,readAvailable){
 validate(m,entry);check(typeof readAvailable==='function','Actual lazy defense availability service required');
 const id='ind_'+entry.state.industryId,stabilityDeficit=maxDeficit(entry,readAvailable),stabilityBonus=1-Math.min(1,stabilityDeficit.deficit);
 if(stabilityBonus>0)put(m.stability,'flat',id,stabilityBonus);
 const defenseDeficit=maxDeficit(entry,readAvailable);let deficit=f(defenseDeficit.deficit),maxDemand=0;
 for(const c of commodities)maxDemand=Math.max(maxDemand,f(round(stat(get(entry.state,'demand',c)))));
 if(maxDemand<1){maxDemand=1;deficit=0;}
 const deficitMult=Math.max(0,Math.min(1,f(f(maxDemand-deficit)/maxDemand)));
 // Source constructs its shortage description with a THIRD getter scan, even while disrupted.
 const descriptionDeficit=deficitMult!==1?maxDeficit(entry,readAvailable):null;
 const bonus=entry.state.industryId==='heavybatteries'?C.DEFENSE_BONUS_BATTERIES:C.DEFENSE_BONUS_BASE,multiplier=f(1+f(bonus*deficitMult));
 modify(m,id,multiplier);const operating=functional(entry.operating);
 if(!operating){entry.state.supply={};unapplyOriginalGroundDefenseEffects(m,entry);}
 return immutableJSON({scope:'ground-defense-stat-effects-only',industryId:entry.state.industryId,operating,stabilityDeficit,defenseDeficit,descriptionDeficit,maxDemand,deficitMult,multiplier});
}
