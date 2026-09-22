import assert from 'node:assert/strict';import {test} from 'node:test';import fs from 'node:fs';import path from 'node:path';
import {captureCombat as reference} from 'capture-plans-off';
import {captureCombat,capturePlanDiagnostics} from '../src/network/CombatSnapshot';import {encodeProjectedBinaryFrame,decodeBinaryFrame} from '../src/network/BinarySnapshot.mjs';
import {createLanWorld} from '../src/network/LanWorld';import {assetManager} from '../src/engine/assets/AssetResolver';import {configureHostCosmetics} from '../src/network/HostSnapshot';import {Vector2} from '../src/engine/math/Vector2';
const root=path.resolve('public');globalThis.fetch=async(input:any)=>{const file=path.resolve(root,String(input).replace(/^\//,''));if(!file.startsWith(root+path.sep))throw Error('outside assets');return new Response(fs.readFileSync(file));};await assetManager.ensureManifestLoaded();
const world=(count=2)=>{const match:any={id:'capture-plans',seed:917,hostId:'p0',snapshotHz:60,players:[{id:'p0',seat:0,team:0,hull:'onslaught'},{id:'p1',seat:1,team:1,hull:'onslaught'}],options:{assignment:'teams',battleSize:3200,aiHulls:[Array(Math.floor((count-2)/2)).fill('hammerhead'),Array(Math.ceil((count-2)/2)).fill('hammerhead')]}};const e=createLanWorld(match).engine;configureHostCosmetics(e,true,true,true);return e;};
const take=(e:any,tick=0,native=true,fn:any=captureCombat)=>fn(e,tick,{0:tick,1:tick},0,true,true,true,native,true);
const wire=(value:any)=>encodeProjectedBinaryFrame(value,true)!;
function check(e:any,tick=0,native=true){const rng=JSON.stringify([e.random,e.visualRandom]);const before=take(e,tick,native,reference),after=take(e,tick,native);assert.deepEqual(wire(after),wire(before));assert.deepEqual(decodeBinaryFrame(wire(after)),decodeBinaryFrame(wire(before)));assert.equal(JSON.stringify([e.random,e.visualRandom]),rng);return after;}
test('native field plans preserve exact SWF2 bytes through evolving 22-ship physics and reference discovery',()=>{const e=world(22);let projectiles=0;for(let tick=0;tick<=900;tick++){if(tick)e.fixedUpdate(1/60);if(tick%15===0){check(e,tick);projectiles+=e.projectiles.length;}}assert.ok(projectiles>0);});
test('live field values, key addition/deletion/order/enumerability and function transitions cannot reuse stale shapes',()=>{
 const e=world(),ship=e.playerShip as any;const v:any={a:1,b:2,c:3,d:4,e:5,f:6,g:new Vector2(7,8)};ship.fixture=v;check(e);
 for(const mutate of [()=>v.a=29,()=>v.h=8,()=>delete v.c,()=>v.c=30,()=>v.a=()=>7,()=>v.a=9,()=>v.b=undefined,()=>v.d=Infinity,()=>v.d=NaN,()=>Object.defineProperty(v,'e',{value:41,enumerable:false,configurable:true}),()=>v.e=42,()=>v.g=new Float64Array([1,2,3]),()=>v.h=e.enemyShip,()=>v.loop=v,()=>delete v.loop]){mutate();check(e);}
});
test('one object in distinct projection paths and prototype changes preserve omissions and dictionary order',()=>{
 const e=world(),ship=e.playerShip as any;ship.fixture=ship.damageDecals;check(e);delete ship.fixture;
 const weapon=ship.weaponControl.weapons[0];assert.ok(weapon);const proto=Object.getPrototypeOf(weapon);check(e);Object.setPrototypeOf(weapon,{});check(e);Object.setPrototypeOf(weapon,proto);check(e);
});
test('previous frame dictionary/value mutation cannot poison later captures and owned transfers stay exact',()=>{
 const e=world();const a=check(e);const b=wire(take(e));a.layouts[0][0]='poison';a.ships[0].state.hullHp=-500;const c=check(e);assert.deepEqual(wire(c),b);const bytes=wire(c),m=structuredClone(bytes,{transfer:[bytes.buffer]});assert.equal(bytes.byteLength,0);assert.deepEqual(wire(check(e)),m);
});
test('wide/long-key records fall back and bounded interner eviction never changes output',()=>{
 const e=world(),ship=e.playerShip as any;ship.fixture=Object.fromEntries(Array.from({length:300},(_,i)=>['wide'+i,i]));check(e);ship.fixture['long'.repeat(40)]=1;check(e);
 ship.fixture=Array.from({length:1050},(_,i)=>({['a'+i]:i,b:2,c:3,d:4,e:5,f:6}));check(e);ship.fixture={a:1,b:2,c:3,d:4,e:5,f:6};check(e);
});
test('generic/custom accessor path retains original read count and exceptions',()=>{
 const e=world(),ship=e.playerShip as any;ship.fixture={a:1,b:2,c:3,d:4,e:5,f:6};let reads=0;Object.defineProperty(ship.fixture,'live',{enumerable:true,configurable:true,get(){reads++;return 7;}});
 const a=take(e,0,false,reference),oldReads=reads;reads=0;const b=take(e,0,false);assert.equal(reads,oldReads);assert.deepEqual(wire(b),wire(a));Object.defineProperty(ship.fixture,'live',{get(){throw Error('accessor preserved');}});assert.throws(()=>take(e,0,false),/accessor preserved/);
});

test('live diagnostics prove plan reuse and bounded metadata, not artificial Hz',()=>{const e=world();check(e);check(e);(e.playerShip as any).fixture=Object.fromEntries(Array.from({length:300},(_,i)=>['wide'+i,i]));check(e);const s=capturePlanDiagnostics();assert.equal(s.enabled,true);assert.ok(s.hits>0);assert.ok(s.compiled>0);assert.ok(s.fallbacks>0);assert.ok(s.shapes<=1024);});
