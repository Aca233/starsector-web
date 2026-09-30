import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {MotionPrediction} from '../src/network/MotionPrediction';
// @ts-expect-error Test-only baseline namespace resolved by the runner.
import {MotionPrediction as Before} from 'phase26-baseline-motion';
import {Vector2} from '../src/engine/math/Vector2';
import {shipPresentationPose, setShipPresentationPose} from '../src/engine/visual/ShipPresentation';
import {assetManager} from '../src/engine/assets/AssetResolver';
import {createLanWorld} from '../src/network/LanWorld';
import {captureCombat} from '../src/network/AuthorityCombatSnapshot';
import {applyPlayerControls} from '../src/engine/runtime/PlayerControls';
import {advanceShipMotion} from '../src/engine/simulation/systems/ShipMotion';
import {blankInput,KEY_CODES} from '../src/network/protocol';
import type {Ship} from '../src/engine/simulation/Ship';
import type {PlayerInput} from '../src/network/protocol';
const root=path.resolve('public');
globalThis.fetch=async(input:any)=>{const file=path.resolve(root,String(input).replace(/^\//,''));if(!file.startsWith(root+path.sep))throw Error('Outside assets');return new Response(fs.readFileSync(file));};
await assetManager.ensureManifestLoaded();
const match:any={id:'motion-prediction',seed:1511506142,hostId:'a',snapshotHz:60,players:[{id:'a',seat:0,team:0,hull:'hammerhead'},{id:'b',seat:1,team:1,hull:'hammerhead'}],options:{assignment:'teams',battleSize:3200,aiHulls:[[],[]]}};
const input=(seq=1,keys=0):PlayerInput=>({...blankInput(),seq,keys,aim:[2000,0],pointerActive:false});
const bit=(key:string)=>1<<KEY_CODES.indexOf(key as any);
function setup(P=MotionPrediction) {
 const engine=createLanWorld(match).engine,ship=engine.playerShip;
 ship.pos.set(0,0);ship.prevPos.set(0,0);ship.vel.set(60,0);ship.facingRad=0;ship.angularVelRad=0;
 return {engine,ship,p:new P()};
}
function coast(P:typeof MotionPrediction,hz:number) {
 const {ship,p}=setup(P),errors:number[]=[];
 for(let frame=0;frame<=360;frame++){
  const now=frame*1000/60;
  if(frame%(60/hz)===0){ship.pos.set(now*.06,0);p.receive(ship,0,now);}
  p.render(ship,input(),now,true);
  if(frame>60)errors.push(now*.06-shipPresentationPose(ship)!.pos.x);
 }
 return {meanLagUnits:errors.reduce((a,b)=>a+b,0)/errors.length,maxAbsLagUnits:Math.max(...errors.map(Math.abs))};
}
const comparisons=[10,20,60].map(hz=>({hz,before:coast(Before,hz),after:coast(MotionPrediction,hz)}));
fs.writeFileSync(process.env.MOTION_PREDICTION_REPORT_OUT??'artifacts/network-stream-20260921/phase26/reconciliation-paired.json',JSON.stringify({fixture:'60 units/s coast, 60FPS, exact no-delay authority; presentation error, NOT RTT',comparisons},null,2));
for(const row of comparisons)test(`same-time reconciliation removes invented coast lag at ${row.hz}Hz`,()=>{
 assert.ok(row.before.meanLagUnits>0.2,JSON.stringify(row));
 assert.ok(row.after.maxAbsLagUnits<1e-6,JSON.stringify(row));
});

test('ACK retains held thrust across the whole replay interval, not just last RAF',()=>{
 const {ship,p}=setup();ship.vel.set(0,0);const cmd=input(1,bit('KeyW'));
 p.record(cmd,0);p.receive(ship,1,0);p.render(ship,cmd,0,true);
 for(let t=1000/60;t<=100+1e-8;t+=1000/60)p.render(ship,cmd,t,true);
 const expected=setup().ship;expected.vel.set(0,0);
 for(let i=0;i<6;i++){applyPlayerControls(expected,{KeyW:true},new Vector2(2000,0),false,undefined,false);advanceShipMotion(expected,1/60);}
 assert.ok(shipPresentationPose(ship)!.pos.distanceTo(expected.pos)<1e-7);
 assert.equal(p.stats().pendingInputs,0);assert.ok(p.stats().replayMs>=99.99);
});

test('small actual errors smooth and settle; large corrections and angular discontinuities snap',()=>{
 const {ship,p}=setup();ship.vel.set(0,0);p.receive(ship,0,0);p.render(ship,input(),0,true);
 ship.pos.set(10,0);p.receive(ship,0,16);p.render(ship,input(),16,true);
 const first=shipPresentationPose(ship)!.pos.x;assert.ok(first>0&&first<10);assert.equal(p.stats().correctionDistance,10);
 for(let t=32;t<496;t+=16)p.render(ship,input(),t,true);
 assert.ok(shipPresentationPose(ship)!.pos.x>9.9);
 ship.pos.set(1000,0);p.receive(ship,0,500);p.render(ship,input(),500,true);assert.equal(shipPresentationPose(ship)!.pos.x,1000);
 ship.facingRad=Math.PI;p.receive(ship,0,516);p.render(ship,input(),516,true);assert.equal(shipPresentationPose(ship)!.facing,Math.PI);
 assert.ok(p.stats().hardSnaps>=2);
});

test('teleport epoch clears old replay, even for a short displacement',()=>{
 const {ship,p}=setup();p.record(input(1,bit('KeyW')),0);p.receive(ship,0,0);p.render(ship,input(),16,true);
 ship.teleportSequence++;ship.pos.set(10,0);p.receive(ship,0,32);p.render(ship,input(),32,true);
 assert.equal(shipPresentationPose(ship)!.pos.x,10);assert.equal(p.stats().pendingInputs,0);assert.equal(p.stats().hardSnaps,1);
});

test('collision/inactive suspension clears internal history but preserves authority presentation when requested',()=>{
 for(const reason of ['collision','inactive','unavailable'] as const){
  const {ship,p}=setup();p.receive(ship,0,0);p.record(input(1),1);p.render(ship,input(),16,true);
  const authority={pos:new Vector2(22,0),facing:.1};setShipPresentationPose(ship,authority);
  p.suspend(ship,reason,true);assert.equal(shipPresentationPose(ship),authority);assert.equal(p.stats().active,false);assert.equal(p.stats().reason,reason);assert.equal(p.stats().pendingInputs,0);
  ship.pos.set(30,0);p.receive(ship,1,100);p.render(ship,input(2),100,true);assert.equal(shipPresentationPose(ship)!.pos.x,30,'must not reuse pre-suspension correction');
 }
});

test('stale, dead, retreat, focus reset and a long RAF gap cannot continue old corrections',()=>{
 const {ship,p}=setup();p.receive(ship,0,0);p.render(ship,input(),16,true);p.render(ship,input(),501,true);
 assert.equal(shipPresentationPose(ship),undefined);assert.equal(p.stats().reason,'stale');
 p.receive(ship,0,510);p.render(ship,input(),510,false);assert.equal(p.stats().reason,'inactive');
 p.receive(ship,0,520);ship.isDead=true;p.render(ship,input(),520,true);assert.equal(shipPresentationPose(ship),undefined);
 ship.isDead=false;ship.isRetreated=true;p.receive(ship,0,530);p.render(ship,input(),530,true);assert.equal(p.stats().reason,'unavailable');
 ship.isRetreated=false;p.receive(ship,0,540);p.render(ship,input(),540,true);ship.pos.x+=10;p.receive(ship,0,556);p.render(ship,input(),556,true);
 p.receive(ship,0,800);p.render(ship,input(),800,true);assert.equal(shipPresentationPose(ship)!.pos.x,ship.pos.x);
 p.clear(ship);assert.equal(p.stats().active,false);assert.equal(shipPresentationPose(ship),undefined);
});

test('native world, mutable components, RNG, actions and authoritative motion remain unchanged',()=>{
 const {ship,engine,p}=setup();const before=captureCombat(engine,1,{0:0},0),rng=JSON.stringify([engine.random,engine.visualRandom]);
 const cmd=input(1,bit('KeyW')|bit('KeyE'));cmd.pointerActive=true;cmd.actions=['system'] as any;
 p.record(cmd,0);p.receive(ship,0,0);
 for(let t=0;t<250;t+=1000/60)p.render(ship,cmd,t,true);
 assert.deepEqual(captureCombat(engine,1,{0:0},0),before);assert.equal(JSON.stringify([engine.random,engine.visualRandom]),rng);
 assert.equal(ship.pos.x,0);assert.equal(ship.vel.x,60);
});

test('history and replay remain bounded under stalled authority and heavy local input',()=>{
 const {ship,p}=setup();p.receive(ship,0,0);
 for(let i=1;i<=300;i++)p.record(input(i,bit('KeyW')),i);
 p.render(ship,input(300,bit('KeyW')),499,true);
 assert.ok(p.stats().pendingInputs<=60);assert.ok(p.stats().replayMs<=250);
 p.render(ship,input(300),501,true);assert.equal(p.stats().pendingInputs,0);
});

test('waiting for a post-suspension baseline must not erase the fresh authority lane',()=>{
 const {ship,p}=setup();p.receive(ship,0,0);p.render(ship,input(),0,true);p.suspend(ship,'collision',true);
 const authority={pos:new Vector2(30,0),facing:0};setShipPresentationPose(ship,authority);
 p.render(ship,input(),16,true,ship,true);
 assert.equal(shipPresentationPose(ship),authority);assert.equal(p.stats().active,false);
});

for(const hz of [10,20,60])test(`held thrust/turn remains continuous at ${hz}Hz authority with 60Hz accepted inputs`,()=>{
 const {ship,p}=setup(),truth=setup().ship;ship.vel.set(0,0);truth.vel.set(0,0);
 const cmd=input(1,bit('KeyW')|bit('KeyA')|bit('ShiftLeft'));
 const assign=(target:Ship,source:Ship)=>{target.pos.copy(source.pos);target.vel.copy(source.vel);target.facingRad=source.facingRad;target.angularVelRad=source.angularVelRad;};
 for(let frame=0;frame<=180;frame++){
  const now=frame*1000/60;cmd.seq=frame+1;
  if(frame){applyPlayerControls(truth,{KeyW:true,KeyA:true,ShiftLeft:true},new Vector2(2000,0),false,undefined,false);advanceShipMotion(truth,1/60);}
  p.record(cmd,now);
  if(frame%(60/hz)===0){assign(ship,truth);p.receive(ship,cmd.seq,now);}
  p.render(ship,cmd,now,true);const pose=shipPresentationPose(ship)!;
  assert.ok(pose.pos.distanceTo(truth.pos)<1e-6,`${hz}Hz frame ${frame}: distance=${pose.pos.distanceTo(truth.pos)}`);
  assert.ok(Math.abs(pose.facing-truth.facingRad)<1e-6);
  if(frame>60)assert.ok(Math.abs(truth.facingRad)>.1,'fixture must actually turn');
 }
});

test('execution-time render consumes a recorded edge that a queued RAF stamp cannot yet replay',()=>{
 const before=setup(),after=setup();
 for(const {ship,p} of [before,after]){
  ship.vel.set(0,0);p.receive(ship,0,0);p.record(input(1,bit('KeyW')),100);
 }
 // Both receive the same live controls. Only the actual display time differs.
 before.p.render(before.ship,input(1,bit('KeyW')),90,true);
 after.p.render(after.ship,input(1,bit('KeyW')),170,true);
 assert.ok(shipPresentationPose(before.ship)!.pos.distanceTo(new Vector2())<1e-9);
 assert.ok(shipPresentationPose(after.ship)!.pos.distanceTo(new Vector2())>0.01);
 for(const {ship} of [before,after]){
  assert.equal(ship.pos.distanceTo(new Vector2()),0);assert.equal(ship.vel.distanceTo(new Vector2()),0);assert.equal(ship.facingRad,0);
 }
});
