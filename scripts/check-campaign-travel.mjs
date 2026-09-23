import {createOriginalFader,fadeOriginalFader,forceOriginalFader,advanceOriginalFader,originalFaderIsIn,originalFaderIsOut} from '../src/campaign/rules/OriginalFader.mjs';
import { originalOrbitsProvider } from '../src/campaign/rules/OriginalOrbits.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, existsSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReferenceRuleset } from '../src/campaign/ReferenceRuleset.mjs';
import { createCampaignWorld, validateCampaignWorld } from '../src/campaign/core/WorldState.mjs';
import { advanceOriginalMovement, createOriginalSmoothMovement, advanceOriginalSmoothMovement, createOriginalSmoothFacing, advanceOriginalSmoothFacing, getOriginalMovementFacing } from '../src/campaign/rules/OriginalMovement.mjs';
import { resolveOriginalTravelStats } from '../src/campaign/rules/OriginalTravel.mjs';
import { resolveOriginalFleetStats } from '../src/campaign/rules/OriginalFleetStats.mjs';
import { CampaignRepository } from '../server/campaign/Repository.mjs';
import { CampaignService } from '../server/campaign/CampaignService.mjs';
import reference from '../src/campaign/data/reference-logistics.json' with { type: 'json' };
const rules = createReferenceRuleset(), system = { kind: 'system', id: 'world-service' };
const emptyCargo = { spaceUsed: 0, capacity: 1, fuel: 0, fuelCapacity: 1, crew: 0, marines: 0, personnelCapacity: 1 };
const near = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const player = id => ({ kind: 'player', id });
function fixture(space = 'normal') {
  const w = structuredClone(createCampaignWorld({ id: 'travel', rules: rules.lock, contentFingerprint: 'travel-fixture' }));
  w.locations.port = { id: 'port', version: 0, name: 'Explicit empty space test location', navigation: { space, terrain: [] } };
  for (const [index, id] of ['a', 'b'].entries()) {
    w.players[id] = { id, version: 0, name: id, factionId: null };
    w.fleets[id] = { id, version: 0, owner: { kind: 'player', id }, control: { kind: 'player', id }, locationId: 'port', position: [index * 1000, 0],
      memberIds: [id], partyId: null, encounterId: null, cargo: { supplies: 20, fuel: 10, crew: 15 } };
    w.members[id] = { id, version: 0, fleetId: id, owner: { kind: 'player', id }, loadout: { hullId: 'wolf' },
      condition: { status: 'ready', hullFraction: 0.5, combatReadiness: 0.5, armor: null, ammunition: {} } };
  }
  return validateCampaignWorld(w);
}
function store(t, w = fixture()) { const s = new CampaignRepository(':memory:', rules); t.after(() => s.close()); s.create(w); return s; }
function command(s, type, payload, refs = []) {
  const w = s.read('travel'); return { worldId: w.id, epoch: s.epoch, requestId: `${type}:${w.revision}`, type, payload,
    expected: refs.map(([collection, id]) => ({ collection, id, version: w[collection][id].version })) };
}
function course(s, id = 'a', destination = [1000, 0], actor = player(id)) {
  return s.execute(actor, command(s, 'fleet.set-course', { fleetId: id, locationId: 'port', destination }, [['fleets', id]]));
}
function step(s, ticks = 60) { return s.execute(system, command(s, 'world.advance', { fromTick: s.read('travel').clock.tick, ticks })); }

