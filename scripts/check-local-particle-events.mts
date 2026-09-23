import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {Vector2} from '../src/engine/math/Vector2';
import {SimulationRandom} from '../src/engine/simulation/SimulationRandom';
import {CombatFXSystem} from '../src/engine/simulation/systems/CombatFXSystem';
import {HostParticleEvents,hostParticleEvents} from '../src/network/HostParticleEvents';
import {LocalParticleEffects} from '../src/network/LocalParticleEffects';
import {localParticleLayer} from '../src/engine/render/LocalParticleLayer';
import {validateParticleEvents,PARTICLE_EVENT_LIMITS} from '../src/network/particle-events.mjs';
import {captureAuthorityCombat,configureHostCosmetics} from '../src/network/HostSnapshot';
import {captureCombat,applyCombatSnapshot} from '../src/network/AuthorityCombatSnapshot';
import {createLanWorld} from '../src/network/LanWorld';
import {assetManager} from '../src/engine/assets/AssetResolver';
import {encodeProjectedBinaryFrame,decodeBinaryFrame,encodeBinaryState,decodeBinaryState,decodeBinaryStateForRelay} from '../src/network/BinarySnapshot.mjs';
import {SnapshotPrepareState} from '../server/steam/snapshot-prepare-state.mjs';
import {SteamPacketCodec} from '../server/steam/packet-codec.mjs';
import {SteamBinarySnapshotReceiver} from '../server/steam/binary-snapshot.mjs';
import {SteamSnapshotReceiver} from '../server/steam/snapshot-delta.mjs';
import {summarizeCombatFrame,RELAY_FRAME_FIELDS} from '../src/network/CombatFrameSummary.mjs';
const root=path.resolve('public');
globalThis.fetch=async(input:any)=>{const p=path.resolve(root,String(input).replace(/^\//,''));if(!p.startsWith(root+path.sep))throw Error('Outside assets');return new Response(fs.readFileSync(p));};
await assetManager.ensureManifestLoaded();
const ship={damageDecals:{suppressed:false},pos:new Vector2(11,17),facingRad:.27} as any;
const canonical=(particles:readonly any[])=>particles.map(p=>JSON.stringify(p)).sort();
function fixture(seed=917){const a=new SimulationRandom(seed),b=new SimulationRandom(seed),before=new CombatFXSystem(a),after=new CombatFXSystem(b),host=new HostParticleEvents(after),local=new LocalParticleEffects(),viewer={fxSystem:new CombatFXSystem()} as any;return{a,b,before,after,host,local,viewer};}
function compare(f:ReturnType<typeof fixture>,clock:number){
 const batch=f.host.snapshot();validateParticleEvents(batch);f.local.receive(batch,clock);f.local.update(f.viewer,clock);
 assert.deepEqual(f.a,f.b,'world visual RNG must be identical');
 assert.equal(f.before.particles.length,f.after.particles.length+f.host.activeParticles,'density occupancy');
 assert.deepEqual(canonical([...f.after.particles,...localParticleLayer(f.viewer.fxSystem)]),canonical(f.before.particles));
}
test('armor sparks reserve identical RNG and reconstruct every field at each native step',()=>{
 for(const seed of [0,1,917,0xffffffff])for(const damage of [.1,3,9.99,10,63,100,250]){
  const f=fixture(seed);for(const fx of [f.before,f.after])fx.spawnArmorDamageSparks(ship,new Vector2(3,4),damage);
  for(let i=0;i<=65;i++){compare(f,i/60);f.before.update(1/60);f.after.update(1/60);}
 }
});
test('ordinary sparks reconstruct motion, size, drag and alpha without authority particle objects',()=>{
 const f=fixture();for(const fx of [f.before,f.after])fx.spawnSparks(new Vector2(2,3),60,[17,200,88]);assert.equal(f.after.particles.length,0);assert.equal(f.host.activeParticles,60);
 for(let i=0;i<70;i++){compare(f,i/60);f.before.update(1/60);f.after.update(1/60);}
 assert.equal(f.host.snapshot().events.length,0);
});
test('mixed native explosions and offloaded sparks preserve density decisions and RNG under load',()=>{
 const f=fixture();for(let tick=0;tick<160;tick++){
  for(const fx of [f.before,f.after]){fx.spawnSparks(new Vector2(tick,3),80);if(tick%3===0)fx.spawnArmorDamageSparks(ship,new Vector2(),90);if(tick%5===0)fx.spawnExplosion(new Vector2(-tick,2),60);fx.update(1/60);}
  compare(f,(tick+1)/60);
  assert.deepEqual(f.after.particles.filter(p=>p.material==='SMOKE'),f.before.particles.filter(p=>p.material==='SMOKE'),'native source-over draw order must not change');
 }
});
test('event window overflow falls back to ordinary particles, never drops effects or RNG',()=>{
 const f=fixture();for(let i=0;i<160;i++)for(const fx of [f.before,f.after])fx.spawnArmorDamageSparks(ship,new Vector2(i,0),10);
 assert.equal(f.host.snapshot().events.length,PARTICLE_EVENT_LIMITS.groups);assert.ok(f.after.particles.length>0);compare(f,0);
});
test('clear propagates an epoch reset; absent legacy fields remove only the local layer',()=>{
 const f=fixture();f.after.spawnSparks(new Vector2(),10);f.local.receive(f.host.snapshot(),0);f.local.update(f.viewer,0);assert.equal(localParticleLayer(f.viewer.fxSystem).length,10);
 f.after.clear();f.local.receive(f.host.snapshot(),0);f.local.update(f.viewer,0);assert.equal(localParticleLayer(f.viewer.fxSystem).length,0);
 f.after.spawnSparks(new Vector2(),10);f.local.receive(f.host.snapshot(),0);f.local.update(f.viewer,0);f.local.receive(undefined,0);f.local.update(f.viewer,0);assert.equal(localParticleLayer(f.viewer.fxSystem).length,0);
});
test('non-native timestep materializes existing groups before continuing ordinary FX updates',()=>{
 const f=fixture();for(const fx of [f.before,f.after])fx.spawnSparks(new Vector2(),30);
 for(let i=0;i<5;i++){f.before.update(1/60);f.after.update(1/60);}f.before.update(1/120);f.after.update(1/120);
 assert.equal(f.host.activeParticles,0);assert.equal(f.host.snapshot().events.length,0);assert.deepEqual(canonical(f.after.particles),canonical(f.before.particles));
 for(const fx of [f.before,f.after])fx.spawnSparks(new Vector2(),10);assert.deepEqual(f.a,f.b);assert.deepEqual(canonical(f.after.particles),canonical(f.before.particles));
});
test('custom RNG/vector/update, fractional arguments and invalid native inputs keep old generation',()=>{
 const f=fixture();f.b.next=()=>.25;f.after.spawnSparks(new Vector2(),3);assert.equal(f.host.activeParticles,0);assert.equal(f.after.particles.length,3);
 const g=fixture();const pos=new Vector2();pos.clone=()=>new Vector2(1,1);g.after.spawnSparks(pos,3);assert.equal(g.host.activeParticles,0);assert.equal(g.after.particles.length,3);
 const h=fixture();h.after.updateParticles=()=>{};h.after.spawnSparks(new Vector2(),3);assert.equal(h.host.activeParticles,0);
});
test('duplicates, stale windows, packet ownership, rewind and cold late join do not restart births',()=>{
 const f=fixture();for(const fx of [f.before,f.after])fx.spawnSparks(new Vector2(),50);
 const original=f.host.snapshot();for(let i=0;i<10;i++){f.before.update(1/60);f.after.update(1/60);}compare(f,10/60);
 const generated=f.local.stats().generated;f.local.receive(f.host.snapshot(),10/60);f.local.receive(original,0);f.local.update(f.viewer,10/60);assert.equal(f.local.stats().generated,generated);
 const batch=f.host.snapshot();f.local.receive(batch,10/60);batch.events[0]![2][3]=999;f.local.update(f.viewer,10/60);assert.deepEqual(canonical(localParticleLayer(f.viewer.fxSystem)),canonical(f.before.particles));
 const cold=new LocalParticleEffects();cold.receive(f.host.snapshot(),10/60);cold.update(f.viewer,10/60);assert.deepEqual(canonical(localParticleLayer(f.viewer.fxSystem)),canonical(f.before.particles));
 f.local.update(f.viewer,9/60);f.local.update(f.viewer,10/60);assert.deepEqual(canonical(localParticleLayer(f.viewer.fxSystem)),canonical(f.before.particles));
});
test('receiver rejects malformed and over-budget packets transactionally',()=>{
 const f=fixture();f.after.spawnSparks(new Vector2(),10);const good=f.host.snapshot();f.local.receive(good,0);f.local.update(f.viewer,0);const state=canonical(localParticleLayer(f.viewer.fxSystem));
 const mutations=[(b:any)=>b.version=2,(b:any)=>b.step=-1,(b:any)=>b.events[0][1]=1,(b:any)=>b.events.push(b.events[0]),(b:any)=>b.events[0][2][1]=3,(b:any)=>b.events[0][2][5]=1e12,(b:any)=>b.events[0][2][6]=NaN,(b:any)=>delete b.events[0][2][6],(b:any)=>b.events[0][2][3]=123];
 for(const mutate of mutations){const bad=structuredClone(good);mutate(bad);assert.throws(()=>f.local.receive(bad,0));f.local.update(f.viewer,0);assert.deepEqual(canonical(localParticleLayer(f.viewer.fxSystem)),state);}
 const over=structuredClone(good);over.latest=4;over.events=Array.from({length:4},(_,i)=>[i+1,0,[1,2,0,0,0,720,0,0,0,0,0]] as any);assert.throws(()=>validateParticleEvents(over));
});
const match:any={id:'particles-test',seed:917,hostId:'a',snapshotHz:60,players:[{id:'a',seat:0,team:0,hull:'onslaught'},{id:'b',seat:1,team:1,hull:'onslaught'}],options:{assignment:'teams',battleSize:3200,aiHulls:[[],[]]}};
test('real authority capture, binary/JSON transport, relay projection and receiver retain validated events',()=>{
 const engine=createLanWorld(match).engine,muzzle=configureHostCosmetics(engine,true,true,true);engine.fxSystem.spawnSparks(new Vector2(5,6),30);engine.fxSystem.update(1/60);
 const frame=captureAuthorityCombat(engine,1,{},0,muzzle,true),viewer=createLanWorld(match).engine;
 for(const transported of [JSON.parse(JSON.stringify(frame)),decodeBinaryFrame(encodeProjectedBinaryFrame(frame,true))]){
  const summary=summarizeCombatFrame(transported,2,0);assert.equal(summary.tick,1);applyCombatSnapshot(viewer,transported,true);
  const local=new LocalParticleEffects();local.receive(transported.particleEvents,transported.world.combatTime);local.update(viewer,transported.world.combatTime);assert.equal(localParticleLayer(viewer.fxSystem).length,30);
 }
 assert.equal(RELAY_FRAME_FIELDS.particleEvents,true);assert.ok(hostParticleEvents(engine.fxSystem));
 const malformed=structuredClone(frame);malformed.particleEvents!.events[0]![2][5]=1e9;assert.throws(()=>summarizeCombatFrame(malformed,2,0));assert.throws(()=>applyCombatSnapshot(viewer,malformed,true));
});
function gameplay(engine:any,tick:number){const frame=captureCombat(engine,tick,{},0),expand=(v:any):any=>{if(!v||typeof v!=='object')return v;if(Array.isArray(v))return v.map(expand);if(v.$record!==undefined)return Object.fromEntries(frame.layouts![v.$record]!.map((k,i)=>[k,expand(v.values[i])]));if(v.$records!==undefined)return v.values.map((row:any[])=>Object.fromEntries(frame.layouts![v.$records]!.map((k,i)=>[k,expand(row[i])])));return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,expand(x)]));};const result=expand(frame);delete result.layouts;delete result.world.fxSystem;return result;}
test('real engine gameplay, projectiles, RNG and battle-result readiness remain unchanged',()=>{
 const a=createLanWorld(match).engine,b=createLanWorld(match).engine;configureHostCosmetics(a,true,true,false);configureHostCosmetics(b,true,true,true);
 for(let tick=1;tick<=90;tick++){
  for(const e of [a,b]){e.fxSystem.spawnSparks(new Vector2(tick,0),10);e.fixedUpdate(1/60);}
  if(tick%15===0){assert.deepEqual(gameplay(a,tick),gameplay(b,tick));assert.deepEqual(a.visualRandom,b.visualRandom);assert.equal(a.isBattleResultReady,b.isBattleResultReady);}
 }
});

