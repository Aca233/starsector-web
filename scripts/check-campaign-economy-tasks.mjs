import {OriginalEconomyUpdateListeners} from '../src/campaign/rules/OriginalEconomyListeners.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { CampaignError } from '../src/campaign/core/Values.mjs';
import { OriginalEconomyTaskRunner as Runner, originalEconomyCommodityOrder as order, ORIGINAL_ECONOMY_TASKS as R } from '../src/campaign/rules/OriginalEconomyTasks.mjs';
import { OriginalCommodityNetworkCache as Cache, originalCachedCommodityExportIncome as income } from '../src/campaign/rules/OriginalCommodityCache.mjs';
import { taskConfig,taskFixture,forced } from './campaign-economy-task-fixtures.mjs';
import { nativeEconomyTaskTraces } from './campaign-economy-task-native-oracle.mjs';
import { f,stat,mod } from './campaign-immigration-fixtures.mjs';
const rejects=fn=>assert.throws(fn,e=>e instanceof CampaignError);
function cacheFixture(){
  const markets=new Map(['a','b','removed'].map((id,i)=>[id,{id,factionId:i===0?'player':'independent',econGroup:null,size:4,access:stat(0,[mod('initial',0.6)]).modifiers,income:stat(1),owned:false,skill:null,available:7,amounts:{maxSupply:i===0?7:3,maxDemand:5,supplyLegal:true,demandLegal:true},event:0}]));
  const live=['a','b'],events=[];let cache;
  const runtime={
    setDemandFromPrimary:(id,variant,demand,legal)=>{events.push('inherit:'+id+':'+variant+':'+demand+':'+legal);},
    getEconGroup:id=>markets.get(id).econGroup,getAccessibility:id=>markets.get(id).access,
    getIncomeInputs:id=>{events.push('income:'+id);const m=markets.get(id);return {incomeMult:m.income,playerOwned:m.owned,playerCommodityExportMult:m.skill};},
    capture:(commodityId,econGroup)=>{events.push('capture:'+commodityId+':'+econGroup);const selected=live.map(id=>markets.get(id)).filter(m=>m.econGroup===econGroup);const factions=[...new Set(selected.map(m=>m.factionId))];return {network:{commodityId,econGroup,roster:live.map(id=>({marketId:id,econGroup:markets.get(id).econGroup})),markets:selected.map(m=>({marketId:m.id,factionId:m.factionId,size:m.size,location:{x:0,y:0},hidden:false,accessibility:m.access,amounts:m.amounts,availableBeforeCore:m.available,otherAvailableFlat:0,eventModBeforeCore:m.event,tradeMod:{both:0,plus:0,minus:0}})),hostility:Object.fromEntries(factions.map(id=>[id,Object.fromEntries(factions.filter(other=>other!==id).map(other=>[other,false]))]))},financialMarkets:selected.map(m=>({marketId:m.id,playerOwned:m.owned,incomeMult:m.income,playerCommodityExportMult:m.skill}))};},
    apply:(_input,entry)=>{events.push('apply:'+entry.serial);for(const row of entry.data.network.markets){assert.equal(cache.peek(row.marketId,entry.data.network.commodityId),entry);const m=markets.get(row.marketId);m.access=structuredClone(row.accessibility);m.available=row.available;m.event=row.appliedEventMod;}},
  };cache=new Cache(runtime);return {cache,runtime,markets,live,events};
}
test('task sources and economy-tier constants are pinned, not UI commodity sorting',()=>{const p=spawnSync(process.execPath,['scripts/import-campaign-economy-tasks.mjs','--check'],{encoding:'utf8',windowsHide:true});assert.equal(p.status,0,p.stdout+p.stderr);assert.equal(Object.keys(R.sources).length,15);assert.equal(R.iterationsPerMonth,10);assert.equal(R.commodities.supplies.economyTier,f(2.1));assert.deepEqual(order(taskConfig().specs),['food','ore','fuel','ships']);});
test('first batch initializes only the stable commodity order; every task is explicitly synchronous',()=>{const x=taskFixture(taskConfig()),r=new Runner(x.runtime,{mode:'scheduled',lastIteration:false});assert.deepEqual(x.trace,[]);const first=r.step();assert.deepEqual(x.trace,[]);assert.equal(first.phase,'main');assert.equal(first.batches,1);r.step();assert.deepEqual(x.trace,['conditions:a','industries:a']);r.run();const count=x.trace.length;assert.equal(r.step().phase,'done');assert.equal(x.trace.length,count);assert.ok(Object.isFrozen(first.commodityOrder));});
test('withIncomeAndUpkeep false does not suppress industry apply; forced UI/immigration and stockpile gates are separate',()=>{const x=taskFixture(taskConfig());let r=new Runner(x.runtime,forced({withIncomeAndUpkeep:false,withStockpileUpdate:false,withImmigration:false}));r.step();const trace=[...x.trace];r=Runner.fromCheckpoint(x.runtime,JSON.parse(JSON.stringify(r.checkpoint())));assert.deepEqual(x.trace,trace);r.run();assert.equal(x.trace.filter(x=>x==='industries:a').length,2);assert.ok(!x.trace.some(x=>x.startsWith('stockpile:')||x.startsWith('immigration:')));assert.ok(x.trace.includes('character:a'));assert.ok(x.trace.includes('finish:first'));});
test('no economic commodities skips the entire first reapply, but not the later reapply or population task',()=>{const c=taskConfig();c.specs=c.specs.filter(s=>s.tags.includes('nonecon'));const x=taskFixture(c);new Runner(x.runtime,{mode:'scheduled',lastIteration:true}).run();assert.equal(x.trace.filter(x=>x==='industries:a').length,1);assert.ok(x.trace.includes('immigration:a:3:false'));assert.ok(!x.trace.some(x=>x.startsWith('network:')));});
test('forced tasks capture new rosters between phases while scheduled tasks retain creation-time market objects',()=>{const c=taskConfig();c.actions=[{trigger:'commodity:first:food',occurrence:1,type:'remove-market',id:'b'},{trigger:'commodity:first:food',occurrence:1,type:'add-market',id:'c',group:'newGroup'}];const a=taskFixture(c),b=taskFixture(c);new Runner(a.runtime,forced({forceNonUIStep:true})).run();new Runner(b.runtime,{mode:'scheduled',lastIteration:true}).run();assert.equal(a.trace.filter(x=>x==='industries:c').length,1);assert.equal(b.trace.filter(x=>x==='industries:c').length,0);assert.ok(a.trace.includes('immigration:c:3:false'));assert.ok(b.trace.includes('immigration:b:3:false'));assert.ok(a.trace.includes('network:ore:private:'));assert.ok(!a.trace.some(x=>x.startsWith('network:ore:newGroup:')));});
test('native listener lists permit duplicates and iterate snapshots despite live removals/additions',()=>{const c=taskConfig();c.listenerRoster=['first','second','second'];c.actions=[{trigger:'commodity:first:food',occurrence:1,type:'remove-listener',id:'second'},{trigger:'commodity:first:food',occurrence:1,type:'add-listener',id:'late'}];const x=taskFixture(c);new Runner(x.runtime,forced()).run();assert.equal(x.trace.filter(s=>s==='commodity:second:food').length,2);assert.ok(!x.trace.includes('commodity:late:food'));assert.ok(x.trace.includes('commodity:late:ore'));assert.ok(x.trace.includes('finish:late'));});
test('failed task drafts cannot skip a failed phase by resuming, and missing/async runtime hooks reject',()=>{const x=taskFixture(taskConfig());delete x.runtime.reapplyIndustries;rejects(()=>new Runner(x.runtime,forced()));const y=taskFixture(taskConfig());y.runtime.computeCommodityData=()=>{throw Error('apply failed');};const r=new Runner(y.runtime,{mode:'scheduled',lastIteration:false});assert.throws(()=>r.run(),/apply failed/);assert.equal(r.status().failed,true);rejects(()=>r.run());const z=taskFixture(taskConfig());z.runtime.advanceImmigration=async()=>{};rejects(()=>new Runner(z.runtime,{mode:'scheduled',lastIteration:false}).run());rejects(()=>order([{id:'food',economyTier:0.1,tags:[]}]))});
test('cache getter is lazy per commodity/market, shares object identity across live group and never lazily creates export income',()=>{const x=cacheFixture();assert.equal(x.cache.getExportIncome('a','food'),0);assert.deepEqual(x.events,[]);const a=x.cache.get('a','food');assert.equal(x.cache.get('b','food'),a);assert.equal(x.cache.peek('a','ore'),null);assert.ok(Object.isFrozen(a.data));assert.equal(x.events.filter(s=>s.startsWith('capture:')).length,1);const b=x.cache.get('a','ore');assert.notEqual(a,b);assert.equal(x.cache.peek('b','ore'),b);assert.equal(x.cache.peek('a','food'),a);});
test('group changes and removed callers retain native references rather than global group-key caching',()=>{const x=cacheFixture(),old=x.cache.get('a','food');x.markets.get('b').econGroup='private';assert.equal(x.cache.get('b','food'),old);const fresh=x.cache.rebuild('food',null);assert.notEqual(fresh,old);assert.equal(x.cache.peek('a','food'),fresh);assert.equal(x.cache.peek('b','food'),old);const privateData=x.cache.rebuild('food','private');assert.equal(x.cache.peek('b','food'),privateData);x.markets.get('removed').econGroup='empty';const first=x.cache.get('removed','food'),second=x.cache.get('removed','food');assert.notEqual(first,second);assert.equal(x.cache.peek('removed','food'),null);});
test('cached market share uses live income/player multipliers and shipping, without refreshing cached shares',()=>{const x=cacheFixture(),entry=x.cache.get('a','food'),before=x.cache.getExportIncome('a','food'),m=x.markets.get('a');assert.ok(before>0);m.income=stat(2);assert.equal(x.cache.getExportIncome('a','food'),before*2);m.owned=true;m.skill=f(1.5);assert.equal(x.cache.getExportIncome('a','food'),before*3);m.access=stat(0,[mod('changed',0.2)]).modifiers;assert.equal(x.cache.getShipping('a').global,2);assert.equal(x.cache.peek('a','food'),entry);assert.equal(entry.data.markets[0].exportIncome,before);assert.equal(income({sourceIsIllegal:true,exportMarketShare:NaN,marketValue:NaN,incomeMult:null,playerOwned:null,playerCommodityExportMult:null}),0);});
test('cache application failure restores previous bindings; wrong or asynchronous captures cannot publish entries',()=>{const x=cacheFixture(),old=x.cache.get('a','food');x.runtime.apply=()=>{throw Error('transaction aborted');};assert.throws(()=>x.cache.rebuild('food',null),/transaction aborted/);assert.equal(x.cache.peek('a','food'),old);const y=cacheFixture(),capture=y.runtime.capture;y.runtime.capture=(id,group)=>({...capture(id,group),network:{...capture(id,group).network,commodityId:'ore'}});rejects(()=>y.cache.get('a','food'));assert.equal(y.cache.peek('a','food'),null);y.runtime.capture=async()=>({});rejects(()=>y.cache.get('a','food'));});
test('original Java task traces match 96 dynamic forced/scheduled economies, including listeners and captured-vs-live rosters',()=>{
 const cases=[];for(let k=0;k<96;k++){const c=taskConfig();if(k%7===0)c.markets=[];if(k%8===0)c.specs=c.specs.filter(s=>s.tags.includes('nonecon'));if(k%6===0)c.listeners[1].expired=true;if(k%9===0)c.listenerRoster=['first','second','second'];if(k%5===0)c.specs.reverse();
 if(k%3===0)c.actions.push({trigger:'commodity:first:food',occurrence:1,type:'add-market',id:'c',group:'new'},{trigger:'commodity:first:food',occurrence:1,type:'remove-market',id:'b'},{trigger:'commodity:first:food',occurrence:1,type:'add-listener',id:'late'});
 if(k%4===0&&c.markets.length)c.actions.push({trigger:'character:a',occurrence:1,type:'add-market',id:'pre',group:null},{trigger:'commodity:first:ore',occurrence:1,type:'group',id:'a',group:'moved'},{trigger:'industries:a',occurrence:2,type:'add-market',id:'after',group:null});
 if(k%11===0)c.actions.push({trigger:'commodity:first:food',occurrence:1,type:'remove-listener',id:'second'},{trigger:'finish:first',occurrence:1,type:'add-listener',id:'last'});
 const options=k%2?{mode:'scheduled',lastIteration:k%4===1}:forced({withIncomeAndUpkeep:k%3!==0,withStockpileUpdate:k%4===0,forceNonUIStep:k%6===0,withImmigration:k%10!==0});cases.push({config:c,options});}
 const expected=nativeEconomyTaskTraces(cases);for(let i=0;i<cases.length;i++){const x=taskFixture(cases[i].config),r=new Runner(x.runtime,cases[i].options);r.run();assert.deepEqual(x.trace,expected[i],'native economy task '+i);}
});