// Raw IEEE-754 results from installed 0.98a-RC8 classes, NOT this JS implementation.
// Repro: scripts/lib/NativeFleetMotionProbe.java (-noverify -Djava.awt.headless=true).
const floatBits = values => values.map(value => { const b = new ArrayBuffer(4), d = new DataView(b); d.setFloat32(0, value); return d.getUint32(0); });
test('source movement: acceleration then position integration, continuous braking and smooth overspeed cap', () => {
  const native = {
    "movingTarget": {"sameAccel":false,"bits":[1105594170,3254903141,1123179690,3251997603,1126362686,1111625298],"sameVectors":true},
    "hardAfterClamp": {"sameAccel":false,"bits":[1086078012,0,1111243836,0,1128792063,0],"sameVectors":true},
    "hardAfterSmooth": {"sameAccel":false,"bits":[1093695609,0,1118861433,0,1128792063,0],"sameVectors":true},
    "overspeed": {"sameAccel":false,"bits":[1087606330,0,1137071446,0,1128792063,0],"sameVectors":true},
    "delegate": {"sameAccel":false,"bits":[1102315520,0,1127481344,0,1128792063,0],"sameVectors":true},
    "brake": {"sameAccel":false,"bits":[1073275791,0,1122587989,0,3276275712,0],"sameVectors":true},
    "negativeDt": {"sameAccel":true,"bits":[0,0,1112014848,0,1088421888,1090519040],"sameVectors":true},
    "underflowDt": {"sameAccel":true,"bits":[0,0,1112014848,0,1088421888,1090519040],"sameVectors":true},
    "noAcceleration": {"sameAccel":true,"bits":[0,0,1112014848,0,0,0],"sameVectors":true},
    "arrival600": {"sameAccel":false,"bits":[1148843468,0,1061351156,0,1128792064,0],"sameVectors":true},
    "diagonal": {"sameAccel":false,"bits":[1025566710,1025566710,1075239286,1075239286,1124953054,1124953054],"sameVectors":true},
    "hardBelow": {"sameAccel":false,"bits":[1092616192,0,1120403456,0,1101004800,0],"sameVectors":true},
    "first": {"sameAccel":false,"bits":[1029934650,0,1079334230,0,1128792064,0],"sameVectors":true},
  };
  const zero = [0, 0], far = [1000, 0];
  const cases = [
    ['first', 200, 200, true, zero, zero, far, zero, 1 / 60, -1, null, 1],
    ['brake', 200, 200, true, zero, [120, 0], zero, zero, 1 / 60, -1, null, 1],
    ['overspeed', 200, 200, true, zero, [400, 0], far, zero, 1 / 60, -1, null, 1],
    ['diagonal', 200, 200, true, zero, zero, [1000, 1000], zero, 1 / 60, -1, null, 1],
    ['movingTarget', 170, 260, true, [13, -29], [100, -33], [300, 25], [80, 40], .13, -1, null, 1],
    ['hardBelow', 20, 1000, true, zero, [10, 0], far, zero, .1, 100, null, 1],
    ['hardAfterSmooth', 200, 200, true, zero, [400, 0], far, zero, .125, 100, null, 1],
    ['hardAfterClamp', 200, 200, false, zero, [400, 0], far, zero, .125, 100, null, 1],
    ['delegate', 200, 7, true, zero, [185, 0], far, zero, .125, -1, { travelSpeed: 180 }, 1],
    ['negativeDt', 200, 200, true, zero, [50, 0], far, zero, -.1, -1, null, 1],
    ['underflowDt', 200, 200, true, zero, [50, 0], far, zero, 2 ** -80, -1, null, 1],
    ['noAcceleration', 0, 200, true, zero, [50, 0], far, zero, .1, -1, null, 1],
    ['arrival600', 200, 200, true, zero, zero, far, zero, 1 / 60, -1, null, 600],
  ];
  for (const [name, acceleration, maxSpeed, smooth, position, velocity, destination, targetVelocity, seconds, hard, delegate, steps] of cases) {
    const state = smooth ? createOriginalSmoothMovement(acceleration, maxSpeed, delegate) : createOriginalSmoothMovement(acceleration, maxSpeed);
    assert.equal(state.smoothCap, smooth); assert.equal(state.delegate, delegate);
    state.position.splice(0, 2, ...position); state.velocity.splice(0, 2, ...velocity); state.accel.splice(0, 2, 7, 8); state.hardSpeedLimit = hard;
    const pos = state.position, vel = state.velocity, accel = state.accel;
    let delegateCalls = 0;
    for (let i = 0; i < steps; i++) assert.equal(advanceOriginalSmoothMovement(state, destination, targetVelocity, seconds, {
      travelSpeedOf: d => { assert.equal(d, delegate); delegateCalls++; return d.travelSpeed; },
    }), state);
    assert.deepEqual(floatBits([...state.position, ...state.velocity, ...state.accel]), native[name].bits, name);
    assert.equal(state.position, pos); assert.equal(state.velocity, vel); assert.equal(state.accel === accel, native[name].sameAccel, name);
    assert.equal(delegateCalls, delegate === null ? 0 : steps);
    if (['first', 'brake', 'overspeed', 'diagonal'].includes(name)) {
      const actual = advanceOriginalMovement({ position, velocity, destination, acceleration, maxSpeed, seconds });
      assert.deepEqual(floatBits([...actual.position, ...actual.velocity]), native[name].bits.slice(0, 4), 'actual travel wrapper: ' + name);
    }
  }
  // Independent source arithmetic: steering=-1 => accel=64, pre-cap speed=408.
  // Null fleet decelerates by 248, actual fleet speed 300 raises that floor to 364.
  for (const [services, expected] of [[{}, 377], [{ fleetTravelSpeed: () => 300 }, 362.5]]) {
    const state = createOriginalSmoothMovement(80, 160, null); state.velocity[0] = 400;
    advanceOriginalSmoothMovement(state, [767, 0], zero, .125, services);
    assert.equal(state.accel[0], 64); assert.equal(state.velocity[0], expected); assert.equal(state.position[0], expected * .125);
  }
  const delegate = {}, stopped = createOriginalSmoothMovement(0, 2, delegate); let reads = 0;
  const services = { travelSpeedOf: d => { assert.equal(d, delegate); reads++; return 20; } };
  advanceOriginalSmoothMovement(stopped, far, zero, 0, services); assert.equal(reads, 0);
  advanceOriginalSmoothMovement(stopped, far, zero, .1, services); assert.equal(reads, 1, 'delegate is read even with zero acceleration');
  assert.throws(() => advanceOriginalSmoothMovement(stopped, far, zero, .1), { code: 'INVALID_TRAVEL' });
});

