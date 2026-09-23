import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { CampaignError } from '../src/campaign/core/Values.mjs';
import { ORIGINAL_POPULATION as R, newOriginalPopulation as population, advanceOriginalPopulation as advance, originalPopulationGrowthPlan as plan } from '../src/campaign/rules/OriginalPopulation.mjs';
import { replaceOriginalPopulationConditions as replaceConditions, reapplyOriginalPopulationGrowth as reapplyGrowth } from '../src/campaign/rules/OriginalPopulationGrowth.mjs';
import { newOriginalMarketHazard } from '../src/campaign/rules/OriginalColonyEnvironment.mjs';
import { newOriginalIndustryFinances } from '../src/campaign/rules/OriginalMarketFinance.mjs';
import { computeOriginalIncoming } from '../src/campaign/rules/OriginalImmigration.mjs';
import { nativePopulationSnapshots } from './campaign-population-native-oracle.mjs';
import { f, mod, stat, condition, callback, request, financialInput } from './campaign-immigration-fixtures.mjs';
const empty = () => ({composition:[],weight:stat()});
const state = () => ({immigration:request(),population:null,previousIncoming:null,playerOwned:false,inNewGameAdvance:false});
const rejects = fn => assert.throws(fn,e=>e instanceof CampaignError);
function setSize(p,size){p.immigration.market.size=size;p.immigration.neighbors.markets[0].size=size;}
function nearThreshold(p,weight=1195){p.population=structuredClone(population(p.immigration.market.factionId,p.immigration.market.size));p.population.weight.modifiers.flat[0].value=weight;p.previousIncoming=empty();p.immigration.days=30;}
function driver(reads,calls=[]){let serial=0;return q=>{
  const p=structuredClone(q.immigration),r=reads[q.plan.toSize];
  for(const id of q.plan.removeConditionIds)calls.push('remove:'+id);calls.push('add:'+q.plan.addConditionId,'setSize:'+q.plan.toSize,'reapplyConditions','reapplyIndustries');
  p.conditions=replaceConditions({conditions:p.conditions,fromSize:q.plan.fromSize,newModId:q.plan.addConditionId+'_generated'+(++serial),suppressed:false});p.market.size=q.plan.toSize;p.neighbors.markets.find(m=>m.marketId===p.market.marketId).size=q.plan.toSize;
  if(r){p.market.stability=r.stability;p.maxMarketSize=stat(0,[mod('driver',r.maxSize-6)]).modifiers;}
  return {immigration:p,playerOwned:r?.playerOwned??q.playerOwned,inNewGameAdvance:r?.inNewGameAdvance??q.inNewGameAdvance,effects:{size:q.plan.toSize}};
};}

