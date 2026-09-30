import assert from 'node:assert/strict';
import {test as nodeTest} from 'node:test';
let passedContracts=0;
const test=(name,body)=>nodeTest(name,async()=>{await body();passedContracts++;});
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const out=path.resolve(process.env.EXACT_THREAT_OUT??('artifacts/lan-authored-exact-threat-20260927/check-'+Date.now()));
fs.mkdirSync(out,{recursive:true});
const contents=`
export {createLanWorld} from './src/network/LanWorld';
export {FireControlQueryRoster} from './src/engine/ai/FireControlQueryBatch';
export {WeaponThreatEnvelope} from './src/engine/ai/WeaponThreatEnvelope';
export {assessThreats} from './src/engine/ai/ThreatAssessment';
export {CapitalShipAI} from './src/engine/ai/CapitalShipAI';
export {captureCombat} from './src/network/AuthorityCombatSnapshot';
export {shipSystemDefinitions} from './src/engine/extensions/ship-systems/Registry';
`;
const code={};
for(const enabled of [false,true]){
 const r=await build({stdin:{contents,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',define:{'__LAN_BUILD_ID__':JSON.stringify('exact-threat-contract'),'import.meta.env':JSON.stringify({BASE_URL:'/',DEV:true,PROD:false,MODE:'development',SSR:false,VITE_AI_EXACT_AUTHORED_THREATS:String(enabled)})}});
 code[String(enabled)]=r.outputFiles[0].text;
}
async function load(enabled,name){const file=path.join(out,name+'.mjs');fs.writeFileSync(file,code[String(enabled)]);return import(pathToFileURL(file).href);}
const hulls=['web_zhuyuan','web_gloriana','web_sc2_hyperion'];
const ai=Array.from({length:20},(_,i)=>hulls[i%3]);
const match={id:'exact-threat-check',hostId:'host',seed:917,snapshotHz:60,players:[{id:'host',name:'Host',seat:0,team:0,hull:hulls[0]},{id:'guest',name:'Guest',seat:1,team:1,hull:hulls[0]}],options:{assignment:'teams',battleSize:3200,deploymentLimit:1600,aiHulls:[ai.slice(0,10),ai.slice(10)]}};
function world(api){const {engine,controlled}=api.createLanWorld(match);api.FireControlQueryRoster.ownForWorker(engine);for(const ship of controlled.values()){engine.externallyControlledShipIds.add(ship.id);ship.fireControlMode='MANUAL';}assert.equal(engine.ships.length,176);return engine;}
const api=await load(true,'contracts');
const scene=engine=>({ships:engine.ships,projectiles:engine.projectiles,beams:engine.beams,asteroids:engine.asteroids});
function verify(engine,cache,label){const w=scene(engine);for(const ship of engine.capitalShips)for(const horizon of [0,.2,2,15,Infinity])assert.deepEqual(api.assessThreats(ship,{...w,exactWeaponThreatEnvelope:cache},horizon,.9),api.assessThreats(ship,w,horizon,.9),label+': '+ship.id+' horizon='+horizon);}

test('authored exact reuse preserves complete ordered threats for the real 176-entity fleet',()=>{
 const engine=world(api),ships=engine.ships,cache=api.WeaponThreatEnvelope.forExactPhase(ships);
 assert.ok(cache);assert.ok(ships.every(s=>s.hasExactThreatPhaseHooks));
 assert.ok(engine.capitalShips.some(s=>!s.hasNativeThreatPhaseHooks),'legacy forecast gate stays closed');
 verify(engine,cache,'cold');verify(engine,cache,'warm');
 for(let i=0;i<engine.capitalShips.length;i++){
  const s=engine.capitalShips[i];s.flux.softFlux=s.flux.maxFlux*(i%4)/5;s.system.isActive=true;s.system.effectLevel=.7;
  for(const w of s.weapons){w.spec.range+=31;w.cooldownTimer=.3;w.ammo=i%3?Math.max(1,w.ammo):0;}
  cache.invalidate(s);
 }
 verify(engine,cache,'live range/ammo/flux/activation edits invalidated');
 cache.close();assert.equal(cache.get(ships[0]),undefined);assert.equal(cache.permitsExactObserver(ships[0]),false);verify(engine,cache,'closed falls back');
});

test('parent/module/carrier dependency invalidation does not retain another family member',()=>{
 const engine=world(api),ships=engine.ships,cache=api.WeaponThreatEnvelope.forExactPhase(ships);assert.ok(cache);
 const parent=engine.capitalShips.find(s=>s.childModules.length===8),child=parent.childModules[0],craft=engine.fighters.find(s=>s.sourceCarrier===parent);
 assert.ok(craft);const before=[parent,child,craft].map(s=>cache.get(s));assert.ok(before.every(Boolean));
 parent.system.isActive=true;parent.system.effectLevel=1;
 parent.system.activationInput={point:parent.pos.clone().add({x:1000,y:0}),origin:parent.pos.clone(),velocity:parent.vel.clone(),facing:parent.facingRad};
 cache.invalidate(parent);const next=[parent,child,craft].map(s=>cache.get(s));next.forEach((row,i)=>assert.notEqual(row,before[i]));
 child.flux.isVenting=true;cache.invalidate(child);next.forEach((row,i)=>assert.notEqual(cache.get([parent,child,craft][i]),row));
 const priorParent=cache.get(parent);cache.invalidate(craft);assert.notEqual(cache.get(parent),priorParent);
 verify(engine,cache,'parent activation and child vent');cache.close();
});

test('external definition and damage readers fail closed; every composed system is checked',()=>{
 const engine=world(api),ships=engine.ships,ship=engine.capitalShips.find(s=>s.systems.length>1);assert.ok(ship);
 const secondary=ship.systems[1],definition=secondary.definition;secondary.definition={...definition};
 assert.equal(ship.hasExactThreatPhaseHooks,false);assert.equal(api.WeaponThreatEnvelope.forExactPhase(ships),undefined);secondary.definition=definition;
 ship.damageTakenModifiers.set('custom',()=>1);assert.equal(api.WeaponThreatEnvelope.forExactPhase(ships),undefined);ship.damageTakenModifiers.clear();
 const craft=engine.fighters[0],carrier=craft.sourceCarrier;craft.sourceCarrier={...carrier};assert.equal(api.WeaponThreatEnvelope.forExactPhase(ships),undefined);craft.sourceCarrier=carrier;
 assert.ok(api.WeaponThreatEnvelope.forExactPhase(ships));
});

test('exact envelope does not enable compactForecast or change AI-owned state',async()=>{
 const left=await load(false,'cadence-reference'),right=await load(true,'cadence-exact');
 const a=world(left),b=world(right),aa=new left.CapitalShipAI(a.enemyShip,a.playerShip),bb=new right.CapitalShipAI(b.enemyShip,b.playerShip);
 for(let i=0;i<9;i++){
  const cache=right.WeaponThreatEnvelope.forExactPhase(b.ships);assert.ok(cache);
  aa.update(1/60,null,scene(a));bb.update(1/60,null,{...scene(b),exactWeaponThreatEnvelope:cache});cache.invalidate(bb.ship);cache.close();
  assert.equal(aa.forecastRemaining,-1);assert.equal(bb.forecastRemaining,-1);
  assert.deepEqual(JSON.parse(JSON.stringify(b.enemyShip.tacticalAI)),JSON.parse(JSON.stringify(a.enemyShip.tacticalAI)));
  assert.deepEqual(right.captureCombat(b,i,{},0),left.captureCombat(a,i,{},0),'complete AI state '+i);
 }
});

test('complete fixed-step state stays identical through authored activation and venting',async()=>{
 const left=await load(false,'engine-reference'),right=await load(true,'engine-exact');const a=world(left),b=world(right);
 const hashes=[];
 for(let tick=1;tick<=30;tick++){
  if([5,11,19].includes(tick))for(const e of [a,b])for(const s of e.capitalShips){
   if(tick===19)s.startVenting();else{ s.flux.softFlux=s.flux.maxFlux*.3;s.aimTargetWorld.set(s.pos.x+1000,s.pos.y+500);for(const system of s.systems)system.activate(); }
  }
  a.fixedUpdate(1/60);b.fixedUpdate(1/60);
  const before=left.captureCombat(a,tick,{},0),after=right.captureCombat(b,tick,{},0);assert.deepEqual(after,before,'whole state tick '+tick);
  hashes.push(createHash('sha256').update(JSON.stringify(after)).digest('hex'));
 }
 fs.writeFileSync(path.join(out,'whole-state-hashes.json'),JSON.stringify(hashes,null,2));
});

test('pre-registered AI phase A-B-B-A, 30 warmup and 60 measured fixed steps per arm',async()=>{
 assert.equal(passedContracts,5,'do not time an invalid candidate');
 const rows=[];
 for(const [index,enabled]of [false,true,true,false].entries()){
  const loaded=await load(enabled,'bench-'+index),engine=world(loaded);
  for(let tick=0;tick<30;tick++)engine.fixedUpdate(1/60);
  const phases={},trace={mark(phase){const now=performance.now();if(this.previous)phases[this.previous]=(phases[this.previous]??0)+now-this.at;this.previous=phase;this.at=now;}};
  const started=performance.now();for(let tick=0;tick<60;tick++){trace.previous=null;engine.fixedUpdate(1/60,{trace});}const elapsed=performance.now()-started;
  const hash=createHash('sha256').update(JSON.stringify(loaded.captureCombat(engine,90,{},0))).digest('hex');
  rows.push({index,enabled,steps:60,elapsedMs:elapsed,fleetAIMs:phases.fleetAI,phases,stateSha256:hash});
  fs.writeFileSync(path.join(out,'abba.json'),JSON.stringify({scope:'Node synchronous phase, not browser latency or acceptance',rows},null,2));
 }
 assert.ok(rows.every(row=>row.stateSha256===rows[0].stateSha256),'all four end states identical');
 const gains=[1-rows[1].fleetAIMs/rows[0].fleetAIMs,1-rows[2].fleetAIMs/rows[3].fleetAIMs];
 fs.writeFileSync(path.join(out,'abba.json'),JSON.stringify({scope:'Node synchronous phase, not browser latency or acceptance',rows,gains,passesPrescribed10PercentGate:gains.every(g=>g>=.1)},null,2));
 console.log('exact threat AI phase gains: '+JSON.stringify(gains));
});
