import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  HostCombatComponentEvents, CombatComponentEventReceiver, COMBAT_COMPONENT_EVENT_LIMITS,
  type CombatComponentFrame, type CombatComponentEventBatch,
} from '../src/network/CombatComponentEvents';

const row = (id = 'ship', generation = 1, hullHp = 100, isDead = false, isRetreated = false) =>
  Object.freeze({ id, generation, state: Object.freeze({ hullHp, isDead, isRetreated }) });
function frame(tick: number, ships = [row()], crafts: ReturnType<typeof row>[] = []): CombatComponentFrame {
  return Object.freeze({ componentMode: 1, tick, ships: Object.freeze(ships), crafts: Object.freeze(crafts) });
}
const wire = (batch: CombatComponentEventBatch): unknown => JSON.parse(JSON.stringify(batch));
function setup(options = {}) {
  const host = new HostCombatComponentEvents('match/authority-1', options);
  const receiver = new CombatComponentEventReceiver(options);
  const initial = frame(10);
  host.capture(initial); receiver.anchorSnapshot('match/authority-1', initial);
  return { host, receiver };
}

// This is a sampled notification contract, not an engine/damage or native fixture.
test('captured-frame-only input never touches world, nested components, motion, muzzle or ACKs', () => {
  const forbid = () => { throw Error('unrelated world/component traversal'); };
  const state = { hullHp: 100, isDead: false, isRetreated: false };
  for (const key of ['pos', 'vel', 'armor', 'flux', 'shield', 'weaponControl']) Object.defineProperty(state, key, { get: forbid });
  const first = { componentMode: 1, tick: 1, ships: [{ id: 'ship', generation: 917, state }], crafts: [] };
  for (const key of ['world', 'acknowledged', 'muzzleEvents', 'particleEvents', 'componentDefinitions', 'layouts'])
    Object.defineProperty(first, key, { get: forbid });
  const host = new HostCombatComponentEvents('m');
  assert.deepEqual(host.capture(first).events, []);
  state.hullHp = 31.23456789012345; first.tick = 2;
  const batch = host.capture(first);
  assert.deepEqual(batch.events, [{ kind: 'damage', tick: 2, id: 'ship', generation: 917, hullHp: state.hullHp }]);
  state.hullHp = 999;
  assert.equal(batch.events[0].kind === 'damage' && batch.events[0].hullHp, 31.23456789012345);
  assert.ok(Object.isFrozen(batch) && Object.isFrozen(batch.events) && Object.isFrozen(batch.events[0]));
});

test('damage is an absolute HP update (including repairs), lifecycle is separate, duplicates are inert', () => {
  const { host, receiver } = setup();
  const first = host.capture(frame(11, [row('ship', 1, 75.125)]));
  assert.equal(receiver.receive(wire(first)).status, 'applied');
  assert.equal(receiver.entity('ship')!.hullHp, 75.125);
  assert.equal(receiver.receive(wire(first)).status, 'stale');
  assert.equal(receiver.entity('ship')!.hullHp, 75.125, 'must not subtract HP twice');
  const dead = host.capture(frame(12, [row('ship', 1, 0, true)]));
  const result = receiver.receive(wire(dead));
  assert.deepEqual(result.events.map(e => e.kind), ['damage', 'lifecycle']);
  assert.equal(receiver.entity('ship')!.isDead, true);
  const repair = receiver.receive(host.capture(frame(13, [row('ship', 1, 85, false, true)])));
  assert.deepEqual(repair.events.map(e => e.kind), ['damage', 'lifecycle']);
  assert.deepEqual(receiver.entity('ship'), { id: 'ship', generation: 1, hullHp: 85, isDead: false, isRetreated: true });
  assert.equal(receiver.receive(first).status, 'stale');
});