import { reapplyOriginalEnvironmentalFinancialPass,newOriginalMarketHazard } from '../src/campaign/rules/OriginalColonyEnvironment.mjs';
import { reapplyOriginalLocalAccessibility } from '../src/campaign/rules/OriginalMarketAccessibility.mjs';
import { newOriginalIndustryFinances } from '../src/campaign/rules/OriginalMarketFinance.mjs';
import { advanceOriginalPopulation } from '../src/campaign/rules/OriginalPopulation.mjs';
import { request,financialInput,condition } from './campaign-immigration-fixtures.mjs';
for(const lastIteration of [false,true]) test('scheduled task integrates local, network, class prices and population in a two-market test sector; lastIteration='+lastIteration,()=>{
  // This adapter composes the already-scoped local pass atomically at the adjacent condition/industry
  // boundary. It is NOT the production per-getter/skill/listener implementation or a freshness claim.
  const commodities=Object.keys(R.commodities).filter(id=>!R.commodities[id].tags.includes('nonecon'));
  const entries=['a','b'].map((id,index)=>{const local=financialInput(['population','spaceport','farming']);local.commodityPass.marketSize=4;local.commodityPass.conditions=[condition('habitable'),condition('farmland_poor'),condition('population_4')];local.commodityPass.commodities=commodities.map(commodityId=>({commodityId,previousSupplyLegal:true,previousDemandLegal:true}));local.governance.marketId=id;local.governance.markets=[{marketId:'a',playerOwned:false,adminIsPlayer:false},{marketId:'b',playerOwned:false,adminIsPlayer:false}];local.previousStability=-1;
    return {id,factionId:index?'independent':'hegemony',local,hazard:newOriginalMarketHazard(),modifiers:{permanent:[],transient:[]},industryFinances:local.commodityPass.industries.map(e=>newOriginalIndustryFinances(e.state.industryId)),access:stat().modifiers,hasSpaceport:false,commodity:new Map(commodities.map(c=>[c,{available:0,event:0,amounts:{maxSupply:0,maxDemand:0,supplyLegal:true,demandLegal:true}}])),amounts:{},conditionsPending:false,applies:0,population:null,incoming:null};});
  for(const m of entries){m.demandByClass=new Map();for(const c of m.commodity.values())Object.assign(c,{stockpile:123.75,availableWithoutTrade:0,greedStat:stat(),playerModifiers:{p:{supply:stat().modifiers,demand:stat().modifiers}}});}
  const market=id=>entries.find(m=>m.id===id),events=[];let cache;
  const cacheRuntime={setDemandFromPrimary:(id,variant,maxDemand,demandLegal)=>{Object.assign(market(id).commodity.get(variant).amounts,{maxDemand,demandLegal});},getEconGroup:()=>null,getAccessibility:id=>market(id).access,getIncomeInputs:id=>({incomeMult:market(id).local.incomeMult,playerOwned:false,playerCommodityExportMult:null}),capture:(commodityId,econGroup)=>{
    assert.equal(econGroup,null);const rows=entries.map(m=>{const c=m.commodity.get(commodityId);c.amounts=structuredClone(m.amounts[commodityId]??c.amounts);return {marketId:m.id,factionId:m.factionId,size:4,location:{x:0,y:0},hidden:false,accessibility:m.access,amounts:c.amounts,availableBeforeCore:c.available,otherAvailableFlat:0,eventModBeforeCore:c.event,tradeMod:{both:0,plus:0,minus:0}};});return {network:{commodityId,econGroup,roster:entries.map(m=>({marketId:m.id,econGroup:null})),markets:rows,hostility:{hegemony:{independent:false},independent:{hegemony:false}}},financialMarkets:entries.map(m=>({marketId:m.id,playerOwned:false,incomeMult:m.local.incomeMult,playerCommodityExportMult:null}))};},apply:(input,entry)=>{events.push('network:'+input.network.commodityId);for(const row of entry.data.network.markets){const m=market(row.marketId),c=m.commodity.get(input.network.commodityId);m.access=row.accessibility;c.available=row.available;c.event=row.appliedEventMod;c.availableWithoutTrade=row.availability.availableWithoutTrade;}}};cache=new Cache(cacheRuntime);
  const runtime={listReachMarkets:()=>entries.map(m=>m.id),listEconomyMarkets:()=>entries.map(m=>m.id),getCommoditySpecs:()=>Object.entries(R.commodities).map(([id,s])=>({id,...s})),getMarketEconGroup:()=>null,
    refreshCharacterEffects:()=>assert.fail('scheduled task does not run forced pre-refresh'),refreshGovernedOutpostEffects:()=>assert.fail('scheduled task does not run forced pre-refresh'),
    reapplyConditions:id=>{market(id).conditionsPending=true;},reapplyIndustries:id=>{
      const m=market(id),l=m.local;assert.equal(m.conditionsPending,true);m.conditionsPending=false;m.applies++;
      l.marketCommodities=commodities.map(commodityId=>{const c=m.commodity.get(commodityId),data=cache.peek(id,commodityId);return {commodityId,maxSupply:c.amounts.maxSupply,maxDemand:c.amounts.maxDemand,available:c.available,shippingFaction:cache.getShipping(id).inFaction,maxExportFaction:data?.data.network.exports.maxExportPerFaction[m.factionId]??0};});l.commodityPass.available.heavy_machinery=m.commodity.get('heavy_machinery').available;
      const result=reapplyOriginalEnvironmentalFinancialPass({hazard:m.hazard,modifiers:m.modifiers,financial:{local:l,industryFinances:m.industryFinances}}),effects=result.financial.localEffects;
      m.hazard=result.environment.hazard;m.modifiers=result.environment.modifiers;m.industryFinances=result.financial.industries.map(i=>i.state);m.amounts=effects.commodityEffects.commodities;l.commodityPass.industries=effects.commodityEffects.industries;for(const key of ['stability','incomeMult','upkeepMult','maxIndustries'])l[key]=effects[key];
      const access=reapplyOriginalLocalAccessibility({accessibility:m.access,hasSpaceport:m.hasSpaceport,marketSize:4,firstQueuedIndustryHasSpaceportTag:false,conditions:l.commodityPass.conditions,freeMarketDaysByModId:{},industries:l.commodityPass.industries.map(e=>({industryId:e.state.industryId,operating:e.operating,aiCoreId:e.modifiers.aiCoreId,improved:e.modifiers.improved,specialItemId:e.modifiers.specialItemId}))});m.access=access.accessibility;m.hasSpaceport=access.hasSpaceport;m.stability=effects.values.stability;m.hazardValue=result.environment.hazardValue;events.push('local:'+id+':'+m.applies);
    },computeCommodityData:(id,g)=>cache.rebuild(id,g),updateStockpileAndPrice:(id,triggerCommodityId)=>{
      assert.equal(lastIteration,true);const m=market(id),demandClass=EconomySpecs.commodities[triggerCommodityId].demandClass;
      const rows=[...m.commodity].filter(([commodityId])=>EconomySpecs.commodities[commodityId].demandClass===demandClass).map(([commodityId,c])=>{
        const data=commodityId===demandClass?cache.get(id,commodityId):null,shipping=cache.getShipping(id);
        return {commodityId,maxSupply:c.amounts.maxSupply,maxDemand:c.amounts.maxDemand,available:c.available,availableWithoutTrade:c.availableWithoutTrade,shippingGlobal:shipping.global,shippingFaction:shipping.inFaction,maxExportGlobal:data?.data.network.exports.maxExportGlobal??null,stockpile:c.stockpile,tradeMod:{both:0,plus:0,minus:0},greedStat:c.greedStat,playerModifiers:c.playerModifiers};});
      const result=updateOriginalCommodityClassPrices({marketId:id,triggerCommodityId,month:9,phase:'native-final-iteration',coverage:'complete-demand-class',demandStat:m.demandByClass.get(demandClass)??stat(),commodities:rows});m.demandByClass.set(demandClass,result.demandStat);
      for(const row of result.commodities)Object.assign(m.commodity.get(row.commodityId),{stockpile:row.stockpile,greedStat:row.greedStat,playerModifiers:row.playerModifiers,prices:{demand:row.demandPrice,supply:row.supplyPrice}});events.push('prices:'+id+':'+triggerCommodityId);
    },advanceImmigration:(id,days,uiUpdateOnly)=>{
      const m=market(id),p=request(['population','spaceport','farming']);p.market={marketId:id,factionId:m.factionId,size:4,stability:m.stability,hostileToIndependent:false};p.factionIds.push('hegemony');p.hazard=m.hazardValue;p.accessibility=m.access;p.industries=m.local.commodityPass.industries;p.conditions=m.local.commodityPass.conditions;p.modifiers=m.modifiers;p.drugsAvailable=m.commodity.get('drugs').available;p.days=days;p.uiUpdateOnly=uiUpdateOnly;p.neighbors={econGroup:null,roster:entries.map(n=>({marketId:n.id,econGroup:null})),markets:entries.map(n=>({marketId:n.id,factionId:n.factionId,size:4,location:{x:0,y:0},hostileToTarget:false}))};const r=advanceOriginalPopulation({immigration:p,population:m.population,previousIncoming:m.incoming,playerOwned:false,inNewGameAdvance:false});m.population=r.state.population;m.incoming=r.state.previousIncoming;events.push('population:'+id+':'+r.iterations);
    },listUpdateListeners:()=>[],isEconomyListenerExpired:()=>assert.fail('no listeners'),removeUpdateListener:()=>assert.fail('no listeners'),commodityUpdated:()=>assert.fail('no listeners'),economyUpdated:()=>assert.fail('no listeners')};
  const r=new Runner(runtime,{mode:'scheduled',lastIteration}).run();assert.equal(r.phase,'done');assert.equal(r.scope,'native-economy-task-orchestration-only');assert.equal(events.filter(e=>e.startsWith('network:')).length,commodities.length);assert.equal(events.filter(e=>e.startsWith('prices:')).length,lastIteration?commodities.length*2:0);if(lastIteration)for(const m of entries){assert.equal(m.commodity.get('lobster').stockpile,123.75);assert.equal(m.commodity.get('lobster').prices.demand.variability,'V3');assert.notEqual(m.commodity.get('luxury_goods').stockpile,123.75);}assert.deepEqual(events.slice(0,2),['local:a:1','local:b:1']);assert.deepEqual(events.slice(-4),['local:a:2','local:b:2','population:a:100','population:b:100']);assert.ok(entries.every(m=>m.population&&m.industries===undefined&&m.industryFinances.length===3));assert.equal(r.asOfTick,undefined);assert.equal(r.inventory,undefined);
});


