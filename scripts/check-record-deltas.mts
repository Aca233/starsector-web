import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RecordDeltaCapture, RecordDeltaRestore } from '../src/network/RecordDeltas';
import { componentCapsule } from '../src/network/ComponentReplication';
import { hasComponentMutationInstrumentation } from '../src/network/ComponentMutation.mjs';
import { encodeProjectedBinaryFrame, decodeBinaryFrame } from '../src/network/BinarySnapshot.mjs';
import { createLanWorld } from '../src/network/LanWorld';
import { captureCombat, applyCombatSnapshots, componentCaptureDiagnostics } from '../src/network/CombatSnapshot';
import { captureAuthorityCombat, configureHostCosmetics } from '../src/network/HostSnapshot';
import { assets } from './lib/native-projectile-fixture.mts';

type Tuple = [number, any[]];
type Row = { $recordDelta: Tuple };
type Packet = { definitions: unknown; rows: Row[] };
const clone = (wire: any) => structuredClone(wire);
const noDecode = () => { assert.fail('scalar values must not call decode'); };
const json = (value: any): any => JSON.parse(JSON.stringify(value));
function frame(capture: RecordDeltaCapture, inputs: Array<[object, readonly string[], readonly any[]]>): Packet {
  capture.begin();
  const rows = inputs.map(([source, keys, values]) => capture.record(source, keys, values));
  return { definitions: capture.finish(), rows };
}
function restore(packet: Packet, index = 0, target: any = {}, native = false): any {
  // A NEW restore for every packet: definitions are opaque and frame-local.
  return new RecordDeltaRestore(packet.definitions).apply(packet.rows[index].$recordDelta, target, clone, native);
}
function binary(value: any): any {
  const bytes = encodeProjectedBinaryFrame(value, true);
  assert.ok(bytes, 'fixture must use binary, not silently fall back to JSON');
  assert.equal(String.fromCharCode(...bytes.subarray(0, 4)), 'SWF3');
  return decodeBinaryFrame(bytes);
}

test('stable scalars never repeat in dynamic rows; every object remains dynamic', () => {
  const capture = new RecordDeltaCapture(), source = {};
  const keys = ['name', 'active', 'count', 'empty', 'object', 'array'];
  const object = Object.freeze({ n: 1 }), array = Object.freeze([1, 2]);
  const values = ['weapon', true, 17, null, object, array];
  const first = frame(capture, [[source, keys, values]]);
  const second = frame(capture, [[source, keys, values]]);
  assert.deepEqual(first.rows[0].$recordDelta[1], [object, array]);
  assert.deepEqual(second.rows[0].$recordDelta, first.rows[0].$recordDelta);
  assert.deepEqual(restore(second), Object.fromEntries(keys.map((key, i) => [key, values[i]])));
});

test('first scalar change permanently promotes that source field, even after reverting', () => {
  const capture = new RecordDeltaCapture(), source = {}, keys = ['kind', 'count'];
  const first = frame(capture, [[source, keys, ['engine', 1]]]);
  const oldPacket = JSON.stringify(first);
  const changed = frame(capture, [[source, keys, ['engine', 2]]]);
  const reverted = frame(capture, [[source, keys, ['engine', 1]]]);
  const unchanged = frame(capture, [[source, keys, ['engine', 1]]]);
  assert.deepEqual(first.rows[0].$recordDelta[1], []);
  assert.notEqual(changed.rows[0].$recordDelta[0], first.rows[0].$recordDelta[0]);
  assert.deepEqual(changed.rows[0].$recordDelta[1], [2]);
  assert.deepEqual(reverted.rows[0].$recordDelta[1], [1]);
  assert.deepEqual(unchanged.rows, reverted.rows);
  assert.equal(changed.rows[0].$recordDelta[0], reverted.rows[0].$recordDelta[0]);
  assert.equal(JSON.stringify(first), oldPacket, 'promotion must not rewrite older packets');
  assert.deepEqual(restore(first), { kind: 'engine', count: 1 });
});

