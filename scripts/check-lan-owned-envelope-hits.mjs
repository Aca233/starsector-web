// Historical frozen candidate replay only; the production candidate failed its performance gate.
// Includes ABBA timing: do not repeat to select favorable results.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {test as nodeTest} from 'node:test';
import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
const out=path.resolve(process.env.OWNED_ENVELOPE_HITS_OUT??('artifacts/lan-owned-envelope-hits-20260927/check-'+Date.now()));
fs.mkdirSync(out,{recursive:true});
const sha=value=>createHash('sha256').update(value).digest('hex');
const frozen=process.env.OWNED_ENVELOPE_HITS_FROZEN??path.resolve('artifacts/lan-owned-envelope-hits-20260927/candidate-browser.json');
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
const baselineFiles=JSON.parse(fs.readFileSync(path.resolve('artifacts/lan-owned-envelope-hits-20260927/before.json'))).filter(r=>r.exists).map(r=>r.file);
const baseline=new Map(baselineFiles.map(file=>[file,fs.readFileSync(path.resolve('artifacts/lan-owned-envelope-hits-20260927/before',file),'utf8')]));
const code={};
const diagnostics={};
for(const enabled of [false,true,'default']){
 const result=await build({stdin:{contents,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',
  define:{__LAN_BUILD_ID__:JSON.stringify('interleaved-bounds-contract'),'import.meta.env':JSON.stringify({BASE_URL:'/',DEV:true,PROD:false,MODE:'development',SSR:false,VITE_AI_EXACT_AUTHORED_THREATS:'true',VITE_LAN_OWNED_MOTION_READS:'true',VITE_LAN_EARLY_PREAIM_RANGE:'true',VITE_AI_INTERLEAVED_THREATS:'true',...(enabled==='default'?{}:{VITE_AI_OWNED_ENVELOPE_HITS:String(enabled)})})},
  plugins:[{name:'same-frozen-source',setup(build){build.onResolve({filter:/^\./},args=>{const base=path.resolve(args.resolveDir,args.path);for(const suffix of['','.ts','.tsx','.json','.mts','.mjs']){const file=base+suffix;if(!fs.existsSync(file)&&sources.has(file.toLowerCase()))return{path:file};}});build.onLoad({filter:/\.(?:[cm]?[jt]sx?|json)$/},args=>{const row=sources.get(args.path.toLowerCase());if(row)return{contents:(!enabled&&baseline.has(row.file)?baseline.get(row.file):row.code)+(row.file==='src/network/host.worker.ts'?'\nexport {handleMessage}; export function testEngine(){ return engine; }':''),loader:path.extname(row.file).slice(1).replace(/^[cm]([jt]s)$/, '$1')};if(args.path.startsWith(path.resolve('src')+path.sep))throw Error('Unfrozen source: '+args.path);});}}]});
 code[String(enabled)]=result.outputFiles[0].text;
 let diagnostic=code[String(enabled)];
 for(const [getter,key]of[['allSystems','lists'],['hasExactThreatPhaseHooks','qualification']]){const needle='get '+getter+'() {';assert.equal(diagnostic.split(needle).length,2);diagnostic=diagnostic.replace(needle,needle+' if(globalThis.__envelopeCounter?.active)globalThis.__envelopeCounter.'+key+'++;');}
 diagnostics[String(enabled)]=diagnostic;
}
fs.writeFileSync(path.join(out,'build-manifest.json'),JSON.stringify({frozen,sourceSha256:sha(fs.readFileSync(frozen)),beforeBundle:sha(code.false),afterBundle:sha(code.true)},null,2));
async function load(enabled,name){globalThis.self={postMessage(){}};const file=path.join(out,name+'.mjs');fs.writeFileSync(file,code[String(enabled)],{flag:'wx'});return import(pathToFileURL(file).href);}
const hulls=['web_zhuyuan','web_gloriana','web_sc2_hyperion'],ai=Array.from({length:20},(_,i)=>hulls[i%3]);
const match={id:'authored-query-check',hostId:'host',seed:917,snapshotHz:60,players:[{id:'host',name:'Host',seat:0,team:0,hull:hulls[0]},{id:'guest',name:'Guest',seat:1,team:1,hull:hulls[0]}],options:{assignment:'teams',battleSize:3200,deploymentLimit:1600,aiHulls:[ai.slice(0,10),ai.slice(10)]}};
function world(api){const messages=[];globalThis.self={postMessage(m){messages.push(m);}};api.handleMessage(structuredClone({type:'init',match}));assert.ok(messages.some(m=>m.type==='ready'),JSON.stringify(messages.filter(m=>m.type==='error')));assert.ok(messages.some(m=>m.type==='snapshot'&&m.tick===0));assert.ok(!messages.some(m=>m.type==='error'));const engine=api.testEngine();assert.equal(engine.ships.length,176);return engine;}
function hidden(engine){return {random:engine.random.checkpointWitness(),visualRandom:engine.visualRandom.checkpointWitness(),ships:engine.ships.map(ship=>({id:ship.id,random:ship.random.checkpointWitness(),controlRandom:ship.weaponControl.random.checkpointWitness(),trackers:ship.weapons.map(mount=>{const t=ship.weaponControl.autofire.trackers.get(mount);return [mount.slotId,t?{target:t.target&&[t.target.kind,t.target.entity.id],scanIn:t.scanIn,firingTime:t.firingTime,idleFireTime:t.idleFireTime,ammoAllowed:t.ammoAllowed,random:t.random.checkpointWitness()}:null];})}))};}
function witness(api,engine,tick){return{combat:api.captureCombat(engine,tick,{},0),hidden:hidden(engine)};}







test('init/reinit/default: worker marks real writers only with explicit opt-in and closes afterward',async()=>{
 const rows=[];for(const enabled of[false,true,'default']){
  const api=await load(enabled,'init-'+enabled),factory=api.WeaponThreatEnvelope.forOwnedInterleavedPhase;let begins=0,last;
  api.WeaponThreatEnvelope.forOwnedInterleavedPhase=function(...args){const envelope=Reflect.apply(factory,this,args);last=envelope;if(envelope?.beginOwnedWrite){const original=envelope.beginOwnedWrite;envelope.beginOwnedWrite=function(...xs){begins++;return Reflect.apply(original,this,xs);};}return envelope;};
  for(let attempt=0;attempt<2;attempt++){const engine=world(api);assert.equal(engine.ships.reduce((n,s)=>n+s.weapons.length,0),734);const prior=begins;engine.fixedUpdate(1/60);assert.ok(last);assert.equal(last.get(engine.playerShip),undefined);assert.equal(last.writerGroup,undefined);if(enabled===true)assert.ok(begins>prior);else assert.equal(begins,prior);rows.push({enabled,attempt,markedWriters:begins-prior,entities:engine.ships.length});}
  api.WeaponThreatEnvelope.forOwnedInterleavedPhase=factory;
 }fs.writeFileSync(path.join(out,'init.json'),JSON.stringify(rows,null,2));
});

test('existing hits reuse proof only outside the current dependency group; misses and write invalidation stay live',async()=>{
 const api=await load(true,'hits'),engine=world(api),ships=engine.ships,child=ships.find(s=>s.parentShip),parent=child.parentShip,carrierChild=ships.find(s=>s.sourceCarrier),carrier=carrierChild.sourceCarrier;
 const env=api.WeaponThreatEnvelope.forOwnedInterleavedPhase(ships);assert.ok(env);const source=ships.find(s=>env.families.get(s)!==env.families.get(parent));assert.ok(source);
 const native=Object.getOwnPropertyDescriptor(api.Ship.prototype,'hasExactThreatPhaseHooks').get,reads=new Map();
 for(const ship of new Set([source,parent,carrier]))Object.defineProperty(ship,'hasExactThreatPhaseHooks',{configurable:true,get(){reads.set(this,(reads.get(this)??0)+1);return native.call(this);}});
 const initial=env.get(source);assert.ok(initial);assert.equal(reads.get(source),1);assert.equal(env.get(source),initial);assert.equal(reads.get(source),2);
 assert.equal(env.beginOwnedWrite(child),true);assert.equal(env.get(source),initial);assert.equal(env.get(source),initial);assert.equal(reads.get(source),2);
 const cachedParent=env.get(parent);assert.ok(cachedParent);const parentReads=reads.get(parent);assert.equal(env.get(parent),cachedParent);assert.equal(reads.get(parent),parentReads+1,'parent stays in live writer group');env.invalidate(child);env.endOwnedWrite();assert.equal(env.get(source),initial);assert.equal(reads.get(source),3,'no proof reuse outside marked write span');
 assert.equal(env.beginOwnedWrite(carrierChild),true);const carrierEnvelope=env.get(carrier);assert.ok(carrierEnvelope);const carrierReads=reads.get(carrier);assert.equal(env.get(carrier),carrierEnvelope);assert.equal(reads.get(carrier),carrierReads+1);env.invalidate(carrierChild);env.endOwnedWrite();
 assert.equal(env.beginOwnedWrite(source),true);const token={};source.externalPhaseEffects.set(token,()=>undefined);assert.equal(env.get(source),undefined,'current writer must check a new external reader');env.invalidate(source);env.endOwnedWrite();
 assert.equal(env.beginOwnedWrite(child),true);assert.equal(env.get(source),undefined,'invalidated source miss still checks the live gate');source.externalPhaseEffects.delete(token);const replacement=env.get(source);assert.ok(replacement);assert.notEqual(replacement,initial);const checked=reads.get(source);assert.equal(env.get(source),replacement);assert.equal(reads.get(source),checked);env.invalidate(child);env.endOwnedWrite();env.close();assert.equal(env.writerGroup,undefined);assert.equal(env.get(source),undefined);assert.equal(env.beginOwnedWrite(child),false);
 for(const ship of new Set([source,parent,carrier]))delete ship.hasExactThreatPhaseHooks;
 const exact=api.WeaponThreatEnvelope.forExactPhase(ships);assert.ok(exact);assert.equal(exact.beginOwnedWrite(child),false);assert.ok(exact.get(source));exact.close();
 const unknown=api.WeaponThreatEnvelope.forOwnedInterleavedPhase(ships);assert.equal(unknown.beginOwnedWrite({}),false);assert.equal(unknown.get(source),undefined);
 const nested=api.WeaponThreatEnvelope.forOwnedInterleavedPhase(ships);assert.equal(nested.beginOwnedWrite(parent),true);assert.equal(nested.beginOwnedWrite(child),false);assert.equal(nested.get(source),undefined);
 fs.writeFileSync(path.join(out,'hits.json'),JSON.stringify({parentAndCarrierStayLive:true,onlyUnchangedHitsReuse:true,missRequalifies:true,closed:true,exactFactoryDenied:true,unknownAndNestedWriterClose:true},null,2));
});

test('compatibility gate order, unknown effects, native vector identity and engine exception cleanup',async()=>{
 const api=await load(true,'fallback'),native=Object.getOwnPropertyDescriptor(api.Ship.prototype,'hasExactThreatPhaseHooks').get,rows=[];
 for(const kind of['exact-only','owned-outside-write']){
  const engine=world(api),ship=engine.playerShip,env=kind==='exact-only'?api.WeaponThreatEnvelope.forExactPhase(engine.ships):api.WeaponThreatEnvelope.forOwnedInterleavedPhase(engine.ships),first=env.get(ship);assert.ok(first);let calls=0;
  Object.defineProperty(ship,'hasExactThreatPhaseHooks',{configurable:true,get(){calls++;env.invalidate(this);return native.call(this);}});const next=env.get(ship);assert.ok(next);assert.notEqual(next,first,'read gate invalidation precedes Map lookup');assert.equal(calls,1);
  Object.defineProperty(ship,'hasExactThreatPhaseHooks',{configurable:true,get(){throw Error('qualification-failed');}});assert.throws(()=>env.get(ship),/qualification-failed/);delete ship.hasExactThreatPhaseHooks;env.close();rows.push({kind,gateBeforeMap:true,throws:true});
 }
 const engine=world(api),env=api.WeaponThreatEnvelope.forOwnedInterleavedPhase(engine.ships),writer=engine.playerShip,source=engine.ships.find(s=>env.families.get(s)!==env.families.get(writer));assert.ok(env.get(source));assert.equal(env.beginOwnedWrite(writer),true);const set=api.Vector2.prototype.set;try{api.Vector2.prototype.set=function(...args){return Reflect.apply(set,this,args);};assert.equal(env.get(source),undefined);}finally{api.Vector2.prototype.set=set;env.close();}
 for(const[kind,mutate]of Object.entries({status:s=>s.statusEffects.set('probe',{advance(){}}),interceptor:s=>s.hullDamageInterceptors.add(()=>0),armor:s=>s.armor.damageTakenModifiers=()=>1,flux:s=>s.flux.onOverloadStarted=()=>{},external:s=>s.externalPhaseEffects.set({},()=>undefined),weapon:s=>s.weaponControl.update=()=>{},phaseShield:s=>s.shield.type='PHASE'})){const e=world(api);mutate(e.playerShip);assert.equal(api.WeaponThreatEnvelope.forOwnedInterleavedPhase(e.ships),undefined,kind);rows.push({kind,rejected:true});}
 const e=world(api),factory=api.WeaponThreatEnvelope.forOwnedInterleavedPhase;let opened;
 api.WeaponThreatEnvelope.forOwnedInterleavedPhase=function(...args){opened=Reflect.apply(factory,this,args);assert.ok(opened);const begin=opened.beginOwnedWrite;opened.beginOwnedWrite=function(ship){assert.equal(Reflect.apply(begin,this,[ship]),true);throw Error('forced-writer-exit');};return opened;};
 try{assert.throws(()=>e.fixedUpdate(1/60),/forced-writer-exit/);}finally{api.WeaponThreatEnvelope.forOwnedInterleavedPhase=factory;}
 assert.ok(opened);assert.equal(opened.writerGroup,undefined);assert.equal(opened.get(e.playerShip),undefined);assert.equal(api.WeaponThreatEnvelope.prototype.beginOwnedWrite.call(opened,e.playerShip),false);
 fs.writeFileSync(path.join(out,'fallback.json'),JSON.stringify({rows,vectorIdentityRespected:true,finallyClosed:true},null,2));
});

test('20 initial full steps reduce redundant qualification reads with the complete original state',async()=>{
 const rows=[];for(const enabled of[false,true]){
  const file=path.join(out,'diagnostic-'+enabled+'.mjs');fs.writeFileSync(file,diagnostics[String(enabled)],{flag:'wx'});globalThis.self={postMessage(){}};globalThis.__envelopeCounter={active:false,lists:0,qualification:0};const api=await import(pathToFileURL(file).href),engine=world(api);globalThis.__envelopeCounter.active=true;
  try{for(let i=0;i<20;i++)engine.fixedUpdate(1/60);}finally{globalThis.__envelopeCounter.active=false;}
  rows.push({enabled,lists:globalThis.__envelopeCounter.lists,qualification:globalThis.__envelopeCounter.qualification,stateSha256:sha(JSON.stringify(witness(api,engine,20)))});
 }
 assert.equal(rows[0].stateSha256,rows[1].stateSha256);assert.equal(rows[0].stateSha256,'bc891a0f1c7b8da97559620bf2b36b6c7c35bbe3adde8467c4b6ec1b9b3ad224');assert.ok(rows[1].qualification<rows[0].qualification);assert.ok(rows[1].lists<rows[0].lists);delete globalThis.__envelopeCounter;
 fs.writeFileSync(path.join(out,'qualification-counts.json'),JSON.stringify({scope:'Source-local counters; not timing or allocation bytes',rows},null,2));
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
 assert.equal(passed,5,'do not time invalid candidate');const rows=[];
 for(const[index,enabled]of[false,true,true,false].entries()){
  const bundle=path.join(out,'bench-'+index+'.mjs'),runner=path.join(out,'bench-'+index+'-runner.mjs');fs.writeFileSync(bundle,code[String(enabled)],{flag:'wx'});
  const body=`import fs from 'node:fs';import assert from 'node:assert/strict';import{createHash}from'node:crypto';\nglobalThis.self={postMessage(){}};const api=await import(${JSON.stringify(pathToFileURL(bundle).href)});\nconst match=${JSON.stringify(match)};const sha=${sha.toString()};\n${world.toString()}\n${hidden.toString()}\n${witness.toString()}\nconst engine=world(api);for(let tick=0;tick<150;tick++)engine.fixedUpdate(1/60);const heapBefore=process.memoryUsage().heapUsed;const started=performance.now();for(let tick=0;tick<120;tick++)engine.fixedUpdate(1/60);const elapsedMs=performance.now()-started;console.log(JSON.stringify({elapsedMs,perStepMs:elapsedMs/120,heapBefore,heapAfter:process.memoryUsage().heapUsed,entities:engine.ships.length,stateSha256:sha(JSON.stringify(witness(api,engine,270)))}));`;
  fs.writeFileSync(runner,body,{flag:'wx'});const run=spawnSync(process.execPath,[runner],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});fs.writeFileSync(path.join(out,'bench-'+index+'.stdout.log'),run.stdout??'',{flag:'wx'});fs.writeFileSync(path.join(out,'bench-'+index+'.stderr.log'),run.stderr??'',{flag:'wx'});assert.equal(run.status,0,(run.stderr??'').slice(0,1000));const result=JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));rows.push({index,enabled,steps:120,...result});
  fs.writeFileSync(path.join(out,'abba.json'),JSON.stringify({scope:'Sequential isolated Node processes; original host init and fixedUpdate, NOT browser timing',rows},null,2));
 }
 assert.ok(rows.every(r=>r.entities===rows[0].entities));assert.ok(rows.every(r=>r.stateSha256===rows[0].stateSha256));const gains=[1-rows[1].elapsedMs/rows[0].elapsedMs,1-rows[2].elapsedMs/rows[3].elapsedMs],pass=gains.every(g=>g>=.03);
 fs.writeFileSync(path.join(out,'abba.json'),JSON.stringify({scope:'Sequential isolated Node processes; 150 warmup + 120 measured steps per arm; excludes spawn/import/warmup/final witness',rows,gains,passesPrescribedGate:pass},null,2));console.log(JSON.stringify({gains,passesPrescribedGate:pass}));
});