import { nativeCommodityCacheChecks } from './campaign-commodity-cache-native-oracle.mjs';
import { resolveOriginalCommodityMaxima as maxima } from '../src/campaign/rules/OriginalMarketEconomy.mjs';
test('original maxima, live export getter and cache identity match Java, including variant demand never read',()=>{
  const maximaCases=[],incomeCases=[];
  const quantities=[-9,-0.5,-0,0,0.49,0.5,1.5,7.49,7.5,65535.5];
  for(let i=0;i<160;i++){
    const commodityId=i%2?'lobster':'luxury_goods',industries=[];
    for(let k=0;k<i%6;k++)industries.push({id:'i'+k,supply:f(quantities[(i+k)%quantities.length]),demand:commodityId==='lobster'?NaN:f(quantities[(i+3*k)%quantities.length]),supplyLegal:(i+k)%3!==0,demandLegal:(i+k)%4!==0});
    maximaCases.push({commodityId,previousSupplyLegal:i%3===0,previousDemandLegal:i%5===0,industries});
  }
  // Strict >, not >=: first positive supply/demand winner determines legality on ties.
  for(const commodityId of ['luxury_goods','lobster'])maximaCases.push({commodityId,previousSupplyLegal:false,previousDemandLegal:false,industries:[{id:'first',supply:6,demand:7,supplyLegal:false,demandLegal:true},{id:'second',supply:6,demand:7,supplyLegal:true,demandLegal:false}]});
  for(let i=0;i<128;i++)incomeCases.push({sourceIsIllegal:i%9===0,exportMarketShare:f((i%17)/16),marketValue:f([0,37.91,99999.9,2e12,-37000][i%5]),incomeMult:stat(f((i%7-2)/3),[mod('flat',f((i%3)/10))],[mod('percent',f(i%13-6))],[mod('first',f(0.83)),mod('second',f(1.13))]),playerOwned:i%2===0,playerCommodityExportMult:i%2===0?f((i%5)/3):null});
  const native=nativeCommodityCacheChecks(maximaCases,incomeCases);assert.equal(native.length,291);
  for(let i=0;i<maximaCases.length;i++)assert.deepEqual({...maxima(maximaCases[i]),demandReads:maximaCases[i].commodityId==='lobster'?0:maximaCases[i].industries.length},native[i],'native maxima '+i);
  for(let i=0;i<incomeCases.length;i++)assert.equal(income(incomeCases[i]),native[maximaCases.length+i],'native late income '+i);
  const x=cacheFixture(),r=[x.cache.getExportIncome('a','food'),x.events.filter(e=>e.startsWith('capture:')).length];
  r.push(x.cache.get('a','food').serial,x.cache.get('b','food').serial);x.markets.get('b').econGroup='private';r.push(x.cache.get('b','food').serial);x.cache.rebuild('food',null);r.push(x.cache.get('a','food').serial,x.cache.get('b','food').serial);x.cache.rebuild('food','private');r.push(x.cache.get('b','food').serial);x.markets.get('removed').econGroup='empty';r.push(x.cache.get('removed','food').serial,x.cache.get('removed','food').serial,x.cache.peek('removed','food')===null?1:0);assert.deepEqual(r,native.at(-1));
});
test('primary constructor copies demand to variants but not references; own variant constructor clears only demand',()=>{
  const x=cacheFixture(),variants=new Map(),capture=x.runtime.capture;
  x.runtime.setDemandFromPrimary=(id,variantId,maxDemand,demandLegal)=>{assert.equal(variantId,'lobster');variants.set(id,{maxSupply:2,maxDemand,supplyLegal:true,demandLegal});};
  x.runtime.capture=(id,group)=>{const input=capture(id,group);if(id==='lobster')for(const row of input.network.markets){const previous=variants.get(row.marketId);assert.ok(previous.maxDemand>0);const amounts=maxima({commodityId:id,previousSupplyLegal:previous.supplyLegal,previousDemandLegal:previous.demandLegal,industries:[{id:'producer',supply:2,demand:NaN,supplyLegal:true,demandLegal:false}]});variants.set(row.marketId,amounts);row.amounts=amounts;}return input;};
  const primary=x.cache.get('a','luxury_goods');for(const id of x.live){assert.equal(variants.get(id).maxDemand,5);assert.equal(x.cache.peek(id,'lobster'),null);}
  const variant=x.cache.get('a','lobster');assert.equal(variant.data.marketValue,0);assert.equal(variant.data.network.commodityId,'lobster');for(const id of x.live){assert.equal(variants.get(id).maxDemand,0);assert.equal(variants.get(id).demandLegal,true);assert.equal(x.cache.peek(id,'lobster'),variant);assert.equal(x.cache.peek(id,'luxury_goods'),primary);}
  x.cache.rebuild('luxury_goods',null);for(const id of x.live){assert.equal(variants.get(id).maxDemand,5);assert.equal(x.cache.peek(id,'lobster'),variant);}
});
test('cache rejects recursive capture and asynchronous mutation hooks instead of publishing partial results',()=>{
  const x=cacheFixture();x.runtime.capture=()=>x.cache.get('a','food');rejects(()=>x.cache.get('a','food'));assert.equal(x.cache.peek('a','food'),null);
  const y=cacheFixture();y.runtime.setDemandFromPrimary=async()=>{};rejects(()=>y.cache.get('a','luxury_goods'));assert.equal(y.cache.peek('a','luxury_goods'),null);
  const z=cacheFixture();z.runtime.apply=async()=>{};rejects(()=>z.cache.get('a','food'));assert.equal(z.cache.peek('a','food'),null);
});


