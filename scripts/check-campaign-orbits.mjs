import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createReferenceRuleset } from '../src/campaign/ReferenceRuleset.mjs';
import { CampaignRuleRegistry } from '../src/campaign/core/RuleRegistry.mjs';
import { CampaignRepository } from '../server/campaign/Repository.mjs';
import { createDevelopmentCampaign } from '../server/campaign/DevelopmentWorld.mjs';
import { originalOrbitsProvider, advanceOriginalOrbit, originalOrbitOrder, validateOriginalOrbit } from '../src/campaign/rules/OriginalOrbits.mjs';
import { originalTravelProvider } from '../src/campaign/rules/OriginalTravel.mjs';
import { originalFleetStatsProvider } from '../src/campaign/rules/OriginalFleetStats.mjs';
import { originalLogisticsProvider } from '../src/campaign/rules/OriginalLogistics.mjs';
import { encounterLifecycleProvider } from '../src/campaign/rules/EncounterLifecycle.mjs';
import { cooperativeSimulationProvider } from '../src/campaign/rules/CooperativeSimulation.mjs';

const rules = createReferenceRuleset(), worldId = 'development-sector', fleetId = 'fleet-captain-a';
const system = { kind: 'system', id: 'scheduler' }, player = { kind: 'player', id: 'captain-a' };
const descriptor = overrides => ({ schemaVersion: 1, kind: 'circular', focusId: 'star', radius: 240, periodDays: 10, angleDegrees: 0, ...overrides });
const entity = (id, position, extras = {}) => ({ id, version: 0, name: id, locationId: 'system', position, radius: 40, tags: [], ...extras });
function fixture() {
  const w = structuredClone(createDevelopmentCampaign());
  w.spaceEntities.star = entity('star', [0, 0]);
  w.spaceEntities.exit.orbit = descriptor();
  w.spaceEntities.moon = entity('moon', [280, 0], { orbit: descriptor({ focusId: 'exit', radius: 40, periodDays: 2 }) });
  w.spaceEntities.hyperfocus = entity('hyperfocus', [0, 0], { locationId: 'hyper' });
  w.spaceEntities.well.position = [400, 0];
  w.spaceEntities.well.orbit = descriptor({ focusId: 'hyperfocus', radius: 400, periodDays: 10 });
  return w;
}
function store(t, world = fixture(), selected = rules) {
  const s = new CampaignRepository(':memory:', selected); t.after(() => s.close()); s.create(world); return s;
}
function command(s, type, payload, refs = []) {
  const w = s.read(worldId);
  return { worldId, epoch: s.epoch, requestId: randomUUID(), type, payload,
    expected: refs.map(([collection, id]) => ({ collection, id, version: w[collection][id].version })) };
}
const step = (s, ticks) => s.execute(system, command(s, 'world.advance', { fromTick: s.read(worldId).clock.tick, ticks }));
function physical(w) {
  const copy = structuredClone(w); copy.revision = 0;
  for (const k of ['spaceEntities', 'fleets', 'members']) for (const e of Object.values(copy[k])) e.version = 0;
  return copy;
}
function customRules(provider) {
  const registry = new CampaignRuleRegistry(), providers = [provider, originalTravelProvider, originalFleetStatsProvider,
    originalLogisticsProvider, encounterLifecycleProvider, cooperativeSimulationProvider];
  providers.forEach(p => registry.register(p));
  return registry.compile({ id: 'test.orbits', version: '1', providers: Object.fromEntries(providers.map(p => [p.service, p.id])), settings: rules.lock.settings });
}
function customWorld(selected) { const w = fixture(); w.rules = selected.lock; w.extensions = {}; return w; }

