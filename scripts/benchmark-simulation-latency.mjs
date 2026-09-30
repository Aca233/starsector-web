// Paired CPU benchmark of the production kernel + local display codec, not FPS/IPC/WAN latency.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
const args = process.argv.slice(2), arg = (key, fallback) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
const out = path.resolve(arg('--out', 'artifacts/simulation-perf-20260924/local'));
const counts = arg('--ships', '24,100').split(',').map(Number), steps = Number(arg('--steps', '120')), warm = Number(arg('--warm', '60')), hull = arg('--hull', 'onslaught');
const enemyHull = arg('--enemy-hull', hull);
assert.ok(counts.every(n => Number.isInteger(n) && n >= 2 && n <= 200) && Number.isInteger(steps) && steps >= 1 && steps <= 1800 && Number.isInteger(warm) && warm >= 0 && warm <= 600);
fs.mkdirSync(out, { recursive: true });
const freeze = arg('--freeze'), baseline = arg('--baseline'), candidate = arg('--candidate');
const reverse = args.includes('--reverse-order');
if (freeze && fs.existsSync(freeze)) throw Error('Refusing to overwrite frozen baseline');
const sources = baseline ? JSON.parse(fs.readFileSync(baseline, 'utf8')) : null;
const candidateSources = candidate ? JSON.parse(fs.readFileSync(candidate, 'utf8')) : null;
const hash = value => createHash('sha256').update(value).digest('hex');
const modules = {}, frozen = {};
for (const arm of sources ? ['before', 'after'] : ['current']) {
  const outfile = path.join(out, arm + '.mjs');
  const result = await build({ entryPoints: ['scripts/lib/simulation-latency-scenario.mts'], outfile, bundle: true, platform: 'node', format: 'esm', metafile: true,
    define: { '__LAN_BUILD_ID__': JSON.stringify('simulation-perf'), 'import.meta.env': JSON.stringify({ BASE_URL: '/', DEV: false }) }, logLevel: 'warning',
    plugins: [{ name: 'frozen-simulation', setup(b) {
      const graph = arm === 'before' ? sources : candidateSources;
      // Rejected experiments may contain source files no longer on disk. Resolve
      // the frozen graph itself rather than requiring production stubs to replay.
      if (graph) b.onResolve({ filter: /^\./ }, info => {
        const base = path.resolve(info.resolveDir, info.path);
        for (const resolved of [base, base + '.ts', base + '.tsx', base + '.js', base + '.mts', path.join(base, 'index.ts')]) {
          const key = path.relative(process.cwd(), resolved).replaceAll('\\', '/');
          if (Object.hasOwn(graph, key)) return { path: resolved };
        }
      });
      b.onLoad({ filter: /\.[cm]?[jt]sx?$|\.json$/ }, info => {
      const key = path.relative(process.cwd(), info.path).replaceAll('\\', '/');
      if (!key.startsWith('src/')) return;
      const row = graph?.[key];
      if (graph && !row) throw Error('Missing frozen module: ' + key);
      const code = row?.code ?? fs.readFileSync(info.path, 'utf8');
      if (row) assert.equal(hash(code), row.sha256, key);
      if (freeze) frozen[key] = { code, sha256: hash(code) };
      return { contents: code, loader: info.path.endsWith('.json') ? 'json' : /\.m?ts$/.test(info.path) ? 'ts' : 'js' };
    }); } }] });
  assert.ok(!Object.keys(result.metafile.inputs).some(p => p.includes('/campaign/')));
  modules[arm] = await import(pathToFileURL(outfile));
}
if (freeze) fs.writeFileSync(freeze, JSON.stringify(frozen));
const stats = values => { const v = values.toSorted((a, b) => a - b); return { mean: v.reduce((a, b) => a + b, 0) / v.length, p50: v[Math.floor((v.length - 1) * .5)], p95: v[Math.floor((v.length - 1) * .95)] }; };
const results = [];
for (const count of counts) {
  const worlds = Object.fromEntries(Object.entries(modules).map(([arm, m]) => [arm, m.scenario(count, hull, enemyHull)]));
  const samples = Object.fromEntries(Object.keys(worlds).map(arm => [arm, []]));
  let checks = 0;
  for (let tick = 0; tick < warm + steps; tick++) {
    const latest = {};
    const order = Object.keys(worlds); if ((tick % 2 === 1) !== reverse) order.reverse();
    for (const arm of order) { latest[arm] = worlds[arm].advance(); if (tick >= warm) { const metrics = { ...latest[arm] }; delete metrics.display; samples[arm].push(metrics); } }
    if (worlds.before) {
      assert.deepEqual(worlds.after.witness(), worlds.before.witness(), 'authority witness ' + tick);
      assert.deepEqual(worlds.after.fireControlWitness(), worlds.before.fireControlWitness(), 'hidden fire control ' + tick);
      assert.deepEqual(latest.after.display, latest.before.display, 'display ' + tick);
      if (tick % 30 === 0 || tick === warm + steps - 1) { assert.deepEqual(worlds.after.wire(), worlds.before.wire(), 'full authority wire ' + tick); checks++; }
    }
  }
  const result = { count, hull, enemyHull, warm, steps, authorityChecks: checks, arms: Object.fromEntries(Object.entries(samples).map(([arm, rows]) => [arm,
    Object.fromEntries(['simulation', 'capture', 'decode', 'total', 'numericBytes', 'nodes', 'ships', 'projectiles'].map(k => [k, stats(rows.map(row => row[k]))]))])) };
  results.push(result); console.log(JSON.stringify(result));
  for (const world of Object.values(worlds)) world.dispose();
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ scope: 'Deterministic Node CPU loop; fixed 60Hz dt, no renderer, IPC, network, timer or multicore. Not FPS or measured input-to-photon latency.', node: process.version, baseline: baseline ?? null, candidate: candidate ?? null, reverse, results }, null, 2));
}
