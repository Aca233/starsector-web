import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { CampaignError } from '../src/campaign/core/Values.mjs';
import { ORIGINAL_SPECIAL_INDUSTRIES as R, newOriginalSpecialIndustry as fresh, applyOriginalSpecialIndustry as apply, originalSpecialIndustryOutput as output } from '../src/campaign/rules/OriginalSpecialIndustries.mjs';
import { reapplyOriginalIndustryCommodityPass as pass } from '../src/campaign/rules/OriginalIndustryCommodityPass.mjs';
import { newOriginalIndustryFinances, updateOriginalIndustryFinances, reapplyOriginalColonyFinancialPass } from '../src/campaign/rules/OriginalMarketFinance.mjs';
import { reapplyOriginalColonyEnvironment } from '../src/campaign/rules/OriginalColonyEnvironment.mjs';
import { nativeSpecialOracle } from './campaign-special-native-oracle.mjs';
const bonus=()=>({flat:[],percent:[],mult:[]}),stat=(base=0)=>({base,modifiers:bonus()}),mod=(id,value)=>({id,value});
const operating=(x={})=>({disrupted:false,building:false,upgradeId:null,...x});
const modifiers=(x={})=>({aiCoreId:null,improved:false,adminSupplyBonus:0,adminDemandReduction:0,supplyBonusFromOther:stat(),demandReductionFromOther:stat(),specialItemId:null,...x});
const required=id=>id==='lionsguard'?['hand_weapons']:id==='cryosanctum'?['organics','supplies']:[];
const input=(id,x={})=>({state:fresh(id),marketSize:6,operating:operating(),modifiers:modifiers(),available:Object.fromEntries(required(id).map(c=>[c,99])),factionId:'sindrian_diktat',techMiningMult:stat(1),...x});
const value=(r,c,channel='supply')=>output(r.state,{commodityId:c,illegal:false})[channel];
const rejects=fn=>assert.throws(fn,e=>e instanceof CampaignError);
const financial=(id,x={})=>({state:newOriginalIndustryFinances(id),marketSize:6,phase:'industry-apply',marketIncomeMult:1,marketUpkeepMult:1,operating:operating(),aiCoreId:null,specialItemId:null,portInputs:null,specialContext:{factionId:'sindrian_diktat',conditionIds:[]},...x});
test('special industry catalogue pins 12 original files and four real plugin classes',()=>{const r=spawnSync(process.execPath,['scripts/import-campaign-special-industries.mjs','--check'],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(Object.keys(R.sources).length,12);assert.equal(Object.keys(R.industries).length,4);assert.equal(R.industries.commerce.savedClassAlias,'TradeCenter2');});
test('lionsguard preserves demands but only functions for Sindrian Diktat; arms deficit affects marines not crew',()=>{
 const r=apply(input('lionsguard',{available:{hand_weapons:2}}));assert.equal(value(r,'marines'),2);assert.equal(value(r,'crew'),6);assert.equal(value(r,'ships','demand'),5);assert.equal(output(r.state,{commodityId:'marines',illegal:true}).supplyLegal,true);
 for(const factionId of ['player','independent']){const no=apply(input('lionsguard',{factionId}));assert.deepEqual(no.state.supply,{});assert.equal(value(no,'ships','demand'),5);}
});
test('cryosanctum keeps original shortage-driven +1 output (also confirmed against actual jar bytecode)',()=>{
 for(const marketSize of [0,3,6,10]){const full=apply(input('cryosanctum',{marketSize})),short=apply(input('cryosanctum',{marketSize,available:{organics:0,supplies:99}}));assert.equal(value(full,'organs'),6);assert.equal(value(short,'organs'),7);assert.equal(value(short,'supplies','demand'),3);}
 const r=apply(input('cryosanctum',{modifiers:modifiers({aiCoreId:'alpha_core',improved:true}),available:{organics:0,supplies:0}}));assert.equal(value(r,'organs'),8);assert.equal(value(r,'organics','demand'),2);
});
test('techmining retains alpha find multiplier across beta/gamma because unapply does not invoke Base',()=>{
 let r=apply(input('techmining',{modifiers:modifiers({aiCoreId:'alpha_core',improved:true})}));assert.deepEqual(r.techMiningMult.modifiers.mult,[mod('ind_techmining_0',1.25),mod('ind_techmining_1',1.25)]);assert.equal(r.state.supplyBonus.modifiers.flat.length,0);
 for(const aiCoreId of ['beta_core','gamma_core']){r=apply(input('techmining',{...r,modifiers:modifiers({aiCoreId})}));assert.deepEqual(r.techMiningMult.modifiers.mult,[mod('ind_techmining_0',1.25)]);}
 r=apply(input('techmining',{...r}));assert.deepEqual(r.techMiningMult.modifiers.mult,[]);
});
test('commerce does not erase existing commodity maps while disabled; unsupported fields cannot be treated as empty state',()=>{
 const state=structuredClone(fresh('commerce'));state.supply.fuel=stat(2);state.demand.supplies=stat(1);const p=input('commerce',{state,operating:operating({disrupted:true}),modifiers:modifiers({specialItemId:'dealmaker_holosuite'})});const before=structuredClone(p),r=apply(p);assert.deepEqual(p,before);assert.equal(value(r,'fuel'),2);assert.equal(value(r,'supplies','demand'),1);assert.ok(Object.isFrozen(r.state));
 for(const x of [{factionId:null},{available:{ore:0}},{techMiningMult:undefined},{modifiers:modifiers({specialItemId:'synchrotron'})}])rejects(()=>apply(input('commerce',x)));rejects(()=>fresh('toString'));
});
test('special financial overrides preserve fixed cryo size, prioritized ruin size, and direct income-refresh semantics',()=>{
 assert.equal(updateOriginalIndustryFinances(financial('cryosanctum',{marketSize:2})).diagnostics.usedSize,6);assert.equal(updateOriginalIndustryFinances(financial('cryosanctum',{marketSize:2,phase:'income-refresh'})).diagnostics.usedSize,2);
 for(const [conditions,n] of [[[],0],[['ruins_scattered'],1],[['ruins_widespread'],2],[['ruins_extensive'],3],[['ruins_vast','ruins_scattered'],4]])assert.equal(updateOriginalIndustryFinances(financial('techmining',{specialContext:{factionId:'player',conditionIds:conditions}})).diagnostics.usedSize,n);
 const bad=financial('lionsguard');delete bad.specialContext;rejects(()=>updateOriginalIndustryFinances(bad));
});
function localInput(ids=['commerce','lionsguard','cryosanctum','techmining']){
 const commodities=['heavy_machinery','hand_weapons','supplies','fuel','ships','organics','organs','crew','marines'];
 return {commodityPass:{marketSize:6,freePort:false,factionIllegalCommodityIds:[],conditions:[],industries:ids.map(id=>({state:fresh(id),operating:operating(),modifiers:modifiers()})),available:Object.fromEntries([...new Set(['heavy_machinery',...ids.flatMap(required)])].map(c=>[c,20])),commodities:commodities.map(commodityId=>({commodityId,previousSupplyLegal:true,previousDemandLegal:true})),special:{factionId:'sindrian_diktat',techMiningMult:stat(1)}},stability:stat(),incomeMult:stat(1),upkeepMult:stat(1),maxIndustries:bonus(),previousStability:5,hazard:1,governance:{marketId:'m',markets:[{marketId:'m',playerOwned:false,adminIsPlayer:false}],maxOutposts:2},constructionQueue:[],conditionStateByModId:{},marketCommodities:commodities.map(commodityId=>({commodityId,maxDemand:0,maxSupply:0,available:20,shippingFaction:0,maxExportFaction:0}))};
}
test('commerce income refresh sees pre-reapply multiplier; subsequent industries see its bonuses and disabled commerce removes them',()=>{
 const local=localInput(),entry=local.commodityPass.industries[0];entry.modifiers=modifiers({aiCoreId:'alpha_core',improved:true,specialItemId:'dealmaker_holosuite'});
 const run=l=>reapplyOriginalColonyFinancialPass({local:l,industryFinances:l.commodityPass.industries.map(e=>newOriginalIndustryFinances(e.state.industryId))});const r=run(local);assert.equal(r.localEffects.diagnostics.industryFinancialInputs[0].incomeMult,1);assert.equal(r.localEffects.diagnostics.industryFinancialInputs[1].incomeMult,2.25);assert.equal(r.localEffects.values.rawStability,-1);assert.equal(r.localEffects.diagnostics.industryCount,2);
 const next=structuredClone(local);next.commodityPass.industries=structuredClone(r.localEffects.commodityEffects.industries);next.incomeMult=r.localEffects.incomeMult;next.stability=r.localEffects.stability;next.commodityPass.industries[0].operating.disrupted=true;const stopped=run(next);assert.equal(stopped.localEffects.values.incomeMult,1);assert.equal(stopped.localEffects.values.rawStability,2);
 const noFaction=structuredClone(local);delete noFaction.commodityPass.special;rejects(()=>pass(noFaction.commodityPass));
});
test('trade-center immigration callback is removed on disruption while tech-mining callback remains',()=>{
 for(const disrupted of [false,true]){const e=reapplyOriginalColonyEnvironment({hazard:stat(1),modifiers:{permanent:[],transient:[]},conditions:[],industries:['commerce','techmining'].map(industryId=>({industryId,operating:operating({disrupted})}))});assert.deepEqual(e.modifiers.transient.map(m=>m.id),disrupted?['techmining']:['commerce','techmining']);}
});
test('1056 native Java special-industry snapshots match full supply/demand maps, modifier histories, functionality and tech multipliers',()=>{
 const vectors=Object.entries(R.industries).flatMap(([id,d])=>Array.from({length:11},(_,size)=>Array.from({length:6},(_,seed)=>({id,className:d.className,size,seed:seed+size*6,core:[null,'alpha_core','beta_core','gamma_core'][seed%4],improved:seed%2===0,factionId:seed%2?'independent':'sindrian_diktat'})))).flat();
 const results=nativeSpecialOracle(vectors);assert.equal(results.length,1056);
 vectors.forEach((v,index)=>{let state=structuredClone(fresh(v.id)),q=stat(1);q.modifiers.mult.push(mod('external',1.25));const n=v.seed,m=modifiers({aiCoreId:v.core,improved:v.improved,adminSupplyBonus:(n%5-2)*0.5,adminDemandReduction:(n%3-1)*0.5});
 if(n%2===0){m.supplyBonusFromOther.modifiers.flat=[mod('ind_'+v.id+'_0',2),mod('extra',-0.5)];m.supplyBonusFromOther.modifiers.mult=[mod('mult',0.5)];}if(n%3===0){m.demandReductionFromOther.modifiers.flat=[mod('extra',1.5)];m.demandReductionFromOther.modifiers.percent=[mod('percent',25)];}if(n%4===0)for(const c of ['organics','ore']){state.demand[c]=stat();state.demand[c].modifiers.mult=[mod('half',0.5)];}if(n%5===0)state.supply.fuel=stat(1);
 for(let step=0;step<4;step++){if(step===1)m.aiCoreId='beta_core';if(step===2)m.aiCoreId='gamma_core';if(step===3){m.aiCoreId=null;m.improved=false;}
 const r=apply(input(v.id,{state,marketSize:v.size,techMiningMult:q,modifiers:m,factionId:step===1?'independent':v.factionId,available:Object.fromEntries(required(v.id).map(c=>[c,(n+step+c.length)%10-1])),operating:operating({disrupted:step===2,building:step===3,upgradeId:step===3?'next_industry':null})}));state=r.state;q=r.techMiningMult;const e=results[index*4+step],label=v.id+'/'+v.size+'/'+n+'/'+step;assert.deepEqual(state,e.state,label);assert.deepEqual(q,e.techMiningMult,label+' tech');for(const [c,x]of Object.entries(e.effectiveSupply))assert.equal(value(r,c),x,label+' supply '+c);for(const [c,x]of Object.entries(e.effectiveDemand))assert.equal(value(r,c,'demand'),x,label+' demand '+c);const legal=output(state,{commodityId:'fuel',illegal:true});assert.equal(legal.supplyLegal,e.supplyLegal);assert.equal(legal.demandLegal,e.demandLegal);}
 });
});
