import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {test as nodeTest} from 'node:test';
import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
const out=path.resolve(process.env.PREAIM_READ_LEASE_OUT??('artifacts/lan-preaim-read-lease-20260927/check-'+Date.now()));
fs.mkdirSync(out,{recursive:true});
const sha=value=>createHash('sha256').update(value).digest('hex');
const frozen=process.env.PREAIM_READ_LEASE_FROZEN??path.resolve('artifacts/lan-preaim-read-lease-20260927/candidate-browser.json');
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
export {OwnedPreAimReadBatch} from './src/engine/ai/OwnedPreAimReadBatch';
export {AutofireController} from './src/engine/ai/AutofireController';
export {ShipWeaponControlSystem} from './src/engine/simulation/systems/ShipWeaponControlSystem';
export {Vector2} from './src/engine/math/Vector2';
export {captureCombat} from './src/network/AuthorityCombatSnapshot';
`;
const baselineFiles=JSON.parse(fs.readFileSync(path.resolve('artifacts/lan-preaim-read-lease-20260927/before.json'))).filter(r=>r.exists).map(r=>r.file);
const baseline=new Map(baselineFiles.map(file=>[file,fs.readFileSync(path.resolve('artifacts/lan-preaim-read-lease-20260927/before',file),'utf8')]));
const code={};
for(const enabled of [false,true,'default']){
 const result=await build({stdin:{contents,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',
  define:{__LAN_BUILD_ID__:JSON.stringify('interleaved-bounds-contract'),'import.meta.env':JSON.stringify({BASE_URL:'/',DEV:true,PROD:false,MODE:'development',SSR:false,VITE_AI_EXACT_AUTHORED_THREATS:'true',VITE_LAN_OWNED_MOTION_READS:'true',VITE_LAN_EARLY_PREAIM_RANGE:'true',VITE_AI_INTERLEAVED_THREATS:'true',...(enabled==='default'?{}:{VITE_LAN_PREAIM_READ_LEASE:String(enabled)})})},
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







function observeBatches(api){const batches=[],factory=api.OwnedPreAimReadBatch.create,read=api.OwnedPreAimReadBatch.prototype.read;let queries=0,hits=0,negativeHits=0;api.OwnedPreAimReadBatch.create=function(...args){const b=factory.apply(this,args);if(b)batches.push(b);return b;};api.OwnedPreAimReadBatch.prototype.read=function(...args){const cached=this.reads.has(args[2]),value=read.apply(this,args);if(value!==undefined){queries++;if(cached){hits++;if(value===false)negativeHits++;}}return value;};return{batches,counts:()=>({queries,hits,negativeHits})};}
function view(engine,ships=engine.ships){return{ships,missiles:engine.projectiles,asteroids:engine.asteroids};}
test('real init/reinit/default preserves workload and actually reuses pure reader checks',async()=>{
 const rows=[];for(const enabled of[false,true,'default']){const api=await load(enabled,'init-'+enabled),probe=observeBatches(api);for(let attempt=0;attempt<2;attempt++){const engine=world(api);assert.equal(engine.ships.reduce((n,s)=>n+s.weapons.length,0),734);engine.fixedUpdate(1/60);assert.ok(probe.batches.every(b=>!b.active&&b.reads.size===0));rows.push({enabled,attempt,batches:probe.batches.length,...probe.counts()});}}
 for(const row of rows){if(row.enabled===true)assert.ok(row.batches>0&&row.hits>0&&row.queries>row.hits);else assert.equal(row.batches,0);}
 fs.writeFileSync(path.join(out,'init-reuse.json'),JSON.stringify(rows,null,2));
});
test('eight actual-roster scenarios preserve every preAim point, priority and roster tie order',async()=>{
 const api=await load(true,'point-difference'),rows=[];let compared=0,points=0; const probe=observeBatches(api);
 for(let scenario=0;scenario<8;scenario++){
  const engine=world(api),ships=engine.ships;
  for(const[s,i]of ships.map((s,i)=>[s,i])){s.pos.set(s.teamId===0?-300:300,(i%8)*120-400);s.facingRad=s.teamId===0?0:Math.PI;s.vel.set(0,0);s.currentTargetShip=null;
   if(scenario===0)s.pos.x*=30;
   if(scenario===2){s.shield.isActive=true;s.shield.radius=s.spec.collisionRadius*2;s.facingRad=i*.1;}
   if(scenario===3){s.vel.set(i%2?700:-700,i%3?300:-300);s.flux.isVenting=i%3===0;}
   if(scenario===4){s.pos.set(s.teamId===0?-400:400,0);s.currentTargetShip=ships.find(t=>t.teamId!==s.teamId);}
   if(scenario===5){s.pos.x=i%11===0?NaN:s.pos.x;s.vel.y=i%9===0?Infinity:0;}
   if(scenario===6){s.pos.x=i%7===0?Number.MAX_VALUE:s.pos.x;s.vel.x=-0;}
   if(scenario===7){s.flux.softFlux=s.flux.maxFlux*.4;for(const system of s.allSystems){system.isActive=true;system.effectLevel=.7;system.state='ACTIVE';}}
  }
  const phase=api.WeaponThreatEnvelope.forOwnedInterleavedPhase(ships);assert.ok(phase,scenario);let checks=0,nonNull=0;
  for(const ship of engine.combatShips){const plain=view(engine,ships),base={...plain,preAimReadPhase:phase},batch=api.OwnedPreAimReadBatch.create(ship,base),control=ship.weaponControl.autofire;
   for(const mount of ship.weapons){const expected=control.preAim(ship,mount,plain),actual=control.preAim(ship,mount,{...base,preAimReadBatch:batch});assert.deepEqual(actual,expected,'scenario '+scenario+' '+ship.id+'/'+mount.slotId);checks++;if(actual)nonNull++;}
   batch?.close();
  }
  phase.close();rows.push({scenario,checks,nonNull});compared+=checks;points+=nonNull;
 }
 assert.ok(compared>1000&&points>0&&probe.counts().hits>0);fs.writeFileSync(path.join(out,'point-difference.json'),JSON.stringify({compared,points,reads:probe.counts(),rows},null,2));
});
test('write-certified scope only: root/closed/foreign roster and unknown callbacks never receive a batch',async()=>{
 const api=await load(true,'fallback'),rows=[];
 for(const kind of['none','root-phase','closed-phase','copied-roster','short-roster','foreign-roster','status','phase-callback','armor','flux','unknown-advance']){
  const engine=world(api),ships=engine.ships,ship=engine.combatShips.find(s=>s.weapons.length>=4),target=ships.find(s=>s.teamId!==ship.teamId);let callbacks=0;
  if(kind==='status')target.statusEffects.set('unknown',{advance(){callbacks++;return true;}});
  if(kind==='phase-callback')target.externalPhaseEffects.set('unknown',()=>{callbacks++;return undefined;});
  if(kind==='armor')target.armor.onCellDamage=()=>{callbacks++;};
  if(kind==='flux')target.flux.onOverloadStarted=()=>{callbacks++;};
  if(kind==='unknown-advance'){api.hullModDefinitions.register({id:'bounds_unknown',name:'test',status:'implemented',description:'test',advance(){callbacks++;}});target.spec={...target.spec,hullMods:[...(target.spec.hullMods??[]),'bounds_unknown']};}
  const phase=kind==='root-phase'?api.WeaponThreatEnvelope.forExactPhase(ships):kind==='none'?undefined:api.WeaponThreatEnvelope.forOwnedInterleavedPhase(ships);if(kind==='closed-phase')phase.close();
  const roster=kind==='copied-roster'?ships.slice():kind==='short-roster'?ships.slice(1):kind==='foreign-roster'?ships.map((s,i)=>i===0?{}:s):ships;
  assert.equal(api.OwnedPreAimReadBatch.create(ship,{...view(engine,roster),preAimReadPhase:phase}),undefined,kind);
  if(kind==='phase-callback'){ship.currentTargetShip=target;ship.pos.set(0,0);target.pos.set(100,0);const mount=ship.weapons.find(m=>m.mountType!=='HARDPOINT');ship.weaponControl.autofire.preAim(ship,mount,view(engine,ships));assert.ok(callbacks>0,'original callback still runs');}
  phase?.close();rows.push({kind,callbacks});
 }
 const engine=world(api),ships=engine.ships,ship=engine.combatShips.find(s=>s.weapons.length>=4),target=ships.find(s=>s.teamId!==ship.teamId),originalSpec=target.spec;
 const phase=api.WeaponThreatEnvelope.forOwnedInterleavedPhase(ships),base={...view(engine,ships),preAimReadPhase:phase},batch=api.OwnedPreAimReadBatch.create(ship,base);assert.ok(batch);
 let reads=0;const read=target.hasNativePreAimRangeReads;target.hasNativePreAimRangeReads=function(){reads++;return read.call(this);};
 assert.equal(batch.read(ship,ships,target),true);assert.equal(batch.read(ship,ships,target),true);assert.equal(reads,1);
 const alien=world(api).ships[0];assert.equal(batch.read(ship,ships,alien),undefined);assert.equal(batch.read(alien,ships,target),undefined);assert.equal(batch.read(ship,ships.slice(),target),undefined);
 phase.invalidate(target);assert.equal(batch.read(ship,ships,target),undefined);batch.close();assert.equal(batch.reads.size,0);
 // A mutable spec cannot be certified for early range rejection. False is a
 // real cached result; a fresh loop must observe new eligibility, never stale.
 target.spec={...target.spec};const negative=api.OwnedPreAimReadBatch.create(ship,base);assert.ok(negative);assert.equal(negative.read(ship,ships,target),false);assert.equal(negative.read(ship,ships,target),false);assert.equal(reads,2);negative.close();
 target.spec=originalSpec;
 const refreshed=api.OwnedPreAimReadBatch.create(ship,base);assert.ok(refreshed);const expected=read.call(target);assert.equal(expected,true);assert.equal(refreshed.read(ship,ships,target),expected);assert.equal(reads,3);phase.close();assert.equal(refreshed.read(ship,ships,target),undefined);refreshed.close();
 fs.writeFileSync(path.join(out,'fallback-results.json'),JSON.stringify({rows,permissionReads:reads,positiveCached:true,negativeCached:true,invalidation:true,closed:true},null,2));
});
test('assessment exception closes both per-ship permission lease and enclosing writer certificate',async()=>{
 const api=await load(true,'exception'),engine=world(api),probe=observeBatches(api),method=api.AutofireController.prototype.preAim;let caughtBatch;
 api.AutofireController.prototype.preAim=function(ship,mount,world){if(world.preAimReadBatch){caughtBatch=world.preAimReadBatch;throw Error('contract preAim exception');}return method.call(this,ship,mount,world);};assert.throws(()=>engine.fixedUpdate(1/60),/contract preAim exception/);api.AutofireController.prototype.preAim=method;assert.ok(caughtBatch);assert.equal(caughtBatch.active,false);assert.ok(probe.batches.every(b=>!b.active));assert.equal(caughtBatch.phase.active,false);fs.writeFileSync(path.join(out,'exception-result.json'),JSON.stringify({batches:probe.batches.length,closed:true},null,2));
});
test('60 fixed steps preserve complete authority and hidden fire-control/RNG state',async()=>{
 const aApi=await load(false,'engine-reference'),bApi=await load(true,'engine-candidate'),a=world(aApi),b=world(bApi),hashes=[],probe=observeBatches(bApi);let emitted=0;const fire=bApi.ShipWeaponControlSystem.prototype.fireWeapon;bApi.ShipWeaponControlSystem.prototype.fireWeapon=function(...args){assert.ok(probe.batches.every(batch=>!batch.active),'permission lease must close before emission');const result=fire.apply(this,args);if(result)emitted++;return result;};
 for(let tick=1;tick<=60;tick++){
  for(const engine of[a,b]){
   if(tick===8)for(const s of engine.capitalShips){s.aimTargetWorld.set(s.pos.x+1000,s.pos.y+500);s.flux.softFlux=s.flux.maxFlux*.2;for(const system of s.systems)system.activate();}
   if(tick===20)for(const[i,s]of engine.capitalShips.entries()){s.pos.set(s.teamId===0?-500:500,(i%6)*240-600);s.aimTargetWorld.set(s.teamId===0?500:-500,s.pos.y);s.isFiringMain=true;}
   if(tick===30)for(const s of engine.capitalShips)s.startVenting();
   if(tick===38){const child=engine.combatShips.find(s=>s.parentShip);child.hullHp=child.maxHullHp*.35;child.flux.isVenting=false;child.flux.isOverloaded=false;child.flux.softFlux=child.flux.hardFlux=0;}
  }
  a.fixedUpdate(1/60);b.fixedUpdate(1/60);
  const left=witness(aApi,a,tick),right=witness(bApi,b,tick);assert.deepEqual(right,left,'state tick '+tick);hashes.push(sha(JSON.stringify(right)));
 }
 assert.ok(emitted>0&&probe.batches.length>0,'must exercise real emissions and leases');fs.writeFileSync(path.join(out,'emission-lifetime.json'),JSON.stringify({emitted,batches:probe.batches.length,closed:true},null,2));
 fs.writeFileSync(path.join(out,'whole-state-hashes.json'),JSON.stringify(hashes,null,2));
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
