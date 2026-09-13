import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';

const scenarios = [
  { name: 'small', ships: 10, projectiles: 200 },
  { name: 'medium', ships: 50, projectiles: 2000 },
  { name: 'large', ships: 100, projectiles: 10000 }
];
const SAMPLES = 24;

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function makeObjects(shipCount, projectileCount) {
  const random = rng(0x5eed1234 + shipCount * 31 + projectileCount);
  const ships = Array.from({ length: shipCount }, () => ({
    x: (random() - 0.5) * 4000, y: (random() - 0.5) * 3000, radius: 30 + random() * 240
  }));
  const projectiles = Array.from({ length: projectileCount }, () => {
    const x = (random() - 0.5) * 4200; const y = (random() - 0.5) * 3200;
    return { x0: x, y0: y, x1: x + (random() - 0.5) * 120, y1: y + (random() - 0.5) * 120 };
  });
  return { ships, projectiles };
}

function segmentCircleHit(x0, y0, x1, y1, cx, cy, radius) {
  const dx = x1 - x0; const dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((cx - x0) * dx + (cy - y0) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const px = x0 + t * dx - cx; const py = y0 + t * dy - cy;
  return px * px + py * py <= radius * radius;
}

function baseline(data) {
  let hits = 0;
  for (const projectile of data.projectiles) {
    for (const ship of data.ships) {
      if (segmentCircleHit(projectile.x0, projectile.y0, projectile.x1, projectile.y1, ship.x, ship.y, ship.radius)) hits++;
    }
  }
  return hits;
}

function prepareTyped(data) {
  const ships = new Float64Array(data.ships.length * 3);
  data.ships.forEach((s, i) => { ships[i * 3] = s.x; ships[i * 3 + 1] = s.y; ships[i * 3 + 2] = s.radius * s.radius; });
  const projectiles = new Float64Array(data.projectiles.length * 4);
  data.projectiles.forEach((p, i) => { projectiles[i * 4] = p.x0; projectiles[i * 4 + 1] = p.y0; projectiles[i * 4 + 2] = p.x1; projectiles[i * 4 + 3] = p.y1; });
  return { ships, projectiles };
}

function optimized(data) {
  const { ships, projectiles } = data;
  let hits = 0;
  for (let p = 0; p < projectiles.length; p += 4) {
    const x0 = projectiles[p], y0 = projectiles[p + 1];
    const dx = projectiles[p + 2] - x0, dy = projectiles[p + 3] - y0;
    const invL2 = 1 / Math.max(1e-12, dx * dx + dy * dy);
    for (let s = 0; s < ships.length; s += 3) {
      let t = ((ships[s] - x0) * dx + (ships[s + 1] - y0) * dy) * invL2;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const qx = x0 + t * dx - ships[s], qy = y0 + t * dy - ships[s + 1];
      if (qx * qx + qy * qy <= ships[s + 2]) hits++;
    }
  }
  return hits;
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}

function stats(samples) {
  return {
    meanMs: samples.reduce((a, b) => a + b, 0) / samples.length,
    p95Ms: percentile(samples, 0.95),
    p99Ms: percentile(samples, 0.99)
  };
}

const output = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  samples: SAMPLES,
  wasm: {
    status: 'unavailable',
    reason: 'Local Runner has no rustc/cargo/rustup/wasm-bindgen toolchain; runtime build does not depend on Wasm.',
    adopted: false
  },
  scenarios: []
};

for (const scenario of scenarios) {
  const baselinePrep = [], baselineCompute = [], baselineTotal = [];
  const optimizedPrep = [], optimizedCompute = [], optimizedTotal = [];
  let baselineHits = 0, optimizedHits = 0;
  const memoryBefore = process.memoryUsage().heapUsed;
  for (let sample = 0; sample < SAMPLES; sample++) {
    let start = performance.now();
    const objects = makeObjects(scenario.ships, scenario.projectiles);
    let prepared = performance.now();
    baselineHits = baseline(objects);
    let end = performance.now();
    baselinePrep.push(prepared - start); baselineCompute.push(end - prepared); baselineTotal.push(end - start);

    start = performance.now();
    const typed = prepareTyped(objects);
    prepared = performance.now();
    optimizedHits = optimized(typed);
    end = performance.now();
    optimizedPrep.push(prepared - start); optimizedCompute.push(end - prepared); optimizedTotal.push(end - start);
  }
  if (baselineHits !== optimizedHits) throw new Error(`Collision mismatch for ${scenario.name}: ${baselineHits} vs ${optimizedHits}`);
  const memoryAfter = process.memoryUsage().heapUsed;
  output.scenarios.push({
    ...scenario,
    hits: baselineHits,
    baseline: { preparation: stats(baselinePrep), boundaryTransfer: { meanMs: 0, p95Ms: 0, p99Ms: 0 }, compute: stats(baselineCompute), total: stats(baselineTotal) },
    optimizedTs: { preparation: stats(optimizedPrep), boundaryTransfer: { meanMs: 0, p95Ms: 0, p99Ms: 0 }, compute: stats(optimizedCompute), total: stats(optimizedTotal) },
    wasm: null,
    memoryDeltaBytes: memoryAfter - memoryBefore
  });
}

await mkdir('benchmarks', { recursive: true });
await writeFile('benchmarks/collision-results.json', JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(output, null, 2));
