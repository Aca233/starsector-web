import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import {checkNavigationPhaseIndex} from './lib/navigation-phase-index-contracts.mjs';
import { navigationReference } from './lib/navigation-reference.mjs';
import { checkNavigationSweeps, instrumentNavigationSweep } from './lib/navigation-sweep-contracts.mjs';
const out = path.resolve('artifacts/simulation-hotpaths', Date.now() + '-' + process.pid);
const hullModBaseline = process.env.HULLMOD_BASELINE;
const navigationSweepBaseline = process.env.NAVIGATION_SWEEP_BASELINE;
const navigationBaseline = navigationSweepBaseline ?? process.env.NAVIGATION_BASELINE;
fs.mkdirSync(out, { recursive: true });
await build({ stdin: { loader: 'ts', resolveDir: process.cwd(), contents: `
 export {avoidCollisions, forwardPathClear} from './src/engine/ai/TacticalNavigation';
 ${navigationSweepBaseline ? `export {sweepRisk as candidateRisk, sweepProbe as candidateProbe} from './src/engine/ai/TacticalNavigation'; export {sweepRisk as beforeRisk, sweepProbe as beforeProbe} from 'navigation-before';` : ''}
 export {NavigationObstacleIndex} from './src/engine/ai/NavigationObstacleIndex';
 export {FireControlQueryRoster} from './src/engine/ai/FireControlQueryBatch';
 export {avoidCollisions as reference} from 'navigation-reference';
 export {avoidCollisions as phaseReference, forwardPathClear as phaseReferenceForward} from 'navigation-before';
 export {updateProjectionArray} from './src/engine/runtime/local/ProjectionArrays';
 export {RenderShipProjection} from './src/engine/runtime/local/RenderShipProjection';
 export {LocalCombatKernel} from './src/engine/runtime/local/LocalCombatKernel';
 export {Vector2} from './src/engine/math/Vector2';
 export {Ship} from './src/engine/simulation/Ship';
 export {containsVastBulk} from './src/engine/extensions/HullModPresence';
 export {immutableCopy} from './src/engine/extensions/Immutable';
 export {installedHullMods, hasOnlyNativeRangeModifiers, hullModDefinitions, hullModRangeFlat} from './src/engine/extensions/HullMods';
 ${hullModBaseline ? 'export * as beforeHullMods from "hullmods-reference";' : ''}
` }, outfile: path.join(out, 'core.mjs'), bundle: true, platform: 'node', format: 'esm',
 define: { 'import.meta.env': JSON.stringify({ BASE_URL: '/' }) }, plugins: [{ name: 'navigation-reference', setup(b) {
  if (navigationSweepBaseline) b.onLoad({filter:/TacticalNavigation\.ts$/,namespace:'file'},info=>({contents:instrumentNavigationSweep(fs.readFileSync(info.path,'utf8')),loader:'ts',resolveDir:path.dirname(info.path)}));
  if (hullModBaseline) {
  b.onResolve({ filter: /^hullmods-reference$/ }, () => ({path:'reference',namespace:'hullmods-reference'}));
  b.onLoad({filter:/.*/,namespace:'hullmods-reference'},()=>({contents:fs.readFileSync(hullModBaseline,'utf8'),loader:'ts',resolveDir:path.resolve('src/engine/extensions')}));
 }
 b.onResolve({filter:/^navigation-before$/},()=>({path:'before',namespace:'navigation-before'}));
 b.onLoad({filter:/.*/,namespace:'navigation-before'},()=>({contents:navigationSweepBaseline?instrumentNavigationSweep(fs.readFileSync(navigationSweepBaseline,'utf8')):navigationBaseline?fs.readFileSync(navigationBaseline,'utf8'):navigationReference,loader:'ts',resolveDir:path.resolve('src/engine/ai')}));
 b.onResolve({ filter: /^navigation-reference$/ }, () => ({ path: 'reference', namespace: 'reference' }));
  b.onLoad({ filter: /.*/, namespace: 'reference' }, () => ({ contents: navigationReference, loader: 'ts', resolveDir: path.resolve('src/engine/ai') }));
 } }] });
