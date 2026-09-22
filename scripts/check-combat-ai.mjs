import assert from 'node:assert/strict';
import { loadCombatLab } from './ai/load-combat-lab.mjs';
const lab = await loadCombatLab();
const { CombatLab, CapitalShipAI, Ship, Vector2, modManager, AutofireController, solveWeaponAim,
  emptyCombatPolicy, validateCombatPolicy, POLICY_ACTIONS, POLICY_STATES, combatObservation, policyAction,
  shipPolicyAction, setTrainingAction, learnTransition, fireTargetUtility, fleetEngagementRange,
  InFlightFireBudget, chooseCombatVelocity, forecastCombatPosition, Publisher, Owner } = lab;
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`ok ${passed} - ${name}`); }
function fixture() {
  const ship = new Ship('test-own', modManager.requireShip('hammerhead'), true, new Vector2(), 0);
  const target = new Ship('test-target', modManager.requireShip('hammerhead'), false, new Vector2(500, 0), Math.PI);
  ship.fireControlMode = 'AI'; ship.currentTargetShip = target;
  ship.shield.isActive = target.shield.isActive = false;
  const mount = ship.weapons.find(m => m.spec.id === 'railgun');
  assert.ok(mount);
  mount.relativePos.set(0, 0); mount.currentAngleRad = 0; mount.baseAngleDeg = 0; mount.arcDeg = 360;
  mount.spec = { ...mount.spec, type: 'ENERGY', aiHints: [], isPointDefense: false };
  return { ship, target, mount, world: { ships: [ship, target], missiles: [], asteroids: [] } };
}
function solution(f) {
  const s = solveWeaponAim(f.ship, f.mount, { kind: 'SHIP', entity: f.target });
  assert.ok(s, 'fixture must have a physical intercept');
  return s;
}

