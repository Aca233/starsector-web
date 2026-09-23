import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { CampaignError } from '../src/campaign/core/Values.mjs';
import { ORIGINAL_PRODUCTION_INDUSTRIES as R, newOriginalProductionIndustry as fresh, applyOriginalProductionIndustry as apply, unapplyOriginalProductionIndustry as unapply, originalProductionIndustryOutput as output } from '../src/campaign/rules/OriginalProductionIndustries.mjs';
import { reapplyOriginalIndustryCommodityPass as pass } from '../src/campaign/rules/OriginalIndustryCommodityPass.mjs';
import { newOriginalCivicIndustry } from '../src/campaign/rules/OriginalCivicIndustries.mjs';
import { nativeProductionOracle } from './campaign-production-native-oracle.mjs';
const bonus = () => ({ flat: [], percent: [], mult: [] });
const stat = () => ({ base: 0, modifiers: bonus() });
const mod = (id, value) => ({ id, value });
const operating = (x={}) => ({ disrupted: false, building: false, upgradeId: null, ...x });
const modifiers = (x={}) => ({ aiCoreId: null, improved: false, adminSupplyBonus: 0, adminDemandReduction: 0, supplyBonusFromOther: stat(), demandReductionFromOther: stat(), specialItemId: null, ...x });
const required = id => ({ lightindustry: ['organics'], refining: ['heavy_machinery','ore','rare_ore'], heavyindustry: ['metals','rare_metals'], orbitalworks: ['metals','rare_metals'], fuelprod: ['volatiles'] })[id];
const input = (id,x={}) => ({ state: fresh(id), marketSize: 6, operating: operating(), modifiers: modifiers(), available: Object.fromEntries(required(id).map(c=>[c,99])), illegalCommodityIds: [], conditionIds: [], adminFuelSupplyBonus: 0, previousStability: 5, productionQuality: bonus(), ...x });
const value = (r, c, channel='supply') => output(r.state, { commodityId:c, illegal:false })[channel];
const rejects = fn=>assert.throws(fn,e=>e instanceof CampaignError);