const { Ship, containsVastBulk, immutableCopy, avoidCollisions, forwardPathClear, phaseReference, phaseReferenceForward, NavigationObstacleIndex, FireControlQueryRoster, reference, updateProjectionArray, RenderShipProjection, LocalCombatKernel, Vector2, installedHullMods, hasOnlyNativeRangeModifiers, hullModDefinitions, hullModRangeFlat, beforeHullMods, candidateRisk, beforeRisk, candidateProbe, beforeProbe } = await import(pathToFileURL(path.join(out, 'core.mjs')));
let checks = 0;
const equal = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
// Performance runs use a fresh realm BEFORE any contracts replace intrinsics.
// Restoring Array.prototype.every cannot restore V8's invalidated assumptions.
if(process.env.HULLMOD_BENCHMARK_ONLY==='true') { benchmarkHullQualification(); process.exit(0); }
// Compare the original getter, including observable reads, not just final booleans.
const originalVastBulk = function () { return !!(this.spec.builtInHullMods?.includes('vastbulk') || this.spec.hullMods?.includes('vastbulk')); };
const optimizedVastBulk = Object.getOwnPropertyDescriptor(Ship.prototype, 'hasVastBulk').get;
for (const source of [[], ['vastbulk'], ['x', 'vastbulk'], ['x', 'y']]) {
 const mods = immutableCopy(source), spec = immutableCopy({builtInHullMods:source, hullMods:[]});
 for(let i=0;i<3;i++) equal(optimizedVastBulk.call({spec}),originalVastBulk.call({spec}),'registered immutable list '+i);
 equal(containsVastBulk(mods),source.includes('vastbulk'),'direct membership');
}
const liveMods = [], shallowSpec = Object.freeze({builtInHullMods:liveMods,hullMods:[]});
equal(optimizedVastBulk.call({spec:shallowSpec}),false,'shallow freeze is not deep metadata');
liveMods.push('vastbulk');equal(optimizedVastBulk.call({spec:shallowSpec}),true,'live array edit');
liveMods.length=0;equal(optimizedVastBulk.call({spec:shallowSpec}),false,'live array removal');
for(const getter of [originalVastBulk,optimizedVastBulk]) {
 let reads=0;const ship={get spec(){return ++reads===1?{builtInHullMods:[]}:{hullMods:['vastbulk']};}};
 equal(getter.call(ship),true,'spec must be re-read after first miss');equal(reads,2,'two spec reads');
 reads=0;const short={get spec(){reads++;return {builtInHullMods:['vastbulk'],get hullMods(){throw Error('short-circuit violated');}};}};
 equal(getter.call(short),true,'built-in short circuit');equal(reads,1,'one spec read on hit');
}
const observable = getter => {
 const log=[], mods={get includes(){log.push('method');return function(id){log.push(['call',this===mods,id]);return false;};}};
 const spec={get builtInHullMods(){log.push('built-in');return mods;},get hullMods(){log.push('installed');return {includes(id){log.push(['installed-call',id]);return true;}};}};
 const ship={get spec(){log.push('spec');return spec;}};
 return {value:getter.call(ship),log};
};
equal(observable(optimizedVastBulk),observable(originalVastBulk),'method/getter/this/short-circuit order');
let dynamic=false, accessorReads=0;
const frozenAccessor=Object.freeze(Object.defineProperty([],0,{get(){accessorReads++;return dynamic?'vastbulk':'x';},enumerable:true,configurable:true}));
equal(containsVastBulk(frozenAccessor),false,'external frozen accessor is live');dynamic=true;
equal(containsVastBulk(frozenAccessor),true,'external frozen accessor is not cached');equal(accessorReads,2,'read accessor on every query');
const negative=immutableCopy(['x']),positive=immutableCopy(['vastbulk']);
equal(containsVastBulk(negative),false,'warm negative cache');equal(containsVastBulk(positive),true,'warm positive cache');
const includesDescriptor=Object.getOwnPropertyDescriptor(Array.prototype,'includes');let customCalls=0;
try {
 Object.defineProperty(Array.prototype,'includes',{...includesDescriptor,value:function(id){if(this===negative||this===positive){customCalls++;assert.equal(id,'vastbulk');return this===negative;}return Reflect.apply(includesDescriptor.value,this,[id]);}});
 equal(containsVastBulk(negative),true,'replaced prototype method overrides cached miss');
 equal(containsVastBulk(positive),false,'replaced prototype method overrides cached hit');
 equal(customCalls,2,'custom method called on both queries');
} finally {Object.defineProperty(Array.prototype,'includes',includesDescriptor);}
equal(containsVastBulk(negative),false,'native method restored');equal(containsVastBulk(positive),true,'native cached hit restored');
const sparseMetadata=immutableCopy(new Array(5)), indexDescriptor=Object.getOwnPropertyDescriptor(Array.prototype,'4');
equal(containsVastBulk(sparseMetadata),false,'registered sparse list baseline');
let inherited;
try {
 Object.defineProperty(Array.prototype,'4',{configurable:true,writable:true,value:'vastbulk'});
 inherited=containsVastBulk(sparseMetadata);
} finally {if(indexDescriptor)Object.defineProperty(Array.prototype,'4',indexDescriptor);else delete Array.prototype[4];}
equal(inherited,true,'holes must still observe inherited entries');
equal(containsVastBulk(sparseMetadata),false,'prototype entry removed');
assert.throws(()=>containsVastBulk({includes:null}),TypeError);checks++;
let list = updateProjectionArray(undefined, [1, 2, 3], n => n * 2), old = list;
list = updateProjectionArray(list, [3, 1], n => n * 2);assert.equal(list, old);equal(list, [6, 2], 'truncate and reorder');
const sparse = Object.assign(new Array(3), {0:1,2:3});list = updateProjectionArray(list, sparse, n => n * 2);equal(list, sparse.map(n => n * 2), 'holes');
const changed = [1, 2, 3];list = updateProjectionArray(list, changed, n => { changed.pop(); return n; });
equal(list, Object.assign(new Array(3), {0:1,1:2}), 'native map captures initial length');
const custom = [9];custom.map = () => custom;
list = updateProjectionArray(list, custom, n => n);assert.equal(list, custom);
list = updateProjectionArray(list, [4], n => n * 2);equal(custom, Object.assign([9], {map: custom.map}), 'custom map output is not reused');assert.notEqual(list, custom);
class SubArray extends Array { static get [Symbol.species]() { return SubArray; } }
assert.ok(updateProjectionArray(undefined, new SubArray(1, 2), n => n) instanceof SubArray);
const kernel = new LocalCombatKernel({playerHull:'onslaught',enemyHull:'onslaught',seed:917,multicore:false});
const ship = kernel.engine.playerShip, enemy = kernel.engine.enemyShip, projection = new RenderShipProjection();
projection.begin();const view = projection.project(ship), lists = [view.weapons, view.engineStatuses, view.allSystems];projection.finish();
projection.begin();projection.project(ship);equal([view.weapons, view.engineStatuses, view.allSystems].map((v, i) => v === lists[i]), [true,true,true], 'stable projection identities');
assert.notEqual(view.weapons, ship.weapons);
const removed = ship.weapons.pop();ship.weapons.reverse();projection.begin();projection.project(ship);
equal(view.weapons.map(w => w.slotId),ship.weapons.map(w => w.slotId),'membership/removal');
ship.weapons.push(removed);ship.weapons[0].currentAngleRad=2.31;projection.begin();projection.project(ship);
equal(view.weapons[0].currentAngleRad,2.31,'live mount state');
let seed=917;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
const world={ships:[ship,enemy],asteroids:[],projectiles:[],beams:[]};
let beforeCalls=0,afterCalls=0;const hypot=Math.hypot;
try {
 for(let i=0;i<500;i++) {
  const scale=i<480?1:[0,1e-12,1e8,1e76,1e160][i%5];
  ship.pos.set((random()-.5)*1000*scale,(random()-.5)*1000*scale);ship.vel.set((random()-.5)*200*scale,(random()-.5)*200*scale);ship.facingRad=random()*Math.PI*2;
  enemy.pos.set((random()-.5)*1500*scale,(random()-.5)*1500*scale);enemy.vel.set((random()-.5)*200*scale,(random()-.5)*200*scale);
  world.asteroids=Array.from({length:16},()=>({hp:1,pos:new Vector2((random()-.5)*2000*scale,(random()-.5)*2000*scale),vel:new Vector2((random()-.5)*100,(random()-.5)*100),radius:random()*200}));
  const desired=new Vector2((random()-.5)*200,(random()-.5)*200);
  Math.hypot=(...values)=>{beforeCalls++;return hypot(...values);};const before=reference(ship,desired,world);
  Math.hypot=(...values)=>{afterCalls++;return hypot(...values);};const after=avoidCollisions(ship,desired,world);
  equal(after,before,'complete navigation result '+i);
 }
} finally {Math.hypot=hypot;kernel.dispose();}
assert.ok(afterCalls<beforeCalls,'definite misses must avoid exact-distance work');
checks += checkNavigationPhaseIndex({Ship,Vector2,LocalCombatKernel,NavigationObstacleIndex,FireControlQueryRoster,avoidCollisions,forwardPathClear,reference:phaseReference,referenceForward:phaseReferenceForward});
if(navigationSweepBaseline) {
 const result=checkNavigationSweeps({Vector2,candidateRisk,beforeRisk,candidateProbe,beforeProbe});checks+=result.checks;fs.writeFileSync(path.join(out,'navigation-sweep-contracts.json'),JSON.stringify(result,null,2));
}
// The parsed list is private. Its public API must still return a fresh mutable
// list, while cached classification depends on immutable input metadata only.
function hullQualificationContracts(api) {
 const results=[]; const check=(value,expected,label)=>{equal(value,expected,label);results.push([label,value]);};
 const {installedHullMods:list,hasOnlyNativeRangeModifiers:native,hullModDefinitions:registry}=api;
 const external='hotpath-external-query-test';let hookCalls=0,hookValue=17;
 registry.register({id:external,name:'Query test',status:'implemented',rangeFlat:()=>{hookCalls++;return hookValue;}});
 const yes=immutableCopy({id:'native-query-test',builtInHullMods:['targetingunit','heavyarmor'],hullMods:['targetingunit']});
 const no=immutableCopy({id:'external-query-test',hullMods:[external]});
 const empty=immutableCopy({id:'empty-query-test'});
 for(let i=0;i<4;i++) {check(native(yes),true,'native '+i);check(native(no),false,'external '+i);check(native(empty),true,'empty '+i);}
 check(hookCalls,0,'classification never executes hooks');
 check(api.hullModRangeFlat(no,{weaponType:'ENERGY'}),17,'custom range hook first live value');
 hookValue=38;check(api.hullModRangeFlat(no,{weaponType:'ENERGY'}),38,'custom range hook changed live value');
 check(hookCalls,2,'negative classification does not cache hook results');
 const returned=list(yes),again=list(yes);
 assert.notEqual(returned,again);checks++;
 check(Object.isFrozen(returned),false,'public list remains mutable');
 returned.length=0;again.reverse();again.push(registry.require(external));
 check(list(yes).map(mod=>mod.id),['targetingunit','heavyarmor'],'private order/ownership');
 check(native(yes),true,'public mutations cannot poison classification');
 const mutable={id:'mutable-query-test',hullMods:['targetingunit']};
 check(native(mutable),true,'mutable native');mutable.hullMods.push(external);
 check(native(mutable),false,'mutable external');mutable.hullMods=['heavyarmor'];
 check(native(mutable),true,'mutable replacement');
 const shallow=Object.freeze({id:'shallow-query-test',hullMods:['targetingunit']});
 check(native(shallow),true,'shallow native');shallow.hullMods.push(external);
 check(native(shallow),false,'shallow live children');
 let dynamicMods=['targetingunit'];const reads=[];
 const dynamic={id:'dynamic-query-test',get builtInHullMods(){reads.push('built');return [];},get hullMods(){reads.push('mods');return dynamicMods;}};
 check(native(dynamic),true,'dynamic native');dynamicMods=[external];check(native(dynamic),false,'dynamic external');
 check(reads,['built','mods','built','mods'],'dynamic getter read order');
 const missing=immutableCopy({id:'missing-query-test',hullMods:['hotpath-late-query-test']});
 assert.throws(()=>native(missing),/unsupported hullmod/);checks++;
 registry.register({id:'hotpath-late-query-test',name:'Late test',status:'metadata-only'});
 check(native(missing),false,'failed resolution not cached');
 assert.throws(()=>registry.register({id:external,name:'Duplicate',status:'metadata-only'}),/duplicate/);checks++;
 const every=Object.getOwnPropertyDescriptor(Array.prototype,'every');let calls=0;
 try {
  Object.defineProperty(Array.prototype,'every',{...every,value:function(predicate){
   if(this[0]?.id==='targetingunit'){calls++;return calls%2===0;}
   return Reflect.apply(every.value,this,[predicate]);
  }});
  check(native(yes),false,'custom method overrides cached hit');check(native(yes),true,'custom method stays live');
 } finally {Object.defineProperty(Array.prototype,'every',every);}
 check(calls,2,'custom every calls');check(native(yes),true,'native every restored');
 const cold=immutableCopy({id:'getter-query-test',hullMods:['heavyarmor']});let getterCalls=0;
 try {
  Object.defineProperty(Array.prototype,'every',{configurable:true,get(){getterCalls++;return every.value;}});
  const first=native(cold),second=native(cold);
  // Check after restoration: assertions may use Array.prototype.every themselves.
  results.push(['getter values',first,second]);
 } finally {Object.defineProperty(Array.prototype,'every',every);}
 check(getterCalls,2,'one method getter per cold/warm query');
 const failure=immutableCopy({id:'throw-query-test',hullMods:['heavyarmor']});
 try {
  Object.defineProperty(Array.prototype,'every',{...every,value(){throw Error('query every failed');}});
  assert.throws(()=>native(failure),/query every failed/);checks++;
 } finally {Object.defineProperty(Array.prototype,'every',every);}
 check(native(failure),true,'exception recovery');
 return results;
}
const currentHullMods={installedHullMods,hasOnlyNativeRangeModifiers,hullModDefinitions,hullModRangeFlat};
const classificationContracts=hullQualificationContracts(currentHullMods);
if(beforeHullMods) equal(classificationContracts,hullQualificationContracts(beforeHullMods),'frozen reference qualification contracts');