test('model schema rejects malformed/nonfinite/incompatible data', () => {
  const p = emptyCombatPolicy(); assert.ok(validateCombatPolicy(p));
  for (const bad of [null, {}, { ...p, version: 999 }, { ...p, enabled: 'yes' }, { ...p, observation: 'old' },
    { ...p, actions: [...p.actions].reverse() }, { ...p, minVisits: 0 }, { ...p, minAdvantage: NaN },
    { ...p, rows: [] }, { ...p, rows: { [POLICY_STATES]: { q: [0, 0, 0, 0], visits: [8, 8, 8, 8] } } },
    { ...p, rows: { 0: { q: [0, NaN, 0, 0], visits: [8, 8, 8, 8] } } },
    { ...p, rows: { 0: { q: [0, 1, 0, 0], visits: [8, -1, 8, 8] } } }]) assert.equal(validateCombatPolicy(bad), false);
});
test('disabled, unvisited, low-confidence and tied models fall back', () => {
  const p = emptyCombatPolicy(); p.rows[0] = { q: [0, 1, 0, 0], visits: [8, 8, 8, 8] };
  assert.equal(policyAction(p, 0), 'BALANCED'); p.enabled = true;
  assert.equal(policyAction(p, 0), 'PRESSURE');
  assert.equal(policyAction(p, null), 'BALANCED'); assert.equal(policyAction(p, 1), 'BALANCED');
  p.rows[0].visits[1] = 7; assert.equal(policyAction(p, 0), 'BALANCED');
  p.rows[0].visits[1] = 8; p.rows[0].q[1] = .01; assert.equal(policyAction(p, 0), 'BALANCED');
  p.rows[0].q[1] = 0; assert.equal(policyAction(p, 0), 'BALANCED');
  p.rows[0].q[1] = 1; p.rows[0].visits[0] = 0; assert.equal(policyAction(p, 0), 'BALANCED');
});
test('Q-learning bootstraps only nonterminal transitions', () => {
  const p = emptyCombatPolicy(); p.rows[1] = { q: [2, 1, 0, 0], visits: [8, 8, 8, 8] };
  learnTransition(p, 0, 'PRESSURE', 1, 1, false, .5, .9);
  assert.ok(Math.abs(p.rows[0].q[1] - 1.4) < 1e-12); assert.equal(p.rows[0].visits[1], 1);
  learnTransition(p, 2, 'PRESSURE', 1, 1, true, .5, .9); assert.equal(p.rows[2].q[1], .5);
  assert.throws(() => learnTransition(p, -1, 'BALANCED', 0, 0, false));
  assert.throws(() => learnTransition(p, 0, 'BALANCED', NaN, 0, false));
});
test('observation stays bounded and ignores hidden/friendly/dead contacts', () => {
  const { ship, target } = fixture();
  for (const flux of [0, .44, .45, .74, .75, 1]) for (const hull of [.1, .4, 1]) {
    ship.flux.softFlux = ship.flux.maxFlux * flux; ship.hullHp = ship.maxHullHp * hull;
    const state = combatObservation(ship, target); assert.ok(Number.isInteger(state) && state >= 0 && state < POLICY_STATES);
  }
  target.visibilityMask = 0; assert.equal(combatObservation(ship, target), null);
  target.visibilityMask = 3; target.teamId = ship.teamId; assert.equal(combatObservation(ship, target), null);
  target.teamId = 1; target.isDead = true; assert.equal(combatObservation(ship, target), null);
});
test('manual ownership and missing models keep the baseline', () => {
  const { ship, target } = fixture(); assert.equal(shipPolicyAction(ship, target), 'BALANCED');
  setTrainingAction(ship, 'PRESSURE'); assert.equal(shipPolicyAction(ship, target), 'PRESSURE');
  ship.fireControlMode = 'MANUAL'; assert.equal(shipPolicyAction(ship, target), 'BALANCED');
  ship.fireControlMode = 'AI'; setTrainingAction(ship, null); assert.equal(shipPolicyAction(ship, target), 'BALANCED');
});
test('weapon utility matches kinetic/HE to exposed surface', () => {
  const { ship, mount, target } = fixture();
  const utility = shield => fireTargetUtility(ship, mount, target, shield, false, 0, 0);
  mount.spec.type = 'KINETIC'; assert.ok(utility(true) > utility(false));
  mount.spec.type = 'HIGH_EXPLOSIVE'; assert.ok(utility(false) > utility(true));
  mount.spec.type = 'ENERGY'; const healthy = utility(false);
  target.hullHp *= .2; target.flux.isOverloaded = true; assert.ok(utility(false) > healthy);
});
test('every residual action retains collision clearance, carrier station and emergency reserve', () => {
  const { ship, target } = fixture();
  const carrier = { role: 'CARRIER', carrierRange: 1800 };
  const clearance = ship.spec.collisionRadius + target.spec.collisionRadius + 8;
  for (const action of POLICY_ACTIONS) {
    setTrainingAction(ship, action);
    assert.ok(fleetEngagementRange(ship, target, 10) >= clearance);
    assert.equal(fleetEngagementRange(ship, target, 900, carrier), 1800);
  }
  ship.flux.softFlux = ship.flux.maxFlux * .9;
  setTrainingAction(ship, 'BALANCED'); const baseline = fleetEngagementRange(ship, target, 900);
  setTrainingAction(ship, 'PRESSURE'); assert.equal(fleetEngagementRange(ship, target, 900), baseline);
  ship.flux.softFlux = 0; ship.hullHp = ship.maxHullHp * .2;
  setTrainingAction(ship, 'BALANCED'); const damaged = fleetEngagementRange(ship, target, 900);
  setTrainingAction(ship, 'FINISH'); assert.equal(fleetEngagementRange(ship, target, 900), damaged);
});
test('all policy actions preserve actual friendly-fire, obstruction and flux gates', () => {
  for (const action of POLICY_ACTIONS) {
    const f = fixture(), controller = new AutofireController(); setTrainingAction(f.ship, action);
    const s = solution(f);
    assert.equal(controller.decide(f.ship, f.mount, s, f.world, 1 / 60), 'FIRE');
    const ally = new Ship('ally', f.target.spec, true, new Vector2(250, 0), 0);
    ally.shield.isActive = false; f.world.ships.push(ally);
    assert.equal(controller.decide(f.ship, f.mount, s, f.world, 1 / 60), 'FRIENDLY_BLOCKED');
    f.world.ships.pop(); f.world.asteroids.push({ pos: new Vector2(250, 0), vel: new Vector2(), radius: 70 });
    assert.equal(controller.decide(f.ship, f.mount, s, f.world, 1 / 60), 'OBSTACLE_BLOCKED');
    f.world.asteroids.length = 0; f.ship.flux.softFlux = f.ship.flux.maxFlux * .96;
    assert.equal(controller.decide(f.ship, f.mount, s, f.world, 1 / 60), 'FLUX_BUDGET');
    f.ship.flux.softFlux = 0; f.ship.aiHoldOffensiveFire = true;
    assert.equal(controller.decide(f.ship, f.mount, s, f.world, 1 / 60), 'DEFENSIVE_HOLD');
    f.ship.aiHoldOffensiveFire = false; f.mount.ammo = 0;
    assert.equal(controller.decide(f.ship, f.mount, s, f.world, 1 / 60), 'CONSERVING_AMMO');
    f.mount.ammo = Infinity; f.ship.flux.isOverloaded = true;
    assert.equal(controller.decide(f.ship, f.mount, s, f.world, 1 / 60), 'UNAVAILABLE');
  }
});
test('acquisition excludes hidden enemies and allies under every policy', () => {
  for (const action of POLICY_ACTIONS) {
    const f = fixture(); setTrainingAction(f.ship, action); f.target.visibilityMask = 0;
    assert.equal(new AutofireController().aim(.1, f.ship, f.mount, f.world), null);
    f.target.visibilityMask = 3; f.target.teamId = f.ship.teamId;
    assert.equal(new AutofireController().aim(.1, f.ship, f.mount, f.world), null);
  }
});
test('AI acquisition can finish exposed hulls while manual fire keeps the selected contact', () => {
  const f = fixture();
  const secondary = new Ship('exposed', f.target.spec, false, new Vector2(460, 180), Math.PI);
  secondary.shield.isActive = false; secondary.flux.isOverloaded = true; secondary.hullHp *= .15;
  f.world.ships.push(secondary);
  // Equal damage type removes shield-state assumptions: vulnerability alone is sufficient.
  assert.equal(new AutofireController().aim(.1, f.ship, f.mount, f.world)?.target.entity.id, 'exposed');
  f.ship.fireControlMode = 'MANUAL';
  assert.equal(new AutofireController().aim(.1, f.ship, f.mount, f.world)?.target.entity.id, f.target.id);
});
test('PD abandons a retained distant missile for imminent impact', () => {
  const f = fixture(), controller = new AutofireController();
  f.mount.spec = { ...modManager.getWeapon('pdlaser'), aiHints: ['PD_ONLY'], isPointDefense: true };
  f.world.ships = [f.ship];
  const missile = (id, x, y, vx, vy) => ({ id, teamId: 1, pos: new Vector2(x, y), vel: new Vector2(vx, vy),
    radius: 8, hitpoints: 100, flightTimeRemaining: 20, isRocket: true, damage: 100 });
  const distant = missile('distant', 240, 0, -10, 0), imminent = missile('imminent', 150, 60, -150, -60);
  f.world.missiles.push(distant);
  assert.equal(controller.aim(.1, f.ship, f.mount, f.world)?.target.entity.id, 'distant');
  f.world.missiles.push(imminent);
  assert.equal(controller.aim(1, f.ship, f.mount, f.world)?.target.entity.id, 'imminent');
});
test('waypoint and retreat ownership are not replaced by a learning action', () => {
  const { ship, target } = fixture(), ai = new CapitalShipAI(ship, target);
  const world = { ships: [ship, target], projectiles: [], beams: [], asteroids: [] };
  setTrainingAction(ship, 'PRESSURE');
  ai.update(1 / 60, { type: 'WAYPOINT', targetPos: { x: -1000, y: 0 } }, world);
  assert.equal(ship.tacticalAI.mode, 'WAYPOINT');
  ship.retreating = true; ai.update(1 / 60, null, world); assert.equal(ship.tacticalAI, undefined);
});
test('real 60Hz engine is deterministic for fixed seed/actions and lab rejects stepping after done', () => {
  const run = () => { const env = new CombatLab(42, 0, 0, 4); let reward = 0; while (!env.done) reward += env.step('BALANCED').reward;
    assert.throws(() => env.step('BALANCED')); return { ...env.summary(), reward }; };
  assert.deepEqual(run(), run());
});
test('all curriculum scenarios and both learner sides execute without nonfinite state', () => {
  for (let scenario = 0; scenario < lab.LAB_SCENARIOS.length; scenario++) for (const side of [0, 1]) {
    const env = new CombatLab(19, scenario, side, 2); while (!env.done) assert.ok(Number.isFinite(env.step('PRESSURE').reward));
    assert.ok(env.summary().checksum.every(Number.isFinite));
  }
});

