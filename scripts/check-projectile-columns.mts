import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs'; import path from 'node:path';
import { compactProjectileColumns, projectileColumnPlan, MAX_PROJECTILE_SHARED_NODES } from '../src/network/ProjectileColumns';
import { createLanWorld } from '../src/network/LanWorld';
import { assetManager } from '../src/engine/assets/AssetResolver';
import { captureHostCombat, configureHostCosmetics } from '../src/network/HostSnapshot';
import { captureCombat, applyCombatSnapshots, applyCombatSnapshot } from '../src/network/CombatSnapshot';
import { Vector2 } from '../src/engine/math/Vector2';
import { Ship } from '../src/engine/simulation/Ship';
import { encodeProjectedBinaryFrame, encodeBinaryState, decodeBinaryState } from '../src/network/BinarySnapshot.mjs';
import { LanDeltaSender, lanDeltaTarget } from '../server/LanDeltaTransport.mjs';
import { LanDeltaReceiver } from '../src/network/LanBinaryDelta.mjs';
import { SteamSnapshotEncoder, SteamSnapshotSender, SteamSnapshotReceiver } from '../server/steam/snapshot-delta.mjs';
import { SteamPacketCodec } from '../server/steam/packet-codec.mjs';

const publicRoot = path.resolve('public');
globalThis.fetch = async (input: any) => { const p = path.resolve(publicRoot, String(input).replace(/^\//, '')); if (!p.startsWith(publicRoot + path.sep)) throw Error('Outside assets'); return new Response(fs.readFileSync(p)); };
await assetManager.ensureManifestLoaded();
const match: any = { id: 'columns-test', seed: 1511506142, hostId: 'p0', snapshotHz: 60,
  players: [{ id: 'p0', seat: 0, team: 0, hull: 'hammerhead', design: null }, { id: 'p1', seat: 1, team: 1, hull: 'hammerhead', design: null }],
  options: { aiHulls: [[], []], assignment: 'teams', battleSize: 3200, initialDeploymentLimit: null } };
const make = () => createLanWorld(match).engine;
const bullets = (n = 24) => Array.from({ length: n }, (_, i) => ({ id: i + 1, specId: i % 2 ? 'harpoon' : 'heavyblaster', sourceShipId: 'p0', slotId: 'a',
  pos: new Vector2(i, -i), prevPos: new Vector2(), vel: new Vector2(0, 10), ballisticTail: new Vector2(i - 10, -i),
  fadeProgress: .2, damage: 10, damageType: 'ENERGY', rangeRemaining: 300 - i, totalRange: 400, elapsedTime: 2,
  color: [1, 2, 3], isRocket: true, radius: 5, targetShipId: undefined, maxTurnRate: 3, maxFlightTime: 10, flightTimeRemaining: 8,
  missileTrailSpec: { duration: 1, width: 4, color: [1, 2, 3, 4] }, custom: { nested: [5, 6], missing: undefined },
}));
const capture = (host: any, tick: number, enabled: boolean) => captureHostCombat(host, tick, { 0: tick, 1: tick }, 0, null, true, enabled);
const json = (v: any) => JSON.parse(JSON.stringify(v));
const dump = (v: any): any => v instanceof Ship ? { $ship: v.id } : Array.isArray(v) ? v.map(dump)
  : ArrayBuffer.isView(v) ? { type: v.constructor.name, values: Array.from(v as any) }
  : v instanceof Map ? [...v].map(([k, x]) => [dump(k), dump(x)]) : v instanceof Set ? [...v].map(dump)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, dump(x)])) : v;
function expanded(value: any, layouts: string[][]) {
  const p = projectileColumnPlan(value, layouts);
  return p.rows.map(row => {
    if (!Array.isArray(row)) return row;
    const t = p.templates[row[0]];
    return { $record: layouts.indexOf(t.keys), values: t.keys.map((_, col) => t.dynamic[col] ? row[t.dynamic[col]] : t.fixed[col]) };
  });
}

