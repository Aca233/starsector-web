/** Actual civic apply order. Population is supported only WITHOUT a special item/lamp. */
import {requireThat} from '../core/Values.mjs';
import {stat,put,get,quantity,updateBonuses,functional,size} from './OriginalIndustryState.mjs';
import {applyOriginalGroundDefenseBaseEffects,applyOriginalGroundDefenseEffects,unapplyOriginalGroundDefenseEffects,isSupportedOriginalGroundDefenseItem} from './OriginalGroundDefenses.mjs';
import {applyOriginalPortItemAccessibility,isSupportedOriginalPortItem} from './OriginalPortItems.mjs';
import access from '../data/reference-market-accessibility.json' with {type:'json'};
import finances from '../data/reference-market-finance.json' with {type:'json'};
import stabilityReference from '../data/reference-market-stability.json' with {type:'json'};
import {applyOriginalPopulationDynamicEffects,unapplyOriginalPopulationDynamicEffects} from './OriginalPopulationIndustryEffects.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_CIVIC_EFFECTS',m),port=id=>['spaceport','megaport'].includes(id);
export const hasOriginalCivicFrame=id=>['population','spaceport','megaport','grounddefenses','heavybatteries'].includes(id);
export const hasOriginalCivicEffects=id=>hasOriginalCivicFrame(id);
function validate(m,row){const id=row.entry.state.industryId;check(hasOriginalCivicEffects(id),'Actual supported civic plugin required');const item=row.entry.modifiers.specialItemId;
 if(id==='population')check(item===null&&row.special===null,'Population special items/lamp are not implemented');
 else check(item===null||(port(id)?isSupportedOriginalPortItem(id,item):isSupportedOriginalGroundDefenseItem(id,item)),'Unknown civic installed item');
 check(m.economyBonuses?.officer_prob&&m.immigrationModifiers,'Actual shared civic market effects required');
 if(id==='population')check(Array.isArray(m.conditions)&&m.incomeMult&&m.upkeepMult&&m.maxIndustries&&['flat','percent','mult'].every(channel=>Array.isArray(m.maxIndustries[channel])),'Actual population conditions/income/upkeep/maxIndustries bonus required');
 return id;
}
function immigration(m,row,add){const list=m.immigrationModifiers.transient,index=list.findIndex(x=>x.objectRef===row.objectRef);if(!add){if(index>=0)list.splice(index,1);}else if(index<0)list.push({kind:'industry',id:row.entry.state.industryId,objectRef:row.objectRef});}
function portItem(m,row,action,context){const id=row.entry.modifiers.specialItemId;if(id===null)return;const result=applyOriginalPortItemAccessibility({industryId:row.entry.state.industryId,itemId:id,action,context:action==='apply'?context:null,accessibility:m.accessibility});for(const key of ['flat','percent','mult'])m.accessibility[key].splice(0,m.accessibility[key].length,...structuredClone(result.accessibility[key]));}
const erase=(target,channel,id)=>put(target,channel,id,0,true);
const hasCondition=(m,id)=>m.conditions.some(condition=>condition.id===id);
function unapplyPopulation(m,row){
 const prefix='ind_population',modId=prefix+'_3';
 // BaseIndustry.unapply: no-AI callback is empty; temporarily unimproved callback,
 // then Base transient removal. No supply/demand/finance reset belongs here.
 erase(m.stability,'flat','PAI_improve');immigration(m,row,false);
 for(const n of [0,1,2])for(const channel of ['flat','percent','mult'])erase(m.stability,channel,prefix+'_'+n);
 for(const n of [0,1])erase({modifiers:m.accessibility},'flat',prefix+'_'+n);
 unapplyOriginalPopulationDynamicEffects(m);
 // PopulationAndInfrastructure.unmodifyStability:383–393, exact channels/ids.
 erase(m.incomeMult,'mult',modId);erase(m.upkeepMult,'mult',modId);erase(m.upkeepMult,'mult',modId+'ifi');
 for(const id of [modId,'_'+modId+'_mm','_'+modId+'_ms','_'+modId+'_overmax'])erase(m.stability,'flat',id);
 // CommRelayCondition.java:15. Do not remove a real relay condition's modifier.
 if(!hasCondition(m,'comm_relay'))erase(m.stability,'flat','core_comm_relay');
 immigration(m,row,false);
}
function populationDeficit(entry,ids,runtime,reads){
 let deficit=0,commodityId=null;
 for(const id of ids){
  // BaseIndustry.getMaxDeficit:733–734: demand BEFORE actual lazy availability.
  const demand=Math.trunc(stat(get(entry.state,'demand',id))),available=runtime.readCommodityAvailable(id);
  check(Number.isInteger(available)&&available>=0&&available<=2147483647,'Actual synchronous population commodity availability required');
  const next=Math.max(demand-available,0);if(next>deficit){deficit=next;commodityId=id;}
 }
 const result={commodityIds:[...ids],commodityId,deficit};reads.push(result);return result;
}
function refreshAdministratorInputs(entry,runtime){
 if(runtime.readAdministratorIndustryInputs===undefined)return;
 check(typeof runtime.readAdministratorIndustryInputs==='function','Actual synchronous administrator input service required');
 const inputs=runtime.readAdministratorIndustryInputs();
 check(inputs&&typeof inputs==='object'&&!inputs.then,'Actual synchronous administrator inputs required');
 // Validate both before changing the shared modifier record. The direct helper
 // without a service retains its supplied inputs; the live Runtime supplies one.
 for(const key of ['adminSupplyBonus','adminDemandReduction'])check(Number.isFinite(inputs[key])&&inputs[key]===f(inputs[key])&&inputs[key]>=-65536&&inputs[key]<=65536,'Actual native administrator float required: '+key);
 entry.modifiers.adminSupplyBonus=inputs.adminSupplyBonus;
 entry.modifiers.adminDemandReduction=inputs.adminDemandReduction;
}
function applyPopulation(m,row,runtime){
 const p=runtime.population,entry=row.entry,state=entry.state,prefix='ind_population';
 check(p&&typeof p.modifyStability==='function'&&p.dynamic&&typeof p.readIndustryCount==='function'&&typeof p.isSpaceportFirstInQueue==='function','Actual population stability/dynamic/industry-count/queue services required');
 check(typeof runtime.applyFinances==='function'&&typeof runtime.readCommodityAvailable==='function','Actual population finance/lazy commodity services required');
 // Population.java:64 then BaseIndustry.apply(true):182–200. No pre-read of
 // current size, demands, commodity availability, or ship doctrine is allowed.
 const stability=p.modifyStability();check(stability&&typeof stability==='object'&&!stability.then,'Actual synchronous population stability result required');
 // BaseIndustry.java:1385–1391 reads the CURRENT administrator only after the
 // preceding population stability/lazy-network phase, never before entering apply.
 refreshAdministratorInputs(entry,runtime);
 // updateBonuses is a shared kernel; preserve this live plugin's original stat
 // handles/channel arrays while copying its rebuilt contents back before finance.
 const supplyBonus=state.supplyBonus,demandReduction=state.demandReduction;
 updateBonuses(state,entry.modifiers,{alphaSupplyBonus:true,improvementSupplyBonus:false});
 for(const [target,next] of [[supplyBonus,state.supplyBonus],[demandReduction,state.demandReduction]])for(const channel of ['flat','percent','mult'])target.modifiers[channel].splice(0,target.modifiers[channel].length,...next.modifiers[channel]);
 state.supplyBonus=supplyBonus;state.demandReduction=demandReduction;
 const finance=runtime.applyFinances();check(finance&&!finance.then,'Actual synchronous population base finance required');
 put(m.stability,'flat','PAI_improve',f(stabilityReference.population.IMPROVE_STABILITY_BONUS),!entry.modifiers.improved);
 immigration(m,row,true); // Base registration precedes the commodity getters.
 const n=m.size;size(n);
 quantity(state,'demand',prefix+'_0','food',n);
 if(!hasCondition(m,'habitable'))quantity(state,'demand',prefix+'_0','organics',n-1);
 for(const [id,amount] of [['domestic_goods',n-1],['luxury_goods',n-3],['drugs',n-2],['organs',n-3],['supplies',Math.min(n,3)]])quantity(state,'demand',prefix+'_0',id,amount);
 for(const [id,amount] of [['crew',n-3],['drugs',n-4],['organs',n-5]])quantity(state,'supply',prefix+'_0',id,amount);
 const deficitReads=[];
 const domestic=populationDeficit(entry,['domestic_goods'],runtime,deficitReads);
 put(m.stability,'flat',prefix+'_0',1,domestic.deficit>0);
 const luxury=populationDeficit(entry,['luxury_goods'],runtime,deficitReads);
 put(m.stability,'flat',prefix+'_1',1,luxury.deficit>0||n<=3);
 let food=populationDeficit(entry,['food'],runtime,deficitReads);
 // The first food scan is NOT elided when non-habitable: a lazy read can mutate
 // real state before the second food+organics scan and its demand reads.
 if(!hasCondition(m,'habitable'))food=populationDeficit(entry,['food','organics'],runtime,deficitReads);
 put(m.stability,'flat',prefix+'_2',f(-food.deficit),food.deficit<=0);
 // Service returns the effective Java flag, including no current construction.
 const spaceportFirst=p.isSpaceportFirstInQueue();check(typeof spaceportFirst==='boolean','Actual synchronous effective queue-spaceport flag required');
 if(!m.hasSpaceport&&!spaceportFirst)put({modifiers:m.accessibility},'flat',prefix+'_0',f(access.settings.accessibilityNoSpaceport));
 const sizeBonus=f(access.populationSizeBonus[n]);if(sizeBonus>0)put({modifiers:m.accessibility},'flat',prefix+'_1',sizeBonus);
 // Intentionally no else-unmodify above: Java clears those in unapply, not apply.
 applyOriginalPopulationDynamicEffects(m,p.dynamic);
 // modifyStability2: read count AFTER dynamic (and its ships lazy getter), then
 // compute the effective shared EconomyBonus, not the population's bare table.
 const industryCount=p.readIndustryCount();check(Number.isInteger(industryCount)&&industryCount>=0&&industryCount<=2147483647,'Actual synchronous Misc.getNumIndustries count required');
 const maxIndustries=Math.floor(stat({base:0,modifiers:m.maxIndustries})+0.5);
 put(m.stability,'flat','_'+prefix+'_3_overmax',f(-stabilityReference.settings.overMaxIndustriesPenalty),industryCount<=maxIndustries);
 immigration(m,row,true); // Native Population's second, idempotent registration.
 // Population has no isFunctional supply.clear()/unapply branch here.
 // Keep the established live-pass population result (modifyStability diagnostics)
 // intact; the richer apply diagnostics must not masquerade as that older shape.
 return {finance,portDeficit:null,defense:null,population:stability,populationEffects:{deficitReads,industryCount,maxIndustries}};
}