test('population sources pin original lazy getters, condition identity and no-op population plugin',()=>{const p=spawnSync(process.execPath,['scripts/import-campaign-population.mjs','--check'],{encoding:'utf8',windowsHide:true});assert.equal(p.status,0,p.stdout+p.stderr);assert.equal(Object.keys(R.sources).length,54);assert.ok(Object.keys(R.sources).some(s=>s.endsWith('/MarketCondition.java')));});
test('UI-only computes incoming once without initializing population, but consumes first incoming state',()=>{const p=state();p.immigration.uiUpdateOnly=true;p.immigration.incentives.on=true;const r=advance(p);assert.equal(r.iterations,0);assert.equal(r.state.population,null);assert.notEqual(r.state.previousIncoming,null);assert.equal(r.incentiveAccrued,0);const next=structuredClone(r.state);next.immigration.uiUpdateOnly=false;next.immigration.days=0;const r2=advance(next);assert.equal(r2.iterations,1);assert.equal(r2.firstTime,false);assert.equal(r2.state.population.weight.modifiers.flat[0].value,600);});
test('first non-UI population initialization uses 100 weighted iterations even with zero elapsed days',()=>{const p=state();p.immigration.days=0;p.immigration.incentives.on=true;const r=advance(p);assert.equal(r.iterations,100);assert.equal(r.incentiveAccrued,0);assert.equal(r.state.population.weight.modifiers.flat[0].value,1200);assert.equal(r.state.immigration.market.size,4);assert.ok(r.state.population.composition.some(x=>x.factionId==='pirates'&&x.amount>0));});
test('negative growth floors at the current-size population and does not shrink the market',()=>{const p=state();p.previousIncoming=empty();p.immigration.hazard=5;p.immigration.days=30;p.immigration.market.stability=0;const r=advance(p);assert.equal(r.state.immigration.market.size,4);assert.equal(r.state.population.weight.modifiers.flat[0].value,600);assert.equal(r.growths.length,0);});
test('growth comparison is strictly greater than threshold, and a missing growth driver fails instead of faking an event',()=>{const p=state();p.playerOwned=true;nearThreshold(p,1191);assert.equal(computeOriginalIncoming(p.immigration).weightValue,9);assert.equal(advance(p).state.immigration.market.size,4);p.population.weight.modifiers.flat[0].value=1192;const before=structuredClone(p);rejects(()=>advance(p));assert.deepEqual(p,before);});
test('actual growth reapplication affects same-iteration conversion; incoming and incentive cost are not recomputed',()=>{const p=state();p.playerOwned=true;p.immigration.incentives.on=true;nearThreshold(p);const expected=computeOriginalIncoming(p.immigration),calls=[],r=advance(p,driver({5:{stability:0,maxSize:5,playerOwned:true,inNewGameAdvance:false}},calls));assert.equal(r.state.immigration.market.size,5);assert.equal(r.state.immigration.market.stability,0);assert.deepEqual(r.state.previousIncoming,expected.incoming);assert.equal(r.state.immigration.incentives.credits,expected.incentives.credits);assert.equal(r.state.immigration.incentives.on,false);assert.deepEqual(r.notifications,[{type:'colony-size-increased',marketId:'m',size:5}]);assert.equal(calls.at(-1),'reapplyIndustries');assert.equal(calls.filter(x=>x==='remove:population_4').length,2);});
test('new-game advance always holds native minimum and never triggers size growth',()=>{const p=state();p.playerOwned=true;p.inNewGameAdvance=true;nearThreshold(p,2000);const r=advance(p);assert.equal(r.growths.length,0);assert.equal(r.state.population.weight.modifiers.flat[0].value,600);});
test('non-player and max-size population normalization retain native overwrite-to-max behavior',()=>{for(const owned of [false,true]){const p=state();p.playerOwned=owned;nearThreshold(p);if(owned)p.immigration.maxMarketSize=stat(0,[mod('cap',-2)]).modifiers;const r=advance(p);assert.equal(r.state.population.weight.modifiers.flat[0].value,1200);assert.equal(r.state.immigration.market.size,4);assert.equal(r.growths.length,0);}});
test('condition replacement removes all native population IDs without clobbering other conditions or reusing identities',()=>{const conditions=[condition('population_2','old2'),condition('habitable','hab'),condition('population_4','old4')],before=structuredClone(conditions),r=replaceConditions({conditions,fromSize:4,newModId:'fresh',suppressed:true});assert.deepEqual(r,[condition('habitable','hab'),{...condition('population_5','fresh'),suppressed:true}]);assert.deepEqual(conditions,before);rejects(()=>replaceConditions({conditions,fromSize:4,newModId:'old2',suppressed:false}));assert.deepEqual(plan(4).removeConditionIds.at(-1),'population_4');rejects(()=>plan(10));});
test('local growth reapplication connects environment, new demand, stability, finances and accessibility before conversion',()=>{
  const p=state();p.immigration=request(['population','spaceport','farming']);p.immigration.conditions=[condition('habitable'),condition('population_4','oldPop')];p.immigration.modifiers.transient.push(callback('condition','habitable'));p.playerOwned=true;nearThreshold(p);let reapplication;
  const r=advance(p,q=>{
    const immigration=structuredClone(q.immigration);immigration.market.size=q.plan.toSize;immigration.neighbors.markets[0].size=q.plan.toSize;immigration.conditions=replaceConditions({conditions:immigration.conditions,fromSize:q.plan.fromSize,newModId:'population_5_fresh',suppressed:false});
    const local=financialInput(['population','spaceport','farming']);local.commodityPass.marketSize=q.plan.toSize;local.commodityPass.conditions=immigration.conditions;local.commodityPass.industries=immigration.industries;local.governance.markets[0].playerOwned=true;
    reapplication=reapplyGrowth({fromSize:q.plan.fromSize,immigration,environmentalFinancial:{hazard:newOriginalMarketHazard(),modifiers:immigration.modifiers,financial:{local,industryFinances:immigration.industries.map(i=>newOriginalIndustryFinances(i.state.industryId))}},hasSpaceport:true,firstQueuedIndustryHasSpaceportTag:false});
    return {immigration:reapplication.immigration,playerOwned:true,inNewGameAdvance:false,effects:reapplication};
  });
  assert.equal(r.state.immigration.market.size,5);assert.equal(r.state.immigration.market.stability,reapplication.environmentalFinancial.financial.localEffects.values.stability);assert.equal(r.state.immigration.hazard,0.75);assert.ok(r.state.immigration.accessibility.flat.some(m=>m.id==='ind_population_1'));assert.equal(r.state.immigration.industries[0].state.demand.food.modifiers.flat.find(m=>m.id==='ind_population_0').value,5);assert.equal(r.growths[0].effects.scope,'local-growth-reapplication-only');assert.ok(Object.isFrozen(r.state.population.composition));
});
test('malformed population and invalid/async/stale/double-billing drivers reject without mutating input',()=>{
  for(const mutate of [p=>p.population={},p=>p.previousIncoming=false,p=>p.population={composition:[{factionId:'x',amount:NaN}],weight:stat()},p=>p.population={composition:[{factionId:'x',amount:1},{factionId:'x',amount:1}],weight:stat()},p=>p.playerOwned='yes']){const p=state();mutate(p);rejects(()=>advance(p));}
  const p=state();p.playerOwned=true;nearThreshold(p);const before=structuredClone(p);
  for(const mutate of [r=>r.immigration.market.size=4,r=>r.immigration.days=0,r=>r.immigration.incentives.credits++,r=>r.immigration.market.marketId='other'])rejects(()=>advance(p,q=>{const r=driver({})(q);mutate(r);return r;}));
  rejects(()=>advance(p,async q=>driver({})(q)));assert.deepEqual(p,before);
});

