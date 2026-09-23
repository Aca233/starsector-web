import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {Vector2} from '../src/engine/math/Vector2';
import type {Projectile} from '../src/engine/simulation/Weapon';
import type {CombatEngine} from '../src/engine/simulation/CombatEngine';
import {ProjectileFlightPrediction} from '../src/network/ProjectileFlightPrediction';
import {projectileFlightLayer,projectileDisplayPose} from '../src/engine/render/ProjectileFlightLayer';
import {setProjectileVisualLayer,projectileVisualLayer} from '../src/engine/render/ProjectileVisualLayer';
import {predictedProjectileLayer} from '../src/engine/render/PredictedProjectileLayer';
import {advanceSourceProjectile,initializeSourceProjectile} from '../src/engine/simulation/systems/weapon/SourceProjectileLifecycle';
import {combatRenderView} from '../src/engine/render/CombatRenderView';
import {assetManager} from '../src/engine/assets/AssetResolver';
import {createLanWorld} from '../src/network/LanWorld';
import {captureCombat,applyCombatSnapshot} from '../src/network/AuthorityCombatSnapshot';
import {LocalFirePrediction} from '../src/network/LocalFirePrediction';

function shot(type:Projectile['spawnType']='BALLISTIC'):Projectile {
 const p={id:.1234567890123456,specId:'test',sourceShipId:'source',slotId:'slot',pos:new Vector2(20,30),prevPos:new Vector2(10,29),vel:new Vector2(1000,50),
  facingRad:0,spawnType:type,rangeRemaining:2000,totalRange:2000,damage:100,empDamage:12,damageType:'KINETIC',radius:2,color:[255,255,255],elapsedTime:.1,fadeTime:.3,projLength:100,projWidth:6} as Projectile;
 initializeSourceProjectile(p,1000,new Vector2(0,50));return p;
}
const engine=(rows:Projectile[])=>({projectiles:rows} as CombatEngine);
function expected(p:Projectile,seconds:number):Projectile {
 const q={...p,pos:p.pos.clone(),prevPos:p.pos.clone(),ballisticTail:p.ballisticTail?.clone(),prevBallisticTail:p.ballisticTail?.clone()};
 let left=seconds;while(left>1e-12){const dt=Math.min(1/60,left);q.elapsedTime+=dt;advanceSourceProjectile(q,dt);left-=dt;}return q;
}
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function samePose(a:Projectile,b:Projectile){close(a.pos.x,b.pos.x);close(a.pos.y,b.pos.y);close(a.elapsedTime,b.elapsedTime);close(a.rangeRemaining,b.rangeRemaining);
 if(a.ballisticTail&&b.ballisticTail){close(a.ballisticTail.x,b.ballisticTail.x);close(a.ballisticTail.y,b.ballisticTail.y);}assert.equal(a.fadeProgress,b.fadeProgress);}

for(const type of ['BALLISTIC','BALLISTIC_AS_BEAM','PLASMA'] as const)test(`${type}: exact native head/tail/source velocity, no authority writes at 10/20/60Hz`,()=>{
 for(const hz of [10,20,60]){
  const p=shot(type),e=engine([p]),f=new ProjectileFlightPrediction();const before=JSON.stringify(p);f.receive(e,1,0);
  for(let frame=0;frame<=60/hz;frame++){const t=frame/60;f.render(e,t*1000,true);const display=projectileFlightLayer(e)!.get(p)!;samePose(display,expected(p,t));assert.equal(display.id,p.id);assert.equal(display.prevPos.x,display.pos.x);}
  assert.equal(JSON.stringify(p),before);assert.equal(projectileVisualLayer(e),undefined,'not the experimental layer');
 }
});

test('fractional RAF remainder never feeds back into fixed simulation; result independent of display cadence',()=>{
 const p=shot('BALLISTIC_AS_BEAM'),e=engine([p]);
 let result:Projectile|undefined;
 for(const times of [[100],[7,11,21,37,44,61,79,93,100],[1000/144,1000/72,47,90,100]]){
  const f=new ProjectileFlightPrediction();f.receive(e,1,0);for(const t of times)f.render(e,t,true);
  const q=projectileFlightLayer(e)!.get(p)!;samePose(q,expected(p,.1));if(result)samePose(q,result);result=q;
 }
});

