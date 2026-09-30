import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {test as nodeTest} from 'node:test';
import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
const out=path.resolve(process.env.LATE_THREAT_RECOVERY_OUT??('artifacts/lan-late-threat-recovery-20260927/check-'+Date.now()));
fs.mkdirSync(out,{recursive:true});
const sha=value=>createHash('sha256').update(value).digest('hex');
const frozen=process.env.LATE_THREAT_RECOVERY_FROZEN??path.resolve('artifacts/lan-late-threat-recovery-20260927/candidate-v2-browser.json');
const snapshot=JSON.parse(fs.readFileSync(frozen)),sources=new Map(snapshot.files.map(row=>{
 assert.equal(sha(row.code),row.sha256);return [path.resolve(row.file).toLowerCase(),row];
}));
const mode=process.env.LATE_RECOVERY_MODE??'contracts', selected=process.env.LATE_RECOVERY_CASE;
const proofRows=[], required=[];
const test=(name,body)=>{
 const signature=sha(body.toString()); required.push({name,signature});
 if(mode==='bench'||selected&&!name.includes(selected))return;
 nodeTest(name,async()=>{await body();proofRows.push({name,signature,frozenSha256:sha(fs.readFileSync(frozen)),beforeBundle:sha(code.false),afterBundle:sha(code.true)});fs.writeFileSync(path.join(out,'proofs.json'),JSON.stringify(proofRows,null,2));});
};
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
export {RuntimeCombatModifiers} from './src/engine/extensions/RuntimeCombatModifiers';
export {FluxTracker} from './src/engine/simulation/FluxTracker';
export {Shield} from './src/engine/simulation/Shield';
export {InFlightFireBudget} from './src/engine/ai/InFlightFireBudget';
export {captureCombat} from './src/network/AuthorityCombatSnapshot';
`;
const baselineFiles=JSON.parse(fs.readFileSync(path.resolve('artifacts/lan-late-threat-recovery-20260927/before.json'))).filter(r=>r.exists).map(r=>r.file);
const baseline=new Map(baselineFiles.map(file=>[file,fs.readFileSync(path.resolve('artifacts/lan-late-threat-recovery-20260927/before',file),'utf8')]));
const code={};
function instrument(file,text){
 text=text.replaceAll('\r\n','\n');
 if(file==='src/engine/ai/ThreatAssessment.ts'){
  const expression=`Math.max(enemy.flux.isOverloaded ? enemy.flux.overloadTimer : 0,
      enemy.flux.isVenting ? enemy.flux.getTimeToVent() : 0,
      enemy.isPhased ? enemy.shield.phaseChargeDownDuration : 0,
      enemy.system.blocksWeapons ? enemy.system.chargeDownDuration : 0)`;
  assert.ok(text.includes(expression));text=text.replaceAll(expression,'(globalThis.__recoveryProbe?.recovery?.(enemy,weaponEnvelopes),'+expression+')');
 }
 if(file==='src/engine/ai/WeaponThreatEnvelope.ts')text=text.replaceAll('    return result;','    globalThis.__recoveryProbe?.scope?.(result);\n    return result;');
 return text;
}
for(const key of ['false','true','default','false-probe','true-probe','default-probe']){
 const enabled=key.startsWith('false')?false:key.startsWith('true')?true:'default',probe=key.endsWith('-probe');
 const result=await build({stdin:{contents,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',
  define:{__LAN_BUILD_ID__:JSON.stringify('interleaved-bounds-contract'),'import.meta.env':JSON.stringify({BASE_URL:'/',DEV:true,PROD:false,MODE:'development',SSR:false,VITE_AI_EXACT_AUTHORED_THREATS:'true',VITE_LAN_OWNED_MOTION_READS:'true',VITE_LAN_EARLY_PREAIM_RANGE:'true',VITE_AI_INTERLEAVED_THREATS:'true',...(enabled==='default'?{}:{VITE_AI_LATE_THREAT_RECOVERY:String(enabled)})})},
  plugins:[{name:'same-frozen-source',setup(build){build.onResolve({filter:/^\./},args=>{const base=path.resolve(args.resolveDir,args.path);for(const suffix of['','.ts','.tsx','.json','.mts','.mjs']){const file=base+suffix;if(!fs.existsSync(file)&&sources.has(file.toLowerCase()))return{path:file};}});build.onLoad({filter:/\.(?:[cm]?[jt]sx?|json)$/},args=>{const row=sources.get(args.path.toLowerCase());if(row)return{contents:(probe?instrument(row.file,!enabled&&baseline.has(row.file)?baseline.get(row.file):row.code):(!enabled&&baseline.has(row.file)?baseline.get(row.file):row.code))+(row.file==='src/network/host.worker.ts'?'\nexport {handleMessage}; export function testEngine(){ return engine; }':''),loader:path.extname(row.file).slice(1).replace(/^[cm]([jt]s)$/, '$1')};if(args.path.startsWith(path.resolve('src')+path.sep))throw Error('Unfrozen source: '+args.path);});}}]});
 code[key]=result.outputFiles[0].text;
}
fs.writeFileSync(path.join(out,'build-manifest.json'),JSON.stringify({frozen,sourceSha256:sha(fs.readFileSync(frozen)),beforeBundle:sha(code.false),afterBundle:sha(code.true)},null,2));
async function load(enabled,name){globalThis.self={postMessage(){}};const file=path.join(out,name+'.mjs');fs.writeFileSync(file,code[String(enabled)],{flag:'wx'});return import(pathToFileURL(file).href);}
const hulls=['web_zhuyuan','web_gloriana','web_sc2_hyperion'],ai=Array.from({length:20},(_,i)=>hulls[i%3]);
const match={id:'authored-query-check',hostId:'host',seed:917,snapshotHz:60,players:[{id:'host',name:'Host',seat:0,team:0,hull:hulls[0]},{id:'guest',name:'Guest',seat:1,team:1,hull:hulls[0]}],options:{assignment:'teams',battleSize:3200,deploymentLimit:1600,aiHulls:[ai.slice(0,10),ai.slice(10)]}};
function world(api){const messages=[];globalThis.self={postMessage(m){messages.push(m);}};api.handleMessage(structuredClone({type:'init',match}));assert.ok(messages.some(m=>m.type==='ready'),JSON.stringify(messages.filter(m=>m.type==='error')));assert.ok(messages.some(m=>m.type==='snapshot'&&m.tick===0));assert.ok(!messages.some(m=>m.type==='error'));const engine=api.testEngine();assert.equal(engine.ships.length,176);return engine;}
function hidden(engine){return {random:engine.random.checkpointWitness(),visualRandom:engine.visualRandom.checkpointWitness(),ships:engine.ships.map(ship=>({id:ship.id,random:ship.random.checkpointWitness(),controlRandom:ship.weaponControl.random.checkpointWitness(),trackers:ship.weapons.map(mount=>{const t=ship.weaponControl.autofire.trackers.get(mount);return [mount.slotId,t?{target:t.target&&[t.target.kind,t.target.entity.id],scanIn:t.scanIn,firingTime:t.firingTime,idleFireTime:t.idleFireTime,ammoAllowed:t.ammoAllowed,random:t.random.checkpointWitness()}:null];})}))};}
function witness(api,engine,tick){return{combat:api.captureCombat(engine,tick,{},0),hidden:hidden(engine)};}







function tactical(engine,envelope){return{ships:engine.ships,projectiles:engine.projectiles,beams:engine.beams,asteroids:engine.asteroids,exactWeaponThreatEnvelope:envelope};}
function owned(api,engine){const envelope=api.WeaponThreatEnvelope.forOwnedInterleavedPhase(engine.ships);assert.ok(envelope);return envelope;}

test('init/reinit/default: real Worker counts, stage permission and closed scope',async()=>{
 const rows=[];let expectedState,baselineCalls;
 for(const enabled of[false,true,'default']){
  const api=await load(enabled+'-probe','init-'+enabled);
  for(let attempt=0;attempt<2;attempt++){
   const engine=world(api),scopes=[];let calls=0;assert.equal(engine.ships.reduce((n,s)=>n+s.weapons.length,0),734);
   globalThis.__recoveryProbe={recovery(){calls++;},scope(scope){if(scope?.lateRecovery===true)scopes.push(scope);}};
   try{engine.fixedUpdate(1/60);}finally{delete globalThis.__recoveryProbe;}
   assert.equal(scopes.length,enabled===true?1:0);for(const scope of scopes)assert.equal(scope.permitsLateRecovery(engine.playerShip),false);
   const state=sha(JSON.stringify(witness(api,engine,1)));expectedState??=state;assert.equal(state,expectedState);baselineCalls??=calls;
   if(enabled===true)assert.ok(calls<baselineCalls);else assert.equal(calls,baselineCalls);
   rows.push({enabled,attempt,scopes:scopes.length,recoveryCalls:calls,state});
  }
 }
 fs.writeFileSync(path.join(out,'init.json'),JSON.stringify(rows,null,2));
});

test('ordering permission: exact-only/closed, source and parent live effects, roster miss, readers and Vector2',async()=>{
 const api=await load(true,'permissions'),engine=world(api),ship=engine.playerShip,child=engine.ships.find(s=>s.parentShip);assert.ok(child);
 const envelope=owned(api,engine);assert.equal(envelope.permitsLateRecovery(ship),true);assert.equal(envelope.permitsLateRecovery(child),true);assert.equal(envelope.permitsLateRecovery({}),false);
 const exact=api.WeaponThreatEnvelope.forExactPhase(engine.ships);assert.ok(exact);assert.equal(exact.permitsLateRecovery(ship),false);exact.close();
 for(const source of[child,child.parentShip]){
  let reads=0;const data={};Object.defineProperty(data,'disableWeapons',{get(){reads++;throw Error('must not read during admission');},enumerable:true});source.runtimeModifiers.set('unknown',data);
  try{assert.equal(envelope.permitsLateRecovery(child),false);assert.equal(reads,0);}finally{source.runtimeModifiers.delete('unknown');}
  source.externalPhaseEffects.set('unknown',()=>{throw Error('must not run during admission');});try{assert.equal(envelope.permitsLateRecovery(child),false);}finally{source.externalPhaseEffects.delete('unknown');}
 }
 const set=api.Vector2.prototype.set;api.Vector2.prototype.set=function(...args){return set.apply(this,args);};try{assert.equal(envelope.permitsLateRecovery(ship),false);}finally{api.Vector2.prototype.set=set;}
 envelope.close();assert.equal(envelope.permitsLateRecovery(ship),false);
 const replacements=[
  [ship,'isPhased',{get(){throw Error('not in admission');}}],
  [ship.flux,'getTimeToVent',{value(){throw Error('not in admission');}}],
  [ship.flux,'totalFlux',{get(){throw Error('not in admission');}}],
  [ship.flux,'isVenting',{get(){throw Error('not in admission');}}],
  [ship,'getMotionStats',{value(){throw Error('not in admission');}}],
  [ship.system,'modifiers',{value(){throw Error('not in admission');}}],
  [ship.system,'getWeaponRangePercent',{value(){throw Error('not in admission');}}],
  [ship.system,'blocksWeapons',{get(){throw Error('not in admission');}}],
  [ship.runtimeModifiers,'value',{get(){throw Error('not in admission');}}],
 ];
 for(const[object,key,descriptor]of replacements){const before=Object.getOwnPropertyDescriptor(object,key);Object.defineProperty(object,key,{...descriptor,configurable:true});let scope;try{scope=owned(api,engine);assert.equal(scope.permitsLateRecovery(ship),false,key);}finally{scope?.close();if(before)Object.defineProperty(object,key,before);else delete object[key];}}
 const original=Object.getOwnPropertyDescriptor(api.FluxTracker.prototype,'totalFlux');Object.defineProperty(api.FluxTracker.prototype,'totalFlux',{get(){throw Error('prototype override not admitted');},configurable:true});try{const scope=owned(api,engine);assert.equal(scope.permitsLateRecovery(ship),false);scope.close();}finally{Object.defineProperty(api.FluxTracker.prototype,'totalFlux',original);}
 fs.writeFileSync(path.join(out,'permission.json'),JSON.stringify({replacementCases:replacements.length,exactOnly:false,parentDynamicChecks:true,prototypeOverrideRejected:true},null,2));
});

test('forecast values retain order and exact numbers across horizons, distances, recovery and active systems',async()=>{
 const aApi=await load(false,'forecast-reference'),bApi=await load(true,'forecast-candidate'),a=world(aApi),b=world(bApi);const rows=[];
 for(const state of['initial','near','active','vent','overload','dead-module','nonfinite']){
  for(const engine of[a,b]){
   for(const[i,s]of engine.capitalShips.entries()){
    s.pos.set(state==='initial'?(s.teamId===0?-6500:6500):(s.teamId===0?-300:300),i*100-1000);
    s.flux.isVenting=state==='vent';s.flux.isOverloaded=state==='overload';s.flux.overloadTimer=state==='overload'?8:0;s.flux.softFlux=s.flux.maxFlux*.2;
    if(state==='active')for(const system of s.allSystems)system.activate();
   }
   const child=engine.ships.find(s=>s.parentShip);child.hullHp=state==='dead-module'?0:child.maxHullHp;
   if(state==='nonfinite'){const s=engine.enemyShip;s.pos.x=NaN;s.flux.isOverloaded=true;s.flux.overloadTimer=NaN;}
  }
  for(const horizon of[-1,0,.5,3,Infinity,NaN]){
   const scopes=[owned(aApi,a),owned(bApi,b)];try{
    for(const index of[0,1,7,20,40,77]){
     const left=aApi.assessThreats(a.combatShips[index],tactical(a,scopes[0]),horizon,.5,horizon),right=bApi.assessThreats(b.combatShips[index],tactical(b,scopes[1]),horizon,.5,horizon);
     assert.deepEqual(right,left,state+' '+horizon+' '+index);rows.push({state,horizon:String(horizon),index,threats:left.threats.length});
    }
   }finally{scopes.forEach(s=>s.close());}
  }
 }
 assert.ok(rows.some(r=>r.threats>0));assert.deepEqual(witness(bApi,b,0),witness(aApi,a,0));fs.writeFileSync(path.join(out,'forecasts.json'),JSON.stringify({comparisons:rows.length,rows},null,2));
});

test('unknown recovery/stat callbacks preserve scalar order, exceptions and reentrancy',async()=>{
 const apis=[await load(false,'unknown-reference'),await load(true,'unknown-candidate')],rows=[];
 for(const kind of['phase','throw-phase','vent','throw-vent','unneeded-motion','throw-motion','system','throw-system','runtime','throw-runtime','nested-phase']){
  const results=[];
  for(const api of apis){
   const engine=world(api),ship=engine.playerShip,enemy=engine.enemyShip,trace=[];for(const[i,s]of engine.capitalShips.entries())s.pos.set(s.teamId===0?-250:250,i*55-500);
   const callback=name=>{trace.push(name);if(kind==='throw-'+name)throw Error(name+' failure');};
   if(kind.includes('phase')){let nested=false;Object.defineProperty(enemy,'isPhased',{configurable:true,get(){callback('phase');if(kind==='nested-phase'&&!nested){nested=true;trace.push(api.assessThreats(ship,{ships:[ship],projectiles:[],beams:[],asteroids:[]},1,.5).threats.length);nested=false;}return false;}});}
   if(kind.includes('vent')){enemy.flux.isVenting=true;enemy.flux.getTimeToVent=()=>{callback('vent');return 1;};}
   if(kind.includes('motion')){const original=enemy.getMotionStats;enemy.getMotionStats=function(){callback('motion');return original.call(this);};if(kind==='unneeded-motion'){enemy.flux.isOverloaded=true;enemy.flux.overloadTimer=50;}}
   if(kind.includes('system'))Object.defineProperty(enemy.system,'blocksWeapons',{configurable:true,get(){callback('system');return false;}});
   const scope=owned(api,engine);
   if(kind.includes('runtime')){const data={};Object.defineProperty(data,'disableWeapons',{get(){callback('runtime');return 0;},enumerable:true});enemy.runtimeModifiers.set('unknown',data);}
   let value,error;try{value=api.assessThreats(ship,tactical(engine,scope),3,.5);}catch(e){error=e.message;}finally{scope.close();}
   results.push({value,error,trace});
  }
  assert.deepEqual(results[1],results[0],kind);if(kind.startsWith('throw-'))assert.ok(results[0].error,kind);else if(kind==='unneeded-motion')assert.equal(results[0].trace.includes('motion'),false);else assert.ok(results[0].trace.length,kind);
  rows.push({kind,trace:results[0].trace,error:results[0].error});
 }
 fs.writeFileSync(path.join(out,'unknown.json'),JSON.stringify(rows,null,2));
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


test('source counts: 20-step equivalence and warm-path activation at unchanged 270-step state',async()=>{
 const expected=JSON.parse(fs.readFileSync('artifacts/lan-late-threat-recovery-20260927/diagnostic.json')).rows[0];
 const rows=[];for(const enabled of[false,true]){
  const api=await load(enabled+'-probe','count-'+enabled),engine=world(api);let calls=0,warmCalls=0,warmScopes=0,tick=0;
  globalThis.__recoveryProbe={recovery(){calls++;if(tick>150)warmCalls++;},scope(e){if(tick>150&&e?.lateRecovery===true)warmScopes++;}};
  let initial;try{for(tick=1;tick<=(enabled?270:20);tick++){engine.fixedUpdate(1/60);if(tick===20)initial={calls,state:sha(JSON.stringify(witness(api,engine,tick)))};}}finally{delete globalThis.__recoveryProbe;}
  assert.equal(initial.state,expected.initial20);const final=sha(JSON.stringify(witness(api,engine,enabled?270:20)));if(enabled){assert.equal(final,expected.final);assert.equal(warmScopes,120);}
  rows.push({enabled,initial,final,warmCalls,warmScopes});
 }
 assert.ok(rows[1].initial.calls<rows[0].initial.calls);const oldWarm=208080+572104;assert.ok(rows[1].warmCalls<oldWarm);fs.writeFileSync(path.join(out,'counts.json'),JSON.stringify({rows,baselineWarmCalls:oldWarm},null,2));
});
if(mode==='bench')nodeTest('one isolated-process ABBA: 150 warmup + 120 full steps, 3% gate in each pair',async()=>{
 const evidence=JSON.parse(process.env.LATE_RECOVERY_EVIDENCE??'[]').flatMap(file=>JSON.parse(fs.readFileSync(file)));
 for(const r of required)assert.ok(evidence.some(e=>e.name===r.name&&e.signature===r.signature&&e.frozenSha256===sha(fs.readFileSync(frozen))&&e.beforeBundle===sha(code.false)&&e.afterBundle===sha(code.true)),'missing matching contract evidence '+r.name);const rows=[];
 for(const[index,enabled]of[false,true,true,false].entries()){
  const bundle=path.join(out,'bench-'+index+'.mjs'),runner=path.join(out,'bench-'+index+'-runner.mjs');fs.writeFileSync(bundle,code[String(enabled)],{flag:'wx'});
  const body=`import fs from 'node:fs';import assert from 'node:assert/strict';import{createHash}from'node:crypto';\nglobalThis.self={postMessage(){}};const api=await import(${JSON.stringify(pathToFileURL(bundle).href)});\nconst match=${JSON.stringify(match)};const sha=${sha.toString()};\n${world.toString()}\n${hidden.toString()}\n${witness.toString()}\nconst engine=world(api);for(let tick=0;tick<150;tick++)engine.fixedUpdate(1/60);const heapBefore=process.memoryUsage().heapUsed;const started=performance.now();for(let tick=0;tick<120;tick++)engine.fixedUpdate(1/60);const elapsedMs=performance.now()-started;console.log(JSON.stringify({elapsedMs,perStepMs:elapsedMs/120,heapBefore,heapAfter:process.memoryUsage().heapUsed,entities:engine.ships.length,stateSha256:sha(JSON.stringify(witness(api,engine,270)))}));`;
  fs.writeFileSync(runner,body,{flag:'wx'});const run=spawnSync(process.execPath,[runner],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});fs.writeFileSync(path.join(out,'bench-'+index+'.stdout.log'),run.stdout??'',{flag:'wx'});fs.writeFileSync(path.join(out,'bench-'+index+'.stderr.log'),run.stderr??'',{flag:'wx'});assert.equal(run.status,0,(run.stderr??'').slice(0,1000));const result=JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));rows.push({index,enabled,steps:120,...result});
  fs.writeFileSync(path.join(out,'abba.json'),JSON.stringify({scope:'Sequential isolated Node processes; original host init and fixedUpdate, NOT browser timing',rows},null,2));
 }
 assert.ok(rows.every(r=>r.entities===rows[0].entities));assert.ok(rows.every(r=>r.stateSha256===rows[0].stateSha256));const gains=[1-rows[1].elapsedMs/rows[0].elapsedMs,1-rows[2].elapsedMs/rows[3].elapsedMs],pass=gains.every(g=>g>=.03);
 fs.writeFileSync(path.join(out,'abba.json'),JSON.stringify({scope:'Sequential isolated Node processes; 150 warmup + 120 measured steps per arm; excludes spawn/import/warmup/final witness',rows,gains,passesPrescribedGate:pass},null,2));console.log(JSON.stringify({gains,passesPrescribedGate:pass}));
});


