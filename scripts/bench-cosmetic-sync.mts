import { SimulationRandom } from '../src/engine/simulation/SimulationRandom';
import { createExplosionPuffs } from '../src/engine/visual/ExplosionVisuals';
import { enableExplosionPuffRecipes } from '../src/engine/visual/ExplosionPuffRecipe';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {deflateRawSync,constants} from 'node:zlib';
import {createLanWorld} from '../src/network/LanWorld';
import {captureHostCombat,configureHostCosmetics} from '../src/network/HostSnapshot';
import {applyCombatSnapshot} from '../src/network/CombatSnapshot';
import {encodeBinaryState,encodeProjectedBinaryFrame,decodeBinaryState} from '../src/network/BinarySnapshot.mjs';
import {assetManager} from '../src/engine/assets/AssetResolver';
import {LanDeltaSender,lanDeltaTarget} from '../server/LanDeltaTransport.mjs';
import {LanDeltaReceiver} from '../src/network/LanBinaryDelta.mjs';
import {SteamSnapshotEncoder,SteamSnapshotSender,SteamSnapshotReceiver} from '../server/steam/snapshot-delta.mjs';
import {SteamPacketCodec} from '../server/steam/packet-codec.mjs';
const burst=process.argv.includes('--burst');
const base='artifacts/cosmetic-sync-20260919'+(burst?'/burst':''),publicRoot=path.resolve('public');fs.mkdirSync(base,{recursive:true});
globalThis.fetch=async(input:any)=>{const p=path.resolve(publicRoot,String(input).replace(/^\//,''));if(!p.startsWith(publicRoot+path.sep))throw Error('outside public');return new Response(fs.readFileSync(p),{status:200});};
await assetManager.ensureManifestLoaded();
const match:any={id:'production-cosmetics-32',seed:1511506142,hostId:'p0',snapshotHz:60,players:[{id:'p0',name:'offline',seat:0,team:0,hull:'hammerhead',design:null},{id:'p1',name:'offline',seat:1,team:1,hull:'hammerhead',design:null}],options:{aiHulls:[Array(15).fill('hammerhead'),Array(15).fill('hammerhead')],assignment:'teams',battleSize:3200,initialDeploymentLimit:null}};
const world=createLanWorld(match),host=world.engine,muzzle=configureHostCosmetics(host);
for(const ship of world.controlled.values())host.externallyControlledShipIds.add(ship.id);
const variants=Object.fromEntries(['full','recipe'].map(key=>[key,{viewer:createLanWorld(match).engine,rows:[] as any[],sender:new LanDeltaSender(),receiver:new LanDeltaReceiver(),acks:[] as any[],steamEncoder:new SteamSnapshotEncoder(),steamSender:new SteamSnapshotSender(),steamReceiver:new SteamSnapshotReceiver(),codec:new SteamPacketCodec(),decoder:new SteamPacketCodec()}]));
const compress=(bytes:Uint8Array)=>deflateRawSync(bytes,{level:1,memLevel:7,finishFlush:constants.Z_SYNC_FLUSH}).length-4;
const frames:any[]=[];
for(let tick=1;tick<=720;tick++){
 host.fixedUpdate(1/60);if(tick<600)continue;
 // Explicit visual-only stress case, not claimed as organic battle behavior.
 if(burst&&tick%30===0)for(const ship of host.allCapitalShips.slice(0,4))host.fxSystem.spawnAuthenticExplosion(ship.pos,700,[255,160,90],true,ship.vel);
 for(const key of tick%2?['recipe','full']:['full','recipe']){
  const v=variants[key],started=performance.now(),frame=captureHostCombat(host,tick,{0:tick,1:tick},0,muzzle,key==='recipe'),captureMs=performance.now()-started;
  const at=performance.now(),binary=encodeBinaryState(match.id,tick,encodeProjectedBinaryFrame(frame)),encodeMs=performance.now()-at;
  while(v.acks.length&&v.acks[0].at<=tick)v.sender.ack(v.acks.shift().seq);
  const prep=performance.now(),choice=v.sender.prepare(lanDeltaTarget(binary,tick,tick*1000/60)),deltaMs=performance.now()-prep;
  const restored=v.receiver.decode(choice.packet);assert.deepEqual(restored,binary);v.sender.commit(choice);v.acks.push({at:tick+8,seq:tick});
  const decodeAt=performance.now(),received=decodeBinaryState(binary),decodeMs=performance.now()-decodeAt;
  const applyAt=performance.now();applyCombatSnapshot(v.viewer,received.frame);const applyMs=performance.now()-applyAt;
  const text=JSON.stringify({type:'state',matchId:match.id,seq:tick,frame});
  const steamAt=performance.now(),steamChoice=v.steamSender.prepare(text,v.steamEncoder,v.codec,tick*1000/60),steamEncodeMs=performance.now()-steamAt;
  const packets=v.codec.frame('1'.repeat(32),'data',steamChoice.prepared).packets;let message:any;
  for(const packet of packets)message=v.decoder.receive('offline',packet,tick*1000/60);
  v.steamSender.commit(steamChoice);const steam=v.steamReceiver.receive(message.data);assert.equal(steam.needsFull,false);assert.equal(JSON.stringify(steam.data),text);
  const row={tick,raw:binary.length,lanFull:compress(binary),lanDelta:compress(choice.packet),steamBytes:packets.reduce((n,p)=>n+p.length,0),captureMs,encodeMs,deltaMs,decodeMs,applyMs,steamEncodeMs,recipes:(JSON.stringify(frame).match(/\$explosionPuffs/g)??[]).length,muzzleEvents:frame.muzzleEvents!.events.length};v.rows.push(row);
  if([600,660,720].includes(tick)){const file=`${key}-${tick}.bin`;fs.writeFileSync(path.join(base,file),binary);frames.push({key,tick,file,bytes:binary.length});}
 }
 assert.equal(JSON.stringify(variants.full.viewer.fxSystem.explosions),JSON.stringify(variants.recipe.viewer.fxSystem.explosions));
 assert.equal(JSON.stringify(variants.full.viewer.fxSystem.hitGlows),JSON.stringify(variants.recipe.viewer.fxSystem.hitGlows));
}
const stat=(a:number[])=>{a=[...a].sort((a,b)=>a-b);return{mean:a.reduce((s,v)=>s+v,0)/a.length,median:a[Math.floor(a.length/2)],p95:a[Math.ceil(a.length*.95)-1]};};
const summary=Object.fromEntries(Object.entries(variants).map(([key,v])=>[key,{samples:v.rows.length,steadySamples:v.rows.length-30,stats:Object.fromEntries(Object.keys(v.rows[0]).filter(k=>k!=='tick').map(k=>[k,stat(v.rows.slice(30).map(r=>r[k]))])),first:v.rows[0]}]));
const spawnTimes:Record<string,number[]>={full:[],recipe:[]};
for(let i=0;i<220;i++)for(const key of i%2?['recipe','full']:['full','recipe']){
 const random=new SimulationRandom(i);if(key==='recipe')enableExplosionPuffRecipes(random);
 const at=performance.now();const puffs=createExplosionPuffs(1400,random,true);const ms=performance.now()-at;
 assert.ok(puffs.length>100);if(i>=20)spawnTimes[key].push(ms);
}
const spawn=Object.fromEntries(Object.entries(spawnTimes).map(([k,v])=>[k,stat(v)]));
const output={spawn,scenario:burst?'32-ship plus synthetic large cosmetic explosion bursts':'32-ship natural combat',scope:'shared production host cosmetic setup/capture with muzzle event sink enabled; actual engine fixedUpdate and neutral player controls, Node offline 32-ship captures; no real network, renderer or FPS claim; LAN ACK delay synthetic 8 ticks; Steam existing reliable codec replay includes SWSP headers; scalar telemetry/sounds excluded equally',match,frames,summary,rows:Object.fromEntries(Object.entries(variants).map(([k,v])=>[k,v.rows]))};
fs.writeFileSync(path.join(base,'production-profile.json'),JSON.stringify(output,null,2));console.log(JSON.stringify(summary,null,2));