test('definitions are shareable but promotion history is independent per source', () => {
  const capture = new RecordDeltaCapture(), a = {}, b = {}, keys = ['kind', 'count'];
  const first = frame(capture, [[a, keys, ['engine', 1]], [b, keys, ['engine', 1]]]);
  assert.equal(first.rows[0].$recordDelta[0], first.rows[1].$recordDelta[0]);
  const next = frame(capture, [[a, keys, ['engine', 2]], [b, keys, ['engine', 1]]]);
  assert.notEqual(next.rows[0].$recordDelta[0], next.rows[1].$recordDelta[0]);
  assert.deepEqual(next.rows[1].$recordDelta[1], []);
  assert.deepEqual(restore(next, 0), { kind: 'engine', count: 2 });
  assert.deepEqual(restore(next, 1), { kind: 'engine', count: 1 });
});

test('source key shapes invalidate on reorder, replacement, addition and removal', () => {
  const capture = new RecordDeltaCapture(), source = {}, keys = ['a', 'b'];
  const first = frame(capture, [[source, keys, [1, 2]]]);
  const oldPacket = JSON.stringify(first);
  frame(capture, [[source, keys, [3, 2]]]); // a was dynamic in the old shape.
  keys.reverse(); // Same array identity: a stored reference is not a shape proof.
  const reordered = frame(capture, [[source, keys, [2, 3]]]);
  assert.deepEqual(restore(reordered), { b: 2, a: 3 });
  assert.deepEqual(reordered.rows[0].$recordDelta[1], [], 'new shape starts a fresh scalar plan');
  keys[0] = 'c';
  const replaced = frame(capture, [[source, keys, [4, 3]]]);
  assert.deepEqual(restore(replaced), { c: 4, a: 3 });
  keys.push('d');
  assert.deepEqual(restore(frame(capture, [[source, keys, [4, 3, false]]])), { c: 4, a: 3, d: false });
  keys.splice(1, 2);
  assert.deepEqual(restore(frame(capture, [[source, keys, [4]]])), { c: 4 });
  assert.deepEqual(restore(first), { a: 1, b: 2 });
  assert.equal(JSON.stringify(first), oldPacket);
});

test('only dynamic non-null objects call decode, with the target previous value', () => {
  const capture = new RecordDeltaCapture(), source = {};
  const keys = ['constant', 'promoted', 'object', 'array', 'nil', 'nan', 'infinity', 'absent'];
  frame(capture, [[source, keys, ['ok', 1, {}, [], null, NaN, Infinity, undefined]]]);
  const packet = frame(capture, [[source, keys, ['ok', 2, { n: 7 }, [8], null, NaN, Infinity, undefined]]]);
  const previousObject = { old: 1 }, previousArray = [0];
  const target: any = { object: previousObject, array: previousArray };
  const calls: any[] = [];
  const result = new RecordDeltaRestore(packet.definitions).apply(packet.rows[0].$recordDelta, target, (wire, previous) => {
    calls.push([wire, previous]);
    return clone(wire);
  });
  assert.equal(result, target);
  assert.equal(calls.length, 2);
  assert.equal(calls[0][1], previousObject);
  assert.equal(calls[1][1], previousArray);
  assert.deepEqual(result, { constant: 'ok', promoted: 2, object: { n: 7 }, array: [8], nil: null,
    nan: NaN, infinity: Infinity, absent: undefined });
});

test('each new frame repairs locally overwritten static fields, for generic and native targets', () => {
  for (const native of [false, true]) {
    const capture = new RecordDeltaCapture(), source = {}, keys = ['name', 'active', 'count', 'empty'];
    const expected = { name: 'engine', active: true, count: 10, empty: null };
    const first = frame(capture, [[source, keys, Object.values(expected)]]);
    const target = restore(first, 0, { localOnly: 'retained' }, native);
    Object.assign(target, { name: 'local HUD', active: false, count: -999, empty: 'prediction' });
    const next = frame(capture, [[source, keys, Object.values(expected)]]);
    assert.deepEqual(next.rows[0].$recordDelta[1], []);
    assert.equal(restore(next, 0, target, native), target);
    assert.deepEqual(target, { localOnly: 'retained', ...expected });
  }
});

