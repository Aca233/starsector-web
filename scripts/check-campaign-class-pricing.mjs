import test from 'node:test';
import assert from 'node:assert/strict';
import { CampaignError } from '../src/campaign/core/Values.mjs';
import { updateOriginalCommodityClassPrices as update } from '../src/campaign/rules/OriginalCommodityClassPricing.mjs';
import { ORIGINAL_MARKET_ECONOMY as E, resolveOriginalMarketEconomyPass } from '../src/campaign/rules/OriginalMarketEconomy.mjs';
import { nativeClassPriceSnapshots } from './campaign-class-pricing-native-oracle.mjs';
import { classPriceInput as fixture, projectClassPrice as project, nextClassInput as next } from './campaign-class-pricing-fixtures.mjs';
import { stat,mod,f } from './campaign-immigration-fixtures.mjs';
const rejects=fn=>assert.throws(fn,e=>e instanceof CampaignError);
test('class pricing shares demand, preserves variant stockpile and uses the primary calculator specification',()=>{
 const p=fixture(),before=structuredClone(p),r=update(p),[primary,variant]=r.commodities;
 assert.deepEqual(p,before);assert.ok(Object.isFrozen(r.commodities[0].greedStat.modifiers.flat));
 assert.equal(variant.stockpile,p.commodities[1].stockpile);assert.notEqual(primary.stockpile,p.commodities[0].stockpile);
 assert.equal(primary.demandPrice.demand,variant.demandPrice.demand);assert.equal(variant.demandPrice.variability,'V3');assert.equal(variant.maxDemand,5);assert.equal(variant.demandPrice.highThreshold,f(variant.stockpile+3*500));
 assert.equal(r.inventory,undefined);assert.equal(r.asOfTick,undefined);assert.equal(r.scope,'native-demand-class-stockpile-and-price-effects-only');
});
test('variant trigger rewrites primary prices with its own seed; repeating the same trigger is stable',()=>{
 const a=update(fixture()),p=next(fixture(),a);p.triggerCommodityId='lobster';p.commodities[1].maxDemand=0;const b=update(p),c=update(next(p,b));
 assert.notEqual(a.diagnostics.random.seed,b.diagnostics.random.seed);assert.notEqual(a.demandValue,b.demandValue);assert.notEqual(a.commodities[0].stockpile,b.commodities[0].stockpile);assert.equal(a.commodities[1].stockpile,b.commodities[1].stockpile);assert.equal(b.commodities[1].demandPrice.highThreshold,-1);assert.deepEqual(b,c);
});
test('missing-primary/empty classes do not invent demand, stockpile or RNG draws',()=>{
 const p=fixture();p.commodities.shift();p.commodities[0].greedStat=stat();const r=update(p);assert.deepEqual(r.demandStat,p.demandStat);assert.equal(r.diagnostics.random.drawsConsumed,0);assert.equal(r.diagnostics.noDemand,false);assert.deepEqual(r.commodities[0].greedStat,stat());assert.equal(r.commodities[0].stockpile,123.75);assert.ok(!r.commodities[0].playerModifiers.p.demand.mult.some(m=>m.id==='core'));
 p.commodities[0].greedStat=stat(0,[mod('first',9),mod('core',4),mod('last',8)]);assert.deepEqual(update(p).commodities[0].greedStat.modifiers.flat,[mod('first',9),mod('core',0),mod('last',8)]);
 p.commodities=[];assert.deepEqual(update(p).commodities,[]);assert.deepEqual(update(p).demandStat,p.demandStat);
});
test('no-demand uses the primary flag for each player/variant but retains independent modifiers',()=>{
 const p=fixture();p.commodities[0].maxDemand=0;p.commodities[0].maxSupply=0;p.commodities[0].available=0;p.commodities[0].availableWithoutTrade=0;
 for(const c of p.commodities)c.playerModifiers.q={supply:stat().modifiers,demand:stat(0,[mod('q_bonus',5)]).modifiers};
 const r=update(p);assert.equal(r.diagnostics.noDemand,true);for(const c of r.commodities)for(const id of ['p','q'])assert.equal(c.playerModifiers[id].demand.mult.find(m=>m.id==='core').value,f(E.settings.economyNoDemandPriceMult));
 assert.deepEqual(r.commodities[1].playerModifiers.q.demand.flat,[mod('q_bonus',5)]);assert.deepEqual(r.commodities[0].playerModifiers.p.supply,p.commodities[0].playerModifiers.p.supply);
});
test('class pricing rejects stale shape/phase, wrong class, duplicates, invented plugins and nonfloat captures',()=>{
 for(const mutate of [p=>p.phase='per-tick',p=>p.coverage='selected',p=>p.commodities[1].commodityId='ore',p=>p.commodities.push(structuredClone(p.commodities[0])),p=>p.commodities[0].maxExportGlobal=null,p=>p.demandStat.base=0.1,p=>p.commodities[0].stockpile=NaN,p=>p.triggerCommodityId='ai_cores',p=>p.commodities[0].maxDemand=-1]){const p=fixture();mutate(p);rejects(()=>update(p));}
});
test('class primary projection preserves the existing source-pinned primary-only price pass',()=>{
 for(const commodityId of ['food','ore','supplies','fuel'])for(let k=0;k<12;k++){
 const p=fixture(commodityId),row=p.commodities[0],old={marketId:p.marketId,commodityId,month:k+1,sourceRevision:'test-only',phase:p.phase,industry:{industries:[{id:'actual',supply:k%8,demand:k%6,supplyLegal:true,demandLegal:true}],previousSupplyLegal:true,previousDemandLegal:true},network:{shippingGlobal:4,shippingFaction:8,maxExportGlobal:6,maxExportFaction:4,hidden:false},otherAvailableFlat:0,eventModBeforePass:0,tradeMod:{both:500,plus:400,minus:-300},demandStat:p.demandStat,greedStat:row.greedStat,playerModifiers:row.playerModifiers,marketModifiers:{supply:stat().modifiers,demand:stat().modifiers}};
 const legacy=resolveOriginalMarketEconomyPass(old);p.month=old.month;Object.assign(row,{maxSupply:legacy.diagnostics.amounts.maxSupply,maxDemand:legacy.diagnostics.amounts.maxDemand,available:legacy.diagnostics.available,availableWithoutTrade:legacy.diagnostics.availability.availableWithoutTrade,shippingGlobal:4,shippingFaction:8,maxExportGlobal:6,tradeMod:old.tradeMod});const r=update(p),c=r.commodities[0];
 assert.equal(c.stockpile,legacy.commodity.stockpile);assert.deepEqual(r.demandStat,legacy.nativeStats.demandStat);assert.deepEqual(c.greedStat,legacy.nativeStats.greedStat);assert.deepEqual(c.playerModifiers,legacy.nativeStats.playerModifiers);for(const key of ['highThreshold','highMult','lowThreshold','lowMult'])for(const side of ['demandPrice','supplyPrice'])assert.equal(c[side][key],legacy.commodity[side][key]);
 }
});
test('original complete V2 loop and updateCalc match 120 four-step histories and all 19 economic triggers',()=>{
 const histories=[];
 for(let seed=0;seed<120;seed++){
  const p=fixture(['luxury_goods','food','crew','ships'][seed%4]);p.marketId=['jangala','ZZZZZZZZZZZZZZ','seed-overflow'][seed%3];
  for(const [i,c]of p.commodities.entries()){const unit=E.commodities[c.commodityId].econUnit;c.maxSupply=(seed+i)%12;c.maxDemand=(seed*3+i)%10;c.available=(seed+2*i)%11;c.availableWithoutTrade=f(c.available-(seed%3)*0.5);c.shippingGlobal=seed%7;c.shippingFaction=seed%7+4;c.maxExportGlobal=c.commodityId===p.triggerCommodityId?seed%9:null;c.stockpile=f(seed%9===0?-17.5:123.75+i*13);c.tradeMod={both:f((seed%5-2)*unit),plus:f((seed%7-2)*unit),minus:f(-(seed%3)*unit)};if(seed%11===0)c.greedStat=stat();}
  if(seed%19===0){const primary=p.commodities.find(c=>c.commodityId===p.triggerCommodityId);Object.assign(primary,{maxSupply:0,maxDemand:0,available:0,availableWithoutTrade:0});}
  if(seed%12===0)p.commodities=p.commodities.filter(c=>c.commodityId!=='luxury_goods');if(seed%17===0)p.commodities=[];if(seed%3===0)p.commodities.reverse();
  const steps=Array.from({length:4},(_,i)=>({triggerCommodityId:p.triggerCommodityId==='luxury_goods'&&i%2?'lobster':p.triggerCommodityId,month:(seed+i)%12+1,demands:p.commodities.filter(c=>c.commodityId==='lobster').map(c=>({commodityId:c.commodityId,maxDemand:i%2?0:(seed+i)%8}))}));histories.push({initial:p,steps});
 }
 const economic=Object.values(E.commodities).filter(c=>!c.tags.includes('nonecon'));assert.equal(economic.length,19);for(const c of economic){const initial=fixture(c.demandClass);histories.push({initial,steps:[{triggerCommodityId:c.id,month:12,demands:[]}]});}
 const native=nativeClassPriceSnapshots(histories);assert.equal(native.length,499);let index=0;
 for(const h of histories){let p=structuredClone(h.initial);for(const step of h.steps){Object.assign(p,{triggerCommodityId:step.triggerCommodityId,month:step.month});for(const change of step.demands)p.commodities.find(c=>c.commodityId===change.commodityId).maxDemand=change.maxDemand;const r=update(p);assert.deepEqual(project(r),native[index],'native class snapshot '+index);index++;p=next(p,r);}}
});