test('native angular direction, point-down and spin use persisted phases without random initialization', () => {
  const focus = entity('star', [0, 0]);
  const circular = advanceOriginalOrbit(entity('p', [0, 0], { orbit: descriptor({ radius: 100, periodDays: 4 }) }), focus, 10);
  assert.equal(circular.orbit.angleDegrees, 270); assert.ok(Math.abs(circular.position[0]) < 0.00001); assert.equal(circular.position[1], -100);
  const down = advanceOriginalOrbit(entity('p', [0, 0], { orbit: descriptor({ kind: 'point-down', periodDays: 4 }) }), focus, 10);
  assert.equal(down.facingDegrees, 270);
  const spin = advanceOriginalOrbit(entity('p', [0, 0], { orbit: descriptor({ kind: 'spin', spinDegreesPerDay: -90, facingDegrees: 20 }) }), focus, 10);
  assert.equal(spin.orbit.facingDegrees, 290); assert.equal(spin.facingDegrees, 290);
  const reverse = advanceOriginalOrbit(entity('p', [0, 0], { orbit: descriptor({ periodDays: -4 }) }), focus, 10);
  assert.equal(reverse.orbit.angleDegrees, 90);
});
test('zero-radius circular focus binding is supported, degenerate variants and unknown parameters are not', () => {
  const focus = entity('star', [123, -45]);
  const bound = advanceOriginalOrbit(entity('p', [0, 0], { orbit: descriptor({ radius: 0, angleDegrees: 123 }) }), focus, 1);
  assert.deepEqual(bound.position, focus.position); assert.equal(bound.orbit.angleDegrees, 0);
  for (const o of [descriptor({ kind: 'ellipse' }), descriptor({ schemaVersion: 2 }), descriptor({ periodDays: 0 }),
    descriptor({ radius: -1 }), descriptor({ radius: 0, kind: 'point-down' }), descriptor({ velocity: 3 }),
    descriptor({ radius: 1e-100 }), descriptor({ angleDegrees: Infinity }), descriptor({ kind: 'spin' }), null]) {
    assert.throws(() => validateOriginalOrbit(o), { code: 'INVALID_ORBIT' });
  }
});
test('graph rejects cycles, absent/foreign focus and unsupported velocity on create, not during the first tick', t => {
  for (const mutate of [w => { w.spaceEntities.star.orbit = descriptor({ focusId: 'moon' }); },
    w => { w.spaceEntities.exit.orbit.focusId = 'missing'; }, w => { w.spaceEntities.exit.orbit.focusId = 'well'; },
    w => { w.spaceEntities.exit.velocity = [1, 0]; }, w => { w.spaceEntities.star.velocity = [1, 0]; },
    w => { w.fleets[fleetId].orbit = descriptor(); }, w => { w.spaceEntities.exit.orbit = {}; }]) {
    const w = fixture(); mutate(w); const s = new CampaignRepository(':memory:', rules); t.after(() => s.close());
    assert.throws(() => s.create(w), { code: 'INVALID_ORBIT' });
  }
});
test('focus-first order is insertion-independent and satellites use the newly advanced parent position', () => {
  const w = fixture(), order = originalOrbitOrder(w); assert.ok(order.indexOf('exit') < order.indexOf('moon'));
  const reverse = structuredClone(w); reverse.spaceEntities = Object.fromEntries(Object.entries(reverse.spaceEntities).reverse());
  assert.deepEqual(originalOrbitOrder(reverse), order);
  const result = rules.services.spaceMotion.advance(w, 1 / 60), updated = Object.fromEntries(result.changes.map(c => [c.id, c.value]));
  const expected = advanceOriginalOrbit(w.spaceEntities.moon, updated.exit, 1 / 60);
  assert.deepEqual(updated.moon.position, expected.position);
  assert.deepEqual(w, fixture(), 'provider must not mutate its input');
});
test('world steps preserve partition invariance and collapse per-frame versions to one atomic entity write', t => {
  const a = store(t), b = store(t); step(a, 600); for (let i = 0; i < 10; i++) step(b, 60);
  assert.deepEqual(physical(a.read(worldId)), physical(b.read(worldId)));
  assert.equal(a.read(worldId).spaceEntities.moon.version, 1); assert.equal(b.read(worldId).spaceEntities.moon.version, 10);
  assert.equal(a.read(worldId).spaceEntities.star.version, 0);
  assert.notDeepEqual(a.read(worldId).spaceEntities.exit.position, fixture().spaceEntities.exit.position);
});
test('orbiting interaction targets can be pursued and jump arrival follows the live destination, with only one fuel debit', t => {
  const s = store(t);
  s.execute(player, command(s, 'fleet.approach', { fleetId, targetId: 'exit' }, [['fleets', fleetId], ['spaceEntities', 'exit']]));
  step(s, 180); assert.equal(s.read(worldId).fleets[fleetId].navigation.interaction.arrived, true);
  const jump = command(s, 'fleet.jump', { fleetId, sourceId: 'exit', destinationIndex: 0 }, [['fleets', fleetId], ['spaceEntities', 'exit'], ['spaceEntities', 'well']]);
  s.execute(player, jump); s.execute(player, jump); assert.equal(s.read(worldId).fleets[fleetId].cargo.fuel, 19);
  for (let i = 0; i < 240 && s.read(worldId).fleets[fleetId].locationId === 'system'; i++) step(s, 1);
  const w = s.read(worldId), fleet = w.fleets[fleetId]; assert.equal(fleet.locationId, 'hyper');
  const distance = Math.hypot(fleet.position[0] - w.spaceEntities.well.position[0], fleet.position[1] - w.spaceEntities.well.position[1]);
  assert.ok(distance >= 120 && distance <= 180, `live target landing distance ${distance}`);
  assert.notDeepEqual(w.spaceEntities.well.position, fixture().spaceEntities.well.position);
});
test('a moving target leaving contact releases only its arrived hold and resumes pursuit', t => {
  const w = fixture(); w.fleets[fleetId].position = [240, 0];
  const s = store(t, w); s.execute(player, command(s, 'fleet.approach', { fleetId, targetId: 'exit' }, [['fleets', fleetId], ['spaceEntities', 'exit']]));
  step(s, 1); assert.equal(s.read(worldId).fleets[fleetId].navigation.interaction.arrived, true);
  step(s, 600); assert.notDeepEqual(s.read(worldId).fleets[fleetId].position, [240, 0]);
});
test('rules replacement may use a different orbit descriptor without editing the world kernel or travel', t => {
  const replacement = { ...originalOrbitsProvider, id: 'test.linear-space', methods: {
    validateWorld: w => { assert.equal(w.spaceEntities.exit.orbit.customMode, 'linear'); },
    advance: w => { const before = w.spaceEntities.exit; assert.ok(Object.isFrozen(w.spaceEntities)); return { changes: [
      { collection: 'spaceEntities', id: 'exit', expectedVersion: before.version, value: { ...before, version: before.version + 1, position: [before.position[0] + 1, 0] } },
    ], events: [] }; },
  } };
  const selected = customRules(replacement), w = customWorld(selected); w.spaceEntities.exit.orbit = { customMode: 'linear' };
  const s = store(t, w, selected); step(s, 6); assert.deepEqual(s.read(worldId).spaceEntities.exit.position, [246, 0]);
});
test('invalid replacement spatial plans reject the entire command without changing the clock or events', t => {
  for (const mode of ['foreign-collection', 'duplicate', 'wrong-version', 'delete', 'clock']) {
    const replacement = { ...originalOrbitsProvider, id: 'test.bad-space', methods: { advance: w => {
      const before = w.spaceEntities.exit, change = { collection: 'spaceEntities', id: 'exit', expectedVersion: before.version, value: { ...before, version: before.version + 1 } };
      const result = { changes: [change], events: [] };
      if (mode === 'foreign-collection') change.collection = 'fleets';
      if (mode === 'duplicate') result.changes.push(change);
      if (mode === 'wrong-version') change.value.version++;
      if (mode === 'delete') change.value = null;
      if (mode === 'clock') result.clock = {};
      return result;
    } } };
    const selected = customRules(replacement), s = store(t, customWorld(selected), selected), before = s.read(worldId);
    assert.throws(() => step(s, 2), { code: 'INVALID_PLAN' }); assert.deepEqual(s.read(worldId), before); assert.deepEqual(s.eventsSince(worldId, 0), []);
  }
});
test('SQLite rollback and reopen preserve orbit phase, position, spin, clock, receipts and outbox together', () => {
  const dir = mkdtempSync(join(tmpdir(), 'campaign-orbits-')), file = join(dir, 'world.sqlite'); let s, db;
  try {
    const w = fixture(); w.spaceEntities.moon.orbit = descriptor({ kind: 'spin', focusId: 'exit', radius: 40, spinDegreesPerDay: 45, facingDegrees: 12 });
    s = new CampaignRepository(file, rules); s.create(w); step(s, 120); const saved = s.read(worldId); s.close();
    s = new CampaignRepository(file, rules); assert.deepEqual(s.read(worldId), saved); db = new DatabaseSync(file);
    db.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT,'orbit-rollback'); END;");
    const events = s.eventsSince(worldId, 0); assert.throws(() => step(s, 60), /orbit-rollback/);
    assert.deepEqual(s.read(worldId), saved); assert.deepEqual(s.eventsSince(worldId, 0), events);
    db.exec('DROP TRIGGER fail_receipt'); step(s, 60); assert.notDeepEqual(s.read(worldId).spaceEntities.moon.orbit, saved.spaceEntities.moon.orbit);
  } finally { db?.close(); s?.close(); for (const p of [file + '-wal', file + '-shm', file]) if (existsSync(p)) unlinkSync(p); rmdirSync(dir); }
});