test('generic writes every field; native skips only equal static assignments', () => {
  const capture = new RecordDeltaCapture(), source = {}, keys = ['fixed', 'moving', 'object'];
  frame(capture, [[source, keys, [7, 1, { n: 1 }]]]);
  const packet = frame(capture, [[source, keys, [7, 2, { n: 2 }]]]);
  for (const native of [false, true]) {
    // A test-only write observer, not a claim that arbitrary Proxies are native-safe.
    const writes: PropertyKey[] = [];
    const target = new Proxy({ fixed: 7, moving: 2, object: { n: 2 } }, {
      set(object, key, value) { writes.push(key); return Reflect.set(object, key, value); },
    });
    const decoder = new RecordDeltaRestore(packet.definitions);
    decoder.apply(packet.rows[0].$recordDelta, target, clone, native);
    assert.deepEqual(writes, native ? ['moving', 'object'] : ['fixed', 'moving', 'object']);
    target.fixed = 99; writes.length = 0;
    decoder.apply(packet.rows[0].$recordDelta, target, clone, native);
    assert.deepEqual(writes, ['fixed', 'moving', 'object']);
    assert.equal(target.fixed, 7);
    for (const invalidTarget of [undefined, null, 0, 'old', []]) {
      assert.deepEqual(decoder.apply(packet.rows[0].$recordDelta, invalidTarget, clone, native),
        { fixed: 7, moving: 2, object: { n: 2 } });
    }
  }
});

test('shared definitions never couple targets or retain a prior target decode result', () => {
  const capture = new RecordDeltaCapture();
  const packet = frame(capture, [[{}, ['name', 'object'], ['engine', { n: 1 }]]]);
  const decoder = new RecordDeltaRestore(packet.definitions);
  const a = decoder.apply(packet.rows[0].$recordDelta, {}, clone);
  const b = decoder.apply(packet.rows[0].$recordDelta, {}, clone);
  assert.notEqual(a, b); assert.notEqual(a.object, b.object);
  a.name = 'local'; a.object.n = 99;
  assert.deepEqual(b, { name: 'engine', object: { n: 1 } });
  assert.equal(decoder.apply(packet.rows[0].$recordDelta, a, clone, true), a);
  assert.deepEqual(a, b);
  assert.deepEqual(packet.rows[0].$recordDelta[1], [{ n: 1 }]);
});

test('SWF3 and JSON frames are independently restorable cold or after a skipped frame', () => {
  for (const transport of [binary, json]) {
    const capture = new RecordDeltaCapture(), source = {}, keys = ['kind', 'value', 'object'];
    const first = frame(capture, [[source, keys, ['engine', 1, { n: 1 }]]]);
    const firstBefore = JSON.stringify(first);
    frame(capture, [[source, keys, ['engine', 2, { n: 2 }]]]); // Intentionally never delivered.
    const latest = frame(capture, [[source, keys, ['engine', 3, { n: 3 }]]]);
    const wire = transport(latest);
    const previousTarget = restore(transport(first));
    assert.deepEqual(restore(wire), { kind: 'engine', value: 3, object: { n: 3 } });
    assert.deepEqual(restore(wire, 0, previousTarget, true), restore(wire));
    const current = new RecordDeltaRestore(wire.definitions);
    assert.throws(() => current.apply(first.rows[0].$recordDelta, {}, clone),
      'begin must not keep an unused earlier definition');
    capture.begin();
    const empty = new RecordDeltaRestore(capture.finish());
    assert.throws(() => empty.apply(latest.rows[0].$recordDelta, {}, clone));
    assert.equal(JSON.stringify(first), firstBefore);
  }
});

test('capture never mutates source descriptors, caller arrays, or previously emitted packets', () => {
  const source = { kind: 'weapon', count: 1, nested: Object.freeze({ n: 1 }) };
  const descriptor = Object.getOwnPropertyDescriptors(source), prototype = Object.getPrototypeOf(source);
  const keys = Object.freeze(['kind', 'count', 'nested']);
  const values = Object.freeze([source.kind, source.count, source.nested]);
  const capture = new RecordDeltaCapture(), first = frame(capture, [[source, keys, values]]);
  const saved = JSON.stringify(first);
  Object.freeze(first.rows[0].$recordDelta[1]); Object.freeze(first.rows[0].$recordDelta); Object.freeze(first.rows[0]);
  frame(capture, [[source, keys, ['weapon', 2, Object.freeze({ n: 2 })]]]);
  restore(first);
  assert.deepEqual(Object.getOwnPropertyDescriptors(source), descriptor);
  assert.equal(Object.getPrototypeOf(source), prototype);
  assert.equal(Object.isExtensible(source), true, 'capture must not freeze the authority');
  assert.deepEqual(keys, ['kind', 'count', 'nested']);
  assert.deepEqual(values, ['weapon', 1, { n: 1 }]);
  assert.equal(JSON.stringify(first), saved);
});