test('frame-local columns preserve every captured field and row; baseline objects are untouched', () => {
  const h = make(); h.projectiles = bullets() as any;
  const before = dump(h.projectiles), full = capture(h, 1, false), compact = capture(h, 1, true);
  assert.ok(compact.world.projectiles.$projectileColumns); assert.deepEqual(dump(h.projectiles), before);
  const rows = full.world.projectiles.$records !== undefined ? full.world.projectiles.values.map((values: any) => ({ $record: full.world.projectiles.$records, values })) : full.world.projectiles;
  assert.deepEqual(expanded(compact.world.projectiles, compact.layouts!), rows);
  assert.ok(JSON.stringify(compact).length < JSON.stringify(full).length);
  assert.ok(!JSON.stringify(captureCombat(h, 1, { 0: 0 }, 0, true)).includes('$projectileColumns'));
});
test('mixed layouts and unprofitable rows retain order via full-record fallback', () => {
  const h = make(); h.projectiles = bullets() as any; (h.projectiles[3] as any).uncommon = 99;
  const b = make(), c = make(); applyCombatSnapshot(b, json(capture(h, 1, false))); const f = capture(h, 1, true);
  assert.ok(f.world.projectiles.values.some((r: any) => !Array.isArray(r))); applyCombatSnapshot(c, json(f));
  assert.deepEqual(dump(c.projectiles), dump(b.projectiles));
  h.projectiles = bullets(3) as any; assert.equal(capture(h, 2, true).world.projectiles.$projectileColumns, undefined);
});
test('constant-to-changing fields, reordering, spawn/delete and clearing match full restores', () => {
  const h = make(), b = make(), c = make(); h.projectiles = bullets() as any;
  for (let tick = 1; tick <= 8; tick++) {
    if (tick === 2) (h.projectiles[0] as any).missileTrailSpec.width = 17;
    if (tick === 3) h.projectiles.reverse();
    if (tick === 4) h.projectiles.splice(1, 5);
    if (tick === 5) h.projectiles.push(...bullets(8).map((p, i) => ({ ...p, id: 100 + i })) as any);
    if (tick === 6) for (const p of h.projectiles) { p.pos.x += 99; p.color[0] = 8; }
    if (tick === 7) h.projectiles[0].id = 1; // Same behavior as full state even for reused IDs.
    if (tick === 8) h.projectiles = [];
    applyCombatSnapshots(b, [json(capture(h, tick, false))], false, undefined, { nativeTargeting: true });
    applyCombatSnapshots(c, [json(capture(h, tick, true))], false, undefined, { nativeTargeting: true });
    assert.deepEqual(dump(c.projectiles), dump(b.projectiles));
  }
});
test('shared nested values do not alias viewer objects, source objects or another frame', () => {
  const h = make(), c = make(); h.projectiles = bullets() as any;
  const f = json(capture(h, 1, true)); applyCombatSnapshot(c, f);
  const a: any = c.projectiles[0], b: any = c.projectiles[2]; assert.notEqual(a.custom, b.custom); assert.notEqual(a.custom.nested, b.custom.nested);
  a.custom.nested[0] = 999; a.missileTrailSpec.color[0] = 999; assert.equal(b.custom.nested[0], 5);
  assert.equal((h.projectiles[0] as any).custom.nested[0], 5);
  applyCombatSnapshot(c, json(capture(h, 2, true))); assert.equal((c.projectiles[0] as any).custom.nested[0], 5);
  assert.equal(f.world.projectiles.$projectileColumns[0][2].some((v: any) => v?.nested?.[0] === 999), false);
});
test('fresh viewers and skipped frames need no template history; reset interpolation stays equivalent', () => {
  const h = make(); h.projectiles = bullets() as any;
  for (const tick of [1, 20, 300]) for (const reset of [false, true]) {
    for (const p of h.projectiles) p.pos.x = tick + p.id;
    const b = make(), c = make(); applyCombatSnapshot(b, json(capture(h, tick, false)), reset); applyCombatSnapshot(c, json(capture(h, tick, true)), reset);
    assert.deepEqual(dump(c.projectiles), dump(b.projectiles));
  }
});
test('capture getters, custom map hooks, proxy reads and ship reference discovery retain generic semantics', () => {
  function run(enabled: boolean) {
    const h = make(); h.projectiles = bullets() as any; const reads: string[] = [];
    for (const p of h.projectiles as any[]) {
      Object.defineProperty(p, 'custom', { enumerable: true, get() { reads.push('custom' + p.id); return { reference: h.enemyShip, list: [1, 2] }; } });
      p.modNumber = Infinity;
    }
    h.projectiles[0] = new Proxy(h.projectiles[0], { get(target, key, receiver) { reads.push(String(key)); return Reflect.get(target, key, receiver); } });
    const f = capture(h, 1, enabled), v = make(); applyCombatSnapshot(v, f);
    assert.equal((v.projectiles[2] as any).custom.reference, v.enemyShip); return { reads, result: dump(v.projectiles) };
  }
  assert.deepEqual(run(true), run(false));
  const h = make(); h.projectiles = bullets() as any; let maps = 0;
  Object.defineProperty(h.projectiles, 'map', { value: function (fn: any) { maps++; return Array.prototype.map.call(this, fn); } });
  assert.equal(capture(h, 1, true).world.projectiles.$projectileColumns, undefined); assert.equal(maps, 1);
});
test('write order, existing nested identities and accessors match generic full-record restore', () => {
  const h = make(); h.projectiles = bullets() as any;
  function run(compact: boolean) {
    const v = make(); applyCombatSnapshot(v, json(capture(h, 1, compact))); const object: any = v.projectiles[0], nested = object.custom, log: string[] = [];
    for (const key of ['damage', 'rangeRemaining', 'custom']) { let value = object[key]; Object.defineProperty(object, key, { configurable: true, enumerable: true,
      get() { log.push('get:' + key); return value; }, set(next) { log.push('set:' + key); value = next; } }); }
    applyCombatSnapshot(v, json(capture(h, 2, compact))); assert.equal(object.custom, nested); return log;
  }
  assert.deepEqual(run(true), run(false));
});
test('signed zero, non-finite values, typed arrays, maps, sets and undefined use existing wire semantics', () => {
  const h = make(), b = make(), c = make(); h.projectiles = bullets() as any;
  for (const p of h.projectiles as any[]) { p.extra = { a: undefined, b: NaN, c: -Infinity, d: -0, e: new Float32Array([1.25, 2]), m: new Map([['a', 1]]), s: new Set([4, 5]) }; }
  applyCombatSnapshot(b, json(capture(h, 1, false))); applyCombatSnapshot(c, json(capture(h, 1, true))); assert.deepEqual(dump(c.projectiles), dump(b.projectiles));
});
test('schema rejects invalid indices, layouts, row widths, extras and expansion bombs before projectile writes', () => {
  const h = make(); h.projectiles = bullets() as any; const source = capture(h, 1, true), pristine = source.world.projectiles;
  const mutations = [
    (v: any) => v.values[0][0] = -1, (v: any) => v.values[0].pop(), (v: any) => v.values[0].push(1),
    (v: any) => v.$projectileColumns[0][0] = 99999, (v: any) => v.$projectileColumns[0][1][0] = -1,
    (v: any) => v.$projectileColumns[0][1][1] = v.$projectileColumns[0][1][0], (v: any) => v.$projectileColumns[0][2].pop(),
    (v: any) => v.extra = 1, (v: any) => v.values = Array(4097).fill(v.values[0]),
    (v: any) => v.$projectileColumns[0][2][0] = Array(Math.ceil(MAX_PROJECTILE_SHARED_NODES / 12)).fill(1),
  ];
  for (const mutate of mutations) {
    const bad = json(pristine); mutate(bad); const viewer = make(); viewer.projectiles = bullets(2) as any; const before = dump(viewer.projectiles);
    assert.throws(() => applyCombatSnapshot(viewer, { ...source, world: { ...source.world, projectiles: bad } }), /Invalid projectile/);
    assert.deepEqual(dump(viewer.projectiles), before);
  }
  const badKeys = json(source); badKeys.layouts[pristine.$projectileColumns[0][0]][0] = '__proto__'; assert.throws(() => applyCombatSnapshot(make(), badKeys), /layout keys/);
});
test('encoder falls back on high expansion, malformed or unsupported rows rather than emitting an invalid compact frame', () => {
  const keys = ['specId', ...Array.from({ length: 10 }, (_, i) => 'f' + i)], row = { $record: 0, values: ['test', ...Array(10).fill(1)] };
  assert.equal(compactProjectileColumns(Array(4097).fill(row), [keys]), null);
  assert.equal(compactProjectileColumns(Array(20).fill({ $record: 99, values: [] }), [keys]), null);
  const big = { ...row, values: ['test', ...Array(10).fill(Array(2000).fill(1))] }; assert.equal(compactProjectileColumns(Array(20).fill(big), [keys]), null);
  for (let n = 4; n < 100; n += 7) { const rows = Array.from({ length: n }, (_, i) => ({ $record: 0, values: ['test', i, ...Array(9).fill(i % 2)] })); const c = compactProjectileColumns(rows, [keys]); if (c) assert.deepEqual(expanded(c, [keys]), rows); }
});
for (const route of ['lan', 'steam']) test(`${route} production delta/packet codecs preserve compact state through skipped sends and fresh receivers`, () => {
  const h = make(), b = make(), guest = make(); h.projectiles = bullets() as any;
  const ls = new LanDeltaSender(), lr = new LanDeltaReceiver(), ss = new SteamSnapshotSender(), se = new SteamSnapshotEncoder(), sr = new SteamSnapshotReceiver(), ec = new SteamPacketCodec(), dc = new SteamPacketCodec();
  let final: any;
  for (const tick of [1, 2, 6, 7, 30]) {
    for (const p of h.projectiles) p.pos.x += p.id;
    const frame = capture(h, tick, true); final = frame; applyCombatSnapshot(b, json(capture(h, tick, false)));
    if (route === 'lan') {
      const binary = encodeBinaryState(match.id, tick, encodeProjectedBinaryFrame(frame)); const choice = ls.prepare(lanDeltaTarget(binary, tick));
      const decoded = decodeBinaryState(lr.decode(choice.packet)); ls.commit(choice); ls.ack(tick); applyCombatSnapshot(guest, decoded.frame);
    } else {
      const state = JSON.stringify({ type: 'state', matchId: match.id, seq: tick, frame }), choice = ss.prepare(state, se, ec, tick * 17);
      let received: any; for (const packet of ec.frame('1'.repeat(32), 'data', choice.prepared).packets) received = dc.receive('offline', packet, tick * 17);
      ss.commit(choice); const decoded = sr.receive(received.data); assert.equal(decoded.needsFull, false); applyCombatSnapshot(guest, decoded.data.frame);
    }
    assert.deepEqual(dump(guest.projectiles), dump(b.projectiles));
  }
  const fresh = make(), full = make(); applyCombatSnapshot(fresh, json(final), true); applyCombatSnapshot(full, json(capture(h, 30, false)), true); assert.deepEqual(dump(fresh.projectiles), dump(full.projectiles));
});
test('paired native simulations and subsequent RNG remain equal with compact capture enabled', () => {
  const wa = createLanWorld(match), wb = createLanWorld(match), a = wa.engine, b = wb.engine;
  const ma = configureHostCosmetics(a), mb = configureHostCosmetics(b);
  for (const w of [wa, wb]) for (const ship of w.controlled.values()) w.engine.externallyControlledShipIds.add(ship.id);
  for (let tick = 1; tick <= 240; tick++) {
    a.fixedUpdate(1 / 60); b.fixedUpdate(1 / 60);
    if (tick % 15 === 0) { captureHostCombat(a, tick, { 0: 0 }, 0, ma, true, false); captureHostCombat(b, tick, { 0: 0 }, 0, mb, true, true);
      assert.deepEqual(captureCombat(a, tick, { 0: 0 }, 0), captureCombat(b, tick, { 0: 0 }, 0)); }
  }
  assert.equal(a.visualRandom.next(), b.visualRandom.next());
});