export function unapplyOriginalCivicItem(m,row){const id=validate(m,row);if(port(id))portItem(m,row,'unapply',null);else if(row.entry.modifiers.specialItemId!==null)put({modifiers:m.groundDefenses},'mult',row.entry.modifiers.specialItemId,0,true);}
export function unapplyOriginalCivicIndustry(m,row){const id=validate(m,row),prefix='ind_'+id;if(id==='population'){unapplyPopulation(m,row);return;}if(!port(id)){unapplyOriginalGroundDefenseEffects(m,row.entry);return;}
 put({modifiers:m.accessibility},'flat',prefix+'_2',0,true);put({modifiers:m.accessibility},'flat','spaceport_improve',0,true);immigration(m,row,false);portItem(m,row,'unapply',null);m.hasSpaceport=false;
 for(const n of [0,1,2])put({modifiers:m.accessibility},'flat',prefix+'_'+n,0,true);put({modifiers:m.economyBonuses.officer_prob},'flat',prefix+'_0',0,true);
}
export function applyOriginalLiveCivicIndustry(m,row,runtime){
 const id=validate(m,row);if(id==='population')return applyPopulation(m,row,runtime);
 const entry=row.entry,prefix='ind_'+id,state=entry.state,n=m.size;
 refreshAdministratorInputs(entry,runtime);
 updateBonuses(state,{...entry.modifiers,specialItemId:null},{alphaSupplyBonus:false,improvementSupplyBonus:false});
 const finance=runtime.applyFinances();check(finance&&!finance.then,'Actual synchronous civic base finance required');
 if(port(id)){
  if(entry.modifiers.aiCoreId==='alpha_core')put({modifiers:m.accessibility},'flat',prefix+'_2',f(access.portSettings.ALPHA_CORE_ACCESSIBILITY));else if(entry.modifiers.aiCoreId===null)put({modifiers:m.accessibility},'flat',prefix+'_2',0,true);
  put({modifiers:m.accessibility},'flat','spaceport_improve',f(access.portSettings.IMPROVE_ACCESSIBILITY),!entry.modifiers.improved);immigration(m,row,true);portItem(m,row,'apply',runtime.portItemContext);
  const extra=id==='megaport'?2:0;for(const c of ['fuel','supplies','ships'])quantity(state,'demand',prefix+'_0',c,n-2+extra);quantity(state,'supply',prefix+'_0','crew',n-1+extra);
  let deficit=0,commodityId=null;for(const c of ['fuel','supplies','ships']){const available=runtime.readCommodityAvailable(c);check(Number.isInteger(available)&&available>=0&&available<=2147483647,'Actual lazy port availability required');const next=Math.max(0,Math.trunc(stat(get(state,'demand',c)))-available);if(next>deficit){deficit=next;commodityId=c;}}
  put(row.finances.upkeep,'mult','deficit',f(1+f(f(deficit)*f(finances.settings.UPKEEP_MULT_PER_DEFICIT))),deficit<=0);
  m.hasSpaceport=true;put({modifiers:m.accessibility},'flat',prefix+'_0',f(access.portSettings[id==='megaport'?'MEGAPORT_ACCESSIBILITY':'BASE_ACCESSIBILITY']));
  // Spaceport.java:24–25,65: independent of military/population officer modifiers.
  put({modifiers:m.economyBonuses.officer_prob},'flat',prefix+'_0',f(id==='megaport'?0.2:0.1));
  if(!functional(entry.operating)){state.supply={};unapplyOriginalCivicIndustry(m,row);m.hasSpaceport=true;}
  return {finance,portDeficit:{commodityId,deficit},defense:null};
 }
 applyOriginalGroundDefenseBaseEffects(m,entry);for(const c of ['supplies','marines'])quantity(state,'demand',prefix+'_0',c,n);quantity(state,'demand',prefix+'_0','hand_weapons',n-2);
 return {finance,portDeficit:null,defense:applyOriginalGroundDefenseEffects(m,entry,runtime.readCommodityAvailable)};
}