// Optional paired microbenchmark, kept inside the existing harness. It is called
// only above, before the tests. No mutated intrinsic/prototype history is timed.
function benchmarkHullQualification() {
 assert.ok(beforeHullMods,'paired benchmark requires HULLMOD_BASELINE');
 for(const registry of [hullModDefinitions,beforeHullMods.hullModDefinitions]) {
  if(!registry.get('hotpath-external-query-test')) registry.register({id:'hotpath-external-query-test',name:'Query benchmark',status:'metadata-only'});
 }
 const fleet=Array.from({length:256},(_,i)=>immutableCopy({id:'range-query-'+i,builtInHullMods:['targetingunit','heavyarmor'],
  hullMods:i%5===0?['hotpath-external-query-test']:['fluxcoil','eccm','fourteenth','hardenedshieldemitter']}));
 const rounds=2000, old=beforeHullMods.hasOnlyNativeRangeModifiers, next=hasOnlyNativeRangeModifiers;
 const run=fn=>{let total=0;const start=performance.now();for(let n=0;n<rounds;n++)for(const spec of fleet)total+=Number(fn(spec));return {ms:performance.now()-start,total};};
 for(let i=0;i<4;i++){run(old);run(next);}
 const pairs=[];
 for(let i=0;i<12;i++){let a,b;if(i%2){b=run(next);a=run(old);}else{a=run(old);b=run(next);}equal(a.total,b.total,'qualification benchmark values');pairs.push({before:a.ms,after:b.ms});}
 const stats=key=>{const values=pairs.map(p=>p[key]).sort((a,b)=>a-b);return {mean:values.reduce((a,b)=>a+b)/values.length,median:values[Math.floor(values.length/2)],p95:values[Math.floor((values.length-1)*.95)]};};
 const report={scope:'classification only, not simulation or network latency',queriesPerBatch:rounds*fleet.length,pairs,before:stats('before'),after:stats('after')};
 fs.writeFileSync(path.join(out,'hullmod-query-benchmark.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({qualificationBenchmark:path.join(out,'hullmod-query-benchmark.json'),...report}));
}

console.log(JSON.stringify({checks,hypotCalls:{before:beforeCalls,after:afterCalls},scope:'contracts and operation counts, not FPS'}));
