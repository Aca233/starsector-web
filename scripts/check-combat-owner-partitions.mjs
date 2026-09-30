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
  export { CombatMulticore } from './src/engine/ai/multicore/CombatMulticore';
  export { CombatWorkerBudget } from './src/engine/ai/multicore/CombatWorkerBudget';
  export { CapitalShipAI } from './src/engine/ai/CapitalShipAI';
  export { Vector2 } from './src/engine/math/Vector2';
`, resolveDir: process.cwd(), loader: 'ts' }, outfile: bundle, bundle: true, platform: 'node', format: 'esm',
  define: { 'import.meta.env': '{"BASE_URL":"/","DEV":false}' } });
const { CombatMulticore, CombatWorkerBudget, OwnershipPool, AuditedCombatMulticore, CombatEngine, CapitalShipAI, Vector2 } = await import(pathToFileURL(bundle).href);
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
  // Local warm-up/probes must not launch or send work to even the legacy codec.
  {
    const { engine, ais } = fleet(100), first = created.length;
    const controller = new AuditedCombatMulticore({ minHardwareConcurrency: 1 });
    check(controller.prepare(engine, 1 / 60, { ais, allowOwners: false }), null, 'native warm-up is serial');
    check(created.length, first, 'no speculative spawn during calibration');
    controller.prepare(engine, 1 / 60, { ais, allowOwners: true });
    await new Promise(resolve => setImmediate(resolve));
    const workers = created.slice(first), sent = workers.map(w => w.messages.length);
    check(controller.status.workers, 4, 'native trial still uses four owners');
    check(controller.prepare(engine, 1 / 60, { ais, allowOwners: false }), null, 'native probe is genuinely serial');
    check(workers.map(w => w.messages.length), sent, 'probe does not issue plans or reuse stale predictions');
    controller.dispose(); disposedOnce(workers);
  }
  // Use deterministic synthetic costs only for the policy contract; real speed is
  // measured separately with actual nested Workers, not this FakeWorker fixture.
  {
    const { engine, ais } = fleet(100), first = created.length;
    const controller = new CombatMulticore();
    controller.owners.options.minHardwareConcurrency = 1;
    check(controller.prepare(engine, ais[0], 1 / 60), null, 'wrapper calibrates native scene');
    for (let i = 0; i < 24; i++) controller.record(10, false);
    controller.prepare(engine, ais[0], 1 / 60);
    await new Promise(resolve => setImmediate(resolve));
    const workers = created.slice(first);
    check(controller.status.tier, 'legacy-native', 'test exercises former budget bypass');
    check(workers.length, 4, 'wrapper starts actual native pool');
    for (let probe = 0; probe < 3; probe++) {
      for (let i = 0; i < 7; i++) controller.record(20, true);
      controller.record(10, false);
    }
    controller.record(20, true);
    check(controller.status.workers, 0, 'losing legacy owners retired after completed samples');
    check(controller.status.budget.reason, 'no-measured-benefit', 'rejection reason retained');
    check(controller.status.budget.lastRejectedParallelMs, 20, 'losing cost retained');
    check(controller.prepare(engine, ais[0], 1 / 60), null, 'cooldown cannot immediately respawn legacy');
    check(created.length, first + 4, 'no worker churn during cooldown');
    disposedOnce(workers);
    controller.reset(); disposedOnce(workers);
    check(controller.status.budget.serialSamples, 0, 'new battle resets calibration');
    const budget = new CombatWorkerBudget(60000);
    for (let i = 0; i < 24; i++) budget.record(10, false, 0);
    for (let i = 0; i < 12; i++) budget.record(20, true, 100);
    check(budget.allow(100, 60099), false, 'full minute of hysteresis');
    check(budget.allow(100, 60100), true, 'retry becomes available after cooldown');
    budget.reset();
    for (let i = 0; i < 24; i++) budget.record(20, false, 0);
    for (let i = 0; i < 16; i++) check(budget.record(10, true, 1), false, 'profitable parallel path retained');
    const probes = Array.from({ length: 16 }, () => budget.allow(100, 2));
    check(probes.filter(v => !v).length, 2, 'periodic complete serial probe retained');
    check(budget.record(NaN, true, 3), false, 'nonfinite sample cannot retire a pool');
  }
  // A cold 100ms calibration must not shelter a warm 30ms parallel path
  // against the actual, interleaved 10ms serial cost for hundreds of steps.
  for (const fresh of [false, true]) {
    const budget = new CombatWorkerBudget(60000, fresh);
    for (let i = 0; i < 24; i++) budget.record(100, false, 0);
    budget.allow(100, 1);
    for (let probe = 0; probe < 3; probe++) {
      for (let i = 0; i < 7; i++) check(budget.record(30, true, 1), false, 'wait for three fresh serial probes');
      budget.record(10, false, 1);
      check(budget.status.serialProbeSamples, fresh ? probe + 1 : 0, 'count actual post-owner probes only');
    }
    check(budget.record(30, true, 2), fresh, 'only local fresh-probe mode retires the cold-baseline loser');
    if (fresh) {
      check(budget.status.serialMs, 10, 'discard cold calibration from trial comparator');
      check(budget.allow(100, 60001), false, 'rejection retains cooldown');
      check(budget.allow(100, 60002), false, 'timer alone cannot repeat an unchanged losing workload');
      check(budget.allow(100, 3600000), false, 'unchanged scene does not churn workers every minute');
      check(budget.allow(101, 3600001), true, 'fleet-size change permits a new trial after cooldown');
      budget.record(5, true, 60003);
      budget.record(10, false, 60004);
      check(budget.status.serialProbeSamples, 1, 'new trial starts a fresh paired baseline');
      budget.reset(); check(budget.status.serialProbeSamples, 0, 'reset clears probe epoch');
    } else check(budget.status.serialMs > 70, true, 'LAN/default calibration semantics unchanged');
  }
  {
    const budget = new CombatWorkerBudget(60000, true);
    for (let i = 0; i < 24; i++) budget.record(100, false, 0);
    for (let probe = 0; probe < 6; probe++) {
      for (let i = 0; i < 7; i++) check(budget.record(5, true, 1), false, 'profitable owners survive fresh calibration');
      budget.record(probe === 0 ? 1 : 10, false, 1);
    }
    check(budget.status.parallelSamples, 42, 'a lone low serial outlier cannot retire profitable workers');
    const state = budget.status;
    budget.record(Infinity, false, 2); budget.record(-1, true, 2);
    check(budget.status, state, 'invalid samples do not consume probe slots');
  }
  {
    const budget = new CombatWorkerBudget(60000, true);
    for (let i = 0; i < 24; i++) budget.record(10, false, 0);
    budget.allow(100, 1);
    for (let probe = 0; probe < 3; probe++) {
      for (let i = 0; i < 7; i++) budget.record(30, true, 2);
      budget.record(10, false, 2);
    }
    check(budget.record(30, true, 3), true, 'establish a losing local workload');
    check(budget.status.lastRejectedShips, 100, 'remember rejected workload size');
    check(budget.status.lastRejectedSerialMs, 10, 'remember warm serial cost, not cold start');
    for(let i=0;i<24;i++)budget.record(20,false,10);
    check(budget.allow(100,60002),false,'workload growth cannot skip minimum cooldown');
    check(budget.allow(100,60003),true,'sustained serial cost growth permits retry');
    for(let i=0;i<40;i++)budget.record(1,false,60004);
    check(budget.allow(100,60005),false,'low-cost guard still prevents needless work');
    for(let i=0;i<20;i++)budget.record(10,false,60006);
    check(budget.allow(100,60007),true,'an admitted startup is not abandoned by the historical workload gate');
    budget.reset(); check(budget.status.lastRejectedShips,0,'reset clears rejected workload');
  }
  // The default local policy remains four; the two-owner candidate is opt-in at pool level.
  for (const size of [50, 74, 100, 101, 200]) {
    const { engine, ais } = fleet(size), first = created.length;
    const controller = new AuditedCombatMulticore({ minHardwareConcurrency: 1 });
    check(controller.prepare(engine, 1 / 60, { ais, allowOwners: true }), null, 'startup does not suspend authority');
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
