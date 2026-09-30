import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {test as nodeTest} from 'node:test';
import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
const out=path.resolve(process.env.INTERLEAVED_THREATS_OUT??('artifacts/lan-interleaved-threats-20260927/check-'+Date.now()));
fs.mkdirSync(out,{recursive:true});
const sha=value=>createHash('sha256').update(value).digest('hex');
const frozen=process.env.INTERLEAVED_THREATS_FROZEN??path.resolve('artifacts/lan-interleaved-threats-20260927/candidate-v2-browser.json');
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
export {Vector2} from './src/engine/math/Vector2';
export {captureCombat} from './src/network/AuthorityCombatSnapshot';
`;
const baselineFiles=JSON.parse(fs.readFileSync(path.resolve('artifacts/lan-interleaved-threats-20260927/before.json'))).map(r=>r.file);
const baseline=new Map(baselineFiles.map(file=>[file,fs.readFileSync(path.resolve('artifacts/lan-interleaved-threats-20260927/before',file),'utf8')]));
const code={};
for(const enabled of [false,true,'default']){
 const result=await build({stdin:{contents,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',
  define:{__LAN_BUILD_ID__:JSON.stringify('interleaved-threat-contract'),'import.meta.env':JSON.stringify({BASE_URL:'/',DEV:true,PROD:false,MODE:'development',SSR:false,VITE_AI_EXACT_AUTHORED_THREATS:'true',VITE_LAN_OWNED_MOTION_READS:'true',VITE_LAN_EARLY_PREAIM_RANGE:'true',...(enabled==='default'?{}:{VITE_AI_INTERLEAVED_THREATS:String(enabled)})})},
  plugins:[{name:'same-frozen-source',setup(build){build.onLoad({filter:/\.(?:[cm]?[jt]sx?|json)$/},args=>{const row=sources.get(args.path.toLowerCase());if(row)return{contents:(!enabled&&baseline.has(row.file)?baseline.get(row.file):row.code)+(row.file==='src/network/host.worker.ts'?'\nexport {handleMessage}; export function testEngine(){ return engine; }':''),loader:path.extname(row.file).slice(1).replace(/^[cm]([jt]s)$/, '$1')};if(args.path.startsWith(path.resolve('src')+path.sep))throw Error('Unfrozen source: '+args.path);});}}]});
 code[String(enabled)]=result.outputFiles[0].text;
}
fs.writeFileSync(path.join(out,'build-manifest.json'),JSON.stringify({frozen,sourceSha256:sha(fs.readFileSync(frozen)),beforeBundle:sha(code.false),afterBundle:sha(code.true)},null,2));
async function load(enabled,name){globalThis.self={postMessage(){}};const file=path.join(out,name+'.mjs');fs.writeFileSync(file,code[String(enabled)],{flag:'wx'});return import(pathToFileURL(file).href);}
const hulls=['web_zhuyuan','web_gloriana','web_sc2_hyperion'],ai=Array.from({length:20},(_,i)=>hulls[i%3]);
const match={id:'authored-query-check',hostId:'host',seed:917,snapshotHz:60,players:[{id:'host',name:'Host',seat:0,team:0,hull:hulls[0]},{id:'guest',name:'Guest',seat:1,team:1,hull:hulls[0]}],options:{assignment:'teams',battleSize:3200,deploymentLimit:1600,aiHulls:[ai.slice(0,10),ai.slice(10)]}};
function world(api){const messages=[];globalThis.self={postMessage(m){messages.push(m);}};api.handleMessage(structuredClone({type:'init',match}));assert.ok(messages.some(m=>m.type==='ready'),JSON.stringify(messages.filter(m=>m.type==='error')));assert.ok(messages.some(m=>m.type==='snapshot'&&m.tick===0));assert.ok(!messages.some(m=>m.type==='error'));const engine=api.testEngine();assert.equal(engine.ships.length,176);return engine;}
function hidden(engine){return {random:engine.random.checkpointWitness(),visualRandom:engine.visualRandom.checkpointWitness(),ships:engine.ships.map(ship=>({id:ship.id,random:ship.random.checkpointWitness(),controlRandom:ship.weaponControl.random.checkpointWitness(),trackers:ship.weapons.map(mount=>{const t=ship.weaponControl.autofire.trackers.get(mount);return [mount.slotId,t?{target:t.target&&[t.target.kind,t.target.entity.id],scanIn:t.scanIn,firingTime:t.firingTime,idleFireTime:t.idleFireTime,ammoAllowed:t.ammoAllowed,random:t.random.checkpointWitness()}:null];})}))};}
function witness(api,engine,tick){return{combat:api.captureCombat(engine,tick,{},0),hidden:hidden(engine)};}






function scene(engine,envelope){return{ships:engine.ships,projectiles:engine.projectiles,beams:engine.beams,asteroids:engine.asteroids,exactWeaponThreatEnvelope:envelope};}
function observeSpans(api){const spans=[],factory=api.WeaponThreatEnvelope.forOwnedInterleavedPhase;let hits=0,misses=0;if(!factory)return{spans,counts:()=>({hits,misses})};api.WeaponThreatEnvelope.forOwnedInterleavedPhase=function(ships){const value=factory.call(this,ships);if(value)spans.push(value);return value;};const get=api.WeaponThreatEnvelope.prototype.get;api.WeaponThreatEnvelope.prototype.get=function(ship){const old=this.envelopes.get(ship),value=get.call(this,ship);if(spans.includes(this)&&value){if(value===old)hits++;else misses++;}return value;};return{spans,counts:()=>({hits,misses})};}
test('real Worker init/reinit/default: full load, independent span, cache hits and final close',async()=>{
 const rows=[];for(const enabled of[false,true,'default']){const api=await load(enabled,'init-'+enabled),probe=observeSpans(api);for(let attempt=0;attempt<2;attempt++){const engine=world(api);assert.equal(engine.ships.reduce((n,s)=>n+s.weapons.length,0),734);if(enabled===true){const rejected=engine.ships.filter(s=>!s.hasOwnedLocalThreatUpdate).map(s=>({id:s.id,hull:s.spec.id,phase:s.shield.type,exact:s.hasExactThreatPhaseHooks,status:s.statusEffects.size,intercept:s.hullDamageInterceptors.size}));assert.deepEqual(rejected,[],'actual ships must qualify');}engine.fixedUpdate(1/60);for(const span of probe.spans){assert.equal(span.active,false);assert.equal(span.envelopes.size,0);assert.equal(span.get(engine.playerShip),undefined);}rows.push({enabled,attempt,spans:probe.spans.length,...probe.counts()});}}
 for(const row of rows){assert.equal(row.spans,row.enabled===true?row.attempt+1:0);if(row.enabled===true)assert.ok(row.hits>row.misses&&row.misses>0);}
 fs.writeFileSync(path.join(out,'init-reuse.json'),JSON.stringify(rows,null,2));
});
test('dependency groups: exact threat results after local writes, retirement and live projectile/beam changes',async()=>{
 const api=await load(true,'group-contract'),engine=world(api),span=api.WeaponThreatEnvelope.forOwnedInterleavedPhase(engine.ships);assert.ok(span);const root=engine.capitalShips.find(s=>s.childModules.length>0),child=root.childModules[0],other=engine.capitalShips.find(s=>s!==root&&s.teamId!==root.teamId),carrier=engine.ships.find(s=>s.sourceCarrier),rows=[];
 for(const[s,i]of engine.ships.map((s,i)=>[s,i])){s.pos.set(s.teamId===0?-350:350,(i%8)*120);s.vel.set(3,-2);} // no envelope populated before these writes
 const observer=engine.combatShips.find(s=>s.parentShip&&s.teamId!==root.teamId);
 for(const kind of['system','mount','runtime','critical','retreat','projectile-beam']){
  const oldRoot=span.get(root),oldChild=span.get(child),oldOther=span.get(other);assert.ok(oldRoot&&oldChild&&oldOther);
  if(kind==='system'){for(const s of root.allSystems){s.isActive=true;s.effectLevel=.65;s.state='ACTIVE';}}
  if(kind==='mount'){root.weapons[0].ammo=0;child.weapons[0].currentAngleRad+=.25;child.pos.x+=37;}
  if(kind==='runtime')root.runtimeModifiers.set('contract',{weapons:{ENERGY:{rangePercent:25}},speedMultiplier:1.2});
  if(kind==='critical'){root.currentCR=.05;root.applyCriticalMalfunctionDamage(new api.Vector2(0,0));}
  if(kind==='retreat')root.retreatFromCombat();
  if(kind==='projectile-beam'){
   for(const beam of[false,true]){const source=engine.ships.find(s=>!s.isRetreated&&s.teamId!==observer.teamId&&s.weapons.some(m=>!!m.spec.isBeam===beam)),mount=source?.weapons.find(m=>!!m.spec.isBeam===beam);assert.ok(source&&mount,'real loadout has '+(beam?'beam':'projectile'));source.flux.isVenting=false;source.flux.isOverloaded=false;source.flux.softFlux=source.flux.hardFlux=0;mount.ammo=Infinity;mount.reloadDelayRemaining=0;mount.currentAngleRad=0;assert.equal(source.weaponControl.fireWeapon(mount,source,p=>{p.pos.set(observer.pos.x-300,observer.pos.y);p.vel.set(1000,0);engine.projectiles.push(p);},b=>{b.startPos.set(observer.pos.x-300,observer.pos.y);b.endPos.set(observer.pos.x+300,observer.pos.y);engine.beams.push(b);}),true);span.invalidate(source);}
   assert.ok(engine.projectiles.length>0&&engine.beams.length>0,'must emit both live entity types');
  }
  span.invalidate(child);assert.notEqual(span.get(root),oldRoot);assert.notEqual(span.get(child),oldChild);if(kind!=='projectile-beam')assert.equal(span.get(other),oldOther);
  const expected=api.assessThreats(observer,scene(engine),8,1),actual=api.assessThreats(observer,scene(engine,span),8,1);assert.deepEqual(actual,expected,kind);if(kind==='projectile-beam'){assert.ok(actual.threats.some(t=>t.kind==='PROJECTILE'));assert.ok(actual.threats.some(t=>t.kind==='BEAM'));engine.beams.at(-1).damagePerSec*=2;assert.deepEqual(api.assessThreats(observer,scene(engine,span),8,1),api.assessThreats(observer,scene(engine),8,1),'live beam refresh');}rows.push({kind,threats:actual.threats.length,projectiles:engine.projectiles.length,beams:engine.beams.length});
 }
 if(carrier){const a=span.get(carrier),b=span.get(carrier.sourceCarrier);span.invalidate(carrier);assert.notEqual(span.get(carrier),a);assert.notEqual(span.get(carrier.sourceCarrier),b);}
 span.close();assert.equal(span.get(other),undefined);fs.writeFileSync(path.join(out,'group-results.json'),JSON.stringify(rows,null,2));
});
test('unknown writers/readers and public engine hooks decline the whole interleaved span',async()=>{
 const rows=[];for(const kind of['status','interceptor','armor-damage','armor-effective','armor-cell','flux','phase','unknown-advance','module-ai','ship-update','retreat-hook','roster-hook']){
  const aa=await load(false,'guard-before-'+kind),ba=await load(true,'guard-after-'+kind),a=world(aa),b=world(ba),probe=observeSpans(ba),traces=[[],[]];
  for(const[engine,api,trace]of[[a,aa,traces[0]],[b,ba,traces[1]]]){const s=engine.combatShips.find(s=>s.parentShip),enemy=engine.capitalShips.find(o=>o.teamId!==s.teamId);
   if(kind==='status')s.statusEffects.set('edge',{advance(){trace.push('status');enemy.weapons[0].ammo=0;return false;}});
   if(kind==='interceptor'){s.hullDamageInterceptors.add(()=>{trace.push('interceptor');enemy.pos.x+=1;return false;});}
   if(kind==='armor-damage')s.armor.damageTakenModifiers=()=>({armor:1,hull:1});
   if(kind==='armor-effective')s.armor.dynamicEffectiveArmorMultiplier=()=>1;
   if(kind==='armor-cell')s.armor.onCellDamage=()=>trace.push('cell');
   if(kind==='flux')s.flux.onOverloadStarted=()=>trace.push('overload');
   if(kind==='phase')s.shield.type='PHASE';
   if(kind==='unknown-advance'){api.hullModDefinitions.register({id:'contract_advance',name:'contract',status:'implemented',description:'contract',advance(){trace.push('advance');enemy.weapons[0].ammo=0;}});s.spec={...s.spec,hullMods:[...(s.spec.hullMods??[]),'contract_advance']};}
   if(kind==='module-ai'){engine.fixedUpdate(1/60);const ai=engine.moduleAI.get(s),update=ai.update;ai.update=function(...args){trace.push('ai');return update.apply(this,args);};}
   if(kind==='ship-update'){const update=s.update;s.update=function(...args){trace.push('ship');return update.apply(this,args);};}
   if(kind==='retreat-hook'){const update=engine.deployment.navigateRetreat;engine.deployment.navigateRetreat=function(...args){trace.push('retreat');return update.apply(this,args);};}
   if(kind==='roster-hook'){const desc=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(engine),'ships');Object.defineProperty(engine,'ships',{configurable:true,get(){return desc.get.call(this);}});}
  }
  const oldSpans=probe.spans.length;a.fixedUpdate(1/60);b.fixedUpdate(1/60);assert.equal(probe.spans.length,oldSpans,kind);assert.deepEqual(witness(ba,b,1),witness(aa,a,1),kind);assert.deepEqual(traces[1],traces[0],kind);rows.push({kind,callbacks:traces[1].length});
 }
 fs.writeFileSync(path.join(out,'fallback-results.json'),JSON.stringify(rows,null,2));
});
test('finally closes on assessment exception; loss of writer qualification closes before its callback',async()=>{
 const api=await load(true,'lifecycle'),engine=world(api),probe=observeSpans(api),get=api.WeaponThreatEnvelope.prototype.get;let thrown=false;api.WeaponThreatEnvelope.prototype.get=function(ship){if(probe.spans.includes(this)&&!thrown){thrown=true;throw Error('contract assessment failure');}return get.call(this,ship);};assert.throws(()=>engine.fixedUpdate(1/60),/contract assessment failure/);api.WeaponThreatEnvelope.prototype.get=get;assert.ok(thrown);assert.equal(probe.spans.length,1);assert.equal(probe.spans[0].active,false);assert.equal(probe.spans[0].get(engine.playerShip),undefined);
 const next=world(api),victim=next.combatShips.find(s=>s.parentShip),invalidate=api.WeaponThreatEnvelope.prototype.invalidate;let injected=false,callbackRan=false;api.WeaponThreatEnvelope.prototype.invalidate=function(ship){invalidate.call(this,ship);if(probe.spans.includes(this)&&!injected){injected=true;victim.statusEffects.set('late',{advance(){assert.equal(probe.spans.at(-1).active,false);callbackRan=true;return false;}});}};next.fixedUpdate(1/60);api.WeaponThreatEnvelope.prototype.invalidate=invalidate;assert.ok(injected&&callbackRan);assert.ok(probe.spans.every(s=>!s.active));
 fs.writeFileSync(path.join(out,'lifecycle-results.json'),JSON.stringify({thrown,injected,callbackRan,closed:probe.spans.length},null,2));
});
test('60 fixed steps preserve complete authority and hidden fire-control/RNG state',async()=>{
 const aApi=await load(false,'engine-reference'),bApi=await load(true,'engine-candidate'),a=world(aApi),b=world(bApi),hashes=[];
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
