/** MilitaryBase.apply/unapply only. Does not spawn routes or fleets. */
import raw from '../data/reference-military-bases.json' with {type:'json'};
import {immutableJSON,requireThat,identifier} from '../core/Values.mjs';
import {stat,put,get,quantity,updateBonuses,functional,size} from './OriginalIndustryState.mjs';
import {validateOriginalMemoryFlags,setOriginalMemoryFlagWithReason} from './OriginalMemoryFlags.mjs';
export const ORIGINAL_MILITARY_BASES=immutableJSON(raw);
const C=ORIGINAL_MILITARY_BASES.constants,I=ORIGINAL_MILITARY_BASES.item,f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_MILITARY_BASE',m);
export function isSupportedOriginalMilitaryItem(industryId,itemId){return itemId===I.id&&I.industryIds.includes(industryId);}
/** Runtime requirement getter: native BaseIndustry explicitly ignores survey level here. */
export function originalMilitaryItemRequirements(industryId,itemId,conditionIds){
 check(isSupportedOriginalMilitaryItem(industryId,itemId),'Unknown/incompatible military installed item');
 check(Array.isArray(conditionIds)&&new Set(conditionIds).size===conditionIds.length,'Actual unique market conditions required');
 for(const id of conditionIds)identifier(id);
 return immutableJSON(Object.keys(I.conditionBonuses).some(id=>conditionIds.includes(id))?[]:[I.requirementName]);
}
const keys=['patrol_num_light_mod','patrol_num_medium_mod','patrol_num_heavy_mod','combat_fleet_size_mult','officer_prob'];
function spec(id){const s=ORIGINAL_MILITARY_BASES.industries[id];check(s,'Actual military industry required');return {patrol:s.tags.includes('patrol'),military:s.tags.includes('military'),command:s.tags.includes('command')};}
function validate(m,e){const s=spec(e.state.industryId);check(e.modifiers.specialItemId===null||isSupportedOriginalMilitaryItem(e.state.industryId,e.modifiers.specialItemId),'Unknown/incompatible military installed item');check(m.military?.scope==='native-military-market-inputs','Actual military market capture required');validateOriginalMemoryFlags(m.military.memory);for(const key of keys)stat({base:0,modifiers:m.economyBonuses?.[key]});stat({base:0,modifiers:m.groundDefenses});stat(m.stability);functional(e.operating);size(m.size);return s;}
function bonus(m,key,channel,id,value,remove=false){put({modifiers:key==='ground_defenses_mod'?m.groundDefenses:m.economyBonuses[key]},channel,id,value,remove);}
export function originalMilitaryPatrolCounts(industryId,marketSize){
 const s=spec(industryId);size(marketSize);let light=2,medium=0,heavy=0;
 if(!s.patrol){if(marketSize===5){medium=1;}else if(marketSize===6){light=3;medium=1;}else if(marketSize===7){light=3;medium=2;}else if(marketSize===8){light=3;medium=3;}else if(marketSize>=9){light=4;medium=3;}}
 if(s.military||s.command){medium=Math.max(medium+1,Math.trunc(marketSize/2)-1);heavy=Math.max(heavy,medium-1);}
 if(s.command){medium++;heavy++;}return {light,medium,heavy};
}
export function unapplyOriginalMilitaryBase(m,e){
 validate(m,e);const id='ind_'+e.state.industryId;
 bonus(m,'combat_fleet_size_mult','mult',id,0,true);
 for(const key of ['patrol_num_medium_mod','patrol_num_heavy_mod'])bonus(m,key,'flat','mil_base_improve',0,true);
 if(e.modifiers.specialItemId===I.id)bonus(m,'combat_fleet_size_mult','flat',I.id,0,true);
 for(const key of ['$patrol','$military'])setOriginalMemoryFlagWithReason(m.military.memory,key,id,false,-1);
 put(m.stability,'flat',id,0,true);
 for(const key of keys.slice(0,3))bonus(m,key,'flat',id,0,true);
 bonus(m,'ground_defenses_mod','mult',id,0,true);bonus(m,'officer_prob','flat',id+'_0',0,true);
}
function applyBase(m,e,s){
 const id='ind_'+e.state.industryId;
 if(e.modifiers.aiCoreId==='alpha_core')bonus(m,'combat_fleet_size_mult','mult',id,f(1+C.ALPHA_CORE_BONUS));
 else if(e.modifiers.aiCoreId===null)bonus(m,'combat_fleet_size_mult','mult',id,0,true);
 if(e.modifiers.improved)bonus(m,s.patrol?'patrol_num_medium_mod':'patrol_num_heavy_mod','flat','mil_base_improve',C.IMPROVE_NUM_PATROLS_BONUS);
 else for(const key of ['patrol_num_medium_mod','patrol_num_heavy_mod'])bonus(m,key,'flat','mil_base_improve',0,true);
 if(e.modifiers.specialItemId===I.id){
  check(Array.isArray(m.conditions),'Actual current market conditions required for military item');const ids=m.conditions.map(c=>c.id);
  const unmet=originalMilitaryItemRequirements(e.state.industryId,I.id,ids);
  // Native checks hot before very_hot, even when both exist; effect is FLAT, not MULT.
  const condition=Object.keys(I.conditionBonuses).find(id=>ids.includes(id));
  bonus(m,'combat_fleet_size_mult','flat',I.id,condition?I.conditionBonuses[condition]:0,unmet.length>0);
 }
}
function maxDeficit(e,ids,readAvailable){let deficit=0,commodityId=null;for(const id of ids){const demand=Math.trunc(stat(get(e.state,'demand',id))),available=readAvailable(id);check(Number.isInteger(available)&&available>=0&&available<=2147483647,'Actual lazy commodity availability required');const next=Math.max(demand-available,0);if(next>deficit){deficit=next;commodityId=id;}}return {commodityId,deficit};}
export function applyOriginalMilitaryBase(m,e,runtime){
 const s=validate(m,e),id='ind_'+e.state.industryId;
 check(typeof runtime.applyFinances==='function'&&typeof runtime.readCommodityAvailable==='function','Actual military finance/lazy getter runtime required');
 // Installed military items affect market fleet size only, not commodity bonuses.
 updateBonuses(e.state,{...e.modifiers,specialItemId:null},{alphaSupplyBonus:false,improvementSupplyBonus:false});
 let finance=null;const finances=()=>{finance=runtime.applyFinances();check(finance&&!finance.then,'Military finance callback must be synchronous');};
 if(!s.patrol)finances();applyBase(m,e,s);if(s.patrol)finances();
 const patrols=originalMilitaryPatrolCounts(e.state.industryId,m.size);for(const kind of ['light','medium','heavy'])bonus(m,'patrol_num_'+kind+'_mod','flat',id,patrols[kind]);
 const extra=s.patrol?0:s.military?2:s.command?3:0;
 for(const commodity of ['supplies','fuel','ships'])quantity(e.state,'demand',id+'_0',commodity,m.size-1+extra);
 quantity(e.state,'supply',id+'_0','crew',m.size);if(!s.patrol)quantity(e.state,'supply',id+'_0','marines',m.size);
 const stabilityDeficit=maxDeficit(e,['supplies','fuel','ships'],runtime.readCommodityAvailable),base=s.patrol?1:2,stabilityBonus=base-Math.min(base,stabilityDeficit.deficit);if(stabilityBonus>0)put(m.stability,'flat',id,stabilityBonus);
 const defenseDeficit=maxDeficit(e,['supplies'],runtime.readCommodityAvailable);let deficit=f(defenseDeficit.deficit),demand=f(Math.floor(stat(get(e.state,'demand','supplies'))+0.5));if(demand<1){demand=1;deficit=0;}
 const deficitMult=Math.max(0,Math.min(1,f(f(demand-deficit)/demand))),descriptionDeficit=deficitMult!==1?maxDeficit(e,['supplies'],runtime.readCommodityAvailable):null;
 const defenseBonus=s.patrol?C.DEFENSE_BONUS_PATROL:s.command?C.DEFENSE_BONUS_COMMAND:C.DEFENSE_BONUS_MILITARY;
 const defenseMultiplier=f(1+f(defenseBonus*deficitMult));bonus(m,'ground_defenses_mod','mult',id,defenseMultiplier);
 setOriginalMemoryFlagWithReason(m.military.memory,'$patrol',id,true,-1);if(s.military||s.command)setOriginalMemoryFlagWithReason(m.military.memory,'$military',id,true,-1);
 const officerProbability=s.military?C.OFFICER_PROB_MOD_MILITARY_BASE:s.command?C.OFFICER_PROB_MOD_HIGH_COMMAND:C.OFFICER_PROB_MOD_PATROL_HQ;
 bonus(m,'officer_prob','flat',id+'_0',officerProbability);const operating=functional(e.operating);if(!operating){e.state.supply={};unapplyOriginalMilitaryBase(m,e);}
 return immutableJSON({scope:'military-industry-apply-effects-not-fleet-spawning',industryId:e.state.industryId,operating,patrols,stabilityDeficit,defenseDeficit,descriptionDeficit,deficitMult,defenseMultiplier,officerProbability,finance});
}
