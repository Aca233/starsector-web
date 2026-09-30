// Historical, retired LAN opt-in replay; the default input is the retained frozen candidate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {test as nodeTest} from 'node:test';
import {build} from 'esbuild';
const out=path.resolve(process.env.HOST_PHASE_OUT??('artifacts/lan-host-phase-reads-20260927/check-'+Date.now()));
fs.mkdirSync(out,{recursive:true});
const sha=value=>createHash('sha256').update(value).digest('hex');
const frozen=process.env.HOST_PHASE_FROZEN??path.resolve('artifacts/lan-host-phase-reads-20260927/candidate-browser.json');
const snapshot=JSON.parse(fs.readFileSync(frozen)),sources=new Map(snapshot.files.map(row=>{
 assert.equal(sha(row.code),row.sha256);return [path.resolve(row.file).toLowerCase(),row];
}));
let passed=0;
const test=(name,body)=>nodeTest(name,async()=>{await body();passed++;});
const contents=`
export {handleMessage,testEngine} from './src/network/host.worker';
export {Ship} from './src/engine/simulation/Ship';
export {captureCombat} from './src/network/AuthorityCombatSnapshot';
`;
const code={};
for(const enabled of [false,true]){
 const result=await build({stdin:{contents,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',
  define:{__LAN_BUILD_ID__:JSON.stringify('host-phase-contract'),'import.meta.env':JSON.stringify({BASE_URL:'/',DEV:true,PROD:false,MODE:'development',SSR:false,VITE_AI_EXACT_AUTHORED_THREATS:'true',VITE_LAN_OWNED_PHASE_READS:String(enabled)})},
  plugins:[{name:'same-frozen-source',setup(build){build.onLoad({filter:/\.(?:[cm]?[jt]sx?|json)$/},args=>{const row=sources.get(args.path.toLowerCase());if(row)return{contents:row.code+(row.file==='src/network/host.worker.ts'?'\nexport {handleMessage}; export function testEngine(){ return engine; }':''),loader:path.extname(row.file).slice(1).replace(/^[cm]([jt]s)$/, '$1')};if(args.path.startsWith(path.resolve('src')+path.sep))throw Error('Unfrozen source: '+args.path);});}}]});
 code[String(enabled)]=result.outputFiles[0].text;
}
fs.writeFileSync(path.join(out,'build-manifest.json'),JSON.stringify({frozen,sourceSha256:sha(fs.readFileSync(frozen)),beforeBundle:sha(code.false),afterBundle:sha(code.true)},null,2));
async function load(enabled,name){globalThis.self={postMessage(){}};const file=path.join(out,name+'.mjs');fs.writeFileSync(file,code[String(enabled)]);return import(pathToFileURL(file).href);}
const hulls=['web_zhuyuan','web_gloriana','web_sc2_hyperion'],ai=Array.from({length:20},(_,i)=>hulls[i%3]);
const match={id:'authored-query-check',hostId:'host',seed:917,snapshotHz:60,players:[{id:'host',name:'Host',seat:0,team:0,hull:hulls[0]},{id:'guest',name:'Guest',seat:1,team:1,hull:hulls[0]}],options:{assignment:'teams',battleSize:3200,deploymentLimit:1600,aiHulls:[ai.slice(0,10),ai.slice(10)]}};
function world(api){const messages=[];globalThis.self={postMessage(m){messages.push(m);}};api.handleMessage(structuredClone({type:'init',match}));assert.ok(messages.some(m=>m.type==='ready'),JSON.stringify(messages.filter(m=>m.type==='error')));assert.ok(messages.some(m=>m.type==='snapshot'&&m.tick===0));assert.ok(!messages.some(m=>m.type==='error'));const engine=api.testEngine();assert.equal(engine.ships.length,176);return engine;}
function hidden(engine){return {random:engine.random.checkpointWitness(),visualRandom:engine.visualRandom.checkpointWitness(),ships:engine.ships.map(ship=>({id:ship.id,random:ship.random.checkpointWitness(),controlRandom:ship.weaponControl.random.checkpointWitness(),trackers:ship.weapons.map(mount=>{const t=ship.weaponControl.autofire.trackers.get(mount);return [mount.slotId,t?{target:t.target&&[t.target.kind,t.target.entity.id],scanIn:t.scanIn,firingTime:t.firingTime,idleFireTime:t.idleFireTime,ammoAllowed:t.ammoAllowed,random:t.random.checkpointWitness()}:null];})}))};}
function witness(api,engine,tick){return{combat:api.captureCombat(engine,tick,{},0),hidden:hidden(engine)};}

test('original LAN init handler opts in on both initial and replacement epochs',async()=>{
 const before=await load(false,'init-reference'),after=await load(true,'init-candidate'),rows=[];
 for(const [enabled,api]of[[false,before],[true,after]]){
  let previous;
  for(let epoch=1;epoch<=2;epoch++){
   const engine=world(api);assert.notEqual(engine,previous);previous=engine;
   const descriptor=Object.getOwnPropertyDescriptor(api.Ship.prototype,'allSystems');let reads=0;
   Object.defineProperty(api.Ship.prototype,'allSystems',{...descriptor,get(){reads++;return descriptor.get.call(this);}});
   let phases;try{phases=engine.ships.map(s=>s.isPhased);}finally{Object.defineProperty(api.Ship.prototype,'allSystems',descriptor);}
   rows.push({enabled,epoch,reads,phases});
  }
 }
 assert.ok(rows[2].reads<rows[0].reads);assert.equal(rows[2].reads,rows[3].reads);assert.ok(rows[2].reads>0,'multi-slot Hyperion retains fallback');
 assert.deepEqual(rows[2].phases,rows[0].phases);assert.deepEqual(rows[3].phases,rows[1].phases);
 fs.writeFileSync(path.join(out,'host-init-probe.json'),JSON.stringify(rows,null,2));
});

test('live slot snapshots, parent, multi-slot and external-effect semantics are unchanged',async()=>{
 const left=await load(false,'phase-reference'),right=await load(true,'phase-candidate'),a=world(left),b=world(right);
 const phases=engine=>engine.ships.map(s=>[s.id,s.isPhased,s.isCollisionless]);
 for(let step=0;step<6;step++){
  for(const e of[a,b]){
   const p=e.capitalShips.find(s=>s.childModules.length),hyperion=e.capitalShips.find(s=>s.systems.length>1);
   if(step===1)p.isDocked=true;
   if(step===2){p.isDocked=false;hyperion.systems[1].isActive=true;hyperion.systems[1].state='ACTIVE';}
   if(step===3){p.childModules[0].externalPhaseEffects.set('probe',()=>0);hyperion.systems[1].state='OUT';}
   if(step===4){p.childModules[0].externalPhaseEffects.clear();p.isRetreated=true;}
   if(step===5){p.isRetreated=false;hyperion.systems[1].isActive=false;}
  }
  assert.deepEqual(phases(b),phases(a));
 }
 // Native getter, but synthetic slot readers prove two-reference snapshot and reentrancy.
 function run(api){const s=Object.assign(Object.create(api.Ship.prototype),{parentShip:null,isDocked:false,isRetreated:false,shield:{isPhased:false},systems:[],externalPhaseEffects:new Map()}),trace=[];
  s.defenseSystem={get isPhased(){trace.push('old');return false;}};
  s.system={get isPhased(){trace.push('main');s.defenseSystem={get isPhased(){trace.push('new');return true;}};return false;}};
  const values=[s.isPhased,s.isPhased];return{trace,values};}
 assert.deepEqual(run(right),run(left));
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
 assert.equal(passed,3,'do not time invalid candidate');const rows=[];
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
