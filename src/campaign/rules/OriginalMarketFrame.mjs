/** Market.advance and Economy's paused-condition branch; plugin dependencies are never silently skipped. */
import {requireThat} from '../core/Values.mjs';
import conditions from '../data/reference-condition-phase.json' with {type:'json'};
import {resolveOriginalEconomyMutable,ORIGINAL_MARKET_ECONOMY,originalEconomyTradeLevel} from './OriginalMarketEconomy.mjs';
import {createOriginalCommodityPriceCalculators} from './OriginalCommodityClassPricing.mjs';
import {validateOriginalCampaignMemory} from './OriginalCampaignMemory.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_MARKET_FRAME',m);
const number=v=>{check(typeof v==='number'&&Number.isFinite(v)&&Number.isFinite(f(v)),'Actual finite market frame float required');return f(v);};
const call=(s,name,...args)=>{check(typeof s?.[name]==='function','Actual market frame service required: '+name);const value=s[name](...args);check(!value||typeof value.then!=='function','Market services must be synchronous: '+name);return value;};
const list=v=>{check(Array.isArray(v),'Actual market roster required');return v;};
function liveEach(values,visit){const initial=[...list(values)];let cursor=0;while(cursor!==values.length){check(values.length===initial.length&&values.every((v,i)=>v===initial[i]),'Native live market roster modified during iteration');visit(values[cursor++]);}}
export function validateOriginalTemporaryStat(stat,temporary){
 resolveOriginalEconomyMutable(stat);check(Array.isArray(temporary),'Actual temporary modifier roster required');const ids=new Set();
 for(const mod of temporary){check(mod&&typeof mod.id==='string'&&mod.id.length>0&&!ids.has(mod.id)&&number(mod.timeRemaining)===mod.timeRemaining,'Invalid saved temporary modifier');ids.add(mod.id);}return temporary;
}
/** MutableStatWithTempMods.advance: a timer expiring removes ALL modifier channels for its source. */
export function advanceOriginalTemporaryStat(stat,temporary,days){
 days=number(days);check(days>=0,'Negative temporary-stat frame');validateOriginalTemporaryStat(stat,temporary);
 for(let i=0;i<temporary.length;){const mod=temporary[i];mod.timeRemaining=f(mod.timeRemaining-days);if(mod.timeRemaining<=0){temporary.splice(i,1);for(const channel of ['flat','percent','mult']){const values=stat.modifiers[channel],at=values.findIndex(v=>v.id===mod.id);if(at>=0)values.splice(at,1);}}else i++;}
}
export function advanceOriginalMarketCommodity(commodity,days){
 for(const key of ['available','tradeMod','tradeModPlus','tradeModMinus'])advanceOriginalTemporaryStat(commodity[key],commodity.temporary[key],days);
 const available=commodity.available,mods=available.modifiers.flat,at=mods.findIndex(m=>m.id==='eMod');if(at>=0)mods.splice(at,1);
 const trade={both:resolveOriginalEconomyMutable(commodity.tradeMod),plus:resolveOriginalEconomyMutable(commodity.tradeModPlus),minus:resolveOriginalEconomyMutable(commodity.tradeModMinus)};if(f(f(trade.both+Math.max(trade.plus,0))+Math.min(trade.minus,0))===0)return;
 const spec=ORIGINAL_MARKET_ECONOMY.commodities[commodity.commodityId];check(spec,'Actual commodity specification required');const level=originalEconomyTradeLevel(resolveOriginalEconomyMutable(available),spec.econUnit,trade);
 if(level!==0)mods.push({id:'eMod',value:level});
}
/** updateCalc does NOT change stockpiles, player modifiers, price thresholds or month-end history. */
export function updateOriginalMarketPriceCalculators(market){
 for(const commodity of Object.values(market.commodities)){check(commodity.demandPrice&&commodity.supplyPrice,'Actual initialized commodity price calculators required');const computed=createOriginalCommodityPriceCalculators({commodityId:commodity.commodityId,demandStat:commodity.demand.state,greedStat:commodity.greed,fromSaved:true});for(const side of ['demandPrice','supplyPrice'])for(const key of ['basePrice','variability','demand'])commodity[side][key]=computed[side][key];}
}
const noFrameClasses=new Set(['BaseHazardCondition','DecivilizedSubpop','Population','LCAttractorLow','LCAttractorMedium','LCAttractorHigh','Habitable','Pollution','ResourceDepositsCondition','LuddicMajority','WorldIce','WorldArid','WorldBarrenMarginal','WorldTundra','MildClimate','LowGravity','HighGravity','SolarArray','LuddicPathCells']);
function conditionClass(binding){const cls=conditions.conditions[binding?.condition?.id]?.className;check(typeof cls==='string','Actual supported condition plugin required');return cls;}
/** All catalogued classes were checked through their native inheritance chain; only FreeMarket opts in. */
export function originalMarketConditionRunsWhilePaused(binding){return conditionClass(binding)==='FreeMarket';}
export function advanceOriginalMarketCondition(market,binding,seconds,days,services){
 seconds=number(seconds);days=number(days);const cls=conditionClass(binding);if(noFrameClasses.has(cls))return;
 check(cls==='FreeMarket','Condition requires its real non-base advance: '+cls);check(typeof market.hasSpaceport==='boolean','Actual hasSpaceport field required');
 if(!market.hasSpaceport){call(services,'removeSpecificCondition',market,binding);market.freePort=false;return;}
 if(seconds<=0)return;check(binding.pluginState&&number(binding.pluginState.daysActive)===binding.pluginState.daysActive,'Actual FreeMarket.daysActive required');binding.pluginState.daysActive=f(binding.pluginState.daysActive+days);
}
/** Explicit current/new frame fields; never inferred from an incomplete historical economic capture. */
export function createOriginalMarketFrame(market,daysInExistence,memory,submarkets){const state={scope:'native-market-frame',marketRef:market.objectRef,daysInExistence:number(daysInExistence),memory,submarkets:[...submarkets]};return validateOriginalMarketFrame(state,market);}
export function validateOriginalMarketFrame(state,market){
 check(state?.scope==='native-market-frame'&&Object.keys(state).every(k=>['scope','marketRef','daysInExistence','memory','submarkets'].includes(k))&&state.marketRef===market.objectRef&&number(state.daysInExistence)===state.daysInExistence,'Actual bound Market frame state required');
 if(state.memory!==null)validateOriginalCampaignMemory(state.memory);list(state.submarkets);check(new Set(state.submarkets).size===state.submarkets.length&&state.submarkets.every(v=>v&&typeof v.objectRef==='string'),'Actual ordered distinct submarkets required');return state;
}
export function advanceOriginalPausedMarketConditions(markets,seconds,skipMarketAdvance,services){
 seconds=number(seconds);check(seconds>=0&&typeof skipMarketAdvance==='boolean','Actual paused economy frame flags required');if(skipMarketAdvance)return;
 for(const market of [...list(markets)])for(const binding of [...list(call(services,'readConditions',market))]){const runs=call(services,'conditionRunsWhilePaused',binding);check(typeof runs==='boolean','Actual condition pause behavior required');if(runs)call(services,'advanceCondition',market,binding,seconds);}
}
/** Complete native order. Missing nonempty plugin/queue stages throw; caller must discard a failed draft. */
export function advanceOriginalMarketFrame(market,state,seconds,days,services){
 validateOriginalMarketFrame(state,market);seconds=number(seconds);days=number(days);check(seconds>=0&&days>=0,'Negative market frame');
 state.daysInExistence=f(state.daysInExistence+days);advanceOriginalTemporaryStat(market.stability,market.stabilityTemporary,days);
 const stability=Math.floor(Math.min(10,Math.max(0,resolveOriginalEconomyMutable(market.stability)))+.5);
 if(stability!==market.previousStability){market.previousStability=stability;call(services,'reapplyConditions',market);call(services,'reapplyIndustries',market);updateOriginalMarketPriceCalculators(market);}
 for(const binding of [...list(call(services,'readConditions',market))])call(services,'advanceCondition',market,binding,seconds);
 // These native rosters are live, unlike the condition and industry snapshots.
 liveEach(state.submarkets,submarket=>call(services,'advanceSubmarket',market,submarket,seconds));
 if(state.memory!==null)call(services,'advanceMarketMemory',market,state.memory,seconds);
 const people=call(services,'readMarketPeople',market);if(people!==null)liveEach(people,person=>call(services,'advanceMarketPerson',person,seconds));
 if(list(market.constructionQueue).length){const building=call(services,'readCurrentlyBeingConstructed',market);check(building===null||market.industries.includes(building),'Actual currently constructed industry required');if(building===null)call(services,'buildNextInQueue',market);}
 for(const commodity of Object.values(market.commodities))advanceOriginalMarketCommodity(commodity,days);
 for(const industry of [...list(market.industries)])call(services,'advanceIndustry',market,industry,seconds);
}
