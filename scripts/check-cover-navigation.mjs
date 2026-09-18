/** Contract tests for the REJECTED cover-arrival candidate. Not part of production ai:check. */
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--bundle')throw Error('Experimental checks require --bundle path/to/frozen-candidate.mjs; do not apply this contract to production.');
const lab=await import(pathToFileURL(path.resolve(args[1])).href);
const {Ship,Vector2,modManager,CapitalShipAI,regroupVelocity,CombatLab,Publisher,Owner}=lab;
let passed=0;function test(name,fn){fn();console.log(`ok ${++passed} - ${name}`);}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function fixture(){
  const ship=new Ship('own',modManager.requireShip('hammerhead'),true,new Vector2(),0);
  const anchor=new Ship('cover',modManager.requireShip('wolf'),true,new Vector2(-1600,0),0);
  const target=new Ship('enemy',modManager.requireShip('hammerhead'),false,new Vector2(1200,0),Math.PI);
  ship.fireControlMode='AI';ship.currentTargetShip=target;ship.hullHp=ship.maxHullHp*.2;
  for(const s of [ship,anchor,target])s.shield.isActive=false;
  anchor.vel.set(150,0);
  const assignment={targetId:target.id,anchorId:anchor.id,role:'LINE',task:'REGROUP',score:1,pressureRatio:3,assignedPower:0,carrierRange:0,approachBearing:null};
  const world={ships:[ship,anchor,target],projectiles:[],beams:[],asteroids:[],fleetPlan:new Map([[ship.id,assignment]])};
  return {ship,anchor,target,world,ai:new CapitalShipAI(ship,target),assignment};
}
function station(f){const away=f.anchor.pos.clone().sub(f.target.pos);if(away.length()<1)away.copy(Vector2.fromAngle(f.anchor.facingRad+Math.PI));return f.anchor.pos.clone().addScaled(away,(f.ship.spec.collisionRadius+f.anchor.spec.collisionRadius+180)/away.length());}
test('far retreat actually commands movement toward cover despite a faster advancing ally',()=>{
  const f=fixture();f.ai.update(1/60,null,f.world);
  assert.equal(f.ship.tacticalAI.fleetTask,'REGROUP');assert.equal(f.ship.tacticalAI.mode,'WITHDRAW');
  assert.equal(f.ship.tacticalAI.avoidingCollision,false);
  assert.ok(f.ship.throttle<0,'an unobstructed retreat must not accelerate away from the distant cover point');
});
test('far cover requests use available approach speed regardless of anchor velocity direction',()=>{
  for(const velocity of [[150,0],[-150,0],[0,150],[0,0],[500,500]]){
    const f=fixture();f.anchor.vel.set(...velocity);
    const v=regroupVelocity(f.ship,f.anchor,f.target),unit=station(f).sub(f.ship.pos).normalize();
    close(v.dot(unit),f.ship.getMotionStats().maxSpeed);close(v.length(),f.ship.getMotionStats().maxSpeed);
  }
});
test('at the cover station, target velocity is still matched and capped',()=>{
  for(const velocity of [[30,0],[0,40],[-150,50]]){
    const f=fixture();f.ship.pos.copy(station(f));f.anchor.vel.set(...velocity);
    const v=regroupVelocity(f.ship,f.anchor,f.target),expected=f.anchor.vel.clone(),max=f.ship.getMotionStats().maxSpeed;
    if(expected.length()>max)expected.scale(max/expected.length());close(v.x,expected.x);close(v.y,expected.y);
  }
});
test('a stationary anchor retains the original arrival/braking curve',()=>{
  for(const distance of [0,30,60,61,100,500]){
    const f=fixture();f.anchor.vel.set(0,0);f.ship.pos.copy(station(f)).add(new Vector2(distance,0));
    const stats=f.ship.getMotionStats(),expected=distance<=60?0:Math.min(stats.maxSpeed,Math.sqrt(2*stats.deceleration*(distance-60)));
    const v=regroupVelocity(f.ship,f.anchor,f.target);close(v.x,-expected);close(v.y,0);
  }
});
test('velocity matching fades continuously across the arrival band rather than switching on a timer',()=>{
  const f=fixture(),stats=f.ship.getMotionStats(),braking=Math.max(64,stats.maxSpeed**2/(2*Math.max(1,stats.deceleration)));
  f.anchor.vel.set(0,40);const point=station(f);
  for(const boundary of [60,60+braking]){
    f.ship.pos.copy(point).add(new Vector2(boundary-.0001,0));const a=regroupVelocity(f.ship,f.anchor,f.target);
    f.ship.pos.copy(point).add(new Vector2(boundary+.0001,0));const b=regroupVelocity(f.ship,f.anchor,f.target);
    assert.ok(a.distanceTo(b)<.3);
  }
});
test('navigation is rotation-invariant and never changes input vectors',()=>{
  for(const angle of [0,.6,Math.PI/2,Math.PI]){
    const f=fixture(),original=regroupVelocity(f.ship,f.anchor,f.target).rotate(angle);
    for(const s of [f.ship,f.anchor,f.target]){s.pos.rotate(angle);s.vel.rotate(angle);s.facingRad+=angle;}
    const before=[...f.world.ships.flatMap(s=>[s.pos.x,s.pos.y,s.vel.x,s.vel.y])];
    const v=regroupVelocity(f.ship,f.anchor,f.target);close(v.x,original.x);close(v.y,original.y);
    assert.deepEqual(f.world.ships.flatMap(s=>[s.pos.x,s.pos.y,s.vel.x,s.vel.y]),before);
  }
});
test('no-target and coincident-target fallbacks remain finite and bounded',()=>{
  const f=fixture();f.target.pos.copy(f.anchor.pos);
  for(const t of [undefined,f.target]){const v=regroupVelocity(f.ship,f.anchor,t);assert.ok(Number.isFinite(v.x+v.y));assert.ok(v.length()<=f.ship.getMotionStats().maxSpeed+1e-8);}
});
test('collision avoidance still overrides a blocked retreat corridor',()=>{
  const f=fixture(),blocker=new Ship('blocker',f.anchor.spec,true,new Vector2(-280,0),0);blocker.shield.isActive=false;f.world.ships.push(blocker);
  f.ai.update(1/60,null,f.world);assert.equal(f.ship.tacticalAI.fleetTask,'REGROUP');assert.equal(f.ship.tacticalAI.avoidingCollision,true);
});
test('cover movement does not change player waypoint ownership or high-flux fire hold',()=>{
  const f=fixture();f.ai.update(1/60,{type:'WAYPOINT',targetPos:{x:1500,y:0}},f.world);
  assert.equal(f.ship.tacticalAI.mode,'WAYPOINT');assert.ok(f.ship.throttle>0);
  f.ship.flux.softFlux=f.ship.flux.maxFlux*.95;f.ai.update(1/60,null,f.world);assert.equal(f.ship.aiHoldOffensiveFire,true);
  f.ship.flux.softFlux=0;f.ai.update(1/60,null,f.world);assert.equal(f.ship.aiHoldOffensiveFire,false);
});
test('serial AI and worker owner agree as the cover velocity changes over successive frames',()=>{
  const env=new CombatLab(613,0,0,2),e=env.engine;e.switchPlayerShip('sunder','hammerhead');
  const s=e.playerShip,t=e.enemyShip;s.fireControlMode='AI';s.hullHp=s.maxHullHp*.2;s.pos.set(0,0);s.facingRad=0;t.pos.set(1200,0);t.facingRad=Math.PI;
  const ally=e.addShip(modManager.requireShip('wolf'),true,new Vector2(-1600,0),0);
  e.asteroids.length=0;e.nebulae.length=0;for(const ship of e.ships)ship.shield.isActive=false;
  const ai=new CapitalShipAI(s,t),ais=[ai,...e.getNativeAIs()],publisher=new Publisher(e.ships,ais),owner=new Owner(publisher.models,[0]);
  for(const velocity of [[150,0],[0,150],[-150,0]]){
    ally.vel.set(...velocity);const frame=publisher.publish(e,ais,1/60);
    assert.equal(new Map(frame.fleetPlan).get(s.id).task,'REGROUP');
    const row=owner.plan(frame).rows[0];e.updateShipAI(ai,1/60,undefined,undefined,new Map(frame.fleetPlan));assert.deepEqual(row.tactical,s.tacticalAI);
    const fields=row.changes.find(([part])=>part===0)?.[1]??{};
    for(const key of ['throttle','strafeInput','turnInput','brakeInput','aiHoldOffensiveFire'])if(key in fields)assert.equal(fields[key],s[key]);
  }
});
console.log(`PASS ${passed} cover navigation checks`);