test('original full advance/increase/lazy-getter differential across 192 population states and dynamic growth readbacks',()=>{
  const cases=[];let seed=0x50a1;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  for(let k=0;k<192;k++){
    const p=state(),size=3+k%4;setSize(p,size);p.playerOwned=k%3!==0;p.inNewGameAdvance=k%13===0;p.immigration.uiUpdateOnly=k%9===0;p.immigration.market.stability=k%11;p.immigration.days=f([0,0.0001,0.3,1,15,30][k%6]);p.immigration.hazard=f([0.75,1,1.025,1.5,3.5][k%5]);p.immigration.incentives={on:k%2===0,credits:f(random()*1000)};p.immigration.accessibility=stat(0,[mod('external_access',f(random()*2))]).modifiers;
    if(k%4!==0)p.previousIncoming=empty();if(k%5!==0){p.population=structuredClone(population('player',size));p.population.composition.push({factionId:'pirates',amount:f(random()*100)},{factionId:'removed_faction',amount:50});p.population.weight.modifiers.flat[0].value=f((300*2**(size-3))*[0.9,1,1.99,2.1][k%4]);if(k%7===0){p.population.weight.base=10;p.population.weight.modifiers.flat.push(mod('external',15));p.population.weight.modifiers.percent.push(mod('pct',10));p.population.weight.modifiers.mult.push(mod('mult',f(0.9)));}}
    p.immigration.conditions=[condition('habitable'),condition('population_'+size,'oldPop'),condition('population_2','extraPop')];p.immigration.modifiers.transient.push(callback('condition','habitable'));p.immigration.maxMarketSize=stat(0,[mod('cap',(k%3)-1)]).modifiers;
    if(k%8===0)p.immigration.factionIds=p.immigration.factionIds.filter(id=>id!=='poor');
    const growthReads={};for(let s=4;s<=9;s++)growthReads[s]={stability:(k+s)%11,maxSize:5+k%3,playerOwned:k%17!==0,inNewGameAdvance:k%19===0};cases.push({state:p,growthReads});
  }
  const native=nativePopulationSnapshots(cases);assert.equal(native.length,cases.length);let growthCount=0;
  for(let i=0;i<cases.length;i++){const calls=[],r=advance(cases[i].state,driver(cases[i].growthReads,calls)),s=r.state;growthCount+=r.growths.length;assert.deepEqual({population:s.population,incoming:s.previousIncoming,size:s.immigration.market.size,stability:s.immigration.market.stability,incentives:s.immigration.incentives,playerOwned:s.playerOwned,inNewGameAdvance:s.inNewGameAdvance,calls,conditions:s.immigration.conditions.map(c=>c.id),notifications:r.notifications.length},native[i],'native population '+i);}
  assert.ok(growthCount>15,'Differential must exercise actual resizing, not only no-growth cases');
});

test('original continuous population evolution and incentive float accrual across 24 multi-update histories',()=>{
  const cases=[];for(let i=0;i<24;i++){const p=state();p.immigration.incentives={on:true,credits:f(0.1)};p.immigration.market.stability=i%11;p.immigration.hazard=f(1+(i%8)*0.075);p.immigration.factionIds=p.immigration.factionIds.filter(id=>i%2||id!=='poor');const steps=Array.from({length:31},(_,k)=>({days:f([0.01,0.1,0.3,1,2][(k+i)%5]),uiUpdateOnly:k%7===0}));cases.push({state:p,growthReads:{},steps});}
  const native=nativePopulationSnapshots(cases);
  for(let i=0;i<cases.length;i++){let p=structuredClone(cases[i].state);for(const step of cases[i].steps){p.immigration.days=step.days;p.immigration.uiUpdateOnly=step.uiUpdateOnly;p=structuredClone(advance(p).state);}assert.deepEqual({population:p.population,incoming:p.previousIncoming,size:p.immigration.market.size,stability:p.immigration.market.stability,incentives:p.immigration.incentives,playerOwned:p.playerOwned,inNewGameAdvance:p.inNewGameAdvance,calls:[],conditions:[],notifications:0},native[i],'native history '+i);}
});
