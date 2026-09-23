import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createLanWorld} from '../src/network/LanWorld';
import {assetManager} from '../src/engine/assets/AssetResolver';
// Baseline export is appended by the test-only esbuild plugin, never production.
import {captureCombat,captureCombatDispatchBaseline,applyCombatSnapshot} from '../src/network/AuthorityCombatSnapshot';
import {configureHostCosmetics} from '../src/network/HostSnapshot';
import {encodeProjectedBinaryFrame,decodeBinaryFrame} from '../src/network/BinarySnapshot.mjs';
const publicRoot=path.resolve('public');
globalThis.fetch=async(input:any)=>{const p=path.resolve(publicRoot,String(input).replace(/^\//,''));if(!p.startsWith(publicRoot+path.sep))throw Error('Outside assets');return new Response(fs.readFileSync(p));};
await assetManager.ensureManifestLoaded();
const match:any={id:'array-dispatch',seed:1511506142,hostId:'a',snapshotHz:60,players:[{id:'a',seat:0,team:0,hull:'onslaught'},{id:'b',seat:1,team:1,hull:'onslaught'}],options:{assignment:'teams',battleSize:3200,aiHulls:[Array(15).fill('hammerhead'),Array(15).fill('hammerhead')]}};
const engine=createLanWorld(match).engine,muzzle=configureHostCosmetics(engine),a=createLanWorld(match).engine,b=createLanWorld(match).engine;
const capture=(before:boolean,tick:number)=>{const f=(before?captureCombatDispatchBaseline:captureCombat)(engine,tick,{0:tick,1:tick},0,true,true,true,true);f.muzzleEvents=muzzle.snapshot();return f;};
let exactFrames=0,events=0,projectileFrames=0;const restores=[];
for(let tick=0;tick<=1200;tick++){
 if(tick)engine.fixedUpdate(1/60);if(tick%60)continue;
 const rng=JSON.stringify([engine.random,engine.visualRandom]),x=capture(true,tick),y=capture(false,tick);
 assert.deepEqual(y,x);const oldBytes=encodeProjectedBinaryFrame(x,true)!,newBytes=encodeProjectedBinaryFrame(y,true)!;
 assert.deepEqual(newBytes,oldBytes);assert.equal(JSON.stringify([engine.random,engine.visualRandom]),rng);
 applyCombatSnapshot(a,decodeBinaryFrame(oldBytes),tick===0);applyCombatSnapshot(b,decodeBinaryFrame(newBytes),tick===0);
 assert.deepEqual(captureCombat(b,tick,{},0),captureCombat(a,tick,{},0));exactFrames++;
 events+=x.muzzleEvents?.events?.length??0;if(engine.projectiles.length)projectileFrames++;restores.push({tick,bytes:newBytes.length});
}
// Exercise nested primitives, non-finite tags, holes, typed arrays, cycles and
// shared non-cyclic references through a retained plain fixture field.
const ship:any=engine.allCapitalShips[0],shared={values:[1,2,3]},cycle:any[]=[];cycle.push(cycle);
const values:any[]=[undefined,null,true,false,'字😀',NaN,Infinity,-Infinity,-0,shared,shared,cycle,new Float32Array([1,2.5])];values.length+=2;
ship.dispatchFixture={values,nested:[values.slice(0,8),[[],[shared]]],map:new Map([['k',values]]),set:new Set([undefined,shared])};
assert.deepEqual(capture(false,1200),capture(true,1200));delete ship.dispatchFixture;
for(let i=0;i<40;i++){capture(true,1200);capture(false,1200);}
const trials=[];
for(const before of [true,false,false,true]){const samples=[];let bytes=0;
 for(let i=0;i<160;i++){const at=performance.now(),frame=capture(before,1200);samples.push(performance.now()-at);if(i===0)bytes=encodeProjectedBinaryFrame(frame,true)!.length;}
 samples.sort((a,b)=>a-b);trials.push({before,medianMs:samples[80],p95Ms:samples[152],bytes});
}
const result={scope:'Same actual 32-ship world; frozen old capture functions in test-only bundle with same engine classes; full projection/binary/receiver and RNG equality. Microbench is not guest Hz.',exactFrames,events,projectileFrames,restores,trials};
assert.ok(exactFrames===21&&events>0&&projectileFrames>0);
fs.writeFileSync('artifacts/guest-bottomup-20260920/capture-comparison.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