test('no motion-only or unchanged-state events; capital/craft roster notifications do not infer kills', () => {
  const { host, receiver } = setup();
  assert.deepEqual(host.capture(frame(11)).events, []);
  const spawned = receiver.receive(host.capture(frame(12, [row()], [row('fighter', 83, 30)])));
  assert.deepEqual(spawned.events.map(e => e.kind), ['spawn']);
  assert.equal(receiver.entity('fighter')!.generation, 83);
  const gone = receiver.receive(host.capture(frame(13, [row()])));
  assert.deepEqual(gone.events, [{ kind: 'despawn', tick: 13, id: 'fighter', generation: 83 }]);
  assert.equal(receiver.entity('fighter'), undefined);
  assert.equal(receiver.entity('ship')!.isDead, false);
});

test('same ID with a real new generation is remove + spawn, even when all values match', () => {
  const { host, receiver } = setup();
  const replaced = host.capture(frame(11, [row('ship', 927)]));
  assert.deepEqual(replaced.events.map(e => [e.kind, e.generation]), [['despawn', 1], ['spawn', 927]]);
  assert.equal(receiver.receive(wire(replaced)).status, 'applied');
  assert.equal(receiver.entity('ship')!.generation, 927);
  const staleLifetime = { version: 1, epoch: replaced.epoch, throughTick: 12, coveredAfterTick: 11,
    events: [{ kind: 'damage', tick: 12, id: 'ship', generation: 1, hullHp: 0 }] };
  assert.equal(receiver.receive(staleLifetime).status, 'needs-snapshot');
  assert.equal(receiver.entity('ship')!.hullHp, 100);
  assert.equal(receiver.tick, 11);
  assert.equal(receiver.receive(replaced).status, 'stale');
});

test('captured but unsent windows recover once from a later retained batch, then reordered windows are stale', () => {
  const { host, receiver } = setup();
  const skipped = host.capture(frame(11, [row('ship', 1, 90)]));
  host.capture(frame(12, [row('ship', 1, 80)], [row('fighter', 2)]));
  host.capture(frame(13, [row('ship', 1, 80)]));
  const latest = host.capture(frame(14, [row('ship', 1, 70)]));
  const result = receiver.receive(wire(latest));
  assert.equal(result.status, 'applied');
  assert.deepEqual(result.events.map(e => [e.tick, e.kind]), [[11, 'damage'], [12, 'damage'], [12, 'spawn'], [13, 'despawn'], [14, 'damage']]);
  assert.equal(receiver.entity('ship')!.hullHp, 70);
  assert.equal(receiver.entity('fighter'), undefined);
  assert.equal(receiver.receive(skipped).status, 'stale');
  assert.deepEqual(receiver.receive(latest).events, []);
});

test('expired windows fail closed, full snapshot repairs without replaying history or changing the full frame', () => {
  const { host, receiver } = setup({ retainedTicks: 3 });
  host.capture(frame(11, [row('ship', 1, 70)]));
  const latestFrame = frame(15, [row('ship', 1, 10, true)], [row('fighter', 2)]);
  const before = JSON.stringify(latestFrame), known = receiver.entity('ship');
  const latest = host.capture(latestFrame);
  assert.equal(latest.coveredAfterTick, 12);
  assert.equal(receiver.receive(latest).status, 'needs-snapshot');
  assert.strictEqual(receiver.entity('ship'), known);
  assert.equal(receiver.tick, 10);
  assert.equal(JSON.stringify(latestFrame), before);
  assert.equal(receiver.anchorSnapshot('match/authority-1', latestFrame), true);
  assert.equal(receiver.receive(latest).status, 'stale');
  assert.equal(receiver.entity('ship')!.hullHp, 10);
  assert.equal(receiver.size, 2);
});

test('cold receivers cannot create ships from events; epoch switches require a trusted snapshot', () => {
  const host = new HostCombatComponentEvents('epoch-a');
  host.capture(frame(1));
  const batch = host.capture(frame(2, [row('ship', 1, 50)]));
  const receiver = new CombatComponentEventReceiver();
  assert.equal(receiver.receive(batch).status, 'needs-snapshot');
  assert.equal(receiver.size, 0);
  receiver.anchorSnapshot('epoch-b', frame(1));
  assert.equal(receiver.receive(batch).status, 'epoch-mismatch');
  assert.equal(receiver.entity('ship')!.hullHp, 100);
  host.reset('epoch-b');
  assert.deepEqual(host.capture(frame(0, [row('ship', 1, 17)])).events, []);
  receiver.anchorSnapshot('epoch-b', frame(2, [row('ship', 1, 17)]));
  receiver.clear(); assert.equal(receiver.tick, -1); assert.equal(receiver.size, 0);
  assert.equal(receiver.receive(batch).status, 'needs-snapshot');
});

