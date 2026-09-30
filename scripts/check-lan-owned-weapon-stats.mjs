import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {test as nodeTest} from 'node:test';
import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
const out=path.resolve(process.env.OWNED_WEAPON_STATS_OUT??('artifacts/lan-owned-weapon-stats-20260927/check-'+Date.now()));
fs.mkdirSync(out,{recursive:true});
const sha=value=>createHash('sha256').update(value).digest('hex');
const frozen=process.env.OWNED_WEAPON_STATS_FROZEN??path.resolve('artifacts/lan-owned-weapon-stats-20260927/candidate-v3-browser.json');
const snapshot=JSON.parse(fs.readFileSync(frozen)),sources=new Map(snapshot.files.map(row=>{
 assert.equal(sha(row.code),row.sha256);return [path.resolve(row.file).toLowerCase(),row];
}));
const mode=process.env.OWNED_WEAPON_STATS_MODE??'contracts', selected=process.env.OWNED_WEAPON_STATS_CASE;
const proofRows=[], required=[];
const test=(name,body)=>{
 const signature=sha(body.toString()); required.push({name,signature});
 if(mode==='bench'||selected&&!name.includes(selected))return;
 nodeTest(name,async()=>{await body();proofRows.push({name,signature,frozenSha256:sha(fs.readFileSync(frozen)),beforeBundle:sha(code.false),afterBundle:sha(code.true)});fs.writeFileSync(path.join(out,'proofs.json'),JSON.stringify(proofRows,null,2));});
};
const contents=`
export {handleMessage,testEngine} from './src/network/host.worker';
export {Ship} from './src/engine/simulation/Ship';
export {ShipSystem,OwnedWeaponStatRead} from './src/engine/simulation/ShipSystem';
export {assessThreats} from './src/engine/ai/ThreatAssessment';
export {WeaponThreatEnvelope} from './src/engine/ai/WeaponThreatEnvelope';
export {FireControlQueryRoster} from './src/engine/ai/FireControlQueryBatch';
export {hullModDefinitions} from './src/engine/extensions/HullMods';
export {AutofireController} from './src/engine/ai/AutofireController';
export {ShipWeaponControlSystem} from './src/engine/simulation/systems/ShipWeaponControlSystem';
export {Vector2} from './src/engine/math/Vector2';
export {OwnedWeaponStatPhase,openOwnedWeaponStats,testCanReuseWeaponStats} from './src/engine/ai/OwnedWeaponStatPhase';
export {RuntimeCombatModifiers} from './src/engine/extensions/RuntimeCombatModifiers';
export {InFlightFireBudget} from './src/engine/ai/InFlightFireBudget';
export {shipSystemDefinitions} from './src/engine/extensions/ship-systems/Registry';
export {captureCombat} from './src/network/AuthorityCombatSnapshot';
`;
const baselineFiles=JSON.parse(fs.readFileSync(path.resolve('artifacts/lan-owned-weapon-stats-20260927/before.json'))).filter(r=>r.exists).map(r=>r.file);
const baseline=new Map(baselineFiles.map(file=>[file,fs.readFileSync(path.resolve('artifacts/lan-owned-weapon-stats-20260927/before',file),'utf8')]));
const code={};
function instrument(file,text){
 const inject=(anchor,extra)=>{assert.equal(text.split(anchor).length,2,'unique injection '+file+' '+anchor);text=text.replace(anchor,anchor+extra);};
 if(file==='src/engine/ai/AutofireController.ts'){
  inject('function prepareAimQuery(ship: Ship, mount: WeaponMount): AimQuery {','globalThis.__aimProbe?.prepare?.(ship,mount);');
  inject('public aim(dt: number, ship: Ship, mount: WeaponMount, world: FireControlWorld): AimSolution | null {','globalThis.__aimProbe?.aim?.(ship,mount,world);');
 }
 if(file==='src/engine/simulation/ShipSystem.ts')inject('private modifiers(capacity = this.baseFluxCapacity) {','globalThis.__aimProbe?.modifiers?.(this);');
 if(file==='src/engine/simulation/systems/ShipWeaponControlSystem.ts'){
  inject('const queryBatch = FireControlQueryBatch.create(ship, world);','globalThis.__aimProbe?.start?.(ship);');
  inject('queryBatch?.close();','globalThis.__aimProbe?.end?.(ship);');
 }
 if(file==='src/engine/ai/OwnedWeaponStatPhase.ts'){
  inject('phases.set(world, phase);','globalThis.__aimProbe?.phase?.(phase,world);');
  inject('this.lease = lease; leases.set(aimWorld, lease);','globalThis.__aimProbe?.open?.(ship,aimWorld,lease);');
 }
 if(file==='src/engine/simulation/systems/ShipWeaponControlSystem.ts')inject('if (fireRequests.has(mount.slotId) && this.requestWeaponFire(', '');
 // Place a probe before the real request rather than monkeypatching native methods.
 if(file==='src/engine/simulation/systems/ShipWeaponControlSystem.ts')text=text.replace('if (fireRequests.has(mount.slotId) && this.requestWeaponFire(', 'if (fireRequests.has(mount.slotId)) globalThis.__aimProbe?.fire?.(ship,world);\n      if (fireRequests.has(mount.slotId) && this.requestWeaponFire(');
 return text;
}
for(const key of ['false','true','default','false-probe','true-probe','default-probe']){
 const enabled=key.startsWith('false')?false:key.startsWith('true')?true:'default',probe=key.endsWith('-probe');
 const result=await build({stdin:{contents:enabled?contents:contents.replace('ShipSystem,OwnedWeaponStatRead','ShipSystem'),resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',
  define:{__LAN_BUILD_ID__:JSON.stringify('interleaved-bounds-contract'),'import.meta.env':JSON.stringify({BASE_URL:'/',DEV:true,PROD:false,MODE:'development',SSR:false,VITE_AI_EXACT_AUTHORED_THREATS:'true',VITE_LAN_OWNED_MOTION_READS:'true',VITE_LAN_EARLY_PREAIM_RANGE:'true',VITE_AI_INTERLEAVED_THREATS:'true',...(enabled==='default'?{}:{VITE_LAN_WEAPON_STAT_SPAN:String(enabled)})})},
  plugins:[{name:'same-frozen-source',setup(build){build.onResolve({filter:/^\./},args=>{const base=path.resolve(args.resolveDir,args.path);for(const suffix of['','.ts','.tsx','.json','.mts','.mjs']){const file=base+suffix;if(!fs.existsSync(file)&&sources.has(file.toLowerCase()))return{path:file};}});build.onLoad({filter:/\.(?:[cm]?[jt]sx?|json)$/},args=>{const row=sources.get(args.path.toLowerCase());if(row?.file==='src/engine/ai/OwnedWeaponStatPhase.ts'&&!enabled)return{contents:'export class OwnedWeaponStatPhase {} export function openOwnedWeaponStats(){} export function testCanReuseWeaponStats(){return false;}',loader:'ts'};if(row)return{contents:(probe?instrument(row.file,!enabled&&baseline.has(row.file)?baseline.get(row.file):row.code):(!enabled&&baseline.has(row.file)?baseline.get(row.file):row.code))+(row.file==='src/engine/ai/OwnedWeaponStatPhase.ts'?'\nexport function testCanReuseWeaponStats(ship: Ship, world: FireControlWorld) { return leases.get(world)?.matches(ship) ?? false; }':'')+(row.file==='src/network/host.worker.ts'?'\nexport {handleMessage}; export function testEngine(){ return engine; }':''),loader:path.extname(row.file).slice(1).replace(/^[cm]([jt]s)$/, '$1')};if(args.path.startsWith(path.resolve('src')+path.sep))throw Error('Unfrozen source: '+args.path);});}}]});
 code[key]=result.outputFiles[0].text;
 if(enabled===true)assert.ok(code[key].includes('VITE_LAN_WEAPON_STAT_SPAN: "true"'),'real stat span build flag');
}
fs.writeFileSync(path.join(out,'build-manifest.json'),JSON.stringify({frozen,sourceSha256:sha(fs.readFileSync(frozen)),beforeBundle:sha(code.false),afterBundle:sha(code.true)},null,2));
async function load(enabled,name){globalThis.self={postMessage(){}};const file=path.join(out,name+'.mjs');fs.writeFileSync(file,code[String(enabled)],{flag:'wx'});return import(pathToFileURL(file).href);}
const hulls=['web_zhuyuan','web_gloriana','web_sc2_hyperion'],ai=Array.from({length:20},(_,i)=>hulls[i%3]);
const match={id:'authored-query-check',hostId:'host',seed:917,snapshotHz:60,players:[{id:'host',name:'Host',seat:0,team:0,hull:hulls[0]},{id:'guest',name:'Guest',seat:1,team:1,hull:hulls[0]}],options:{assignment:'teams',battleSize:3200,deploymentLimit:1600,aiHulls:[ai.slice(0,10),ai.slice(10)]}};
function world(api){const messages=[];globalThis.self={postMessage(m){messages.push(m);}};api.handleMessage(structuredClone({type:'init',match}));assert.ok(messages.some(m=>m.type==='ready'),JSON.stringify(messages.filter(m=>m.type==='error')));assert.ok(messages.some(m=>m.type==='snapshot'&&m.tick===0));assert.ok(!messages.some(m=>m.type==='error'));const engine=api.testEngine();assert.equal(engine.ships.length,176);return engine;}
function hidden(engine){return {random:engine.random.checkpointWitness(),visualRandom:engine.visualRandom.checkpointWitness(),ships:engine.ships.map(ship=>({id:ship.id,random:ship.random.checkpointWitness(),controlRandom:ship.weaponControl.random.checkpointWitness(),trackers:ship.weapons.map(mount=>{const t=ship.weaponControl.autofire.trackers.get(mount);return [mount.slotId,t?{target:t.target&&[t.target.kind,t.target.entity.id],scanIn:t.scanIn,firingTime:t.firingTime,idleFireTime:t.idleFireTime,ammoAllowed:t.ammoAllowed,random:t.random.checkpointWitness()}:null];})}))};}
function witness(api,engine,tick){return{combat:api.captureCombat(engine,tick,{},0),hidden:hidden(engine)};}







function queryWorld(api,engine){return{ships:engine.ships,missiles:[],asteroids:[],fireBudget:new api.InFlightFireBudget(engine.ships,[])};}
function begin(api,engine,ship=engine.playerShip,worldValue=queryWorld(api,engine)){
 const envelope=api.WeaponThreatEnvelope.forOwnedInterleavedPhase(engine.ships);assert.ok(envelope,'owned write graph');
 const phase=envelope.createOwnedWeaponStats(worldValue);assert.ok(phase,'query phase');assert.equal(phase.beginWrite(ship),true);
 return{envelope,phase,world:worldValue,ship};
}
function compactAim(value){return value?{...value,target:{kind:value.target.kind,id:value.target.entity.id}}:null;}
function jsonValue(value){return JSON.parse(JSON.stringify(value));}

test('init/reinit/default: actual Worker registration, 176 entities, 734 mounts, closed leases',async()=>{
 const rows=[];let reference;
 for(const enabled of[false,true,'default']){
  const api=await load(enabled+'-probe','init-'+enabled);
  for(let attempt=0;attempt<2;attempt++){
   const engine=world(api),opened=[],phases=[];assert.equal(engine.ships.reduce((n,s)=>n+s.weapons.length,0),734);
   globalThis.__aimProbe={phase(phase,w){phases.push([phase,w]);},open(ship,w,lease){assert.equal(api.testCanReuseWeaponStats(ship,w),true);opened.push([ship,w,lease]);}};
   try{engine.fixedUpdate(1/60);}finally{delete globalThis.__aimProbe;}
   assert.equal(phases.length,enabled===true?1:0);assert.equal(opened.length>0,enabled===true);
   for(const[ship,w,lease]of opened){assert.equal(api.testCanReuseWeaponStats(ship,w),false);assert.equal(lease.matches(ship),false);}
   const state=sha(JSON.stringify(witness(api,engine,1)));reference??=state;assert.equal(state,reference);
   rows.push({enabled,attempt,phases:phases.length,leases:opened.length,state});
  }
 }
 fs.writeFileSync(path.join(out,'init.json'),JSON.stringify(rows,null,2));
});

test('runtime descriptors: numeric data, live mutation, unknown accessors/functions/symbol/depth never admitted',async()=>{
 const api=await load(true,'runtime'),rows=[];
 for(const kind of['plain','null-prototype','getter','setter','function','symbol','proto-key','array','custom-prototype','deep','cyclic']){
  let reads=0;const r=new api.RuntimeCombatModifiers();let value={weaponRangeMultiplier:1.2,weaponRangeFlatByType:{ENERGY:30}};
  if(kind==='null-prototype')value=Object.assign(Object.create(null),{weaponRangeMultiplier:1.2});
  if(kind==='getter')Object.defineProperty(value,'weaponRangeMultiplier',{get(){reads++;throw Error('must not run');},enumerable:true});
  if(kind==='setter')Object.defineProperty(value,'weaponRangeMultiplier',{set(){reads++;},enumerable:true});
  if(kind==='function')value.weaponRangeMultiplier=()=>1;
  if(kind==='symbol')value[Symbol('unknown')]=1;
  if(kind==='proto-key')Object.defineProperty(value,'__proto__',{value:1,enumerable:true});
  if(kind==='array')value=[];
  if(kind==='custom-prototype')value=Object.create({weaponRangeMultiplier:1.1});
  if(kind==='deep')value={a:{b:{c:{d:1}}}};
  if(kind==='cyclic')value.self=value;
  r.set('test',value);assert.equal(r.hasPlainDataSources(),['plain','null-prototype'].includes(kind),kind);assert.equal(reads,0);r.delete('test');assert.equal(r.hasPlainDataSources(),true);rows.push({kind,reads});
 }
 const value={weaponRangeMultiplier:1.1},r=new api.RuntimeCombatModifiers();r.set('live',value);assert.equal(r.hasPlainDataSources(),true);
 Object.defineProperty(value,'weaponRangeMultiplier',{get(){throw Error('not numeric anymore');}});assert.equal(r.hasPlainDataSources(),false);r.clear();assert.equal(r.hasPlainDataSources(),true);
 const engine=world(api),ship=engine.playerShip;ship.runtimeModifiers.set('numeric',{weaponRangeMultiplier:1.2});assert.equal(ship.hasOwnedWeaponStatReads(),true);assert.equal(ship.hasNativePreAimRangeReads(),false);
 fs.writeFileSync(path.join(out,'runtime.json'),JSON.stringify(rows,null,2));
});


test('lazy cross-mount stats: original fold, IEEE values, live close, auxiliary and parent inputs',async()=>{
 const apis=[await load('false-probe','stat-values-a'),await load('true-probe','stat-values-b')],engines=apis.map(world),rows=[];
 const read=s=>['BALLISTIC','ENERGY','MISSILE'].flatMap(t=>[s.system.getWeaponRangePercent(t),s.system.getProjectileSpeedPercent(t)]);
 let counts=[0,0];
 for(let turn=0;turn<6;turn++){
  for(const engine of engines){
   for(const ship of engine.ships){
    const numbers=[-0,NaN,Infinity,-Infinity,31.25,-51.5];
    ship.runtimeModifiers.set('numeric',{weapons:{BALLISTIC:{rangePercent:numbers[turn],projectileSpeedPercent:numbers[(turn+1)%6]},ENERGY:{rangePercent:7.3,projectileSpeedPercent:-0},MISSILE:{rangePercent:9.1,projectileSpeedPercent:0.4}}});
    ship.flux.softFlux=ship.flux.maxFlux*(turn%3)*.2;
    for(const system of ship.allSystems){system.isActive=turn%2===1;system.effectLevel=(turn+1)/6;}
   }
  }
  const result=[[],[]];
  for(let arm=0;arm<2;arm++){
   const api=apis[arm],engine=engines[arm],w=queryWorld(api,engine),envelope=arm?api.WeaponThreatEnvelope.forOwnedInterleavedPhase(engine.ships):undefined,phase=envelope?.createOwnedWeaponStats(w);if(arm)assert.ok(phase);
   try{for(const ship of engine.ships){
    if(arm)assert.ok(phase.beginWrite(ship));const lease=arm?api.openOwnedWeaponStats(ship,w,w):undefined;if(arm)assert.ok(lease);
    let calls=0;globalThis.__aimProbe={modifiers(system){if(system===ship.system)calls++;}};
    try{
     assert.equal(ship.system.getWeaponRangePercent(undefined),0);assert.equal(ship.system.getProjectileSpeedPercent(undefined),0);assert.equal(calls,0,'undefined stays lazy');
     for(let mount=0;mount<5;mount++)result[arm].push(read(ship));
     assert.equal(calls,arm?1:30,'one original composition for all types/mounts');counts[arm]+=calls;
    }finally{delete globalThis.__aimProbe;lease?.close();phase?.finishWrite(ship);}
    // Outside the span no old cache survives a runtime, flux, lifecycle or ammo change.
    ship.runtimeModifiers.set('numeric',{weapons:{ENERGY:{rangePercent:turn*9.2,projectileSpeedPercent:turn*-2.3,fluxCostMultiplier:.7}}});
    ship.flux.softFlux=ship.flux.maxFlux*.4;
    for(const system of ship.allSystems){system.isActive=false;system.effectLevel=0;}
    for(const mount of ship.weapons)mount.ammo=0;
    result[arm].push(read(ship),[ship.system.getWeaponFluxCostMultiplier('ENERGY'),ship.system.getWeaponDamageMultiplier('ENERGY'),ship.system.getWeaponRateOfFireMultiplier('ENERGY')]);
   }}finally{envelope?.close();delete globalThis.__aimProbe;}
  }
  assert.deepEqual(result[1],result[0],'full original numeric fold turn '+turn);rows.push({turn,rows:result[0].length});
 }
 fs.writeFileSync(path.join(out,'stat-values.json'),JSON.stringify({rows,counts,includesIEEE:true},null,2));
});

test('read failure/reentry revocation and different-world nesting cannot leave a usable lease',async()=>{
 const api=await load('true-probe','read-lifecycle'),engine=world(api),root=engine.playerShip;
 const x=begin(api,engine),outer=api.openOwnedWeaponStats(root,x.world,x.world);assert.ok(outer);
 root.system.getWeaponRangePercent('ENERGY');const y=begin(api,engine);
 assert.equal(api.openOwnedWeaponStats(root,y.world,y.world),undefined);assert.equal(outer.matches(root),false);
 assert.equal(api.testCanReuseWeaponStats(root,x.world),false);outer.close();x.envelope.close();y.envelope.close();
 const z=begin(api,engine),lease=api.openOwnedWeaponStats(root,z.world,z.world);assert.ok(lease);let calls=0;
 globalThis.__aimProbe={modifiers(system){if(system===root.system){calls++;throw Error('composition failure');}}};
 try{assert.throws(()=>root.system.getWeaponRangePercent('ENERGY'),/composition failure/);assert.equal(lease.matches(root),false);assert.throws(()=>root.system.getProjectileSpeedPercent('ENERGY'),/composition failure/);assert.equal(calls,2);}finally{delete globalThis.__aimProbe;lease.close();z.envelope.close();}
 let inner=0,reader;reader=new api.OwnedWeaponStatRead(root.system,()=>{inner++;return inner===1?reader.read():{weapons:{ENERGY:{rangePercent:inner}}};});
 assert.equal(reader.read().weapons.ENERGY.rangePercent,2);assert.equal(reader.matches(root.system),false);assert.equal(reader.read().weapons.ENERGY.rangePercent,3);
 fs.writeFileSync(path.join(out,'read-lifecycle.json'),JSON.stringify({crossWorldRevoked:true,throws:calls,reentryReads:inner},null,2));
});

test('instance/prototype/custom system and parent callbacks do not acquire a stat span',async()=>{
 const api=await load(true,'admission'),engine=world(api),root=engine.playerShip,child=engine.ships.find(s=>s.parentShip),rows=[];
 const reject=label=>{const e=api.WeaponThreatEnvelope.forOwnedInterleavedPhase(engine.ships);try{assert.equal(e?.createOwnedWeaponStats(queryWorld(api,engine)),undefined,label);}finally{e?.close();}rows.push(label);};
 const altered=(obj,key,d,label)=>{const old=Object.getOwnPropertyDescriptor(obj,key);Object.defineProperty(obj,key,{...d,configurable:true});try{reject(label);}finally{if(old)Object.defineProperty(obj,key,old);else delete obj[key];}};
 for(const key of['getWeaponRangePercent','getProjectileSpeedPercent','modifiers','hasStableWeaponQueryHooks'])altered(root.system,key,{value(){return 0;}},'own system '+key);
 for(const key of['isActive','available'])altered(root.system,key,{get(){return true;}},'own system '+key);
 for(const key of['getWeaponRangePercent','getProjectileSpeedPercent','modifiers','hasStableWeaponQueryHooks'])altered(api.ShipSystem.prototype,key,{value(){return 0;}},'prototype system '+key);
 const allSystems=root.allSystems;altered(root,'allSystems',{get(){return allSystems;}},'own allSystems accessor');
 for(const key of['isPhased','isCollisionless','isVisibleTo','getShieldCenter'])altered(root,key,{value(){return false;}},'own ship '+key);
 altered(root.flux,'fluxPercent',{get(){return .3;}},'own flux');altered(root.runtimeModifiers,'value',{get(){return {};}},'own runtime');
 altered(root.weaponControl.autofire,'aim',{value(){return null;}},'own autofire');
 altered(child.parentShip.system,'modifiers',{value(){return {};}},'parent stats');
 const definition={...api.shipSystemDefinitions.require('NONE'),id:'STAT_TEST_CUSTOM',passiveModifiers(){return {weapons:{ENERGY:{rangePercent:2}}};}};api.shipSystemDefinitions.register(definition);
 const original=root.system;root.system=new api.ShipSystem('STAT_TEST_CUSTOM',root.flux.maxFlux,root);try{reject('unknown system identity');}finally{root.system=original;}
 fs.writeFileSync(path.join(out,'admission.json'),JSON.stringify(rows,null,2));
});

test('phase boundaries: writer/families, budget/roster mismatch, nesting, revocation and exact-only fallback',async()=>{
 const api=await load(true,'boundaries'),engine=world(api),root=engine.playerShip,child=engine.ships.find(s=>s.parentShip),fighter=engine.ships.find(s=>s.sourceCarrier);assert.ok(child&&fighter);
 let checks=0;const check=(name,body)=>{body();checks++;};
 for(const ship of[root,child,fighter])check('family',()=>{
  const x=begin(api,engine,ship),aimWorld={...x.world};assert.equal(api.testCanReuseWeaponStats(ship,aimWorld),false);
  const lease=api.openOwnedWeaponStats(ship,x.world,aimWorld);assert.ok(lease);assert.equal(api.testCanReuseWeaponStats(ship,aimWorld),true);assert.equal(api.testCanReuseWeaponStats(engine.ships.find(s=>s!==ship),aimWorld),false);
  lease.close();assert.equal(api.openOwnedWeaponStats(ship,x.world,aimWorld),undefined);x.phase.finishWrite(ship);x.envelope.close();assert.equal(api.testCanReuseWeaponStats(ship,aimWorld),false);
 });
 check('public and exact only',()=>{const w=queryWorld(api,engine);w.ownedWeaponStats=true;assert.equal(api.openOwnedWeaponStats(root,w,w),undefined);const e=api.WeaponThreatEnvelope.forExactPhase(engine.ships);assert.ok(e);assert.equal(e.createOwnedWeaponStats(w),undefined);e.close();});
 check('bad budget',()=>{for(const budget of[{},Object.assign(new api.InFlightFireBudget(engine.ships,[]),{penalty(){return 0;}}),Object.defineProperty(new api.InFlightFireBudget(engine.ships,[]),'canOmitUncontestedPenalty',{value:true})]){const w={...queryWorld(api,engine),fireBudget:budget};const e=api.WeaponThreatEnvelope.forOwnedInterleavedPhase(engine.ships);assert.equal(e.createOwnedWeaponStats(w),undefined);e.close();}});
 check('roster initial mismatch',()=>{for(const ships of[engine.ships.slice(1),[engine.ships[0],...engine.ships.slice(0,-1)]]){const e=api.WeaponThreatEnvelope.forOwnedInterleavedPhase(engine.ships);assert.equal(e.createOwnedWeaponStats({...queryWorld(api,engine),ships}),undefined);e.close();}});
 for(const mode of['source-roster','aim-roster','budget'])check(mode,()=>{const x=begin(api,engine),w={...x.world};if(mode==='source-roster')x.world.ships=[...engine.ships];if(mode==='aim-roster')w.ships=[...engine.ships];if(mode==='budget')w.fireBudget=new api.InFlightFireBudget(engine.ships,[]);assert.equal(api.openOwnedWeaponStats(root,x.world,w),undefined);assert.equal(x.phase.beginWrite(root),false);x.envelope.close();});
 check('duplicate active writer',()=>{const x=begin(api,engine);assert.equal(x.phase.beginWrite(root),false);assert.equal(api.openOwnedWeaponStats(root,x.world,x.world),undefined);x.envelope.close();});
 check('unknown writer',()=>{const w=queryWorld(api,engine),e=api.WeaponThreatEnvelope.forOwnedInterleavedPhase(engine.ships),p=e.createOwnedWeaponStats(w);assert.equal(p.beginWrite({}),false);e.close();});
 check('wrong writer',()=>{const x=begin(api,engine);assert.equal(api.openOwnedWeaponStats(child,x.world,x.world),undefined);x.phase.finishWrite(child);assert.equal(api.openOwnedWeaponStats(root,x.world,x.world),undefined);x.envelope.close();});
 check('nested lease',()=>{const x=begin(api,engine),lease=api.openOwnedWeaponStats(root,x.world,x.world);assert.ok(lease);assert.equal(api.openOwnedWeaponStats(root,x.world,x.world),undefined);assert.equal(lease.matches(root),false);x.envelope.close();});
 check('unclosed lease at finish',()=>{const x=begin(api,engine),lease=api.openOwnedWeaponStats(root,x.world,x.world);x.phase.finishWrite(root);assert.equal(lease.matches(root),false);x.envelope.close();});
 check('nested phase',()=>{const x=begin(api,engine),lease=api.openOwnedWeaponStats(root,x.world,x.world);assert.equal(x.envelope.createOwnedWeaponStats(x.world),undefined);assert.equal(lease.matches(root),false);x.envelope.close();});
 check('envelope close',()=>{const x=begin(api,engine),lease=api.openOwnedWeaponStats(root,x.world,x.world);x.envelope.close();assert.equal(lease.matches(root),false);assert.equal(api.openOwnedWeaponStats(root,x.world,x.world),undefined);});
 for(const dependent of[child,fighter])check('family requalification',()=>{const writer=dependent.parentShip??dependent.sourceCarrier,x=begin(api,engine,writer);dependent.externalPhaseEffects.set('unknown',()=>undefined);try{assert.equal(api.openOwnedWeaponStats(writer,x.world,x.world),undefined);}finally{dependent.externalPhaseEffects.delete('unknown');x.envelope.close();}});
 check('numeric updated to accessor',()=>{const x=begin(api,engine),data={weaponRangeMultiplier:1.2};let reads=0;root.runtimeModifiers.set('test',data);Object.defineProperty(data,'weaponRangeMultiplier',{get(){reads++;return 1;}});try{assert.equal(api.openOwnedWeaponStats(root,x.world,x.world),undefined);assert.equal(reads,0);}finally{root.runtimeModifiers.delete('test');x.envelope.close();}});
 check('qualification throws closes first',()=>{const x=begin(api,engine),original=root.hasOwnedWeaponStatReads;root.hasOwnedWeaponStatReads=()=>{throw Error('qualification failed');};try{assert.throws(()=>api.openOwnedWeaponStats(root,x.world,x.world),/qualification failed/);assert.equal(x.phase.beginWrite(root),false);}finally{root.hasOwnedWeaponStatReads=original;x.envelope.close();}});
 check('post-fire write revokes subsequent writers',()=>{const x=begin(api,engine),lease=api.openOwnedWeaponStats(root,x.world,x.world);lease.close();root.externalPhaseEffects.set('unknown',()=>undefined);try{x.phase.finishWrite(root);assert.equal(x.phase.beginWrite(child),false);}finally{root.externalPhaseEffects.delete('unknown');x.envelope.close();}});
 fs.writeFileSync(path.join(out,'boundaries.json'),JSON.stringify({checks},null,2));
});

test('per-mount aim/preAim/decide, tracker and RNG equivalence with composition reduction',async()=>{
 const aApi=await load('false-probe','aim-reference'),bApi=await load('true-probe','aim-candidate'),a=world(aApi),b=world(bApi),aw=queryWorld(aApi,a),bw=queryWorld(bApi,b),counts=[0,0],results=[[],[]];
 for(const engine of[a,b])for(const[i,s]of engine.ships.entries())s.pos.set(s.teamId===0?-650:650,Math.floor(i/2)*27-900);
 const envelope=bApi.WeaponThreatEnvelope.forOwnedInterleavedPhase(b.ships),phase=envelope.createOwnedWeaponStats(bw);assert.ok(phase);
 try{for(let round=0;round<3;round++)for(let i=0;i<a.ships.length;i++){
  const bs=b.ships[i];assert.equal(phase.beginWrite(bs),true);const lease=bApi.openOwnedWeaponStats(bs,bw,bw);assert.ok(lease);
  try{for(let arm=0;arm<2;arm++){
   const api=arm?bApi:aApi,engine=arm?b:a,w=arm?bw:aw,s=engine.ships[i];globalThis.__aimProbe={modifiers(system){if(system===s.system)counts[arm]++;}};
   for(const mount of s.weapons){
    const aim=s.weaponControl.autofire.aim(1/60,s,mount,w);
    const pre=s.weaponControl.autofire.preAim(s,mount,w);
    const decide=aim?s.weaponControl.autofire.decide(s,mount,aim,w,1/60):null;
    results[arm].push(jsonValue({aim:compactAim(aim),pre,decide}));
   }
   assert.equal(api.testCanReuseWeaponStats(s,w),!!arm);
  }}finally{delete globalThis.__aimProbe;lease.close();phase.finishWrite(bs);}
 }}finally{envelope.close();}
 assert.deepEqual(results[1],results[0]);assert.ok(results[0].some(r=>r.aim),'exercise non-null solutions');assert.deepEqual(witness(bApi,b,0),witness(aApi,a,0));assert.ok(counts[1]<counts[0]);
 fs.writeFileSync(path.join(out,'aim.json'),JSON.stringify({queries:results[0].length,solutions:results[0].filter(Boolean).length,modifierCalls:counts,stateSha256:sha(JSON.stringify(witness(bApi,b,0)))},null,2));
});

test('unknown callbacks preserve scalar read order, mutation and exceptions without forged permission',async()=>{
 const apis=[await load('false-probe','unknown-reference'),await load('true-probe','unknown-candidate')],rows=[];
 for(const kind of['phase','throw-phase','runtime','throw-runtime','unknown-budget','throw-budget']){
  const outcomes=[];
  for(const api of apis){
   const engine=world(api),ship=engine.playerShip,w=queryWorld(api,engine),trace=[];let reads=0;
   for(const[i,s]of engine.ships.entries())s.pos.set(s.teamId===0?-500:500,i*10-800);
   if(kind.includes('phase'))engine.ships.find(s=>s.teamId!==ship.teamId).externalPhaseEffects.set('probe',()=>{trace.push('phase');if(kind==='throw-phase')throw Error('phase failure');return undefined;});
   if(kind.includes('runtime')){const data={};Object.defineProperty(data,'weaponRangeMultiplier',{enumerable:true,get(){trace.push('runtime');if(kind==='throw-runtime')throw Error('runtime failure');return 1+(++reads%2)*.1;}});ship.runtimeModifiers.set('probe',data);}
   if(kind.includes('budget'))w.fireBudget={penalty(){trace.push('budget');if(kind==='throw-budget')throw Error('budget failure');return 0;},estimate(){return 0;},needsDetailedPenalty(){trace.push('detailed');return true;}};
   if(api===apis[1]){const envelope=api.WeaponThreatEnvelope.forOwnedInterleavedPhase(engine.ships);if(envelope){assert.equal(envelope.createOwnedWeaponStats(w),undefined);envelope.close();}}
   const target=engine.ships.find(s=>s.teamId!==ship.teamId);ship.fireControlMode='AI';ship.currentTargetShip=target;w.ownedWeaponStats=true;
   globalThis.__aimProbe={prepare(){trace.push('prepare');}};
   let result,error;try{result=ship.weapons.map(m=>jsonValue(compactAim(ship.weaponControl.autofire.aim(1/60,ship,m,w))));}catch(e){error=e.message;}finally{delete globalThis.__aimProbe;}
   outcomes.push({trace,result,error,state:jsonValue(hidden(engine))});
  }
  assert.deepEqual(outcomes[1],outcomes[0],kind);assert.ok(outcomes[0].trace.length);if(kind.startsWith('throw-'))assert.ok(outcomes[0].error,kind);
  rows.push({kind,trace:outcomes[0].trace,error:outcomes[0].error});
 }
 fs.writeFileSync(path.join(out,'unknown.json'),JSON.stringify(rows,null,2));
});

test('actual firing and exception finally: every emission sees closed query leases',async()=>{
 const api=await load('true-probe','emissions'),engine=world(api),opened=[],phases=[];let requests=0;
 globalThis.__aimProbe={phase(p,w){phases.push([p,w]);},open(s,w,l){opened.push([s,w,l]);},fire(s,w){requests++;assert.equal(api.testCanReuseWeaponStats(s,w),false);for(const[x,y,l]of opened)if(x===s){assert.equal(l.matches(s),false);assert.equal(api.testCanReuseWeaponStats(s,y),false);}}};
 try{for(let tick=1;tick<=35;tick++){if(tick===5)for(const[i,s]of engine.capitalShips.entries()){s.pos.set(s.teamId===0?-500:500,(i%6)*240-600);s.aimTargetWorld.set(s.teamId===0?500:-500,s.pos.y);s.isFiringMain=true;}engine.fixedUpdate(1/60);}}finally{delete globalThis.__aimProbe;}
 assert.ok(opened.length>0);assert.ok(requests>0);assert.ok(engine.projectiles.length+engine.beams.length>0,'actual emissions');
 const thrown=world(api),leases=[];let reached=false;
 globalThis.__aimProbe={open(s,w,l){leases.push([s,w,l]);},aim(s,m,aimWorld){if(api.testCanReuseWeaponStats(s,aimWorld)){reached=true;throw Error('injected native aim exception');}}};
 try{assert.throws(()=>thrown.fixedUpdate(1/60),/injected native aim exception/);}finally{delete globalThis.__aimProbe;}
 assert.ok(reached);assert.ok(leases.length);for(const[s,w,l]of leases){assert.equal(l.matches(s),false);assert.equal(api.testCanReuseWeaponStats(s,w),false);assert.equal(api.openOwnedWeaponStats(s,w,w),undefined);}
 fs.writeFileSync(path.join(out,'emissions.json'),JSON.stringify({leases:opened.length,requests,projectiles:engine.projectiles.length,beams:engine.beams.length,exceptionLeases:leases.length},null,2));
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

test('20/270 natural steps: complete states and warm shooter composition coverage',async()=>{
 const rows=[];
 for(const enabled of[false,true]){
  const api=await load(enabled+'-probe','count-'+enabled),engine=world(api);let prepare=0,leases=0,warmLeases=0,tick=0,shooter,compositions=0,warmCompositions=0;
  const phases=new Set();
  globalThis.__aimProbe={prepare(){prepare++;},start(s){shooter=s.system;},end(){shooter=undefined;},modifiers(system){if(system===shooter){compositions++;if(tick>150)warmCompositions++;}},open(){leases++;if(tick>150)warmLeases++;},phase(p){phases.add(p);}};
  let initial;
  try{for(tick=1;tick<=270;tick++){engine.fixedUpdate(1/60);if(tick===20)initial={prepare,leases,compositions,state:sha(JSON.stringify(witness(api,engine,tick)))};}}finally{delete globalThis.__aimProbe;}
  const state=sha(JSON.stringify(witness(api,engine,270)));assert.equal(initial.state,'bc891a0f1c7b8da97559620bf2b36b6c7c35bbe3adde8467c4b6ec1b9b3ad224');assert.equal(state,'bf519eedd4419e5f13360306acbd08b5ca380116fe25e564f59d141212e067d6');
  assert.equal(warmLeases>0,enabled);rows.push({enabled,initial,totalPrepare:prepare,compositions,warmCompositions,totalLeases:leases,warmLeases,phases:phases.size,state});
 }
 assert.equal(rows[1].totalPrepare,rows[0].totalPrepare,'no prepare optimization');assert.ok(rows[1].warmCompositions<rows[0].warmCompositions);fs.writeFileSync(path.join(out,'composition-counts.json'),JSON.stringify(rows,null,2));
});
if(mode==='bench')nodeTest('one isolated-process ABBA: 150 warmup + 120 full steps, 5% gate in each pair',async()=>{
 const evidence=JSON.parse(process.env.OWNED_WEAPON_STATS_EVIDENCE??'[]').flatMap(file=>JSON.parse(fs.readFileSync(file)));
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

