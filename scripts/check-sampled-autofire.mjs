/** Frozen host regression and live-safety fixtures; build the same-named artifact bundle first. */
import assert from 'node:assert/strict';import fs from 'node:fs';
import {root,world,match,sha,witness,perturb} from '../artifacts/lan-sampled-autofire-20260929/common.mjs';import {replicaDigest} from '../artifacts/lan-sampled-autofire-20260929/replica.mjs';
const api=await import('../artifacts/lan-sampled-autofire-20260929/after.mjs');await api.assetManager.ensureManifestLoaded();
const passed=[];const test=(name,fn)=>{fn();passed.push(name);console.log('ok '+name);};
const e=world(api,'large-battle-v3'),ship=e.playerShip,target=e.enemyShip,friend=e.allCapitalShips.find(s=>s!==ship&&s.teamId===ship.teamId);
for(const [s,x]of [[ship,0],[target,1000],[friend,500]]){s.pos.set(x,0);s.vel.set(0,0);s.facingRad=0;s.angularVelRad=0;s.shield.setActive(false);s.flux.softFlux=s.flux.hardFlux=0;s.flux.isOverloaded=s.flux.isVenting=false;s.isDead=false;}
ship.fireControlMode='AI';ship.currentTargetShip=target;
const base=ship.weapons[0];const gun=(id='unit')=>({...base,slotId:id,relativePos:new api.Vector2(0,0),baseAngleDeg:0,arcDeg:360,mountType:'TURRET',currentAngleRad:0,isDisabled:false,firingState:'IDLE',firingStateTimer:0,burstRemaining:0,cooldownTimer:0,ammo:Infinity,spec:{...base.spec,id:'sample-test',mountSize:'SMALL',weaponType:'ENERGY',range:2200,projSpeed:2000,projRadius:1,damagePerShot:100,fluxPerShot:0,fluxPerSecond:0,isBeam:true,isPointDefense:false,isGuided:false,isRocket:false,spawnType:'BEAM',fireRecoilSpeed:0,aiHints:api.immutableCopy([])}});
const scene={ships:[ship,target],missiles:[],asteroids:[]},intent=()=>({target:{kind:'SHIP',entity:target},point:target.pos.clone()});
const fire=(c,m,i=intent(),w=scene)=>c.decideSampled(ship,m,i,w,1/60);
function fresh(){const c=new api.AutofireController(),m=gun(),a=c.sampledAim(1/60,ship,m,scene);assert.ok(a.intent);assert.equal(fire(c,m,a.intent),'FIRE');return{c,m,a};}
test('20Hz deterministic stagger, no catch-up and per-physics-step tracker clocks',()=>{
 const phases=[];
 for(let index=0;index<6;index++){
  const c=new api.AutofireController(),d=new api.AutofireController(),m=gun('clock-'+index),n=gun('clock-'+index),schedule=[];let old;
  for(let k=0;k<600;k++){
   const firing=k%11<4;for(const x of [m,n])x.firingState=firing?'ACTIVE':'IDLE';
   const a=c.sampledAim(1/60,ship,m,scene);d.aim(1/60,ship,n,scene);
   if(old!==a){schedule.push(k);old=a;}
   const p=c.trackers.get(m),q=d.trackers.get(n);assert.ok(Math.abs(p.firingTime-q.firingTime)<1e-9,'firing clock '+k);assert.ok(Math.abs(p.idleFireTime-q.idleFireTime)<1e-9,'idle clock '+k);
   assert.ok(a.remaining>0&&a.remaining<=.05+1e-9);assert.ok(!('speed'in(a.intent??{}))&&!('range'in(a.intent??{}))&&!('delay'in(a.intent??{})));
  }
  assert.ok(schedule.length>=200&&schedule.length<=202);assert.ok(schedule.slice(2).every((x,j)=>x-schedule[j+1]===3));phases.push(schedule[1]);
  const copy=new api.AutofireController(),copyMount=gun('clock-'+index),again=[];let prior;for(let k=0;k<12;k++){const a=copy.sampledAim(1/60,ship,copyMount,scene);if(a!==prior){again.push(k);prior=a;}}assert.deepEqual(again,schedule.filter(k=>k<12));
  let calls=0;const original=c.aim;c.aim=function(...args){calls++;return original.apply(this,args);};c.sampledAim(.8,ship,m,scene);assert.equal(calls,1);
 }
 assert.ok(new Set(phases).size>1,'mount phases must stagger');
});
test('held steering is not a fire permit; live range, arc, muzzle, target motion and bore',()=>{
 const {c,m}=fresh(),i=intent();i.point.set(-5000,6000);assert.equal(fire(c,m,i),'FIRE','held point not reused as collision geometry');
 m.currentAngleRad=Math.PI/2;assert.equal(fire(c,m,i),'ALIGNING');m.currentAngleRad=0;m.spec.range=10;assert.notEqual(fire(c,m,i),'FIRE');m.spec.range=2200;
 m.baseAngleDeg=90;m.arcDeg=10;assert.equal(fire(c,m,i),'ALIGNING');m.baseAngleDeg=0;m.arcDeg=360;
 target.pos.set(9000,0);assert.notEqual(fire(c,m,i),'FIRE');target.pos.set(1000,0);m.relativePos.set(0,800);assert.notEqual(fire(c,m,i),'FIRE');m.relativePos.set(0,0);
 m.spec.isBeam=false;m.spec.spawnType='PROJECTILE';m.spec.projSpeed=0;assert.equal(fire(c,m,i),'UNAVAILABLE','live zero-speed projectile cannot reuse an earlier intent');m.spec.isBeam=true;m.spec.spawnType='BEAM';m.spec.projSpeed=2000;
 const seen=[];c.decide=function(s,m,solution,w,dt,expiry){seen.push({range:solution.range,speed:solution.speed,delay:solution.delay,dt,expiry});return 'ALIGNING';};
 fire(c,m,i);m.spec.range=4400;m.spec.projSpeed=3100;m.firingState='CHARGING';m.firingStateTimer=.7;fire(c,m,i);
 assert.ok(seen[1].range>seen[0].range);assert.ok(seen[1].speed>seen[0].speed);assert.equal(seen[1].delay,.7);assert.equal(seen[1].dt,1/60);assert.equal(seen[1].expiry,true);
});
test('every-step friendly/asteroid, ammo, flux, disabled/phase and weapon availability checks',()=>{
 const {c,m}=fresh();assert.equal(fire(c,m,intent(),{...scene,ships:[ship,target,friend]}),'FRIENDLY_BLOCKED');assert.equal(fire(c,m,intent(),{...scene,asteroids:[{id:'rock',pos:new api.Vector2(500,0),vel:new api.Vector2(),radius:150,hp:100}]}),'OBSTACLE_BLOCKED');
 m.ammo=0;assert.equal(fire(c,m),'CONSERVING_AMMO');m.ammo=Infinity;m.spec.fluxPerSecond=1e9;assert.equal(fire(c,m),'FLUX_BUDGET');m.spec.fluxPerSecond=0;
 for(const key of ['isVenting','isOverloaded']){ship.flux[key]=true;assert.equal(fire(c,m),'UNAVAILABLE');ship.flux[key]=false;}m.isDisabled=true;assert.equal(fire(c,m),'UNAVAILABLE');m.isDisabled=false;Object.defineProperty(ship,'isPhased',{value:true,configurable:true});assert.equal(fire(c,m),'UNAVAILABLE');delete ship.isPhased;
 const original=ship.system.canFireWeapon;ship.system.canFireWeapon=()=>false;assert.equal(fire(c,m),'UNAVAILABLE');ship.system.canFireWeapon=original;
});
test('death, removal, hostility and missile expiry cannot use a held intent',()=>{
 const {c,m,a}=fresh();c.trackers.get(m).sampledAim.remaining=.05;target.isDead=true;const held=c.sampledAim(1/60,ship,m,scene);assert.equal(held.intent,null);assert.equal(held.point,null);assert.notEqual(fire(c,m,a.intent),'FIRE');target.isDead=false;
 assert.equal(fire(c,m,intent(),{...scene,ships:[ship]}),'NO_TARGET');const side=target.teamId;target.teamId=ship.teamId;assert.equal(fire(c,m),'NO_TARGET');target.teamId=side;
 const p={id:123,teamId:side,pos:new api.Vector2(500,0),vel:new api.Vector2(),radius:5,hitpoints:100,isRocket:true,flightTimeRemaining:5};m.spec.isPointDefense=true;const w={...scene,missiles:[p]},i={target:{kind:'MISSILE',entity:p},point:p.pos.clone()};assert.equal(fire(c,m,i,w),'FIRE');
 p.hitpoints=0;assert.equal(fire(c,m,i,w),'NO_TARGET');p.hitpoints=100;p.flightTimeRemaining=0;assert.equal(fire(c,m,i,w),'NO_TARGET');p.flightTimeRemaining=.1;m.firingState='CHARGING';m.firingStateTimer=.2;assert.equal(fire(c,m,i,w),'NO_TARGET');
 m.firingState='IDLE';m.spec.isBeam=false;m.spec.spawnType='PROJECTILE';m.spec.chargeTime=0;assert.equal(fire(c,m,i,w),'NO_TARGET','missile expires before actual projectile contact');p.flightTimeRemaining=5;assert.equal(fire(c,m,i,w),'FIRE');
});
test('spec replacement, fallback, clear/reset discard samples; held steps still permit continuous fire',()=>{
 const {c,m,a}=fresh();m.spec={...m.spec};const b=c.sampledAim(1/60,ship,m,scene);assert.notEqual(a,b);c.dropAimSample(m);assert.equal(c.trackers.get(m).sampledAim,undefined);c.sampledAim(1/60,ship,m,scene);c.clear(m);assert.equal(c.trackers.get(m),undefined);c.sampledAim(1/60,ship,m,scene);c.reset();assert.equal(c.trackers.get(m),undefined);
 for(let k=0;k<60;k++){const sample=c.sampledAim(1/60,ship,m,scene);assert.equal(fire(c,m,sample.intent),'FIRE','not a 20Hz trigger duty cycle');}
});
test('full weapon loop keeps stationary beam/burst emission times, ammo and cooldown cadence',()=>{
 const run=(sampled,beam)=>{const control=new(ship.weaponControl.constructor)(),m=gun('emission');m.ammo=200;m.ammoRechargeProgress=0;m.spec={...m.spec,isBeam:beam,spawnType:beam?'BEAM':'PROJECTILE',beamVisualMode:'SUSTAINED',maxAmmo:200,ammoRegenPerSec:2,beamSourceChargeupTime:0,chargeTime:0,refireDelay:.1,burstSize:beam?1:3,burstDelay:.03,damagePerSecond:100,minSpread:0,maxSpread:0,spreadPerShot:0,fireRecoilSpeed:0};control.weapons=[m];const events=[],states=[];ship.flux.softFlux=ship.flux.hardFlux=0;ship.vel.set(0,0);
  const w={...scene,...(sampled?{sampledAutofire:{playerShip:target,fullRateShipIds:new Set()}}:{})};
  for(let tick=0;tick<60;tick++){control.update(1/60,ship,0,target,p=>events.push([tick,'p',p.damage]),b=>events.push([tick,'b',b.damagePerSec]),undefined,w);states.push([m.firingState,m.cooldownTimer,m.firingStateTimer,m.burstRemaining,m.ammo]);}if(sampled)assert.ok(control.autofire.trackers.get(m)?.sampledAim,'fixture must exercise sampling');return{events,states};};
 for(const beam of [true,false]){const a=run(false,beam),b=run(true,beam);if(beam){assert.equal(a.events.length,1,'sustained beam spawns once');assert.ok(a.states.every(s=>s[0]==='ACTIVE'),'beam remains active on all steps');}else assert.ok(a.events.length>10,'burst fixture active');assert.deepEqual(b,a,beam?'sustained beam':'burst');}
});
const observed=await import('../artifacts/lan-sampled-autofire-20260929/observed-after.mjs');await observed.assetManager.ensureManifestLoaded();const counters=()=>({scans:0,preAim:0,aim:0,samples:[],fresh:0,safeChecks:0});globalThis.__fireCounts=counters();const engine=world(observed,'large-battle-v3');for(let t=0;t<12;t++)engine.fixedUpdate(1/60);const actualCounts={...__fireCounts,samples:__fireCounts.samples.length};
test('real host samples only eligible AI turrets and keeps human/modules/aircraft independent',()=>{
 assert.ok(__fireCounts.samples.length>100);assert.ok(__fireCounts.fresh<__fireCounts.samples.length*.5);assert.equal(__fireCounts.safeChecks,__fireCounts.samples.length);
 for(const row of __fireCounts.samples){const s=engine.ships.find(s=>s.id===row.ship),m=s.weapons.find(m=>m.slotId===row.slot);assert.ok(!engine.fullRateAIShipIds.has(s.assemblyRoot.id));assert.notEqual(s.assemblyRoot,engine.playerShip);assert.notEqual(s.spec.hullSize,'FIGHTER');assert.ok(['SMALL','MEDIUM'].includes(m.spec.mountSize));assert.equal(m.mountType,'TURRET');assert.ok(!m.spec.isGuided&&!m.spec.isRocket&&m.spec.weaponType!=='MISSILE');}
 assert.equal(engine.aiDecisionProfile,'large-battle-v3');assert.equal(engine.canPreviewNativeAI,false);
});
test('unknown callbacks/accessors and custom system policy use legacy calls and drop pending samples',()=>{
 const s=engine.allCapitalShips.find(s=>!engine.fullRateAIShipIds.has(s.id)),a=s.weaponControl.autofire,old=a.aim;let calls=0;a.aim=function(...args){assert.equal(args.length,4);calls++;return old.apply(this,args);};globalThis.__fireCounts=counters();engine.fixedUpdate(1/60);assert.ok(calls>0);assert.ok(!__fireCounts.samples.some(x=>x.ship===s.id));a.aim=old;
 const spec=s.weapons[0].spec,range=spec.range;Object.defineProperty(spec,'range',{get:()=>range,configurable:true,enumerable:true});globalThis.__fireCounts=counters();engine.fixedUpdate(1/60);assert.ok(!__fireCounts.samples.some(x=>x.ship===s.id));Object.defineProperty(spec,'range',{value:range,writable:true,configurable:true,enumerable:true});
 const oldPolicy=s.system.autofirePolicy;s.system.autofirePolicy=()=>({priority:'SUPPRESS',suspended:true});globalThis.__fireCounts=counters();engine.fixedUpdate(1/60);assert.ok(!__fireCounts.samples.some(x=>x.ship===s.id));for(const m of s.weapons)assert.equal(a.trackers.get(m)?.sampledAim,undefined);s.system.autofirePolicy=oldPolicy;
});
// Each pair is independently bundled; do not compare the intentional v1/v3 outcomes.
const cases=[['before.mjs?s0','standard'],['after.mjs?s1','standard'],['before.mjs?v1a','large-battle-v1'],['after.mjs?v1b','large-battle-v1'],['after.mjs?v3a','large-battle-v3'],['after.mjs?v3b','large-battle-v3']];const apis=[],engines=[],replicas=[];
for(const [file,profile]of cases){const a=await import('../artifacts/lan-sampled-autofire-20260929/'+file);await a.assetManager.ensureManifestLoaded();apis.push(a);engines.push(world(a,profile));}
const hashes=[];for(let tick=1;tick<=60;tick++){const wires=[],states=[],receivers=[];for(let i=0;i<apis.length;i++){const a=apis[i],e=engines[i];perturb(e,tick);e.fixedUpdate(1/60);const wire=a.encodeProjectedBinaryFrame(a.pipelineFrame(tick),true);wires.push(Buffer.from(wire));const decoded=a.decodeBinaryFrame(wire);if(replicas[i])a.applyLanDisplaySnapshot(replicas[i],decoded);else replicas[i]=a.createLanDisplayWorld(match,0,decoded).world;states.push(sha(JSON.stringify(witness(a,e,tick))));receivers.push(replicaDigest(a,replicas[i]));}
for(const [i,j]of [[0,1],[2,3],[4,5]]){assert.ok(wires[i].equals(wires[j]),'wire '+tick+'/'+i);assert.equal(states[i],states[j],'authority hidden '+tick+'/'+i);assert.deepEqual(receivers[i],receivers[j],'receiver '+tick+'/'+i);}hashes.push({tick,states,receivers});if(tick%20===0)console.log('five-stage pairs '+tick+'/60');}
passed.push('standard/v1 exact and v3 deterministic: 60 perturbed steps with wire/authority/hidden/receiver');
const reset=world(apis[5],'standard');assert.equal(reset.aiDecisionProfile,'standard');fs.writeFileSync(root+'/correctness.json',JSON.stringify({passed,actualCounts,hashes},null,2));console.log({passed:passed.length,actualCounts});