test('source movement handles zero dt/acceleration and converges without invented arrival snapping', () => {
  const base = { position: [0, 0], velocity: [0, 0], destination: [1000, 0], acceleration: 200, maxSpeed: 200, seconds: 1 / 60 };
  assert.deepEqual(advanceOriginalMovement({ ...base, seconds: 0 }), { position: [0, 0], velocity: [0, 0] });
  assert.deepEqual(advanceOriginalMovement({ ...base, acceleration: 0, velocity: [50, 0] }), { position: [0, 0], velocity: [50, 0] });
  let state = base; for (let i = 0; i < 600; i++) state = { ...state, ...advanceOriginalMovement(state) };
  assert.ok(Math.abs(state.position[0] - 1000) < 1 && Math.abs(state.velocity[0]) < 2);
  assert.notEqual(state.position[0], 1000);
  assert.throws(() => advanceOriginalMovement({ ...base, destination: [Infinity, 0] }));
  // Installed com.fs.graphics.util.Fader results, captured by NativeFleetMotionProbe fader.
  const fades=[],captureFade=s=>fades.push({bits:floatBits([s.currBrightness,s.durationIn,s.durationOut]),state:s.state,in:originalFaderIsIn(s),out:originalFaderIsOut(s)});
  let fade=createOriginalFader(0,.25,.5,true,true);captureFade(fade);fadeOriginalFader(fade,'IN');captureFade(fade);
  for(const dt of [.25,5,.25,.25,9,0]){advanceOriginalFader(fade,dt);captureFade(fade);}
  forceOriginalFader(fade,'IN');captureFade(fade);forceOriginalFader(fade,'OUT');captureFade(fade);
  fade.durationIn=0;fadeOriginalFader(fade,'IN');captureFade(fade);fade.durationOut=0;fadeOriginalFader(fade,'OUT');captureFade(fade);
  fade=createOriginalFader(0,.25);fadeOriginalFader(fade,'IN');advanceOriginalFader(fade,.25);captureFade(fade);advanceOriginalFader(fade,.25);captureFade(fade);
  fade=createOriginalFader(.5,.25);fadeOriginalFader(fade,'IN');advanceOriginalFader(fade,-1);captureFade(fade);
  assert.deepEqual(fades,[{"in":false,"bits":[0,1048576000,1056964608],"state":"IDLE","out":true},{"in":false,"bits":[0,1048576000,1056964608],"state":"IN","out":false},{"in":false,"bits":[1065353216,1048576000,1056964608],"state":"IN","out":false},{"in":false,"bits":[1065353216,1048576000,1056964608],"state":"OUT","out":false},{"in":false,"bits":[1056964608,1048576000,1056964608],"state":"OUT","out":false},{"in":false,"bits":[0,1048576000,1056964608],"state":"OUT","out":true},{"in":false,"bits":[0,1048576000,1056964608],"state":"IN","out":false},{"in":false,"bits":[0,1048576000,1056964608],"state":"IN","out":false},{"in":false,"bits":[1065353216,1048576000,1056964608],"state":"OUT","out":false},{"in":false,"bits":[0,1048576000,1056964608],"state":"IN","out":false},{"in":false,"bits":[1065353216,0,1056964608],"state":"OUT","out":false},{"in":false,"bits":[0,0,0],"state":"IN","out":false},{"in":false,"bits":[1065353216,1048576000,1048576000],"state":"IN","out":false},{"in":true,"bits":[1065353216,1048576000,1048576000],"state":"IDLE","out":false},{"in":false,"bits":[3227516928,1048576000,1048576000],"state":"IN","out":false}]);
  const facingCases = [
    ['initial', 150, 100, 90, 0, 180, 1 / 60, 1],
    ['negativeTurn', 1040, 720, 90, 0, 0, 1 / 60, 1],
    ['positiveSnap', 10, 100, 0, 20, 1, .1, 1],
    ['negativeNoSnap', 10, 100, 0, -20, 359, .1, 1],
    ['wrap', 1040, 720, 359, 0, 1, 1 / 60, 1],
    ['negativeDt', 1040, 720, 90, 10, 180, -.1, 1],
    ['zeroDt', 1040, 720, 450, 900, 180, 0, 1],
    ['zeroAcceleration', 0, 100, 90, 5, 180, .1, 1],
    ['arrival120', 1040, 720, 90, 0, 180, 1 / 60, 120],
  ];
  const nativeFacing = {"arrival120":{"bits":[1127481344,1120927744]},"negativeTurn":{"bits":[1119054872,3247090347]},"negativeDt":{"bits":[1120324812,3267100672]},"initial":{"bits":[1119098196,1075838977]},"negativeNoSnap":{"bits":[1135807693,3247964160]},"positiveSnap":{"bits":[1065353216,1100480512]},"zeroDt":{"bits":[1119092736,1144258560]},"zeroAcceleration":{"bits":[1119158272,1084227584]},"wrap":{"bits":[1135846650,1099606699]}};
  for (const [name, a, max, facing, rate, target, dt, count] of facingCases) {
    const state = createOriginalSmoothFacing(a, max); assert.equal(state.facing, 0); assert.equal(state.turnRate, 0);
    state.facing = facing; state.turnRate = rate;
    for (let i = 0; i < count; i++) assert.equal(advanceOriginalSmoothFacing(state, target, dt), state);
    assert.deepEqual(floatBits([state.facing, state.turnRate]), nativeFacing[name].bits, 'native facing: ' + name);
  }
  const angles = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [1, 2], [-3, 4], [-3, -4], [3, -4], [1e-40, 1e-40], [123.456, .125]];
  assert.deepEqual(floatBits(angles.map(getOriginalMovementFacing)), [0,0,1119092737,1127481345,3266576385,1110704129,1115542614,1123924175,3271407823,3260321384,0,1030055991], 'native 1024x1024 lookup, not direct atan2');
});