import { resolveOriginalCommodityFinance } from '../src/campaign/rules/OriginalCommodityFinance.mjs';
import { reapplyOriginalIndustryCommodityPass } from '../src/campaign/rules/OriginalIndustryCommodityPass.mjs';
test('variant aggregation creates lazy supply entries but not artificial industry demand entries',()=>{
  const p=financialInput(['spaceport']).commodityPass;p.commodities=[{commodityId:'lobster',previousSupplyLegal:false,previousDemandLegal:true}];
  const r=reapplyOriginalIndustryCommodityPass(p);assert.equal(r.commodities.lobster.maxDemand,0);assert.equal(r.commodities.lobster.demandLegal,true);for(const i of r.industries){assert.ok(Object.hasOwn(i.state.supply,'lobster'));assert.ok(!Object.hasOwn(i.state.demand,'lobster'));}
});
test('variant zero-value economy still computes native producer shares and cached financial getters',async()=>{
  const {nativeFinanceSnapshots}=await import('./campaign-finance-native-oracle.mjs'),groups=[],expected=[];
  for(let seed=0;seed<32;seed++){
    const x=cacheFixture();for(const [i,id]of x.live.entries()){const m=x.markets.get(id);m.amounts={maxSupply:(seed+i)%8,maxDemand:0,supplyLegal:seed%3!==0,demandLegal:seed%4!==0};m.available=(seed+3*i)%9;m.access=stat(0,[mod('external',f((seed%7-2)/10))]).modifiers;m.owned=i===0;m.skill=i===0?f(1.13):null;}
    const input=x.runtime.capture('lobster',null),r=resolveOriginalCommodityFinance(input);groups.push({input,network:r.network});expected.push(Object.fromEntries(['rawMarketValue','marketValue','marketValuePerFaction','totalWeight','markets','sortedProducers','sortedConsumers'].map(k=>[k,r[k]])));
    assert.equal(r.marketValue,0);assert.ok(r.markets.every(m=>m.exportIncome===0));
  }
  assert.deepEqual(nativeFinanceSnapshots([],groups),expected);
});

