import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {captureCombat as beforeCapture} from 'old-combat-projection';
import {captureCombat} from '../src/network/CombatSnapshot';
import {createLanWorld} from '../src/network/LanWorld';
import {configureHostCosmetics} from '../src/network/HostSnapshot';
import {assetManager} from '../src/engine/assets/AssetResolver';
import {expandSnapshotProjectiles} from '../src/network/ProjectileProjection';
import {encodeProjectedBinaryFrame,encodeBinaryState} from '../src/network/BinarySnapshot.mjs';
import {LanDeltaSender,lanDeltaTarget} from '../server/LanDeltaTransport.mjs';
const publicRoot=path.resolve('public');
globalThis.fetch=async(input:any)=>{const p=path.resolve(publicRoot,String(input).replace(/^\//,''));if(!p.startsWith(publicRoot+path.sep))throw Error('Outside assets');return new Response(fs.readFileSync(p));};
await assetManager.ensureManifestLoaded();
const match:any={id:'endpoint-pair',seed:1511506142,hostId:'a',snapshotHz:60,players:[{id:'a',seat:0,team:0,hull:'onslaught'},{id:'b',seat:1,team:1,hull:'onslaught'}],options:{assignment:'teams',battleSize:3200,aiHulls:[Array(10).fill('hammerhead'),Array(10).fill('hammerhead')]}};
const engine=createLanWorld(match).engine,muzzle=configureHostCosmetics(engine);
const frames:any[]=[];
for(let tick=0;tick<=840;tick++){
 if(tick)engine.fixedUpdate(1/60);if(tick<600)continue;
 const before=beforeCapture(engine,tick,{0:tick,1:tick},0,true,true,true,true),after=captureCombat(engine,tick,{0:tick,1:tick},0,true,true,true,true);
 before.muzzleEvents=muzzle.snapshot();after.muzzleEvents=before.muzzleEvents;
 const strip=(row:any,keys:string[])=>Object.fromEntries(Object.entries(row).filter(([k])=>!keys.includes(k)));
 assert.deepEqual(expandSnapshotProjectiles(after),expandSnapshotProjectiles(before).map(r=>strip(r,['prevPos','prevBallisticTail','prevFadeProgress'])));
 for(let i=0;i<before.ships.length;i++)assert.deepEqual(after.ships[i].state,strip(before.ships[i].state,['prevPos','prevFacingRad']));
 frames.push({before,after});
}
const zip=(b:any)=>deflateRawSync(b,{level:1,memLevel:7}).length,results=[];
for(const stride of [1,3,6,12,30]){
 const rows:any[]=[];
 for(const mode of ['before','after']){
  const sender=new LanDeltaSender({ordered:true,motionReference:true}),bytes:number[]=[],raw:number[]=[],whole:number[]=[];
  for(let i=0;i<frames.length;i+=stride){const b=encodeBinaryState(match.id,i+1,encodeProjectedBinaryFrame(frames[i][mode],true));const choice=sender.prepare(lanDeltaTarget(b,i+1));assert.ok(sender.commit(choice));if(i){bytes.push(zip(choice.packet));raw.push(b.length);whole.push(zip(b));}}
  const mean=(a:number[])=>a.reduce((x,y)=>x+y,0)/a.length;
  rows.push({mode,rawBytes:mean(raw),fullDeflateBytes:mean(whole),orderedDeltaDeflateBytes:mean(bytes),deltaBytesPerSecond:bytes.reduce((x,y)=>x+y,0)/4});
 }
 results.push({hz:60/stride,rows,deltaReductionPercent:100*(1-rows[1].orderedDeltaDeflateBytes/rows[0].orderedDeltaDeflateBytes)});
}
const result={scope:'Same frozen 22-ship native engine, 241 paired captures over ticks 600–840. Old module restores only receiver-reconstructed endpoints; projectile fields checked exactly. Actual level1/mem7 deflate of full SWB and ordered LAN deltas. Not Steam packet bytes, network delivery Hz, renderer FPS or real n2n.',results};
fs.writeFileSync('artifacts/network-stream-20260921/paired-endpoints.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
