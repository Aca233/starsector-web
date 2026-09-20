// CPU-only receive + legacy gateway forwarding benchmark. No native Steam, WS
// transport, renderer, network latency or game-Hz claim. Inputs are pre-parsed,
// as at dispatch entry. Encoding, decoding and fixture setup are not timed.
// BEFORE edits: node scripts/bench-steam-receiver-forwarding.mjs --capture-baseline <outside-repo-dir>
// AFTER edits:  node scripts/bench-steam-receiver-forwarding.mjs --baseline <same-dir> [--output <file>]
// Baseline is an exact file snapshot, never a reconstructed string-replacement
// version of the new implementation. Both sides run in fresh child processes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeBinaryState } from '../src/network/BinarySnapshot.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const names = ['snapshot-delta.mjs', 'gateway.mjs'];
const args = process.argv.slice(2);
const arg = key => { const i = args.indexOf(key); return i < 0 ? undefined : args[i + 1]; };
const sha = value => createHash('sha256').update(value).digest('hex');
const hashes = dir => Object.fromEntries(names.map(name => [name, sha(fs.readFileSync(path.join(dir, name)))]));
function capture(dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const name of names) fs.writeFileSync(path.join(dir, name), fs.readFileSync(path.join(root, 'server/steam', name)), { flag: 'wx' });
  return hashes(dir);
}
const moduleURL = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
async function loadSnapshot(dir) {
  const receiverURL = moduleURL(fs.readFileSync(path.join(dir, 'snapshot-delta.mjs'), 'utf8'));
  const originalURL = pathToFileURL(path.join(root, 'server/steam/gateway.mjs')).href;
  // Resolve unchanged dependencies from the real project; only the two captured
  // production modules differ. No production-method monkeypatching for A/B.
  const source = fs.readFileSync(path.join(dir, 'gateway.mjs'), 'utf8')
    .replace(/from (['"])([^'"]+)\1/g, (_match, _quote, specifier) => {
      const url = specifier === './snapshot-delta.mjs' ? receiverURL
        : specifier.startsWith('.') ? new URL(specifier, originalURL).href
        : import.meta.resolve(specifier);
      return 'from ' + JSON.stringify(url);
    }).replaceAll('import.meta.url', JSON.stringify(originalURL));
  return { ...(await import(receiverURL)), ...(await import(moduleURL(source))) };
}
function wire(value, token) {
  const text = JSON.stringify(value);
  return { type: 'steam-state', v: 1, token, base: null, size: Buffer.byteLength(text), hash: sha(text), body: value };
}
async function worker() {
  const { SteamGateway, SteamSnapshotReceiver, createStateDelta } = await loadSnapshot(arg('--snapshot'));
  const fixtures = JSON.parse(fs.readFileSync(arg('--workload'), 'utf8'));
  const iterations = Number(arg('--iterations'));
  const results = [];
  for (const fixture of fixtures) for (const mode of ['full', 'delta', 'legacy']) {
    const [before, after] = fixture.values, texts = fixture.values.map(value => JSON.stringify(value));
    const full = [wire(before, 1), wire(after, 2)];
    const inputs = mode === 'legacy' ? fixture.values : mode === 'full' ? full : [
      { ...full[0], base: 2, body: createStateDelta(after, before) },
      { ...full[1], base: 1, body: createStateDelta(before, after) }
    ];
    const messages = inputs.map(data => ({ connection: 'bench', op: 'data', id: 7, data }));
    let lastText, lastAck, sent = 0, acked = 0, chars = 0;
    const ws = { readyState: 1, bufferedAmount: 0, close() { throw Error('unexpected WS close'); },
      send(text, callback) { lastText = text; sent++; chars += text.length; callback(); } };
    const g = Object.assign(Object.create(SteamGateway.prototype), {
      owner: 'guest', selected: { owner: 'host', lobby: { getMembers: () => ['host', 'guest'] } },
      guestConnection: 'bench', renderer: ws, snapshotReceiver: new SteamSnapshotReceiver(),
      receivedStates: 0, lastStateAt: 0, report() {}, transmit(_remote, _connection, op, data) {
        lastAck = [op, data]; acked++;
      }
    });
    // Delta alternation begins after the captured successor baseline.
    if (mode === 'delta') g.snapshotReceiver.receive(full[1]);
    for (let i = 0; i < 2; i++) {
      g.dispatch('host', messages[i]);
      assert.equal(lastText, texts[i], 'untimed complete byte parity');
      assert.equal(Buffer.byteLength(lastText), full[i].size);
      assert.equal(sha(lastText), full[i].hash);
    }
    const warmup = 100;
    for (let i = 0; i < warmup; i++) g.dispatch('host', messages[i % 2]);
    const count = fixture.name === 'small' ? iterations * 250 : iterations;
    const times = new Float64Array(count);
    sent = 0; acked = 0; chars = 0;
    const cpuStart = process.cpuUsage(), wallStart = performance.now();
    for (let i = 0; i < count; i++) {
      const start = performance.now(); g.dispatch('host', messages[i % 2]); times[i] = performance.now() - start;
    }
    const wallMs = performance.now() - wallStart, cpu = process.cpuUsage(cpuStart);
    assert.equal(sent, count); assert.equal(acked, count); assert.deepEqual(lastAck, ['ack', { id: 7 }]);
    assert.equal(lastText, texts[(count - 1) % 2]);
    assert.equal(chars, Math.ceil(count / 2) * texts[0].length + Math.floor(count / 2) * texts[1].length);
    times.sort();
    results.push({ fixture: fixture.name, mode, iterations: count, bytes: full[0].size,
      outputHashes: full.map(item => item.hash), wallMs, meanMs: wallMs / count,
      p95Ms: times[Math.floor(count * .95)], cpuMs: (cpu.user + cpu.system) / 1000,
      cpuUsPerFrame: (cpu.user + cpu.system) / count });
  }
  console.log(JSON.stringify({ hashes: hashes(arg('--snapshot')), results }));
}
async function main() {
  if (arg('--capture-baseline')) {
    const dir = path.resolve(arg('--capture-baseline')); console.log(JSON.stringify({ baseline: dir, hashes: capture(dir) }, null, 2)); return;
  }
  if (args.includes('--worker')) { await worker(); return; }
  assert.ok(arg('--baseline'), '--baseline must point at exact pre-edit snapshots');
  const baseline = path.resolve(arg('--baseline')), baselineHashes = hashes(baseline);
  const iterations = Number(arg('--iterations') ?? 400);
  assert.ok(Number.isSafeInteger(iterations) && iterations >= 2 && iterations % 2 === 0, 'iterations must be a positive even integer >=2');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'steam-receiver-ab-'));
  const current = path.join(temp, 'current'), currentHashes = capture(current);
  assert.notDeepEqual(currentHashes, baselineHashes, 'old and new snapshots must differ');
  const fixturePath = path.resolve(arg('--fixture') ?? path.join(root, 'artifacts/lan-worker-latency/snapshot-32-0.bin'));
  const bytes = fs.readFileSync(fixturePath), captured = decodeBinaryState(bytes);
  const successor = JSON.parse(JSON.stringify(captured)); successor.seq++; successor.frame.tick++;
  const small = seq => ({ type: 'state', matchId: 'small', seq, frame: { tick: seq,
    ships: [{ id: 'a', x: Math.PI + seq, y: -1e-200, hull: 123.45678901234567 }], text: '中文😀' } });
  const workload = path.join(temp, 'workload.json');
  fs.writeFileSync(workload, JSON.stringify([{ name: 'recorded-32', values: [captured, successor] }, { name: 'small', values: [small(1), small(2)] }]));
  const rounds = [];
  for (const side of ['old', 'new', 'new', 'old']) {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--worker', '--snapshot', side === 'old' ? baseline : current,
      '--workload', workload, '--iterations', String(iterations)], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    assert.equal(child.status, 0, child.stderr || child.stdout);
    const result = JSON.parse(child.stdout);
    assert.deepEqual(result.hashes, side === 'old' ? baselineHashes : currentHashes);
    rounds.push({ side, ...result });
    console.error(side + ' CPU round complete');
  }
  const summary = [];
  for (const row of rounds[0].results) {
    const matching = side => rounds.filter(r => r.side === side).map(r => r.results.find(v => v.fixture === row.fixture && v.mode === row.mode));
    const old = matching('old'), next = matching('new');
    for (const value of [...old, ...next]) assert.deepEqual(value.outputHashes, row.outputHashes);
    const average = (rows, key) => rows.reduce((sum, v) => sum + v[key], 0) / rows.length;
    const oldMeanMs = average(old, 'meanMs'), newMeanMs = average(next, 'meanMs');
    const oldCpuUs = average(old, 'cpuUsPerFrame'), newCpuUs = average(next, 'cpuUsPerFrame');
    summary.push({ fixture: row.fixture, mode: row.mode, bytes: row.bytes, iterationsPerRound: row.iterations,
      oldMeanMs, newMeanMs, wallReductionPercent: (1 - newMeanMs / oldMeanMs) * 100,
      oldCpuUs, newCpuUs, cpuReductionPercent: (1 - newCpuUs / oldCpuUs) * 100 });
  }
  assert.deepEqual(hashes(baseline), baselineHashes);
  const result = { scope: 'CPU only: pre-parsed receive + production legacy dispatch + synchronous WS sink. No transport, renderer, RTT or game Hz measurement.',
    deltaWorkload: 'Recorded 32-ship state plus a synthetic seq/tick-only successor; all other captured fields preserved. Small fixture is synthetic.',
    order: 'ABBA; fresh child process per round; 100 warmup operations per scenario',
    node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model,
    fixture: { path: fixturePath, binaryBytes: bytes.length, sha256: sha(bytes) },
    baseline, baselineHashes, current, currentHashes, summary, rounds };
  if (arg('--output')) fs.writeFileSync(path.resolve(arg('--output')), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
await main();
