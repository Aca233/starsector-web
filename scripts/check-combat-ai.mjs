import { checkQualifiedFireTargets } from './lib/qualified-fire-target-contracts.mjs';
import { checkOwnerObservationWire } from './lib/owner-observation-wire-contracts.mjs';
import { checkOwnedFireGuards } from './lib/owned-fire-guard-contracts.mjs';
import { checkOwnedHostileQueries } from './lib/owned-hostile-query-contracts.mjs';
import {checkOwnedPreAimRange} from './lib/owned-preaim-range-contracts.mjs';
import assert from 'node:assert/strict';
import { loadCombatLab } from './ai/load-combat-lab.mjs';
const lab = await loadCombatLab({ autofireBaseline: process.env.AUTOFIRE_BASELINE, ownedAdmissionBaseline: process.env.OWNED_ADMISSION_BASELINE, publisherBaseline: process.env.PUBLISHER_BASELINE });
const { CombatLab, CapitalShipAI, Ship, Vector2, modManager, AutofireController, solveWeaponAim,
  emptyCombatPolicy, validateCombatPolicy, POLICY_ACTIONS, POLICY_STATES, combatObservation, policyAction,
  shipPolicyAction, setTrainingAction, learnTransition, fireTargetUtility, fleetEngagementRange,
  InFlightFireBudget, chooseCombatVelocity, forecastCombatPosition, Publisher, Owner } = lab;
