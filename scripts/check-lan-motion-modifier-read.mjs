import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {test as nodeTest} from 'node:test';
import {build} from 'esbuild';
const out=path.resolve(process.env.MOTION_READ_OUT??('artifacts/lan-motion-modifier-read-20260927/check-'+Date.now()));
fs.mkdirSync(out,{recursive:true});
const sha=value=>createHash('sha256').update(value).digest('hex');
const frozen=process.env.MOTION_READ_FROZEN??path.resolve('artifacts/lan-motion-modifier-read-20260927/candidate-browser.json');
const snapshot=JSON.parse(fs.readFileSync(frozen)),sources=new Map(snapshot.files.map(row=>{
 assert.equal(sha(row.code),row.sha256);return [path.resolve(row.file).toLowerCase(),row];
}));
let passed=0;
const test=(name,body)=>nodeTest(name,async()=>{await body();passed++;});
const contents=`
export {handleMessage,testEngine} from './src/network/host.worker';
export {Ship} from './src/engine/simulation/Ship';
export {ShipSystem} from './src/engine/simulation/ShipSystem';
export {shipMotionStats} from './src/engine/simulation/systems/ShipMotion';
export {captureCombat} from './src/network/AuthorityCombatSnapshot';
`;
const baselineFiles=JSON.parse(fs.readFileSync(path.resolve('artifacts/lan-motion-modifier-read-20260927/before.json'))).map(r=>r.file);
const baseline=new Map(baselineFiles.map(file=>[file,fs.readFileSync(path.resolve('artifacts/lan-motion-modifier-read-20260927/before',file),'utf8')]));
const code={};
for(const enabled of [false,true,'default']){
 const result=await build({stdin:{contents,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',
  define:{__LAN_BUILD_ID__:JSON.stringify('motion-read-contract'),'import.meta.env':JSON.stringify({BASE_URL:'/',DEV:true,PROD:false,MODE:'development',SSR:false,VITE_AI_EXACT_AUTHORED_THREATS:'true',...(enabled==='default'?{}:{VITE_LAN_OWNED_MOTION_READS:String(enabled)})})},
  plugins:[{name:'same-frozen-source',setup(build){build.onLoad({filter:/\.(?:[cm]?[jt]sx?|json)$/},args=>{const row=sources.get(args.path.toLowerCase());if(row)return{contents:(!enabled&&baseline.has(row.file)?baseline.get(row.file):row.code)+(row.file==='src/network/host.worker.ts'?'\nexport {handleMessage}; export function testEngine(){ return engine; }':''),loader:path.extname(row.file).slice(1).replace(/^[cm]([jt]s)$/, '$1')};if(args.path.startsWith(path.resolve('src')+path.sep))throw Error('Unfrozen source: '+args.path);});}}]});
 code[String(enabled)]=result.outputFiles[0].text;
}
fs.writeFileSync(path.join(out,'build-manifest.json'),JSON.stringify({frozen,sourceSha256:sha(fs.readFileSync(frozen)),beforeBundle:sha(code.false),afterBundle:sha(code.true)},null,2));
async function load(enabled,name){globalThis.self={postMessage(){}};const file=path.join(out,name+'.mjs');fs.writeFileSync(file,code[String(enabled)]);return import(pathToFileURL(file).href);}
const hulls=['web_zhuyuan','web_gloriana','web_sc2_hyperion'],ai=Array.from({length:20},(_,i)=>hulls[i%3]);
const match={id:'authored-query-check',hostId:'host',seed:917,snapshotHz:60,players:[{id:'host',name:'Host',seat:0,team:0,hull:hulls[0]},{id:'guest',name:'Guest',seat:1,team:1,hull:hulls[0]}],options:{assignment:'teams',battleSize:3200,deploymentLimit:1600,aiHulls:[ai.slice(0,10),ai.slice(10)]}};
function world(api){const messages=[];globalThis.self={postMessage(m){messages.push(m);}};api.handleMessage(structuredClone({type:'init',match}));assert.ok(messages.some(m=>m.type==='ready'),JSON.stringify(messages.filter(m=>m.type==='error')));assert.ok(messages.some(m=>m.type==='snapshot'&&m.tick===0));assert.ok(!messages.some(m=>m.type==='error'));const engine=api.testEngine();assert.equal(engine.ships.length,176);return engine;}
function hidden(engine){return {random:engine.random.checkpointWitness(),visualRandom:engine.visualRandom.checkpointWitness(),ships:engine.ships.map(ship=>({id:ship.id,random:ship.random.checkpointWitness(),controlRandom:ship.weaponControl.random.checkpointWitness(),trackers:ship.weapons.map(mount=>{const t=ship.weaponControl.autofire.trackers.get(mount);return [mount.slotId,t?{target:t.target&&[t.target.kind,t.target.entity.id],scanIn:t.scanIn,firingTime:t.firingTime,idleFireTime:t.idleFireTime,ammoAllowed:t.ammoAllowed,random:t.random.checkpointWitness()}:null];})}))};}
function witness(api,engine,tick){return{combat:api.captureCombat(engine,tick,{},0),hidden:hidden(engine)};}


test('actual host init and reinit reduce one motion query from ten root compositions to one',async()=>{
 const before=await load(false,'init-reference'),after=await load(true,'init-candidate'),rows=[];
 for(const[enabled,api]of[[false,before],[true,after]])for(let epoch=1;epoch<=2;epoch++){
  const engine=world(api),original=api.ShipSystem.prototype.modifiers;let calls=0;
  api.ShipSystem.prototype.modifiers=function(...args){if(this.owner?.system===this)calls++;return original.apply(this,args);};
  let stats;try{stats=engine.ships.map(s=>s.getMotionStats());}finally{api.ShipSystem.prototype.modifiers=original;}
  rows.push({enabled,epoch,calls,stats});
 }
 assert.equal(rows[0].calls,1760);assert.equal(rows[1].calls,1760);assert.equal(rows[2].calls,176);assert.equal(rows[3].calls,176);
 assert.deepEqual(rows[2].stats,rows[0].stats);assert.deepEqual(rows[3].stats,rows[1].stats);
 fs.writeFileSync(path.join(out,'host-init-probe.json'),JSON.stringify(rows.map(({stats: _stats,...rest})=>rest),null,2));
});

test('all motion fields stay live across multi-slot/parent systems, flux, disabled engines and special numbers',async()=>{
 const aApi=await load(false,'motion-reference'),bApi=await load(true,'motion-candidate'),a=world(aApi),b=world(bApi);let comparisons=0;
 for(let step=0;step<8;step++){
  for(const engine of[a,b])for(const [index,s]of engine.ships.entries()){
   s.flux.isEngineBoostActive=step%2===1;s.flux.softFlux=s.flux.maxFlux*(step/8);s.fleetSpeedBonusPercent=index%3*7;s.terrainSpeedMult=step===4?.65:1;
   if(step===1)for(const system of s.systems){system.isActive=true;system.state='ACTIVE';system.effectLevel=.7;}
   if(step===2&&s.parentShip)s.parentShip.flux.isVenting=true;
   if(step===3)for(const system of s.systems){system.state='OUT';system.effectLevel=.25;}
   if(step===4)for(const system of s.systems){system.state='COOLDOWN';system.isActive=false;system.cooldownTimer=system.maxCooldown;system.teleportVisual={serial:1,origin:s.pos.clone(),destination:s.pos.clone(),destinationFacing:s.facingRad};}
   if(step===5)s.engineController.state='DISABLED';
   if(step===6){s.engineController.state='READY';s.terrainSpeedMult=index%2?Infinity:NaN;}
   if(step===7){s.terrainSpeedMult=-0;s.flux.softFlux=NaN;}
  }
  const as=a.ships,bs=b.ships;
  for(let i=0;i<as.length;i++)for(const excluded of[0,18,-0,NaN]){assert.deepEqual(bApi.shipMotionStats(bs[i],excluded),aApi.shipMotionStats(as[i],excluded),'motion '+step+'/'+i+'/'+excluded);comparisons++;}
 }
 fs.writeFileSync(path.join(out,'motion-comparison.json'),JSON.stringify({comparisons},null,2));
});

test('unknown callbacks and runtime effects retain original scalar order, mutations and exceptions',async()=>{
 const aApi=await load(false,'fallback-reference'),bApi=await load(true,'fallback-candidate'),rows=[];
 function run(api,kind){const engine=world(api),ship=kind.startsWith('parent')?engine.combatShips.find(s=>s.parentShip):engine.playerShip,trace=[];
  let n=0;
  if(kind==='unknown'||kind==='throws'){
   const d=ship.system.definition;ship.system.definition={...d,modifiers(){trace.push(++n);if(kind==='throws'&&n===3)throw Error('third scalar');return{speedFlat:n,speedPercent:n,turnAccelerationFlat:n,turnAccelerationPercent:n,accelerationFlat:n,accelerationPercent:n,decelerationFlat:n,decelerationPercent:n,turnRateFlat:n,turnRatePercent:n};}};ship.system.isActive=true;
  }
  if(kind==='runtime')ship.runtimeModifiers.set('test',{speedPercent:31,accelerationPercent:-14});
  if(kind==='parent-runtime')ship.parentShip.runtimeModifiers.set('test',{disableWeapons:1});
  if(kind==='parent-unknown')ship.parentShip.system.definition={...ship.parentShip.system.definition};
  if(kind==='aux-unknown')ship.defenseSystem.definition={...ship.defenseSystem.definition};
  const original=api.ShipSystem.prototype.modifiers;let calls=0;
  api.ShipSystem.prototype.modifiers=function(...args){if(this===ship.system)calls++;return original.apply(this,args);};
  let result;try{result=ship.getMotionStats();}catch(error){result={error:error.message};}finally{api.ShipSystem.prototype.modifiers=original;}
  return{result,trace,calls};
 }
 for(const kind of['unknown','throws','runtime','parent-runtime','parent-unknown','aux-unknown']){const before=run(aApi,kind),after=run(bApi,kind);assert.deepEqual(after,before,kind);assert.equal(after.calls,kind==='throws'?3:10);rows.push({kind,calls:after.calls,trace:after.trace});}
 fs.writeFileSync(path.join(out,'fallback-order.json'),JSON.stringify(rows,null,2));
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

test('one pre-registered ABBA: 150 warmup + 120 measured steps, 5% total-step gate per pair',async()=>{
 assert.equal(passed,4,'do not time invalid candidate');const rows=[];
 for(const[index,enabled]of[false,true,true,false].entries()){
  const loaded=await load(enabled,'bench-'+index),engine=world(loaded);
  for(let tick=0;tick<150;tick++)engine.fixedUpdate(1/60);
  const started=performance.now();for(let tick=0;tick<120;tick++)engine.fixedUpdate(1/60);const elapsedMs=performance.now()-started;
  rows.push({index,enabled,steps:120,elapsedMs,perStepMs:elapsedMs/120,stateSha256:sha(JSON.stringify(witness(loaded,engine,270)))});
  fs.writeFileSync(path.join(out,'abba.json'),JSON.stringify({scope:'Node original host init + synchronous fixedUpdate, NOT browser timing',rows},null,2));
 }
 assert.ok(rows.every(row=>row.stateSha256===rows[0].stateSha256));
 const gains=[1-rows[1].elapsedMs/rows[0].elapsedMs,1-rows[2].elapsedMs/rows[3].elapsedMs],pass=gains.every(g=>g>=.05);
 fs.writeFileSync(path.join(out,'abba.json'),JSON.stringify({scope:'Node original host init + synchronous fixedUpdate, NOT browser timing',rows,gains,passesPrescribedGate:pass},null,2));
 console.log(JSON.stringify({gains,passesPrescribedGate:pass}));
});


test('default-disabled candidate preserves original ten scalar reads',async()=>{
 const api=await load('default','default-disabled'),engine=world(api),original=api.ShipSystem.prototype.modifiers;let calls=0;
 api.ShipSystem.prototype.modifiers=function(...args){if(this.owner?.system===this)calls++;return original.apply(this,args);};
 try{for(const ship of engine.ships)ship.getMotionStats();}finally{api.ShipSystem.prototype.modifiers=original;}
 assert.equal(calls,1760);fs.writeFileSync(path.join(out,'default-disabled.json'),JSON.stringify({ships:176,rootModifierCalls:calls,explicitFlagAbsent:true},null,2));
});