test('new event windows pass actual Steam binary/legacy preparation and projected LAN validation',()=>{
 const e=createLanWorld(match).engine,m=configureHostCosmetics(e,true,true,true);e.fxSystem.spawnSparks(new Vector2(),40);
 const frame=captureAuthorityCombat(e,1,{},0,m,true),binary=encodeBinaryState(match.id,1,encodeProjectedBinaryFrame(frame,true));
 assert.deepEqual(summarizeCombatFrame(decodeBinaryStateForRelay(binary).frame,2,0),summarizeCombatFrame(frame,2,0));
 assert.deepEqual(decodeBinaryState(binary).frame.particleEvents,frame.particleEvents);
 const kernel=new SnapshotPrepareState(),receivers=[new SteamBinarySnapshotReceiver(),new SteamSnapshotReceiver()];
 const {response}=kernel.handle({op:'prepare',id:1,now:1000,peers:[{key:1,epoch:0,binary:true},{key:2,epoch:0,binary:false}],input:{kind:'binary',data:binary}});
 assert.equal(response.results.length,2);
 for(const r of response.results){const codec=new SteamPacketCodec({binaryStates:true}),packets=codec.frame('a'.repeat(32),'data',{...r.prepared,payload:Buffer.from(r.prepared.payload)});let incoming:any;for(const packet of packets.packets)incoming=codec.receive('remote',packet)??incoming;const restored=receivers[r.key-1]!.receive(incoming.data);assert.equal(restored.needsFull,false);assert.deepEqual(restored.data.frame.particleEvents,frame.particleEvents);}
 const bad=structuredClone(frame);bad.particleEvents!.events[0]![2][5]=1e9;
 assert.throws(()=>summarizeCombatFrame(decodeBinaryStateForRelay(encodeBinaryState(match.id,2,encodeProjectedBinaryFrame(bad,true))).frame,2,0));
});