test('Java source-arithmetic oracle agrees for all three orbit modes over fixed-tick sequences', { skip: !process.argv.includes('--native') }, () => {
  const sources = {
    'campaign/CircularOrbit.java': 'd056d5f454f29225cf4a8b78d2e5c3437f691eb6caf0b09c1676f4540355117d',
    'campaign/CircularOrbitPointDown.java': 'a6965504e72ec2b77b4f7a5634215600c833f5d4dba958fd2b3f2bfdd51f0fc9',
    'campaign/CircularOrbitWithSpin.java': 'dbcbbc967ca9131b1d2687a6c49933ed72ac6e4c1c10ef7ad94e053102ca00de',
    'campaign/BaseLocation.java': '117ab6012c0a62d2f1f16de7578779d02436625f3d0f0352736ace8d09ff210e',
    'campaign/CampaignClock.java': '00c00d08296811f9d3031a35660ddd9c7fdc652eae30b26595605a59051bd3f9',
    'prototype/Utils.java': '42727019119dc578c6c3e05693ce7ca73f1364d086dfdcfbc300d1e5f6fdd438',
  };
  for (const [path, hash] of Object.entries(sources)) assert.equal(createHash('sha256').update(readFileSync(new URL('../../decompiled/starfarer_obf/com/fs/starfarer/' + path, import.meta.url))).digest('hex'), hash, 'Reviewed orbit source drift: ' + path);
  // This is a formula oracle copied from the local decompiled classes, NOT a running-engine integration test.
  const dir = mkdtempSync(join(tmpdir(), 'orbit-oracle-')), file = join(dir, 'OrbitOracle.java');
  const source = `public class OrbitOracle {
    static float norm(float a) { return (a % 360f + 360f) % 360f; }
    public static void main(String[] args) {
      for (int mode=0; mode<3; mode++) for (int sample=0; sample<20; sample++) {
        float radius=40.125f+sample*127.75f, period=sample%2==0?4.7f:-19.3f;
        float angle=sample*18.7f-10.2f, facing=23.125f, spin=-33.25f;
        for(int tick=0;tick<60;tick++) {
          float c=(float)Math.PI*2*radius, speed=c/period, angular=360f/(c/speed), days=(1f/60f)/10f;
          float raw=angle-angular*days, rad=raw*((float)Math.PI/180);
          float x=123.5f+(float)Math.cos(rad)*radius, y=-98.25f+(float)Math.sin(rad)*radius;
          angle=norm(raw); if(mode==1)facing=angle; if(mode==2)facing=norm(facing+spin*days);
          System.out.println(mode+","+sample+","+tick+","+Float.toString(x)+","+Float.toString(y)+","+Float.toString(angle)+","+Float.toString(facing));
        }
      }
    }
  }`;
  try {
    writeFileSync(file, source); const compile = spawnSync('javac', [file], { encoding: 'utf8', windowsHide: true }); assert.equal(compile.status, 0, compile.stderr);
    const run = spawnSync('java', ['-cp', dir, 'OrbitOracle'], { encoding: 'utf8', windowsHide: true, maxBuffer: 2e6 }); assert.equal(run.status, 0, run.stderr);
    const lines = run.stdout.trim().split(/\r?\n/); assert.equal(lines.length, 3600);
    const f = Math.fround, focus = entity('star', [123.5, -98.25]); let current;
    for (const line of lines) {
      const [mode, sample, tick, x, y, angle, facing] = line.split(',').map(Number);
      if (tick === 0) current = entity('p', [0, 0], { orbit: descriptor({ kind: ['circular', 'point-down', 'spin'][mode],
        radius: f(40.125 + f(sample * 127.75)), periodDays: f(sample % 2 === 0 ? 4.7 : -19.3), angleDegrees: f(f(sample * f(18.7)) - f(10.2)),
        ...(mode === 2 ? { spinDegreesPerDay: -33.25, facingDegrees: 23.125 } : {}) }) });
      current = advanceOriginalOrbit(current, focus, 1 / 60);
      assert.deepEqual(current.position, [f(x), f(y)], `position ${mode}/${sample}/${tick}`);
      assert.equal(current.orbit.angleDegrees, f(angle)); if (mode) assert.equal(current.facingDegrees, f(facing));
    }
  } finally { for (const p of [file, join(dir, 'OrbitOracle.class')]) if (existsSync(p)) unlinkSync(p); rmdirSync(dir); }
});

