import assert from 'node:assert/strict';

// Test-build hooks only; production has no counter or public collisionRisk API.
export function instrumentNavigationSweep(code) {
  const insert = (from, to) => { assert.equal(code.split(from).length, 2, 'sweep instrumentation anchor'); code = code.replace(from, to); };
  insert('for(const o of nearby){', 'for(const o of nearby){ sweepProbe.segments++;');
  insert('const t=Math.max(0,Math.min(1,-(rx*dx+ry*dy)/Math.max(1e-10,dx*dx+dy*dy)));',
    'sweepProbe.exact++; const t=Math.max(0,Math.min(1,-(rx*dx+ry*dy)/Math.max(1e-10,dx*dx+dy*dy)));');
  return code + '\nexport {collisionRisk as sweepRisk}; export const sweepProbe = {segments:0, exact:0};\n';
}

export function checkNavigationSweeps(api) {
  const { Vector2, candidateRisk, beforeRisk, candidateProbe, beforeProbe } = api;
  beforeProbe.segments = beforeProbe.exact = candidateProbe.segments = candidateProbe.exact = 0;
  let checks = 0, seed = 73419;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const same = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
  const stats = { acceleration: 55, deceleration: 70, strafeMultiplier: .6 };
  const obstacle = (x, y, vx, vy, radius) => ({ x, y, vx, vy, radius, rejectRadius: radius + 1e-12 * Math.max(1, Math.abs(radius)) });
  const makeShip = (x = 0, y = 0, vx = 0, vy = 0, facingRad = 0) => ({ pos: new Vector2(x, y), vel: new Vector2(vx, vy), facingRad, getMotionStats: () => stats });
  const compare = (ship, desired, rows, horizon, label) => same(candidateRisk(ship, desired, rows, horizon), beforeRisk(ship, desired, rows, horizon), label);
  const adjacent = (x, towardPositive) => {
    if (x === 0) return towardPositive ? Number.MIN_VALUE : -Number.MIN_VALUE;
    const bytes = new DataView(new ArrayBuffer(8)); bytes.setFloat64(0, x);
    bytes.setBigUint64(0, bytes.getBigUint64(0) + ((x > 0) === towardPositive ? 1n : -1n)); return bytes.getFloat64(0);
  };

  // Both travel directions, overlap, head-on, parallel misses and adjacent ULPs.
  for (const radius of [0, 1e-300, 1e-12, 1, 100, 1e76]) {
    const bound = radius + 1e-12 * Math.max(1, Math.abs(radius));
    for (const side of [-1, 1]) for (const gap of [radius, bound, adjacent(bound, true), adjacent(bound, false)]) {
      for (const velocity of [-400, 0, 400]) {
        const rows = [obstacle(side * gap, 0, velocity, 0, radius), obstacle(0, side * gap, 0, velocity, radius)];
        compare(makeShip(), new Vector2(200, 0), rows, 3, 'ULP/tangent/endpoints');
      }
    }
  }
  const scaleValues = [0, 1, 1e-300, 1e-160, 1e-12, 1e8, 1e76, 1e160, 1e300];
  for (let trial = 0; trial < 1600; trial++) {
    const scale = scaleValues[trial % scaleValues.length], r = () => (random() - .5) * scale;
    const ship = makeShip(r() * 1000, r() * 1000, r() * 400, r() * 400, random() * Math.PI * 2);
    const desired = new Vector2(r() * 400, r() * 400);
    const rows = Array.from({ length: 12 }, () => obstacle(r() * 2000, r() * 2000, r() * 500, r() * 500, random() * 200 * scale));
    compare(ship, desired, rows, trial % 4 ? random() * 8 : 0, 'finite scales ' + trial);
  }
  for (const value of [-0, Number.MIN_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE, Infinity, -Infinity, NaN]) {
    for (const field of ['x', 'y', 'vx', 'vy', 'radius', 'rejectRadius']) {
      const row = obstacle(100, 120, -20, 10, 80); row[field] = value;
      compare(makeShip(), new Vector2(100, 0), [row], 3, 'nonfinite obstacle ' + field);
    }
    for (const desired of [new Vector2(value, 0), new Vector2(0, value)]) compare(makeShip(), desired, [obstacle(20, 0, 0, 0, 30)], 3, 'nonfinite desired');
    compare(makeShip(), new Vector2(100, 0), [obstacle(20, 0, 0, 0, 30)], value, 'nonfinite horizon');
  }
  compare(makeShip(), new Vector2(), [], 3, 'empty obstacle list');
  compare(makeShip(), new Vector2(), [obstacle(0, 0, 0, 0, -10)], 3, 'invalid negative radius');

  // There is no caching of observable vector/stat reads between steps/candidates.
  const observed = risk => {
    const calls = [], ship = makeShip(0, 0, 15, 20); let step = 0;
    const dynamicStats = Object.fromEntries(Object.keys(stats).map(key => [key, stats[key]]));
    for (const key of Object.keys(stats)) Object.defineProperty(dynamicStats, key, { get() { calls.push(key); return stats[key]; } });
    ship.getMotionStats = () => { calls.push('stats'); return dynamicStats; };
    const desired = new Vector2(130, 20); desired.length = () => { calls.push('length'); return ++step % 3 ? 100 : 0; };
    return { risk: risk(ship, desired, [obstacle(5, 12, 0, 0, 30), obstacle(-3000, 1500, 10, 1, 20)], 3), calls };
  };
  same(observed(candidateRisk), observed(beforeRisk), 'dynamic desired/stat read order');
  const intrinsic = Object.fromEntries(['max', 'min', 'abs', 'hypot'].map(name => [name, Math[name]]));
  for (const name of Object.keys(intrinsic)) {
    const run = risk => {
      const calls = [];
      try {
        Math[name] = (...args) => { calls.push(args); return Reflect.apply(intrinsic[name], Math, args); };
        return { value: risk(makeShip(), new Vector2(100, 30), [obstacle(-2000, 300, 10, -10, 100), obstacle(20, 0, 0, 0, 30)], 3), calls };
      } finally { Math[name] = intrinsic[name]; }
    };
    same(run(candidateRisk), run(beforeRisk), 'replaced math callback order ' + name);
  }
  const mutateInLength = risk => {
    const calls = [], desired = new Vector2(100, 0); let step = 0;
    desired.length = () => {
      calls.push('length'); ++step;
      Math.max = step % 2 ? (...args) => { calls.push(args); return intrinsic.max(...args); } : intrinsic.max;
      return 100;
    };
    try { return { value: risk(makeShip(), desired, [obstacle(-2000, 300, 10, -10, 100), obstacle(20, 0, 0, 0, 30)], 3), calls }; }
    finally { Math.max = intrinsic.max; }
  };
  same(mutateInLength(candidateRisk), mutateInLength(beforeRisk), 'math replacement within prediction');
  same(candidateProbe.segments, beforeProbe.segments, 'every original obstacle segment is visited');
  assert.ok(candidateProbe.exact > 0 && candidateProbe.exact < beforeProbe.exact, 'both exact and early reject paths exercised'); checks++;
  const report = { checks, before: { ...beforeProbe }, after: { ...candidateProbe }, scope: 'exact risk/read-order contracts and operation counts, not a speed estimate' };
  console.log('navigation swept bounds:', JSON.stringify(report)); return report;
}