test('source fleet speed uses slowest member including mothballed ships, round/cap, zero-burn and empty-fleet branches', () => {
  const f = { control: player('a'), memberIds: ['one', 'two'] };
  assert.deepEqual(resolveOriginalTravelStats(f, [{ id: 'one', maxBurn: 10 }, { id: 'two', maxBurn: 8, mothballed: true }], emptyCargo),
    { minBurn: 8, burnLevel: 8, maxSpeed: 160, acceleration: 160 });
  near(resolveOriginalTravelStats({ control: player('a'), memberIds: ['one'] }, [{ id: 'one', maxBurn: 0 }], emptyCargo).maxSpeed, reference.navigation.minTravelSpeed);
  near(resolveOriginalTravelStats({ control: player('a'), memberIds: ['one'] }, [{ id: 'one', maxBurn: 25 }], emptyCargo).maxSpeed, 400);
  near(resolveOriginalTravelStats({ control: player('a'), memberIds: ['one'] }, [{ id: 'one', maxBurn: 8.6 }], emptyCargo).maxSpeed, 180);
  near(resolveOriginalTravelStats({ control: player('a'), memberIds: [] }, [], emptyCargo).maxSpeed, 200);
});

test('known militarization adds one burn and missing crew does not invent a burn penalty', () => {
  const w = structuredClone(fixture()), f = w.fleets.a; f.cargo.crew = 0;
  w.members.a.loadout.hullMods = ['militarized_subsystems']; w.members.a.logistics = { mothballed: false, suspendRepairs: false };
  const stats = resolveOriginalFleetStats(f, [w.members.a], { world: w });
  near(stats.members[0].maxBurn, reference.hulls.wolf.maxBurn + 1);
  near(resolveOriginalTravelStats(f, stats.members, stats.cargo).maxSpeed, (reference.hulls.wolf.maxBurn + 1) * reference.navigation.speedPerBurnLevel);
});

