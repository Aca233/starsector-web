/** Legacy frozen regression by default. COMBAT_MULTIRATE_BUNDLE=<current .mjs>
 * runs the old/new unit fixtures with the existing seed917 scene, no frozen imports.
 * COMBAT_MULTIRATE_UNIT_START=13 skips previously passed cases (focused only, 1-based). */
import assert from 'node:assert/strict';import fs from 'node:fs';
import path from 'node:path';import {pathToFileURL} from 'node:url';
const focusedBundle=process.env.COMBAT_MULTIRATE_BUNDLE?.trim();
const unitStartText=process.env.COMBAT_MULTIRATE_UNIT_START?.trim();
assert.ok(!unitStartText||focusedBundle,'unit filtering requires explicit COMBAT_MULTIRATE_BUNDLE');
assert.ok(!unitStartText||/^[1-9]\d*$/.test(unitStartText),'COMBAT_MULTIRATE_UNIT_START must be a 1-based positive index');
const unitStart=unitStartText?Number(unitStartText):1;
assert.ok(Number.isSafeInteger(unitStart),'unit start must be a safe integer');
let api,e,focusedWorld,root,world,match,sha,witness,perturb,replicaDigest;
if(focusedBundle){
 api=await import(pathToFileURL(path.resolve(focusedBundle)).href);
 const required=['AutofireController','Vector2','immutableCopy','assetManager','createLanWorld',
  'createBundledPresetDesign','FireControlQueryRoster','enableWorkerOwnedPhaseReads'];
 const missing=required.filter(name=>api[name]===undefined);
 assert.equal(missing.length,0,'current bundle entry must export: '+missing.join(', '));
 // The only file-fetch adapter is for the local manifest requested by this
 // loader. Never start a server, load frozen sources or replace combat methods.
 const fetch=globalThis.fetch;
 globalThis.fetch=async(input,...args)=>{
  const url=typeof input==='string'?input:input instanceof URL?input.href:input?.url;
  if(url==='/game-assets/asset-manifest.json')return new Response(
   fs.readFileSync(new URL('../public/game-assets/asset-manifest.json',import.meta.url)),
   {status:200,headers:{'content-type':'application/json'}});
  return fetch(input,...args);
 };
 try{await api.assetManager.ensureManifestLoaded();}finally{globalThis.fetch=fetch;}
 ({world:focusedWorld}=await import('../artifacts/combat-fire-scan-program-20261004/scenario.mjs'));
 e=focusedWorld(api);
 console.log('focused current-bundle units: '+path.resolve(focusedBundle));
}else{
 ({root,world,match,sha,witness,perturb}=await import('../artifacts/lan-sampled-autofire-20260929/common.mjs'));
 ({replicaDigest}=await import('../artifacts/lan-sampled-autofire-20260929/replica.mjs'));
 api=await import('../artifacts/lan-sampled-autofire-20260929/after.mjs');await api.assetManager.ensureManifestLoaded();
 e=world(api,'large-battle-v3');
}
const passed=[],skippedUnits=[];let unitIndex=0;
const test=(name,fn)=>{
 const index=++unitIndex;
 if(index<unitStart){skippedUnits.push({index,name});console.log('SKIP prior unit '+index+': '+name);return;}
 fn();passed.push(name);console.log('ok '+name);
};
const ship=e.playerShip,target=e.enemyShip,friend=e.allCapitalShips.find(s=>s!==ship&&s.teamId===ship.teamId);
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
// New-rule fixtures deliberately opt in through the world contract, not through
// large-battle-v3. All frozen legacy checks above/below remain intact.
const multirateWorld=(w=scene,fullRateShipIds=new Set(),playerShip=target)=>({
 ...w,sampledAutofire:{playerShip,fullRateShipIds,cadence:'multirate'},
});
function observedCadence(c){
 const counts={solves:[],scans:[],preAim:0,tick:0},solve=c.solveAim,preAim=c.preAim;
 c.solveAim=function(...args){
  const state=args[3],gate=state.acquisitionCadence,before=gate?.remaining;
  counts.solves.push(counts.tick);
  const value=solve.apply(this,args);
  if(before<=1e-9&&gate.remaining>1e-9)counts.scans.push({tick:counts.tick,next:state.scanIn});
  return value;
 };
 c.preAim=function(...args){counts.preAim++;return preAim.apply(this,args);};
 return counts;
}
function nativePlan(control,m,w=multirateWorld(),owner=ship){
 control.weapons=[m];
 return control.planFire(control.advanceState(1/60,owner),0,target,w);
}
test('multirate first-step aim, stable 20/30Hz phases and max 10/30Hz empty acquisition windows',()=>{
 for(const pd of [false,true]){
  const phases=[];
  for(let index=0;index<8;index++){
   const run=()=>{
    const c=new api.AutofireController(),m=gun('multirate-clock-'+index),counts=observedCadence(c);
    m.spec.isPointDefense=pd;
    const w=multirateWorld({ships:[ship],missiles:[],asteroids:[]});
    for(let tick=0;tick<600;tick++){
     counts.tick=tick;
     const sample=c.sampledAim(1/60,ship,m,w);
     assert.equal(sample.cadence,'multirate');
     assert.equal(sample.intent,null);
     assert.ok(sample.remaining>0&&sample.remaining<=(pd?1/30:.05)+1e-9);
    }
    assert.equal(counts.solves[0],0);assert.equal(counts.scans[0].tick,0,'first scan is immediate');
    const aimSteps=pd?2:3,scanSteps=pd?2:6;
    assert.ok(counts.solves.length>=(pd?300:200)&&counts.solves.length<=(pd?301:201));
    assert.ok(counts.solves.slice(2).every((tick,i)=>tick-counts.solves[i+1]===aimSteps));
    assert.ok(counts.scans.slice(1).every((row,i)=>row.tick-counts.scans[i].tick>=scanSteps),'no faster acquisition floor');
    assert.ok(counts.scans.length<=(pd?300:100),'bounded candidate windows');
    assert.ok(counts.scans.length>=(pd?299:99),'PD is not accidentally behind a 20Hz outer gate');
    assert.equal(counts.preAim,counts.scans.length,'preAim may not scan on aim-only steps');
    const before={aim:counts.solves.length,scan:counts.scans.length};
    counts.tick=600;c.sampledAim(.8,ship,m,w);
    assert.equal(counts.solves.length,before.aim+1);assert.equal(counts.scans.length,before.scan+1);
    c.sampledAim(.001,ship,m,w);
    assert.equal(counts.solves.length,before.aim+1,'no retained catch-up debt');
    return {aim:counts.solves.slice(0,before.aim),scan:counts.scans.slice(0,before.scan)};
   };
   const a=run(),b=run();assert.deepEqual(a,b,'same ship+slot phase and acquisition schedule');
   phases.push(a.aim[1]);
  }
  assert.ok(new Set(phases).size>1,'stable slot phase is not fleet-synchronized');
 }
});
test('multirate tracker firing/idle/scan clocks advance once per physical tick, independently of solving',()=>{
 for(const pd of [false,true]){
  const c=new api.AutofireController(),m=gun('multirate-timers'),w=multirateWorld({ships:[ship],missiles:[],asteroids:[]});
  m.spec.isPointDefense=pd;c.sampledAim(1/60,ship,m,w);
  const state=c.trackers.get(m);state.scanIn=20;state.firingTime=0;state.idleFireTime=0;
  let firing=0,idle=0,scan=20;
  for(let tick=0;tick<480;tick++){
   m.firingState=tick<5?'ACTIVE':'IDLE';m.burstRemaining=tick>=5&&tick<9?1:0;m.cooldownTimer=tick>=9&&tick<13?.2:0;
   if(tick<13){firing+=1/60;idle=0;}else{idle+=1/60;if(idle>3)firing=0;}scan-=1/60;
   c.sampledAim(1/60,ship,m,w);
   assert.ok(Math.abs(state.firingTime-firing)<1e-9,'firing '+pd+'/'+tick);
   assert.ok(Math.abs(state.idleFireTime-idle)<1e-9,'idle '+pd+'/'+tick);
   assert.ok(Math.abs(state.scanIn-scan)<1e-9,'scan exactly once '+pd+'/'+tick);
  }
 }
});
test('multirate acquisition windows never accelerate retained .125-1s source scan intervals',()=>{
 for(const [size,pd,min,max]of [['SMALL',false,.125,.25],['MEDIUM',false,.25,.5],['LARGE',false,.5,1],['LARGE',true,.125,.25]]){
  const c=new api.AutofireController(),m=gun('retained-'+size+'-'+pd),counts=observedCadence(c),w=multirateWorld();
  m.spec.mountSize=size;m.spec.isPointDefense=pd;
  for(let tick=0;tick<900;tick++){
   counts.tick=tick;const sample=c.sampledAim(1/60,ship,m,w);
   assert.equal(sample.intent?.target.entity,target);
   assert.deepEqual(Object.keys(sample.intent).sort(),['point','target'],'only aim intent crosses steps');
  }
  assert.ok(counts.scans.length>5);
  for(let i=0;i<counts.scans.length;i++){
   const row=counts.scans[i];assert.ok(row.next>=min&&row.next<=max);
   if(i+1<counts.scans.length)assert.ok((counts.scans[i+1].tick-row.tick)/60>=row.next-1e-9,'window must not force earlier scan');
  }
  assert.equal(counts.preAim,0,'retained-target aim does not secretly enumerate preAim candidates');
 }
});
test('multirate held target loss invalidates immediately without bypassing the ordinary scan rate floor',()=>{
 const cases=[
  ['death',()=>{target.isDead=true;},()=>{target.isDead=false;}],
  ['removal',w=>{w.ships=[ship];},()=>{}],
  ['hostility',()=>{target.teamId=ship.teamId;},()=>{target.teamId=side;}],
  ['collisionless',()=>{Object.defineProperty(target,'isCollisionless',{value:true,configurable:true});},()=>{delete target.isCollisionless;}],
 ];
 const side=target.teamId;
 for(const [name,invalidate,restore]of cases){
  const c=new api.AutofireController(),m=gun('lost-'+name),w=multirateWorld(),sample=c.sampledAim(1/60,ship,m,w),state=c.trackers.get(m),heldIntent=sample.intent;
  assert.ok(sample.intent);state.acquisitionCadence.remaining=.09;sample.remaining=.04;
  state.firingTime=2;state.idleFireTime=1;
  try{
   invalidate(w);const next=c.sampledAim(1/60,ship,m,w);
   assert.equal(next.intent,null,name);assert.equal(next.point,null,name);assert.equal(state.target,undefined,name);
   assert.equal(state.firingTime,0);assert.equal(state.idleFireTime,0);
   assert.ok(Math.abs(state.acquisitionCadence.remaining-(.09-1/60))<1e-9,'loss is not permission to rescan');
   assert.notEqual(fire(c,m,heldIntent,w),'FIRE');
  }finally{restore();}
 }
 for(const field of ['hitpoints','flightTimeRemaining','collisionDisabled']){
  const c=new api.AutofireController(),m=gun('lost-missile-'+field);
  m.spec.isPointDefense=true;m.spec.aiHints=api.immutableCopy(['PD_ONLY']);
  const p={id:9123,teamId:side,pos:new api.Vector2(500,0),vel:new api.Vector2(),radius:5,hitpoints:100,isRocket:true,flightTimeRemaining:5};
  const w=multirateWorld({...scene,missiles:[p]}),sample=c.sampledAim(1/60,ship,m,w),state=c.trackers.get(m),heldIntent=sample.intent;
  assert.equal(sample.intent?.target.kind,'MISSILE');sample.remaining=1/30;state.acquisitionCadence.remaining=1/30;
  p[field]=field==='collisionDisabled'?true:0;
  const next=c.sampledAim(1/60,ship,m,w);assert.equal(next.intent,null);assert.equal(next.point,null);
  assert.equal(m.fireControlTargetProjectileId,undefined);assert.notEqual(fire(c,m,heldIntent,w),'FIRE');
 }
});
test('multirate spec, PD class, control, disabled and suspension changes reset pending schedules',()=>{
 const c=new api.AutofireController(),m=gun('multirate-reset'),w=multirateWorld();
 let sample=c.sampledAim(1/60,ship,m,w),state=c.trackers.get(m);sample.remaining=.04;
 m.spec={...m.spec,mountSize:'LARGE'};sample=c.sampledAim(1/60,ship,m,w);
 assert.notEqual(c.trackers.get(m),state);assert.ok(sample.intent,'replacement immediately solves');
 for(const edit of [()=>{m.spec.range+=50;},()=>{m.spec.projSpeed+=100;},()=>{m.baseAngleDeg+=5;},
  ()=>{m.arcDeg-=10;},()=>{m.relativePos.x+=1;},()=>{m.relativePos.y+=1;}]){
  state=c.trackers.get(m);sample.remaining=.04;edit();sample=c.sampledAim(1/60,ship,m,w);
  assert.notEqual(c.trackers.get(m),state);assert.ok(sample.intent,'explicit geometric guard immediately solves');
 }
 state=c.trackers.get(m);m.spec.isPointDefense=true;sample=c.sampledAim(1/60,ship,m,w);
 assert.notEqual(c.trackers.get(m),state);assert.equal(c.trackers.get(m).acquisitionCadence.period,1/30);
 const policy=ship.system.autofirePolicy;
 try{
  for(const transition of ['manual','disabled','suspended']){
   if(transition==='manual')ship.fireControlMode='MANUAL';
   if(transition==='disabled')m.isDisabled=true;
   if(transition==='suspended')ship.system.autofirePolicy=()=>({priority:'SUPPRESS',suspended:true});
   assert.equal(c.sampledAim(1/60,ship,m,w).intent,null);assert.equal(c.trackers.get(m),undefined,transition);
   ship.fireControlMode='AI';m.isDisabled=false;ship.system.autofirePolicy=policy;
   assert.ok(c.sampledAim(1/60,ship,m,w).intent,'resumption solves immediately');
  }
 }finally{ship.fireControlMode='AI';m.isDisabled=false;ship.system.autofirePolicy=policy;}
 c.dropAimSample(m);assert.equal(c.trackers.get(m),undefined);
 c.sampledAim(1/60,ship,m,w);const old=c.trackers.get(m);
 const legacy=c.sampledAim(1/60,ship,m,scene);assert.equal(legacy.cadence,undefined);assert.notEqual(c.trackers.get(m),old,'cadence switch resets');
 const next=c.sampledAim(1/60,ship,m,w);assert.equal(next.cadence,'multirate');assert.notEqual(next,legacy);
});
test('multirate other dynamic fire parameters stay live without configuration hashing or forced solves',()=>{
 const c=new api.AutofireController(),m=gun('live-dynamic-spec'),counts=observedCadence(c),w=multirateWorld();
 const sample=c.sampledAim(1/60,ship,m,w),state=c.trackers.get(m);sample.remaining=.05;
 for(const [key,value]of [['fluxPerSecond',1e9],['refireDelay',.3],['chargeTime',.2],
  ['beamSourceChargeupTime',.1],['maxAmmo',250],['projRadius',2]]){
  m.spec[key]=value;assert.equal(c.sampledAim(.005,ship,m,w),sample,key+' may wait for its due aim');
  assert.equal(c.trackers.get(m),state,key+' is not a mode reset');
  assert.equal(counts.solves.length,1,key+' must not force aim/candidate work');
 }
 assert.equal(fire(c,m,sample.intent,w),'FLUX_BUDGET','live decision sees changed cost while steering is held');
 m.spec.fluxPerSecond=0;assert.equal(fire(c,m,sample.intent,w),'FIRE');
 c.sampledAim(.05,ship,m,w);assert.equal(counts.solves.length,2,'latest parameters solved at the next due aim');
 assert.ok(!('configuration'in(state.acquisitionCadence))&&!('hints'in(state.acquisitionCadence)));
});
test('multirate live bore/range/target/muzzle, obstruction, ammo and flux still gate every held step',()=>{
 const c=new api.AutofireController(),m=gun('multirate-live'),w=multirateWorld();
 c.sampledAim(1/60,ship,m,w);
 const held=()=>{c.trackers.get(m).sampledAim.remaining=.04;return c.sampledAim(1/60,ship,m,w).intent;};
 assert.equal(fire(c,m,held(),w),'FIRE');m.ammo=0;assert.equal(fire(c,m,held(),w),'CONSERVING_AMMO');m.ammo=Infinity;
 m.spec.fluxPerSecond=1e9;assert.equal(fire(c,m,held(),w),'FLUX_BUDGET');m.spec.fluxPerSecond=0;
 m.currentAngleRad=Math.PI/2;assert.equal(fire(c,m,held(),w),'ALIGNING');m.currentAngleRad=0;
 m.spec.range=10;assert.notEqual(fire(c,m,held(),w),'FIRE');m.spec.range=2200;
 m.relativePos.set(0,800);assert.notEqual(fire(c,m,held(),w),'FIRE');m.relativePos.set(0,0);
 target.pos.set(9000,0);assert.notEqual(fire(c,m,held(),w),'FIRE');target.pos.set(1000,0);
 // The preceding out-of-range scan has no target. Do not force a positive
 // held-aim timer forever and then mistake NO_TARGET for obstruction failure.
 // Preserve the acquisition floor, and let due physical steps reacquire first.
 let resumed=c.sampledAim(1/60,ship,m,w);
 assert.equal(resumed.intent,null,'target restoration cannot bypass the acquisition floor');
 for(let tick=0;tick<12&&!resumed.intent;tick++)resumed=c.sampledAim(1/60,ship,m,w);
 assert.equal(resumed.intent?.target.entity,target,'obstruction fixture requires an actually reacquired target');
 assert.equal(fire(c,m,held(),{...w,ships:[ship,target,friend]}),'FRIENDLY_BLOCKED');
 assert.equal(fire(c,m,held(),{...w,asteroids:[{id:'new-rock',pos:new api.Vector2(500,0),vel:new api.Vector2(),radius:150,hp:100}]}),'OBSTACLE_BLOCKED');
 assert.ok(resumed.intent);assert.deepEqual(Object.keys(resumed.intent).sort(),['point','target']);
});
test('native multirate loop covers large/fixed/PD mounts; legacy stays small/medium turret only',()=>{
 for(const [size,type,pd]of [['LARGE','TURRET',false],['LARGE','HARDPOINT',false],['SMALL','TURRET',true]]){
  const control=new(ship.weaponControl.constructor)(),m=gun('native-'+size+'-'+type+'-'+pd);
  m.spec.mountSize=size;m.mountType=type;m.spec.isPointDefense=pd;
  assert.ok(nativePlan(control,m).fireRequests.has(m.slotId));
  assert.equal(control.autofire.trackers.get(m)?.sampledAim?.cadence,'multirate');
  nativePlan(control,m,{...scene,sampledAutofire:{playerShip:target,fullRateShipIds:new Set()}});
  const legacy=control.autofire.trackers.get(m)?.sampledAim;
  if(size==='LARGE')assert.equal(legacy,undefined);else assert.ok(legacy&&!legacy.cadence);
 }
});
test('multirate native loop excludes player/manual/external roots and their modules and resets on rule removal',()=>{
 const control=new(ship.weaponControl.constructor)(),m=gun('native-exclusions');
 nativePlan(control,m);assert.ok(control.autofire.trackers.get(m)?.sampledAim);
 nativePlan(control,m,multirateWorld(scene,new Set(),ship));assert.equal(control.autofire.trackers.get(m)?.sampledAim,undefined,'player root');
 nativePlan(control,m);nativePlan(control,m,multirateWorld(scene,new Set([ship.id])));
 assert.equal(control.autofire.trackers.get(m)?.sampledAim,undefined,'external root supplied by world owner');
 nativePlan(control,m);nativePlan(control,m,scene);assert.equal(control.autofire.trackers.get(m)?.sampledAim,undefined,'rule removed');
 const parent=target.parentShip,mode=target.fireControlMode,rootMode=ship.fireControlMode;
 try{
  target.parentShip=ship;target.fireControlMode='AI';
  const child=new(target.weaponControl.constructor)(),n=gun('excluded-module');
  nativePlan(child,n,multirateWorld(scene,new Set(),ship),target);
  assert.equal(child.autofire.trackers.get(n)?.sampledAim,undefined,'player module');
  nativePlan(child,n,multirateWorld(scene,new Set([ship.id]),friend),target);
  assert.equal(child.autofire.trackers.get(n)?.sampledAim,undefined,'external module');
  ship.fireControlMode='MANUAL';nativePlan(child,n,multirateWorld(scene,new Set(),friend),target);
  assert.equal(child.autofire.trackers.get(n)?.sampledAim,undefined,'manual root with AI module');
 }finally{target.parentShip=parent;target.fireControlMode=mode;ship.fireControlMode=rootMode;}
});
test('multirate unsupported launchers and custom callbacks fall back live without silent UNAVAILABLE',()=>{
 for(const variant of ['guided','rocket','missile-type','missile-spawn']){
  const control=new(ship.weaponControl.constructor)(),m=gun('fallback-'+variant);
  nativePlan(control,m);assert.ok(control.autofire.trackers.get(m)?.sampledAim);
  m.spec={...m.spec,isBeam:false,spawnType:variant==='missile-spawn'?'MISSILE':'PROJECTILE',
   weaponType:variant==='missile-type'?'MISSILE':'ENERGY',isGuided:variant==='guided',isRocket:variant==='rocket',
   alwaysFire:true,chargeTime:0,flightTime:5,projSpeed:2000,aiHints:api.immutableCopy(['DO_NOT_CONSERVE'])};
  const plan=nativePlan(control,m);
  assert.equal(control.autofire.trackers.get(m)?.sampledAim,undefined,variant);
  assert.ok(plan.fireRequests.has(m.slotId),variant+' retains live firing');
 }
 const control=new(ship.weaponControl.constructor)(),m=gun('fallback-custom');
 nativePlan(control,m);const aim=control.autofire.aim;let calls=0;
 control.autofire.aim=function(...args){calls++;assert.equal(args.length,4);return aim.apply(this,args);};
 nativePlan(control,m);assert.equal(calls,1);assert.equal(control.autofire.trackers.get(m)?.sampledAim,undefined);
 control.autofire.aim=aim;nativePlan(control,m);
 const range=m.spec.range;Object.defineProperty(m.spec,'range',{get:()=>range,enumerable:true,configurable:true});
 nativePlan(control,m);assert.equal(control.autofire.trackers.get(m)?.sampledAim,undefined,'mutable accessors fall back');
 Object.defineProperty(m.spec,'range',{value:range,writable:true,enumerable:true,configurable:true});
 const policy=ship.system.autofirePolicy;
 try{
  nativePlan(control,m);ship.system.autofirePolicy=()=>({priority:'SUPPRESS',suspended:true});
  const plan=nativePlan(control,m);
  assert.equal(control.autofire.trackers.get(m)?.sampledAim,undefined);
  assert.ok(plan.suspendedAutofire.has(m.slotId));assert.ok(!plan.fireRequests.has(m.slotId));
 }finally{ship.system.autofirePolicy=policy;}
});
test('unbound multirate retains a fresh descriptor audit and never permanently qualifies mutable specs',()=>{
 const control=new(ship.weaponControl.constructor)(),m=gun('unbound-audit'),Control=control.constructor;
 const audit=Control.hasNativeQueryLoop;let calls=0;
 Control.hasNativeQueryLoop=function(candidate){if(candidate===control)calls++;return audit.call(this,candidate);};
 try{
  nativePlan(control,m);const first=calls;assert.ok(first>0);
  nativePlan(control,m);assert.ok(calls>first,'unbound admission is checked on each plan');
  const range=m.spec.range;Object.defineProperty(m.spec,'range',{get:()=>range,enumerable:true,configurable:true});
  nativePlan(control,m);assert.equal(control.autofire.trackers.get(m)?.sampledAim,undefined,'accessor revokes admission');
  Object.defineProperty(m.spec,'range',{value:range,writable:true,enumerable:true,configurable:true});
  nativePlan(control,m);assert.equal(control.autofire.trackers.get(m)?.sampledAim?.cadence,'multirate','restored spec audited anew');
 }finally{Control.hasNativeQueryLoop=audit;}
});
test('multirate does not quantize stationary beam/burst emission, cooldown, ammo or projectile count',()=>{
 const run=(sampled,beam)=>{
  const control=new(ship.weaponControl.constructor)(),m=gun('multirate-emission'),events=[],states=[];
  m.ammo=200;m.ammoRechargeProgress=0;
  m.spec={...m.spec,mountSize:'LARGE',isBeam:beam,spawnType:beam?'BEAM':'PROJECTILE',beamVisualMode:'SUSTAINED',
   maxAmmo:200,ammoRegenPerSec:2,beamSourceChargeupTime:0,chargeTime:0,refireDelay:.1,burstSize:beam?1:3,
   burstDelay:.03,damagePerSecond:100,minSpread:0,maxSpread:0,spreadPerShot:0,fireRecoilSpeed:0};
  control.weapons=[m];ship.flux.softFlux=ship.flux.hardFlux=0;ship.vel.set(0,0);
  for(let tick=0;tick<60;tick++){
   control.update(1/60,ship,0,target,p=>events.push([tick,'p',p.damage]),b=>events.push([tick,'b',b.damagePerSec]),undefined,sampled?multirateWorld():scene);
   states.push([m.firingState,m.cooldownTimer,m.firingStateTimer,m.burstRemaining,m.ammo]);
  }
  if(sampled)assert.equal(control.autofire.trackers.get(m)?.sampledAim?.cadence,'multirate');
  return {events,states};
 };
 for(const beam of [false,true]){
  const live=run(false,beam),sampled=run(true,beam);assert.deepEqual(sampled,live);
  assert.ok(live.events.length>(beam?0:10),'active emission fixture');
 }
});
if(focusedBundle){
 const host=focusedWorld(api);
 if(host.usesMultirateCombat){
  test('current sealed native stage reuses its bound proof; custom aim callback revokes the fast path',()=>{
   const Control=host.playerShip.weaponControl.constructor,audit=Control.hasNativeQueryLoop;
   let audits=0;Control.hasNativeQueryLoop=function(...args){audits++;return audit.apply(this,args);};
   let control,aim;
   try{
    host.fixedUpdate(1/60);
    const sampled=host.ships.filter(s=>s.weapons.some(m=>s.weaponControl.autofire.trackers.get(m)?.sampledAim?.cadence==='multirate'));
    assert.ok(sampled.length>0,'fixture must actually sample native AI weapons');
    assert.equal(audits,0,'bound native plans must not repeat a whole-spec generic proof');
    control=sampled[0].weaponControl;aim=control.autofire.aim;let liveCalls=0;
    control.autofire.aim=function(...args){liveCalls++;assert.equal(args.length,4);return aim.apply(this,args);};
    audits=0;host.fixedUpdate(1/60);
    assert.ok(audits>0,'unsealed/custom update goes back to the full mutable-spec audit');
    assert.ok(liveCalls>0,'custom callback keeps its live full-rate contract');
    for(const m of control.weapons)assert.equal(control.autofire.trackers.get(m)?.sampledAim,undefined);
   }finally{if(control&&aim)control.autofire.aim=aim;Control.hasNativeQueryLoop=audit;}
  });
 }else console.log('SKIP sealed native multirate host assertion: current bundle cadence flag is off');
 assert.ok(passed.length>0,'focused unit start selected no tests');
 console.log({mode:'focused-current-bundle',bundle:path.resolve(focusedBundle),passed:passed.length,
  unitStart,skippedUnits,
  scope:'Existing/new unit safety and cadence fixtures; no performance or original/UI parity claim',
  skipped:['historical observed host instrumentation','before/after wire, authority, hidden-state and replica comparisons']});
}else{
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
}