function incoming(f, extra = {}) {
  return { id: 100, sourceShipId: f.ship.id, teamId: f.ship.teamId, specId: 'railgun',
    targetShipId: f.target.id, pos: new Vector2(300, 0), prevPos: new Vector2(290, 0), vel: new Vector2(800, 0),
    radius: 2, damage: 5000, damageType: 'HIGH_EXPLOSIVE', rangeRemaining: 1000, totalRange: 1000,
    elapsedTime: .1, color: [255, 255, 255], ...extra };
}
function exposed(f) {
  f.target.armor.cells.fill(0); f.target.hullHp = 100;
  f.target.flux.isOverloaded = true; f.target.flux.overloadTimer = 10;
}
test('in-flight ledger credits only same-team, reachable, surviving, timely shots', () => {
  const f = fixture(); exposed(f);
  const budget = p => new InFlightFireBudget(f.world.ships, [p]).estimate(f.ship, f.target, .5);
  assert.ok(budget(incoming(f)) > f.target.hullHp);
  for (const extra of [{teamId: 2}, {rangeRemaining: 1}, {hitpoints: 0}, {flightTimeRemaining: .001},
    {didDamage: true}, {isDisarmed: true}, {collisionDisabled: true}, {isFlare: true}, {targetProjectileId: 9}, {targetProjectileId: 0},
    {targetShipId: 'other'}, {armingTimeRemaining: 5}, {vel: new Vector2(-800,0)}, {pos: new Vector2(300,1000)},
    {damage: NaN}, {damagedTargetIds: [f.target.id]}]) assert.equal(budget(incoming(f, extra)), 0, JSON.stringify(extra));
  const ledger = new InFlightFireBudget(f.world.ships, [incoming(f)]);
  assert.equal(ledger.estimate(f.ship, f.target, .001), 0);
  f.target.visibilityMask = 0; assert.equal(ledger.estimate(f.ship, f.target, .5), 0);
  f.target.visibilityMask = 3; f.target.shield.isActive = true; assert.equal(ledger.estimate(f.ship, f.target, .5), 0);
});
test('ledger sees same-step launches and invalidation, never mutates armor or spends ammo', () => {
  const f = fixture(); exposed(f);
  const ledger = new InFlightFireBudget(f.world.ships, []), p = incoming(f);
  assert.equal(ledger.estimate(f.ship, f.target, .5), 0); ledger.add(p);
  const before = [...f.target.armor.cells], ammo = f.mount.ammo;
  const damage = ledger.estimate(f.ship, f.target, .5); assert.ok(damage > 0);
  assert.equal(ledger.estimate(f.ship, f.target, .5), damage);
  assert.deepEqual([...f.target.armor.cells], before); assert.equal(f.mount.ammo, ammo);
  p.didDamage = true; assert.equal(ledger.estimate(f.ship, f.target, .5), 0);
});
test('budget rejects intercepted trajectories and conservatively accounts for armor', () => {
  const f = fixture(); exposed(f); const p = incoming(f);
  const open = new InFlightFireBudget(f.world.ships, [p]).estimate(f.ship, f.target, .5);
  f.target.armor.cells.fill(f.target.armor.maxCellArmor);
  assert.ok(new InFlightFireBudget(f.world.ships, [p]).estimate(f.ship, f.target, .5) < open);
  const blocker = new Ship('blocker', modManager.requireShip('lasher'), true, new Vector2(370,0),0);
  blocker.shield.isActive = false;
  assert.equal(new InFlightFireBudget([...f.world.ships, blocker], [p]).estimate(f.ship, f.target, .5), 0);
  assert.equal(new InFlightFireBudget(f.world.ships, [p], [{hp:100,pos:new Vector2(350,0),vel:new Vector2(),radius:20}])
    .estimate(f.ship, f.target, .5), 0);
});
test('overkill diverts to another clear hull, but never suppresses the only target or manual selection', () => {
  const f = fixture(); exposed(f);
  const alternative = new Ship('alternative', f.target.spec, false, new Vector2(470,200), Math.PI);
  alternative.shield.isActive = false; f.world.ships.push(alternative);
  const aim = () => new AutofireController().aim(.1, f.ship, f.mount, f.world);
  assert.equal(aim()?.target.entity.id, f.target.id);
  f.world.fireBudget = new InFlightFireBudget(f.world.ships, [incoming(f)]);
  assert.equal(aim()?.target.entity.id, alternative.id);
  f.world.asteroids.push({hp:100,pos:new Vector2(250,106),vel:new Vector2(),radius:35});
  assert.equal(aim()?.target.entity.id, f.target.id, 'covered target remains preferable to obstructed alternative');
  f.world.asteroids.length=0;
  f.ship.fireControlMode = 'MANUAL'; assert.equal(aim()?.target.entity.id, f.target.id);
  f.ship.fireControlMode = 'AI'; f.world.ships.pop(); const only = aim();
  assert.equal(only?.target.entity.id, f.target.id);
  assert.equal(new AutofireController().decide(f.ship, f.mount, only, f.world, 1/60), 'FIRE');
});
function positionFixture() {
  const f = fixture(); f.ship.weapons.splice(0, f.ship.weapons.length, f.mount);
  f.target.pos.set(650,0);
  f.mount.spec = {...f.mount.spec, range: 900};
  f.profile = {range:650, relativeBearing:0, firepower:300, weapons:1};
  f.scene = {ships:f.world.ships,projectiles:[],beams:[],asteroids:[]};
  return f;
}
test('position scorer preserves open-duel stationkeeping and forecasts finite acceleration', () => {
  const f = positionFixture(), desired = new Vector2();
  const result = chooseCombatVelocity(f.ship,f.target,desired,f.profile,f.scene);
  assert.equal(result.adjusted,false); assert.equal(result.velocity,desired); assert.equal(result.clearFire,1);
  const fullSpeed = new Vector2(0,f.ship.getMotionStats().maxSpeed);
  const forecast = forecastCombatPosition(f.ship,fullSpeed);
  assert.ok(forecast.y > 0 && forecast.y < fullSpeed.y * 2.5);
});
test('position scorer finds a better lane around a friendly blocker without mutating the world', () => {
  const f = positionFixture();
  const ally = new Ship('lane-blocker', modManager.requireShip('lasher'),true,new Vector2(320,0),0);
  ally.shield.isActive=false; f.scene.ships.push(ally);
  const observations=[]; f.scene.noteNavigationObstacle=(_ship, other, horizon)=>observations.push([other.id,horizon]);
  const before = f.ship.pos.clone();
  const result=chooseCombatVelocity(f.ship,f.target,new Vector2(),f.profile,f.scene);
  assert.equal(result.adjusted,true); assert.equal(result.reason,'FIRE_LANE'); assert.ok(result.clearFire > .5);
  assert.ok(result.velocity.length() <= f.ship.getMotionStats().maxSpeed + 1e-9);
  assert.deepEqual(f.ship.pos,before); assert.ok(observations.some(([id,h])=>id===ally.id && h===Infinity));
  assert.deepEqual(result,chooseCombatVelocity(f.ship,f.target,new Vector2(),f.profile,f.scene));
});
test('positioning ignores hidden contacts and preserves explicit orders, carriers and withdrawal', () => {
  const f=positionFixture(), hidden = new Ship('hidden',modManager.requireShip('lasher'),false,new Vector2(320,0),0);
  hidden.visibilityMask=0; f.scene.ships.push(hidden);
  assert.equal(chooseCombatVelocity(f.ship,f.target,new Vector2(),f.profile,f.scene).adjusted,false);
  const ai=new CapitalShipAI(f.ship,f.target);
  ai.update(1/60,{type:'ENGAGE',targetShipId:f.target.id},f.scene); assert.equal(f.ship.tacticalAI.positioning,undefined);
  ai.update(1/60,{type:'WAYPOINT',targetPos:{x:-1000,y:0}},f.scene); assert.equal(f.ship.tacticalAI.mode,'WAYPOINT');
  assert.equal(f.ship.tacticalAI.positioning,undefined);
  f.ship.flux.softFlux=f.ship.flux.maxFlux*.95; ai.update(1/60,null,f.scene);
  assert.equal(f.ship.tacticalAI.mode,'WITHDRAW'); assert.equal(f.ship.tacticalAI.positioning,undefined);
});
test('a visible flank threat selects cover without tracking hidden threats', () => {
  const f=positionFixture(), foe=new Ship('flank',f.target.spec,false,new Vector2(150,360),-Math.PI/2);
  foe.shield.isActive=false; foe.weapons[0].spec={...foe.weapons[0].spec,range:350}; foe.weapons[0].relativePos.set(0,0); foe.weapons[0].arcDeg=90; foe.weapons.splice(1);
  f.scene.ships.push(foe);
  const selected=chooseCombatVelocity(f.ship,f.target,new Vector2(),f.profile,f.scene);
  assert.equal(selected.adjusted,true); assert.equal(selected.reason,'COVER'); assert.ok(selected.velocity.y<0);
  foe.visibilityMask=0;
  assert.equal(chooseCombatVelocity(f.ship,f.target,new Vector2(),f.profile,f.scene).adjusted,false);
});
test('carrier station and vent ownership bypass tactical repositioning', () => {
  const f=positionFixture(), ai=new CapitalShipAI(f.ship,f.target);
  f.scene.fleetPlan=new Map([[f.ship.id,{role:'CARRIER',task:'SUPPORT',targetId:f.target.id,carrierRange:1600}]]);
  ai.update(1/60,null,f.scene);assert.equal(f.ship.tacticalAI.positioning,undefined);
  assert.equal(f.ship.tacticalAI.desiredRange,1600);
  f.ship.flux.isVenting=true;
  assert.equal(chooseCombatVelocity(f.ship,f.target,new Vector2(),f.profile,f.scene).adjusted,false);
});
test('owner packet and serial AI agree on a blocked-lane scene', () => {
  for (const window of ['normal','high-flux','low-hull']) {
  const env=new CombatLab(52,0,0,2), e=env.engine;
  e.switchPlayerShip('onslaught','onslaught'); e.asteroids.length=0; e.nebulae.length=0;
  const ship=e.playerShip,target=e.enemyShip; ship.fireControlMode='AI';
  ship.pos.set(0,0); ship.facingRad=0; target.pos.set(1200,0); target.facingRad=Math.PI;
  const ally=e.addShip(modManager.requireShip('onslaught'),true,new Vector2(600,0),0);
  for(const s of e.ships)s.shield.isActive=false;
  if(window==='high-flux') target.flux.softFlux=target.flux.maxFlux*.85;
  if(window==='low-hull') target.hullHp=target.maxHullHp*.2;
  const ai=new CapitalShipAI(ship,target), ais=[ai,...e.getNativeAIs()];
  const publisher=new Publisher(e.ships,ais), owner=new Owner(publisher.models,[0]);
  assert.ok(publisher.models[0].schema.find(p=>p.kind==='ai').keys.includes('tacticalRemaining'));
  for(let tick=0;tick<12;tick++){
    if(tick===5)ship.flux.softFlux=ship.flux.maxFlux*.95;
    const frame=publisher.publish(e,ais,1/60), row=owner.plan(frame).rows[0];
    e.updateShipAI(ai,1/60,undefined,undefined,new Map(frame.fleetPlan));
    assert.deepEqual(row.tactical,ship.tacticalAI,'owner/serial tactical tick '+tick);
    for(const [part,fields] of row.changes)for(const [key,value] of Object.entries(fields))
      assert.deepEqual(publisher.nodes[0][part][1][key],value,'owner/serial scalar '+key+' tick '+tick);
    assert.ok(row.navigationDeps.includes(e.ships.indexOf(ally)));
  }
  }
});


