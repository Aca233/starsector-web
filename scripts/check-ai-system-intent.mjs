/** Navigation owns movement intent; attack drives may not override it. No RL or balance tuning. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCombatLab } from './ai/load-combat-lab.mjs';

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--bundle'))
  throw Error('Usage: node scripts/check-ai-system-intent.mjs [--bundle lab.mjs]');
const lab = args.length ? await import(pathToFileURL(path.resolve(args[1])).href) : await loadCombatLab();
const { Ship, Vector2, SimulationRandom, CapitalShipAI, modManager } = lab;
const drives = [['onslaught', 6000], ['shrike', 6000], ['retribution', 1800], ['nova', 2200], ['shrouded_maw', 1600]];
let passed = 0;
function test(name, fn) { fn(); console.log(`ok ${++passed} - ${name}`); }
function fixture(hull, distance, highFlux = false) {
  const ship = new Ship('own', modManager.requireShip(hull), true, new Vector2(), 0, new SimulationRandom(9101));
  const target = new Ship('enemy', modManager.requireShip('hammerhead'), false, new Vector2(distance, 0), Math.PI, new SimulationRandom(9102));
  const ally = new Ship('anchor', modManager.requireShip('onslaught'), true, new Vector2(-1500, 1200), 0, new SimulationRandom(9103));
  for (const s of [ship, target, ally]) { s.fireControlMode = 'AI'; s.shield.setActive(false); s.vel.set(0, 0); }
  if (highFlux) ship.flux.softFlux = ship.flux.maxFlux * .92;
  return { ship, target, ally, ai: new CapitalShipAI(ship, target),
    scene: { ships: [ship, target, ally], projectiles: [], beams: [], asteroids: [], fleetPlan: new Map() } };
}
function assignment(f, task) {
  return { targetId: f.target.id, role: 'LINE', task, score: 1, pressureRatio: 3,
    assignedPower: 0, carrierRange: 0, anchorId: task === 'REGROUP' ? f.ally.id : null, approachBearing: null };
}

test('AVOID and ESCORT cannot start attack drives against reverse navigation', () => {
  for (const [hull, distance] of drives) for (const type of ['AVOID', 'ESCORT']) {
    const f = fixture(hull, distance);
    f.ai.update(1 / 60, { type, targetShipId: type === 'AVOID' ? f.target.id : f.ally.id }, f.scene);
    assert.equal(f.ship.tacticalAI.mode, type); assert.ok(f.ship.throttle < 0, `${hull}/${type} must request reverse thrust`);
    assert.equal(f.ship.system.isActive, false, `${hull}/${type} attack drive started`);
  }
});
test('WAYPOINT and DEFEND stationkeeping cannot start attack drives', () => {
  for (const [hull, distance] of drives) for (const type of ['WAYPOINT', 'DEFEND']) {
    const f = fixture(hull, distance);
    f.ai.update(1 / 60, { type, targetPos: { x: 500, y: 0 } }, f.scene);
    assert.equal(f.ship.tacticalAI.mode, type); assert.equal(f.ship.system.isActive, false, `${hull}/${type}`);
  }
});
test('high-flux withdrawal prevents attack drives including Orion and Nova', () => {
  for (const [hull, distance] of drives) {
    const f = fixture(hull, distance, true); f.ai.update(1 / 60, null, f.scene);
    assert.equal(f.ship.tacticalAI.mode, 'WITHDRAW'); assert.equal(f.ship.system.isActive, false, hull);
  }
});
test('fleet DISENGAGE and REGROUP retain movement ownership at low flux', () => {
  for (const [hull, distance] of drives) for (const task of ['DISENGAGE', 'REGROUP']) {
    const f = fixture(hull, distance); f.scene.fleetPlan.set(f.ship.id, assignment(f, task));
    f.ai.update(1 / 60, null, f.scene);
    assert.equal(f.ship.tacticalAI.mode, 'WITHDRAW'); assert.equal(f.ship.system.isActive, false, `${hull}/${task}`);
  }
});
test('aligned ordinary and explicit ENGAGE still activate all five native drive families', () => {
  for (const [hull, distance] of drives) for (const explicit of [false, true]) {
    const f = fixture(hull, distance);
    // The default Shrike battery chooses an off-axis facing; the native drive requires alignment.
    f.ship.facingRad = -lab.combatProfile(f.ship, f.target).relativeBearing;
    f.ai.update(1 / 60, explicit ? { type: 'ENGAGE', targetShipId: f.target.id } : null, f.scene);
    assert.equal(f.ship.tacticalAI.mode, 'ENGAGE'); assert.equal(f.ship.system.isActive, true, `${hull}/${explicit}`);
  }
});
test('drive safety rejects collisions, blocked corridors and a denied movement owner', () => {
  for (const [hull] of drives) for (const reason of ['ALLOW', 'withdrawing', 'waypoint', 'avoidingCollision', 'forwardClear', 'allowOffensiveManeuver']) {
    const f = fixture(hull, hull === 'shrouded_maw' ? 1600 : 6000);
    const tactical = { desiredRange: 200, withdrawing: false, waypoint: false, avoidingCollision: false,
      forwardClear: true, allowOffensiveManeuver: true, quietFor: 1, threat: { imminentDamage: 0 } };
    if (reason !== 'ALLOW') tactical[reason] = !['forwardClear', 'allowOffensiveManeuver'].includes(reason);
    f.ship.system.definition.advanceAI({ ship: f.ship, target: f.target,
      distance: f.ship.pos.distanceTo(f.target.pos), angleDiff: 0, tactical });
    assert.equal(f.ship.system.isActive, reason === 'ALLOW', `${hull}/${reason}`);
  }
});
test('real CombatEngine motion follows AVOID reverse thrust instead of forced forward thrust', () => {
  const env = new lab.CombatLab(9110, 0, 0, 3), e = env.engine;
  e.switchPlayerShip('onslaught', 'hammerhead'); e.asteroids.length = 0; e.nebulae.length = 0;
  const s = e.playerShip, t = e.enemyShip;
  s.pos.set(0, 0); t.pos.set(6000, 0); s.facingRad = 0; t.facingRad = Math.PI;
  s.fireControlMode = 'AI'; s.vel.set(0, 0); t.vel.set(0, 0); s.system.reset();
  e.orders.set(s.id, { type: 'AVOID', targetShipId: t.id });
  e.updateShipAI(new CapitalShipAI(s, t), 1 / 60);
  assert.equal(s.tacticalAI.mode, 'AVOID'); assert.ok(s.throttle < 0); assert.equal(s.system.forcesForward, false);
  e.fixedUpdate(1 / 60); assert.ok(s.vel.x < 0); assert.ok(s.pos.x < 0);
});
test('active toggle drive uses normal OUT shutdown instead of rewriting motion physics', () => {
  const f = fixture('onslaught', 6000); f.ai.update(1 / 60, null, f.scene);
  assert.ok(f.ship.system.isActive); f.ship.system.update(.5);
  f.ai.update(1 / 60, { type: 'AVOID', targetShipId: f.target.id }, f.scene);
  assert.equal(f.ship.system.state, 'OUT'); f.ship.system.update(2); assert.equal(f.ship.system.forcesForward, false);
});
test('withdrawal does not erase already-launched non-toggle pulse effects', () => {
  for (const hull of ['retribution', 'nova']) {
    const f = fixture(hull, 2200); f.ai.update(1 / 60, null, f.scene); assert.ok(f.ship.system.isActive);
    const serial = f.ship.system.activationSerial, state = f.ship.system.state;
    f.ship.flux.softFlux = f.ship.flux.maxFlux * .92; f.ai.update(1 / 60, null, f.scene);
    assert.equal(f.ship.system.activationSerial, serial); assert.equal(f.ship.system.state, state);
  }
});
test('manual activation remains available regardless of AI movement policy', () => {
  for (const [hull, distance] of drives) {
    const f = fixture(hull, distance); f.ship.fireControlMode = 'MANUAL';
    assert.equal(f.ship.system.activate(), true, hull); assert.ok(f.ship.system.isActive);
  }
});
test('maneuvering jets can still assist withdrawal', () => {
  const f = fixture('eagle', 1800, true); f.ai.update(1 / 60, null, f.scene);
  assert.equal(f.ship.tacticalAI.mode, 'WITHDRAW'); assert.equal(f.ship.system.isActive, true);
});
test('owner and serial planners agree without adding protocol fields', () => {
  for (const hull of ['onslaught', 'retribution', 'nova']) {
    const env = new lab.CombatLab(9104, 0, 0, 2), e = env.engine; e.switchPlayerShip(hull, 'hammerhead');
    e.asteroids.length = 0; e.nebulae.length = 0;
    const s = e.playerShip, t = e.enemyShip; s.fireControlMode = 'AI'; s.pos.set(0, 0); s.facingRad = 0;
    t.pos.set(2200, 0); t.facingRad = Math.PI; s.flux.softFlux = s.flux.maxFlux * .92;
    const ai = new CapitalShipAI(s, t), ais = [ai, ...e.getNativeAIs()];
    const publisher = new lab.Publisher(e.ships, ais), owner = new lab.Owner(publisher.models, [0]);
    const frame = publisher.publish(e, ais, 1 / 60), row = owner.plan(frame).rows[0];
    e.updateShipAI(ai, 1 / 60, undefined, undefined, new Map(frame.fleetPlan));
    assert.deepEqual(row.tactical, s.tacticalAI); assert.equal(s.system.isActive, false);
    for (const [part, fields] of row.changes) {
      const kind = publisher.models[0].schema[part].kind;
      if (kind === 'ship') for (const k of ['throttle', 'strafeInput', 'turnInput', 'brakeInput', 'aiHoldOffensiveFire'])
        if (k in fields) assert.equal(fields[k], s[k], `${hull}/${k}`);
      if (kind === 'system') for (const k of ['state', 'isActive', 'activationSerial'])
        if (k in fields) assert.equal(fields[k], s.system[k], `${hull}/${k}`);
    }
  }
});
console.log(`PASS ${passed} system movement intent checks`);
