import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {test as nodeTest} from 'node:test';
import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
const out=path.resolve(process.env.EXACT_NAV_OUT??('artifacts/lan-exact-navigation-20260927/check-'+Date.now()));
fs.mkdirSync(out,{recursive:true});
const sha=value=>createHash('sha256').update(value).digest('hex');
const frozen=process.env.EXACT_NAV_FROZEN??path.resolve('artifacts/lan-exact-navigation-20260927/candidate-browser.json');
const snapshot=JSON.parse(fs.readFileSync(frozen)),sources=new Map(snapshot.files.map(row=>{
 assert.equal(sha(row.code),row.sha256);return [path.resolve(row.file).toLowerCase(),row];
}));
let passed=0;
const test=(name,body)=>nodeTest(name,async()=>{await body();passed++;});
const contents=`
export {handleMessage,testEngine} from './src/network/host.worker';
export {Ship} from './src/engine/simulation/Ship';
export {ShipSystem} from './src/engine/simulation/ShipSystem';
export {forwardPathClear,avoidCollisions,contractObstacles} from './src/engine/ai/TacticalNavigation';
export {NavigationObstacleIndex} from './src/engine/ai/NavigationObstacleIndex';
export {WeaponThreatEnvelope} from './src/engine/ai/WeaponThreatEnvelope';
export {Vector2} from './src/engine/math/Vector2';
export {captureCombat} from './src/network/AuthorityCombatSnapshot';
`;
const baselineFiles=JSON.parse(fs.readFileSync(path.resolve('artifacts/lan-exact-navigation-20260927/before.json'))).map(r=>r.file);
const baseline=new Map(baselineFiles.map(file=>[file,fs.readFileSync(path.resolve('artifacts/lan-exact-navigation-20260927/before',file),'utf8')]));
const code={};
for(const enabled of [false,true,'default']){
 const result=await build({stdin:{contents,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',
  define:{__LAN_BUILD_ID__:JSON.stringify('exact-navigation-contract'),'import.meta.env':JSON.stringify({BASE_URL:'/',DEV:true,PROD:false,MODE:'development',SSR:false,VITE_AI_EXACT_AUTHORED_THREATS:'true',VITE_LAN_OWNED_MOTION_READS:'true',VITE_LAN_EARLY_PREAIM_RANGE:'true',...(enabled==='default'?{}:{VITE_AI_EXACT_NAVIGATION:String(enabled)})})},
  plugins:[{name:'same-frozen-source',setup(build){build.onLoad({filter:/\.(?:[cm]?[jt]sx?|json)$/},args=>{const row=sources.get(args.path.toLowerCase());if(row)return{contents:(!enabled&&baseline.has(row.file)?baseline.get(row.file):row.code)+(row.file==='src/network/host.worker.ts'?'\nexport {handleMessage}; export function testEngine(){ return engine; }':'')+(row.file==='src/engine/ai/TacticalNavigation.ts'?'\nexport {obstacles as contractObstacles};':''),loader:path.extname(row.file).slice(1).replace(/^[cm]([jt]s)$/, '$1')};if(args.path.startsWith(path.resolve('src')+path.sep))throw Error('Unfrozen source: '+args.path);});}}]});
 code[String(enabled)]=result.outputFiles[0].text;
}
fs.writeFileSync(path.join(out,'build-manifest.json'),JSON.stringify({frozen,sourceSha256:sha(fs.readFileSync(frozen)),beforeBundle:sha(code.false),afterBundle:sha(code.true)},null,2));
async function load(enabled,name,instrument=false){globalThis.self={postMessage(){}};const file=path.join(out,name+'.mjs');let bytes=code[String(enabled)];if(instrument){const scan='for (const other of candidates ?? world.ships) {';assert.equal(bytes.split(scan).length,2);bytes=bytes.replace(scan,scan+' globalThis.__obstacleVisits = (globalThis.__obstacleVisits ?? 0) + 1;');const marker='function shipMotionStats(ship, excludedSystemSpeedFlat = 0) {';assert.equal(bytes.split(marker).length,2);bytes=bytes.replace(marker,marker+' globalThis.__fullMotionQueries = (globalThis.__fullMotionQueries ?? 0) + 1;');}fs.writeFileSync(file,bytes);return import(pathToFileURL(file).href);}
const hulls=['web_zhuyuan','web_gloriana','web_sc2_hyperion'],ai=Array.from({length:20},(_,i)=>hulls[i%3]);
const match={id:'authored-query-check',hostId:'host',seed:917,snapshotHz:60,players:[{id:'host',name:'Host',seat:0,team:0,hull:hulls[0]},{id:'guest',name:'Guest',seat:1,team:1,hull:hulls[0]}],options:{assignment:'teams',battleSize:3200,deploymentLimit:1600,aiHulls:[ai.slice(0,10),ai.slice(10)]}};
function world(api){const messages=[];globalThis.self={postMessage(m){messages.push(m);}};api.handleMessage(structuredClone({type:'init',match}));assert.ok(messages.some(m=>m.type==='ready'),JSON.stringify(messages.filter(m=>m.type==='error')));assert.ok(messages.some(m=>m.type==='snapshot'&&m.tick===0));assert.ok(!messages.some(m=>m.type==='error'));const engine=api.testEngine();assert.equal(engine.ships.length,176);return engine;}
function hidden(engine){return {random:engine.random.checkpointWitness(),visualRandom:engine.visualRandom.checkpointWitness(),ships:engine.ships.map(ship=>({id:ship.id,random:ship.random.checkpointWitness(),controlRandom:ship.weaponControl.random.checkpointWitness(),trackers:ship.weapons.map(mount=>{const t=ship.weaponControl.autofire.trackers.get(mount);return [mount.slotId,t?{target:t.target&&[t.target.kind,t.target.entity.id],scanIn:t.scanIn,firingTime:t.firingTime,idleFireTime:t.idleFireTime,ammoAllowed:t.ammoAllowed,random:t.random.checkpointWitness()}:null];})}))};}
function witness(api,engine,tick){return{combat:api.captureCombat(engine,tick,{},0),hidden:hidden(engine)};}


function scene(engine,api){return{ships:engine.ships,projectiles:[],beams:[],asteroids:[{hp:100,pos:new api.Vector2(300,500),vel:new api.Vector2(30,-50),radius:55},{hp:100,pos:new api.Vector2(-300,-500),vel:new api.Vector2(-60,80),radius:100}]};}

function bind(api,view,observer){const envelope=api.WeaponThreatEnvelope.forExactPhase(view.ships);const index=api.NavigationObstacleIndex.forExactPhase?.(view.ships,envelope);index?.bindExactWorld(view,observer);return{index,envelope};}
test('host init/reinit/default and owned root phase actually bind, trim scans and close',async()=>{
 const rows=[];
 for(const enabled of[false,true,'default']){const api=await load(enabled,'probe-'+enabled,true);
  for(let attempt=0;attempt<2;attempt++){const engine=world(api),view=scene(engine,api),ship=engine.playerShip;const owned=bind(api,view,ship);globalThis.__fullMotionQueries=0;globalThis.__obstacleVisits=0;const clear=api.forwardPathClear(ship,view,200,3);const sample={enabled,attempt,clear,mounts:engine.ships.reduce((n,s)=>n+s.weapons.length,0),fullMotion:globalThis.__fullMotionQueries,visits:globalThis.__obstacleVisits};owned.index?.close();owned.envelope?.close();assert.equal(sample.mounts,734);rows.push(sample);}
  let creates=0,selects=0;const indices=[];const factory=api.NavigationObstacleIndex.forExactPhase,select=api.NavigationObstacleIndex.prototype.select;
  if(factory)api.NavigationObstacleIndex.forExactPhase=function(...args){const index=factory.apply(this,args);if(index){creates++;indices.push(index);}return index;};
  api.NavigationObstacleIndex.prototype.select=function(...args){selects++;return select.apply(this,args);};const engine=world(api);engine.fixedUpdate(1/60);assert.equal(creates,enabled===true?1:0);if(enabled===true)assert.ok(selects>0);else assert.equal(selects,0);assert.ok(indices.every(i=>i.exactShips===undefined));rows.push({enabled,automaticPhaseCreates:creates,selects,closed:indices.every(i=>i.exactShips===undefined)});
 }
 const probes=rows.filter(r=>r.attempt===0);assert.ok(probes.every(r=>r.clear===probes[0].clear));assert.ok(probes[1].visits<probes[0].visits);assert.ok(probes[1].fullMotion<probes[0].fullMotion);assert.equal(probes[2].visits,probes[0].visits);assert.equal(probes[2].fullMotion,probes[0].fullMotion);fs.writeFileSync(path.join(out,'init-default-probe.json'),JSON.stringify(rows,null,2));
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
  const query=(api,engine)=>{const view=scene(engine,api);const owned=bind(api,view,engine.playerShip);const result=engine.combatShips.map(ship=>(owned.index?.bindExactWorld(view,ship),{obstacles:api.contractObstacles(ship,view,3),id:ship.id,clear:[0,3,NaN,Infinity,-1].map(h=>api.forwardPathClear(ship,view,200,h)),avoid:(()=>{const desired=new api.Vector2(70,20),value=api.avoidCollisions(ship,desired,view);assert.equal(Object.getPrototypeOf(value.velocity),api.Vector2.prototype);return{velocity:[value.velocity.x,value.velocity.y],avoiding:value.avoiding,risk:value.risk,borrowedDesired:value.velocity===desired};})()}));owned.index?.close();owned.envelope?.close();return result;};
  const left=query(aApi,a),right=query(bApi,b);assert.deepEqual(right,left,'navigation '+scenario);rows.push({scenario,ships:left.length,hash:sha(JSON.stringify(right))});
 }
 fs.writeFileSync(path.join(out,'navigation-comparison.json'),JSON.stringify(rows,null,2));
});