test('production catalogue matches 12 source hashes, five industry bindings and five item effects', () => {
  const r=spawnSync(process.execPath,['scripts/import-campaign-production-industries.mjs','--check'],{encoding:'utf8',windowsHide:true}); assert.equal(r.status,0,r.stdout+r.stderr);
  assert.equal(Object.keys(R.sources).length,12);assert.equal(Object.keys(R.industries).length,5);assert.equal(Object.keys(R.items).length,5);
});
test('light industry uses market illegality, retains old supply bonus on zero writes, and only consumes organics',()=>{
  const a=apply(input('lightindustry',{ modifiers:modifiers({ aiCoreId:'alpha_core' }) }));
  assert.equal(value(a,'drugs'),5);assert.equal(value(a,'organics','demand'),5);
  const b=apply(input('lightindustry',{state:a.state,illegalCommodityIds:['drugs','luxury_goods']}));
  assert.equal(value(b,'drugs'),1);assert.equal(value(b,'luxury_goods'),1); // Native ind_sb survives zero base write.
  const c=apply(input('lightindustry',{illegalCommodityIds:['drugs','luxury_goods'],available:{organics:0}}));
  assert.equal(value(c,'domestic_goods'),0);assert.equal(value(c,'drugs'),0);assert.equal(output(c.state,{commodityId:'drugs',illegal:true}).supplyLegal,false);
});
test('refining deficits split by ore and fuel ignores machinery shortage',()=>{
  const a=apply(input('refining',{available:{heavy_machinery:3,ore:8,rare_ore:0}}));assert.equal(value(a,'metals'),5);assert.equal(value(a,'rare_metals'),-2);
  const b=apply(input('fuelprod',{available:{volatiles:6},adminFuelSupplyBonus:2}));assert.equal(value(b,'fuel'),6);assert.equal(value(b,'heavy_machinery','demand'),4);
  assert.equal(output(b.state,{commodityId:'fuel',illegal:true}).supplyLegal,true);
});
test('heavy shortage cap, tiny markets and orbital quality are not an extra ship production bonus',()=>{
  for(const id of ['heavyindustry','orbitalworks']) { const r=apply(input(id,{available:{metals:0,rare_metals:0}})); assert.equal(value(r,'ships'),1);assert.equal(value(r,'hand_weapons'),1); }
  const tiny=apply(input('heavyindustry',{marketSize:1,available:{metals:99,rare_metals:99}}));assert.equal(value(tiny,'ships'),1);
  const orbital=apply(input('orbitalworks',{previousStability:2.5}));assert.deepEqual(orbital.productionQuality.flat,[mod('ind_orbitalworks_1',Math.fround(0.2)),mod('ind_orbitalworks_0',-0.25)]);
});
test('item condition presence, administrator override order and heavy unapply preserve native neutral modifiers',()=>{
  for(const [id,item,condition,commodity,amount] of [['lightindustry','biofactory_embryo','habitable','domestic_goods',8],['refining','catalytic_core','no_atmosphere','metals',9],['fuelprod','synchrotron','no_atmosphere','fuel',7]]) {
    const m=modifiers({specialItemId:item});assert.equal(value(apply(input(id,{modifiers:m,conditionIds:[condition]})),commodity),amount);assert.equal(value(apply(input(id,{modifiers:m})),commodity),amount-R.items[item].supplyBonus);
  }
  const q=bonus();q.flat.push(mod('external',0.5));
  const a=apply(input('orbitalworks',{productionQuality:q,modifiers:modifiers({specialItemId:'pristine_nanoforge'}),operating:operating({disrupted:true})}));
  assert.deepEqual(a.state.supply,{});assert.deepEqual(a.productionQuality,q);assert.ok(a.state.supplyBonus.modifiers.flat.some(m=>m.id==='pristine_nanoforge'&&m.value===0));
  const m=modifiers();m.supplyBonusFromOther.modifiers.flat=[mod('ind_fuelprod_2',7)];assert.equal(value(apply(input('fuelprod',{modifiers:m,adminFuelSupplyBonus:0})),'fuel'),4);
});
test('direct apply retains prior low-stability penalty, market reapply explicitly removes it first',()=>{
  const a=apply(input('orbitalworks',{previousStability:0})); const b=apply(input('orbitalworks',{...a,previousStability:8}));assert.ok(b.productionQuality.flat.some(m=>m.value===-0.5));
  const c=unapply({...b,specialItemId:null});assert.deepEqual(c.productionQuality,bonus());assert.deepEqual(c.state.supply,b.state.supply);
  const d=apply(input('orbitalworks',{...c,previousStability:8}));assert.equal(d.productionQuality.flat.length,1);
});
test('production pass shares quality in ordered unapply/apply and uses illegal/free-port and suppressed-condition presence',()=>{
  const request={marketSize:6,freePort:false,factionIllegalCommodityIds:['drugs'],conditions:[{id:'habitable',modId:'habitable',surveyed:false,suppressed:true}],industries:[{state:newOriginalCivicIndustry('population'),operating:operating(),modifiers:modifiers()},{state:fresh('lightindustry'),operating:operating(),modifiers:modifiers({specialItemId:'biofactory_embryo'})},{state:fresh('orbitalworks'),operating:operating(),modifiers:modifiers({specialItemId:'pristine_nanoforge'})}],available:{heavy_machinery:99,organics:99,metals:99,rare_metals:99},commodities:['drugs','ships','domestic_goods'].map(commodityId=>({commodityId,previousSupplyLegal:false,previousDemandLegal:false})),production:{productionQuality:bonus(),previousStability:0,adminFuelSupplyBonus:0}};
  const before=structuredClone(request),a=pass(request);assert.deepEqual(request,before);assert.equal(a.commodities.domestic_goods.maxSupply,8);assert.equal(a.commodities.ships.maxSupply,7);assert.equal(a.commodities.drugs.maxSupply,2);
  const b=pass({...request,freePort:true,industries:a.industries,production:{...a.production,previousStability:8}});assert.equal(b.commodities.drugs.maxSupply,6);assert.equal(b.production.productionQuality.flat.some(m=>m.id==='ind_orbitalworks_0'),false);
  const {production:_,...incomplete}=request;rejects(()=>pass(incomplete));assert.ok(Object.isFrozen(b.production.productionQuality.flat));
});
test('unknown plugins, wrong items, missing getter inputs and non-native float inputs fail without mutating callers',()=>{
  for(const id of ['commerce','toString','constructor'])rejects(()=>fresh(id));
  for(const change of [{available:{}},{available:{volatiles:5,heavy_machinery:5}},{previousStability:0.1},{illegalCommodityIds:['not_native']},{conditionIds:['habitable','habitable']},{modifiers:modifiers({specialItemId:'pristine_nanoforge'})}])rejects(()=>apply(input('fuelprod',change)));
  const a=input('refining'),before=structuredClone(a);apply(a);assert.deepEqual(a,before);
});
test('1320 native Java production snapshots match full modifiers, float outputs, quality, items and legality',()=>{
  const vectors=Object.entries(R.industries).flatMap(([id,d])=>Array.from({length:11},(_,size)=>Array.from({length:6},(_,seed)=>{const items=[null,...Object.entries(R.items).filter(([,i])=>i.industryIds.includes(id)).map(([k])=>k)];return {id,className:d.className,size,seed:seed+size*6,core:[null,'alpha_core','beta_core','gamma_core'][seed%4],improved:seed%2===0,item:items[seed%items.length]};}))).flat();
  const results=nativeProductionOracle(vectors);assert.equal(results.length,1320);
  vectors.forEach((v,index)=>{
    let state=structuredClone(fresh(v.id)),q=bonus();q.flat.push(mod('external',Math.fround(0.1)));const n=v.seed;
    const m=modifiers({aiCoreId:v.core,improved:v.improved,specialItemId:v.item,adminSupplyBonus:(n%5-2)*0.5,adminDemandReduction:(n%3-1)*0.5});
    if(n%2===0){m.supplyBonusFromOther.modifiers.flat=[mod('ind_'+v.id+'_0',2),mod('extra',-0.5)];m.supplyBonusFromOther.modifiers.mult=[mod('mult',0.5)];}
    if(n%3===0){m.demandReductionFromOther.modifiers.flat=[mod('extra',1.5)];m.demandReductionFromOther.modifiers.percent=[mod('percent',25)];}
    if(n%4===0)for(const c of ['organics','ore']){state.demand[c]=stat();state.demand[c].modifiers.mult=[mod('half',0.5)];}
    if(n%5===0){state.supply.fuel=stat();state.supply.fuel.base=1;}
    for(let step=0;step<4;step++){
      if(step===3){const u=unapply({state,productionQuality:q,specialItemId:m.specialItemId});state=u.state;q=u.productionQuality;m.specialItemId=null;m.aiCoreId=null;m.improved=false;}
      const r=apply(input(v.id,{state,marketSize:v.size,productionQuality:q,modifiers:m,available:Object.fromEntries(required(v.id).map(c=>[c,(n+step+c.length)%10-1])),conditionIds:[...((n+step)%2===0?['habitable']:[]),...((n+step)%3===0?['no_atmosphere']:[])],illegalCommodityIds:(n+step)%2===1?['drugs','luxury_goods']:[],previousStability:step===1?8:(n%11)*0.5,adminFuelSupplyBonus:(n%7-3)*0.5,operating:operating({disrupted:step===2,building:step===3,upgradeId:step===3?'next_industry':null})}));
      state=r.state;q=r.productionQuality;const expected=results[index*4+step],label=v.id+'/'+v.size+'/'+n+'/'+step;
      assert.deepEqual(state,expected.state,label);assert.deepEqual(q,expected.productionQuality,label+' quality');
      for(const [c,x] of Object.entries(expected.effectiveSupply))assert.equal(value(r,c),x,label+' supply '+c);
      for(const [c,x] of Object.entries(expected.effectiveDemand))assert.equal(value(r,c,'demand'),x,label+' demand '+c);
      const legal=output(state,{commodityId:'fuel',illegal:true});assert.equal(legal.supplyLegal,expected.supplyLegal);assert.equal(legal.demandLegal,expected.demandLegal);
    }
  });
});