test('course is intent only; world clock atomically changes position, velocity, upkeep and condition', t => {
  const s = store(t), before = s.read('travel'); course(s);
  assert.deepEqual(s.read('travel').fleets.a.position, [0, 0]); assert.equal(s.read('travel').clock.tick, 0);
  step(s, 60); const after = s.read('travel');
  // NativeFleetMotionProbe travel60; do not compare float integration to the old double formula.
  assert.deepEqual(floatBits([...after.fleets.a.position, ...after.fleets.a.navigation.velocity]), [1120621910,0,1128792059,0]);
  assert.ok(after.fleets.a.cargo.supplies < before.fleets.a.cargo.supplies); assert.ok(after.members.a.condition.hullFraction > 0.5);
  assert.deepEqual(after.fleets.b.position, before.fleets.b.position); assert.ok(after.members.b.condition.hullFraction > 0.5);
  assert.equal(after.fleets.a.cargo.fuel, before.fleets.a.cargo.fuel, 'normal-space default does not consume fuel');
});

test('hyperspace fuel bills prior velocity, not next velocity or cursor distance, and rejects user-supplied costs', t => {
  const s = store(t, fixture('hyperspace')); course(s); step(s, 1);
  assert.equal(s.read('travel').fleets.a.cargo.fuel, 10); step(s, 1);
  const f = s.read('travel').fleets.a;
  near(10 - f.cargo.fuel, reference.hulls.wolf.fuelPerLightYear * (Math.fround(200 * Math.fround(1 / 60))) / 60 / reference.navigation.unitsPerLightYear);
  const forged = command(s, 'fleet.set-course', { fleetId: 'a', locationId: 'port', destination: [1000, 0], speed: 100000, fuelCost: 0 }, [['fleets', 'a']]);
  assert.throws(() => s.execute(player('a'), forged), { code: 'INVALID_COMMAND' });
});

test('stop retains velocity and physically brakes in subsequent ticks rather than stopping instantly', t => {
  const s = store(t); course(s); step(s, 60); const moving = s.read('travel').fleets.a;
  s.execute(player('a'), command(s, 'fleet.stop', { fleetId: 'a', locationId: 'port' }, [['fleets', 'a']]));
  assert.deepEqual(s.read('travel').fleets.a.navigation.velocity, moving.navigation.velocity); step(s, 1);
  const braking = s.read('travel').fleets.a;
  assert.ok(braking.position[0] > moving.position[0]); assert.ok(braking.navigation.velocity[0] < moving.navigation.velocity[0]);
});

test('position, velocity, fuel, upkeep and CR are invariant across tick batches', t => {
  const a = store(t, fixture('hyperspace')), b = store(t, fixture('hyperspace')); course(a); course(b);
  step(a, 600); for (const ticks of [17, 43, 121, 219, 200]) step(b, ticks);
  const left = a.read('travel'), right = b.read('travel'); assert.deepEqual(left.clock, right.clock);
  for (const id of ['a', 'b']) {
    for (const key of ['position', 'navigation', 'cargo', 'owner', 'control']) assert.deepEqual(left.fleets[id][key], right.fleets[id][key]);
    assert.deepEqual(left.members[id].condition, right.members[id].condition);
  }
});

test('course retries are idempotent; stale fleet versions and cross-location courses cannot teleport', t => {
  const s = store(t), c = command(s, 'fleet.set-course', { fleetId: 'a', locationId: 'port', destination: [1000, 0] }, [['fleets', 'a']]);
  const receipt = s.execute(player('a'), c); step(s); assert.deepEqual(s.execute(player('a'), c), receipt);
  assert.throws(() => s.execute(player('a'), { ...c, requestId: 'stale-new' }), { code: 'VERSION_CONFLICT' });
  const invalid = command(s, 'fleet.set-course', { fleetId: 'a', locationId: 'elsewhere', destination: [0, 0] }, [['fleets', 'a']]);
  assert.throws(() => s.execute(player('a'), invalid), { code: 'LOCATION_CONFLICT' });
});

