import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {test as nodeTest} from 'node:test';
import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
const out=path.resolve(process.env.OWNED_SYSTEM_LISTS_OUT??('artifacts/lan-owned-system-lists-20260927/check-'+Date.now()));
fs.mkdirSync(out,{recursive:true});
const sha=value=>createHash('sha256').update(value).digest('hex');
const frozen=process.env.OWNED_SYSTEM_LISTS_FROZEN??path.resolve('artifacts/lan-owned-system-lists-20260927/candidate-browser.json');
const snapshot=JSON.parse(fs.readFileSync(frozen)),sources=new Map(snapshot.files.map(row=>{
 assert.equal(sha(row.code),row.sha256);return [path.resolve(row.file).toLowerCase(),row];
}));
let passed=0;
const test=(name,body)=>nodeTest(name,async()=>{await body();passed++;});
const contents=`
export {handleMessage,testEngine} from './src/network/host.worker';
export {Ship} from './src/engine/simulation/Ship';
export {ShipSystem} from './src/engine/simulation/ShipSystem';
export {assessThreats} from './src/engine/ai/ThreatAssessment';
export {WeaponThreatEnvelope} from './src/engine/ai/WeaponThreatEnvelope';
export {FireControlQueryRoster} from './src/engine/ai/FireControlQueryBatch';
export {hullModDefinitions} from './src/engine/extensions/HullMods';
export {AutofireController} from './src/engine/ai/AutofireController';
export {ShipWeaponControlSystem} from './src/engine/simulation/systems/ShipWeaponControlSystem';
export {Vector2} from './src/engine/math/Vector2';
export {captureCombat} from './src/network/AuthorityCombatSnapshot';
`;
const baselineFiles=JSON.parse(fs.readFileSync(path.resolve('artifacts/lan-owned-system-lists-20260927/before.json'))).filter(r=>r.exists).map(r=>r.file);
const baseline=new Map(baselineFiles.map(file=>[file,fs.readFileSync(path.resolve('artifacts/lan-owned-system-lists-20260927/before',file),'utf8')]));
const code={};
for(const enabled of [false,true,'default']){
 const result=await build({stdin:{contents,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',
  define:{__LAN_BUILD_ID__:JSON.stringify('interleaved-bounds-contract'),'import.meta.env':JSON.stringify({BASE_URL:'/',DEV:true,PROD:false,MODE:'development',SSR:false,VITE_AI_EXACT_AUTHORED_THREATS:'true',VITE_LAN_OWNED_MOTION_READS:'true',VITE_LAN_EARLY_PREAIM_RANGE:'true',VITE_AI_INTERLEAVED_THREATS:'true',...(enabled==='default'?{}:{VITE_LAN_OWNED_SYSTEM_LISTS:String(enabled)})})},
  plugins:[{name:'same-frozen-source',setup(build){build.onResolve({filter:/^\./},args=>{const base=path.resolve(args.resolveDir,args.path);for(const suffix of['','.ts','.tsx','.json','.mts','.mjs']){const file=base+suffix;if(!fs.existsSync(file)&&sources.has(file.toLowerCase()))return{path:file};}});build.onLoad({filter:/\.(?:[cm]?[jt]sx?|json)$/},args=>{const row=sources.get(args.path.toLowerCase());if(row)return{contents:(!enabled&&baseline.has(row.file)?baseline.get(row.file):row.code)+(row.file==='src/network/host.worker.ts'?'\nexport {handleMessage}; export function testEngine(){ return engine; }':''),loader:path.extname(row.file).slice(1).replace(/^[cm]([jt]s)$/, '$1')};if(args.path.startsWith(path.resolve('src')+path.sep))throw Error('Unfrozen source: '+args.path);});}}]});
 code[String(enabled)]=result.outputFiles[0].text;
}
fs.writeFileSync(path.join(out,'build-manifest.json'),JSON.stringify({frozen,sourceSha256:sha(fs.readFileSync(frozen)),beforeBundle:sha(code.false),afterBundle:sha(code.true)},null,2));
async function load(enabled,name){globalThis.self={postMessage(){}};const file=path.join(out,name+'.mjs');fs.writeFileSync(file,code[String(enabled)],{flag:'wx'});return import(pathToFileURL(file).href);}
const hulls=['web_zhuyuan','web_gloriana','web_sc2_hyperion'],ai=Array.from({length:20},(_,i)=>hulls[i%3]);
const match={id:'authored-query-check',hostId:'host',seed:917,snapshotHz:60,players:[{id:'host',name:'Host',seat:0,team:0,hull:hulls[0]},{id:'guest',name:'Guest',seat:1,team:1,hull:hulls[0]}],options:{assignment:'teams',battleSize:3200,deploymentLimit:1600,aiHulls:[ai.slice(0,10),ai.slice(10)]}};
function world(api){const messages=[];globalThis.self={postMessage(m){messages.push(m);}};api.handleMessage(structuredClone({type:'init',match}));assert.ok(messages.some(m=>m.type==='ready'),JSON.stringify(messages.filter(m=>m.type==='error')));assert.ok(messages.some(m=>m.type==='snapshot'&&m.tick===0));assert.ok(!messages.some(m=>m.type==='error'));const engine=api.testEngine();assert.equal(engine.ships.length,176);return engine;}
function hidden(engine){return {random:engine.random.checkpointWitness(),visualRandom:engine.visualRandom.checkpointWitness(),ships:engine.ships.map(ship=>({id:ship.id,random:ship.random.checkpointWitness(),controlRandom:ship.weaponControl.random.checkpointWitness(),trackers:ship.weapons.map(mount=>{const t=ship.weaponControl.autofire.trackers.get(mount);return [mount.slotId,t?{target:t.target&&[t.target.kind,t.target.entity.id],scanIn:t.scanIn,firingTime:t.firingTime,idleFireTime:t.idleFireTime,ammoAllowed:t.ammoAllowed,random:t.random.checkpointWitness()}:null];})}))};}
function witness(api,engine,tick){return{combat:api.captureCombat(engine,tick,{},0),hidden:hidden(engine)};}







test('init/reinit/default: real 176-entity roster and observed removal of intermediate slice arrays',async()=>{
 const rows=[];for(const enabled of[false,true,'default']){const api=await load(enabled,'init-'+enabled);for(let attempt=0;attempt<2;attempt++){
  const engine=world(api),ships=engine.ships;assert.equal(ships.reduce((n,s)=>n+s.weapons.length,0),734);
  const expected=ships.map(s=>[s.system,...s.systems.slice(1),s.defenseSystem]),owned=new Set(ships.map(s=>s.systems)),slice=Array.prototype.slice;let calls=0,values;
  // Transparent diagnostic wrapper only; never used in timing or as evidence
  // that executable plugins may mutate a closed Worker's array intrinsics.
  Array.prototype.slice=function(...args){if(owned.has(this))calls++;return Reflect.apply(slice,this,args);};
  try{values=ships.map(s=>s.allSystems);}finally{Array.prototype.slice=slice;}
  assert.deepEqual(values,expected);assert.equal(calls,enabled===true?0:ships.length);
  for(let i=0;i<ships.length;i++){assert.notEqual(values[i],ships[i].allSystems);assert.equal(Object.getPrototypeOf(values[i]),Array.prototype);}
  rows.push({enabled,attempt,entities:ships.length,multiSlotShips:ships.filter(s=>s.systems.length>1).length,sliceCalls:calls});
 }}fs.writeFileSync(path.join(out,'init-lists.json'),JSON.stringify(rows,null,2));
});
const listValue=xs=>({items:xs.map(x=>x?.id??null),keys:Object.keys(xs),plain:Object.getPrototypeOf(xs)===Array.prototype});
test('unknown/public arrays retain field order, custom slice/iterator/species, and exceptions',async()=>{
 const a=await load(false,'public-reference'),b=await load(true,'public-candidate');world(b);
 const run=(api,kind)=>{const s=Object.create(api.Ship.prototype),trace=[],main={id:'main'},defense={id:'defense'};s.system=main;s.systems=[main,{id:'extra'}];s.defenseSystem=defense;
  if(kind==='ordered-custom'){const tail={[Symbol.iterator]:function*(){trace.push('iterator');yield{id:'tail'};}},systems={slice(start){trace.push(['slice',start,this===systems]);return tail;}};Object.defineProperties(s,{system:{get(){trace.push('main');return main;}},systems:{get(){trace.push('systems');return systems;}},defenseSystem:{get(){trace.push('defense');return defense;}}});}
  if(kind==='species'){class List extends Array{static get[Symbol.species](){trace.push('species');return Array;}}s.systems=new List(main,{id:'extra'});}
  if(kind==='slice-replaces-defense')s.systems={slice(){trace.push('slice');s.defenseSystem={id:'replacement'};return[];}};
  if(kind==='sparse'){s.systems=[main];s.systems.length=4;}
  if(kind==='throw-main')Object.defineProperty(s,'system',{get(){trace.push('main');throw Error('main failed');}});
  if(kind==='throw-systems')Object.defineProperty(s,'systems',{get(){trace.push('systems');throw Error('systems failed');}});
  if(kind==='throw-slice')s.systems={slice(){trace.push('slice');throw Error('slice failed');}};
  if(kind==='throw-iterator')s.systems={slice(){trace.push('slice');return{[Symbol.iterator](){trace.push('iterator');throw Error('iterator failed');}};}};
  if(kind==='throw-defense')Object.defineProperty(s,'defenseSystem',{get(){trace.push('defense');throw Error('defense failed');}});
  try{return{trace,value:listValue(s.allSystems)};}catch(e){return{trace,error:e.message};}
 };
 const rows=[];for(const kind of['ordered-custom','species','slice-replaces-defense','sparse','throw-main','throw-systems','throw-slice','throw-iterator','throw-defense']){const expected=run(a,kind),actual=run(b,kind);assert.deepEqual(actual,expected,kind);rows.push({kind,...actual});}
 // Even after owned initialization, replacing an array with a custom list must
 // NOT silently adopt it. Borrow the baseline getter over the same class shape.
 const s=world(b).playerShip;let sliceReads=0;s.systems={slice(){sliceReads++;return[{id:'replacement-tail'}];}};assert.equal(s.allSystems[1].id,'replacement-tail');assert.equal(sliceReads,1);
 fs.writeFileSync(path.join(out,'public-lists.json'),JSON.stringify(rows,null,2));
});
test('owned lists preserve zero/one/multiple/sparse membership, live replacements, fresh results and nested snapshots',async()=>{
 const api=await load(true,'native-candidate'),reference=await load(false,'native-reference');const expectedReader=Object.getOwnPropertyDescriptor(reference.Ship.prototype,'allSystems').get,actualReader=Object.getOwnPropertyDescriptor(api.Ship.prototype,'allSystems').get;
 const run=(reader,kind)=>{const s=world(api).playerShip,trace=[],main={id:'main'},defense={id:'defense'};s.system=main;s.defenseSystem=defense;const slots=s.systems;slots.splice(0,slots.length,main,{id:'second'},{id:'third'});
  if(kind==='zero')slots.length=0;if(kind==='one')slots.length=1;if(kind==='facade')slots[0]={id:'not-main'};if(kind==='sparse'){delete slots[1];slots.length=5;}
  if(kind==='nested'){let inside=false;Object.defineProperty(s,'defenseSystem',{configurable:true,get(){trace.push(inside?'inner-defense':'outer-defense');if(!inside){inside=true;s.system={id:'nested-main'};trace.push(listValue(reader.call(s)));inside=false;}return defense;}});}
  const first=reader.call(s),firstValue=listValue(first);assert.notEqual(first,slots);assert.equal(first[0],main);
  const originalMain=s.system,originalFirstSlot=slots[0];first[0]={id:'caller-only'};first.push({id:'caller-extra'});assert.equal(s.system,originalMain);assert.equal(slots[0],originalFirstSlot);
  const second=reader.call(s);assert.notEqual(first,second);assert.ok(!second.some(x=>x?.id==='caller-only'||x?.id==='caller-extra'));
  if(kind==='dynamic'){slots[1]={id:'new-second'};s.system={id:'new-main'};s.defenseSystem={id:'new-defense'};assert.equal(second[1].id,'second');}
  return{trace,first:firstValue,second:listValue(second),next:listValue(reader.call(s))};
 };
 const rows=[];for(const kind of['zero','one','multiple','facade','sparse','dynamic','nested']){const expected=run(expectedReader,kind),actual=run(actualReader,kind);assert.deepEqual(actual,expected,kind);rows.push({kind,...actual});}
 fs.writeFileSync(path.join(out,'native-lists.json'),JSON.stringify(rows,null,2));
});
test('60 full fixed steps preserve complete authority and hidden fire-control/RNG state',async()=>{
 const aApi=await load(false,'engine-reference'),bApi=await load(true,'engine-candidate'),a=world(aApi),b=world(bApi),hashes=[];
 for(let tick=1;tick<=60;tick++){
  for(const engine of[a,b]){
   if(tick===8)for(const s of engine.capitalShips){s.aimTargetWorld.set(s.pos.x+1000,s.pos.y+500);s.flux.softFlux=s.flux.maxFlux*.2;for(const system of s.systems)system.activate();}
   if(tick===20)for(const[i,s]of engine.capitalShips.entries()){s.pos.set(s.teamId===0?-500:500,(i%6)*240-600);s.aimTargetWorld.set(s.teamId===0?500:-500,s.pos.y);s.isFiringMain=true;}
   if(tick===30)for(const s of engine.capitalShips)s.startVenting();
   if(tick===38){const child=engine.combatShips.find(s=>s.parentShip);child.hullHp=child.maxHullHp*.35;child.flux.isVenting=false;child.flux.isOverloaded=false;child.flux.softFlux=child.flux.hardFlux=0;}
  }
  a.fixedUpdate(1/60);b.fixedUpdate(1/60);const left=witness(aApi,a,tick),right=witness(bApi,b,tick);assert.deepEqual(right,left,'state tick '+tick);hashes.push(sha(JSON.stringify(right)));
 }fs.writeFileSync(path.join(out,'whole-state-hashes.json'),JSON.stringify(hashes,null,2));
});
test('one isolated-process ABBA: 150 warmup + 120 full steps, 3% gate in each pair',async()=>{
 assert.equal(passed,4,'do not time invalid candidate');const rows=[];
 for(const[index,enabled]of[false,true,true,false].entries()){
  const bundle=path.join(out,'bench-'+index+'.mjs'),runner=path.join(out,'bench-'+index+'-runner.mjs');fs.writeFileSync(bundle,code[String(enabled)],{flag:'wx'});
  const body=`import fs from 'node:fs';import assert from 'node:assert/strict';import{createHash}from'node:crypto';\nglobalThis.self={postMessage(){}};const api=await import(${JSON.stringify(pathToFileURL(bundle).href)});\nconst match=${JSON.stringify(match)};const sha=${sha.toString()};\n${world.toString()}\n${hidden.toString()}\n${witness.toString()}\nconst engine=world(api);for(let tick=0;tick<150;tick++)engine.fixedUpdate(1/60);const heapBefore=process.memoryUsage().heapUsed;const started=performance.now();for(let tick=0;tick<120;tick++)engine.fixedUpdate(1/60);const elapsedMs=performance.now()-started;console.log(JSON.stringify({elapsedMs,perStepMs:elapsedMs/120,heapBefore,heapAfter:process.memoryUsage().heapUsed,entities:engine.ships.length,stateSha256:sha(JSON.stringify(witness(api,engine,270)))}));`;
  fs.writeFileSync(runner,body,{flag:'wx'});const run=spawnSync(process.execPath,[runner],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});fs.writeFileSync(path.join(out,'bench-'+index+'.stdout.log'),run.stdout??'',{flag:'wx'});fs.writeFileSync(path.join(out,'bench-'+index+'.stderr.log'),run.stderr??'',{flag:'wx'});assert.equal(run.status,0,(run.stderr??'').slice(0,1000));const result=JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));rows.push({index,enabled,steps:120,...result});
  fs.writeFileSync(path.join(out,'abba.json'),JSON.stringify({scope:'Sequential isolated Node processes; original host init and fixedUpdate, NOT browser timing',rows},null,2));
 }
 assert.ok(rows.every(r=>r.entities===rows[0].entities));assert.ok(rows.every(r=>r.stateSha256===rows[0].stateSha256));const gains=[1-rows[1].elapsedMs/rows[0].elapsedMs,1-rows[2].elapsedMs/rows[3].elapsedMs],pass=gains.every(g=>g>=.03);
 fs.writeFileSync(path.join(out,'abba.json'),JSON.stringify({scope:'Sequential isolated Node processes; 150 warmup + 120 measured steps per arm; excludes spawn/import/warmup/final witness',rows,gains,passesPrescribedGate:pass},null,2));console.log(JSON.stringify({gains,passesPrescribedGate:pass}));
});