test('exact ownership, conservative invalidation and family notification never outlive the phase',async()=>{
 const api=await load(true,'lifecycle'),engine=world(api),ships=engine.ships,observer=engine.playerShip,view={ships,asteroids:[],projectiles:[],beams:[]};
 const envelope=api.WeaponThreatEnvelope.forExactPhase(ships);assert.ok(envelope);assert.equal(api.NavigationObstacleIndex.forExactPhase([...ships],envelope),undefined);
 const index=api.NavigationObstacleIndex.forExactPhase(ships,envelope);assert.ok(index);index.bindExactWorld(view,observer);assert.equal(api.NavigationObstacleIndex.forExactWorld(view,observer),index);assert.equal(api.NavigationObstacleIndex.forExactWorld({...view},observer),undefined);assert.equal(api.NavigationObstacleIndex.forExactWorld(view,engine.enemyShip),undefined);
 const get=()=>index.select(ships,observer.pos.x,observer.pos.y,100,observer.getMotionStats().maxSpeed,observer.vel.length(),3);get();
 const parent=ships.find(s=>s.childModules.length>0),child=parent.childModules[0],affected=[];child.shield.radius=1e6;child.vel.x=1e5;envelope.invalidate(parent,s=>{affected.push(s);index.invalidate(s);});assert.ok(affected.includes(child));assert.ok(affected.includes(parent));assert.ok(index.radius>=1e6);assert.ok(index.speed>=1e5);const bound=index.radius;child.shield.radius=1;index.invalidate(child);assert.equal(index.radius,bound);
 view.ships=[...ships];assert.equal(api.NavigationObstacleIndex.forExactWorld(view,observer),undefined);view.ships=ships;ships.push(ships[0]);assert.equal(api.NavigationObstacleIndex.forExactWorld(view,observer),undefined);ships.pop();
 child.pos.x+=1;envelope.invalidate(parent,s=>index.invalidate(s));assert.equal(index.exactShips,undefined);assert.equal(api.NavigationObstacleIndex.forExactWorld(view,observer),undefined);
 const second=api.NavigationObstacleIndex.forExactPhase(ships,envelope);second.bindExactWorld(view,observer);envelope.close();assert.equal(second.select(ships,0,0,100,100,0,3),undefined);assert.equal(api.NavigationObstacleIndex.forExactWorld(view,observer),undefined);
 const unknownWorld=world(api),unknownShips=unknownWorld.ships;unknownShips[2].system.definition={...unknownShips[2].system.definition};assert.equal(api.WeaponThreatEnvelope.forExactPhase(unknownShips),undefined);
 const thrownEngine=world(api),created=[];const factory=api.NavigationObstacleIndex.forExactPhase,select=api.NavigationObstacleIndex.prototype.select;api.NavigationObstacleIndex.forExactPhase=function(...args){const result=factory.apply(this,args);if(result)created.push(result);return result;};api.NavigationObstacleIndex.prototype.select=function(){throw Error('index contract throw');};assert.throws(()=>thrownEngine.fixedUpdate(1/60),/index contract throw/);assert.ok(created.length>0);assert.ok(created.every(i=>i.exactShips===undefined));api.NavigationObstacleIndex.prototype.select=select;
 fs.writeFileSync(path.join(out,'lifecycle.json'),JSON.stringify({family:affected.map(s=>s.id),exceptionClosed:true,rosterIdentity:true,unknownDefinitionRejected:true},null,2));
});
test('unbound callback boundaries retain mutation, exceptions and nested scan order',async()=>{
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


test('unbound world accessors are not inspected by the private binding lookup',async()=>{
 const rows=[];for(const enabled of[false,true,'default']){const api=await load(enabled,'accessors-'+enabled),engine=world(api),view=scene(engine,api),trace=[];for(const name of['ships','navigationObstacleIndex','noteNavigationObstacle']){const value=view[name];Object.defineProperty(view,name,{get(){trace.push(name);return value;},configurable:true});}const clear=api.forwardPathClear(engine.playerShip,view,200,3);rows.push({clear,trace});}assert.deepEqual(rows[1],rows[0]);assert.deepEqual(rows[2],rows[0]);fs.writeFileSync(path.join(out,'world-accessors.json'),JSON.stringify(rows,null,2));
});
test('one isolated-process ABBA: 150 warmup + 120 full steps, 3% gate in each pair',async()=>{
 assert.equal(passed,6,'do not time invalid candidate');const rows=[];
 for(const[index,enabled]of[false,true,true,false].entries()){
  const bundle=path.join(out,'bench-'+index+'.mjs'),runner=path.join(out,'bench-'+index+'-runner.mjs');fs.writeFileSync(bundle,code[String(enabled)],{flag:'wx'});
  const body=`import fs from 'node:fs';import assert from 'node:assert/strict';import{createHash}from'node:crypto';\nglobalThis.self={postMessage(){}};const api=await import(${JSON.stringify(pathToFileURL(bundle).href)});\nconst match=${JSON.stringify(match)};const sha=${sha.toString()};\n${world.toString()}\n${hidden.toString()}\n${witness.toString()}\nconst engine=world(api);for(let tick=0;tick<150;tick++)engine.fixedUpdate(1/60);const heapBefore=process.memoryUsage().heapUsed;const started=performance.now();for(let tick=0;tick<120;tick++)engine.fixedUpdate(1/60);const elapsedMs=performance.now()-started;console.log(JSON.stringify({elapsedMs,perStepMs:elapsedMs/120,heapBefore,heapAfter:process.memoryUsage().heapUsed,entities:engine.ships.length,stateSha256:sha(JSON.stringify(witness(api,engine,270)))}));`;
  fs.writeFileSync(runner,body,{flag:'wx'});const run=spawnSync(process.execPath,[runner],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});fs.writeFileSync(path.join(out,'bench-'+index+'.stdout.log'),run.stdout??'',{flag:'wx'});fs.writeFileSync(path.join(out,'bench-'+index+'.stderr.log'),run.stderr??'',{flag:'wx'});assert.equal(run.status,0,(run.stderr??'').slice(0,1000));const result=JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));rows.push({index,enabled,steps:120,...result});
  fs.writeFileSync(path.join(out,'abba.json'),JSON.stringify({scope:'Sequential isolated Node processes; original host init and fixedUpdate, NOT browser timing',rows},null,2));
 }
 assert.ok(rows.every(r=>r.entities===rows[0].entities));assert.ok(rows.every(r=>r.stateSha256===rows[0].stateSha256));const gains=[1-rows[1].elapsedMs/rows[0].elapsedMs,1-rows[2].elapsedMs/rows[3].elapsedMs],pass=gains.every(g=>g>=.03);
 fs.writeFileSync(path.join(out,'abba.json'),JSON.stringify({scope:'Sequential isolated Node processes; 150 warmup + 120 measured steps per arm; excludes spawn/import/warmup/final witness',rows,gains,passesPrescribedGate:pass},null,2));console.log(JSON.stringify({gains,passesPrescribedGate:pass}));
});