test('explicit controller differs from owner and consistently governs navigation, repair and party commands', t => {
  const w = structuredClone(fixture()); w.fleets.a.control = { kind: 'player', id: 'b' }; const s = store(t, w);
  assert.throws(() => course(s, 'a'), { code: 'FORBIDDEN' }); course(s, 'a', [1000, 0], player('b'));
  const repair = command(s, 'logistics.set-repairs', { memberId: 'a', suspended: true }, [['fleets', 'a'], ['members', 'a']]);
  assert.throws(() => s.execute(player('a'), repair), { code: 'FORBIDDEN' }); s.execute(player('b'), repair);
  const invitation = command(s, 'party.invite', { fromFleetId: 'a', toFleetId: 'b' }, [['fleets', 'a']]);
  assert.throws(() => s.execute(player('a'), invitation), { code: 'FORBIDDEN' }); s.execute(player('b'), invitation);
  assert.deepEqual(s.read('travel').fleets.a.owner, { kind: 'player', id: 'a' }); assert.deepEqual(s.read('travel').members.a.owner, { kind: 'player', id: 'a' });
});

test('faction title does not activate NPC economics, while explicit NPC control uses native AI supply/crew behavior', t => {
  const w = structuredClone(fixture()); w.factions.guild = { id: 'guild', version: 0, name: 'Guild', playerRoles: { a: 'leader' } };
  w.fleets.a.owner = { kind: 'faction', id: 'guild' }; w.fleets.a.control = { kind: 'faction', id: 'guild' };
  w.fleets.b.control = { kind: 'npc' }; w.fleets.b.cargo = { supplies: 0, crew: 0, fuel: 0 };
  const s = store(t, w); assert.throws(() => course(s, 'a', [1000, 0], player('b')), { code: 'FORBIDDEN' }); course(s);
  assert.throws(() => course(s, 'b'), { code: 'FORBIDDEN' }); course(s, 'b', [2000, 0], system); step(s, 60);
  const after = s.read('travel'); assert.ok(after.fleets.a.cargo.supplies < 20);
  assert.deepEqual(after.fleets.b.cargo, w.fleets.b.cargo); assert.ok(after.members.b.condition.combatReadiness > 0.5);
  assert.ok(after.fleets.b.position[0] > 1000);
});

test('required controller and navigation data reject ambiguous or malformed worlds', () => {
  for (const mutate of [w => { delete w.fleets.a.control; }, w => { w.fleets.a.control = { kind: 'player', id: 'missing' }; },
    w => { w.fleets.a.navigation = { velocity: [1, 0], destination: null }; },
    w => { w.fleets.a.navigation = { velocity: [0, 0], destination: [NaN, 0] }; },
    w => { w.locations.port.navigation.space = 'unknown'; }]) {
    const w = structuredClone(fixture()); mutate(w); assert.throws(() => validateCampaignWorld(w));
  }
});

test('missing terrain support or empty-fuel hyperspace is explicit, never silently treated as free open-space flight', t => {
  for (const mutate of [w => { w.locations.port.navigation.terrain = ['nebula']; }, w => { delete w.locations.port.navigation; }]) {
    const w = structuredClone(fixture()); mutate(w); const s = store(t, w), before = s.read('travel');
    assert.throws(() => course(s), { code: 'UNSUPPORTED_TRAVEL' }); assert.throws(() => step(s), { code: 'UNSUPPORTED_TRAVEL' });
    assert.deepEqual(s.read('travel'), before);
  }
  const w = structuredClone(fixture('hyperspace')); w.fleets.a.cargo.fuel = 0; const s = store(t, w);
  course(s); // An intent may be queued; missing drift topology must reject time advancement atomically.
  const before = s.read('travel'); assert.throws(() => step(s), { code: 'UNSUPPORTED_FUEL_DRIFT' }); assert.deepEqual(s.read('travel'), before);
});

test('unsupported later fleet and real SQLite receipt failure roll back movement with clock and resource changes', t => {
  const w = structuredClone(fixture()); w.members.b.loadout.hullMods = ['unported']; const bad = store(t, w); course(bad);
  const before = bad.read('travel'); assert.throws(() => step(bad), { code: 'UNSUPPORTED_LOGISTICS' }); assert.deepEqual(bad.read('travel'), before);
  const directory = mkdtempSync(join(tmpdir(), 'starsector-travel-')), filename = join(directory, 'world.sqlite'); let s, db;
  try {
    s = new CampaignRepository(filename, rules); s.create(fixture()); course(s); db = new DatabaseSync(filename);
    db.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT,'travel-rollback'); END;");
    const prior = s.read('travel'); assert.throws(() => step(s), /travel-rollback/); assert.deepEqual(s.read('travel'), prior);
  } finally {
    db?.close(); s?.close();
    for (const suffix of ['', '-wal', '-shm']) if (existsSync(filename + suffix)) unlinkSync(filename + suffix); rmdirSync(directory);
  }
});