test('snapshot anchors fence old events, equal-tick snapshots repair and delayed snapshots cannot replay notices', () => {
  const { host, receiver } = setup();
  const packet = host.capture(frame(11, [row('ship', 1, 25)]));
  receiver.receive(packet);
  assert.equal(receiver.anchorSnapshot('match/authority-1', frame(10)), false);
  assert.equal(receiver.entity('ship')!.hullHp, 25);
  assert.equal(receiver.receive(packet).status, 'stale');
  assert.equal(receiver.anchorSnapshot('match/authority-1', frame(11, [row('ship', 1, 20)])), true);
  assert.equal(receiver.entity('ship')!.hullHp, 20);
  receiver.anchorSnapshot('new-authority', frame(0, [row('ship', 1, 100)]));
  assert.equal(receiver.receive(packet).status, 'epoch-mismatch');
});

test('event count overflow drops a whole tick, not half a damage/death transaction', () => {
  const { host, receiver } = setup({ maxEvents: 1 });
  const batch = host.capture(frame(11, [row('ship', 1, 0, true)]));
  assert.equal(batch.coveredAfterTick, 11);
  assert.deepEqual(batch.events, []);
  assert.equal(receiver.receive(batch).status, 'needs-snapshot');
  receiver.anchorSnapshot('match/authority-1', frame(11, [row('ship', 1, 0, true)]));
  assert.equal(receiver.receive(host.capture(frame(12, [row('ship', 1, 10, true)]))).status, 'applied');
  assert.equal(receiver.entity('ship')!.hullHp, 10);
});

test('retention and live-state memory stay bounded over long sessions and churn', () => {
  const host = new HostCombatComponentEvents('bounded', { retainedTicks: 5, maxEvents: 6, maxEntities: 2 });
  const receiver = new CombatComponentEventReceiver({ retainedTicks: 5, maxEvents: 6, maxEntities: 2 });
  for (let tick = 0; tick < 600; tick++) {
    const full = frame(tick, [row('reused', tick + 1, 100 - tick / 1000)]);
    const batch = host.capture(full);
    assert.ok(batch.events.length <= 6);
    assert.ok(batch.throughTick - batch.coveredAfterTick <= 5);
    assert.ok(batch.events.every(e => e.tick > batch.coveredAfterTick));
    if (!tick) receiver.anchorSnapshot('bounded', full);
    else assert.equal(receiver.receive(wire(batch)).status, 'applied');
    assert.equal(receiver.size, 1);
    assert.equal(receiver.entity('reused')!.generation, tick + 1);
  }
});

test('unsupported source frames and invalid options are rejected without advancing host state', () => {
  const host = new HostCombatComponentEvents('m', { maxEntities: 1 });
  host.capture(frame(1));
  const bad = [
    { ...frame(2), componentMode: undefined },
    { ...frame(2), ships: [{ id: 'ship', state: row().state }] },
    frame(2, [row('ship', 0)]), frame(2, [row('ship', 1.5)]),
    frame(2, [row('ship', 1, NaN)]), frame(2, [row('ship', 1, Infinity)]),
    frame(2, [row(), row('second', 2)]), frame(2, [row()], [row()]),
    frame(-1), frame(1), frame(Number.MAX_SAFE_INTEGER + 1),
  ];
  for (const candidate of bad) assert.throws(() => host.capture(candidate));
  assert.equal(host.capture(frame(2, [row('ship', 1, 50)])).events.length, 1);
  for (const options of [{ maxEvents: 0 }, { retainedTicks: 0 }, { maxEntities: 1.5 },
    { maxEvents: COMBAT_COMPONENT_EVENT_LIMITS.maxEvents + 1 }]) {
    assert.throws(() => new HostCombatComponentEvents('m', options));
    assert.throws(() => new CombatComponentEventReceiver(options));
  }
  assert.throws(() => new HostCombatComponentEvents(''));
});

