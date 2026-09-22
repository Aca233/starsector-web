import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {assetManager} from '../src/engine/assets/AssetResolver';
import {createLanWorld} from '../src/network/LanWorld';
import {captureCombat} from '../src/network/CombatSnapshot';
import {renderWeaponAngle,ProjectedRenderWeapon} from '../src/engine/runtime/local/RenderShipProjection';
import {LocalTurretPrediction} from '../src/network/LocalTurretPrediction';
import {weaponPresentationAngle} from '../src/engine/visual/WeaponPresentation';
import {setShipPresentationPose} from '../src/engine/visual/ShipPresentation';
import {Vector2} from '../src/engine/math/Vector2';
import {signedAngle} from '../src/engine/math/Angles';
import {advanceTurretAim} from '../src/engine/simulation/systems/weapon/WeaponAim';
import {blankInput} from '../src/network/protocol';
const root=path.resolve('public');
globalThis.fetch=async(input:any)=>{const file=path.resolve(root,String(input).replace(/^\//,''));if(!file.startsWith(root+path.sep))throw Error('Outside assets');return new Response(fs.readFileSync(file));};
await assetManager.ensureManifestLoaded();
const match:any={id:'turret-prediction',seed:1511506142,hostId:'a',snapshotHz:60,players:[{id:'a',seat:0,team:0,hull:'hammerhead'},{id:'b',seat:1,team:1,hull:'hammerhead'}],options:{assignment:'teams',battleSize:3200,aiHulls:[[],[]]}};
function setup(){
 const engine=createLanWorld(match).engine,ship=engine.playerShip;
 const mount=ship.weapons.find(m=>m.mountType==='TURRET'&&(m.spec.turnRateDegPerSec??30)>0&&m.arcDeg>=60)!;
 assert.ok(mount,'real turret fixture');ship.pos.set(0,0);ship.prevPos.set(0,0);ship.facingRad=0;ship.prevFacingRad=0;ship.angularVelRad=0;ship.fireControlMode='MANUAL';
 ship.weaponGroups=[{index:0,mode:'LINKED',isAutofire:false,weaponSlotIds:[mount.slotId],alternatingIndex:0}];ship.selectedGroupIndex=0;
 const base=mount.baseAngleDeg*Math.PI/180;mount.currentAngleRad=base;
 const input={...blankInput(),seq:1,pointerActive:true,aim:[mount.relativePos.x+1000*Math.cos(base+.4),mount.relativePos.y+1000*Math.sin(base+.4)] as [number,number]};
 const p=new LocalTurretPrediction();p.receive(engine,0,0,0);
 return{engine,ship,mount,p,input,base};
}

test('local cursor turns a native turret in the next display frame without waiting for a new authority packet',()=>{
 const f=setup(),before=captureCombat(f.engine,1,{0:0},0),rng=JSON.stringify([f.engine.random,f.engine.visualRandom]);
 f.p.record(f.input,0);f.p.render(f.engine,f.input,0,true);f.p.render(f.engine,f.input,1000/60,true);
 const a=weaponPresentationAngle(f.mount,0)!;assert.ok(a>f.base);assert.ok(a-f.base<=(f.mount.spec.turnRateDegPerSec??30)*Math.PI/180/60+1e-9);
 assert.deepEqual(captureCombat(f.engine,1,{0:0},0),before);assert.equal(JSON.stringify([f.engine.random,f.engine.visualRandom]),rng);assert.equal(f.mount.currentAngleRad,f.base);
 assert.equal(f.p.stats().active,true);
});

for(const hz of [10,20,60])test(`native motor remains continuous with ${hz}Hz full-state aiming ACKs`,()=>{
 const f=setup();let truth=f.base;
 for(let frame=0;frame<=120;frame++){
  const now=frame*1000/60;f.input.seq=frame+1;
  if(frame)truth=advanceTurretAim(truth,f.base,f.base+.4,f.mount.arcDeg,(f.mount.spec.turnRateDegPerSec??30)*Math.PI/180,0,1/60);
  f.p.record(f.input,now);
  if(frame%(60/hz)===0){f.mount.currentAngleRad=truth;f.p.receive(f.engine,frame+1,f.input.seq,now);}
  f.p.render(f.engine,f.input,now,true);
  assert.ok(Math.abs(signedAngle(weaponPresentationAngle(f.mount,0)!-truth))<1e-6,`frame ${frame}`);
 }
});

test('arc clamp, hull-relative presentation and unsupported mounts leave authoritative angles untouched',()=>{
 const f=setup();f.mount.arcDeg=60;f.input.aim=[-10000,10000];f.p.record(f.input,0);
 for(let t=0;t<250;t+=1000/60){f.p.render(f.engine,f.input,t,true);const a=weaponPresentationAngle(f.mount,0)!;assert.ok(Math.abs(signedAngle(a-f.base))<=Math.PI/6+1e-9);}
 setShipPresentationPose(f.ship,{pos:new Vector2(20,30),facing:.5});f.p.render(f.engine,f.input,250,true);const a=weaponPresentationAngle(f.mount,.5)!;assert.ok(Math.abs(signedAngle(a-.5-f.base))<=Math.PI/6+1e-9);
 assert.equal(f.mount.currentAngleRad,f.base);
 f.mount.isDisabled=true;f.p.render(f.engine,f.input,250,true);assert.equal(weaponPresentationAngle(f.mount,.5),undefined);
});

test('stale/reset/hidden/pointer loss clears the layer; fresh inactive baseline allows immediate cursor re-entry',()=>{
 const f=setup();f.p.record(f.input,0);f.p.render(f.engine,f.input,16,true);f.p.render(f.engine,f.input,251,true);assert.equal(weaponPresentationAngle(f.mount,0),undefined);
 f.p.receive(f.engine,2,1,300);f.p.render(f.engine,{...f.input,pointerActive:false},301,true);f.p.render(f.engine,f.input,310,true);assert.ok(weaponPresentationAngle(f.mount,0)!>f.base,'no extra full-snapshot wait');
 f.p.render(f.engine,f.input,320,false);assert.equal(weaponPresentationAngle(f.mount,0),undefined);f.p.reset();assert.equal(f.p.stats().mounts,0);
});

test('group/system action barriers, phase, death and teleport cannot reuse the old turret prediction',()=>{
 const f=setup();f.p.record(f.input,0);f.p.render(f.engine,f.input,16,true);
 f.p.record({...f.input,seq:2,actions:[{kind:'system',id:1} as any]},17);assert.equal(weaponPresentationAngle(f.mount,0),undefined);
 f.p.receive(f.engine,2,1,20);f.p.render(f.engine,f.input,21,true);assert.equal(f.p.stats().reason,'command');
 f.p.receive(f.engine,3,2,30);f.p.render(f.engine,f.input,40,true);assert.equal(f.p.stats().active,true);
 f.ship.teleportSequence++;f.p.render(f.engine,f.input,45,true);assert.equal(weaponPresentationAngle(f.mount,0),undefined);
 f.p.receive(f.engine,4,2,50);f.ship.isDead=true;f.p.render(f.engine,f.input,60,true);assert.equal(weaponPresentationAngle(f.mount,0),undefined);
});

test('renderer facade and predicted projectile origin read only the visual angle; live battle wires reset, ACK and record',()=>{
 const f=setup(),before=captureCombat(f.engine,1,{0:0},0);f.p.record(f.input,0);f.p.render(f.engine,f.input,16,true);
 const visual=weaponPresentationAngle(f.mount,0)!;assert.notEqual(visual,f.mount.currentAngleRad);
 assert.equal(renderWeaponAngle(f.mount,0),visual,'the native render facade must preserve local turret presentation');
 const projected=Object.assign(new ProjectedRenderWeapon(),{currentAngleRad:f.base,presentationRelativeAngle:visual});
 assert.equal(renderWeaponAngle(projected,.25),visual+.25,'detached render mounts consume their own visual relative angle');
 assert.deepEqual(captureCombat(f.engine,1,{0:0},0),before,'neither facade changes authoritative weapon angles');
 f.p.reset();assert.equal(renderWeaponAngle(f.mount,0),undefined);
 const render=fs.readFileSync('src/engine/render/webgl/passes/WebGLShipPass.ts','utf8');assert.ok(render.includes('renderWeaponAngle(mount, shipFacing)'));assert.ok(render.includes('!hulk && copyAlpha === undefined'));
 const fire=fs.readFileSync('src/network/LocalFirePrediction.ts','utf8');assert.ok(fire.includes('weaponPresentationAngle(mount, facing)'));
 const live=fs.readFileSync('src/network/LanBattle.tsx','utf8');for(const text of ['turretPrediction.record(input, now)','turretPrediction.receive(engine, snapshot.tick','turretPrediction.render(engine','turretPrediction.reset()'])assert.ok(live.includes(text));
});
