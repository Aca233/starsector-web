import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {test as nodeTest} from 'node:test';
import {build} from 'esbuild';
const out=path.resolve(process.env.EARLY_PREAIM_OUT??('artifacts/lan-early-preaim-range-20260927/check-'+Date.now()));
fs.mkdirSync(out,{recursive:true});
const sha=value=>createHash('sha256').update(value).digest('hex');
const frozen=process.env.EARLY_PREAIM_FROZEN??path.resolve('artifacts/lan-early-preaim-range-20260927/candidate-browser.json');
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
const baselineFiles=JSON.parse(fs.readFileSync(path.resolve('artifacts/lan-early-preaim-range-20260927/before.json'))).map(r=>r.file);
const baseline=new Map(baselineFiles.map(file=>[file,fs.readFileSync(path.resolve('artifacts/lan-early-preaim-range-20260927/before',file),'utf8')]));
const code={};
for(const enabled of [false,true,'default']){
 const result=await build({stdin:{contents,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',
  define:{__LAN_BUILD_ID__:JSON.stringify('early-preaim-contract'),'import.meta.env':JSON.stringify({BASE_URL:'/',DEV:true,PROD:false,MODE:'development',SSR:false,VITE_AI_EXACT_AUTHORED_THREATS:'true',VITE_LAN_OWNED_MOTION_READS:'true',...(enabled==='default'?{}:{VITE_LAN_EARLY_PREAIM_RANGE:String(enabled)})})},
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


function visibleWorld(engine){for(const s of engine.ships){s.visibilityMask=0x7fffffff;s.visibilityOverflow='*';}return{ships:engine.ships,missiles:[],asteroids:[]};}
function points(engine,world){return engine.ships.map(ship=>ship.weapons.map(mount=>{const p=ship.weaponControl.autofire.preAim(ship,mount,world);return p?[p.x,p.y]:null;}));}
function collisionReads(api,engine){const desc=Object.getOwnPropertyDescriptor(api.Ship.prototype,'isCollisionless');let calls=0;Object.defineProperty(api.Ship.prototype,'isCollisionless',{...desc,get(){calls++;return desc.get.call(this);}});let result;try{result=points(engine,visibleWorld(engine));}finally{Object.defineProperty(api.Ship.prototype,'isCollisionless',desc);}return{calls,result};}

test('real host init/reinit, default off, and fewer far-target collision reads without dropping entities',async()=>{
 const rows=[];for(const enabled of[false,true,'default']){const api=await load(enabled,'init-'+enabled);for(let epoch=0;epoch<2;epoch++){
  const engine=world(api);for(const s of engine.ships){s.pos.x=s.teamId===0?-1e6:1e6;s.vel.set(0,0);}
  const {calls,result}=collisionReads(api,engine);rows.push({enabled,epoch,calls,pointsHash:sha(JSON.stringify(result)),ships:engine.ships.length,mounts:engine.ships.reduce((n,s)=>n+s.weapons.length,0)});
 }}
 assert.equal(rows[0].calls,rows[1].calls);assert.ok(rows[2].calls<rows[0].calls);assert.equal(rows[2].calls,rows[3].calls);assert.equal(rows[4].calls,rows[0].calls);assert.equal(rows[5].calls,rows[0].calls);assert.ok(rows.every(r=>r.pointsHash===rows[0].pointsHash));fs.writeFileSync(path.join(out,'init-default-probe.json'),JSON.stringify(rows,null,2));
});

test('all authored mounts preserve preaim across distances, shields, motion, target priority and nonfinite inputs',async()=>{
 const aApi=await load(false,'aim-reference'),bApi=await load(true,'aim-candidate'),a=world(aApi),b=world(bApi);const rows=[];
 for(let scenario=0;scenario<8;scenario++){
  for(const engine of[a,b])for(const[i,s]of engine.ships.entries()){
   s.pos.set((s.teamId===0?-1:1)*(scenario===0?1e6:scenario===1?3000:350),(i%6)*125);
   s.vel.set(scenario===2?(s.teamId===0?2000:-2000):0,scenario===3?1500:0);
   if(scenario===3){s.shield.isActive=true;s.shield.radius=s.spec.collisionRadius*2;s.shield.currentArcDeg=1;}
   if(scenario===4){s.isDocked=i%3===0;s.isRetreated=i%7===0;}
   if(scenario===5){s.isDocked=false;s.isRetreated=false;for(const system of s.systems){system.isActive=true;system.state='ACTIVE';}}
   if(scenario===6){s.pos.x=i%5===0?Infinity:i%7===0?NaN:s.pos.x;s.vel.y=i%11===0?NaN:0;}
   if(scenario===7){s.pos.set(s.teamId===0?-400:400,0);s.vel.set(-0,0);s.currentTargetShip=engine.ships.find(o=>o.teamId!==s.teamId)??null;}
  }
  const left=points(a,visibleWorld(a)),right=points(b,visibleWorld(b));assert.deepEqual(right,left,'preaim scenario '+scenario);rows.push({scenario,mounts:left.flat().length,hash:sha(JSON.stringify(right))});
 }
 fs.writeFileSync(path.join(out,'preaim-comparison.json'),JSON.stringify(rows,null,2));
});

test('unknown isExecuting, parent/phase callbacks, runtime effects and shield override retain fallback order and throws',async()=>{
 const aApi=await load(false,'fallback-reference'),bApi=await load(true,'fallback-candidate'),rows=[];
 function run(api,kind){const engine=world(api),shooter=engine.playerShip,other=kind==='parent'?engine.ships.find(s=>s.parentShip&&s.teamId!==shooter.teamId):engine.ships.find(s=>s.teamId!==shooter.teamId&&!s.parentShip);const trace=[];
  const mount=shooter.weapons.find(m=>m.mountType!=='HARDPOINT');assert.ok(mount);shooter.pos.set(-1e6,0);shooter.vel.set(0,0);other.pos.set(1e6,0);other.vel.set(0,0);other.visibilityMask=0x7fffffff;other.isDocked=false;other.isRetreated=false;shooter.currentTargetShip=null;
  if(kind==='unknown'||kind==='throws'){const system=other.system;system.isActive=false;system.definition={...system.definition,isExecuting(){trace.push('execute');if(kind==='throws')throw Error('phase callback');other.pos.x-=37;return false;}};}
  if(kind==='phase'||kind==='parent'){const target=kind==='parent'?other.parentShip:other;target.externalPhaseEffects.set('contract',()=>{trace.push(kind);other.pos.y+=11;return undefined;});}
  if(kind==='runtime')other.runtimeModifiers.set('contract',{collisionDisabled:1});
  if(kind==='shield'){const get=other.getShieldCenter;other.getShieldCenter=function(){trace.push('shield');return get.call(this);};other.shield.isActive=true;}
  let result;try{const p=shooter.weaponControl.autofire.preAim(shooter,mount,{ships:[shooter,other],missiles:[],asteroids:[]});result=p?[p.x,p.y]:null;}catch(error){result={error:error.message};}
  return{trace,result,position:[other.pos.x,other.pos.y]};
 }
 for(const kind of['unknown','throws','phase','parent','runtime','shield']){const before=run(aApi,kind),after=run(bApi,kind);assert.deepEqual(after,before,kind);if(['unknown','throws','phase','parent'].includes(kind))assert.ok(before.trace.length>0,kind+' must exercise callback');rows.push({kind,...after});}
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