function tacticalFixture(id = 'cadence-ship') {
  const ship = new Ship(id, modManager.requireShip('hammerhead'), true, new Vector2(), 0);
  const target = new Ship('cadence-target', modManager.requireShip('hammerhead'), false, new Vector2(3000, 0), Math.PI);
  const ai = new CapitalShipAI(ship, target);
  const scene = {ships:[ship,target],projectiles:[],beams:[],asteroids:[],fleetPlan:new Map([[ship.id,{role:'LINE',task:'PRESSURE',targetId:target.id}]])};
  const order = {id:'move',type:'WAYPOINT',targetPos:new Vector2(1000,0),issuedTime:0};
  let decisions=0, observed=0, defended=0, x=ai.tacticalX;
  Object.defineProperty(ai,'tacticalX',{enumerable:true,configurable:true,get:()=>x,set:v=>{x=v;decisions++;}});
  const observe=ai.defense.observe.bind(ai.defense), defend=ai.defense.update.bind(ai.defense);
  ai.defense.observe=(...args)=>{observed++;return observe(...args);};
  ai.defense.update=(...args)=>{defended++;return defend(...args);};
  const step=()=>ai.update(1/60,order,scene);
  return {ship,target,ai,scene,order,step,counts:()=>({decisions,observed,defended})};
}
function offDecision(f) {
  // Stop just BEFORE a non-decision step, without changing the schedule.
  for(let i=0;i<4 && f.ai.tacticalRemaining <= 1/60+1e-9;i++)f.step();
  assert.ok(f.ai.tacticalRemaining>1/60+1e-9);
}
test('20Hz tactical intent is staggered and keeps defense observation/actions at 60Hz',()=>{
  const schedules=new Map();
  for(let n=0;n<9;n++){
    const f=tacticalFixture('cadence-'+n),ticks=[];
    for(let tick=0;tick<61;tick++){const before=f.counts().decisions;f.step();if(f.counts().decisions>before)ticks.push(tick);}
    const c=f.counts();assert.equal(c.observed,61);assert.equal(c.defended,61);
    assert.equal(ticks[0],0);assert.equal(ticks.length,21);
    assert.equal(ticks[1],f.ai.tacticalPhase+1);
    for(let i=2;i<ticks.length;i++)assert.equal(ticks[i]-ticks[i-1],3);
    schedules.set(f.ai.tacticalPhase,ticks.slice(1));
    assert.ok(Math.abs(f.ai.defense.quietFor-61/60)<1e-9);
  }
  assert.equal(schedules.size,3);
});
test('in-place orders, unsafe flux and manual-to-AI handoff refresh intent immediately',()=>{
  const f=tacticalFixture();f.step();offDecision(f);
  let before=f.counts().decisions;f.order.targetPos.set(-1000,0);f.step();
  assert.equal(f.counts().decisions,before+1);assert.ok(f.ai.tacticalX<0);
  offDecision(f);before=f.counts().decisions;f.ship.flux.softFlux=f.ship.flux.maxFlux*.95;f.step();
  assert.equal(f.counts().decisions,before+1);assert.equal(f.ship.aiHoldOffensiveFire,true);
  offDecision(f);before=f.counts().decisions;f.ship.fireControlMode='MANUAL';f.ship.pos.x=-2000;f.step();
  assert.equal(f.counts().decisions,before+1);assert.ok(f.ai.tacticalX>0);
  // Real pilot edge commands have already set AI mode and cleared diagnostics.
  offDecision(f);before=f.counts().decisions;f.ship.fireControlMode='AI';f.ship.tacticalAI=undefined;
  f.ship.pos.x=2000;f.step();assert.equal(f.counts().decisions,before+1);assert.ok(f.ai.tacticalX<0);
});
test('hidden, dead, removed, docked and friendly targets invalidate before a scheduled decision',()=>{
  for(const invalidate of [f=>f.target.visibilityMask=0,f=>f.target.isDead=true,f=>f.scene.ships.pop(),f=>f.target.isDocked=true,f=>f.target.teamId=f.ship.teamId]){
    const f=tacticalFixture();f.step();offDecision(f);const before=f.counts().decisions;
    invalidate(f);f.step();assert.equal(f.ship.currentTargetShip,null);assert.equal(f.counts().decisions,before+1);
  }
});
test('a new close obstacle changes avoidance on an unscheduled tactical step',()=>{
  const f=tacticalFixture();f.step();offDecision(f);assert.equal(f.ship.tacticalAI.avoidingCollision,false);
  const blocker=new Ship('sudden-obstacle',f.ship.spec,true,new Vector2(160,0),Math.PI);
  f.scene.ships.push(blocker);const before=f.counts().decisions;f.step();
  assert.equal(f.counts().decisions,before);assert.equal(f.ship.tacticalAI.avoidingCollision,true);
});
test('new incoming fire raises shields on an unscheduled tactical step',()=>{
  const f=tacticalFixture();f.step();offDecision(f);f.ship.shield.isActive=false;
  f.scene.projectiles.push({id:777,sourceShipId:f.target.id,teamId:f.target.teamId,specId:'railgun',
    pos:new Vector2(300,0),prevPos:new Vector2(310,0),vel:new Vector2(-800,0),radius:2,damage:100,
    damageType:'ENERGY',rangeRemaining:1000,totalRange:1000,elapsedTime:.1,color:[255,255,255]});
  const before=f.counts().decisions;f.step();assert.equal(f.counts().decisions,before);
  assert.ok(f.ship.tacticalAI.incomingDamage>0);assert.equal(f.ship.shield.isActive,true);
});
test('retreat and death clear control immediately; re-entry starts with a fresh decision',()=>{
  for(const field of ['retreating','isDead','isRetreated','isDocked']){
    const f=tacticalFixture();f.step();f.ship[field]=true;f.step();
    assert.equal(f.ship.tacticalAI,undefined);assert.equal(f.ship.throttle,0);assert.equal(f.ai.tacticalRemaining,-1);
    f.ship[field]=false;const before=f.counts().decisions;f.step();assert.equal(f.counts().decisions,before+1);
  }
});


