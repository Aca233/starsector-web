import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {test as nodeTest} from 'node:test';
import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
const out=path.resolve(process.env.THREAT_PACKET_OUT??('artifacts/lan-threat-range-packet-20260927/check-'+Date.now()));
fs.mkdirSync(out,{recursive:true});
const sha=value=>createHash('sha256').update(value).digest('hex');
const frozen=process.env.THREAT_PACKET_FROZEN??path.resolve('artifacts/lan-threat-range-packet-20260927/candidate-browser.json');
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
export {combatWeaponRange,combatWeaponRangeWithModifiers} from './src/engine/simulation/WeaponRange';
export {Vector2} from './src/engine/math/Vector2';
export {captureCombat} from './src/network/AuthorityCombatSnapshot';
`;
const baselineFiles=JSON.parse(fs.readFileSync(path.resolve('artifacts/lan-threat-range-packet-20260927/before.json'))).map(r=>r.file);
const baseline=new Map(baselineFiles.map(file=>[file,fs.readFileSync(path.resolve('artifacts/lan-threat-range-packet-20260927/before',file),'utf8')]));
const code={};
for(const enabled of [false,true,'default']){
 const result=await build({stdin:{contents,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',
  define:{__LAN_BUILD_ID__:JSON.stringify('threat-range-packet-contract'),'import.meta.env':JSON.stringify({BASE_URL:'/',DEV:true,PROD:false,MODE:'development',SSR:false,VITE_AI_EXACT_AUTHORED_THREATS:'true',VITE_LAN_OWNED_MOTION_READS:'true',VITE_LAN_EARLY_PREAIM_RANGE:'true',...(enabled==='default'?{}:{VITE_LAN_THREAT_RANGE_PACKET:String(enabled)})})},
  plugins:[{name:'same-frozen-source',setup(build){build.onLoad({filter:/\.(?:[cm]?[jt]sx?|json)$/},args=>{const row=sources.get(args.path.toLowerCase());if(row)return{contents:(!enabled&&baseline.has(row.file)?baseline.get(row.file):row.code)+(!enabled&&row.file==='src/engine/simulation/WeaponRange.ts'?'\nexport function combatWeaponRangeWithModifiers(ship: Ship, weapon: WeaponSpec){ return combatWeaponRange(ship,weapon); }':'')+(row.file==='src/network/host.worker.ts'?'\nexport {handleMessage}; export function testEngine(){ return engine; }':''),loader:path.extname(row.file).slice(1).replace(/^[cm]([jt]s)$/, '$1')};if(args.path.startsWith(path.resolve('src')+path.sep))throw Error('Unfrozen source: '+args.path);});}}]});
 code[String(enabled)]=result.outputFiles[0].text;
}
fs.writeFileSync(path.join(out,'build-manifest.json'),JSON.stringify({frozen,sourceSha256:sha(fs.readFileSync(frozen)),beforeBundle:sha(code.false),afterBundle:sha(code.true)},null,2));
async function load(enabled,name,instrument=false){globalThis.self={postMessage(){}};const file=path.join(out,name+'.mjs');let bytes=code[String(enabled)];if(instrument){const marker='getWeaponRangePercent(weaponType) {';assert.equal(bytes.split(marker).length,2);bytes=bytes.replace(marker,marker+' globalThis.__rangeReads = (globalThis.__rangeReads ?? 0) + 1;');const packet='rangeModifiers = enemy.system.readNativeThreatRangeModifiers();';if(enabled){assert.equal(bytes.split(packet).length,2);bytes=bytes.replace(packet,packet+' if(rangeModifiers)globalThis.__rangePackets = (globalThis.__rangePackets ?? 0) + 1;');}}fs.writeFileSync(file,bytes);return import(pathToFileURL(file).href);}
const hulls=['web_zhuyuan','web_gloriana','web_sc2_hyperion'],ai=Array.from({length:20},(_,i)=>hulls[i%3]);
const match={id:'authored-query-check',hostId:'host',seed:917,snapshotHz:60,players:[{id:'host',name:'Host',seat:0,team:0,hull:hulls[0]},{id:'guest',name:'Guest',seat:1,team:1,hull:hulls[0]}],options:{assignment:'teams',battleSize:3200,deploymentLimit:1600,aiHulls:[ai.slice(0,10),ai.slice(10)]}};
function world(api){const messages=[];globalThis.self={postMessage(m){messages.push(m);}};api.handleMessage(structuredClone({type:'init',match}));assert.ok(messages.some(m=>m.type==='ready'),JSON.stringify(messages.filter(m=>m.type==='error')));assert.ok(messages.some(m=>m.type==='snapshot'&&m.tick===0));assert.ok(!messages.some(m=>m.type==='error'));const engine=api.testEngine();assert.equal(engine.ships.length,176);return engine;}
function hidden(engine){return {random:engine.random.checkpointWitness(),visualRandom:engine.visualRandom.checkpointWitness(),ships:engine.ships.map(ship=>({id:ship.id,random:ship.random.checkpointWitness(),controlRandom:ship.weaponControl.random.checkpointWitness(),trackers:ship.weapons.map(mount=>{const t=ship.weaponControl.autofire.trackers.get(mount);return [mount.slotId,t?{target:t.target&&[t.target.kind,t.target.entity.id],scanIn:t.scanIn,firingTime:t.firingTime,idleFireTime:t.idleFireTime,ammoAllowed:t.ammoAllowed,random:t.random.checkpointWitness()}:null];})}))};}
function witness(api,engine,tick){return{combat:api.captureCombat(engine,tick,{},0),hidden:hidden(engine)};}





function scene(engine){return{ships:engine.ships,projectiles:engine.projectiles,beams:engine.beams,asteroids:engine.asteroids};}
test('host init/reinit/default preserves real workload and actually shares short-lived range packets',async()=>{
 const rows=[];for(const enabled of[false,true,'default']){const api=await load(enabled,'init-'+enabled,true);for(let attempt=0;attempt<2;attempt++){const engine=world(api),observer=engine.combatShips.find(s=>s.parentShip);assert.equal(engine.ships.reduce((n,s)=>n+s.weapons.length,0),734);globalThis.__rangeReads=0;globalThis.__rangePackets=0;const result=api.assessThreats(observer,scene(engine),8,1);const reads=globalThis.__rangeReads,packets=globalThis.__rangePackets;globalThis.__rangePackets=0;engine.fixedUpdate(1/60);const automaticPackets=globalThis.__rangePackets;rows.push({enabled,attempt,result,reads,packets,automaticPackets});}}
 for(const row of rows)assert.deepEqual(row.result,rows[0].result);assert.ok(rows[2].packets>0);assert.ok(rows[2].reads<rows[0].reads);assert.ok(rows[2].automaticPackets>0);assert.equal(rows[4].packets,0);assert.equal(rows[4].automaticPackets,0);assert.equal(rows[4].reads,rows[0].reads);fs.writeFileSync(path.join(out,'init-default-probe.json'),JSON.stringify(rows.map(({result,...r})=>({...r,resultHash:sha(JSON.stringify(result))})),null,2));
});
test('prepared range keeps per-mount math live and rejects unknown composition readers before invoking them',async()=>{
 const aa=await load(false,'range-before'),ba=await load(true,'range-after'),a=world(aa),b=world(ba);let comparisons=0;const rows=[];
 for(let state=0;state<8;state++){for(const engine of[a,b])for(const[i,s]of engine.ships.entries()){
   s.ecmRangePenalty=state===5?NaN:state===6?-0:state===7?Infinity:i%5*state;
   for(const system of s.allSystems){system.isActive=state!==0;system.state=state===2?'IN':state===3?'OUT':'ACTIVE';system.effectLevel=state/7;system.activationInput={point:new (engine===a?aa:ba).Vector2(s.pos.x+500,s.pos.y+700),origin:s.pos.clone(),velocity:s.vel.clone(),facing:s.facingRad,target:null};}
   for(const m of s.weapons){m.spec.range=state===6?-0:state===7?Infinity:800+state*37;m.spec.aiHints=state%2?['PD']:[];}
  }
  const query=(api,engine)=>engine.ships.map(s=>{const packet=s.system.readNativeThreatRangeModifiers?.();return s.weapons.map(m=>packet?api.combatWeaponRangeWithModifiers(s,m.spec,packet):api.combatWeaponRange(s,m.spec));});const left=query(aa,a),right=query(ba,b);assert.deepEqual(right,left,'range '+state);comparisons+=left.reduce((n,v)=>n+v.length,0);rows.push({state,hash:sha(JSON.stringify(right))});
 }
 const fallbacks=[];for(const kind of['unknown','aux','parent','runtime','parent-runtime','method','accessor','available','parent-roster']){const engine=world(ba),s=kind.startsWith('parent')?engine.combatShips.find(s=>s.parentShip):engine.playerShip;let calls=0;const custom=sys=>{sys.definition={...sys.definition,modifiers(){calls++;return{};},passiveModifiers(){calls++;return{};}};};if(kind==='unknown')custom(s.system);if(kind==='aux')custom(s.system.auxiliary);if(kind==='parent')custom(s.parentShip.system);if(kind==='runtime')s.runtimeModifiers.set('test',{speedPercent:1});if(kind==='parent-runtime')s.parentShip.runtimeModifiers.set('test',{speedPercent:1});if(kind==='method')s.system.modifiers=()=>{calls++;return{};};if(kind==='accessor')Object.defineProperty(s.system,'getWeaponRangePercent',{get(){calls++;return()=>0;}});if(kind==='available')Object.defineProperty(s.system,'available',{get(){calls++;return true;}});if(kind==='parent-roster')Object.defineProperty(s.parentShip,'allSystems',{get(){calls++;return[];}});assert.equal(s.system.readNativeThreatRangeModifiers(),undefined,kind);assert.equal(calls,0,kind);fallbacks.push(kind);}
 fs.writeFileSync(path.join(out,'prepared-range.json'),JSON.stringify({comparisons,rows,fallbacks},null,2));
});
test('eight threat scenarios preserve every threat, ETA, direction and shield decision input',async()=>{
 const aa=await load(false,'threat-before'),ba=await load(true,'threat-after'),a=world(aa),b=world(ba),rows=[];
 for(let scenario=0;scenario<8;scenario++){for(const engine of[a,b])for(const[i,s]of engine.ships.entries()){
   s.pos.set(s.teamId===0?-500:500,(i%7)*160);s.vel.set(i%3*30,scenario===3?300:0);s.facingRad=i*.1;
   if(scenario===0)s.pos.x*=100;
   if(scenario===1){s.shield.isActive=true;s.shield.radius=s.spec.collisionRadius*2;}
   if(scenario===2){s.flux.isVenting=i%3===0;s.flux.softFlux=s.flux.maxFlux*.5;}
   if(scenario===3){s.flux.isVenting=false;s.flux.isOverloaded=i%4===0;s.flux.overloadTimer=2;}
   if(scenario===4){s.flux.isOverloaded=false;for(const system of s.allSystems){system.isActive=true;system.state='ACTIVE';system.effectLevel=.7;}}
   if(scenario===5){for(const system of s.allSystems){system.isActive=false;system.state='COOLDOWN';}for(const[j,m]of s.weapons.entries()){m.ammo=j%2?0:Infinity;m.isDisabled=j%3===0;}}
   if(scenario===6){s.pos.x=i%13===0?NaN:s.pos.x;s.vel.y=i%11===0?Infinity:0;}
   if(scenario===7){s.vel.set(-0,0);s.runtimeModifiers.set('test',{weapons:{BALLISTIC:{rangePercent:40}}});}
  }
  const query=(api,engine)=>engine.combatShips.map(s=>api.assessThreats(s,scene(engine),scenario===6?Infinity:8,1));const left=query(aa,a),right=query(ba,b);assert.deepEqual(right,left,'threat '+scenario);rows.push({scenario,observers:left.length,hash:sha(JSON.stringify(right))});
 }
 fs.writeFileSync(path.join(out,'threat-comparison.json'),JSON.stringify(rows,null,2));
});
test('first shield callback ends sharing: stat mutation, metadata, ECM, throws and nested assessments retain order',async()=>{
 const aa=await load(false,'callbacks-before'),ba=await load(true,'callbacks-after'),rows=[];
 function run(api,kind){const engine=world(api),observer=engine.playerShip,enemy=engine.capitalShips.find(s=>s.teamId!==observer.teamId&&s.weapons.length>=4);const view={ships:[observer,enemy],projectiles:[],beams:[],asteroids:[]},trace=[];observer.pos.set(200,0);enemy.pos.set(0,0);observer.vel.set(0,0);enemy.vel.set(0,0);enemy.facingRad=0;let n=0,nested=false;
  for(const m of enemy.weapons){m.ammo=Infinity;m.isDisabled=false;m.cooldownTimer=0;m.currentAngleRad=0;Object.assign(m.spec,{damagePerSecond:100,damagePerShot:100,range:1200,isBeam:true,isGuided:true,alwaysFire:true,refireDelay:1});}
  if(kind==='phase-before')enemy.externalPhaseEffects.set('edge',()=>{trace.push('phase');enemy.ecmRangePenalty=35;return undefined;});
  if(kind==='motion-before'){const get=enemy.getMotionStats;enemy.getMotionStats=function(){trace.push('motion');const value=get.call(this);enemy.runtimeModifiers.set('edge',{weapons:{ENERGY:{rangePercent:70}}});return value;};}
  observer.shield.externalDamageTakenMultiplier=()=>{trace.push('shield-'+(++n));if(kind==='stat'){enemy.system.getWeaponRangePercent=()=>{trace.push('range');return 20+n;};}if(kind==='accessor')Object.defineProperty(enemy.system,'getWeaponRangePercent',{configurable:true,get(){trace.push('range-access');return()=>{trace.push('range');return 30+n;};}});if(kind==='runtime')enemy.runtimeModifiers.set('edge',{weapons:{BALLISTIC:{rangePercent:n*20},ENERGY:{rangePercent:n*10}}});if(kind==='metadata')for(const m of enemy.weapons)m.spec.range+=n;if(kind==='ecm')enemy.ecmRangePenalty+=7;if(kind==='throws')throw Error('shield edge');if(kind==='nested'&&!nested){nested=true;const value=api.assessThreats(observer,view,100,1);trace.push('nested-'+value.threats.length);}return 1;};
  let result;try{result=api.assessThreats(observer,view,100,1);}catch(e){result={error:e.message};}assert.ok(n>0,'must exercise '+kind);return{result,trace,ecm:enemy.ecmRangePenalty};
 }
 for(const kind of['stat','accessor','runtime','metadata','ecm','throws','nested','phase-before','motion-before']){const a=run(aa,kind),b=run(ba,kind);assert.deepEqual(b,a,kind);rows.push({kind,trace:b.trace,threats:b.result.threats?.length,error:b.result.error});}fs.writeFileSync(path.join(out,'callback-boundaries.json'),JSON.stringify(rows,null,2));
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
