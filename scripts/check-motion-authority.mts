import {MOTION_DISPLAY_ERROR,projectMotionDisplay} from '../src/network/MotionDisplay.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {assetManager} from '../src/engine/assets/AssetResolver';
import {createLanWorld} from '../src/network/LanWorld';
import {captureMotion} from '../src/network/CaptureMotion';
import {motionFromText} from '../src/network/MotionFrame.mjs';
const assets=path.resolve('public');
globalThis.fetch=async input=>{const p=path.resolve(assets,String(input).replace(/^\//,''));if(!p.startsWith(assets+path.sep))throw Error('Outside assets');return new Response(fs.readFileSync(p));};
await assetManager.ensureManifestLoaded();
const match:any={id:'motion-authority',hostId:'host',seed:157,snapshotHz:60,players:[{id:'host',seat:0,team:0,hull:'onslaught'},{id:'guest',seat:1,team:1,hull:'onslaught'}],options:{assignment:'teams',battleSize:3200,initialDeploymentLimit:0,aiHulls:[['hammerhead'],['hammerhead']]}};
test('critical display capture preserves ACKs and bounds pose error without writing simulation state',()=>{
 const engine=createLanWorld(match).engine;
 for(let tick=0;tick<=90;tick++){
  if(tick)engine.fixedUpdate(1/60);if(tick%15)continue;
  const before=engine.allCapitalShips.map(s=>[s.id,s.pos.x,s.pos.y,s.vel.x,s.vel.y,s.facingRad,s.angularVelRad,s.teleportSequence,s.isDead,s.isRetreated]);
  const frame=motionFromText(captureMotion(engine,tick,{0:tick,1:tick})!);
  assert.equal(frame.tick,tick);assert.equal(frame.time,engine.combatTime);assert.equal(frame.acknowledged[1],tick);
  const exact=engine.allCapitalShips.filter(s=>!engine.deployment.isReserve(s.id)).map(s=>[s.id,s.pos.x,s.pos.y,s.vel.x,s.vel.y,s.facingRad,s.angularVelRad,s.teleportSequence,(s.isDead?1:0)|(s.isRetreated?2:0)] as any);
  assert.deepEqual(frame.ships,projectMotionDisplay({...frame,ships:exact}).ships);
  for(let n=0;n<exact.length;n++)for(let i=1;i<=6;i++)assert.ok(Math.abs((frame.ships[n][i] as number)-exact[n][i])<=(i<=4?MOTION_DISPLAY_ERROR.linear:MOTION_DISPLAY_ERROR.angular));
  assert.deepEqual(before,engine.allCapitalShips.map(s=>[s.id,s.pos.x,s.pos.y,s.vel.x,s.vel.y,s.facingRad,s.angularVelRad,s.teleportSequence,s.isDead,s.isRetreated]));
 }
 const reserve=engine.allCapitalShips.find(s=>engine.deployment.isReserve(s.id));assert.ok(reserve);assert.ok(!motionFromText(captureMotion(engine,91,{0:91})!).ships.some(s=>s[0]===reserve.id));
 engine.deployment.deploy([reserve.id],reserve.teamId);reserve.teleportSequence++;reserve.pos.set(-0,123.456789012345);reserve.isDead=true;
 const row=motionFromText(captureMotion(engine,92,{0:92})!).ships.find(s=>s[0]===reserve.id)!;
 assert.ok(Object.is(row[1],-0));assert.equal(row[2],Math.fround(123.456789012345));assert.equal(row[7],reserve.teleportSequence);assert.equal(row[8],1);
});
test('unsupported fleets and invalid authority numbers disable the whole optional frame, not selected entities',()=>{
 const tooMany:any={allCapitalShips:Array.from({length:129},(_,id)=>({id})),deployment:{isReserve:()=>false}};assert.equal(captureMotion(tooMany,1,{}),null);
 const engine=createLanWorld(match).engine;engine.playerShip.vel.x=NaN;assert.equal(captureMotion(engine,1,{}),null);
});
