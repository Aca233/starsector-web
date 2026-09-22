// Actual native FX + whole-combat capture/encode; same-seed paired lane order.
// Deliberately injected cosmetic load. Not multiplayer Hz or whole-physics speed.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {assetManager} from '../src/engine/assets/AssetResolver';
import {Vector2} from '../src/engine/math/Vector2';
import {createLanWorld} from '../src/network/LanWorld';
import {configureHostCosmetics,captureAuthorityCombat} from '../src/network/HostSnapshot';
import {hostParticleEvents} from '../src/network/HostParticleEvents';
import {LocalParticleEffects} from '../src/network/LocalParticleEffects';
import {localParticleLayer} from '../src/engine/render/LocalParticleLayer';
import {applyCombatSnapshots} from '../src/network/CombatSnapshot';
import {encodeProjectedBinaryFrame,decodeBinaryFrame} from '../src/network/BinarySnapshot.mjs';
const root=path.resolve('public');globalThis.fetch=async(input:any)=>new Response(fs.readFileSync(path.join(root,String(input).replace(/^\//,''))));await assetManager.ensureManifestLoaded();
const match:any={id:'particle-perf',seed:917,hostId:'a',snapshotHz:60,players:[{id:'a',seat:0,team:0,hull:'onslaught'},{id:'b',seat:1,team:1,hull:'onslaught'}],options:{assignment:'teams',battleSize:3200,aiHulls:[[],[]]}};
const lanes=[false,true].map(offload=>{const engine=createLanWorld(match).engine,viewer=createLanWorld(match).engine;return{offload,engine,viewer,muzzle:configureHostCosmetics(engine,true,true,offload),local:new LocalParticleEffects(),samples:[] as any[]};});
const canonical=(p:readonly any[])=>p.map(p=>JSON.stringify(p)).sort();
for(let tick=1;tick<=600;tick++){
 for(const index of tick%2?[0,1]:[1,0]){
  const a=lanes[index]!,started=performance.now();
  if(tick%3===0)a.engine.fxSystem.spawnSparks(new Vector2(tick,0),40);
  if(tick%2===0)a.engine.fxSystem.spawnArmorDamageSparks(a.engine.playerShip,new Vector2(1,2),80);
  a.engine.fxSystem.update(1/60);a.engine.combatTime=tick/60;const fxAt=performance.now();
  const frame=captureAuthorityCombat(a.engine,tick,{},0,a.muzzle,true),captured=performance.now(),bytes=encodeProjectedBinaryFrame(frame,true),encoded=performance.now();
  const read=decodeBinaryFrame(bytes);applyCombatSnapshots(a.viewer,[read],false,undefined,{nativeTargeting:true});a.local.receive(read.particleEvents,read.world.combatTime);a.local.update(a.viewer,read.world.combatTime);const viewed=performance.now();
  if(tick>120)a.samples.push({tick,fx:fxAt-started,capture:captured-fxAt,encode:encoded-captured,authority:encoded-started,viewer:viewed-encoded,bytes:bytes.length,rawParticles:a.engine.particles.length,virtualParticles:hostParticleEvents(a.engine.fxSystem)?.activeParticles??0});
 }
 assert.deepEqual(lanes[0]!.engine.visualRandom,lanes[1]!.engine.visualRandom);
 assert.deepEqual(canonical(lanes[0]!.engine.particles),canonical([...lanes[1]!.engine.particles,...localParticleLayer(lanes[1]!.viewer.fxSystem)]));
}
const summarize=(rows:any[],k:string)=>{const n=rows.map(r=>r[k]).sort((a,b)=>a-b);return{mean:n.reduce((a,b)=>a+b,0)/n.length,p95:n[Math.floor((n.length-1)*.95)]};};
const report={scope:'2-ship real world, injected native additive cosmetics; paired FX spawn/update + complete native capture + binary encode, then viewer restore/replay. No physics/renderer/network. NOT game Hz or ping.',seed:917,warm:120,steps:480,parity:'all 600 RNG states and reconstructed particle fields equal (array order excluded for additive layer)',lanes:lanes.map(a=>({offload:a.offload,stats:Object.fromEntries(['fx','capture','encode','authority','viewer','bytes','rawParticles','virtualParticles'].map(k=>[k,summarize(a.samples,k)])),local:a.local.stats()}))};
fs.writeFileSync('artifacts/network-stream-20260921/phase20/paired-particle-perf.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