test('bad definition IDs, dangerous keys and invalid scalar/slot definitions are rejected', () => {
  const valid = () => ({ keys: ['fixed', 'object'], fixed: ['ok', null], dynamic: [1] });
  const bad: any[] = [null, [], 1];
  for (const id of ['0', '-1', '01', '1.5', 'NaN', '9007199254740992']) bad.push({ [id]: valid() });
  for (const key of ['__proto__', 'prototype', 'constructor', '', 'x'.repeat(129)]) {
    bad.push({ 1: { keys: [key], fixed: [1], dynamic: [] } });
    assert.throws(() => new RecordDeltaCapture().record({}, [key], [1]));
  }
  for (const value of [NaN, Infinity, -Infinity, {}, [], undefined]) {
    bad.push({ 1: { keys: ['fixed'], fixed: [value], dynamic: [] } });
  }
  for (const definition of [
    { keys: [], fixed: [], dynamic: [] },
    { keys: ['a', 'a'], fixed: [1, 2], dynamic: [] },
    { keys: ['a'], fixed: [], dynamic: [] },
    { ...valid(), extra: 1 },
    { ...valid(), dynamic: [-1] }, { ...valid(), dynamic: [2] },
    { ...valid(), dynamic: [1, 1] }, { ...valid(), dynamic: [1.5] },
    { ...valid(), dynamic: [0] }, // Dynamic positions must carry null placeholders.
    { keys: ['a', 'b'], fixed: [null, null], dynamic: [1, 0] },
  ]) bad.push({ 1: definition });
  for (const definitions of bad) assert.throws(() => new RecordDeltaRestore(definitions));
  // Capsule validation, too. Do not inspect capture.finish()'s private schema layout.
  for (const definitions of [{ 0: valid() }, { 1: { keys: ['constructor'], fixed: [1], dynamic: [] } },
    { 1: { keys: ['n'], fixed: [NaN], dynamic: [] } }]) {
    assert.throws(() => new RecordDeltaRestore(componentCapsule(definitions)));
  }
  for (const definitions of [{ 1: valid() }, componentCapsule({ 1: valid() })]) {
    assert.deepEqual(new RecordDeltaRestore(definitions).apply([1, [{ n: 1 }]], {}, clone),
      { fixed: 'ok', object: { n: 1 } });
  }
  assert.throws(() => new RecordDeltaCapture().record({}, ['a', 'a'], [1, 2]));
  assert.throws(() => new RecordDeltaCapture().record({}, ['a'], []));
  assert.throws(() => new RecordDeltaCapture().record({}, [], []));
});

test('bad tuples reject before assignments/decode; mutable definition tables are revalidated', () => {
  const definitions = { 1: { keys: ['fixed', 'object'], fixed: ['ok', null], dynamic: [1] } };
  const decoder = new RecordDeltaRestore(definitions);
  const invalid: any[] = [null, undefined, {}, [], [1], [1, [], 3], ['1', [{}]], [NaN, [{}]],
    [Infinity, [{}]], [-1, [{}]], [0, [{}]], [2, [{}]], [1.5, [{}]], [1, null], [1, {}], [1, []], [1, [{}, {}]]];
  for (const tuple of invalid) {
    const target = { fixed: 'untouched' };
    assert.throws(() => decoder.apply(tuple, target, noDecode));
    assert.deepEqual(target, { fixed: 'untouched' });
  }
  definitions[1].fixed[0] = NaN as any;
  assert.throws(() => new RecordDeltaRestore(definitions), 'mutable inputs must not bypass fresh validation');
  assert.deepEqual(decoder.apply([1, [{ n: 1 }]], {}, clone), { fixed: 'ok', object: { n: 1 } });
});