import { updateOriginalCommodityClassPrices } from '../src/campaign/rules/OriginalCommodityClassPricing.mjs';
import { ORIGINAL_MARKET_ECONOMY as EconomySpecs } from '../src/campaign/rules/OriginalMarketEconomy.mjs';

test('actual native economy listeners retain live ship quality and apply smuggling, expiry and explicit-zero base bonuses',()=>{
 const bonus=()=>({flat:[],percent:[],mult:[]}),commodity=(n)=>({available:{base:n,modifiers:bonus()},maxSupply:n,maxDemand:0});
 const make=(id,n,q)=>({marketId:id,factionId:'independent',econGroup:null,hidden:false,retail:{unresolved:[],submarkets:[{specId:'local_resources'}],otherSubmarkets:[]},commodities:{ships:commodity(n),food:commodity(0)},economyBonuses:Object.fromEntries(['production_quality_mod','fleet_quality_mod','combat_fleet_size_mult','patrol_num_light_mod','patrol_num_medium_mod','patrol_num_heavy_mod'].map(key=>[key,key==='production_quality_mod'?{flat:[{id:'quality',value:Math.fround(q)}],percent:[],mult:[]}:bonus()]))});
 const markets={a:make('a',2,0.5),b:make('b',4,0.2)},object=(ref,kind)=>({objectRef:ref,classAlias:'fixture',kind,marketId:kind==='ship-quality'?null:'a',marketRef:null,ended:null,tier:kind==='pirate-base'?'TIER_1_1MODULE':null,large:kind==='pather-base'?false:null,submarketSpecId:kind==='local-resources'?'local_resources':null});
 const capture={scope:'native-economy-update-listeners',roster:['quality','pirate','pather','local','local'],objects:{quality:object('quality','ship-quality'),pirate:object('pirate','pirate-base'),pather:object('pather','pather-base'),local:object('local','local-resources')},unresolved:[]};let getters=0;
 const listeners=new OriginalEconomyUpdateListeners(capture,{market:id=>markets[id],marketIds:()=>['a','b'],getCommodityData:id=>{getters++;if(id==='a'){markets.a.commodities.ships.available.base=5;markets.a.commodities.ships.maxSupply=5;}},getShipping:()=>({inFaction:1}),isPaused:()=>false});
 markets.a.hidden=true;assert.deepEqual(listeners.qualityData('quality','a').quality.flat,[]);assert.deepEqual(listeners.qualityData('quality','b').quality.flat,[]);markets.a.hidden=false;
 listeners.economyUpdated('quality');const data=listeners.qualityData('quality','b');assert.equal(getters,2);assert.equal(data.marketId,'a');assert.equal(data.prod,5);assert.equal(data.quality,markets.a.economyBonuses.production_quality_mod);
 data.quality.flat[0].value=0.75;assert.equal(listeners.snapshot().shipQuality.quality.independent_null.quality.flat[0].value,0.75);
 const food=markets.a.commodities.food;food.maxDemand=3;food.available.base=Math.fround(0.4);food.available.modifiers.flat=[{id:'a',value:2},{id:'p1',value:Math.fround(0.4)},{id:'p2',value:Math.fround(0.4)},{id:'penalty',value:-20}];listeners.commodityUpdated('pirate','food');assert.equal(food.available.modifiers.flat.find(r=>r.id==='a').value,3);
 food.available.base=10;listeners.commodityUpdated('pirate','food');assert.equal(food.available.modifiers.flat.find(r=>r.id==='a').value,3);
 listeners.economyUpdated('pirate');assert.deepEqual(markets.a.economyBonuses.fleet_quality_mod.flat,[{id:'a',value:0}]);assert.deepEqual(markets.a.economyBonuses.patrol_num_light_mod.flat,[]);
 listeners.economyUpdated('pather');assert.equal(markets.a.economyBonuses.patrol_num_light_mod.flat[0].value,3);assert.equal(markets.a.economyBonuses.combat_fleet_size_mult.flat[0].value,0.5);
 assert.equal(listeners.expired('local'),false);markets.a.retail.submarkets=[];assert.equal(listeners.expired('local'),true);listeners.remove('local');assert.equal(listeners.roster().filter(ref=>ref==='local').length,1);listeners.listener('pirate').ended=true;assert.equal(listeners.expired('pirate'),true);
});


