/** Rule-level regression tests: no training, no changes to damage or weapon safety. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCombatLab } from './ai/load-combat-lab.mjs';
const args=process.argv.slice(2);
if(args.length && (args.length!==2 || args[0]!=='--bundle'))throw Error('Usage: node scripts/check-ai-withdrawal.mjs [--bundle baseline.mjs]');
const lab=args.length ? await import(pathToFileURL(path.resolve(args[1])).href) : await loadCombatLab();
const {Ship,Vector2,modManager,CapitalShipAI,planFleetTactics,CombatLab,Publisher,Owner}=lab;
let passed=0;
function test(name,fn){fn();console.log(`ok ${++passed} - ${name}`);}
function power(ship,dps){ship.weapons[0].spec={...ship.weapons[0].spec,damagePerSecond:dps,damagePerShot:dps};}
function make(id,team,x,y,dps){
  const s=new Ship(id,modManager.requireShip('hammerhead'),team===0,new Vector2(x,y),team?Math.PI:0);
  s.fireControlMode='AI';s.shield.isActive=false;
  const m=s.weapons.find(m=>m.spec.id==='railgun');s.weapons.splice(0,s.weapons.length,m);
  m.spec={...m.spec,range:700};power(s,dps);return s;
}
function fixture(){
  const ship=make('own',0,0,0,100),ally=make('ally',0,-350,500,200),target=make('enemy',1,900,0,500),other=make('other',1,900,500,500);
  ship.currentTargetShip=target; ship.hullHp=ship.maxHullHp*.4; // Battle-worn; pressure retreat is warranted.
  const ships=[ship,ally,target,other],ai=new CapitalShipAI(ship,target);
  const scene={ships,projectiles:[],beams:[],asteroids:[]};
  function update(order=null){scene.fleetPlan=planFleetTactics(ships,order?new Map([[ship.id,order]]):undefined);ai.update(1/60,order,scene);return scene.fleetPlan.get(ship.id);}
  return {ship,ally,target,other,ships,ai,scene,update};
}
const retreat=task=>task==='REGROUP'||task==='DISENGAGE';
test('loss of cover changes retreat destination, not retreat intent',()=>{
  const f=fixture();f.ally.flux.softFlux=f.ally.flux.maxFlux*.79;
  assert.equal(f.update().task,'REGROUP');
  f.ally.flux.softFlux=f.ally.flux.maxFlux*.81;
  const p=f.update();assert.ok(p.pressureRatio>2.5);assert.equal(p.task,'DISENGAGE');
  assert.equal(p.anchorId,null);assert.equal(p.assignedPower,0);assert.equal(p.approachBearing,null);
  assert.equal(f.ship.tacticalAI.mode,'WITHDRAW');assert.ok(f.ship.throttle<0);
});
test('repeated cover flux crossings never alternate withdrawal with engagement',()=>{
  const f=fixture();
  for(const flux of [.79,.805,.799,.815,.799,.812,.799,.809,.799,.817]){
    f.ally.flux.softFlux=f.ally.flux.maxFlux*flux;
    assert.ok(retreat(f.update().task));assert.equal(f.ship.tacticalAI.mode,'WITHDRAW');
    assert.ok(f.ship.throttle<0);assert.equal(f.ship.aiHoldOffensiveFire,false);
    assert.equal(f.ship.tacticalAI.positioning,undefined);
  }
});
test('destroyed, retreating-out-of-world, venting or overloaded cover cannot force re-engagement',()=>{
  for(const state of ['dead','retreated','venting','overloaded']){
    const f=fixture();assert.equal(f.update().task,'REGROUP');
    if(state==='dead')f.ally.hullHp=0;
    if(state==='retreated')f.ally.isRetreated=true;
    if(state==='venting')f.ally.flux.isVenting=true;
    if(state==='overloaded')f.ally.flux.isOverloaded=true;
    assert.equal(f.update().task,'DISENGAGE',state);assert.equal(f.ship.tacticalAI.mode,'WITHDRAW');
  }
});
test('pressure hysteresis survives the no-cover fallback and clears on genuine recovery',()=>{
  const f=fixture();f.ally.flux.softFlux=f.ally.flux.maxFlux*.81;
  assert.equal(f.update().task,'DISENGAGE');
  power(f.target,220);power(f.other,220);
  const partial=f.update();assert.ok(partial.pressureRatio>1.6 && partial.pressureRatio<2.5);
  assert.equal(partial.task,'DISENGAGE');
  f.ship.tacticalAI=undefined;assert.equal(retreat(f.update().task),false,'no new retreat below entry threshold');
  power(f.target,500);power(f.other,500);assert.equal(f.update().task,'DISENGAGE');
  power(f.target,100);power(f.other,100);assert.equal(retreat(f.update().task),false);
  assert.equal(f.ship.tacticalAI.mode,'ENGAGE');
});
test('range exit band prevents a one-pixel withdrawal/engagement loop',()=>{
  const f=fixture();f.ally.isRetreated=true;f.other.isRetreated=true;
  power(f.target,1500);
  const boundary=lab.weaponRange(f.ship,f.ship.weapons[0])+f.ship.spec.collisionRadius+f.target.spec.collisionRadius+400;
  f.target.pos.set(boundary-1,0);assert.equal(f.update().task,'DISENGAGE');
  f.target.pos.set(boundary+1,0);assert.equal(f.update().task,'DISENGAGE');
  f.target.pos.set(boundary+201,0);assert.equal(retreat(f.update().task),false);
  f.target.pos.set(boundary+1,0);assert.equal(retreat(f.update().task),false);
});
test('a damaged equal-power solo duel is not turned into a new endless retreat',()=>{
  const f=fixture();f.ally.isRetreated=true;f.other.isRetreated=true;power(f.target,100);
  f.ship.hullHp=f.ship.maxHullHp*.2;
  assert.equal(retreat(f.update().task),false);assert.equal(f.ship.tacticalAI.mode,'ENGAGE');
});
test('hidden contacts cannot trigger pressure withdrawal or remain its target',()=>{
  const f=fixture();f.update();f.target.visibilityMask=f.other.visibilityMask=0;
  const p=f.update();assert.equal(p.task,'SEARCH');assert.equal(p.targetId,null);
  assert.equal(f.ship.currentTargetShip,null);assert.equal(f.ship.tacticalAI.mode,'IDLE');
});
test('explicit engage, waypoint, avoid, defend and escort orders retain ownership',()=>{
  for(const order of [{type:'ENGAGE',targetShipId:'enemy'}, {type:'WAYPOINT',targetPos:{x:1500,y:0}},
    {type:'AVOID',targetShipId:'enemy'}, {type:'DEFEND',targetPos:{x:1500,y:0}}, {type:'ESCORT',targetShipId:'ally'}]){
    const f=fixture();f.ally.flux.softFlux=f.ally.flux.maxFlux*.81;f.update();
    assert.equal(retreat(f.update(order).task),false,order.type);
    assert.equal(f.ship.tacticalAI.mode,order.type==='ENGAGE'?'ENGAGE':order.type);
  }
});
test('no-backoff and assault overrides are respected; extract still withdraws',()=>{
  const f=fixture();f.ally.flux.softFlux=f.ally.flux.maxFlux*.81;f.update();
  f.ship.hullStats.doNotBackOff=true;assert.equal(retreat(f.update().task),false);assert.equal(f.ship.tacticalAI.mode,'ENGAGE');
  f.ship.hullStats.doNotBackOff=false;f.ship.system.definition={...f.ship.system.definition,tacticalMode:'ASSAULT'};f.ship.system.isActive=true;f.update();assert.equal(f.ship.tacticalAI.mode,'ENGAGE');
  assert.equal(retreat(f.ship.tacticalAI.fleetTask),false);
  f.ship.system.definition={...f.ship.system.definition,tacticalMode:'EXTRACT'};f.update();assert.equal(f.ship.tacticalAI.mode,'WITHDRAW');
});
test('pressure retreat can return fire; high-flux retreat still holds offensive fire',()=>{
  const f=fixture();f.ally.flux.softFlux=f.ally.flux.maxFlux*.81;f.update();
  assert.equal(f.ship.aiHoldOffensiveFire,false);
  f.ship.flux.softFlux=f.ship.flux.maxFlux*.95;f.update();assert.equal(f.ship.aiHoldOffensiveFire,true);
  f.ship.flux.softFlux=0;power(f.target,100);power(f.other,100);f.update();assert.equal(f.ship.aiHoldOffensiveFire,false);
});
test('retreated hull control is cleared; manual ships are not assigned autonomous retreat',()=>{
  const f=fixture();f.update();f.ship.retreating=true;f.update();assert.equal(f.ship.tacticalAI,undefined);
  f.ship.retreating=false;f.ship.fireControlMode='MANUAL';
  const plan=planFleetTactics(f.ships,undefined,new Set([f.ship.id]));assert.equal(plan.has(f.ship.id),false);
});
test('worker owner and serial path agree on no-cover withdrawal over repeated frames',()=>{
  const env=new CombatLab(93,0,0,2),e=env.engine;e.switchPlayerShip('lasher','onslaught');
  e.asteroids.length=0;e.nebulae.length=0;
  const s=e.playerShip,t=e.enemyShip;s.hullHp=s.maxHullHp*.4;s.fireControlMode='AI';s.pos.set(0,0);s.facingRad=0;t.pos.set(900,0);t.facingRad=Math.PI;
  e.addShip(modManager.requireShip('onslaught'),false,new Vector2(900,650),Math.PI);
  for(const ship of e.ships)ship.shield.isActive=false;
  const ai=new CapitalShipAI(s,t),ais=[ai,...e.getNativeAIs()];
  const publisher=new Publisher(e.ships,ais),owner=new Owner(publisher.models,[0]);
  for(let i=0;i<3;i++){
    const frame=publisher.publish(e,ais,1/60),row=owner.plan(frame).rows[0];
    assert.equal(new Map(frame.fleetPlan).get(s.id).task,'DISENGAGE');
    e.updateShipAI(ai,1/60,undefined,undefined,new Map(frame.fleetPlan));
    assert.deepEqual(row.tactical,s.tacticalAI);assert.equal(s.tacticalAI.mode,'WITHDRAW');
    const fields=row.changes.find(([part])=>part===0)?.[1]??{};
    for(const key of ['throttle','strafeInput','turnInput','brakeInput','aiHoldOffensiveFire'])if(key in fields)assert.equal(fields[key],s[key]);
  }
});
console.log(`PASS ${passed} withdrawal behavior checks`);
