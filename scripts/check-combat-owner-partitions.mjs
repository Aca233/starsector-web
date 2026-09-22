/** Partition-count changes must not weaken eligibility or worker cancellation. Headless, no native UI. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dir = path.resolve('artifacts/combat-owner-partitions', `${Date.now()}-${process.pid}`);
fs.mkdirSync(dir, { recursive: true });
const bundle = path.join(dir, 'runtime.mjs');
await build({ stdin: { contents: `
  export { CombatEngine } from './src/engine/simulation/CombatEngine';
  export { OwnershipPool } from './src/engine/ai/multicore/OwnershipPool';
  export { AuditedCombatMulticore } from './src/engine/ai/multicore/AuditedCombatMulticore';
  export { CapitalShipAI } from './src/engine/ai/CapitalShipAI';
  export { Vector2 } from './src/engine/math/Vector2';
`, resolveDir: process.cwd(), loader: 'ts' }, outfile: bundle, bundle: true, platform: 'node', format: 'esm',
  define: { 'import.meta.env': '{"BASE_URL":"/","DEV":false}' } });
const { OwnershipPool, AuditedCombatMulticore, CombatEngine, CapitalShipAI, Vector2 } = await import(pathToFileURL(bundle).href);
let checks = 0;
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const created = [];
let autoInit = true, failAt = -1, failSend = false, invalidInit = false;
class FakeWorker {
  messages = [];
  terminations = 0;
  constructor() {
    if (created.length === failAt) throw Error('startup failure');
    created.push(this);
  }
  postMessage(data) {
    if (failSend) throw Error('send failure');
    this.messages.push(data);
    if (data.type === 'init' && autoInit) queueMicrotask(() => this.reply(data.id, invalidInit ? {} : { ready: true }));
  }
  reply(id, payload) { this.onmessage?.({ data: { id, ...payload } }); }
  terminate() { this.terminations++; }
}
const savedWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
const savedIsolation = Object.getOwnPropertyDescriptor(globalThis, 'crossOriginIsolated');
Object.defineProperty(globalThis, 'crossOriginIsolated', { configurable: true, value: true });
Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });
function fleet(n) {
  const engine = new CombatEngine('onslaught', 'onslaught', 3534);
  for (let i = 2; i < n; i++) engine.addShip('onslaught', i % 2 === 0, new Vector2(i * 800, 800), 0);
  const ais = [new CapitalShipAI(engine.playerShip, engine.enemyShip), ...engine.getNativeAIs()];
  return { engine, ais };
}
function disposedOnce(workers) { check(workers.map(w => w.terminations), workers.map(() => 1), 'terminate each owner exactly once'); }
try {
  for (const size of [50, 74, 100, 200]) {
    const { engine, ais } = fleet(size);
    for (const count of [2, 4]) {
      const first = created.length, pool = new OwnershipPool(engine, ais, count);
      await pool.ready;
      const workers = created.slice(first), groups = workers.map(w => w.messages[0].indices);
      check(workers.length, count, 'actual worker count');
      check(groups.flat().sort((a, b) => a - b), Array.from({ length: size }, (_, i) => i), 'one owner per ship, including stride-37 multiples');
      check(Math.max(...groups.map(g => g.length)) - Math.min(...groups.map(g => g.length)) <= 1, true, 'balanced partitions');
      check(pool.supports(true), true, 'full eligibility still checked');
      const old = engine.playerShip.systems;
      engine.playerShip.systems = [engine.playerShip.system, engine.playerShip.defenseSystem];
      check(pool.supports(true), false, 'dynamic unsupported system cannot use old predictions');
      engine.playerShip.systems = old;
      pool.dispose(); pool.dispose();
      check(pool.isDisposed, true, 'pool disposed');
      disposedOnce(workers);
    }
  }
  // The default local policy remains four; the two-owner candidate is opt-in at pool level.
  for (const size of [50, 74, 100, 101, 200]) {
    const { engine, ais } = fleet(size), first = created.length;
    const controller = new AuditedCombatMulticore({ minHardwareConcurrency: 1 });
    check(controller.prepare(engine, 1 / 60, { ais, allowAudited: true }), null, 'startup does not suspend authority');
    await new Promise(resolve => setImmediate(resolve));
    check(controller.status.workers, 4, 'production local policy unchanged');
    check(controller.status.tier, 'legacy-native', 'native rather than generic trial');
    controller.dispose(); disposedOnce(created.slice(first));
  }
  const { engine, ais } = fleet(100);
  for (const count of [0, 1, 3, 5, 2.5, NaN, Infinity]) {
    const first = created.length;
    assert.throws(() => new OwnershipPool(engine, ais, count), /Unsupported ownership scene/); checks++;
    check(created.length, first, 'reject invalid local count before spawning');
  }
  const defaultFirst = created.length, defaultPool = new OwnershipPool(engine, ais);
  await defaultPool.ready;
  check(defaultPool.count, 4, 'direct constructor default retained');
  defaultPool.dispose(); disposedOnce(created.slice(defaultFirst));
  for (const count of [1, 2, 3, 4]) {
    const first = created.length, pool = new OwnershipPool(engine, engine.getNativeAIs(), count, { lan: true });
    await pool.ready;
    check(pool.count, count, 'LAN keeps existing 1–4 policy');
    pool.dispose(); disposedOnce(created.slice(first));
  }
  for (const count of [0, 5, 1.5, NaN]) {
    assert.throws(() => new OwnershipPool(engine, engine.getNativeAIs(), count, { lan: true }), /Unsupported ownership scene/); checks++;
  }
  engine.isTacticalMap = true;
  for (const count of [2, 4]) { assert.throws(() => new OwnershipPool(engine, ais, count), /Unsupported ownership scene/); checks++; }
  engine.isTacticalMap = false;
  const small = fleet(49);
  assert.throws(() => new OwnershipPool(small.engine, small.ais, 2), /Unsupported ownership scene/); checks++;

  // Disposing during startup, and late replies after disposal, cannot resurrect owners.
  autoInit = false;
  let first = created.length, pool = new OwnershipPool(engine, ais, 2);
  const initRejected = assert.rejects(pool.ready, /AI pool disposed/);
  pool.dispose(); pool.dispose(); await initRejected; checks++;
  let workers = created.slice(first);
  for (const w of workers) w.reply(w.messages[0].id, { ready: true });
  check(pool.isDisposed, true, 'ignore late startup replies'); disposedOnce(workers);

  autoInit = true;
  first = created.length; pool = new OwnershipPool(engine, ais, 2); await pool.ready;
  workers = created.slice(first);
  const pending = pool.prepare(1 / 60), cancelled = assert.rejects(pending, /AI pool disposed/);
  await assert.rejects(pool.prepare(1 / 60), /Overlapping AI frame/); checks++;
  pool.dispose(); await cancelled; checks++;
  for (const w of workers) w.reply(w.messages.at(-1).id, { result: { rows: [] } });
  check(pool.metrics, null, 'late plan does not commit'); disposedOnce(workers);

  first = created.length; failAt = first + 1;
  assert.throws(() => new OwnershipPool(engine, ais, 2), /startup failure/); checks++;
  disposedOnce(created.slice(first)); failAt = -1;
  for (const failure of ['send', 'invalid-init', 'timeout']) {
    first = created.length; failSend = failure === 'send'; invalidInit = failure === 'invalid-init'; autoInit = failure !== 'timeout';
    pool = new OwnershipPool(engine, ais, 2, { initTimeoutMs: 10 });
    await assert.rejects(pool.ready, failure === 'send' ? /send failure/ : failure === 'invalid-init' ? /Invalid owner initialization/ : /AI owner timed out/); checks++;
    check(pool.isDisposed, true, 'startup failure closes pool'); disposedOnce(created.slice(first));
  }
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({ checks }, null, 2));
  console.log(`combat owner partition contracts: ${checks} checks passed`);
} finally {
  if (savedIsolation) Object.defineProperty(globalThis, 'crossOriginIsolated', savedIsolation);
  else delete globalThis.crossOriginIsolated;
  if (savedWorker) Object.defineProperty(globalThis, 'Worker', savedWorker);
  else delete globalThis.Worker;
}