test('native task frame budget yields at the average-cost branch and never advances the next task in the same frame',()=>{
 const x=taskFixture(taskConfig()),r=new Runner(x.runtime,{mode:'scheduled',lastIteration:false});
 let n=0;const first=r.advanceTask('MainWorkTask2',{nowSeconds:()=>[0,0.0006][n++]});
 assert.equal(first.batches,1);assert.equal(first.complete,false);assert.deepEqual(x.trace,[]);
 let inspected=false;const main=r.advanceTask('MainWorkTask2',{nowSeconds:()=>{if(!inspected){inspected=true;assert.throws(()=>r.checkpoint(),/running economy batch/);}return 0;}});
 assert.equal(main.complete,true);assert.equal(main.status.phase,'reapply-again');assert.equal(x.trace.filter(t=>t==='industries:a').length,1);
 assert.throws(()=>r.advanceTask('FinishEconomyUpdateTask'),/skip earlier/);
 const again=r.advanceTask('UpdateMarketsAgainTask',{nowSeconds:()=>0});assert.equal(again.complete,true);assert.equal(again.status.phase,'immigration');
 assert.ok(!x.trace.some(t=>t.startsWith('immigration:')));
});


import {originalMonthlyRestockingCharge,originalCurrentMonthlyReport,computeOriginalMonthlyTotals,originalCoreEconomyMonthEnd,ORIGINAL_MONTHLY_REPORT_IDS as MonthlyIds} from '../src/campaign/rules/OriginalMonthlyReport.mjs';
import {originalResourceQuantity} from '../src/campaign/rules/OriginalResourceCargo.mjs';
test('local resource month-end bills actual net stacks once, preserves partials and independent manager registrations',()=>{
 const f=Math.fround,accounts={scope:'native-core-monthly-accounts',schemaVersion:1,serial:0,current:null,previous:null,credits:{objectRef:'credits',value:1000},messages:[]};
 const cargo=(id,rows,partials=null)=>({objectRef:id,unlimitedStacks:true,slots:rows.map(([commodityId,size])=>({objectRef:null,type:'RESOURCES',commodityId,size:f(size),maxSize:1000000,roundSize:false,cargoSpacePerUnit:1})),partials,spaceUsed:0,extraCargoUsed:0,unresolved:[]});
 const local={objectRef:'local',classAlias:'LocalResourcesSubmarketPlugin',kind:'local-resources',marketId:'colony',marketRef:'market',ended:null,tier:null,large:null,submarketSpecId:'local_resources',taken:cargo('taken',[['supplies',5],['food',3]],{RESOURCESsupplies:f(0.25)}),left:cargo('left',[['supplies',2],['fuel',4]])};
 const capture={scope:'native-economy-update-listeners',roster:['local','local'],managedRoster:['other','local'],objects:{local},unresolved:[]};
 const market={playerOwned:true,retail:{unresolved:[],submarkets:[],otherSubmarkets:[{specId:'local_resources'}]}};
 const calls=[],runtime={market:()=>market,marketIds:()=>['colony'],getCommodityData:()=>{},getShipping:()=>({inFaction:0}),isPaused:()=>false,chargeRestocking:(id,c,q)=>{calls.push([id,c,q]);return originalMonthlyRestockingCharge(accounts,{id:c,objectRef:id+':'+c},q);}};
 let listeners=new OriginalEconomyUpdateListeners(capture,runtime);
 assert.equal(listeners.reportEconomyTick('local',8).billedStacks,0);assert.equal(accounts.current,null);
 assert.equal(listeners.reportEconomyTick('local',9).billedStacks,2);assert.deepEqual(calls,[['colony','supplies',3],['colony','food',3]]);
 const live=listeners.listener('local');assert.equal(live.taken.slots.length,0);assert.equal(live.taken.partials.RESOURCESsupplies,f(0.25));assert.equal(originalResourceQuantity(live.left,'fuel'),4);assert.equal(originalResourceQuantity(live.left,'supplies'),0);
 const get=(...path)=>path.reduce((n,k)=>n.children.find(row=>row[0]===k)[1],originalCurrentMonthlyReport(accounts).root);
 const bill=get(MonthlyIds.OUTPOSTS,MonthlyIds.RESTOCKING),supplies=get(MonthlyIds.OUTPOSTS,MonthlyIds.RESTOCKING,'supplies');
 assert.equal(supplies.upkeep,300);assert.equal(supplies.custom2.value,3);assert.equal(computeOriginalMonthlyTotals(accounts.current).upkeep,360);
 // Another colony's stack goes into the same bill, keeping both tooltip cargo and quantity history.
 originalMonthlyRestockingCharge(accounts,{id:'supplies',objectRef:'second:supplies'},f(0.5));
 assert.equal(get(MonthlyIds.OUTPOSTS,MonthlyIds.RESTOCKING),bill);assert.equal(supplies.upkeep,350);assert.equal(supplies.custom2.value,3.5);assert.equal(supplies.custom.objectRef,'second:supplies');assert.equal(supplies.name,'补给 ×4');
 originalMonthlyRestockingCharge(accounts,{id:'ore',objectRef:'second:ore'},f(0.25));assert.equal(get(MonthlyIds.OUTPOSTS,MonthlyIds.RESTOCKING,'ore').custom2.value,1);
 const before=structuredClone(accounts);listeners.reportEconomyMonthEnd('local');assert.deepEqual(accounts,before);
 listeners=OriginalEconomyUpdateListeners.fromCheckpoint(JSON.parse(JSON.stringify(listeners.checkpoint())),runtime);assert.equal(listeners.reportEconomyTick('local',9).billedStacks,0);assert.deepEqual(accounts,before);
 const report=accounts.current,total=computeOriginalMonthlyTotals(report).upkeep;
 originalCoreEconomyMonthEnd(accounts,{isTutorialInProgress:()=>false,marketIds:()=>[],market:()=>assert.fail(),getIncentiveCredits:()=>assert.fail(),setIncentiveCredits:()=>assert.fail(),doCustomProduction:()=>{},timestamp:()=>100});assert.equal(accounts.previous,report);assert.equal(accounts.credits.value,1000-total);assert.equal(accounts.messages.length,1);
 // Losing ownership clears taken without billing or consuming left; expiration removes only the manager entry.
 market.playerOwned=false;listeners.listener('local').taken=cargo('new-taken',[['supplies',10]],{RESOURCESsupplies:f(0.5)});const leftBefore=structuredClone(listeners.listener('local').left);
 assert.equal(listeners.reportEconomyTick('local',9).billedStacks,0);assert.deepEqual(listeners.listener('local').left,leftBefore);assert.equal(listeners.listener('local').taken.partials.RESOURCESsupplies,0.5);
 market.retail.otherSubmarkets=[];assert.equal(listeners.reportEconomyMonthEnd('local').registered,false);assert.deepEqual(listeners.managedRoster(),['other']);assert.deepEqual(listeners.roster(),['local','local']);
 const restored=OriginalEconomyUpdateListeners.fromCheckpoint(listeners.checkpoint(),runtime);assert.deepEqual(restored.managedRoster(),['other']);
});