test('native-only idle lane keeps exact ordering, and mixed fallback materializes original unified order',()=>{
 const f=fixture();for(let tick=0;tick<40;tick++){for(const fx of [f.before,f.after]){if(tick%5===0)fx.spawnExplosion(new Vector2(),35);fx.update(1/60);}assert.deepEqual(f.after.particles,f.before.particles);}
 assert.equal((f.host as any).order.length,0);
 for(const fx of [f.before,f.after]){fx.spawnSparks(new Vector2(1,2),40);fx.spawnExplosion(new Vector2(3,4),40);fx.spawnArmorDamageSparks(ship,new Vector2(),100);}
 for(let i=0;i<25;i++){f.before.update(1/60);f.after.update(1/60);}
 f.before.update(1/30);f.after.update(1/30);assert.deepEqual(f.after.particles,f.before.particles);assert.deepEqual(f.a,f.b);
});
test('client advances confirmed visuals between receipts without touching world state or RNG',()=>{
 const f=fixture();for(const fx of [f.before,f.after])fx.spawnSparks(new Vector2(),40);f.local.receive(f.host.snapshot(),0);
 const worldBefore=JSON.stringify(f.viewer.fxSystem);
 for(let tick=1;tick<=15;tick++){f.before.update(1/60);f.local.update(f.viewer,tick/60);assert.deepEqual(canonical(localParticleLayer(f.viewer.fxSystem)),canonical(f.before.particles));}
 assert.equal(JSON.stringify(f.viewer.fxSystem),worldBefore);
});

test('repeated paused-baseline resets reuse particle objects instead of regenerating each RAF',()=>{
 const f=fixture();f.after.spawnSparks(new Vector2(),60);f.local.receive(f.host.snapshot(),0);for(let i=0;i<120;i++)f.local.update(f.viewer,0,true);assert.equal(f.local.stats().generated,60);assert.equal(localParticleLayer(f.viewer.fxSystem).length,60);
});
