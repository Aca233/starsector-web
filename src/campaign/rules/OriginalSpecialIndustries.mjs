import raw from '../data/reference-special-industries.json' with { type: 'json' };
import { identifier, integer, requireThat, immutableJSON } from '../core/Values.mjs';
import { economyShape } from './OriginalMarketEconomy.mjs';
import { blank, bool, size, stat, unmodified, put, commodity, functional, get, quantity, updateBonuses, validateIndustryState } from './OriginalIndustryState.mjs';
export const ORIGINAL_SPECIAL_INDUSTRIES = immutableJSON(raw);
const R=ORIGINAL_SPECIAL_INDUSTRIES, check=(ok,message)=>requireThat(ok,'UNSUPPORTED_SPECIAL_INDUSTRY',message);
function spec(id){identifier(id);check(Object.hasOwn(R.industries,id),'Unknown special industry');return R.industries[id];}
export function validateOriginalSpecialIndustry(state){validateIndustryState(state);spec(state.industryId);}
export function newOriginalSpecialIndustry(industryId){spec(industryId);return immutableJSON({schemaVersion:1,industryId,supplyBonus:blank(),demandReduction:blank(),supply:{},demand:{}});}
export function originalSpecialIndustryFunctional(id,operating,factionId){spec(id);identifier(factionId);return functional(operating)&&(id!=='lionsguard'||factionId==='sindrian_diktat');}
export function originalTechMiningFinancialSize(marketSize,conditionIds){size(marketSize);check(Array.isArray(conditionIds)&&conditionIds.length<=128&&new Set(conditionIds).size===conditionIds.length,'Expected condition identities');conditionIds.forEach(id=>identifier(id));return Math.min(marketSize,conditionIds.includes('ruins_vast')?4:conditionIds.includes('ruins_extensive')?3:conditionIds.includes('ruins_widespread')?2:conditionIds.includes('ruins_scattered')?1:0);}
/** Commodity and tech-multiplier writes only. Patrols, submarkets, salvage RNG and market multipliers have separate lifecycles. */
export function applyOriginalSpecialIndustry(input){
  economyShape(input,['state','marketSize','operating','modifiers','available','factionId','techMiningMult'],'special industry application');
  validateOriginalSpecialIndustry(input.state);size(input.marketSize);stat(input.techMiningMult);
  const state=structuredClone(input.state),techMiningMult=structuredClone(input.techMiningMult),id=state.industryId,active=originalSpecialIndustryFunctional(id,input.operating,input.factionId),prefix='ind_'+id+'_';
  const keys=id==='lionsguard'?['hand_weapons']:id==='cryosanctum'?['organics','supplies']:[];
  economyShape(input.available,keys,'special industry availability');for(const n of Object.values(input.available)){integer(n,'commodity availability',-65536);check(n<=65536,'Availability out of range');}
  check(input.modifiers.specialItemId===null||(id==='commerce'&&input.modifiers.specialItemId==='dealmaker_holosuite'),'Unsupported special industry item');
  updateBonuses(state,{...input.modifiers,specialItemId:null},{alphaSupplyBonus:['lionsguard','cryosanctum'].includes(id),improvementSupplyBonus:false});
  const demand=(c,n)=>quantity(state,'demand',prefix+'0',c,n),supply=(c,n)=>quantity(state,'supply',prefix+'0',c,n);
  const deficit=(...ids)=>Math.max(0,...ids.map(c=>Math.trunc(stat(get(state,'demand',c)))-input.available[c]));
  const reduce=(c,n)=>{if(!unmodified(get(state,'supply',c)))quantity(state,'supply',prefix+'1',c,-n);};
  if(id==='lionsguard'){
    for(const c of ['supplies','fuel','ships'])demand(c,input.marketSize-1);
    supply('crew',input.marketSize);demand('hand_weapons',input.marketSize);supply('marines',input.marketSize);reduce('marines',deficit('hand_weapons'));
  }else if(id==='cryosanctum'){
    demand('supplies',3);demand('organics',3);supply('organs',6);reduce('organs',deficit('organics','supplies')>0?-1:0);
  }else if(id==='techmining'){
    // TechMining.unapply does not call Base.unapply; beta/gamma do not remove a previous alpha modifier.
    if(input.modifiers.aiCoreId==='alpha_core')put(techMiningMult,'mult',prefix+'0',Math.fround(1+R.constants.ALPHA_CORE_FINDS_BONUS));
    else if(input.modifiers.aiCoreId===null)put(techMiningMult,'mult',prefix+'0',0,true);
    put(techMiningMult,'mult',prefix+'1',Math.fround(1+R.constants.IMPROVE_FINDS_BONUS),!input.modifiers.improved);
  }
  if(!active&&id!=='commerce')state.supply={};
  validateOriginalSpecialIndustry(state);stat(techMiningMult);return immutableJSON({state,techMiningMult});
}
export function originalSpecialIndustryOutput(state,context){validateOriginalSpecialIndustry(state);economyShape(context,['commodityId','illegal'],'special industry legality');commodity(context.commodityId);bool(context.illegal,'commodity illegality');const legal=state.industryId==='lionsguard'||!context.illegal;return immutableJSON({id:state.industryId,supply:stat(state.supply[context.commodityId]??blank()),demand:stat(state.demand[context.commodityId]??blank()),supplyLegal:legal,demandLegal:legal});}