test('independent fleets can actually rendezvous, join, separate and navigate without merging assets', t => {
  const s = store(t); course(s); step(s, 600);
  const invitation = s.execute(player('a'), command(s, 'party.invite', { fromFleetId: 'a', toFleetId: 'b' }, [['fleets', 'a']])).result.invitationId;
  const party = s.execute(player('b'), command(s, 'party.accept', { invitationId: invitation }, [['invitations', invitation], ['fleets', 'a'], ['fleets', 'b']])).result.partyId;
  assert.deepEqual(s.read('travel').parties[party].fleetIds, ['a', 'b']);
  s.execute(player('b'), command(s, 'party.leave', { fleetId: 'b' }, [['fleets', 'b'], ['parties', party]])); course(s, 'b', [1500, 500]); step(s);
  const w = s.read('travel'); assert.equal(w.fleets.a.partyId, null); assert.equal(w.fleets.b.partyId, null);
  assert.ok(w.fleets.b.position[1] > 0); assert.deepEqual(w.fleets.a.owner, player('a')); assert.deepEqual(w.fleets.b.owner, player('b'));
});

test('encounter locks freeze velocity and position and reject course changes without touching independent travel', t => {
  const s = store(t); course(s); step(s, 30);
  // Bring the other fleet to rendezvous through navigation rather than modifying authoritative rows.
  course(s, 'b', [100, 0]); step(s, 300);
  const refs = [['fleets', 'a'], ['fleets', 'b'], ['members', 'a'], ['members', 'b']];
  const id = s.execute(system, command(s, 'encounter.prepare', { sides: [{ id: 'one', fleetIds: ['a'] }, { id: 'two', fleetIds: ['b'] }],
    hostPlayerId: 'a', seed: 3 }, refs)).result.encounterId;
  const before = s.read('travel'); assert.throws(() => course(s), { code: 'ASSET_LOCKED' }); step(s, 60);
  assert.deepEqual(s.read('travel').fleets.a, before.fleets.a); assert.deepEqual(s.read('travel').fleets.b, before.fleets.b);
  s.execute(system, command(s, 'encounter.cancel-preparation', { encounterId: id, battleAttempt: 1 }, [['encounters', id], ['extensions', `cooperative.encounters:${id}`]]));
  step(s, 1); assert.notDeepEqual(s.read('travel').fleets.a.position, before.fleets.a.position);
});

test('real Worker accepts course intents and persists authoritative motion, not only a pure movement demo', async () => {
  const service = new CampaignService({ filename: ':memory:' });
  try {
    const ready = await service.ready(); await service.create(fixture('hyperspace'));
    await service.execute(player('a'), { worldId: 'travel', epoch: ready.epoch, requestId: 'worker-course', type: 'fleet.set-course',
      payload: { fleetId: 'a', locationId: 'port', destination: [1000, 0] }, expected: [{ collection: 'fleets', id: 'a', version: 0 }] });
    await service.execute(system, { worldId: 'travel', epoch: ready.epoch, requestId: 'worker-travel', type: 'world.advance', payload: { fromTick: 0, ticks: 60 }, expected: [] });
    const w = await service.read('travel'); near(w.fleets.a.position[0], 101.66666666666669); assert.ok(w.fleets.a.cargo.fuel < 10);
  } finally { await service.close(); }
});

