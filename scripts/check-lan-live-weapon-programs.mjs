import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {test as nodeTest} from 'node:test';
import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
const out=path.resolve(process.env.LIVE_WEAPON_PROGRAMS_OUT??('artifacts/lan-live-weapon-programs-20260927/check-'+Date.now()));
fs.mkdirSync(out,{recursive:true});
const sha=value=>createHash('sha256').update(value).digest('hex');
const frozen=process.env.LIVE_WEAPON_PROGRAMS_FROZEN??path.resolve('artifacts/lan-live-weapon-programs-20260927/candidate-v2-browser.json');
const snapshot=JSON.parse(fs.readFileSync(frozen)),sources=new Map(snapshot.files.map(row=>{
 assert.equal(sha(row.code),row.sha256);return [path.resolve(row.file).toLowerCase(),row];
}));
const mode=process.env.LIVE_WEAPON_PROGRAMS_MODE??'contracts', selected=process.env.LIVE_WEAPON_PROGRAMS_CASE;
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
export {OwnedWeaponStatProgramScope,testProgramState,testEvaluate} from './src/engine/ai/OwnedWeaponStatProgram';
export {RuntimeCombatModifiers} from './src/engine/extensions/RuntimeCombatModifiers';
export {InFlightFireBudget} from './src/engine/ai/InFlightFireBudget';
export {captureCombat} from './src/network/AuthorityCombatSnapshot';
`;
const baselineFiles=JSON.parse(fs.readFileSync(path.resolve('artifacts/lan-live-weapon-programs-20260927/before.json'))).filter(r=>r.exists).map(r=>r.file);
const baseline=new Map(baselineFiles.map(file=>[file,fs.readFileSync(path.resolve('artifacts/lan-live-weapon-programs-20260927/before',file),'utf8')]));
const code={};
function instrument(file,text){
 const inject=(anchor,extra)=>{assert.equal(text.split(anchor).length,2,'unique injection '+file+' '+anchor);text=text.replace(anchor,anchor+extra);};
 if(file==='src/engine/simulation/ShipSystem.ts')inject('private modifiers(capacity = this.baseFluxCapacity) {','globalThis.__liveProbe?.modifiers?.(this);');
 if(file==='src/engine/ai/OwnedWeaponStatProgram.ts'){
  inject('const system = node.system;','globalThis.__liveProbe?.evaluate?.(system);');
  inject('epoch.members.push(member);','globalThis.__liveProbe?.admit?.(member.ship);');
  inject('activeScope = new OwnedWeaponStatProgramScope();','globalThis.__liveProbe?.open?.(engine);');
 }
 if(file==='src/engine/ai/AutofireController.ts')inject('public aim(dt: number, ship: Ship, mount: WeaponMount, world: FireControlWorld): AimSolution | null {','globalThis.__liveProbe?.aim?.(ship,world);');
 if(file==='src/engine/simulation/systems/ShipWeaponControlSystem.ts')text=text.replace('if (fireRequests.has(mount.slotId) && this.requestWeaponFire(', 'if (fireRequests.has(mount.slotId)) globalThis.__liveProbe?.fire?.(ship,world);\n      if (fireRequests.has(mount.slotId) && this.requestWeaponFire(');
 return text;
}
for(const key of ['false','true','default','false-probe','true-probe','default-probe']){
 const enabled=key.startsWith('false')?false:key.startsWith('true')?true:'default',probe=key.endsWith('-probe');
 const result=await build({stdin:{contents,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',
  define:{__LAN_BUILD_ID__:JSON.stringify('interleaved-bounds-contract'),'import.meta.env':JSON.stringify({BASE_URL:'/',DEV:true,PROD:false,MODE:'development',SSR:false,VITE_AI_EXACT_AUTHORED_THREATS:'true',VITE_LAN_OWNED_MOTION_READS:'true',VITE_LAN_EARLY_PREAIM_RANGE:'true',VITE_AI_INTERLEAVED_THREATS:'true',...(enabled==='default'?{}:{VITE_LAN_LIVE_WEAPON_STATS:String(enabled)})})},
  plugins:[{name:'same-frozen-source',setup(build){build.onResolve({filter:/^\./},args=>{const base=path.resolve(args.resolveDir,args.path);for(const suffix of['','.ts','.tsx','.json','.mts','.mjs']){const file=base+suffix;if(!fs.existsSync(file)&&sources.has(file.toLowerCase()))return{path:file};}});build.onLoad({filter:/\.(?:[cm]?[jt]sx?|json)$/},args=>{const row=sources.get(args.path.toLowerCase());if(row?.file==='src/engine/ai/OwnedWeaponStatProgram.ts'&&!enabled)return{contents:'export class OwnedWeaponStatProgramScope {} export function testProgramState(){return {members:[],active:false};} export function testEvaluate(){}',loader:'ts'};if(row)return{contents:(probe?instrument(row.file,!enabled&&baseline.has(row.file)?baseline.get(row.file):row.code):(!enabled&&baseline.has(row.file)?baseline.get(row.file):row.code))+(row.file==='src/engine/ai/OwnedWeaponStatProgram.ts'?'\nexport function testProgramState(engine: CombatEngine) { const epoch=epochs.get(engine); return {members:epoch?.members.map(m=>m.ship.id)??[],active:!!epoch&&active===epoch}; } export { evaluate as testEvaluate };':'')+(row.file==='src/network/host.worker.ts'?'\nexport {handleMessage}; export function testEngine(){ return engine; }':''),loader:path.extname(row.file).slice(1).replace(/^[cm]([jt]s)$/, '$1')};if(args.path.startsWith(path.resolve('src')+path.sep))throw Error('Unfrozen source: '+args.path);});}}]});
 code[key]=result.outputFiles[0].text;
 if(enabled===true)assert.ok(code[key].includes('VITE_LAN_LIVE_WEAPON_STATS: "true"'),'real stat span build flag');
}
fs.writeFileSync(path.join(out,'build-manifest.json'),JSON.stringify({frozen,sourceSha256:sha(fs.readFileSync(frozen)),beforeBundle:sha(code.false),afterBundle:sha(code.true)},null,2));
async function load(enabled,name){globalThis.self={postMessage(){}};const file=path.join(out,name+'.mjs');fs.writeFileSync(file,code[String(enabled)],{flag:'wx'});return import(pathToFileURL(file).href);}
const hulls=['web_zhuyuan','web_gloriana','web_sc2_hyperion'],ai=Array.from({length:20},(_,i)=>hulls[i%3]);
const match={id:'authored-query-check',hostId:'host',seed:917,snapshotHz:60,players:[{id:'host',name:'Host',seat:0,team:0,hull:hulls[0]},{id:'guest',name:'Guest',seat:1,team:1,hull:hulls[0]}],options:{assignment:'teams',battleSize:3200,deploymentLimit:1600,aiHulls:[ai.slice(0,10),ai.slice(10)]}};
function world(api){const messages=[];globalThis.self={postMessage(m){messages.push(m);}};api.handleMessage(structuredClone({type:'init',match}));assert.ok(messages.some(m=>m.type==='ready'),JSON.stringify(messages.filter(m=>m.type==='error')));assert.ok(messages.some(m=>m.type==='snapshot'&&m.tick===0));assert.ok(!messages.some(m=>m.type==='error'));const engine=api.testEngine();assert.equal(engine.ships.length,176);return engine;}
function hidden(engine){return {random:engine.random.checkpointWitness(),visualRandom:engine.visualRandom.checkpointWitness(),ships:engine.ships.map(ship=>({id:ship.id,random:ship.random.checkpointWitness(),controlRandom:ship.weaponControl.random.checkpointWitness(),trackers:ship.weapons.map(mount=>{const t=ship.weaponControl.autofire.trackers.get(mount);return [mount.slotId,t?{target:t.target&&[t.target.kind,t.target.entity.id],scanIn:t.scanIn,firingTime:t.firingTime,idleFireTime:t.idleFireTime,ammoAllowed:t.ammoAllowed,random:t.random.checkpointWitness()}:null];})}))};}
function witness(api,engine,tick){return{combat:api.captureCombat(engine,tick,{},0),hidden:hidden(engine)};}







function queryWorld(api,engine){return{ships:engine.ships,missiles:[],asteroids:[],fireBudget:new api.InFlightFireBudget(engine.ships,[])};}
function begin(api,engine){const envelope=api.WeaponThreatEnvelope.forOwnedInterleavedPhase(engine.ships);assert.ok(envelope,'native writer domain');envelope.openOwnedWeaponPrograms(engine);assert.equal(api.testProgramState(engine).active,true);return envelope;}
const stats=[['getWeaponRangePercent','rangePercent',0],['getProjectileSpeedPercent','projectileSpeedPercent',0],['getWeaponDamageMultiplier','damageMultiplier',1],['getWeaponRateOfFireMultiplier','rateOfFireMultiplier',1],['getWeaponFluxCostMultiplier','fluxCostMultiplier',1],['getAmmoRegenMultiplier','ammoRegenMultiplier',1]];
const read=system=>stats.flatMap(([method])=>['BALLISTIC','ENERGY','MISSILE'].map(type=>system[method](type)));
function compactAim(value){return value?{...value,target:{kind:value.target.kind,id:value.target.entity.id}}:null;}
function jsonValue(value){return JSON.parse(JSON.stringify(value));}

test('Worker init/reinit/default: real registration, scope coverage and unchanged 176/734 state',async()=>{
 const rows=[];let first;
 for(const enabled of[false,true,'default']){
  const api=await load(enabled+'-probe','init-'+enabled);
  for(let repeat=0;repeat<2;repeat++){
   let admits=0,opens=0,evaluates=0;globalThis.__liveProbe={admit(){admits++;},open(e){opens++;assert.equal(api.testProgramState(e).active,true);},evaluate(){evaluates++;}};
   let engine;try{engine=world(api);assert.equal(engine.ships.reduce((n,s)=>n+s.weapons.length,0),734);engine.fixedUpdate(1/60);}finally{delete globalThis.__liveProbe;}
   for(const ship of engine.ships)for(const[method]of stats)assert.equal(ship.system[method],api.ShipSystem.prototype[method],'original method identity');assert.ok(!Object.keys(engine.playerShip.system).includes('ownedWeaponStatProgram'));
   const p=api.testProgramState(engine);assert.equal(p.active,false);assert.equal(admits>0,enabled===true);assert.equal(opens,enabled===true?1:0);assert.equal(evaluates>0,enabled===true);if(enabled===true)assert.equal(p.members.length,22);
   const state=sha(JSON.stringify(witness(api,engine,1)));first??=state;assert.equal(state,first);rows.push({enabled,repeat,admits,opens,evaluates,state});
  }
 }
 fs.writeFileSync(path.join(out,'init.json'),JSON.stringify(rows,null,2));
});

test('live six-stat values: lifecycle/flux/auxiliary, runtime fallback, IEEE and no query-value cache',async()=>{
 const apis=[await load('false-probe','values-a'),await load('true-probe','values-b')],engines=apis.map(world),rows=[];
 const numbers=[0,-0,NaN,Infinity,-Infinity,.15,.5,1];
 for(let turn=0;turn<numbers.length;turn++){
  for(const e of engines)for(const ship of e.capitalShips){
   ship.flux.softFlux=ship.flux.maxFlux*(turn%3)*.2;
   for(const system of ship.allSystems){system.isActive=turn%3!==0;system.effectLevel=numbers[turn];system.state=turn%2?'ACTIVE':'COOLDOWN';system.cooldownTimer=12;}
  }
  const values=[[],[]],counts=[0,0];
  for(let arm=0;arm<2;arm++){
   const api=apis[arm],e=engines[arm],scope=arm?begin(api,e):undefined;
   globalThis.__liveProbe={modifiers(system){if(system.owner?.system===system)counts[arm]++;}};
   try{for(const ship of e.capitalShips){
    for(const[method,,neutral]of stats)for(const absent of[undefined,null,''])assert.equal(ship.system[method](absent),neutral);
    values[arm].push(read(ship.system));
    // These changes occur while the same scope stays open; both sides must read live inputs.
    ship.flux.softFlux=ship.flux.maxFlux*.7;for(const sys of ship.allSystems)sys.effectLevel=numbers[(turn+1)%numbers.length];
    values[arm].push(read(ship.system));
    ship.runtimeModifiers.set('test',{weapons:{ENERGY:{rangePercent:17.8,fluxCostMultiplier:.7,projectileSpeedPercent:-0}}});
    values[arm].push(read(ship.system));ship.runtimeModifiers.delete('test');
    values[arm].push(read(ship.system));
   }}finally{scope?.close();delete globalThis.__liveProbe;}
  }
  assert.deepEqual(values[1],values[0]);assert.ok(counts[1]<counts[0]);rows.push({turn,counts});
 }
 // Pure fold test bypasses NO admission: only the arithmetic helper is exercised here.
 const api=apis[1],cells=[undefined,-0,0,1,-1,1e16,-1e16,NaN,Infinity,-Infinity,1.2];let cases=0;
 const combine=(a,b,mul)=>b===undefined?a:mul?(a??1)*b:(a??0)+b;
 for(const a of cells)for(const b of cells)for(const c of cells)for(const mul of[false,true]){
  const key=mul?'damageMultiplier':'rangePercent',calls=[];
  const node=(value,next)=>({system:{available:true,isActive:true},definition:{modifiers(_s,cap){calls.push(cap);return{weapons:{ENERGY:{[key]:value}}};}},auxiliary:next});
  const root=node(a,node(b,node(c))),actual=api.testEvaluate(root,'ENERGY',key,mul,937);
  assert.ok(Object.is(actual,combine(a,combine(b,c,mul),mul)));assert.deepEqual(calls,[937,937,937]);cases++;
 }
 fs.writeFileSync(path.join(out,'values.json'),JSON.stringify({rows,pureOrderedFoldCases:cases},null,2));
});

test('fallback: unknown callbacks, prototype/instance readers, runtime and topology retain original order',async()=>{
 const apis=[await load('false-probe','unknown-a'),await load('true-probe','unknown-b')],rows=[];
 for(const kind of['runtime','throw-runtime','available','throw-available','prototype-available','own-modifiers','unknown-auxiliary','parent','flux-getter']){
  const outcomes=[];
  for(let arm=0;arm<2;arm++){
   const api=apis[arm],e=world(api),ship=e.playerShip,trace=[];let restore=()=>{};
   if(kind.includes('runtime')){const value={};Object.defineProperty(value,'weapons',{enumerable:true,get(){trace.push('runtime');if(kind==='throw-runtime')throw Error('runtime failure');return{ENERGY:{rangePercent:21}};}});ship.runtimeModifiers.set('unknown',value);}
   if(kind.includes('available')){
    const obj=kind==='prototype-available'?api.ShipSystem.prototype:ship.system,old=Object.getOwnPropertyDescriptor(obj,'available');
    Object.defineProperty(obj,'available',{configurable:true,get(){trace.push('available');if(kind==='throw-available')throw Error('availability failure');return true;}});restore=()=>old?Object.defineProperty(obj,'available',old):delete obj.available;
   }
   if(kind==='own-modifiers')ship.system.modifiers=()=>{trace.push('modifiers');return{weapons:{ENERGY:{rangePercent:27}}};};
   if(kind==='unknown-auxiliary')ship.system.auxiliary={available:true,hasNativeStats:false,hasExactThreatPhaseAI:false,modifiers(){trace.push('auxiliary');return{weapons:{ENERGY:{rangePercent:29}}};}};
   if(kind==='parent')ship.parentShip=e.capitalShips.find(s=>s!==ship);
   if(kind==='flux-getter'){ship.system.isActive=true;ship.system.effectLevel=1;Object.defineProperty(ship.flux,'fluxPercent',{get(){trace.push('flux');return .23;}});}
   let envelope,result,error;
   try{if(arm){envelope=api.WeaponThreatEnvelope.forOwnedInterleavedPhase(e.ships);envelope?.openOwnedWeaponPrograms(e);}result=read(ship.system);}
   catch(ex){error=ex.message;}finally{envelope?.close();restore();}
   outcomes.push({result,error,trace});
  }
  assert.deepEqual(outcomes[1],outcomes[0],kind);if(kind.startsWith('throw-'))assert.ok(outcomes[0].error);rows.push({kind,error:outcomes[0].error,trace:outcomes[0].trace});
 }
 fs.writeFileSync(path.join(out,'fallback.json'),JSON.stringify(rows,null,2));
});

test('ownership/scope: public and exact-only stay old, nesting/reinit/exception and unknown next writer revoke',async()=>{
 const api=await load('true-probe','scopes'),e=world(api),ship=e.playerShip;
 const publicEngine=api.createLanWorld(structuredClone(match)).engine,pub=api.WeaponThreatEnvelope.forOwnedInterleavedPhase(publicEngine.ships);pub.openOwnedWeaponPrograms(publicEngine);assert.equal(api.testProgramState(publicEngine).active,false);pub.close();assert.equal(Object.hasOwn(publicEngine.playerShip.system,'getWeaponRangePercent'),false);
 const exact=api.WeaponThreatEnvelope.forExactPhase(e.ships);exact.openOwnedWeaponPrograms(e);assert.equal(api.testProgramState(e).active,false);exact.close();
 let envelope=begin(api,e);envelope.openOwnedWeaponPrograms(e);assert.equal(api.testProgramState(e).active,false);envelope.close();
 envelope=begin(api,e);const other=world(api),inner=api.WeaponThreatEnvelope.forOwnedInterleavedPhase(other.ships);inner.openOwnedWeaponPrograms(other);assert.equal(api.testProgramState(e).active,false);assert.equal(api.testProgramState(other).active,false);envelope.close();inner.close();
 let reached=false;globalThis.__liveProbe={aim(){if(api.testProgramState(other).active){reached=true;throw Error('aim failed');}}};try{assert.throws(()=>other.fixedUpdate(1/60),/aim failed/);}finally{delete globalThis.__liveProbe;}assert.ok(reached);assert.equal(api.testProgramState(other).active,false);
 const fresh=world(api);let injected=false,revoked=false;globalThis.__liveProbe={open(){const next=fresh.combatShips[1],old=next.update;next.update=function(...args){revoked=!api.testProgramState(fresh).active;return old.apply(this,args);};injected=true;}};try{fresh.fixedUpdate(1/60);}finally{delete globalThis.__liveProbe;}assert.ok(injected&&revoked);assert.equal(api.testProgramState(fresh).active,false);
 // Topology replaced after entry must not run a stale compiled auxiliary chain.
 envelope=begin(api,e);const old=ship.system.auxiliary;ship.system.auxiliary=new api.ShipSystem('NONE',0,ship);let count=0;globalThis.__liveProbe={evaluate(){count++;}};try{read(ship.system);assert.equal(count,0);}finally{delete globalThis.__liveProbe;ship.system.auxiliary=old;envelope.close();}
 fs.writeFileSync(path.join(out,'scope.json'),JSON.stringify({publicOld:true,exactOld:true,nestingRevoked:true,exceptionRevoked:reached,unknownWriterRevoked:revoked,topologyFallback:true},null,2));
});

test('per-mount aim/preAim/decide, tracker and RNG remain identical',async()=>{
 const apis=[await load(false,'aim-a'),await load(true,'aim-b')],engines=apis.map(world),results=[[],[]];
 for(const e of engines)for(const[i,s]of e.ships.entries()){s.pos.set(s.teamId===0?-500:500,i*10-800);s.fireControlMode='AI';}
 for(let round=0;round<3;round++)for(let arm=0;arm<2;arm++){
  const api=apis[arm],e=engines[arm],w=queryWorld(api,e),scope=arm?begin(api,e):undefined;
  try{for(const ship of e.ships)for(const mount of ship.weapons){const a=ship.weaponControl.autofire,aim=a.aim(1/60,ship,mount,w);results[arm].push(jsonValue({aim:compactAim(aim),pre:a.preAim(ship,mount,w),decide:a.decide(ship,mount,aim,w,1/60)}));}}finally{scope?.close();}
 }
 assert.deepEqual(results[1],results[0]);assert.ok(results[0].some(r=>r.aim));assert.deepEqual(witness(apis[1],engines[1],0),witness(apis[0],engines[0],0));fs.writeFileSync(path.join(out,'aim.json'),JSON.stringify({queries:results[0].length,solutions:results[0].filter(r=>r.aim).length},null,2));
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


test('20/270 natural steps: actual program counts and complete states',async()=>{
 const rows=[];
 for(const enabled of[false,true]){
  const api=await load(enabled+'-probe','counts-'+enabled),e=world(api);let tick=0,evaluates=0,compositions=0,warmEvaluates=0,warmCompositions=0,opens=0,requests=0,initial;
  globalThis.__liveProbe={open(){opens++;},evaluate(){evaluates++;if(tick>150)warmEvaluates++;},modifiers(system){if(system.owner?.system===system){compositions++;if(tick>150)warmCompositions++;}},fire(){requests++;}};
  try{for(tick=1;tick<=270;tick++){e.fixedUpdate(1/60);if(tick===20)initial=sha(JSON.stringify(witness(api,e,tick)));}}finally{delete globalThis.__liveProbe;}
  const state=sha(JSON.stringify(witness(api,e,270)));assert.equal(initial,'bc891a0f1c7b8da97559620bf2b36b6c7c35bbe3adde8467c4b6ec1b9b3ad224');assert.equal(state,'bf519eedd4419e5f13360306acbd08b5ca380116fe25e564f59d141212e067d6');assert.equal(opens,enabled?270:0);assert.equal(warmEvaluates>0,enabled);assert.ok(requests>0&&e.projectiles.length>0&&e.beams.length>0);assert.equal(api.testProgramState(e).active,false);
  rows.push({enabled,initial,state,evaluates,compositions,warmEvaluates,warmCompositions,opens,requests,projectiles:e.projectiles.length,beams:e.beams.length});
 }
 assert.ok(rows[1].warmCompositions<rows[0].warmCompositions);assert.equal(rows[1].requests,rows[0].requests);fs.writeFileSync(path.join(out,'counts.json'),JSON.stringify(rows,null,2));
});
if(mode==='bench')nodeTest('one isolated-process ABBA: 150 warmup + 120 full steps, 5% gate in each pair',async()=>{
 const evidence=JSON.parse(process.env.LIVE_WEAPON_PROGRAMS_EVIDENCE??'[]').flatMap(file=>JSON.parse(fs.readFileSync(file)));
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