test('malformed windows are atomic and cannot cause partial notification/state commits', () => {
  const { host, receiver } = setup();
  const good = host.capture(frame(11, [row('ship', 1, 50)]));
  const event = good.events[0];
  const bad = [
    null, {}, { ...good, version: 2 }, { ...good, epoch: '' },
    { ...good, throughTick: -1 }, { ...good, throughTick: Infinity },
    { ...good, coveredAfterTick: 12 }, { ...good, throughTick: 999 },
    { ...good, events: [event, event] },
    { ...good, events: [{ ...event, tick: 10 }] },
    { ...good, events: [{ ...event, generation: 0 }] },
    { ...good, events: [{ ...event, id: 'a'.repeat(257) }] },
    { ...good, events: [{ ...event, kind: 'fire' }] },
    { ...good, events: [{ ...event, hullHp: NaN }] },
    { ...good, throughTick: 12, events: [event, { kind: 'lifecycle', tick: 12, id: 'ship', generation: 1, isDead: 1, isRetreated: false }] },
    { ...good, throughTick: 12, events: [{ ...event, tick: 12 }, event] },
  ];
  const original = receiver.entity('ship');
  for (const value of bad) {
    assert.equal(receiver.receive(value).status, 'invalid');
    assert.equal(receiver.tick, 10); assert.strictEqual(receiver.entity('ship'), original);
  }
  const mismatch = { ...good, throughTick: 12, events: [event, { kind: 'despawn', tick: 12, id: 'ship', generation: 2 }] };
  assert.equal(receiver.receive(mismatch).status, 'needs-snapshot');
  assert.equal(receiver.tick, 10); assert.strictEqual(receiver.entity('ship'), original);
  assert.equal(receiver.receive(good).status, 'applied');
});

test('live roster cap, repeated spawn and missing identities request snapshots without mutating canonical data', () => {
  const { receiver } = setup({ maxEntities: 1 });
  const batch = { version: 1, epoch: 'match/authority-1', throughTick: 11, coveredAfterTick: 10,
    events: [{ kind: 'spawn', tick: 11, id: 'other', generation: 2, state: row().state }] };
  assert.equal(receiver.receive(batch).status, 'needs-snapshot');
  assert.equal(receiver.size, 1); assert.equal(receiver.tick, 10);
  assert.equal(receiver.receive({ ...batch, events: [{ ...batch.events[0], id: 'ship' }] }).status, 'needs-snapshot');
  assert.equal(receiver.receive({ ...batch, events: [{ kind: 'despawn', tick: 11, id: 'unknown', generation: 2 }] }).status, 'needs-snapshot');
});

