/** Fast regressions for ENGAGE being silently replaced by a stationary COVER choice. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCombatLab } from './ai/load-combat-lab.mjs';

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--bundle'))
  throw Error('Usage: node scripts/check-ai-advance.mjs [--bundle lab.mjs]');
const lab = args.length ? await import(pathToFileURL(path.resolve(args[1])).href) : await loadCombatLab();
let passed = 0;
function test(name, fn) { fn(); console.log(`ok ${++passed} - ${name}`); }
function fixture(hull = 'hammerhead', mirror = 1) {
  const env = new lab.CombatLab(812, 0, 0, 3), engine = env.engine;
  engine.switchPlayerShip(hull, 'onslaught'); engine.asteroids.length = 0; engine.nebulae.length = 0;
  const ship = engine.playerShip, target = engine.enemyShip;
  ship.pos.set(0, 0); target.pos.set(1600, 0); ship.facingRad = 0; target.facingRad = Math.PI;
  ship.fireControlMode = 'AI';
  engine.addShip(lab.modManager.requireShip('onslaught'), true, new lab.Vector2(-400, -800 * mirror), 0);
  engine.addShip(lab.modManager.requireShip('onslaught'), false, new lab.Vector2(1600, 700 * mirror), Math.PI);
  return { engine, ship, target, ai: new lab.CapitalShipAI(ship, target) };
}
function world(f) {
  return { ships: f.engine.ships, projectiles: [], beams: [], asteroids: [], fleetPlan: f.engine.planFleetAI() };
}
for (const hull of ['lasher', 'hammerhead']) test(`${hull} immediately advances through crossfire instead of braking outside gun range`, () => {
  for (const mirror of [1, -1]) {
    const f = fixture(hull, mirror);
    for (let i = 0; i < 60; i++) {
      f.engine.updateShipAI(f.ai, 1 / 60);
      assert.equal(f.ship.tacticalAI.mode, 'ENGAGE');
      assert.equal(f.ship.tacticalAI.avoidingCollision, false);
      assert.ok(f.ship.pos.distanceTo(f.target.pos) > f.ship.tacticalAI.desiredRange + 400);
      assert.equal(f.ship.brakeInput, false); assert.ok(f.ship.throttle > 0);
    }
  }
});
test('local crossfire advice preserves at least half of the requested inward progress', () => {
  for (const hull of ['lasher', 'hammerhead']) {
    const f = fixture(hull), scene = world(f), profile = lab.combatProfile(f.ship, f.target);
    profile.range = lab.fleetEngagementRange(f.ship, f.target, profile.range, scene.fleetPlan.get(f.ship.id));
    const desired = new lab.Vector2(f.ship.getMotionStats().maxSpeed, 0);
    const result = lab.chooseCombatVelocity(f.ship, f.target, desired, profile, scene);
    assert.ok(result.velocity.x >= desired.x * .5 - 1e-8);
    // Only missiles can reach in this forecast. They must not count as sustained main-gun fire.
    assert.equal(result.clearFire, 0);
  }
});
test('real three-second CombatEngine motion advances both hulls while retaining all safety controllers', () => {
  for (const hull of ['lasher', 'hammerhead']) {
    const f = fixture(hull);
    for (let i = 0; i < 180; i++) { f.engine.updateShipAI(f.ai, 1 / 60); f.engine.fixedUpdate(1 / 60); }
    assert.ok(f.ship.pos.x > 150, `${hull} advanced only ${f.ship.pos.x}`);
    assert.equal(f.ship.isDead, false);
    console.log(`  ${hull}: forward displacement ${f.ship.pos.x.toFixed(2)}`);
  }
});
test('high flux still withdraws and explicit AVOID/WAYPOINT still own navigation', () => {
  for (const mode of ['WITHDRAW', 'AVOID', 'WAYPOINT']) {
    const f = fixture();
    if (mode === 'WITHDRAW') f.ship.flux.softFlux = f.ship.flux.maxFlux * .95;
    else f.engine.orders.set(f.ship.id, mode === 'AVOID'
      ? { type: mode, targetShipId: f.target.id } : { type: mode, targetPos: { x: -800, y: 0 } });
    f.engine.updateShipAI(f.ai, 1 / 60);
    assert.equal(f.ship.tacticalAI.mode, mode); assert.ok(f.ship.throttle < 0);
    assert.equal(f.ship.tacticalAI.positioning, undefined);
  }
});
test('battle-worn ships still disengage under unsafe pressure instead of receiving an approach floor', () => {
  const f = fixture('lasher'), scene = world(f);
  f.ship.hullHp = f.ship.maxHullHp * .4;
  scene.ships = scene.ships.filter(s => s === f.ship || s.teamId !== f.ship.teamId);
  scene.fleetPlan = lab.planFleetTactics(scene.ships);
  f.ai.update(1 / 60, null, scene);
  assert.equal(f.ship.tacticalAI.fleetTask, 'DISENGAGE'); assert.ok(f.ship.throttle < 0);
});
test('missile-only ships retain useful fire and are not forced into gunship range', () => {
  const f = fixture('lasher');
  f.ship.weapons.splice(0, f.ship.weapons.length, ...f.ship.weapons.filter(m => m.spec.weaponType === 'MISSILE'));
  f.target.pos.set(1400, 0);
  const profile = lab.combatProfile(f.ship, f.target);
  const result = lab.chooseCombatVelocity(f.ship, f.target, new lab.Vector2(), profile,
    { ships: [f.ship, f.target], projectiles: [], beams: [], asteroids: [] });
  assert.ok(profile.range > f.ship.pos.distanceTo(f.target.pos));
  assert.equal(result.clearFire, 1); assert.equal(result.velocity.length(), 0);
});
test('in-range open stationkeeping may still stop', () => {
  const f = fixture(), scene = { ...world(f), ships: [f.ship, f.target] };
  const profile = lab.combatProfile(f.ship, f.target); f.target.pos.x = profile.range;
  const result = lab.chooseCombatVelocity(f.ship, f.target, new lab.Vector2(), profile, scene);
  assert.equal(result.velocity.length(), 0);
});
test('serial and owner planners agree on the repaired crossfire approach', () => {
  const f = fixture(), ais = [f.ai, ...f.engine.getNativeAIs()];
  const publisher = new lab.Publisher(f.engine.ships, ais), owner = new lab.Owner(publisher.models, [0]);
  const frame = publisher.publish(f.engine, ais, 1 / 60), row = owner.plan(frame).rows[0];
  f.engine.updateShipAI(f.ai, 1 / 60, undefined, undefined, new Map(frame.fleetPlan));
  assert.deepEqual(row.tactical, f.ship.tacticalAI);
  assert.equal(f.ship.brakeInput, false); assert.ok(f.ship.throttle > 0);
  for (const [part, fields] of row.changes) if (publisher.models[0].schema[part].kind === 'ship')
    for (const key of ['throttle', 'strafeInput', 'turnInput', 'brakeInput'])
      if (key in fields) assert.equal(fields[key], f.ship[key]);
});
console.log(`PASS ${passed} AI approach checks`);
