import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {test as nodeTest} from 'node:test';
import {build} from 'esbuild';
const out=path.resolve(process.env.NAV_MOTION_OUT??('artifacts/lan-navigation-motion-scan-20260927/check-'+Date.now()));
fs.mkdirSync(out,{recursive:true});
const sha=value=>createHash('sha256').update(value).digest('hex');
const frozen=process.env.NAV_MOTION_FROZEN??path.resolve('artifacts/lan-navigation-motion-scan-20260927/candidate-browser.json');
const snapshot=JSON.parse(fs.readFileSync(frozen)),sources=new Map(snapshot.files.map(row=>{
 assert.equal(sha(row.code),row.sha256);return [path.resolve(row.file).toLowerCase(),row];
}));
let passed=0;
const test=(name,body)=>nodeTest(name,async()=>{await body();passed++;});
const contents=`
export {handleMessage,testEngine} from './src/network/host.worker';
export {Ship} from './src/engine/simulation/Ship';
export {ShipSystem} from './src/engine/simulation/ShipSystem';
export {forwardPathClear,avoidCollisions} from './src/engine/ai/TacticalNavigation';
export {Vector2} from './src/engine/math/Vector2';
export {captureCombat} from './src/network/AuthorityCombatSnapshot';
`;
const baselineFiles=JSON.parse(fs.readFileSync(path.resolve('artifacts/lan-navigation-motion-scan-20260927/before.json'))).map(r=>r.file);
const baseline=new Map(baselineFiles.map(file=>[file,fs.readFileSync(path.resolve('artifacts/lan-navigation-motion-scan-20260927/before',file),'utf8')]));
const code={};
for(const enabled of [false,true,'default']){
 const result=await build({stdin:{contents,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',
  define:{__LAN_BUILD_ID__:JSON.stringify('navigation-motion-contract'),'import.meta.env':JSON.stringify({BASE_URL:'/',DEV:true,PROD:false,MODE:'development',SSR:false,VITE_AI_EXACT_AUTHORED_THREATS:'true',VITE_LAN_OWNED_MOTION_READS:'true',VITE_LAN_EARLY_PREAIM_RANGE:'true',...(enabled==='default'?{}:{VITE_LAN_NAVIGATION_MOTION_READS:String(enabled)})})},
  plugins:[{name:'same-frozen-source',setup(build){build.onLoad({filter:/\.(?:[cm]?[jt]sx?|json)$/},args=>{const row=sources.get(args.path.toLowerCase());if(row)return{contents:(!enabled&&baseline.has(row.file)?baseline.get(row.file):row.code)+(row.file==='src/network/host.worker.ts'?'\nexport {handleMessage}; export function testEngine(){ return engine; }':''),loader:path.extname(row.file).slice(1).replace(/^[cm]([jt]s)$/, '$1')};if(args.path.startsWith(path.resolve('src')+path.sep))throw Error('Unfrozen source: '+args.path);});}}]});
 code[String(enabled)]=result.outputFiles[0].text;
}
fs.writeFileSync(path.join(out,'build-manifest.json'),JSON.stringify({frozen,sourceSha256:sha(fs.readFileSync(frozen)),beforeBundle:sha(code.false),afterBundle:sha(code.true)},null,2));
// Reuse only already-passing contracts over byte-identical A/B bundles when
// targeting a test-only cross-bundle prototype-comparison repair.
if(process.env.NAV_MOTION_PRIOR_CHECK){
 const prior=path.resolve(process.env.NAV_MOTION_PRIOR_CHECK),manifest=JSON.parse(fs.readFileSync(path.join(prior,'build-manifest.json')));
 assert.equal(manifest.sourceSha256,sha(fs.readFileSync(frozen)));assert.equal(manifest.beforeBundle,sha(code.false));assert.equal(manifest.afterBundle,sha(code.true));
 assert.equal(JSON.parse(fs.readFileSync(path.join(prior,'whole-state-hashes.json'))).length,60);
 assert.equal(JSON.parse(fs.readFileSync(path.join(prior,'init-default-probe.json'))).length,6);
 assert.equal(JSON.parse(fs.readFileSync(path.join(prior,'fallback-order.json'))).length,12);
 const log=fs.readFileSync(path.join(prior,'../contracts.log'),'utf8');
 for(const name of ['host init and reinit:','callback boundaries drop borrowed motion','60 fixed steps preserve'])assert.ok(log.includes('✔ '+name));
 fs.writeFileSync(path.join(out,'reused-contracts.json'),JSON.stringify({prior,beforeBundle:manifest.beforeBundle,afterBundle:manifest.afterBundle,names:['host init/default','callback boundaries','60 fixed steps']},null,2));passed=3;
}
async function load(enabled,name){globalThis.self={postMessage(){}};const file=path.join(out,name+'.mjs');fs.writeFileSync(file,code[String(enabled)]);return import(pathToFileURL(file).href);}
const hulls=['web_zhuyuan','web_gloriana','web_sc2_hyperion'],ai=Array.from({length:20},(_,i)=>hulls[i%3]);
const match={id:'authored-query-check',hostId:'host',seed:917,snapshotHz:60,players:[{id:'host',name:'Host',seat:0,team:0,hull:hulls[0]},{id:'guest',name:'Guest',seat:1,team:1,hull:hulls[0]}],options:{assignment:'teams',battleSize:3200,deploymentLimit:1600,aiHulls:[ai.slice(0,10),ai.slice(10)]}};
function world(api){const messages=[];globalThis.self={postMessage(m){messages.push(m);}};api.handleMessage(structuredClone({type:'init',match}));assert.ok(messages.some(m=>m.type==='ready'),JSON.stringify(messages.filter(m=>m.type==='error')));assert.ok(messages.some(m=>m.type==='snapshot'&&m.tick===0));assert.ok(!messages.some(m=>m.type==='error'));const engine=api.testEngine();assert.equal(engine.ships.length,176);return engine;}
function hidden(engine){return {random:engine.random.checkpointWitness(),visualRandom:engine.visualRandom.checkpointWitness(),ships:engine.ships.map(ship=>({id:ship.id,random:ship.random.checkpointWitness(),controlRandom:ship.weaponControl.random.checkpointWitness(),trackers:ship.weapons.map(mount=>{const t=ship.weaponControl.autofire.trackers.get(mount);return [mount.slotId,t?{target:t.target&&[t.target.kind,t.target.entity.id],scanIn:t.scanIn,firingTime:t.firingTime,idleFireTime:t.idleFireTime,ammoAllowed:t.ammoAllowed,random:t.random.checkpointWitness()}:null];})}))};}
function witness(api,engine,tick){return{combat:api.captureCombat(engine,tick,{},0),hidden:hidden(engine)};}


function scene(engine,api){return{ships:engine.ships,projectiles:[],beams:[],asteroids:[{hp:100,pos:new api.Vector2(300,500),vel:new api.Vector2(30,-50),radius:55},{hp:100,pos:new api.Vector2(-300,-500),vel:new api.Vector2(-60,80),radius:100}]};}
function rootReads(api,engine,query){const ship=engine.playerShip,original=api.ShipSystem.prototype.modifiers;let calls=0;api.ShipSystem.prototype.modifiers=function(...args){if(this===ship.system)calls++;return original.apply(this,args);};let result;try{result=query(ship);}finally{api.ShipSystem.prototype.modifiers=original;}return{calls,result};}
test('host init and reinit: one observer motion read per scan, original counts when flag absent',async()=>{
 const rows=[];for(const enabled of[false,true,'default']){const api=await load(enabled,'init-'+enabled);for(let epoch=0;epoch<2;epoch++){
  const engine=world(api),view=scene(engine,api);const result=rootReads(api,engine,ship=>api.forwardPathClear(ship,view,200,5));rows.push({enabled,epoch,...result,entities:engine.ships.length});
 }}
 assert.ok(rows[0].calls>1);assert.equal(rows[2].calls,1);assert.equal(rows[3].calls,1);assert.equal(rows[4].calls,rows[0].calls);assert.equal(rows[5].calls,rows[1].calls);assert.ok(rows.every(row=>row.result===rows[0].result));fs.writeFileSync(path.join(out,'init-default-probe.json'),JSON.stringify(rows,null,2));
});

test('authored roots/modules preserve exact navigation and forward corridor across live states and special numbers',async()=>{
 const aApi=await load(false,'nav-reference'),bApi=await load(true,'nav-candidate'),a=world(aApi),b=world(bApi),rows=[];
 for(let scenario=0;scenario<8;scenario++){
  for(const engine of[a,b])for(const[i,s]of engine.ships.entries()){
   s.pos.set((s.teamId===0?-1:1)*(scenario===0?1e5:400)+(i%5)*100,(i%7)*200);s.vel.set(scenario===2?(s.teamId===0?600:-600):i%3*30,scenario===3?200:-15);s.facingRad=i*.15;
   if(scenario===1){s.shield.isActive=true;s.shield.radius=s.spec.collisionRadius*2;}
   if(scenario===3){s.flux.softFlux=s.flux.maxFlux*.6;s.flux.isEngineBoostActive=true;}
   if(scenario===4)for(const system of s.systems){system.isActive=true;system.state='ACTIVE';system.effectLevel=.7;}
   if(scenario===5)for(const system of s.systems){system.isActive=false;system.state='COOLDOWN';system.effectLevel=0;}
   if(scenario===6){s.pos.x=i%11===0?Infinity:i%13===0?NaN:s.pos.x;s.vel.y=i%9===0?NaN:0;}
   if(scenario===7){s.pos.set(s.teamId===0?-400:400,0);s.vel.set(-0,0);s.fleetSpeedBonusPercent=30;}
  }
  const query=(api,engine)=>{const view=scene(engine,api);return engine.combatShips.map(ship=>({id:ship.id,clear:[0,3,NaN,Infinity,-1].map(h=>api.forwardPathClear(ship,view,200,h)),avoid:(()=>{const desired=new api.Vector2(70,20),value=api.avoidCollisions(ship,desired,view);assert.equal(Object.getPrototypeOf(value.velocity),api.Vector2.prototype);return{velocity:[value.velocity.x,value.velocity.y],avoiding:value.avoiding,risk:value.risk,borrowedDesired:value.velocity===desired};})()}));};
  const left=query(aApi,a),right=query(bApi,b);assert.deepEqual(right,left,'navigation '+scenario);rows.push({scenario,ships:left.length,hash:sha(JSON.stringify(right))});
 }
 fs.writeFileSync(path.join(out,'navigation-comparison.json'),JSON.stringify(rows,null,2));
});

test('callback boundaries drop borrowed motion before mutation, new callbacks, exceptions and nested scans',async()=>{
 const aApi=await load(false,'fallback-reference'),bApi=await load(true,'fallback-candidate'),rows=[];
 function run(api,kind){const engine=world(api),ship=engine.playerShip,roots=engine.combatShips.filter(s=>!s.parentShip&&s!==ship),module=engine.combatShips.find(s=>s.parentShip&&s.teamId!==ship.teamId);const targets=[roots[0],kind==='parent'?module:roots[1],roots[2],roots[3]],trace=[];
  for(const[i,s]of[ship,...targets].entries()){s.pos.set(i*100,40*i);s.vel.set(i*10,0);}
  const view={ships:[ship,...targets],asteroids:[{hp:100,pos:new api.Vector2(900,100),vel:new api.Vector2(40,0),radius:40}],projectiles:[],beams:[]};
  const mutate=()=>{trace.push('edge');ship.fleetSpeedBonusPercent+=37;if(kind==='install'){ship.system.definition={...ship.system.definition,passiveModifiers(){trace.push('new-modifier');return{speedFlat:trace.length};}};}if(kind==='throws')throw Error('phase boundary');if(kind==='nested')trace.push(api.forwardPathClear(ship,{...view,ships:[ship,targets[3]]},100,2));return undefined;};
  if(['phase','install','throws','nested','parent'].includes(kind))(kind==='parent'?module.parentShip:targets[1]).externalPhaseEffects.set('contract',mutate);
  if(kind==='unknown'){targets[1].system.isActive=false;targets[1].system.definition={...targets[1].system.definition,isExecuting(){mutate();return false;}};}
  if(kind==='runtime')ship.runtimeModifiers.set('contract',{speedPercent:31});
  if(kind==='record')view.noteNavigationObstacle=()=>{mutate();};
  if(kind==='vector'){const length=targets[1].vel.length;targets[1].vel.length=function(){mutate();return length.call(this);};}
  if(kind==='asteroid'){const length=view.asteroids[0].vel.length;view.asteroids[0].vel.length=function(){mutate();return length.call(this);};view.asteroids.push({hp:100,pos:new api.Vector2(1200,0),vel:new api.Vector2(),radius:50});}
  if(kind==='observer-method'){const get=ship.getMotionStats;ship.getMotionStats=function(){trace.push('observer-read');return get.call(this);};}
  if(kind==='observer-vector'){const get=ship.pos.distanceTo;ship.pos.distanceTo=function(v){mutate();return get.call(this,v);};}
  let result;try{result=api.forwardPathClear(ship,view,200,5);}catch(error){result={error:error.message};}
  return{result,trace,speedBonus:ship.fleetSpeedBonusPercent};
 }
 for(const kind of['phase','install','throws','nested','parent','unknown','runtime','record','vector','asteroid','observer-method','observer-vector']){const before=run(aApi,kind),after=run(bApi,kind);assert.deepEqual(after,before,kind);if(kind!=='runtime')assert.ok(before.trace.length>0,kind+' exercise hook');rows.push({kind,...after});}
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

test('one pre-registered ABBA: 150 warmup + 120 measured steps, 3% total-step gate per pair',async()=>{
 assert.equal(passed,4,'do not time invalid candidate');const rows=[];
 for(const[index,enabled]of[false,true,true,false].entries()){
  const loaded=await load(enabled,'bench-'+index),engine=world(loaded);
  for(let tick=0;tick<150;tick++)engine.fixedUpdate(1/60);
  const started=performance.now();for(let tick=0;tick<120;tick++)engine.fixedUpdate(1/60);const elapsedMs=performance.now()-started;
  rows.push({index,enabled,steps:120,elapsedMs,perStepMs:elapsedMs/120,stateSha256:sha(JSON.stringify(witness(loaded,engine,270)))});
  fs.writeFileSync(path.join(out,'abba.json'),JSON.stringify({scope:'Node original host init + synchronous fixedUpdate, NOT browser timing',rows},null,2));
 }
 assert.ok(rows.every(row=>row.stateSha256===rows[0].stateSha256));
 const gains=[1-rows[1].elapsedMs/rows[0].elapsedMs,1-rows[2].elapsedMs/rows[3].elapsedMs],pass=gains.every(g=>g>=.03);
 fs.writeFileSync(path.join(out,'abba.json'),JSON.stringify({scope:'Node original host init + synchronous fixedUpdate, NOT browser timing',rows,gains,passesPrescribedGate:pass},null,2));
 console.log(JSON.stringify({gains,passesPrescribedGate:pass}));
});