if(process.env.OWNED_PREAIM_ONLY==='true'){console.log(JSON.stringify(checkOwnedPreAimRange(lab,ownedQueryFixture,fireTargetSnapshot)));process.exit(0);}
let passed = 0, visited = 0;
// Resume a failed/unvisited tail without rerunning completed checks.
const fromTest = Number(process.env.COMBAT_AI_FROM ?? 1);
assert.ok(Number.isInteger(fromTest) && fromTest >= 1);
function test(name, fn) { const index = ++visited; if (index < fromTest) return; fn(); passed++; console.log(`ok ${index} - ${name}`); }
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
test('fixed owner observations preserve complete packets, live validation and read/write order', () => {
  console.log('  '+JSON.stringify(checkOwnerObservationWire(lab,ownedQueryFixture)));
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
    const forecastEnvelope=new lab.WeaponThreatEnvelope();
    e.updateShipAI(ai,1/60,undefined,forecastEnvelope,new Map(frame.fleetPlan));forecastEnvelope.close();
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


test('short weapon horizon preserves full-horizon actual projectiles and live near weapons',()=>{
  const f=tacticalFixture();f.target.pos.set(500,0);
  const m=f.target.weapons[0];f.target.weapons.splice(1);m.relativePos.set(0,0);m.arcDeg=360;m.currentAngleRad=Math.PI;
  m.spec={...m.spec,range:2000,damagePerShot:100,damagePerSecond:100,projSpeed:1000,isBeam:false,isGuided:false,chargeTime:0};
  m.cooldownTimer=4;m.firingState='IDLE';m.burstRemaining=0;
  const full=lab.assessThreats(f.ship,f.scene,10,1),near=lab.assessThreats(f.ship,f.scene,10,1,1);
  assert.ok(full.threats.some(t=>t.kind==='WEAPON'&&t.eta>1));assert.equal(near.threats.length,0);
  f.scene.projectiles.push({id:999,sourceShipId:f.target.id,teamId:f.target.teamId,pos:new Vector2(1800,0),vel:new Vector2(-500,0),radius:2,damage:100,damageType:'ENERGY',rangeRemaining:10000,spawnType:'BALLISTIC'});
  const live=lab.assessThreats(f.ship,f.scene,10,1,1);
  assert.ok(live.threats.some(t=>t.kind==='PROJECTILE'&&t.eta>1),'actual trajectories keep the long horizon');
  m.cooldownTimer=0;
  const a=lab.assessThreats(f.ship,f.scene,10,1),b=lab.assessThreats(f.ship,f.scene,10,1,1);
  assert.ok(b.imminentDamage>0);assert.equal(b.imminentDamage,a.imminentDamage);assert.equal(b.imminentShieldFlux,a.imminentShieldFlux);assert.equal(b.facing,a.facing);
});

test('deferred far threats block vent calm, and fresh vent validation resets it without double time',()=>{
  const f=tacticalFixture(),d=new lab.ShipDefenseController();
  const calm={threats:[],horizon:10,imminentDamage:0,imminentShieldFlux:0,actualDamage:0,earliest:Infinity,facing:null};
  d.observe(1,{...calm,hasDeferredWeaponThreat:true});assert.equal(d.safeVentFor,0);
  d.observe(1,calm);f.ship.flux.softFlux=f.ship.flux.maxFlux*.75;f.ship.shield.isActive=false;
  const danger={...calm,threats:[{sourceId:f.target.id,kind:'WEAPON',eta:3,damage:100,shieldFlux:100,direction:0}]};
  let refreshed=0;d.update(f.ship,calm,()=>{refreshed++;return danger;});
  assert.equal(refreshed,1);assert.equal(f.ship.flux.isVenting,false);assert.equal(d.safeVentFor,0);assert.equal(d.quietFor,2);
  d.observe(1,calm);d.update(f.ship,calm,()=>calm);assert.equal(f.ship.flux.isVenting,true);
});

test('native forecast cadence is staggered, while fallback and control re-entry refresh immediately',()=>{
  const schedules=new Map();
  for(let n=0;n<9;n++){
    const f=tacticalFixture('forecast-'+n),ticks=[];let writes=0,value=f.ai.forecastFarThreat;
    Object.defineProperty(f.ai,'forecastFarThreat',{enumerable:true,configurable:true,get:()=>value,set:v=>{writes++;value=v;}});
    for(let tick=0;tick<61;tick++){
      const before=writes;f.scene.weaponThreatEnvelope=new lab.WeaponThreatEnvelope();f.step();f.scene.weaponThreatEnvelope.close();
      if(writes>before)ticks.push(tick);
    }
    assert.equal(ticks.length,21);assert.equal(ticks[0],0);assert.equal(ticks[1],f.ai.tacticalPhase+1);
    for(let i=2;i<ticks.length;i++)assert.equal(ticks[i]-ticks[i-1],3);
    schedules.set(f.ai.tacticalPhase,ticks);delete f.scene.weaponThreatEnvelope;f.step();assert.equal(f.ai.forecastRemaining,-1);
    f.ship.fireControlMode='MANUAL';f.scene.weaponThreatEnvelope=new lab.WeaponThreatEnvelope();f.step();assert.ok(f.ai.forecastRemaining>0);
  }
  assert.equal(schedules.size,3);
});


// Scan wrappers can be recycled only before a solution accepts ownership. Frozen
// reference imports share the same Ship/Vector2 classes, not a different realm.
function fireTargetSnapshot(controller, f, value) {
  const tracker=controller.trackers.get(f.mount);
  return { target:value?.target.entity.id, kind:value?.target.kind, point:value&&[value.point.x,value.point.y],
    delay:value?.delay,speed:value?.speed,range:value?.range,fireControl:structuredClone(f.mount.fireControl),
    tracker:tracker&&{target:tracker.target?.entity.id,scanIn:tracker.scanIn,firingTime:tracker.firingTime,
      idleFireTime:tracker.idleFireTime,ammoAllowed:tracker.ammoAllowed,random:tracker.random.checkpointWitness()} };
}
function recordOwnershipRun(Controller, missiles) {
  const f=fixture(), controller=new Controller(), log=[], rows=[];
  f.ship.fireControlMode='MANUAL';
  const hull=(id,x,y)=>{const s=new Ship(id,f.target.spec,false,new Vector2(x,y),Math.PI);s.shield.isActive=false;return s;};
  const second=hull('second-hull',400,280),far=hull('far-hull',100000,20000),hidden=hull('hidden-hull',400,-200),dead=hull('dead-hull',200,200);
  hidden.visibilityMask=0;dead.isDead=true;
  f.world.ships=[f.ship,hidden,f.target,far,second,dead];
  for(const s of [f.target,second,far]) {
    const visible=s.isVisibleTo; s.isVisibleTo=function(team){log.push(['visible',this.id,team]);return visible.call(this,team);};
    let x=s.pos.x;Object.defineProperty(s.pos,'x',{enumerable:true,configurable:true,get(){log.push(['x',s.id]);return x;},set(v){x=v;}});
  }
  if(missiles) {
    f.target.pos.set(250,-140);second.pos.set(200,160);
    f.mount.spec={...modManager.getWeapon('pdlaser'),aiHints:['PD'],isPointDefense:true};
    const missile=(id,x,y,vx,vy)=>({id,teamId:1,pos:new Vector2(x,y),vel:new Vector2(vx,vy),radius:8,
      hitpoints:100,flightTimeRemaining:20,isRocket:true,damage:100});
    f.world.missiles=[{...missile('dead-missile',40,0,-10,0),hitpoints:0},missile('one',240,0,-10,0),
      missile('far-missile',100000,20000,-10,0),missile('two',150,60,-150,-60),
      {...missile('last-reject',200,0,-10,0),collisionDisabled:true}];
  }
  const first=controller.aim(.1,f.ship,f.mount,f.world);assert.ok(first);
  const firstTarget=first.target,firstEntity=firstTarget.entity;
  assert.equal(firstTarget.kind,missiles?'MISSILE':'SHIP');if(!missiles)assert.equal(firstEntity,f.target);
  rows.push(fireTargetSnapshot(controller,f,first));
  if(missiles)firstEntity.hitpoints=0;else {f.target.visibilityMask=0;f.ship.currentTargetShip=second;}
  const next=controller.aim(1,f.ship,f.mount,f.world);assert.ok(next);assert.notEqual(next.target,firstTarget);
  assert.notEqual(next.target.entity,firstEntity);assert.equal(firstTarget.entity,firstEntity);
  rows.push(fireTargetSnapshot(controller,f,next));
  const nextTarget=next.target,nextEntity=nextTarget.entity;
  for(const s of f.world.ships)if(s!==f.ship)s.visibilityMask=0;
  for(const p of f.world.missiles)p.hitpoints=0;
  assert.equal(controller.aim(1,f.ship,f.mount,f.world),null);
  assert.equal(firstTarget.entity,firstEntity);assert.equal(nextTarget.entity,nextEntity);
  rows.push(fireTargetSnapshot(controller,f,null));
  // A retained target is an accepted snapshot of the reference, not a live scan cursor.
  assert.equal(first.target,firstTarget);assert.equal(next.target,nextTarget);
  return {rows,log};
}
test('fire target records preserve accepted identities, mixed candidates and observable reads',()=>{
  for(const missiles of [false,true]) {
    const actual=recordOwnershipRun(AutofireController,missiles);
    if(lab.BeforeAutofireController)assert.deepEqual(actual,recordOwnershipRun(lab.BeforeAutofireController,missiles));
  }
});
function reentrantPreAimRun(Controller) {
  const outer=fixture(), inner=fixture(), controller=new Controller(),log=[];
  const far=new Ship('last-far',outer.target.spec,false,new Vector2(100000,100000),0);far.shield.isActive=false;
  outer.world.ships=[outer.ship,far,outer.target];outer.ship.currentTargetShip=null;
  inner.target.pos.set(300,180);
  let entered=false,nested,nestedPoint;
  const read=outer.target.isVisibleTo;
  outer.target.isVisibleTo=function(team){
    log.push(['outer-visible',this.id,team]);
    if(!entered){entered=true;nested=controller.aim(.1,inner.ship,inner.mount,inner.world);
      nestedPoint=controller.preAim(inner.ship,inner.mount,inner.world);log.push(['reentered',nested?.target.entity.id]);}
    return read.call(this,team);
  };
  const point=controller.preAim(outer.ship,outer.mount,outer.world);assert.ok(point);assert.ok(nestedPoint);assert.ok(nested);
  assert.equal(nested.target.entity,inner.target);
  const preferred=controller.preAim(outer.ship,outer.mount,{...outer.world,ships:[outer.ship,outer.target]});
  assert.deepEqual(point,preferred);
  outer.target.isVisibleTo=()=>{log.push(['throws']);throw Error('live query failure');};
  assert.throws(()=>controller.preAim(outer.ship,outer.mount,outer.world),/live query failure/);
  outer.target.isVisibleTo=read;outer.target.visibilityMask=0;
  assert.equal(controller.preAim(outer.ship,outer.mount,outer.world),null);
  outer.target.visibilityMask=3;
  const recovered=controller.preAim(outer.ship,outer.mount,outer.world);assert.deepEqual(recovered,point);
  assert.equal(nested.target.entity,inner.target);
  return {point:[point.x,point.y],nestedPoint:[nestedPoint.x,nestedPoint.y],nested:fireTargetSnapshot(controller,inner,nested),log};
}
test('preAim scan records are call-local through reentry, dynamic reads and exceptions',()=>{
  const actual=reentrantPreAimRun(AutofireController);
  if(lab.BeforeAutofireController)assert.deepEqual(actual,reentrantPreAimRun(lab.BeforeAutofireController));
});

// Eligibility must preserve the established short-circuit reads even for
// mutable/refitted specs and targets that change kind between acquisition scans.
function eligibilityMatrix(Controller) {
  const rows=[]; let acceptedShips=0, acceptedMissiles=0;
  const cases=[
    {}, {aiHints:['PD_ONLY']}, {aiHints:['PD_ONLY','ANTI_FTR']}, {aiHints:['STRIKE']},
    {aiHints:['STRIKE','USE_VS_FRIGATES']}, {aiHints:['ANTI_FTR']},
    {passThroughFighters:true}, {passThroughFighters:true,passThroughFightersOnlyWhenDestroyed:true},
    {isGuided:true}, {isBeam:false,isRocket:true}, {isBeam:false,spawnType:'MISSILE'},
    {isBeam:false,isRocket:true,proximityFuse:{range:40}}, {aiHints:['IGNORES_FLARES']},
    {weaponType:'MISSILE',aiHints:[]}, {weaponType:'MISSILE',aiHints:['DO_NOT_AIM']}
  ];
  for(const changes of cases) for(const kind of ['SHIP','MISSILE']) {
    const f=fixture(),controller=new Controller(),log=[];
    f.ship.fireControlMode='MANUAL';f.target.pos.set(250,0);
    f.mount.spec={...modManager.getWeapon('pdlaser'),aiHints:['PD'],isPointDefense:true,...changes};
    const visible=f.target.isVisibleTo;
    f.target.isVisibleTo=function(team){log.push(['visible',team]);return visible.call(this,team);};
    const phase=Object.getOwnPropertyDescriptor(Ship.prototype,'isCollisionless').get;
    Object.defineProperty(f.target,'isCollisionless',{configurable:true,get(){log.push(['collision']);return phase.call(this);}});
    const p={id:'eligibility-missile',sourceShipId:f.target.id,pos:new Vector2(180,0),vel:new Vector2(-10,0),
      radius:8,hitpoints:100,flightTimeRemaining:20,isRocket:true,damage:100};
    f.world.missiles=kind==='MISSILE'?[p]:[];
    if(kind==='MISSILE')f.target.visibilityMask=0;
    for(let stage=0;stage<8;stage++) {
      if(stage===1) {f.target.spec={...f.target.spec,hullSize:'FIGHTER'};p.isFighterDecoy=true;}
      if(stage===2) {f.target.spec={...f.target.spec,hullSize:'FRIGATE'};p.isFighterDecoy=false;p.isFlare=true;}
      if(stage===3) {f.target.isDocked=true;p.collisionDisabled=true;}
      if(stage===4) {f.target.isDocked=false;f.target.isDead=true;p.collisionDisabled=false;p.hitpoints=0;}
      if(stage===5) {f.target.isDead=false;p.hitpoints=100;p.flightTimeRemaining=0;f.target.visibilityMask=0;}
      if(stage===6) {f.target.visibilityMask=kind==='SHIP'?3:0;p.flightTimeRemaining=20;p.isFlare=false;}
      if(stage===7) {f.world.ships=[f.ship];f.world.missiles=[];}
      const value=controller.aim(.3,f.ship,f.mount,f.world);
      if(value?.target.kind==='SHIP')acceptedShips++;
      if(value?.target.kind==='MISSILE')acceptedMissiles++;
      const pre=controller.preAim(f.ship,f.mount,f.world);
      rows.push({kind,changes,stage,value:fireTargetSnapshot(controller,f,value),pre:pre&&[pre.x,pre.y],log:log.splice(0)});
    }
  }
  assert.ok(acceptedShips>0);assert.ok(acceptedMissiles>0);
  return {rows,acceptedShips,acceptedMissiles};
}
test('fire control preserves 240 eligibility transitions, source fallback and live read order',()=>{
  const actual=eligibilityMatrix(AutofireController);
  assert.equal(actual.rows.length,240);
  if(lab.BeforeAutofireController)assert.deepEqual(actual,eligibilityMatrix(lab.BeforeAutofireController));
});


function rankingPreAimRun(Controller,mode) {
  const f=fixture(),controller=new Controller(),log=[];
  f.ship.currentTargetShip=null;
  const second=new Ship('ranking-second',f.target.spec,false,new Vector2(520,80),0);second.shield.isActive=false;
  const far=new Ship('ranking-far',f.target.spec,false,new Vector2(100000,0),0);far.shield.isActive=false;
  const hidden=new Ship('ranking-hidden',f.target.spec,false,new Vector2(30,0),0);hidden.visibilityMask=0;
  f.target.pos.set(550,0);f.world.ships=[f.ship,far,hidden,f.target,second];
  if(mode==='tie') {f.target.pos.set(500,50);second.pos.set(500,-50);}
  if(mode==='preferred')f.ship.currentTargetShip=second;
  if(mode==='none') {f.target.pos.set(100000,0);second.pos.set(100000,0);}
  const originalVisible=f.target.isVisibleTo;
  f.target.isVisibleTo=function(team){log.push(['visible',this.id]);if(mode==='move')this.pos.set(450,0);return originalVisible.call(this,team);};
  const originalSecond=second.isVisibleTo;
  second.isVisibleTo=function(team){log.push(['visible',this.id]);return originalSecond.call(this,team);};
  const point=controller.preAim(f.ship,f.mount,f.world);
  if(mode==='none')assert.equal(point,null);else assert.ok(point);
  if(mode==='move')assert.deepEqual([point.x,point.y],[second.pos.x,second.pos.y],'rank by coordinates captured BEFORE callback movement');
  if(mode==='tie')assert.deepEqual([point.x,point.y],[f.target.pos.x,f.target.pos.y],'first candidate wins exact tie');
  return {point:point&&[point.x,point.y],log};
}
test('preAim ranking preserves moving callbacks, ties, preferred targets and all-rejected scans',()=>{
  for(const mode of ['move','tie','preferred','none']) {
    const actual=rankingPreAimRun(AutofireController,mode);
    if(lab.BeforeAutofireController)assert.deepEqual(actual,rankingPreAimRun(lab.BeforeAutofireController,mode));
  }
});


function ownedQueryFixture() {
  const engine=new lab.CombatEngine('onslaught','onslaught',917);
  engine.playerShip.fireControlMode='AI';engine.playerShip.currentTargetShip=null;
  engine.playerShip.pos.set(0,0);engine.enemyShip.pos.set(600,0);
  for(let i=0;i<98;i++)engine.addShip('onslaught',i%2===0,new Vector2(850+(i%7)*160,(Math.floor(i/7)-7)*260),0);
  const ships=engine.ships;
  for(const ship of ships) {ship.shield.isActive=false;ship.vel.set(0,0);}
  return {engine,ships,ship:engine.playerShip,target:engine.enemyShip,world:{ships,missiles:[],asteroids:[]}};
}
test('private Worker registration admits real native rosters but never upgrades a generic engine',()=>{
  const f=ownedQueryFixture(),Roster=lab.FireControlQueryRoster;
  assert.equal(f.ships.length,100);
  assert.equal(Roster.create(f.ships,f.engine),undefined,'legacy reflective admission remains unchanged');
  assert.equal(f.ships.every(lab.hasOwnedFireControlReadHooks),true);
  Roster.ownForWorker(f.engine);
  assert.equal(Roster.create(f.ships.slice(0,99),f.engine),undefined,'small battles retain old path');
  const roster=Roster.create(f.ships,f.engine);assert.ok(roster);
  assert.equal(Roster.create(f.ships),undefined,'no ambient/global opt-in');
  const world={...f.world,queryRoster:roster},batch=lab.FireControlQueryBatch.create(f.ship,world);assert.ok(batch);
  const targets=batch.targets();assert.ok(targets.length>1);assert.ok(targets.includes(f.target));assert.ok(!targets.includes(f.ship));
  assert.equal(batch.targets(),targets,'one materialized candidate roster for all mounts');
  assert.equal(batch.targetStatus.size,100,'eligibility read once per roster entry');
  for(let i=0;i<50;i++){assert.equal(batch.canTarget(f.target),true);assert.equal(batch.targets(),targets);}
  assert.equal(batch.targetStatus.size,100,'repeated mount queries reuse the same entries');
  assert.equal(batch.forShip(f.target,f.ships),undefined);
  assert.equal(batch.forShip(f.ship,[...f.ships]),undefined);
  batch.close();assert.equal(batch.forShip(f.ship,f.ships),undefined);
  for(const [field,value,expected] of [['isDead',true,false],['isDocked',true,false],['visibilityMask',0,false],['teamId',f.ship.teamId,false],['isRetreated',true,false]]) {
    const before=f.target[field];f.target[field]=value;
    const next=roster.begin(f.ship,world);assert.ok(next);assert.equal(next.canTarget(f.target),expected,field);next.close();
    f.target[field]=before;const restored=roster.begin(f.ship,world);assert.ok(restored);assert.equal(restored.canTarget(f.target),true,field+' restored');restored.close();
  }
  const type=f.target.shield.type;f.target.shield.type='PHASE';f.target.shield.phaseState='ACTIVE';f.target.shield.phaseEffectLevel=1;
  const phased=roster.begin(f.ship,world);assert.ok(phased);assert.equal(phased.canTarget(f.target),false);phased.close();
  f.target.shield.type=type;f.target.shield.phaseState='IDLE';f.target.shield.phaseEffectLevel=0;
  f.ships.push(f.ship);assert.equal(roster.begin(f.ship,world),undefined);f.ships.pop();
  assert.equal(roster.begin(f.ship,{...world,ships:[...f.ships]}),undefined);
  roster.close();assert.equal(roster.matches(f.ships),false);assert.equal(roster.begin(f.ship,world),undefined);
});

test('owned fire-query admission refreshes live effects, definitions and component callbacks at every begin',()=>{
  const f=ownedQueryFixture(),Roster=lab.FireControlQueryRoster;Roster.ownForWorker(f.engine);
  const roster=Roster.create(f.ships,f.engine),s=f.target;
  const compare=label=>{if(lab.BeforeHasOwnedFireControlReadHooks)assert.equal(lab.hasOwnedFireControlReadHooks(s),lab.BeforeHasOwnedFireControlReadHooks(s),label);};
  const reject=(install,label)=>{const undo=install();try{compare(label);assert.equal(roster.begin(f.ship,f.world),undefined,label);}finally{undo();}
    compare(label+' restored');const batch=roster.begin(f.ship,f.world);assert.ok(batch,label+' restored');batch.close();};
  const replace=(obj,key,value)=>()=>{const before=obj[key];obj[key]=value;return()=>{obj[key]=before;};};
  reject(()=>{s.externalPhaseEffects.set(f,()=>undefined);return()=>s.externalPhaseEffects.delete(f);},'external phase callback');
  reject(()=>{s.damageTakenModifiers.set('test',()=>1);return()=>s.damageTakenModifiers.delete('test');},'external damage callback');
  reject(()=>{s.runtimeModifiers.set('test',{collisionDisabled:1});return()=>s.runtimeModifiers.delete('test');},'runtime modifier');
  reject(replace(s.shield,'externalDamageTakenMultiplier',()=>1),'shield callback');
  reject(replace(s.armor,'damageTakenModifiers',()=>({armor:1,hull:1})),'armor callback');
  reject(replace(s.armor,'dynamicEffectiveArmorMultiplier',()=>1),'effective armor callback');
  reject(replace(s.armor,'onCellDamage',()=>{}),'cell callback');
  reject(replace(s.flux,'onOverloadStarted',()=>{}),'overload callback');
  reject(replace(s,'spec',{...s.spec}),'mutable/foreign metadata');
  reject(replace(s.system,'definition',{...s.system.definition}),'unregistered system definition');
  reject(replace(s.defenseSystem,'definition',{...s.defenseSystem.definition}),'unregistered defense definition');
  reject(replace(s.system,'auxiliary',undefined),'broken auxiliary chain');
  reject(replace(s.defenseSystem,'auxiliary',s.system),'extra auxiliary chain');
  reject(replace(s,'parentShip',f.ship),'assembly');reject(replace(s,'sourceCarrier',f.ship),'carrier');
  reject(()=>{s.systems.push(s.defenseSystem);return()=>s.systems.pop();},'multi-system composition');
  reject(()=>{const intercept=()=>false;s.hullDamageInterceptors.add(intercept);return()=>s.hullDamageInterceptors.delete(intercept);},'damage interceptor');
  assert.equal(roster.begin(f.ship,{...f.world,fireBudget:{estimate:()=>0,penalty:()=>0}}),undefined,'foreign budget');
  roster.close();
});

test('owned admission preserves the native AI-to-stats implication across live system compositions',()=>{
  const f=ownedQueryFixture(),Roster=lab.FireControlQueryRoster,s=f.target;
  Roster.ownForWorker(f.engine);const roster=Roster.create(f.ships,f.engine);assert.ok(roster);
  const registry=lab.shipSystemDefinitions,registered=registry.all();
  const native=registered.filter(lab.hasNativeThreatPhaseAI);
  const statsOnly=registered.filter(d=>!lab.hasNativeThreatPhaseAI(d)&&lab.hasNativeSystemStats(d));
  assert.ok(native.length>1);assert.ok(statsOnly.length>0,'Eclipse must remain stats-only');
  // Even a registry-frozen external definition is not in the private native AI set.
  const foreignId='TEST_OWNED_ADMISSION_FOREIGN';
  registry.register({...registry.require('NONE'),id:foreignId,sourceIds:[]});
  const foreign=registry.require(foreignId),cloned=Object.freeze({...native[0]});
  assert.equal(lab.hasNativeThreatPhaseAI(foreign),false);assert.equal(lab.hasNativeSystemStats(foreign),false);
  assert.equal(lab.hasNativeThreatPhaseAI(cloned),false);assert.equal(lab.hasNativeSystemStats(cloned),false);
  const definitions=[...registered,foreign,cloned],main=s.system.definition,defense=s.defenseSystem.definition;
  let comparisons=0,admitted=0,rejected=0;
  const check=(expected,label)=>{
    const actual=lab.hasOwnedFireControlReadHooks(s);assert.equal(actual,expected,label);
    if(lab.BeforeHasOwnedFireControlReadHooks)assert.equal(actual,lab.BeforeHasOwnedFireControlReadHooks(s),'frozen/'+label);
    const batch=roster.begin(f.ship,f.world);assert.equal(!!batch,expected,'batch/'+label);batch?.close();
    comparisons++;if(expected)admitted++;else rejected++;
  };
  try {
    for(const a of definitions)for(const b of definitions){
      s.system.definition=a;s.defenseSystem.definition=b;
      const expected=lab.hasNativeThreatPhaseAI(a)&&lab.hasNativeThreatPhaseAI(b);
      if(expected){assert.equal(s.system.hasNativeStats,true);assert.equal(s.defenseSystem.hasNativeStats,true);}
      check(expected,a.id+'/'+b.id);
    }
    s.system.definition=main;s.defenseSystem.definition=defense;
    check(true,'restored');
    // Rejection of an earlier batch never becomes cached permission. Nor may the
    // full roster scan be removed: mutate the last entry rather than the shooter.
    const last=f.ships.at(-1),lastDefinition=last.system.definition;
    for(const d of [foreign,...statsOnly]){
      last.system.definition=d;
      try {
        assert.equal(lab.hasOwnedFireControlReadHooks(last),false);
        if(lab.BeforeHasOwnedFireControlReadHooks)assert.equal(lab.BeforeHasOwnedFireControlReadHooks(last),false);
        assert.equal(roster.begin(f.ship,f.world),undefined,'last roster entry invalidates each begin');
      } finally {last.system.definition=lastDefinition;}
      check(true,'last entry restored');
    }
  } finally {s.system.definition=main;s.defenseSystem.definition=defense;roster.close();}
  assert.equal(roster.begin(f.ship,f.world),undefined);
  console.log('  '+JSON.stringify({registered:registered.length,native:native.length,statsOnly:statsOnly.map(d=>d.id),comparisons,admitted,rejected,frozenReference:!!lab.BeforeHasOwnedFireControlReadHooks}));
});

test('owned multi-mount queries match uncached selection, preAim, decisions and tracker RNG through live transitions',()=>{
  const f=ownedQueryFixture(),Roster=lab.FireControlQueryRoster;Roster.ownForWorker(f.engine);
  const roster=Roster.create(f.ships,f.engine),reference=new AutofireController(),candidate=new AutofireController();
  f.world.fireBudget=new InFlightFireBudget(f.ships,[]);
  let compared=0;
  for(let stage=0;stage<8;stage++) {
    f.target.isDead=stage===1;f.target.visibilityMask=stage===2?0:3;f.target.isDocked=stage===3;
    f.target.teamId=stage===4?f.ship.teamId:1;f.target.pos.set(600+stage*24,stage*7);f.target.vel.set(stage*3,stage*-2);
    f.target.shield.isActive=stage===5;f.target.shield.currentArcDeg=stage===5?180:0;
    f.target.shield.phaseState=stage===6?'ACTIVE':'IDLE';f.target.shield.phaseEffectLevel=stage===6?1:0;
    const type=f.target.shield.type;if(stage===6)f.target.shield.type='PHASE';
    const batch=roster.begin(f.ship,f.world);assert.ok(batch);
    try {
      for(const mount of f.ship.weapons) {
        const read=(controller,world)=>{const value=controller.aim(.1,f.ship,mount,world),pre=controller.preAim(f.ship,mount,world);
          const decision=controller.decide(f.ship,mount,value,world,.1);
          return {state:fireTargetSnapshot(controller,{...f,mount},value),pre:pre&&[pre.x,pre.y],decision};};
        assert.deepEqual(read(candidate,{...f.world,queryBatch:batch}),read(reference,f.world),`stage ${stage}/${mount.slotId}`);compared++;
      }
    } finally {batch.close();f.target.shield.type=type;}
  }
  roster.close();assert.ok(compared>=100);console.log(`  ${compared} mount/stage comparisons`);
});

test('native engine integration closes every owned batch before leaving the ship weapon loop',()=>{
  const f=ownedQueryFixture(),Roster=lab.FireControlQueryRoster,captured=[],begin=Roster.prototype.begin;
  Roster.ownForWorker(f.engine);
  try {Roster.prototype.begin=function(ship,world){const batch=begin.call(this,ship,world);if(batch)captured.push({batch,ship,ships:world.ships});return batch;};
    f.engine.fixedUpdate(1/60);
  } finally {Roster.prototype.begin=begin;}
  assert.equal(captured.length,100,'production engine gate and complete weapon update must actually use the query domain');
  for(const {batch,ship,ships} of captured)assert.equal(batch.forShip(ship,ships),undefined,'batch cannot escape its pre-emission loop');
});

test('owned preAim range bounds preserve old candidates, live batches and full fire-control state',()=>{
  console.log('  '+JSON.stringify(checkOwnedPreAimRange(lab,ownedQueryFixture,fireTargetSnapshot)));
});

test('owned fire-query certificates refresh every live hook and replaced identity',()=>{
  console.log('  '+JSON.stringify(checkOwnedFireGuards(lab,ownedQueryFixture)));
});

test('owned hostile-query membership preserves live targeting and complete Publisher validation',()=>{
  console.log('  '+JSON.stringify(checkOwnedHostileQueries(lab,ownedQueryFixture)));
});
test('owned qualified lists preserve per-weapon results and revoke at the read-phase boundary',()=>{
  console.log('  '+JSON.stringify(checkQualifiedFireTargets(lab,ownedQueryFixture,fireTargetSnapshot)));
});
// Ordinary wings share the live carrier system, not a separate mock AI implementation.
function wingFixture(real = false) {
  const engine = new lab.CombatEngine('hammerhead', 'hammerhead', 781);
  const carrier = engine.playerShip, enemy = engine.enemyShip, system = engine.fighterSystem;
  carrier.pos.set(-500, 0); carrier.facingRad = 0; enemy.pos.set(1600, 0); enemy.facingRad = Math.PI;
  system.init(carrier, enemy, {player:[
    {specId:'broadsword',role:'FIGHTER',count:1,range:4000,rebuildSeconds:10},
    {specId:'dagger',role:'BOMBER',count:1,range:4000,rebuildSeconds:18}],
    enemy:[{specId:'broadsword',role:'FIGHTER',count:2,range:4000,rebuildSeconds:10}]});
  const fighter = system.fighters[0], bomber = system.bombers[0], foes = system.fighters.slice(1);
  fighter.pos.set(0,0); bomber.pos.set(0,500); fighter.facingRad = bomber.facingRad = 0;
  for(const foe of foes)foe.pos.set(10000,0);
  const orders = new Map(), updates = new Map(), missiles = [], noop = () => {};
  const fx = {spawnContrail:noop,spawnAuthenticExplosion:noop,spawnDebris:noop,addFloatingText:noop,addCameraShake:noop,
    addRadioMessage:noop,cancelOrder:id=>orders.delete(id),getOrder:id=>orders.get(id),findHostile:craft=>craft.teamId===carrier.teamId?enemy:carrier,
    getPlayerPos:()=>carrier.pos,handleShipDestruction:ship=>{ship.isDead=true;},recordFighterRebuilt:noop,destructionSideEffectsEnabled:()=>true};
  if(!real)for(const craft of [...system.fighters,...system.bombers])craft.update=(...args)=>updates.set(craft.id,args);
  const fighters=()=>system.updateFighters(1/60,carrier,enemy,missiles,noop,noop,noop,fx);
  const bombers=(dt=1/60)=>system.updateBombers(dt,carrier,enemy,noop,noop,noop,fx);
  const payload=bomber.weapons.filter(w=>w.spec.weaponType==='MISSILE'&&!w.spec.isPointDefense);
  assert.ok(payload.length,'native dagger payload');
  const rocket=(id,x=400,y=0,vx=-200,vy=0)=>({id,isRocket:true,teamId:enemy.teamId,pos:new Vector2(x,y),vel:new Vector2(vx,vy),radius:8,rangeRemaining:3000,hitpoints:50});
  return {engine,carrier,enemy,system,fighter,bomber,foes,orders,updates,missiles,fx,fighters,bombers,payload,rocket};
}
test('fighter recall and waypoint orders beat interception; zero-range wings remain on station',()=>{
  const f=wingFixture();f.missiles.push(f.rocket(1));f.carrier.fighterRecall=true;f.fighters();
  assert.equal(f.system.fighterAIModes.get(f.fighter.id).state,'ESCORT');assert.equal(f.fighter.aiHoldOffensiveFire,true);
  f.carrier.fighterRecall=false;f.orders.set(f.fighter.id,{type:'WAYPOINT',targetPos:new Vector2(0,-700)});f.fighters();
  assert.equal(f.system.fighterAIModes.get(f.fighter.id).state,'ESCORT');assert.ok(f.fighter.turnInput<0);assert.equal(f.fighter.currentTargetShip,null);
  f.orders.clear();f.system.playerWings[0].range=0;f.fighters();assert.equal(f.system.fighterAIModes.get(f.fighter.id).state,'ESCORT');
});
test('fighter interception rejects decoys, dead, disarmed and receding missiles and ranks incoming trajectories',()=>{
  const f=wingFixture();f.missiles.push(f.rocket(1,100,0,200),{...f.rocket(2),isFlare:true},{...f.rocket(3),isDisarmed:true},
    {...f.rocket(4),hitpoints:0},{...f.rocket(5),rangeRemaining:0},{...f.rocket(6),collisionDisabled:true},
    {...f.rocket(7),missileFizzleTime:1}, {...f.rocket(8),teamId:f.carrier.teamId});
  f.fighters();assert.notEqual(f.system.fighterAIModes.get(f.fighter.id).state,'INTERCEPT');
  // Earlier array entry has a much later intercept. The urgent trajectory is below the fighter.
  f.missiles.push(f.rocket(9,800,0,-210),f.rocket(10,200,-80,-250,100));f.fighters();
  assert.equal(f.system.fighterAIModes.get(f.fighter.id).state,'INTERCEPT');assert.ok(f.fighter.aimTargetWorld.y<0);
  assert.equal(f.fighter.currentTargetShip,null);assert.equal(f.updates.get(f.fighter.id)[1],null);
});
test('fighter dogfight target is stable, visible, hostile and passed through to weapon control',()=>{
  const f=wingFixture(),[a,b]=f.foes;a.pos.set(400,50);b.pos.set(470,50);f.fighters();
  assert.equal(f.fighter.currentTargetShip,a);assert.equal(f.updates.get(f.fighter.id)[1],a);assert.equal(f.fighter.fireControlMode,'AI');
  a.pos.x=430;b.pos.x=420;f.fighters();assert.equal(f.fighter.currentTargetShip,a);
  a.visibilityMask=0;f.fighters();assert.equal(f.fighter.currentTargetShip,b);
  b.teamId=f.fighter.teamId;f.fighters();assert.equal(f.fighter.currentTargetShip,f.enemy);
  b.teamId=3;b.isDocked=true;f.fighters();assert.equal(f.fighter.currentTargetShip,f.enemy);
  b.isDocked=false;b.isRetreated=true;f.fighters();assert.equal(f.fighter.currentTargetShip,f.enemy);
  b.isRetreated=false;f.fighters();assert.equal(f.fighter.currentTargetShip,b);
  f.system.playerWings[0].range=100;f.fighters();assert.equal(f.system.fighterAIModes.get(f.fighter.id).state,'ESCORT');
});
test('fighter uses live weapon ranges and lead; large hulls cause an outward break, not a center charge',()=>{
  const f=wingFixture();const gun=f.fighter.weapons.find(w=>w.spec.weaponType!=='MISSILE');assert.ok(gun);
  f.fighter.weapons=[gun];gun.spec={...gun.spec,range:1200};gun.arcDeg=360;gun.baseAngleDeg=0;gun.relativePos.set(0,0);
  f.enemy.pos.set(800,0);f.enemy.vel.set(0,50);f.fighters();assert.ok(f.fighter.aimTargetWorld.y>0);assert.equal(f.fighter.isFiringMain,true);
  gun.spec={...gun.spec,range:100};f.fighters();assert.equal(f.fighter.isFiringMain,false);
  f.enemy.spec={...f.enemy.spec,collisionRadius:600};f.enemy.pos.set(650,0);f.enemy.vel.set(0,0);f.fighters();
  assert.ok(Math.abs(f.fighter.turnInput)>.5);assert.ok(f.fighter.throttle<.5,'do not drive straight into a capital hull');
});
test('bombers use payload ammo rather than gunfire; finish multiple mounts and committed bursts before returning',()=>{
  const f=wingFixture();for(const w of f.payload){w.spec={...w.spec,maxAmmo:4};w.ammo=4;w.burstRemaining=0;w.firingState='IDLE';}
  f.bombers();assert.equal(f.system.bomberAIModes.get(f.bomber.id).state,'ATTACK_RUN');
  f.payload[0].ammo=3;f.bombers();assert.equal(f.system.bomberAIModes.get(f.bomber.id).hasTorpedo,true);
  const gun={...f.fighter.weapons.find(w=>w.spec.weaponType!=='MISSILE'),slotId:'test-defensive-gun'};f.bomber.weapons.push(gun);const cycle=gun.firingCycleId;
  f.bomber.update=()=>{gun.firingCycleId=cycle+1;};f.bombers();assert.equal(f.system.bomberAIModes.get(f.bomber.id).state,'ATTACK_RUN');
  for(const w of f.payload)w.ammo=0;f.payload[0].burstRemaining=1;f.bombers();assert.equal(f.system.bomberAIModes.get(f.bomber.id).hasTorpedo,true);
  f.payload[0].burstRemaining=0;f.payload[0].firingState='CHARGING';f.bombers();assert.equal(f.system.bomberAIModes.get(f.bomber.id).hasTorpedo,true);
  f.payload[0].firingState='IDLE';f.bombers();assert.equal(f.system.bomberAIModes.get(f.bomber.id).state,'RETURN_TO_REARM');
  assert.equal(f.system.bomberAIModes.get(f.bomber.id).hasTorpedo,false);
});
test('bomber docking follows moving carrier, waits for reload and recall, and never reloads at a dead deck',()=>{
  const f=wingFixture();for(const w of f.payload){w.ammo=0;w.burstRemaining=0;w.firingState='IDLE';}
  f.bomber.pos.copy(f.carrier.pos).add(new Vector2(-f.carrier.spec.collisionRadius*.6,0));f.bomber.vel.set(0,0);f.bombers();
  const mode=f.system.bomberAIModes.get(f.bomber.id);assert.equal(mode.state,'DOCKED');assert.equal(f.bomber.isDocked,true);
  f.carrier.pos.x+=200;f.carrier.fighterRecall=true;f.bombers(.1);assert.deepEqual(f.bomber.pos,f.carrier.pos);assert.equal(f.payload[0].ammo,0);
  f.bombers(30);assert.equal(f.bomber.isDocked,true);assert.ok(f.payload[0].ammo>0);
  f.carrier.fighterRecall=false;f.bombers();assert.equal(f.bomber.isDocked,false);
  const dead=wingFixture();for(const w of dead.payload){w.ammo=0;w.burstRemaining=0;w.firingState='IDLE';}
  dead.system.bomberAIModes.get(dead.bomber.id).state='DOCKED';dead.carrier.isDead=true;dead.bombers(30);
  assert.equal(dead.payload[0].ammo,0);assert.equal(dead.bomber.isDead,true);
  const destroyed=wingFixture();destroyed.bomber.hullHp=0;destroyed.system.bomberAIModes.get(destroyed.bomber.id).state='DOCKED';
  destroyed.bombers(30);assert.equal(destroyed.bomber.isDead,true);assert.equal(destroyed.bomber.hullHp,0);
  const retreat=wingFixture();for(const w of retreat.payload){w.ammo=0;w.burstRemaining=0;w.firingState='IDLE';}
  retreat.carrier.isRetreated=true;retreat.bombers(30);assert.equal(retreat.bomber.isDocked,false);assert.equal(retreat.payload[0].ammo,0);
});
test('ordinary wings run live motion and fire control deterministically in the existing combat engine',()=>{
  function run(){const f=wingFixture(true);f.engine.asteroids.length=0;f.engine.nebulae.length=0;
    f.enemy.pos.set(850,0);f.enemy.weapons=[];f.enemy.shield.isActive=false;f.bomber.pos.set(0,100);
    for(const foe of f.foes)foe.isDead=true;
    let fired=false;
    for(let i=0;i<300;i++){f.engine.fixedUpdate(1/60);fired ||= f.engine.projectiles.some(p=>p.sourceShipId===f.fighter.id||p.sourceShipId===f.bomber.id);}
    assert.equal(fired,true,'real craft must produce projectiles');
    for(const craft of [f.fighter,f.bomber])for(const value of [craft.pos.x,craft.pos.y,craft.vel.x,craft.vel.y,craft.facingRad])assert.ok(Number.isFinite(value));
    return [f.fighter.pos.x,f.fighter.pos.y,f.bomber.pos.x,f.bomber.pos.y,f.enemy.hullHp,...f.payload.map(w=>w.ammo)];
  }
  assert.deepEqual(run(),run());
});
console.log(`PASS ${passed} combat AI foundation checks`);


