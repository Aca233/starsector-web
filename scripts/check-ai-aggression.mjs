/** Aggression policy: commit healthy gunships; withdraw for real resource pressure. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCombatLab } from './ai/load-combat-lab.mjs';
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--bundle'))
  throw Error('Usage: node scripts/check-ai-aggression.mjs [--bundle lab.mjs]');
const lab = args.length ? await import(pathToFileURL(path.resolve(args[1])).href) : await loadCombatLab();
let passed = 0;
const retreat = ship => ['REGROUP', 'DISENGAGE'].includes(ship.tacticalAI?.fleetTask);
function test(name, fn) { fn(); console.log(`ok ${++passed} - ${name}`); }
function fixture(hull = 'lasher') {
  const env = new lab.CombatLab(924, 0, 0, 45), engine = env.engine;
  engine.switchPlayerShip(hull, 'onslaught'); engine.asteroids.length = 0; engine.nebulae.length = 0;
  const ship = engine.playerShip, target = engine.enemyShip;
  ship.fireControlMode = 'AI'; ship.pos.set(0, 0); ship.facingRad = 0;
  target.pos.set(1600, 0); target.facingRad = Math.PI;
  return { engine, ship, target, ai: new lab.CapitalShipAI(ship, target),
    update() { engine.updateShipAI(this.ai, 1 / 60); } };
}
test('healthy armed ships commit despite stronger visible opposition, not flee before firing', () => {
  for (const hull of ['lasher', 'hammerhead']) for (const flux of [0, .2, .5, .7]) {
    const f = fixture(hull); f.ship.flux.softFlux = f.ship.flux.maxFlux * flux;
    f.engine.addShip(lab.modManager.requireShip('onslaught'), false, new lab.Vector2(1600, 700), Math.PI);
    f.update();
    assert.ok(f.ship.tacticalAI.pressureRatio > 2.5); assert.equal(retreat(f.ship), false);
    assert.equal(f.ship.tacticalAI.mode, 'ENGAGE'); assert.ok(f.ship.throttle > 0);
  }
});
test('pressure retreat has separate flux entry/recovery thresholds and re-engages after recovery', () => {
  const f = fixture();
  for (const [flux, backingOff] of [[.8, true], [.65, true], [.51, true], [.49, false], [.6, false], [.74, false], [.76, true]]) {
    f.ship.flux.softFlux = f.ship.flux.maxFlux * flux; f.update();
    assert.ok(f.ship.tacticalAI.pressureRatio > 2.5);
    assert.equal(retreat(f.ship), backingOff, `flux ${flux}`);
    assert.equal(f.ship.tacticalAI.mode, backingOff ? 'WITHDRAW' : 'ENGAGE');
  }
});
test('damaged, overloaded and venting ships still withdraw under superior enemy pressure', () => {
  for (const state of ['damaged', 'overloaded', 'venting']) {
    const f = fixture();
    if (state === 'damaged') f.ship.hullHp = f.ship.maxHullHp * .4;
    if (state === 'overloaded') f.ship.flux.isOverloaded = true;
    if (state === 'venting') f.ship.flux.isVenting = true;
    f.update(); assert.equal(retreat(f.ship), true, state); assert.ok(f.ship.throttle < 0);
  }
});
test('unarmed hulls and carriers do not inherit gunship commitment', () => {
  for (const hull of ['lasher', 'condor']) {
    const f = fixture(hull);
    if (hull === 'lasher') f.ship.weapons.length = 0;
    f.engine.addShip(lab.modManager.requireShip('onslaught'), false, new lab.Vector2(1600, 700), Math.PI);
    f.update();
    assert.equal(f.ship.tacticalAI.fleetRole, hull === 'lasher' ? 'UNARMED' : 'CARRIER');
    assert.equal(retreat(f.ship), true);
  }
});
test('paper strength alone cannot expand healthy gunship range; real flux reserves still can', () => {
  const f = fixture('hammerhead'), assignment = f.engine.planFleetAI().get(f.ship.id);
  const weak = lab.fleetEngagementRange(f.ship, f.target, 1000, { ...assignment, pressureRatio: 1 });
  const strong = lab.fleetEngagementRange(f.ship, f.target, 1000, { ...assignment, pressureRatio: 10 });
  assert.equal(strong, weak); assert.ok(strong < 1000);
  f.ship.flux.softFlux = f.ship.flux.maxFlux * .85;
  assert.ok(lab.fleetEngagementRange(f.ship, f.target, 1000, assignment) > strong);
  assert.equal(lab.fleetEngagementRange(f.ship, f.target, 1000,
    { ...assignment, role: 'CARRIER', carrierRange: 2400, pressureRatio: 10 }), 2400);
});
test('serial and owner planners agree through healthy attack, pressure retreat and re-engagement', () => {
  const f = fixture(), ais = [f.ai, ...f.engine.getNativeAIs()];
  const publisher = new lab.Publisher(f.engine.ships, ais), owner = new lab.Owner(publisher.models, [0]);
  for (const flux of [0, .8, .6, .49, .6]) {
    f.ship.flux.softFlux = f.ship.flux.maxFlux * flux;
    const frame = publisher.publish(f.engine, ais, 1 / 60), row = owner.plan(frame).rows[0];
    f.engine.updateShipAI(f.ai, 1 / 60, undefined, undefined, new Map(frame.fleetPlan));
    assert.deepEqual(row.tactical, f.ship.tacticalAI);
    for (const [part, fields] of row.changes) if (publisher.models[0].schema[part].kind === 'ship')
      for (const key of ['throttle', 'strafeInput', 'turnInput', 'brakeInput'])
        if (key in fields) assert.equal(fields[key], f.ship[key]);
  }
});
const evidence = [];
test('45-second real-engine passive-target test reaches sustained gunfire, not just forward displacement', () => {
  for (const hull of ['lasher', 'hammerhead']) {
    const f = fixture(hull), { engine, ship, target } = f;
    // A pilot who does nothing: all enemy hardware/stats remain intact and count
    // in the pressure estimate. Only pilot movement/fire/autofire are switched off.
    engine.externallyControlledShipIds.add(target.id); target.fireControlMode = 'MANUAL'; target.clearInput();
    for (const group of target.weaponGroups) group.isAutofire = false;
    let firstGunSeconds = null, firingTicks = 0, withdrawalTicks = 0, minDistance = Infinity;
    for (let i = 0; i < 45 * 60; i++) {
      f.update(); engine.fixedUpdate(1 / 60);
      if (ship.weapons.some(m => m.spec.weaponType !== 'MISSILE' && !m.spec.aiHints?.includes('PD') && m.cooldownTimer > 0)) {
        firstGunSeconds ??= i / 60; firingTicks++;
      }
      withdrawalTicks += ship.tacticalAI?.mode === 'WITHDRAW';
      minDistance = Math.min(minDistance, ship.pos.distanceTo(target.pos));
    }
    const row = { hull, firstGunSeconds, gunCycleSeconds: firingTicks / 60,
      withdrawalSeconds: withdrawalTicks / 60, minDistance, ownHull: ship.hullHp / ship.maxHullHp,
      enemyHull: target.hullHp / target.maxHullHp };
    evidence.push(row); console.log(`  ${JSON.stringify(row)}`);
    assert.notEqual(firstGunSeconds, null); assert.ok(firstGunSeconds < 6);
    assert.ok(firingTicks > 600, `${hull}: insufficient sustained main-gun engagement`);
    assert.equal(ship.isDead, false); assert.ok(row.enemyHull < 1);
  }
});
if (!args.length) {
  fs.mkdirSync('artifacts/ai/aggression-2026-09-19', { recursive: true });
  fs.writeFileSync('artifacts/ai/aggression-2026-09-19/engagement-check.json', JSON.stringify({
    engineBundleSha256: lab.engineBundleSha256, kind: 'passive-target engagement regression; not a win-rate benchmark', evidence,
  }, null, 2));
}
console.log(`PASS ${passed} AI aggression checks`);
