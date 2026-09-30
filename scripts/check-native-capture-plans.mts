import {immutableCopy} from '../src/engine/extensions/Immutable';
import assert from 'node:assert/strict';import {test} from 'node:test';import fs from 'node:fs';import path from 'node:path';
import {captureCombat as reference} from 'capture-plans-off';
import {applyCombatSnapshots} from '../src/network/AuthorityCombatSnapshot';
import {nativeRecordRestorer} from '../src/network/NativeRecordRestore.generated';
import {captureCombat,capturePlanDiagnostics} from '../src/network/AuthorityCombatSnapshot';import {encodeProjectedBinaryFrame,decodeBinaryFrame} from '../src/network/BinarySnapshot.mjs';
import {createLanWorld} from '../src/network/LanWorld';import {assetManager} from '../src/engine/assets/AssetResolver';import {captureAuthorityCombat,configureHostCosmetics} from '../src/network/HostSnapshot';import {Vector2} from '../src/engine/math/Vector2';
const baseTest = process.argv.includes('--weapon-only') ? (_name:string,_fn:()=>unknown)=>{} : test;
const root=path.resolve('public');globalThis.fetch=async(input:any)=>{const file=path.resolve(root,String(input).replace(/^\//,''));if(!file.startsWith(root+path.sep))throw Error('outside assets');return new Response(fs.readFileSync(file));};await assetManager.ensureManifestLoaded();
const world=(count=2)=>{const match:any={id:'capture-plans',seed:917,hostId:'p0',snapshotHz:60,players:[{id:'p0',seat:0,team:0,hull:'onslaught'},{id:'p1',seat:1,team:1,hull:'onslaught'}],options:{assignment:'teams',battleSize:3200,aiHulls:[Array(Math.floor((count-2)/2)).fill('hammerhead'),Array(Math.ceil((count-2)/2)).fill('hammerhead')]}};const e=createLanWorld(match).engine;configureHostCosmetics(e,true,true,true);return e;};
const take=(e:any,tick=0,native=true,fn:any=captureCombat)=>fn(e,tick,{0:tick,1:tick},0,true,true,true,native,true);
const wire=(value:any)=>encodeProjectedBinaryFrame(value,true)!;
function check(e:any,tick=0,native=true){const rng=JSON.stringify([e.random,e.visualRandom]);const before=take(e,tick,native,reference),after=take(e,tick,native);assert.deepEqual(wire(after),wire(before));assert.deepEqual(decodeBinaryFrame(wire(after)),decodeBinaryFrame(wire(before)));assert.equal(JSON.stringify([e.random,e.visualRandom]),rng);return after;}
baseTest('native field plans preserve exact SWF2 bytes through evolving 22-ship physics and reference discovery',()=>{const e=world(22);let projectiles=0;for(let tick=0;tick<=900;tick++){if(tick)e.fixedUpdate(1/60);if(tick%15===0){check(e,tick);projectiles+=e.projectiles.length;}}assert.ok(projectiles>0);});
baseTest('live field values, key addition/deletion/order/enumerability and function transitions cannot reuse stale shapes',()=>{
 const e=world(),ship=e.playerShip as any;const v:any={a:1,b:2,c:3,d:4,e:5,f:6,g:new Vector2(7,8)};ship.fixture=v;check(e);
 for(const mutate of [()=>v.a=29,()=>v.h=8,()=>delete v.c,()=>v.c=30,()=>v.a=()=>7,()=>v.a=9,()=>v.b=undefined,()=>v.d=Infinity,()=>v.d=NaN,()=>Object.defineProperty(v,'e',{value:41,enumerable:false,configurable:true}),()=>v.e=42,()=>v.g=new Float64Array([1,2,3]),()=>v.h=e.enemyShip,()=>v.loop=v,()=>delete v.loop]){mutate();check(e);}
});
baseTest('one object in distinct projection paths and prototype changes preserve omissions and dictionary order',()=>{
 const e=world(),ship=e.playerShip as any;ship.fixture=ship.damageDecals;check(e);delete ship.fixture;
 const weapon=ship.weaponControl.weapons[0];assert.ok(weapon);const proto=Object.getPrototypeOf(weapon);check(e);Object.setPrototypeOf(weapon,{});check(e);Object.setPrototypeOf(weapon,proto);check(e);
});
baseTest('previous frame dictionary/value mutation cannot poison later captures and owned transfers stay exact',()=>{
 const e=world();const a=check(e);const b=wire(take(e));a.layouts[0][0]='poison';a.ships[0].state.hullHp=-500;const c=check(e);assert.deepEqual(wire(c),b);const bytes=wire(c),m=structuredClone(bytes,{transfer:[bytes.buffer]});assert.equal(bytes.byteLength,0);assert.deepEqual(wire(check(e)),m);
});
baseTest('wide/long-key records fall back and bounded interner eviction never changes output',()=>{
 const e=world(),ship=e.playerShip as any;ship.fixture=Object.fromEntries(Array.from({length:300},(_,i)=>['wide'+i,i]));check(e);ship.fixture['long'.repeat(40)]=1;check(e);
 ship.fixture=Array.from({length:1050},(_,i)=>({['a'+i]:i,b:2,c:3,d:4,e:5,f:6}));check(e);ship.fixture={a:1,b:2,c:3,d:4,e:5,f:6};check(e);
});
baseTest('generic/custom accessor path retains original read count and exceptions',()=>{
 const e=world(),ship=e.playerShip as any;ship.fixture={a:1,b:2,c:3,d:4,e:5,f:6};let reads=0;Object.defineProperty(ship.fixture,'live',{enumerable:true,configurable:true,get(){reads++;return 7;}});
 const a=take(e,0,false,reference),oldReads=reads;reads=0;const b=take(e,0,false);assert.equal(reads,oldReads);assert.deepEqual(wire(b),wire(a));Object.defineProperty(ship.fixture,'live',{get(){throw Error('accessor preserved');}});assert.throws(()=>take(e,0,false),/accessor preserved/);
});

baseTest('live diagnostics prove plan reuse and bounded metadata, not artificial Hz',()=>{const e=world();check(e);check(e);(e.playerShip as any).fixture=Object.fromEntries(Array.from({length:300},(_,i)=>['wide'+i,i]));check(e);const s=capturePlanDiagnostics();assert.equal(s.enabled,true);assert.ok(s.hits>0);assert.ok(s.compiled>0);assert.ok(s.fallbacks>0);assert.ok(s.shapes<=1024);});


const authorityFields = ['fireControl','fireControlTargetShipId','fireControlTargetProjectileId','cycleTargetShipId','cycleTargetProjectileId','burstFluxReserved','lifecycleDt','aimIdleSeconds'];
const authorityTake = (e: any, tick: number, full = false) => captureCombat(e,tick,{0:tick,1:tick},0,true,true,true,true,true,true,false,false,false,!full);
const presentationTake = (e: any, tick: number) => JSON.parse(JSON.stringify(authorityTake(e,tick)));
const restore = (engine: any, frame: any, reset = false) => applyCombatSnapshots(engine,[frame],reset,undefined,{nativeTargeting:true,nativeProjection:true});
const weaponLayouts = (frame: any) => frame.layouts.filter((keys: string[]) => keys.includes('slotId') && keys.includes('currentAngleRad'));

test('native weapon projection drops only authority work fields; cold, skipped, local writes and custom prototypes preserve the presentation contract',()=>{
 const host=world(12), baseline=world(12), candidate=world(12), held: Array<{frame:any; text:string}>=[];
 let previous=0,fieldOccurrences=0,fireControls=0;
 for(const tick of [0,1,120,121,240]){
  while(previous<tick){host.fixedUpdate(1/60);previous++;}
  const before=JSON.stringify(take(host,tick,false));const rng=JSON.stringify([host.random,host.visualRandom]);
  const full=authorityTake(host,tick,true), pruned=authorityTake(host,tick);
  for(const old of held)assert.equal(JSON.stringify(old.frame),old.text);
  assert.equal(JSON.stringify(take(host,tick,false)),before);assert.equal(JSON.stringify([host.random,host.visualRandom]),rng);
  for(const ship of host.ships)for(const mount of ship.weapons){for(const key of authorityFields)fieldOccurrences+=Number(Object.hasOwn(mount,key));if(mount.fireControl)fireControls++;}
  const layouts=weaponLayouts(pruned);assert.ok(layouts.length>0);
  for(const keys of layouts){assert.ok(keys.every((key:string)=>!authorityFields.includes(key)));assert.ok(nativeRecordRestorer(keys),'projected weapon must have exact generated restore: '+JSON.stringify(keys));}
  assert.ok(weaponLayouts(full).some((keys:string[])=>keys.some(key=>authorityFields.includes(key))));
  held.push({frame:pruned,text:JSON.stringify(pruned)});
  if(tick===121)continue;
  restore(baseline,decodeBinaryFrame(wire(full)),tick===0);restore(candidate,decodeBinaryFrame(wire(pruned)),tick===0);
  assert.deepEqual(presentationTake(candidate,tick),presentationTake(baseline,tick),'all retained presentation state, tick '+tick);
  // Do not accidentally let a local prediction write survive the next endpoint.
  for(const e of [baseline,candidate]){e.playerShip.weapons[0].currentAngleRad=-17;e.playerShip.weapons[0].ammo=-99;}
  const coldFull=world(12),coldPruned=world(12);
  restore(coldFull,JSON.parse(JSON.stringify(full)),true);restore(coldPruned,JSON.parse(JSON.stringify(pruned)),true);
  assert.deepEqual(presentationTake(coldPruned,tick),presentationTake(coldFull,tick),'cold JSON '+tick);
 }
 assert.ok(fieldOccurrences>0&&fireControls>0,'real fixture must contain authority work state');
 const defaultFrame=captureAuthorityCombat(host,240,{0:240,1:240},0,null,true,true);
 assert.ok(weaponLayouts(defaultFrame).every((keys:string[])=>keys.every(key=>!authorityFields.includes(key))),'shared authority API must enable the measured projection by default');
 const fullDiagnostic=captureAuthorityCombat(host,240,{0:240,1:240},0,null,true,true,false,false,false,false);
 assert.ok(weaponLayouts(fullDiagnostic).some((keys:string[])=>keys.includes('fireControl')),'explicit diagnostic rollback must retain work state');
 const isolated=world(), mount=isolated.playerShip.weapons[0] as any;
 for(const key of authorityFields)mount[key]={proof:key};
 for(const ship of isolated.ships)for(const weapon of ship.weapons)Object.setPrototypeOf(weapon,{});
 assert.deepEqual(wire(authorityTake(isolated,0)),wire(authorityTake(isolated,0,true)),'non-native weapon prototype must not prune');
 const generic=world() as any;generic.playerShip.fixture=Object.fromEntries(authorityFields.map(key=>[key,{proof:key}]));
 assert.deepEqual(wire(take(generic,0,false)),wire(take(generic,0,false,reference)),'generic capture must preserve all same-named fields');
 const mirror=world() as any;mirror.playerShip.fixture=generic.playerShip.fixture;
 restore(mirror,decodeBinaryFrame(wire(authorityTake(generic,0))),true);
 assert.deepEqual(mirror.playerShip.fixture,generic.playerShip.fixture,'ordinary object properties must not be pruned by name');
 console.log('WEAPON_PROJECTION_COVERAGE',JSON.stringify({fieldOccurrences,fireControls}));
});

if(process.argv.includes('--bench'))test('paired exact-state native weapon projection capture/encode/decode/apply benchmark',()=>{
 const host=world(32),baseline=world(32),candidate=world(32),samples:any[]=[];
 for(let tick=0;tick<240;tick++)host.fixedUpdate(1/60);
 for(let tick=240;tick<360;tick++){
  host.fixedUpdate(1/60);
  for(const full of tick%2?[true,false,false,true]:[false,true,true,false]){
   const at=performance.now(),frame=authorityTake(host,tick,full),captured=performance.now();
   const bytes=wire(frame),encoded=performance.now(),decoded=decodeBinaryFrame(bytes),parsed=performance.now();
   restore(full?baseline:candidate,decoded);const applied=performance.now();
   if(tick>=280)samples.push({full,capture:captured-at,encode:encoded-captured,decode:parsed-encoded,apply:applied-parsed,total:applied-at,bytes:bytes.byteLength});
  }
 }
 assert.deepEqual(presentationTake(candidate,360),presentationTake(baseline,360));
 const stats=(v:number[])=>{v.sort((a,b)=>a-b);return{mean:v.reduce((a,b)=>a+b,0)/v.length,p50:v[Math.floor((v.length-1)*.5)],p95:v[Math.floor((v.length-1)*.95)]};};
 const arm=(full:boolean)=>Object.fromEntries(['capture','encode','decode','apply','total','bytes'].map(key=>[key,stats(samples.filter(s=>s.full===full).map(s=>s[key]))]));
 console.log('WEAPON_PROJECTION_BENCH',JSON.stringify({scope:'Paired ABBA same authority state, 32 native ships, one headless replica. Not WAN/RTT/GPU/FPS.',samplesPerArm:samples.length/2,baseline:arm(true),candidate:arm(false)}));
});

baseTest('frame-local immutable metadata reuse keeps exact wire bytes, projection context and packet ownership',()=>{
 const e=world(),ship=e.playerShip as any;
 const leaf=immutableCopy({a:1,b:2,c:3,d:4,e:5,f:6,scalars:[1,undefined,Infinity,-0],nested:{color:[1,2,3]}});
 ship.fixture={first:leaf,second:leaf,list:[leaf,leaf],mutable:{a:1,b:2,c:3,d:4,e:5,f:6}};
 const old=check(e),held=wire(old).slice();
 ship.fixture.mutable.a=99;
 ship.fixture.first=immutableCopy({...leaf,a:20});
 check(e);assert.deepEqual(wire(old),held,'retained packet must not change');
 // Same authored metadata can occur under a projected and an unprojected path.
 ship.fixture.second=ship.spec;ship.fixture.third=ship.spec;check(e);
 const poisoned=check(e);poisoned.layouts[0][0]='poison';check(e);
 delete ship.fixture;check(e);
});