// Separate proof that the native travel algorithm is replaceable, not embedded in the scheduler.
test('an alternative travel provider uses the same world transaction without changing Kernel or Repository', async t => {
  const { CampaignRuleRegistry } = await import('../src/campaign/core/RuleRegistry.mjs');
  const { originalFleetStatsProvider } = await import('../src/campaign/rules/OriginalFleetStats.mjs');
  const { originalLogisticsProvider } = await import('../src/campaign/rules/OriginalLogistics.mjs');
  const { encounterLifecycleProvider } = await import('../src/campaign/rules/EncounterLifecycle.mjs');
  const { cooperativeSimulationProvider } = await import('../src/campaign/rules/CooperativeSimulation.mjs');
  const travel = { id: 'test.travel', service: 'travel', apiVersion: 1, version: '1', capabilities: ['authoritative-motion', 'post-movement-events'], methods: {
    describe: (world, fleet) => ({ nextPosition: [world.clock.tick + 1, fleet.position[1]], motion: { inHyperspace: false, speed: 0,
      hyperFuelMultiplier: 1, normalFuelMultiplier: 0, hiddenFuelMultiplier: 1 } }),
    advance: (fleet, description) => ({ fleet: { ...fleet, position: description.nextPosition }, events: [] }),
  } };
  const providers = [originalOrbitsProvider, travel, originalFleetStatsProvider, originalLogisticsProvider, encounterLifecycleProvider, cooperativeSimulationProvider];
  const registry = new CampaignRuleRegistry(); providers.forEach(p => registry.register(p));
  const custom = registry.compile({ id: 'test.travel-overhaul', version: '1', providers: Object.fromEntries(providers.map(p => [p.service, p.id])), settings: rules.lock.settings });
  const w = structuredClone(fixture()); w.rules = custom.lock;
  const s = new CampaignRepository(':memory:', custom); t.after(() => s.close()); s.create(w); step(s, 60);
  assert.deepEqual(s.read('travel').fleets.a.position, [60, 0]); assert.equal(s.read('travel').clock.tick, 60);
  assert.ok(s.read('travel').fleets.a.cargo.supplies < 20);
});

test('battle compute host eligibility follows explicit control, not asset ownership', t => {
  const w = structuredClone(fixture()); w.fleets.a.control = { kind: 'player', id: 'b' }; const s = store(t, w);
  const refs = [['fleets', 'a'], ['fleets', 'b'], ['members', 'a'], ['members', 'b']];
  const payload = { sides: [{ id: 'one', fleetIds: ['a'] }, { id: 'two', fleetIds: ['b'] }], hostPlayerId: 'a', seed: 3 };
  assert.throws(() => s.execute(system, command(s, 'encounter.prepare', payload, refs)), { code: 'FORBIDDEN' });
  s.execute(system, command(s, 'encounter.prepare', { ...payload, hostPlayerId: 'b' }, refs));
  assert.deepEqual(s.read('travel').fleets.a.owner, { kind: 'player', id: 'a' });
});

test('native overload chooses the largest ratio, forces a visible burn reduction and doubles excess ship-count pressure', () => {
  const fleet = { control: player('a'), memberIds: ['one'] }, members = [{ id: 'one', maxBurn: 10 }];
  const cargo = { ...emptyCargo, capacity: 100, spaceUsed: 101 };
  assert.equal(resolveOriginalTravelStats(fleet, members, cargo).burnLevel, 9, '9.9 cannot round away the overload penalty');
  assert.equal(resolveOriginalTravelStats(fleet, members, { ...cargo, spaceUsed: 150 }).burnLevel, 5);
  assert.equal(resolveOriginalTravelStats(fleet, members, { ...cargo, spaceUsed: 200 }).maxSpeed, reference.navigation.minTravelSpeed);
  assert.equal(resolveOriginalTravelStats(fleet, members, { ...cargo, fuel: 125, fuelCapacity: 100, crew: 150, personnelCapacity: 100 }).burnLevel, 5);
  const large = { control: player('a'), memberIds: Array.from({ length: 31 }, (_, i) => 'ship' + i) };
  const ships = large.memberIds.map(id => ({ id, maxBurn: 10 }));
  assert.equal(resolveOriginalTravelStats(large, ships, emptyCargo).burnLevel, 9);
  assert.equal(resolveOriginalTravelStats({ ...fleet, control: { kind: 'npc' } }, members, { ...cargo, spaceUsed: 1000 }).burnLevel, 10);
});

test('overload speed and capacity changes are used by authoritative movement, not just a quote', t => {
  const w = structuredClone(fixture()); w.fleets.a.cargo.supplies = reference.hulls.wolf.cargoCapacity * 1.5;
  w.members.a.logistics = { mothballed: false, suspendRepairs: true }; const s = store(t, w); course(s); step(s, 1);
  near(s.read('travel').fleets.a.navigation.velocity[0], 100 / 60);
  near(s.read('travel').fleets.a.position[0], 100 / 3600);
});