test('100ms hard horizon holds; after 250ms stale/disabled/reset drops the display layer',()=>{
 const p=shot(),e=engine([p]),f=new ProjectileFlightPrediction();f.receive(e,1,0);f.render(e,100,true);const x=projectileFlightLayer(e)!.get(p)!.pos.x;
 for(const t of [101,200,250]){f.render(e,t,true);assert.equal(projectileFlightLayer(e)!.get(p)!.pos.x,x);}
 f.render(e,251,true);assert.equal(projectileFlightLayer(e),undefined);f.receive(e,2,300);f.render(e,301,true);assert.ok(projectileFlightLayer(e));
 f.render(e,302,false);assert.equal(projectileFlightLayer(e),undefined);f.reset();f.render(e,303,true);assert.equal(projectileFlightLayer(e),undefined);
});

test('does not cross known range, fade, retire or report an impact; source-speed range differs from world speed',()=>{
 for(const type of ['BALLISTIC','BALLISTIC_AS_BEAM','PLASMA'] as const){
  const p=shot(type);p.rangeRemaining=2;p.vel.set(1000,900);const e=engine([p]),f=new ProjectileFlightPrediction();f.receive(e,1,0);f.render(e,100,true);
  const q=projectileFlightLayer(e)!.get(p)!;assert.ok(q.rangeRemaining>0);assert.equal(q.fadeProgress,0);assert.equal(q.didDamage,undefined);assert.equal(e.projectiles.length,1);assert.ok(q.pos.x<22.00001);assert.ok(q.pos.y>31.79);
 }
});

for(const [name,patch] of Object.entries({rocket:{isRocket:true},guided:{isGuided:true},mine:{isMine:true},flare:{isFlare:true},impact:{didDamage:true},fade:{fadeProgress:.1},
 missile:{missileLifecycleSpec:{}},system:{systemFuseSeconds:1},spin:{angularVelocityRad:1},bomb:{inertialFlight:true},mote:{mote:{}},mirv:{mirv:{}},fuse:{proximityFuse:{}},life:{flightTimeRemaining:1},
 unknown:{spawnType:'OTHER'},invalid:{rangeRemaining:NaN},expired:{rangeRemaining:0},stopped:{vel:new Vector2(),sourceMoveSpeed:0}}))test(`unsupported ${name} retains authority interpolation`,()=>{
 const p=Object.assign(shot(),patch),e=engine([p]),f=new ProjectileFlightPrediction();const before=JSON.stringify(p);f.receive(e,1,0);f.render(e,50,true);
 assert.equal(projectileFlightLayer(e),undefined);assert.equal(projectileDisplayPose(p),p);assert.equal(JSON.stringify(p),before);
});

test('authority removal/reused array slots/fractional identities/old packets cannot resurrect shots',()=>{
 const p=shot(),e=engine([p]),f=new ProjectileFlightPrediction();f.receive(e,10,0);f.render(e,50,true);
 p.id=.1234567890123457;p.pos.set(500,20);f.receive(e,11,60);f.render(e,60,true);assert.equal(projectileFlightLayer(e)!.get(p)!.pos.x,500);assert.equal(projectileFlightLayer(e)!.get(p)!.id,p.id);
 f.receive(e,9,70);f.render(e,70,true);assert.equal(f.stats().tick,11);
 e.projectiles=[];f.receive(e,12,80);f.render(e,90,true);assert.equal(projectileFlightLayer(e),undefined);assert.equal(f.stats().entities,0);
});

