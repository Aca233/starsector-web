import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {test as nodeTest} from 'node:test';
import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
const out=path.resolve(process.env.CONTINUOUS_THREAT_BOUNDS_OUT??('artifacts/lan-continuous-threat-bounds-20260927/check-'+Date.now()));
fs.mkdirSync(out,{recursive:true});
const sha=value=>createHash('sha256').update(value).digest('hex');
const frozen=process.env.CONTINUOUS_THREAT_BOUNDS_FROZEN??path.resolve('artifacts/lan-continuous-threat-bounds-20260927/candidate-browser.json');
const snapshot=JSON.parse(fs.readFileSync(frozen)),sources=new Map(snapshot.files.map(row=>{
 assert.equal(sha(row.code),row.sha256);return [path.resolve(row.file).toLowerCase(),row];
}));
const mode=process.env.CONTINUOUS_THREAT_BOUNDS_MODE??'contracts', selected=process.env.CONTINUOUS_THREAT_BOUNDS_CASE;
const proofRows=[], required=[];
const test=(name,body)=>{
 const signature=sha(body.toString()); required.push({name,signature});
 if(mode==='bench'||selected&&!name.includes(selected))return;
 nodeTest(name,async()=>{await body();proofRows.push({name,signature,frozenSha256:sha(fs.readFileSync(frozen)),beforeBundle:sha(code.false),afterBundle:sha(code.true)});fs.writeFileSync(path.join(out,'proofs.json'),JSON.stringify(proofRows,null,2));});
};
const contents=`
export {handleMessage,testEngine} from './src/network/host.worker';
export {createLanWorld} from './src/network/LanWorld';
export {Ship} from './src/engine/simulation/Ship';
export {ShipSystem} from './src/engine/simulation/ShipSystem';
export {WeaponThreatEnvelope} from './src/engine/ai/WeaponThreatEnvelope';
export {AutofireController} from './src/engine/ai/AutofireController';
export {assessThreats} from './src/engine/ai/ThreatAssessment';
export {Vector2} from './src/engine/math/Vector2';
export {RuntimeCombatModifiers} from './src/engine/extensions/RuntimeCombatModifiers';
export {InFlightFireBudget} from './src/engine/ai/InFlightFireBudget';
export {captureCombat} from './src/network/AuthorityCombatSnapshot';
`;
const baselineFiles=JSON.parse(fs.readFileSync(path.resolve('artifacts/lan-continuous-threat-bounds-20260927/before.json'))).filter(r=>r.exists).map(r=>r.file);
const baseline=new Map(baselineFiles.map(file=>[file,fs.readFileSync(path.resolve('artifacts/lan-continuous-threat-bounds-20260927/before',file),'utf8')]));
const code={};
function instrument(file,text){
 if(file!=='src/engine/ai/ThreatAssessment.ts')return text;
 const replace=(from,to)=>{assert.equal(text.split(from).length,2,from);text=text.replace(from,to);};
 replace('let mountIndex = 0;', 'let mountIndex = 0; let __afterAdd = false;');
 replace('if (distanceFromOrigin > reach+pad) continue;', 'if (distanceFromOrigin > reach+pad) { globalThis.__boundsProbe?.reject?.(__afterAdd); continue; }');
 replace('const cachedMuzzleX =', 'globalThis.__boundsProbe?.geometry?.(__afterAdd); const cachedMuzzleX =');
 replace("add('WEAPON',enemy.id,eta,damage,m.spec.type,muzzle);", "add('WEAPON',enemy.id,eta,damage,m.spec.type,muzzle); __afterAdd = true;");
 replace('const envelope = weaponEnvelopes?.get(enemy);', 'const envelope = weaponEnvelopes?.get(enemy); if (envelope) globalThis.__boundsProbe?.envelope?.();');
 if(text.includes('if (!CONTINUOUS_THREAT_BOUNDS || !envelope) boundWeapons = false;'))replace('if (!CONTINUOUS_THREAT_BOUNDS || !envelope) boundWeapons = false;', 'if (!CONTINUOUS_THREAT_BOUNDS || !envelope) boundWeapons = false; if (boundWeapons) globalThis.__boundsProbe?.retained?.();');
 return text;
}
for(const key of ['false','true','default','false-probe','true-probe','default-probe']){
 const enabled=key.startsWith('false')?false:key.startsWith('true')?true:'default',probe=key.endsWith('-probe');
 const result=await build({stdin:{contents,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',
  define:{__LAN_BUILD_ID__:JSON.stringify('continuous-threat-bounds-contract'),'import.meta.env':JSON.stringify({BASE_URL:'/',DEV:true,PROD:false,MODE:'development',SSR:false,VITE_AI_EXACT_AUTHORED_THREATS:'true',VITE_LAN_OWNED_MOTION_READS:'true',VITE_LAN_EARLY_PREAIM_RANGE:'true',VITE_AI_INTERLEAVED_THREATS:'true',...(enabled==='default'?{}:{VITE_AI_CONTINUOUS_THREAT_BOUNDS:String(enabled)})})},
  plugins:[{name:'same-frozen-source',setup(build){build.onLoad({filter:/\.(?:[cm]?[jt]sx?|json)$/},args=>{const row=sources.get(args.path.toLowerCase());if(row){const text=!enabled&&baseline.has(row.file)?baseline.get(row.file):row.code;return{contents:(probe?instrument(row.file,text):text)+(row.file==='src/network/host.worker.ts'?'\nexport {handleMessage}; export function testEngine(){ return engine; }':''),loader:path.extname(row.file).slice(1).replace(/^[cm]([jt]s)$/, '$1')};}if(args.path.startsWith(path.resolve('src')+path.sep))throw Error('Unfrozen source: '+args.path);});}}]});
 code[key]=result.outputFiles[0].text;
 if(enabled===true)assert.ok(code[key].includes('VITE_AI_CONTINUOUS_THREAT_BOUNDS: "true"'));
}
fs.writeFileSync(path.join(out,'build-manifest.json'),JSON.stringify({frozen,sourceSha256:sha(fs.readFileSync(frozen)),beforeBundle:sha(code.false),afterBundle:sha(code.true)},null,2));
async function load(enabled,name){globalThis.self={postMessage(){}};const file=path.join(out,name+'.mjs');fs.writeFileSync(file,code[String(enabled)],{flag:'wx'});return import(pathToFileURL(file).href);}
const hulls=['web_zhuyuan','web_gloriana','web_sc2_hyperion'],ai=Array.from({length:20},(_,i)=>hulls[i%3]);
const match={id:'authored-query-check',hostId:'host',seed:917,snapshotHz:60,players:[{id:'host',name:'Host',seat:0,team:0,hull:hulls[0]},{id:'guest',name:'Guest',seat:1,team:1,hull:hulls[0]}],options:{assignment:'teams',battleSize:3200,deploymentLimit:1600,aiHulls:[ai.slice(0,10),ai.slice(10)]}};
function world(api){const messages=[];globalThis.self={postMessage(m){messages.push(m);}};api.handleMessage(structuredClone({type:'init',match}));assert.ok(messages.some(m=>m.type==='ready'),JSON.stringify(messages.filter(m=>m.type==='error')));assert.ok(messages.some(m=>m.type==='snapshot'&&m.tick===0));assert.ok(!messages.some(m=>m.type==='error'));const engine=api.testEngine();assert.equal(engine.ships.length,176);return engine;}
function hidden(engine){return {random:engine.random.checkpointWitness(),visualRandom:engine.visualRandom.checkpointWitness(),ships:engine.ships.map(ship=>({id:ship.id,random:ship.random.checkpointWitness(),controlRandom:ship.weaponControl.random.checkpointWitness(),trackers:ship.weapons.map(mount=>{const t=ship.weaponControl.autofire.trackers.get(mount);return [mount.slotId,t?{target:t.target&&[t.target.kind,t.target.entity.id],scanIn:t.scanIn,firingTime:t.firingTime,idleFireTime:t.idleFireTime,ammoAllowed:t.ammoAllowed,random:t.random.checkpointWitness()}:null];})}))};}
function witness(api,engine,tick){return{combat:api.captureCombat(engine,tick,{},0),hidden:hidden(engine)};}







function tacticalWorld(engine,envelope){return {ships:engine.ships,projectiles:engine.projectiles,beams:engine.beams,asteroids:engine.asteroids,exactWeaponThreatEnvelope:envelope};}
function moveClose(engine,spacing=1200){for(const[i,s]of engine.ships.entries()){s.pos.set(s.teamId===0?-spacing/2:spacing/2,(i%9)*80-320);s.vel.set(10-s.teamId*20,5);s.facingRad=s.teamId===0?0:Math.PI;s.flux.isVenting=false;s.flux.isOverloaded=false;}}
function probeCounts(){const counts={geometry:0,geometryAfterAdd:0,reject:0,rejectAfterAdd:0,envelope:0,retained:0};return{counts,probe:{geometry(after){counts.geometry++;if(after)counts.geometryAfterAdd++;},reject(after){counts.reject++;if(after)counts.rejectAfterAdd++;},envelope(){counts.envelope++;},retained(){counts.retained++;}}};}

test('init/reinit/default: real 176 entities and 734 mounts; flag is opt-in',async()=>{
 const rows=[];
 for(const key of ['false-probe','true-probe','default-probe']){
  const api=await load(key,'init-'+key),e=world(api),p=probeCounts();assert.equal(e.ships.reduce((n,s)=>n+s.weapons.length,0),734);
  globalThis.__boundsProbe=p.probe;try{e.fixedUpdate(1/60);}finally{delete globalThis.__boundsProbe;}
  assert.equal(world(api).ships.length,176);rows.push({key,...p.counts});
 }
 assert.equal(rows[0].retained,0);assert.equal(rows[2].retained,0);
 // The initial distant fleet need not reach add(); near and warm contracts prove retention.
 assert.ok(rows.every(r=>r.envelope>0));fs.writeFileSync(path.join(out,'init.json'),JSON.stringify(rows,null,2));
});

test('ordered forecasts: exact/no envelope/closed/invalidated and floating-point boundaries',async()=>{
 const apis=[await load(false,'forecasts-a'),await load(true,'forecasts-b')],engines=apis.map(world);let compared=0,positive=0;
 const scenarios=[{h:1,space:600},{h:3,space:1800},{h:10,space:4000},{h:30,space:10000},{h:Infinity,space:600},{h:NaN,space:600},{h:-1,space:600},{h:0,space:600},{h:3,space:Infinity},{h:3,space:NaN},{h:3,space:1e120},{h:3,space:-0}];
 for(const scenario of scenarios)for(const mode of ['exact','none','closed','invalidated']){
  const results=[];
  for(let arm=0;arm<2;arm++){
   const api=apis[arm],e=engines[arm];moveClose(e,scenario.space);
   const env=mode==='none'?undefined:api.WeaponThreatEnvelope.forExactPhase(e.ships);if(mode!=='none')assert.ok(env);
   if(mode==='closed')env.close();
   if(mode==='invalidated'){env.get(e.enemyShip);e.enemyShip.pos.x+=200;e.enemyShip.system.activate();env.invalidate(e.enemyShip);}
   const w=tacticalWorld(e,env),result=[];try{for(const s of e.capitalShips)result.push(api.assessThreats(s,w,scenario.h,.6));}finally{env?.close();}
   results.push(result);
  }
  assert.deepEqual(results[1],results[0],JSON.stringify({scenario,mode}));compared+=results[0].length;positive+=results[0].filter(r=>r.threats.length>0).length;
 }
 assert.ok(positive>0);fs.writeFileSync(path.join(out,'forecasts.json'),JSON.stringify({scenarios:scenarios.length,modes:4,compared,positive},null,2));
});

test('unknown observer callbacks preserve mutation/reentry/throw order and disable continuation',async()=>{
 const rows=[];
 for(const variant of ['mutate','reenter','throw']){
  const results=[];
  for(const key of ['false-probe','true-probe']){
   const api=await load(key,'unknown-'+variant+'-'+key),e=world(api);moveClose(e,150);const env=api.WeaponThreatEnvelope.forExactPhase(e.ships);assert.ok(env);
   const observer=e.playerShip,enemy=e.enemyShip,w=tacticalWorld(e,env),calls=[],p=probeCounts();let nested=false;
   const native=observer.shield.damageTakenMultiplierFor;
   observer.shield.damageTakenMultiplierFor=function(type){calls.push(type);if(variant==='throw')throw Error('shield callback');if(variant==='mutate')enemy.pos.x+=11;if(variant==='reenter'&&!nested){nested=true;api.assessThreats(observer,{...w,ships:[observer],projectiles:[],beams:[]},0,0);nested=false;}return native.call(this,type);};
   assert.equal(env.permitsExactObserver(observer),false);let forecast,error;
   globalThis.__boundsProbe=p.probe;try{forecast=api.assessThreats(observer,w,30,.6);}catch(ex){error=ex.message;}finally{delete globalThis.__boundsProbe;env.close();}
   assert.ok(calls.length>0,variant+' really invoked');assert.equal(p.counts.retained,0);
   results.push({forecast,error,calls,enemyX:enemy.pos.x,geometry:p.counts.geometry});
  }
  assert.deepEqual(results[1],results[0],variant);rows.push({variant,calls:results[0].calls.length,error:results[0].error});
 }
 fs.writeFileSync(path.join(out,'callbacks.json'),JSON.stringify(rows,null,2));
});

test('270 non-timed steps: actual continued bounds and exact complete natural state',async()=>{
 const rows=[];
 for(const key of ['false-probe','true-probe']){
  const api=await load(key,'natural-'+key),e=world(api),p=probeCounts();let first20,warm;
  globalThis.__boundsProbe=p.probe;try{for(let tick=1;tick<=270;tick++){e.fixedUpdate(1/60);if(tick===20)first20=sha(JSON.stringify(witness(api,e,tick)));if(tick===150)warm={...p.counts};}}finally{delete globalThis.__boundsProbe;}
  rows.push({key,...p.counts,warm120:Object.fromEntries(Object.keys(p.counts).map(k=>[k,p.counts[k]-warm[k]])),first20,state:sha(JSON.stringify(witness(api,e,270))),entities:e.ships.length});
 }
 assert.equal(rows[0].state,rows[1].state);assert.equal(rows[0].first20,rows[1].first20);
 assert.equal(rows[0].first20,'bc891a0f1c7b8da97559620bf2b36b6c7c35bbe3adde8467c4b6ec1b9b3ad224');assert.equal(rows[0].state,'bf519eedd4419e5f13360306acbd08b5ca380116fe25e564f59d141212e067d6');
 assert.equal(rows[0].retained,0);assert.ok(rows[1].warm120.retained>0,'candidate actually continues warm bounds');assert.ok(rows[1].warm120.rejectAfterAdd>0,'candidate excludes real later mounts');
 fs.writeFileSync(path.join(out,'natural-counts.json'),JSON.stringify(rows,null,2));
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


if(mode==='bench')nodeTest('one isolated-process ABBA: 150 warmup + 120 full steps, 5% gate in each pair',async()=>{
 const evidence=JSON.parse(process.env.CONTINUOUS_THREAT_BOUNDS_EVIDENCE??'[]').flatMap(file=>JSON.parse(fs.readFileSync(file)));
 for(const r of required)assert.ok(evidence.some(e=>e.name===r.name&&e.signature===r.signature&&e.frozenSha256===sha(fs.readFileSync(frozen))&&e.beforeBundle===sha(code.false)&&e.afterBundle===sha(code.true)),'missing matching contract evidence '+r.name);const rows=[];
 for(const[index,enabled]of[false,true,true,false].entries()){
  const bundle=path.join(out,'bench-'+index+'.mjs'),runner=path.join(out,'bench-'+index+'-runner.mjs');fs.writeFileSync(bundle,code[String(enabled)],{flag:'wx'});
  const body=`import fs from 'node:fs';import assert from 'node:assert/strict';import{createHash}from'node:crypto';\nglobalThis.self={postMessage(){}};const api=await import(${JSON.stringify(pathToFileURL(bundle).href)});\nconst match=${JSON.stringify(match)};const sha=${sha.toString()};\n${world.toString()}\n${hidden.toString()}\n${witness.toString()}\nconst engine=world(api);for(let tick=0;tick<150;tick++)engine.fixedUpdate(1/60);const heapBefore=process.memoryUsage().heapUsed;const started=performance.now();for(let tick=0;tick<120;tick++)engine.fixedUpdate(1/60);const elapsedMs=performance.now()-started;console.log(JSON.stringify({elapsedMs,perStepMs:elapsedMs/120,heapBefore,heapAfter:process.memoryUsage().heapUsed,entities:engine.ships.length,stateSha256:sha(JSON.stringify(witness(api,engine,270)))}));`;
  fs.writeFileSync(runner,body,{flag:'wx'});const run=spawnSync(process.execPath,[runner],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});fs.writeFileSync(path.join(out,'bench-'+index+'.stdout.log'),run.stdout??'',{flag:'wx'});fs.writeFileSync(path.join(out,'bench-'+index+'.stderr.log'),run.stderr??'',{flag:'wx'});assert.equal(run.status,0,(run.stderr??'').slice(0,1000));const result=JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));rows.push({index,enabled,steps:120,...result});
  fs.writeFileSync(path.join(out,'abba.json'),JSON.stringify({scope:'Sequential isolated Node processes; original host init and fixedUpdate, NOT browser timing',rows},null,2));
 }
 assert.ok(rows.every(r=>r.entities===rows[0].entities));assert.ok(rows.every(r=>r.stateSha256===rows[0].stateSha256));const gains=[1-rows[1].elapsedMs/rows[0].elapsedMs,1-rows[2].elapsedMs/rows[3].elapsedMs],pass=gains.every(g=>g>=.05);
 fs.writeFileSync(path.join(out,'abba.json'),JSON.stringify({scope:'Sequential isolated Node processes; 150 warmup + 120 measured steps per arm; excludes spawn/import/warmup/final witness',rows,gains,passesPrescribedGate:pass},null,2));console.log(JSON.stringify({gains,passesPrescribedGate:pass}));
});