import { newOriginalIndustryFinances, updateOriginalIndustryFinances, reapplyOriginalColonyFinancialPass } from '../src/campaign/rules/OriginalMarketFinance.mjs';
import { reapplyOriginalColonyEnvironment } from '../src/campaign/rules/OriginalColonyEnvironment.mjs';
test('production participates in industry caps, ordered finances and environment without fabricating pollution advancement',()=>{
  const ids=['lightindustry','refining','orbitalworks','fuelprod'],commodities=['heavy_machinery','organics','ore','rare_ore','metals','rare_metals','volatiles'];
  const industries=ids.map(id=>({state:fresh(id),operating:operating(),modifiers:modifiers()}));
  industries[2].modifiers.specialItemId='pristine_nanoforge';
  const local={commodityPass:{marketSize:6,freePort:false,factionIllegalCommodityIds:[],conditions:[],industries,available:Object.fromEntries(commodities.map(c=>[c,20])),commodities:commodities.map(commodityId=>({commodityId,previousSupplyLegal:true,previousDemandLegal:true})),production:{productionQuality:bonus(),previousStability:5,adminFuelSupplyBonus:0}},stability:stat(),incomeMult:{...stat(),base:1},upkeepMult:{...stat(),base:1},maxIndustries:bonus(),previousStability:5,hazard:1,governance:{marketId:'m',markets:[{marketId:'m',playerOwned:false,adminIsPlayer:false}],maxOutposts:2},constructionQueue:[],conditionStateByModId:{},marketCommodities:commodities.map(commodityId=>({commodityId,maxDemand:0,maxSupply:0,available:20,shippingFaction:0,maxExportFaction:0}))};
  const r=reapplyOriginalColonyFinancialPass({local,industryFinances:ids.map(newOriginalIndustryFinances)});assert.equal(r.localEffects.diagnostics.industryCount,4);assert.equal(r.industries.length,4);assert.ok(r.industryUpkeep>0);assert.equal(r.localEffects.commodityEffects.production.productionQuality.flat.length,2);
  const broken=structuredClone(local);broken.marketCommodities.find(c=>c.commodityId==='ore').available=19;rejects(()=>reapplyOriginalColonyFinancialPass({local:broken,industryFinances:ids.map(newOriginalIndustryFinances)}));
  broken.marketCommodities.find(c=>c.commodityId==='ore').available=20;broken.commodityPass.production.previousStability=4;rejects(()=>reapplyOriginalColonyFinancialPass({local:broken,industryFinances:ids.map(newOriginalIndustryFinances)}));
  const env=reapplyOriginalColonyEnvironment({hazard:{...stat(),base:1},modifiers:{permanent:[],transient:[]},conditions:[],industries:ids.map(industryId=>({industryId,operating:operating()}))});assert.equal(env.hazardValue,1);assert.deepEqual(env.modifiers,{permanent:[],transient:[]});
  for(const [item,d] of Object.entries(R.items))for(const id of d.industryIds){const q={state:newOriginalIndustryFinances(id),marketSize:6,phase:'industry-apply',marketIncomeMult:1,marketUpkeepMult:1,operating:operating(),aiCoreId:'alpha_core',specialItemId:null,portInputs:null};assert.deepEqual(updateOriginalIndustryFinances({...q,specialItemId:item}),updateOriginalIndustryFinances(q));}
});