test('experimental layer, invalid times, backward RAF and engine switches are bounded',()=>{
 const p=shot(),e=engine([p]),f=new ProjectileFlightPrediction();f.receive(e,1,10);f.render(e,9,true);assert.equal(projectileFlightLayer(e),undefined);
 f.render(e,90,true);f.render(e,30,true);samePose(projectileFlightLayer(e)!.get(p)!,expected(p,.02));
 for(const t of [NaN,Infinity]){f.render(e,t,true);assert.equal(projectileFlightLayer(e),undefined);}
 setProjectileVisualLayer(e,{projectiles:[],tick:2,time:0});f.render(e,30,true);assert.equal(projectileFlightLayer(e),undefined);setProjectileVisualLayer(e,null);
 const other=engine([shot()]);f.receive(other,1,0);f.render(other,50,true);assert.equal(projectileFlightLayer(e),undefined);assert.ok(projectileFlightLayer(other));
});

test('native simple fallback with absent tail/fade uses constant velocity without mutating shared vectors',()=>{
 const p=shot();p.fadeTime=undefined;p.ballisticTail=undefined;p.prevBallisticTail=undefined;const e=engine([p]),f=new ProjectileFlightPrediction();f.receive(e,1,0);f.render(e,50,true);
 const q=projectileFlightLayer(e)!.get(p)!;close(q.pos.x,70);close(q.pos.y,32.5);assert.equal(p.pos.x,20);assert.equal(q.ballisticTail,undefined);
});

test('handoff correction composes with flight once, and non-flight ghosts remain untouched',()=>{
 const p=shot(),e=engine([p]),f=new ProjectileFlightPrediction();f.receive(e,1,0);f.render(e,50,true);const correction={...p,pos:p.pos.clone().add(new Vector2(7,3))};
 const q=projectileDisplayPose(p,projectileFlightLayer(e),new Map([[p.id,correction]]));close(q.pos.x,77);close(q.pos.y,35.5);close(q.prevPos.x,q.pos.x);
 const ghost=shot();ghost.id=-1;assert.equal(projectileDisplayPose(ghost,projectileFlightLayer(e)),ghost);assert.equal(p.pos.x,20);
});