test('module has no runtime dependency on simulation, motion, existing codecs or event sinks', () => {
  const source = readFileSync('src/network/CombatComponentEvents.ts', 'utf8');
  assert.doesNotMatch(source, /^import\s/m);
  assert.doesNotMatch(source, /\b(?:applyDamage|fixedUpdate|Math\.random|setMuzzleEventSink)\s*\(/);
});


test('attached-window API emits once after successful full restore and anchors even when optional events are missing or malformed', () => {
  const host = new HostCombatComponentEvents('m', { retainedTicks: 2 });
  const receiver = new CombatComponentEventReceiver({ retainedTicks: 2 });
  const initial = frame(0);
  assert.deepEqual(receiver.observeSnapshot('m', initial, host.capture(initial)), []);
  const damaged = frame(1, [row('ship', 1, 55)]), window = host.capture(damaged);
  assert.deepEqual(receiver.observeSnapshot('m', damaged, wire(window)).map(e => e.kind), ['damage']);
  assert.deepEqual(receiver.observeSnapshot('m', damaged, window), []);
  assert.equal(receiver.entity('ship')!.hullHp, 55);
  assert.deepEqual(receiver.observeSnapshot('m', frame(2, [row('ship', 1, 40)]), { invalid: true }), []);
  assert.equal(receiver.tick, 2); assert.equal(receiver.entity('ship')!.hullHp, 40);
  const recovered = frame(10, [row('ship', 1, 5)], [row('craft', 4)]);
  assert.deepEqual(receiver.observeSnapshot('m', recovered, host.capture(recovered)), []);
  assert.equal(receiver.tick, 10); assert.equal(receiver.size, 2);
  assert.deepEqual(receiver.observeSnapshot('m', frame(11, [row('ship', 1, 3)])), []);
  assert.equal(receiver.size, 1); assert.equal(receiver.entity('ship')!.hullHp, 3);
});

test('an attached event window from the future or another epoch cannot override a full snapshot', () => {
  const { host, receiver } = setup();
  const future = host.capture(frame(15, [row('ship', 1, 0, true)]));
  const full = frame(11, [row('ship', 1, 95)]);
  assert.deepEqual(receiver.observeSnapshot('match/authority-1', full, future), []);
  assert.equal(receiver.tick, 11); assert.equal(receiver.entity('ship')!.hullHp, 95);
  assert.deepEqual(receiver.observeSnapshot('new', frame(0), future), []);
  assert.equal(receiver.tick, 0); assert.equal(receiver.entity('ship')!.hullHp, 100);
});

test('optional HP sink consumes newer authority damage absolutely once without simulating damage or changing lifecycle', () => {
  const { host, receiver } = setup();
  const target = { hullHp: 100, isDead: false, applyDamage() { throw Error('must never simulate damage'); } };
  const sink = { epoch: 'match/authority-1', fullTick: 10, entities: new Map([['ship', { generation: 1, target }]]) };
  host.capture(frame(11, [row('ship', 1, 30)]));
  const batch = host.capture(frame(12, [row('ship', 1, 65, true)]));
  assert.equal(receiver.receive(wire(batch), sink).appliedHp, 1);
  assert.equal(target.hullHp, 65, 'coalesced absolute HP, not 100-30-65');
  assert.equal(target.isDead, false, 'death flag and roster remain owned by full restore');
  assert.equal(receiver.receive(batch, sink).status, 'stale');
  assert.equal(target.hullHp, 65);
});

test('HP sink never overwrites same/newer full HP or wrong generation/epoch, and never invokes setters', () => {
  for (const mode of ['same-full', 'newer-full', 'generation', 'epoch', 'setter', 'frozen']) {
    const { host, receiver } = setup();
    const target = { hullHp: 99 };
    if (mode === 'setter') Object.defineProperty(target, 'hullHp', { get: () => 99, set: () => { throw Error('damage setter'); } });
    if (mode === 'frozen') Object.freeze(target);
    const sink = { epoch: mode === 'epoch' ? 'other' : 'match/authority-1',
      fullTick: mode === 'same-full' ? 11 : mode === 'newer-full' ? 12 : 10,
      entities: new Map([['ship', { generation: mode === 'generation' ? 9 : 1, target }]]) };
    const batch = host.capture(frame(11, [row('ship', 1, 20)]));
    assert.equal(receiver.receive(batch, sink).appliedHp, 0, mode);
    assert.equal(target.hullHp, 99, mode);
  }
});

test('HP sink cannot write damage from a removed generation into a replacement target', () => {
  const { host, receiver } = setup();
  host.capture(frame(11, [row('ship', 1, 0, true)]));
  const batch = host.capture(frame(12, [row('ship', 2, 100)]));
  const oldTarget = { hullHp: 100 };
  const sink = { epoch: 'match/authority-1', fullTick: 10, entities: new Map([['ship', { generation: 1, target: oldTarget }]]) };
  assert.equal(receiver.receive(batch, sink).appliedHp, 0);
  assert.equal(oldTarget.hullHp, 100);
  assert.equal(receiver.entity('ship')!.generation, 2);
  const second = new CombatComponentEventReceiver();
  second.anchorSnapshot('match/authority-1', frame(10));
  const replacement = { hullHp: 77 };
  assert.equal(second.receive(batch, { ...sink, entities: new Map([['ship', { generation: 2, target: replacement }]]) }).appliedHp, 0);
  assert.equal(replacement.hullHp, 77, 'old-generation damage is not permission to write new-generation spawn HP');
});