// One real two-ship scenario, not a fleet benchmark or campaign test.
test('authority capture -> SWF3/JSON -> apply matches explicit recordDeltas=false after legacy recapture', async () => {
  const originalFetch = globalThis.fetch;
  try {
    await assets();
    const makeWorld = () => {
      const engine = createLanWorld({ id: 'record-deltas-check', seed: 917, hostId: 'p0', snapshotHz: 60,
        players: [{ id: 'p0', seat: 0, team: 0, hull: 'hammerhead' }, { id: 'p1', seat: 1, team: 1, hull: 'hammerhead' }],
        options: { assignment: 'teams', battleSize: 400, aiHulls: [[], []] } } as any).engine;
      configureHostCosmetics(engine, true, true, false);
      return engine;
    };
    const host = makeWorld();
    const receivers = [{ name: 'SWF3/native', roundtrip: binary, native: true, baseline: makeWorld(), candidate: makeWorld() },
      { name: 'JSON/generic', roundtrip: json, native: false, baseline: makeWorld(), candidate: makeWorld() }];
    const ack = (tick: number) => ({ 0: tick, 1: tick });
    const legacy = (engine: typeof host, tick: number) => json(captureCombat(engine, tick, ack(tick), 0,
      true, true, true, false, true, false, false, false, false));
    const authority = (tick: number, enabled: boolean) => captureAuthorityCombat(host, tick, ack(tick), 0,
      null, true, true, false, false, enabled);
    const countRows = (value: any): number => {
      if (!value || typeof value !== 'object') return 0;
      if (Object.hasOwn(value, '$recordDelta')) return 1;
      if (Object.hasOwn(value, '$recordDeltas')) return value.$recordDeltas.length;
      return Object.values(value).reduce<number>((sum, child) => sum + countRows(child), 0);
    };
    const saved: Array<{ packet: any; snapshot: string }> = [];
    let previousTick = 0;
    for (const tick of [0, 1, 3]) {
      while (previousTick < tick) { host.fixedUpdate(1 / 60); previousTick++; }
      const sourceBefore = legacy(host, tick);
      const randomBefore = JSON.stringify([host.random, host.visualRandom]);
      const baseline = authority(tick, false), candidate = authority(tick, true);
      assert.equal((baseline as any).recordDefinitions, undefined, 'baseline must explicitly disable record templates');
      assert.notEqual((candidate as any).recordDefinitions, undefined, 'candidate must actually exercise record templates');
      assert.ok(countRows(candidate) > 0, 'real weapons/engines must contain record-delta rows');
      assert.equal((candidate as any).componentMode, undefined);
      assert.equal(componentCaptureDiagnostics(host), undefined, 'old MutationJournal path must stay disabled');
      assert.equal(hasComponentMutationInstrumentation(), false);
      assert.deepEqual(legacy(host, tick), sourceBefore, 'capture must not change authority state');
      assert.equal(JSON.stringify([host.random, host.visualRandom]), randomBefore);
      for (const old of saved) assert.equal(JSON.stringify(old.packet), old.snapshot, 'later capture mutated an old packet');
      saved.push({ packet: baseline, snapshot: JSON.stringify(baseline) }, { packet: candidate, snapshot: JSON.stringify(candidate) });
      if (tick === 1) continue; // Capture the promotion frame, but skip delivery.
      for (const receiver of receivers) {
        const controlFrame = receiver.roundtrip(baseline), deltaFrame = receiver.roundtrip(candidate);
        const wireBefore = JSON.stringify(deltaFrame);
        const options = { nativeTargeting: receiver.native, nativeProjection: receiver.native };
        applyCombatSnapshots(receiver.baseline, [controlFrame], tick === 0, undefined, options);
        applyCombatSnapshots(receiver.candidate, [deltaFrame], tick === 0, undefined, options);
        assert.deepEqual(legacy(receiver.candidate, tick), legacy(receiver.baseline, tick), `${receiver.name}, tick ${tick}`);
        assert.equal(JSON.stringify(deltaFrame), wireBefore, 'apply must not mutate a received packet');
        if (tick === 3) {
          const cold = makeWorld();
          applyCombatSnapshots(cold, [receiver.roundtrip(candidate)], true, undefined, options);
          const coldControl = makeWorld();
          applyCombatSnapshots(coldControl, [receiver.roundtrip(baseline)], true, undefined, options);
          assert.deepEqual(legacy(cold, tick), legacy(coldControl, tick), `${receiver.name}, cold final frame`);
        }
      }
    }
    for (const old of saved) assert.equal(JSON.stringify(old.packet), old.snapshot);
  } finally {
    globalThis.fetch = originalFetch;
  }
});