function trackedFireBudget(f) {
  const ledger=new InFlightFireBudget(f.world.ships,[incoming(f,{damage:100})]);
  let reads=0;const get=ledger.byTarget.get;
  ledger.byTarget.get=function(...args){reads++;return get.apply(this,args);};
  f.world.fireBudget=ledger;return {ledger,reads:()=>reads};
}
test('uncontested hull skips only native overkill ranking, keeping immediate firing safety',()=>{
  const f=fixture(),track=trackedFireBudget(f),controller=new AutofireController();
  assert.equal(track.ledger.canOmitUncontestedPenalty,true);
  const aim=controller.aim(1/60,f.ship,f.mount,f.world);assert.ok(aim);assert.equal(aim.target.entity,f.target);
  assert.equal(track.reads(),0,'one hull cannot be reordered by overkill score');
  const friend=new Ship('new-friendly-blocker',f.ship.spec,true,new Vector2(250,0),0);f.world.ships.push(friend);
  assert.equal(controller.decide(f.ship,f.mount,aim,f.world,1/60),'FRIENDLY_BLOCKED');
});
test('competing damaged hull targets still run the complete in-flight damage penalty',()=>{
  const f=fixture();const alternative=new Ship('other-hull',f.target.spec,false,new Vector2(500,180),Math.PI);
  alternative.shield.isActive=false;alternative.hullHp=100;f.target.hullHp=100;f.world.ships.push(alternative);const track=trackedFireBudget(f);
  const aim=new AutofireController().aim(1/60,f.ship,f.mount,f.world);assert.ok(aim);
  assert.ok(track.reads()>=2,'each competing hull must retain its budget score');
});
test('custom fire-budget estimators and penalties are never pruned for a sole hull',()=>{
  for(const method of ['estimate','penalty']){
    const f=fixture(),ledger=new InFlightFireBudget(f.world.ships,[]);let calls=0;
    ledger[method]=()=>{calls++;return 0;};f.world.fireBudget=ledger;
    assert.equal(ledger.canOmitUncontestedPenalty,false);
    assert.ok(new AutofireController().aim(1/60,f.ship,f.mount,f.world));assert.ok(calls>0);
  }
});


