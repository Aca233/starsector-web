// Historical frozen candidate replay only: production candidate was rejected and restored.
// This script includes ABBA timing; do not rerun to select a favorable result.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {test as nodeTest} from 'node:test';
import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
const out=path.resolve(process.env.INTERLEAVED_PHASE_READS_OUT??('artifacts/lan-interleaved-phase-reads-20260927/check-'+Date.now()));
fs.mkdirSync(out,{recursive:true});
const sha=value=>createHash('sha256').update(value).digest('hex');
const frozen=process.env.INTERLEAVED_PHASE_READS_FROZEN??path.resolve('artifacts/lan-interleaved-phase-reads-20260927/candidate-browser.json');
const snapshot=JSON.parse(fs.readFileSync(frozen)),sources=new Map(snapshot.files.map(row=>{
 assert.equal(sha(row.code),row.sha256);return [path.resolve(row.file).toLowerCase(),row];
}));
let passed=0;
const test=(name,body)=>nodeTest(name,async()=>{await body();passed++;});
const contents=`
export {handleMessage,testEngine} from './src/network/host.worker';
export {Ship} from './src/engine/simulation/Ship';
export {OwnedPhaseReadScope, ownedPhaseReadEntry} from './src/engine/ai/OwnedPhaseReadScope';
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
const baselineFiles=JSON.parse(fs.readFileSync(path.resolve('artifacts/lan-interleaved-phase-reads-20260927/before.json'))).filter(r=>r.exists).map(r=>r.file);
const baseline=new Map(baselineFiles.map(file=>[file,fs.readFileSync(path.resolve('artifacts/lan-interleaved-phase-reads-20260927/before',file),'utf8')]));
const code={};
const injected={};
for(const enabled of [false,true,'default']){
 const result=await build({stdin:{contents,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',
  define:{__LAN_BUILD_ID__:JSON.stringify('interleaved-bounds-contract'),'import.meta.env':JSON.stringify({BASE_URL:'/',DEV:true,PROD:false,MODE:'development',SSR:false,VITE_AI_EXACT_AUTHORED_THREATS:'true',VITE_LAN_OWNED_MOTION_READS:'true',VITE_LAN_EARLY_PREAIM_RANGE:'true',VITE_AI_INTERLEAVED_THREATS:'true',...(enabled==='default'?{}:{VITE_AI_INTERLEAVED_PHASE_READS:String(enabled)})})},
  plugins:[{name:'same-frozen-source',setup(build){build.onResolve({filter:/^\./},args=>{const base=path.resolve(args.resolveDir,args.path);for(const suffix of['','.ts','.tsx','.json','.mts','.mjs']){const file=base+suffix;if(!fs.existsSync(file)&&sources.has(file.toLowerCase()))return{path:file};}});build.onLoad({filter:/\.(?:[cm]?[jt]sx?|json)$/},args=>{const row=sources.get(args.path.toLowerCase());if(row)return{contents:(!enabled&&baseline.has(row.file)?baseline.get(row.file):row.code)+(row.file==='src/network/host.worker.ts'?'\nexport {handleMessage}; export function testEngine(){ return engine; }':''),loader:path.extname(row.file).slice(1).replace(/^[cm]([jt]s)$/, '$1')};if(args.path.startsWith(path.resolve('src')+path.sep))throw Error('Unfrozen source: '+args.path);});}}]});
 code[String(enabled)]=result.outputFiles[0].text;
 assert.equal((code[String(enabled)].match(/get allSystems\(\) \{/g)||[]).length,1);
 injected[String(enabled)]=code[String(enabled)].replace('get allSystems() {','get allSystems() { if(globalThis.__listCounter?.active)globalThis.__listCounter.count++;');
}
fs.writeFileSync(path.join(out,'build-manifest.json'),JSON.stringify({frozen,sourceSha256:sha(fs.readFileSync(frozen)),beforeBundle:sha(code.false),afterBundle:sha(code.true)},null,2));
async function load(enabled,name){globalThis.self={postMessage(){}};const file=path.join(out,name+'.mjs');fs.writeFileSync(file,code[String(enabled)],{flag:'wx'});return import(pathToFileURL(file).href);}
const hulls=['web_zhuyuan','web_gloriana','web_sc2_hyperion'],ai=Array.from({length:20},(_,i)=>hulls[i%3]);
const match={id:'authored-query-check',hostId:'host',seed:917,snapshotHz:60,players:[{id:'host',name:'Host',seat:0,team:0,hull:hulls[0]},{id:'guest',name:'Guest',seat:1,team:1,hull:hulls[0]}],options:{assignment:'teams',battleSize:3200,deploymentLimit:1600,aiHulls:[ai.slice(0,10),ai.slice(10)]}};
function world(api){const messages=[];globalThis.self={postMessage(m){messages.push(m);}};api.handleMessage(structuredClone({type:'init',match}));assert.ok(messages.some(m=>m.type==='ready'),JSON.stringify(messages.filter(m=>m.type==='error')));assert.ok(messages.some(m=>m.type==='snapshot'&&m.tick===0));assert.ok(!messages.some(m=>m.type==='error'));const engine=api.testEngine();assert.equal(engine.ships.length,176);return engine;}
function hidden(engine){return {random:engine.random.checkpointWitness(),visualRandom:engine.visualRandom.checkpointWitness(),ships:engine.ships.map(ship=>({id:ship.id,random:ship.random.checkpointWitness(),controlRandom:ship.weaponControl.random.checkpointWitness(),trackers:ship.weapons.map(mount=>{const t=ship.weaponControl.autofire.trackers.get(mount);return [mount.slotId,t?{target:t.target&&[t.target.kind,t.target.entity.id],scanIn:t.scanIn,firingTime:t.firingTime,idleFireTime:t.idleFireTime,ammoAllowed:t.ammoAllowed,random:t.random.checkpointWitness()}:null];})}))};}
function witness(api,engine,tick){return{combat:api.captureCombat(engine,tick,{},0),hidden:hidden(engine)};}







test('init/reinit/default: 176 entities, 734 mounts, and opt-in actually opens only inside update',async()=>{
 const rows=[];
 for(const enabled of[false,true,'default']){
  const api=await load(enabled,'init-'+enabled),open=api.OwnedPhaseReadScope.open;let opens=0;
  api.OwnedPhaseReadScope.open=function(...args){opens++;return Reflect.apply(open,this,args);};
  for(let attempt=0;attempt<2;attempt++){
   const engine=world(api);assert.equal(engine.ships.reduce((n,s)=>n+s.weapons.length,0),734);
   assert.equal(api.ownedPhaseReadEntry(engine.playerShip),undefined);const previous=opens;
   engine.fixedUpdate(1/60);assert.equal(opens-previous,enabled===true?1:0);
   assert.equal(api.ownedPhaseReadEntry(engine.playerShip),undefined);
   rows.push({enabled,attempt,opens:opens-previous,entities:engine.ships.length});
  }
  api.OwnedPhaseReadScope.open=open;
 }
 fs.writeFileSync(path.join(out,'init.json'),JSON.stringify(rows,null,2));
});

test('write barriers invalidate complete dependency groups; nested, unknown and closed scopes fail open',async()=>{
 const api=await load(true,'scope'),engine=world(api),ships=engine.ships;
 const exact=api.WeaponThreatEnvelope.forExactPhase(ships);assert.ok(exact);assert.equal(exact.openOwnedPhaseReads(),undefined);exact.close();
 let envelope=api.WeaponThreatEnvelope.forOwnedInterleavedPhase(ships);assert.ok(envelope);let scope=envelope.openOwnedPhaseReads();assert.ok(scope);
 const child=ships.find(s=>s.parentShip),parent=child.parentShip,carrierChild=ships.find(s=>s.sourceCarrier),carrier=carrierChild.sourceCarrier;
 assert.equal(api.ownedPhaseReadEntry(child).family,api.ownedPhaseReadEntry(parent).family);
 assert.equal(api.ownedPhaseReadEntry(carrierChild).family,api.ownedPhaseReadEntry(carrier).family);
 const foreign=ships.find(s=>api.ownedPhaseReadEntry(s).family!==api.ownedPhaseReadEntry(child).family);assert.ok(foreign);
 assert.equal(child.isPhased,false);assert.equal(api.ownedPhaseReadEntry(child).value,false);assert.equal(foreign.isPhased,false);
 const foreignEntry=api.ownedPhaseReadEntry(foreign),familyEntry=api.ownedPhaseReadEntry(child);assert.equal(foreignEntry.value,false);
 assert.equal(scope.beginWrite(parent),true);assert.equal(familyEntry.value,undefined);assert.equal(api.ownedPhaseReadEntry(child),undefined);assert.equal(api.ownedPhaseReadEntry(parent),undefined);assert.equal(api.ownedPhaseReadEntry(foreign),foreignEntry);
 parent.isDocked=true;assert.equal(child.isPhased,true);parent.isDocked=false;assert.equal(child.isPhased,false);scope.endWrite();
 assert.equal(api.ownedPhaseReadEntry(child).value,undefined);assert.equal(child.isPhased,false);assert.equal(api.ownedPhaseReadEntry(child).value,false);
 assert.equal(scope.beginWrite(parent),true);assert.equal(scope.beginWrite(child),false);assert.equal(api.ownedPhaseReadEntry(foreign),undefined);envelope.close();
 envelope=api.WeaponThreatEnvelope.forOwnedInterleavedPhase(ships);scope=envelope.openOwnedPhaseReads();assert.ok(scope);assert.equal(scope.beginWrite({}),false);assert.equal(api.ownedPhaseReadEntry(parent),undefined);envelope.close();
 envelope=api.WeaponThreatEnvelope.forOwnedInterleavedPhase(ships);scope=envelope.openOwnedPhaseReads();assert.ok(scope);const nested=api.WeaponThreatEnvelope.forOwnedInterleavedPhase(ships);assert.equal(nested.openOwnedPhaseReads(),undefined);assert.equal(api.ownedPhaseReadEntry(parent),undefined);nested.close();envelope.close();assert.equal(scope.beginWrite(parent),false);
 fs.writeFileSync(path.join(out,'scope.json'),JSON.stringify({parentDependency:true,carrierDependency:true,writingReadsLive:true,unrelatedGroupRetained:true,reentrancyClosed:true,unknownWriterClosed:true}));
});

test('live systems and fallback: parent phases, multi-slot, new effects, exception retry, and group requalification',async()=>{
 const api=await load(true,'live'),reference=await load(false,'live-reference'),engine=world(api),ships=engine.ships;
 const baseline=Object.getOwnPropertyDescriptor(reference.Ship.prototype,'isPhased').get,records=[];
 const root=ships.find(s=>!s.parentShip&&s.systems.length>1),child=ships.find(s=>s.parentShip),parent=child.parentShip;
 for(const target of[root,parent]){
  const envelope=api.WeaponThreatEnvelope.forOwnedInterleavedPhase(ships);assert.ok(envelope);const scope=envelope.openOwnedPhaseReads();assert.ok(scope);
  assert.equal(target.isPhased,false);assert.ok(scope.beginWrite(target));
  for(const docked of[true,false]){target.isDocked=docked;assert.equal(target.isPhased,baseline.call(target));if(target===parent)assert.equal(child.isPhased,baseline.call(child));}
  for(const system of target.systems){const prior=system.state;for(const state of['IN','ACTIVE','OUT','IDLE']){system.state=state;assert.equal(target.isPhased,baseline.call(target));}system.state=prior;}
  scope.endWrite();assert.equal(target.isPhased,baseline.call(target));envelope.close();records.push({case:'system-state',multi:target.systems.length,parent:target===parent});
 }
 // A known native writer may become ineligible; the whole write group is checked
 // again before it can supply a cached value to a different observer.
 const envelope=api.WeaponThreatEnvelope.forOwnedInterleavedPhase(ships),scope=envelope.openOwnedPhaseReads();assert.equal(parent.isPhased,false);assert.ok(scope.beginWrite(child));let calls=0;const token={};parent.externalPhaseEffects.set(token,()=>{calls++;return .5;});assert.equal(child.isPhased,true);scope.endWrite();assert.equal(api.ownedPhaseReadEntry(root),undefined);assert.equal(parent.isPhased,true);assert.ok(calls>=2);envelope.close();assert.equal(api.WeaponThreatEnvelope.forOwnedInterleavedPhase(ships),undefined);
 parent.externalPhaseEffects.set(token,()=>{throw Error('phase-read-error');});assert.throws(()=>parent.isPhased,/phase-read-error/);parent.externalPhaseEffects.set(token,()=>undefined);assert.equal(parent.isPhased,false);parent.externalPhaseEffects.delete(token);
 // A failed read must not install false/true. This deliberately throws on data
 // access for exception-contract testing, not to certify executable extensions.
 const e2=api.WeaponThreatEnvelope.forOwnedInterleavedPhase(ships),s2=e2.openOwnedPhaseReads();const originalDocked=root.isDocked;
 Object.defineProperty(root,'isDocked',{configurable:true,get(){throw Error('getter-failure');}});assert.throws(()=>root.isPhased,/getter-failure/);assert.equal(api.ownedPhaseReadEntry(root).value,undefined);Object.defineProperty(root,'isDocked',{configurable:true,writable:true,value:originalDocked});assert.equal(root.isPhased,false);s2.close();e2.close();
 records.push({case:'unknown-external-effect',groupRequalification:true,liveCallbacks:true,exceptionRetry:true});fs.writeFileSync(path.join(out,'live.json'),JSON.stringify(records,null,2));
});

test('unknown writers stay outside scopes and abrupt engine exit closes the live lease',async()=>{
 const api=await load(true,'fallback'),rows=[];
 const mutations={status:s=>s.statusEffects.set('probe',{advance(){}}),interceptor:s=>s.hullDamageInterceptors.add(()=>0),armor:s=>s.armor.damageTakenModifiers=()=>1,flux:s=>s.flux.onOverloadStarted=()=>{},external:s=>s.externalPhaseEffects.set({},()=>undefined),weapon:s=>s.weaponControl.update=()=>{},phaseShield:s=>s.shield.type='PHASE'};
 for(const [kind,mutate]of Object.entries(mutations)){const engine=world(api);mutate(engine.playerShip);assert.equal(api.WeaponThreatEnvelope.forOwnedInterleavedPhase(engine.ships),undefined,kind);rows.push({kind,rejected:true});}
 const engine=world(api),open=api.OwnedPhaseReadScope.open;let opened;
 api.OwnedPhaseReadScope.open=function(...args){opened=Reflect.apply(open,this,args);assert.ok(opened);const original=opened.beginWrite;opened.beginWrite=function(ship){assert.equal(Reflect.apply(original,this,[ship]),true);throw Error('forced-write-exit');};return opened;};
 try{assert.throws(()=>engine.fixedUpdate(1/60),/forced-write-exit/);}finally{api.OwnedPhaseReadScope.open=open;}
 assert.ok(opened);assert.equal(api.ownedPhaseReadEntry(engine.playerShip),undefined);assert.equal(api.OwnedPhaseReadScope.prototype.beginWrite.call(opened,engine.playerShip),false);
 fs.writeFileSync(path.join(out,'fallback.json'),JSON.stringify({rows,finallyClosed:true},null,2));
});

test('20 initial full steps: source-local list counters fall while complete final state stays exact',async()=>{
 const rows=[];
 for(const enabled of[false,true]){
  const file=path.join(out,'diagnostic-'+enabled+'.mjs');fs.writeFileSync(file,injected[String(enabled)],{flag:'wx'});globalThis.self={postMessage(){}};globalThis.__listCounter={active:false,count:0};const api=await import(pathToFileURL(file).href),engine=world(api);
  globalThis.__listCounter.active=true;try{for(let i=0;i<20;i++)engine.fixedUpdate(1/60);}finally{globalThis.__listCounter.active=false;}
  rows.push({enabled,listReads:globalThis.__listCounter.count,stateSha256:sha(JSON.stringify(witness(api,engine,20)))});
 }
 assert.equal(rows[0].stateSha256,rows[1].stateSha256);assert.equal(rows[0].stateSha256,'bc891a0f1c7b8da97559620bf2b36b6c7c35bbe3adde8467c4b6ec1b9b3ad224');assert.ok(rows[1].listReads<rows[0].listReads);delete globalThis.__listCounter;
 fs.writeFileSync(path.join(out,'list-counts.json'),JSON.stringify({scope:'Source-local counters, no timing claim',rows},null,2));
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
 assert.equal(passed,6,'do not time invalid candidate');const rows=[];
 for(const[index,enabled]of[false,true,true,false].entries()){
  const bundle=path.join(out,'bench-'+index+'.mjs'),runner=path.join(out,'bench-'+index+'-runner.mjs');fs.writeFileSync(bundle,code[String(enabled)],{flag:'wx'});
  const body=`import fs from 'node:fs';import assert from 'node:assert/strict';import{createHash}from'node:crypto';\nglobalThis.self={postMessage(){}};const api=await import(${JSON.stringify(pathToFileURL(bundle).href)});\nconst match=${JSON.stringify(match)};const sha=${sha.toString()};\n${world.toString()}\n${hidden.toString()}\n${witness.toString()}\nconst engine=world(api);for(let tick=0;tick<150;tick++)engine.fixedUpdate(1/60);const heapBefore=process.memoryUsage().heapUsed;const started=performance.now();for(let tick=0;tick<120;tick++)engine.fixedUpdate(1/60);const elapsedMs=performance.now()-started;console.log(JSON.stringify({elapsedMs,perStepMs:elapsedMs/120,heapBefore,heapAfter:process.memoryUsage().heapUsed,entities:engine.ships.length,stateSha256:sha(JSON.stringify(witness(api,engine,270)))}));`;
  fs.writeFileSync(runner,body,{flag:'wx'});const run=spawnSync(process.execPath,[runner],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});fs.writeFileSync(path.join(out,'bench-'+index+'.stdout.log'),run.stdout??'',{flag:'wx'});fs.writeFileSync(path.join(out,'bench-'+index+'.stderr.log'),run.stderr??'',{flag:'wx'});assert.equal(run.status,0,(run.stderr??'').slice(0,1000));const result=JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));rows.push({index,enabled,steps:120,...result});
  fs.writeFileSync(path.join(out,'abba.json'),JSON.stringify({scope:'Sequential isolated Node processes; original host init and fixedUpdate, NOT browser timing',rows},null,2));
 }
 assert.ok(rows.every(r=>r.entities===rows[0].entities));assert.ok(rows.every(r=>r.stateSha256===rows[0].stateSha256));const gains=[1-rows[1].elapsedMs/rows[0].elapsedMs,1-rows[2].elapsedMs/rows[3].elapsedMs],pass=gains.every(g=>g>=.03);
 fs.writeFileSync(path.join(out,'abba.json'),JSON.stringify({scope:'Sequential isolated Node processes; 150 warmup + 120 measured steps per arm; excludes spawn/import/warmup/final witness',rows,gains,passesPrescribedGate:pass},null,2));console.log(JSON.stringify({gains,passesPrescribedGate:pass}));
});