const root=path.resolve('public');
globalThis.fetch=async(input:any)=>{const file=path.resolve(root,String(input).replace(/^\//,''));if(!file.startsWith(root+path.sep))throw Error('Outside assets');return new Response(fs.readFileSync(file));};
await assetManager.ensureManifestLoaded();
const match:any={id:'flight-integration',seed:1511506142,hostId:'a',snapshotHz:60,players:[{id:'a',seat:0,team:0,hull:'hammerhead'},{id:'b',seat:1,team:1,hull:'hammerhead'}],options:{assignment:'teams',battleSize:3200,aiHulls:[[],[]]}};

test('real native snapshot + local fire + common render facade: handoff single shot and unchanged authority/RNG',()=>{
 const host=createLanWorld(match).engine,view=createLanWorld(match).engine,ship=host.playerShip,mount=ship.weapons.find(m=>m.spec.id==='heavymortar')!;
 ship.weaponGroups=[{index:0,mode:'LINKED',isAutofire:false,weaponSlotIds:[mount.slotId],alternatingIndex:0}];ship.selectedGroupIndex=0;
 ship.pos.set(0,0);ship.prevPos.set(0,0);ship.facingRad=mount.currentAngleRad=0;ship.aimTargetWorld.set(2000,0);
 applyCombatSnapshot(view,captureCombat(host,1,{0:0},0),true);
 const fire=new LocalFirePrediction(),flight=new ProjectileFlightPrediction();fire.receive(view,1,0,0);flight.receive(view,1,0);
 fire.record(view,{seq:1,keys:0,aim:[2000,0],firing:true,pointerActive:true,actions:[]},0,true);flight.render(view,16,true);fire.render(view,16,true);assert.equal(predictedProjectileLayer(view)?.projectiles.length,1);
 ship.isFiringMain=true;ship.weaponControl.update(1/60,ship,0,null,p=>host.projectiles.push(p),b=>host.beams.push(b));assert.equal(host.projectiles.length,1);
 applyCombatSnapshot(view,captureCombat(host,2,{0:1},0));flight.receive(view,2,32);fire.receive(view,2,1,32);
 const before=captureCombat(view,2,{0:1},0),rng=JSON.stringify([view.random,view.visualRandom]);
 flight.render(view,64,true);fire.render(view,64,true);assert.equal(fire.stats().matched,1);assert.equal(predictedProjectileLayer(view)?.projectiles.length??0,0);
 const renderView=combatRenderView(view),p=view.projectiles[0];assert.ok(renderView.projectileFlight?.get(p));assert.equal(renderView.projectileVisuals,undefined);
 const q=projectileDisplayPose(p,renderView.projectileFlight,renderView.projectilePrediction?.corrections);assert.notEqual(q.pos.x,p.pos.x);
 assert.deepEqual(captureCombat(view,2,{0:1},0),before);assert.equal(JSON.stringify([view.random,view.visualRandom]),rng);
 host.projectiles.length=0;applyCombatSnapshot(view,captureCombat(host,3,{0:1},0));flight.receive(view,3,80);fire.receive(view,3,1,80);flight.render(view,90,true);fire.render(view,90,true);
 assert.equal(projectileFlightLayer(view),undefined);assert.equal(predictedProjectileLayer(view),undefined);
});

test('deterministic 10/20Hz coast display advances each 60Hz frame; not a network-Hz metric',()=>{
 const rows=[];
 for(const hz of [10,20]){const p=shot(),e=engine([p]),f=new ProjectileFlightPrediction();let error=0;const positions=[];
  for(let i=0;i<=60;i++){const time=i/60;if(i%(60/hz)===0){p.pos.set(20+time*1000,30+time*50);p.rangeRemaining=2000-time*1000;p.elapsedTime=.1+time;f.receive(e,i,time*1000);}
   f.render(e,time*1000,true);const x=projectileFlightLayer(e)!.get(p)!.pos.x;error=Math.max(error,Math.abs(x-(20+time*1000)));positions.push(x);}
  assert.ok(positions.every((x,i)=>i===0||x>positions[i-1]));assert.ok(error<1e-7);rows.push({authorityHz:hz,renderSamples:61,maxCoastPositionError:error});}
 fs.mkdirSync('artifacts/network-stream-20260921/phase29',{recursive:true});fs.writeFileSync('artifacts/network-stream-20260921/phase29/coast.json',JSON.stringify({scope:'Known straight no-collision shot; simulated timestamps; not RTT/complete-world Hz',rows},null,2));
});

test('pooled native array slot refreshes appearance and optional lifecycle fields without retaining deleted keys',()=>{
 const p=shot(),e=engine([p]),f=new ProjectileFlightPrediction();p.projSpriteUrl='old.png';f.receive(e,1,0);f.render(e,30,true);
 p.spawnType='PLASMA';p.color=[10,20,30];delete p.projSpriteUrl;delete p.fadeTime;delete p.ballisticTail;delete p.prevBallisticTail;delete p.sourceMoveSpeed;
 f.receive(e,2,40);f.render(e,60,true);const q=projectileFlightLayer(e)!.get(p)!;
 assert.equal(q.projSpriteUrl,undefined);assert.deepEqual(q.color,[10,20,30]);assert.equal(q.spawnType,'PLASMA');assert.equal(q.ballisticTail,undefined);
 close(q.pos.x,p.pos.x+20);assert.equal(q.fadeTime,undefined);
});

test('authoritative impact or fade cancels flight on the next endpoint, leaving the native lifecycle visible',()=>{
 for(const patch of [{didDamage:true},{fadeProgress:.1}]){
  const p=shot(),e=engine([p]),f=new ProjectileFlightPrediction();f.receive(e,1,0);f.render(e,80,true);Object.assign(p,patch);p.pos.set(50,30);
  f.receive(e,2,81);f.render(e,82,true);assert.equal(projectileFlightLayer(e),undefined);assert.equal(projectileDisplayPose(p),p);assert.equal(p.pos.x,50);
 }
});