test('adaptive fire budget keeps damaged hulls, heavy friendly volleys and new launches precise',()=>{
  const f=fixture(),ledger=new InFlightFireBudget(f.world.ships,[]);f.target.hullHp=f.target.maxHullHp;
  assert.equal(ledger.needsDetailedPenalty(f.ship,f.target),false);
  ledger.add(incoming(f,{id:400,damage:f.target.hullHp*.249}));assert.equal(ledger.needsDetailedPenalty(f.ship,f.target),false);
  ledger.add(incoming(f,{id:401,damage:1e9,teamId:7}));assert.equal(ledger.needsDetailedPenalty(f.ship,f.target),false);
  ledger.add(incoming(f,{id:402,damage:f.target.hullHp*.002}));assert.equal(ledger.needsDetailedPenalty(f.ship,f.target),true);
  const empty=new InFlightFireBudget(f.world.ships,[]);f.target.hullHp=f.target.maxHullHp*.5;
  assert.equal(empty.needsDetailedPenalty(f.ship,f.target),true);
});
test('unknown armor hooks/runtime effects and custom scorers retain detailed prediction',()=>{
  const f=fixture(),ledger=new InFlightFireBudget(f.world.ships,[]);f.target.hullHp=f.target.maxHullHp;
  f.target.runtimeModifiers.set('external',{hullDamageMultiplier:3});assert.equal(ledger.needsDetailedPenalty(f.ship,f.target),true);f.target.runtimeModifiers.clear();
  f.target.armor.damageTakenModifiers=()=>({armor:1,hull:20});assert.equal(ledger.needsDetailedPenalty(f.ship,f.target),true);
  ledger.penalty=()=>1;assert.equal(ledger.needsDetailedPenalty(f.ship,f.target),true);
});

console.log(`PASS ${passed} combat AI foundation checks`);


