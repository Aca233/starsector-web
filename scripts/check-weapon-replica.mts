import assert from 'node:assert/strict';import {test} from 'node:test';import fs from 'node:fs';import path from 'node:path';
import {assetManager} from '../src/engine/assets/AssetResolver';
import {createLanWorld} from '../src/network/LanWorld';
import {captureHostCombat} from '../src/network/HostSnapshot';
import {applyCombatSnapshot} from '../src/network/AuthorityCombatSnapshot';
import {captureCriticalCombat,CriticalCombatReplica} from '../src/network/CriticalCombatReplica';
import {captureWeaponPresentation,applyWeaponPresentation} from '../src/network/WeaponPresentationReplica';
import {decodeCombatState} from '../src/network/CriticalCombatState.mjs';
import {prepareCombatState,CombatWireSender,CombatWireReceiver,readCombatEnvelope} from '../server/CriticalCombatWire.mjs';
const publicRoot=path.resolve('public');
globalThis.fetch=async(input:any)=>{const p=path.resolve(publicRoot,String(input).replace(/^\//,''));if(!p.startsWith(publicRoot+path.sep))throw Error('Outside assets');return new Response(fs.readFileSync(p));};
await assetManager.ensureManifestLoaded();
const match=(ships=22):any=>({id:'weapon-replica',seed:1511506142,hostId:'a',snapshotHz:60,players:[{id:'a',seat:0,team:0,hull:'hammerhead'},{id:'b',seat:1,team:1,hull:'hammerhead'}],options:{assignment:'teams',battleSize:3200,aiHulls:[Array((ships-2)/2).fill('hammerhead'),Array((ships-2)/2).fill('hammerhead')]}});
const full=(e:any,tick:number)=>captureHostCombat(e,tick,{},0,null);
const active=(e:any)=>e.allCapitalShips.filter((s:any)=>!e.deployment.isReserve(s.id));
const dist=(xs:number[])=>{const s=xs.slice().sort((a,b)=>a-b);return {p50:s[Math.floor(s.length*.5)],p95:s[Math.floor(s.length*.95)],max:s.at(-1)};};
test('22-ship native Web weapon rows equal stale-full replicas through real combat without authority/RNG/event changes',()=>{
 const e=createLanWorld(match()).engine,v=createLanWorld(match()).engine,replica=new CriticalCombatReplica(),sender=new CombatWireSender(),receiver=new CombatWireReceiver();
 const baseline=full(e,0),raw:number[]=[],wire:number[]=[],captures:number[]=[],applies:number[]=[],encodes:number[]=[],decodes:number[]=[];let firing=0,frames=0,rows=0,fallback=0;
 for(let tick=1;tick<=1500;tick++){
  e.fixedUpdate(1/60);if(tick%3!==0)continue;
  const rng=JSON.stringify([e.random,e.visualRandom]),before=full(e,tick),at=performance.now();
  const bytes=captureCriticalCombat(e,tick,true)!;captures.push(performance.now()-at);
  assert.equal(JSON.stringify([e.random,e.visualRandom]),rng);assert.deepEqual(full(e,tick),before);
  const f=decodeCombatState(bytes);if(!f.weapons){fallback++;continue;}
  frames++;rows+=f.weapons.reduce((n,s)=>n+s[1].length,0);firing+=f.weapons.flatMap(s=>s[1]).filter(row=>row[3]!==0).length;raw.push(bytes.length);
  const encodeAt=performance.now();const choice=sender.prepare(prepareCombatState(bytes),'m','s');wire.push(choice.data.length);encodes.push(performance.now()-encodeAt);const decodeAt=performance.now();
  assert.deepEqual(decodeCombatState(Buffer.from(receiver.decode(readCombatEnvelope(choice.data)).data,'base64')),f);decodes.push(performance.now()-decodeAt);assert.ok(sender.commit(choice));
  applyCombatSnapshot(v,baseline,false);assert.ok(replica.receive(f,tick/60*1000,0));const start=performance.now();replica.apply(v,0);applies.push(performance.now()-start);
  assert.deepEqual(captureWeaponPresentation(active(v)),captureWeaponPresentation(active(e)),'tick '+tick);
  const after=full(v,tick),viewRng=JSON.stringify([v.random,v.visualRandom]);replica.apply(v,0,true);
  assert.deepEqual(full(v,tick),after);assert.equal(JSON.stringify([v.random,v.visualRandom]),viewRng);
 }
 assert.ok(frames>=450);assert.equal(fallback,0);assert.ok(firing>0);assert.ok(rows>70000);
 const report={scope:'Native Web authority capture, exact mirror on a stale whole-world replica and ordered codec; NOT network/routing/renderer/FPS',frames,rows,firing,fallback,wireFull:sender.full,wireDelta:sender.delta,wirePredicted:sender.predicted,wireSpatial:sender.spatial,encodeMs:dist(encodes),decodeMs:dist(decodes),rawBytes:dist(raw),wireBytes:dist(wire),captureMs:dist(captures),applyMs:dist(applies)};
 fs.mkdirSync('artifacts/network-stream-20260921/phase11',{recursive:true});fs.writeFileSync('artifacts/network-stream-20260921/phase11/weapon-native-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
});
test('weapon clocks survive newer HP-only fallbacks, stale same-tick full restores and reset while newer full worlds win',()=>{
 const e=createLanWorld(match(2)).engine,v=createLanWorld(match(2)).engine,r=new CriticalCombatReplica(),base=full(e,0);
 e.playerShip.weapons[0].ammo=13;e.playerShip.weapons[0].recoil=.375;e.playerShip.weapons[0].currentAngleRad=-0;
 const f=decodeCombatState(captureCriticalCombat(e,10,true)!);assert.ok(f.weapons);assert.ok(r.receive(f,100,0));r.apply(v,0);assert.equal(v.playerShip.weapons[0].ammo,13);
 assert.ok(r.receive(decodeCombatState(captureCriticalCombat(e,11,false)!),150,0));assert.equal(r.weaponTick,10);assert.equal(r.weaponAge(200),100);assert.equal(r.age(200),50);
 applyCombatSnapshot(v,base,false);r.apply(v,0);assert.equal(v.playerShip.weapons[0].ammo,13);assert.ok(Object.is(v.playerShip.weapons[0].currentAngleRad,-0));
 applyCombatSnapshot(v,base,false);r.apply(v,10);assert.notEqual(v.playerShip.weapons[0].ammo,13);
 r.clear();assert.equal(r.weaponTick,-1);assert.equal(r.weaponAge(200),null);r.apply(v,0);assert.notEqual(v.playerShip.weapons[0].ammo,13);
});
test('weapon capture preserves absent/undefined optional flags and unsupported fields fall back without losing HP',()=>{
 const e=createLanWorld(match(2)).engine,v=createLanWorld(match(2)).engine,r=new CriticalCombatReplica();let tick=0;
 assert.equal(decodeCombatState(captureCriticalCombat(e,0)!).weapons,undefined,'weapon capture must remain opt-in');
 for(const mode of ['absent','undefined','false','true']){
  const w=e.playerShip.weapons[0];if(mode==='absent')delete w.isPermanentlyDisabled;else w.isPermanentlyDisabled=mode==='undefined'?undefined:mode==='true';
  const frame=decodeCombatState(captureCriticalCombat(e,++tick,true)!);assert.ok(frame.weapons);r.receive(frame,tick*50,0);r.apply(v,0);
  assert.equal(Object.hasOwn(v.playerShip.weapons[0],'isPermanentlyDisabled'),Object.hasOwn(w,'isPermanentlyDisabled'));assert.equal(v.playerShip.weapons[0].isPermanentlyDisabled,w.isPermanentlyDisabled);
 }
 const w=e.playerShip.weapons[0];let invoked=0;Object.defineProperty(w,'recoil',{get:()=>{invoked++;return 0},configurable:true});
 const unsupported=decodeCombatState(captureCriticalCombat(e,20,true)!);assert.equal(unsupported.weapons,undefined);assert.equal(invoked,0);assert.equal(unsupported.ships.length,2);
});
test('unknown ships/slots/specs and accessor targets never create a weapon or run a setter',()=>{
 const e=createLanWorld(match(2)).engine,v=createLanWorld(match(2)).engine,r=new CriticalCombatReplica();const f=decodeCombatState(captureCriticalCombat(e,5,true)!);assert.ok(f.weapons);
 const w=v.playerShip.weapons[0],original=w.ammo;f.weapons![0][1][0][1]='different-spec';f.weapons![0][1][0][7]=123;r.receive(f,50,0);r.apply(v,0);assert.equal(w.ammo,original);
 let invoked=0;Object.defineProperty(w,'recoil',{set:()=>{invoked++},get:()=>.1,configurable:true});const g=decodeCombatState(captureCriticalCombat(e,6,true)!);g.weapons![0][1][0][7]=456;r.receive(g,60,0);r.apply(v,0);assert.equal(invoked,0);assert.equal(w.ammo,original);
});

test('identity accessors, duplicate slots, unknown targets and inherited optional setters are isolated',()=>{
 const e=createLanWorld(match(2)).engine,v=createLanWorld(match(2)).engine;
 const source=e.playerShip.weapons[0],target=v.playerShip.weapons[0],original=target.ammo;source.ammo=99;source.isPermanentlyDisabled=true;
 const ships=captureWeaponPresentation(active(e));let invoked=0;
 const spec=source.spec;Object.defineProperty(source,'spec',{get:()=>{invoked++;return spec},configurable:true});
 assert.equal(decodeCombatState(captureCriticalCombat(e,1,true)!).weapons,undefined);assert.equal(invoked,0);
 Object.defineProperty(source,'spec',{value:spec,writable:true,configurable:true,enumerable:true});
 const targetSpec=target.spec;Object.defineProperty(target,'spec',{get:()=>{invoked++;return targetSpec},configurable:true});
 const known=new Map<string,any>(active(v).map((s:any)=>[s.id,s]));applyWeaponPresentation(known,ships);assert.equal(invoked,0);assert.equal(target.ammo,original);
 Object.defineProperty(target,'spec',{value:targetSpec,writable:true,configurable:true,enumerable:true});
 const count=v.playerShip.weapons.length,missing=structuredClone(ships);missing[0]![0]='not-present';applyWeaponPresentation(known,missing);assert.equal(known.size,2);assert.equal(target.ammo,original);
 missing[0]![0]=ships[0]![0];missing[0]![1][0]![0]='unknown-slot';applyWeaponPresentation(known,missing);assert.equal(target.ammo,original);assert.equal(v.playerShip.weapons.length,count);
 v.playerShip.weapons.push({...target});applyWeaponPresentation(known,ships);assert.equal(target.ammo,original);v.playerShip.weapons.pop();
 delete target.isPermanentlyDisabled;const proto=Object.getPrototypeOf(target);Object.setPrototypeOf(target,{set isPermanentlyDisabled(_value:unknown){invoked++;}});
 try{applyWeaponPresentation(known,ships);assert.equal(target.ammo,99);assert.equal(target.isPermanentlyDisabled,true);assert.equal(invoked,0);assert.ok(Object.hasOwn(target,'isPermanentlyDisabled'));}finally{Object.setPrototypeOf(target,proto);}
});