test('sector-scale writes above the current transaction budget fail atomically, never partially advance or weaken the limit', t => {
  const w = fixture();
  for (let i = 0; i < 513; i++) { const id = 'body-' + i; w.spaceEntities[id] = entity(id, [240, 0], { orbit: descriptor() }); }
  const s = store(t, w), before = s.read(worldId);
  assert.throws(() => step(s, 1), { code: 'PLAN_LIMIT' }); assert.deepEqual(s.read(worldId), before);
});

test('real Worker advances persisted orbital endpoints and returns only actual local jump points to the client', async () => {
  const { CampaignService } = await import('../server/campaign/CampaignService.mjs');
  const service = new CampaignService({ filename: ':memory:' });
  try {
    const ready = await service.ready(); await service.create(fixture());
    await service.execute(system, { worldId, epoch: ready.epoch, requestId: 'orbit-worker-step', type: 'world.advance', payload: { fromTick: 0, ticks: 60 }, expected: [] });
    const world = await service.read(worldId), view = await service.projectPlayer(worldId, 'captain-a');
    assert.equal(world.clock.tick, 60); assert.equal(world.spaceEntities.exit.version, 1);
    assert.notDeepEqual(world.spaceEntities.exit.position, [240, 0]);
    assert.deepEqual(view.points.map(p => p.id), ['exit']); assert.deepEqual(view.points[0].position, world.spaceEntities.exit.position);
    assert.equal(view.spaceEntities, undefined); assert.equal(view.fleets[0].private.cargo.fuel, 20);
  } finally { await service.close(); }
});