test('native plan fast path checks current constants and only packs dynamic fields', () => {
  const capture = new RecordDeltaCapture(), source = {}, keys = Object.freeze(['name', 'count', 'object']);
  const indices = [2, 0, 1], object = { n: 1 };
  frame(capture, [[source, keys, ['weapon', 1, object]]]);
  capture.begin();
  let packed = 0;
  const row = capture.recordNative(source, keys, [1, object, 'weapon'], indices, (value, slot) => {
    assert.equal(slot, 2); packed++; return clone(value);
  });
  assert.ok(row); assert.equal(packed, 1);
  assert.deepEqual(restore({ definitions: capture.finish(), rows: [row] }), { name: 'weapon', count: 1, object });
  assert.equal(capture.recordNative(source, keys, [2, object, 'weapon'], indices, clone), null, 'scalar promotion must use exact slow fallback');
  frame(capture, [[source, keys, ['weapon', 2, object]]]);
  capture.begin();
  const promoted = capture.recordNative(source, keys, [3, object, 'weapon'], indices, clone)!;
  assert.ok(promoted); assert.deepEqual(restore({ definitions: capture.finish(), rows: [promoted] }), { name: 'weapon', count: 3, object });
  assert.equal(capture.recordNative(source, keys, [3, () => 1, 'weapon'], indices, clone), null, 'function transitions must retain native field omission');
  assert.equal(capture.recordNative(source, [...keys], [3, object, 'weapon'], indices, clone), null, 'only the same validated shape is eligible');
});

if (process.argv.includes('--bench')) test('paired full authority capture/codec/apply benchmark', async () => {
  const originalFetch = globalThis.fetch;
  try {
    await assets();
    const makeWorld = () => {
      const engine = createLanWorld({ id: 'record-deltas-bench', seed: 917, hostId: 'p0', snapshotHz: 60,
        players: [{ id: 'p0', seat: 0, team: 0, hull: 'onslaught' }, { id: 'p1', seat: 1, team: 1, hull: 'onslaught' }],
        options: { assignment: 'teams', battleSize: 3200, aiHulls: [Array(15).fill('hammerhead'), Array(15).fill('hammerhead')] } } as any).engine;
      configureHostCosmetics(engine, true, true, false); return engine;
    };
    const host = makeWorld(), baseline = makeWorld(), candidate = makeWorld(), samples: any[] = [];
    for (let tick = 0; tick < 240; tick++) host.fixedUpdate(1 / 60);
    const apply = (engine: typeof host, frame: any) => applyCombatSnapshots(engine, [frame], false, undefined, { nativeTargeting: true, nativeProjection: true });
    for (let tick = 240; tick < 360; tick++) {
      host.fixedUpdate(1 / 60);
      for (const delta of tick % 2 ? [false, true, true, false] : [true, false, false, true]) {
        const start = performance.now();
        const frame = captureAuthorityCombat(host, tick, { 0: tick, 1: tick }, 0, null, true, true, false, false, delta);
        const captured = performance.now(), packet = encodeProjectedBinaryFrame(frame, true), encoded = performance.now();
        assert.ok(packet);
        const decoded = decodeBinaryFrame(packet), parsed = performance.now();
        apply(delta ? candidate : baseline, decoded); const applied = performance.now();
        if (tick >= 280) samples.push({delta, capture: captured-start, encode: encoded-captured, decode: parsed-encoded, apply: applied-parsed, total: applied-start, bytes: packet.byteLength});
      }
    }
    const recapture = (engine: typeof host) => json(captureCombat(engine, 360, {0:360,1:360}, 0, true, true, true, false, true, false, false, false, false));
    assert.deepEqual(recapture(candidate), recapture(baseline));
    const stats = (values: number[]) => { const sorted = values.sort((a,b)=>a-b); return { p50: sorted[Math.floor((sorted.length-1)*.5)], p95: sorted[Math.floor((sorted.length-1)*.95)] }; };
    const arm = (delta: boolean) => Object.fromEntries(['capture','encode','decode','apply','total','bytes'].map(key => [key, stats(samples.filter(s=>s.delta===delta).map(s=>s[key]))]));
    console.log('RECORD_DELTAS_BENCH', JSON.stringify({scope:'Paired ABBA exact authority state, 32 native ships, SWF3 plus one headless replica apply. Not WS/RTT/GPU/FPS.', samplesPerArm: samples.length/2, baseline:arm(false), candidate:arm(true)}));
  } finally { globalThis.fetch = originalFetch; }
});


test('sparse direct definition inputs cannot bypass key/scalar validation', () => {
  const keys = new Array(1), fixed = new Array(1);
  assert.throws(() => new RecordDeltaRestore({ 1: { keys, fixed: [1], dynamic: [] } }));
  assert.throws(() => new RecordDeltaRestore({ 1: { keys: ['a'], fixed, dynamic: [] } }));
});