import {OriginalEconomyNotifications} from '../src/campaign/rules/OriginalEconomyNotifications.mjs';
test('native stipend assigns rather than accumulates and playthrough keeps first farthest long sample across restore',()=>{
 const state={scope:'native-core-monthly-accounts',schemaVersion:1,serial:0,current:null,previous:null,credits:{objectRef:'credits',value:500},messages:[]};
 const capture={scope:'native-saved-economy-notifications',schemaVersion:1,sectorRoster:[],managedRoster:['log','stipend'],objects:{
  log:{objectRef:'log',classAlias:'PlaythroughLog',kind:'playthrough-log',stats:[{objectRef:'credits',id:'credits',kind:'credits',accrued:['120','80']},{objectRef:'crew',id:'crew',kind:'crew',accrued:['9223372036854775807','-9223372036854775808']}],data:[{timestamp:1,data:[['credits','100'],['crew','0']]}]},
  stipend:{objectRef:'stipend',classAlias:'GalatianAcademyStipend',kind:'academy-stipend',startTime:1},
 },academyFlag:{key:'$playerReceivingGAStipend',present:true,value:true},unresolved:[]};
 let roster=['log','stipend'],days=1115,newGame=true;
 const runtime={managedRoster:()=>roster,removeManagedListener:ref=>{roster=roster.filter(id=>id!==ref);},isInNewGameAdvance:()=>newGame,hasPlayerFleet:()=>true,elapsedDaysSince:()=>days,marketExists:()=>true,monthlyAccounts:()=>state,timestamp:()=>2};
 let receivers=new OriginalEconomyNotifications(capture),callbacks=receivers.callbacks(runtime);callbacks.reportManagedEconomyTick(8);assert.equal(state.current,null);
 callbacks.reportManagedEconomyTick(9);const stipend=state.current.root.children[0][1].children[0][1];assert.equal(stipend.income,15000);callbacks.reportManagedEconomyTick(9);assert.equal(stipend.income,15000);assert.equal(roster.includes('stipend'),true); // Exactly 1115 days is still eligible.
 receivers=OriginalEconomyNotifications.fromCheckpoint(JSON.parse(JSON.stringify(receivers.checkpoint())));callbacks=receivers.callbacks(runtime);newGame=false;callbacks.reportManagedEconomyMonthEnd();
 const snapshot=receivers.snapshot().objects.log.data[1];assert.deepEqual(snapshot.data,[['credits','120'],['crew','9223372036854775807']]);assert.ok(receivers.snapshot().objects.log.stats.every(s=>s.accrued.length===0));
 newGame=true;days=1115.5;callbacks.reportManagedEconomyTick(9);assert.deepEqual(roster,['log']);assert.equal(receivers.snapshot().academyFlag.present,false);assert.equal(stipend.income,15000); // Expiry does not erase an already accrued bill.
 originalCoreEconomyMonthEnd(state,{isTutorialInProgress:()=>false,marketIds:()=>[],doCustomProduction:()=>{},timestamp:()=>3});assert.equal(state.credits.value,15500);
});
