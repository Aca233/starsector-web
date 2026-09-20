import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {createLanWorld} from '../src/network/LanWorld';
import {assetManager} from '../src/engine/assets/AssetResolver';
import {captureHostCombat,configureHostCosmetics} from '../src/network/HostSnapshot';
import {captureCombat} from '../src/network/CombatSnapshot';
import {encodeProjectedBinaryFrame,decodeBinaryFrame} from '../src/network/BinarySnapshot.mjs';
import protocol from '../src/network/protocol.json';

const publicRoot=path.resolve(process.env.SNAPSHOT_TEST_ASSETS??'public');
globalThis.fetch=async (input:any)=>{const p=path.resolve(publicRoot,String(input).replace(/^\//,''));if(!p.startsWith(publicRoot+path.sep))throw Error('Outside assets');return new Response(fs.readFileSync(p));};
await assetManager.ensureManifestLoaded();
const match:any={id:'number-test',seed:1511506142,hostId:'a',snapshotHz:60,
 players:[{id:'a',seat:0,team:0,hull:'onslaught'},{id:'b',seat:1,team:1,hull:'onslaught'}],
 options:{assignment:'teams',battleSize:3200,aiHulls:[Array(15).fill('hammerhead'),Array(15).fill('hammerhead')]}};
const engine=createLanWorld(match).engine;
const muzzle=configureHostCosmetics(engine);
const capture=(tick:number)=>captureHostCombat(engine,tick,{0:tick,1:tick},0,muzzle,true,true);
const sameEncoding=(make:()=>any)=>{
 const a=encodeProjectedBinaryFrame(make()),b=encodeProjectedBinaryFrame(make(),true);
 assert.deepEqual(b,a);if(a)assert.deepEqual(decodeBinaryFrame(b!),decodeBinaryFrame(a));
};
test('finite scalars, sparse arrays, integer boundaries and float64 bits match the original encoder',()=>{
 const nums=[0,-0,127,128,255,256,65535,65536,4294967295,4294967296,-32,-33,-128,-129,-32768,-32769,-2147483648,-2147483649,Number.MAX_SAFE_INTEGER,Number.MIN_SAFE_INTEGER,Number.MIN_VALUE,1/3];
 for(const n of [0,1,15,16,255,256,65535,65536])sameEncoding(()=>({values:Array.from({length:n},(_,i)=>nums[i%nums.length])}));
 // eslint-disable-next-line no-sparse-arrays -- Intentional hole: test legacy nil encoding.
 sameEncoding(()=>({values:[,undefined,null,true,false,'文本',...nums,{nested:[1,2,3]}]}));
});
test('seeded IEEE-754 bit patterns and integer sweeps are byte-identical',()=>{
 let seed=0x517cc1b7;const next=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
 const bits=new DataView(new ArrayBuffer(8)),values:number[]=[];
 for(let i=0;i<20000;i++){bits.setUint32(0,next());bits.setUint32(4,next());const n=bits.getFloat64(0);if(Number.isFinite(n))values.push(n);}
 for(let i=-65537;i<=65537;i++)values.push(i);
 sameEncoding(()=>({values,negativeZero:-0,wide:Number.MAX_SAFE_INTEGER}));
});
test('invalid scalars/keys, depth and fresh owned outputs preserve validation and fallback',()=>{
 for(const bad of [NaN,Infinity,-Infinity,()=>0,Symbol('x'),1n,new Date(),new Uint8Array(2)])sameEncoding(()=>({values:[bad]}));
 sameEncoding(()=>JSON.parse('{"x":[{"__proto__":1}]}'));
 const deep:any={values:[]};let row=deep.values;for(let i=0;i<140;i++){row[0]=[];row=row[0];}
 assert.throws(()=>encodeProjectedBinaryFrame(deep));assert.throws(()=>encodeProjectedBinaryFrame(deep,true));
 const a=encodeProjectedBinaryFrame({values:[1,2,3]} as any,true)!,copy=a.slice();encodeProjectedBinaryFrame({values:Array(1000).fill(4)} as any,true);assert.deepEqual(a,copy);
});
test('oversized numeric frames preserve the byte budget and encoder recovers after failure',()=>{
 const large={values:Array(Math.ceil(protocol.maxSnapshotBytes/9)+1).fill(0.5)} as any;
 for(const fast of [false,true]){
  assert.throws(()=>encodeProjectedBinaryFrame(large,fast),/Binary snapshot exceeds budget/);
  sameEncoding(()=>({values:[0.5,255,-32769]}));
 }
});
test('custom iterators, subclasses, index getters and live-length changes retain behavior',()=>{
 sameEncoding(()=>{const a=[1,2,3];Object.defineProperty(a,Symbol.iterator,{value:function*(){yield 3;yield 2;yield 1;}});return {a};});
 sameEncoding(()=>{class Custom extends Array<number>{*[Symbol.iterator](){yield 6;yield 7;}}return {a:new Custom(1,2)};});
 for(const fast of [false,true]){const seen:number[]=[];const a=[1,2,3];Object.defineProperty(a,0,{get(){seen.push(0);a[1]=9;return 4;}});const b=encodeProjectedBinaryFrame({a} as any,fast)!;assert.deepEqual((decodeBinaryFrame(b) as any).a,[4,9,3]);assert.deepEqual(seen,[0]);}
 const encodeMutating=(fast:boolean)=>{const a=[1,2,3];Object.defineProperty(a,0,{get(){a.length=1;return 4;}});return encodeProjectedBinaryFrame({a} as any,fast);};
 assert.deepEqual(encodeMutating(true),encodeMutating(false)); // Both preserve the legacy truncated-container behavior.
});
test('32-ship live combat packets remain byte-identical through AI combat',()=>{
 let muzzleFrames=0;
 for(let tick=0;tick<=1200;tick++){
  if(tick)engine.fixedUpdate(1/60);
  if(tick%20)continue;
  const a=capture(tick);
  const original=encodeProjectedBinaryFrame(a),fast=encodeProjectedBinaryFrame(a,true);assert.deepEqual(fast,original);
  if(a.muzzleEvents?.events.length)muzzleFrames++;
 }
 assert.ok(muzzleFrames>0);assert.equal(captureCombat(engine,1200,{0:0},0).tick,1200);
});
test('paired fixed-world timings (diagnostic only, never a CI speed assertion)',()=>{
 const rows:any[]=[];const med=(a:number[])=>a.sort((a,b)=>a-b)[Math.floor(a.length/2)];
 const fixed=capture(1200);
 for(let i=0;i<60;i++){capture(1200);encodeProjectedBinaryFrame(fixed);encodeProjectedBinaryFrame(fixed,true);}
 for(const fast of [false,true,true,false]){
  const captures:number[]=[],encodes:number[]=[];
  for(let i=0;i<100;i++){let at=performance.now();capture(1200);captures.push(performance.now()-at);at=performance.now();encodeProjectedBinaryFrame(fixed,fast);encodes.push(performance.now()-at);}
  rows.push({fast,captureMs:med(captures),encodeMs:med(encodes)});
 }
 fs.writeFileSync(process.env.SNAPSHOT_TEST_OUT??'artifacts/server-authority-20260920/capture-v3/local-number-timings.json',JSON.stringify({scope:'Fixed 32-ship world, median 100 calls, ABBA; microbenchmark not end-to-end latency',rows},null,2));console.log(rows);
});
