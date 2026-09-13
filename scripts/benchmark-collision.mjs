import { performance } from 'node:perf_hooks';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const scenarios = [
  { name: 'small', ships: 10, projectiles: 200 },
  { name: 'medium', ships: 50, projectiles: 2000 },
  { name: 'large', ships: 100, projectiles: 10000 }
];
const SAMPLES = 40;
const WARMUP_SAMPLES = 8;
const SHIP_STRIDE = 11;
const PROJECTILE_STRIDE = 4;
const OUTPUT_STRIDE = 5;
const COLLISION_NONE = 0;
const COLLISION_HULL = 1;
const COLLISION_SHIELD = 2;
const WASM_PATH = process.env.WASM_PILOT_PATH || path.resolve('artifacts/wasm-pilot/collision_core.wasm');

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

async function loadHullProfiles() {
  const source = await readFile('src/engine/data/hull_bounds.ts', 'utf8');
  const extract = (name) => {
    const match = source.match(new RegExp(`export const ${name}[^=]*=\\s*(\\[[^;]+\\]);`));
    if (!match) throw new Error(`Could not extract ${name} from hull_bounds.ts`);
    return JSON.parse(match[1]);
  };
  return [
    {
      name: 'onslaught',
      bounds: extract('ONSLAUGHT_BOUNDS'),
      collisionRadius: 275,
      shieldRadius: 240,
      shieldArcDeg: 180,
      shieldCenterX: 32,
      shieldCenterY: 0,
      hasShield: true
    },
    {
      name: 'paragon',
      bounds: extract('PARAGON_BOUNDS'),
      collisionRadius: 270,
      shieldRadius: 270,
      shieldArcDeg: 360,
      shieldCenterX: 1,
      shieldCenterY: 0,
      hasShield: true
    },
    {
      name: 'doom',
      bounds: extract('DOOM_BOUNDS'),
      collisionRadius: 170,
      shieldRadius: 155,
      shieldArcDeg: 360,
      shieldCenterX: 0,
      shieldCenterY: 0,
      hasShield: false
    }
  ];
}

function makeStaticOutlineData(realProfiles) {
  const squareProfile = {
    name: 'benchmark-square',
    bounds: [[-1, -1], [1, -1], [1, 1], [-1, 1]],
    collisionRadius: 2,
    shieldRadius: 3,
    shieldArcDeg: 360,
    shieldCenterX: 0,
    shieldCenterY: 0,
    hasShield: true
  };
  const profiles = [...realProfiles, squareProfile];
  const meta = new Float64Array(profiles.length * 2);
  const vertexCount = profiles.reduce((sum, profile) => sum + profile.bounds.length, 0);
  const outlines = new Float64Array(vertexCount * 2);
  let vertexOffset = 0;
  profiles.forEach((profile, profileIndex) => {
    meta[profileIndex * 2] = vertexOffset;
    meta[profileIndex * 2 + 1] = profile.bounds.length;
    for (let i = 0; i < profile.bounds.length; i++) {
      outlines[(vertexOffset + i) * 2] = profile.bounds[i][0];
      outlines[(vertexOffset + i) * 2 + 1] = profile.bounds[i][1];
    }
    profile.outlineId = profileIndex;
    vertexOffset += profile.bounds.length;
  });
  return { profiles, realProfiles: profiles.slice(0, realProfiles.length), squareProfile, outlines, meta };
}

function createShip(profile, x, y, facingRad, shieldActive) {
  return {
    x,
    y,
    facingRad,
    facingCos: Math.cos(facingRad),
    facingSin: Math.sin(facingRad),
    profile,
    shieldActive: Boolean(shieldActive && profile.hasShield)
  };
}

function makeObjects(shipCount, projectileCount, profiles) {
  const random = rng(0x5eed1234 + shipCount * 31 + projectileCount);
  const ships = Array.from({ length: shipCount }, (_, index) => {
    const profile = profiles[index % profiles.length];
    return createShip(
      profile,
      (random() - 0.5) * 4000,
      (random() - 0.5) * 3000,
      random() * Math.PI * 2,
      random() > 0.3
    );
  });
  const projectiles = Array.from({ length: projectileCount }, () => {
    const x = (random() - 0.5) * 4200;
    const y = (random() - 0.5) * 3200;
    return {
      x0: x,
      y0: y,
      x1: x + (random() - 0.5) * 900,
      y1: y + (random() - 0.5) * 900
    };
  });
  return { ships, projectiles };
}

function circleRoots(x0, y0, x1, y1, cx, cy, radiusSquared) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const fx = x0 - cx;
  const fy = y0 - cy;
  const a = dx * dx + dy * dy;
  const c = fx * fx + fy * fy - radiusSquared;
  if (c <= 0) return [0, null];
  if (a <= 1e-18) return [null, null];
  const b = 2 * (fx * dx + fy * dy);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [null, null];
  const root = Math.sqrt(discriminant);
  const inv2a = 0.5 / a;
  const t0 = (-b - root) * inv2a;
  const t1 = (-b + root) * inv2a;
  return [t0 >= 0 && t0 <= 1 ? t0 : null, t1 >= 0 && t1 <= 1 ? t1 : null];
}

function shieldHitT(x0, y0, x1, y1, ship) {
  const profile = ship.profile;
  if (!ship.shieldActive || profile.shieldRadius <= 0) return null;
  const shieldCx = ship.x + profile.shieldCenterX * ship.facingCos - profile.shieldCenterY * ship.facingSin;
  const shieldCy = ship.y + profile.shieldCenterX * ship.facingSin + profile.shieldCenterY * ship.facingCos;
  const halfArcCos = Math.cos((profile.shieldArcDeg * 0.5 * Math.PI) / 180);
  const roots = circleRoots(x0, y0, x1, y1, shieldCx, shieldCy, profile.shieldRadius * profile.shieldRadius);
  for (const t of roots) {
    if (t == null) continue;
    const hx = x0 + (x1 - x0) * t - shieldCx;
    const hy = y0 + (y1 - y0) * t - shieldCy;
    const length = Math.hypot(hx, hy);
    if (length <= 1e-12 || halfArcCos <= -0.999999) return t;
    const dot = (hx * ship.facingCos + hy * ship.facingSin) / length;
    if (dot >= halfArcCos) return t;
  }
  return null;
}

function pointInPolygonObject(x, y, polygon) {
  let inside = false;
  let j = polygon.length - 1;
  for (let i = 0; i < polygon.length; i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && Math.abs(yj - yi) > 1e-12 && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
    j = i;
  }
  return inside;
}

function segmentPolygonHitTObject(x0, y0, x1, y1, polygon) {
  if (pointInPolygonObject(x0, y0, polygon)) return 0;
  const dx1 = x1 - x0;
  const dy1 = y1 - y0;
  let bestT = Infinity;
  let j = polygon.length - 1;
  for (let i = 0; i < polygon.length; i++) {
    const x3 = polygon[j][0];
    const y3 = polygon[j][1];
    const x4 = polygon[i][0];
    const y4 = polygon[i][1];
    const dx2 = x4 - x3;
    const dy2 = y4 - y3;
    const denom = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(denom) >= 1e-8) {
      const dx3 = x0 - x3;
      const dy3 = y0 - y3;
      const t = (dx2 * dy3 - dy2 * dx3) / denom;
      const u = (dx1 * dy3 - dy1 * dx3) / denom;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && t < bestT) bestT = t;
    }
    j = i;
  }
  if (Number.isFinite(bestT)) return bestT;
  return pointInPolygonObject(x1, y1, polygon) ? 1 : null;
}

function baseline(objects) {
  const output = new Float64Array(objects.projectiles.length * OUTPUT_STRIDE);
  let hits = 0;
  for (let p = 0; p < objects.projectiles.length; p++) {
    const projectile = objects.projectiles[p];
    let bestTarget = -1;
    let bestT = Infinity;
    let bestType = COLLISION_NONE;
    for (let s = 0; s < objects.ships.length; s++) {
      const ship = objects.ships[s];
      const profile = ship.profile;
      const shieldExtent = ship.shieldActive
        ? Math.hypot(profile.shieldCenterX, profile.shieldCenterY) + profile.shieldRadius
        : 0;
      const broadphaseRadius = Math.max(profile.collisionRadius, shieldExtent);
      const broadphase = circleRoots(
        projectile.x0, projectile.y0, projectile.x1, projectile.y1,
        ship.x, ship.y, broadphaseRadius * broadphaseRadius
      );
      if (broadphase[0] == null && broadphase[1] == null) continue;

      const shieldT = shieldHitT(projectile.x0, projectile.y0, projectile.x1, projectile.y1, ship);
      if (shieldT != null && shieldT < bestT) {
        bestT = shieldT;
        bestTarget = s;
        bestType = COLLISION_SHIELD;
      }

      const relX0 = projectile.x0 - ship.x;
      const relY0 = projectile.y0 - ship.y;
      const relX1 = projectile.x1 - ship.x;
      const relY1 = projectile.y1 - ship.y;
      const localX0 = relX0 * ship.facingCos + relY0 * ship.facingSin;
      const localY0 = -relX0 * ship.facingSin + relY0 * ship.facingCos;
      const localX1 = relX1 * ship.facingCos + relY1 * ship.facingSin;
      const localY1 = -relX1 * ship.facingSin + relY1 * ship.facingCos;
      const hullT = segmentPolygonHitTObject(localX0, localY0, localX1, localY1, profile.bounds);
      if (hullT != null && hullT < bestT) {
        bestT = hullT;
        bestTarget = s;
        bestType = COLLISION_HULL;
      }
    }
    const o = p * OUTPUT_STRIDE;
    if (bestTarget >= 0) {
      output[o] = bestTarget;
      output[o + 1] = bestT;
      output[o + 2] = projectile.x0 + (projectile.x1 - projectile.x0) * bestT;
      output[o + 3] = projectile.y0 + (projectile.y1 - projectile.y0) * bestT;
      output[o + 4] = bestType;
      hits++;
    } else {
      output[o] = -1;
      output[o + 1] = 1;
      output[o + 2] = projectile.x1;
      output[o + 3] = projectile.y1;
      output[o + 4] = COLLISION_NONE;
    }
  }
  return { hits, output };
}

function prepareTyped(objects) {
  const ships = new Float64Array(objects.ships.length * SHIP_STRIDE);
  objects.ships.forEach((ship, i) => {
    const base = i * SHIP_STRIDE;
    const profile = ship.profile;
    ships[base] = ship.x;
    ships[base + 1] = ship.y;
    ships[base + 2] = ship.facingCos;
    ships[base + 3] = ship.facingSin;
    const shieldExtent = ship.shieldActive
      ? Math.hypot(profile.shieldCenterX, profile.shieldCenterY) + profile.shieldRadius
      : 0;
    const broadphaseRadius = Math.max(profile.collisionRadius, shieldExtent);
    ships[base + 4] = broadphaseRadius * broadphaseRadius;
    ships[base + 5] = profile.outlineId;
    ships[base + 6] = profile.shieldRadius * profile.shieldRadius;
    ships[base + 7] = Math.cos((profile.shieldArcDeg * 0.5 * Math.PI) / 180);
    ships[base + 8] = ship.shieldActive ? 1 : 0;
    ships[base + 9] = profile.shieldCenterX;
    ships[base + 10] = profile.shieldCenterY;
  });
  const projectiles = new Float64Array(objects.projectiles.length * PROJECTILE_STRIDE);
  objects.projectiles.forEach((projectile, i) => {
    const base = i * PROJECTILE_STRIDE;
    projectiles[base] = projectile.x0;
    projectiles[base + 1] = projectile.y0;
    projectiles[base + 2] = projectile.x1;
    projectiles[base + 3] = projectile.y1;
  });
  return { ships, projectiles };
}

function pointInPolygonPacked(x, y, outlines, startVertex, vertexCount) {
  let inside = false;
  let j = vertexCount - 1;
  for (let i = 0; i < vertexCount; i++) {
    const ii = (startVertex + i) * 2;
    const jj = (startVertex + j) * 2;
    const xi = outlines[ii];
    const yi = outlines[ii + 1];
    const xj = outlines[jj];
    const yj = outlines[jj + 1];
    if ((yi > y) !== (yj > y) && Math.abs(yj - yi) > 1e-12 && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
    j = i;
  }
  return inside;
}

function segmentPolygonHitTPacked(x0, y0, x1, y1, outlines, startVertex, vertexCount) {
  if (pointInPolygonPacked(x0, y0, outlines, startVertex, vertexCount)) return 0;
  const dx1 = x1 - x0;
  const dy1 = y1 - y0;
  let bestT = Infinity;
  let j = vertexCount - 1;
  for (let i = 0; i < vertexCount; i++) {
    const ii = (startVertex + i) * 2;
    const jj = (startVertex + j) * 2;
    const x3 = outlines[jj];
    const y3 = outlines[jj + 1];
    const x4 = outlines[ii];
    const y4 = outlines[ii + 1];
    const dx2 = x4 - x3;
    const dy2 = y4 - y3;
    const denom = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(denom) >= 1e-8) {
      const dx3 = x0 - x3;
      const dy3 = y0 - y3;
      const t = (dx2 * dy3 - dy2 * dx3) / denom;
      const u = (dx1 * dy3 - dy1 * dx3) / denom;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && t < bestT) bestT = t;
    }
    j = i;
  }
  if (Number.isFinite(bestT)) return bestT;
  return pointInPolygonPacked(x1, y1, outlines, startVertex, vertexCount) ? 1 : null;
}

function optimized(data, staticData) {
  const { ships, projectiles } = data;
  const { outlines, meta } = staticData;
  const projectileCount = projectiles.length / PROJECTILE_STRIDE;
  const shipCount = ships.length / SHIP_STRIDE;
  const output = new Float64Array(projectileCount * OUTPUT_STRIDE);
  let hits = 0;

  for (let p = 0; p < projectileCount; p++) {
    const pi = p * PROJECTILE_STRIDE;
    const x0 = projectiles[pi];
    const y0 = projectiles[pi + 1];
    const x1 = projectiles[pi + 2];
    const y1 = projectiles[pi + 3];
    let bestTarget = -1;
    let bestT = Infinity;
    let bestType = COLLISION_NONE;

    for (let shipIndex = 0; shipIndex < shipCount; shipIndex++) {
      const s = shipIndex * SHIP_STRIDE;
      const cx = ships[s];
      const cy = ships[s + 1];
      const facingCos = ships[s + 2];
      const facingSin = ships[s + 3];
      const broadphase = circleRoots(x0, y0, x1, y1, cx, cy, ships[s + 4]);
      if (broadphase[0] == null && broadphase[1] == null) continue;

      if (ships[s + 8] >= 0.5) {
        const shieldCx = cx + ships[s + 9] * facingCos - ships[s + 10] * facingSin;
        const shieldCy = cy + ships[s + 9] * facingSin + ships[s + 10] * facingCos;
        const shieldRoots = circleRoots(x0, y0, x1, y1, shieldCx, shieldCy, ships[s + 6]);
        for (const t of shieldRoots) {
          if (t == null) continue;
          const hx = x0 + (x1 - x0) * t - shieldCx;
          const hy = y0 + (y1 - y0) * t - shieldCy;
          const length = Math.hypot(hx, hy);
          const arcAccepted = length <= 1e-12 || ships[s + 7] <= -0.999999 || (hx * facingCos + hy * facingSin) / length >= ships[s + 7];
          if (arcAccepted) {
            if (t < bestT) {
              bestT = t;
              bestTarget = shipIndex;
              bestType = COLLISION_SHIELD;
            }
            break;
          }
        }
      }

      const outlineId = ships[s + 5] | 0;
      const startVertex = meta[outlineId * 2] | 0;
      const vertexCount = meta[outlineId * 2 + 1] | 0;
      const relX0 = x0 - cx;
      const relY0 = y0 - cy;
      const relX1 = x1 - cx;
      const relY1 = y1 - cy;
      const localX0 = relX0 * facingCos + relY0 * facingSin;
      const localY0 = -relX0 * facingSin + relY0 * facingCos;
      const localX1 = relX1 * facingCos + relY1 * facingSin;
      const localY1 = -relX1 * facingSin + relY1 * facingCos;
      const hullT = segmentPolygonHitTPacked(localX0, localY0, localX1, localY1, outlines, startVertex, vertexCount);
      if (hullT != null && hullT < bestT) {
        bestT = hullT;
        bestTarget = shipIndex;
        bestType = COLLISION_HULL;
      }
    }

    const o = p * OUTPUT_STRIDE;
    if (bestTarget >= 0) {
      output[o] = bestTarget;
      output[o + 1] = bestT;
      output[o + 2] = x0 + (x1 - x0) * bestT;
      output[o + 3] = y0 + (y1 - y0) * bestT;
      output[o + 4] = bestType;
      hits++;
    } else {
      output[o] = -1;
      output[o + 1] = 1;
      output[o + 2] = x1;
      output[o + 3] = y1;
      output[o + 4] = COLLISION_NONE;
    }
  }
  return { hits, output };
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}

function stats(samples) {
  if (samples.length === 0) {
    return { meanMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0, over8_33Ms: 0, over16_67Ms: 0 };
  }
  return {
    meanMs: samples.reduce((a, b) => a + b, 0) / samples.length,
    p95Ms: percentile(samples, 0.95),
    p99Ms: percentile(samples, 0.99),
    maxMs: Math.max(...samples),
    over8_33Ms: samples.filter((sample) => sample > 8.33).length,
    over16_67Ms: samples.filter((sample) => sample > 16.67).length
  };
}

function zeroStats() {
  return { meanMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0, over8_33Ms: 0, over16_67Ms: 0 };
}

function assertEquivalent(name, expected, actual, epsilon = 1e-8) {
  if (expected.hits !== actual.hits) {
    throw new Error(`${name}: hit count mismatch ${expected.hits} vs ${actual.hits}`);
  }
  if (expected.output.length !== actual.output.length) {
    throw new Error(`${name}: output length mismatch`);
  }
  for (let i = 0; i < expected.output.length; i++) {
    const a = expected.output[i];
    const b = actual.output[i];
    if (Math.abs(a - b) > epsilon) {
      throw new Error(`${name}: output mismatch at ${i}: ${a} vs ${b}`);
    }
  }
}

async function loadWasmPilot() {
  if (!existsSync(WASM_PATH)) return null;
  const initializationStart = performance.now();
  const bytes = await readFile(WASM_PATH);
  const readEnd = performance.now();
  const module = await WebAssembly.compile(bytes);
  const compileEnd = performance.now();
  const instance = await WebAssembly.instantiate(module, {});
  const instantiateEnd = performance.now();
  const {
    memory,
    alloc_bytes: allocBytes,
    dealloc_bytes: deallocBytes,
    batch_nearest_hits: batchNearestHits
  } = instance.exports;
  if (!(memory instanceof WebAssembly.Memory) || typeof allocBytes !== 'function' || typeof deallocBytes !== 'function' || typeof batchNearestHits !== 'function') {
    throw new Error('Wasm pilot is missing required exports');
  }
  return {
    memory,
    allocBytes,
    deallocBytes,
    batchNearestHits,
    initialization: {
      moduleBytes: bytes.byteLength,
      fileReadMs: readEnd - initializationStart,
      compileMs: compileEnd - readEnd,
      instantiateMs: instantiateEnd - compileEnd,
      totalMs: instantiateEnd - initializationStart
    }
  };
}

function createWasmStatic(pilot, staticData) {
  const outlinesBytes = staticData.outlines.byteLength;
  const metaBytes = staticData.meta.byteLength;
  const outlinesPtr = pilot.allocBytes(outlinesBytes);
  const metaPtr = pilot.allocBytes(metaBytes);
  if (!outlinesPtr || !metaPtr) throw new Error('Wasm static outline allocation failed');
  const start = performance.now();
  new Float64Array(pilot.memory.buffer, outlinesPtr, staticData.outlines.length).set(staticData.outlines);
  new Float64Array(pilot.memory.buffer, metaPtr, staticData.meta.length).set(staticData.meta);
  const end = performance.now();
  return {
    outlinesPtr,
    metaPtr,
    outlineCount: staticData.meta.length / 2,
    staticBytes: outlinesBytes + metaBytes,
    uploadMs: end - start,
    dispose() {
      pilot.deallocBytes(outlinesPtr, outlinesBytes);
      pilot.deallocBytes(metaPtr, metaBytes);
    }
  };
}

function createWasmScenario(pilot, shipCount, projectileCount) {
  const shipBytes = shipCount * SHIP_STRIDE * Float64Array.BYTES_PER_ELEMENT;
  const projectileBytes = projectileCount * PROJECTILE_STRIDE * Float64Array.BYTES_PER_ELEMENT;
  const outputBytes = projectileCount * OUTPUT_STRIDE * Float64Array.BYTES_PER_ELEMENT;
  const shipsPtr = pilot.allocBytes(shipBytes);
  const projectilesPtr = pilot.allocBytes(projectileBytes);
  const outputPtr = pilot.allocBytes(outputBytes);
  if (!shipsPtr || !projectilesPtr || !outputPtr) throw new Error('Wasm dynamic allocation failed');
  return {
    shipsPtr,
    projectilesPtr,
    outputPtr,
    shipBytes,
    projectileBytes,
    outputBytes,
    dispose() {
      pilot.deallocBytes(shipsPtr, shipBytes);
      pilot.deallocBytes(projectilesPtr, projectileBytes);
      pilot.deallocBytes(outputPtr, outputBytes);
    }
  };
}

function runWasm(pilot, staticBuffers, buffers, typed, shipCount, projectileCount) {
  const start = performance.now();
  new Float64Array(pilot.memory.buffer, buffers.shipsPtr, typed.ships.length).set(typed.ships);
  new Float64Array(pilot.memory.buffer, buffers.projectilesPtr, typed.projectiles.length).set(typed.projectiles);
  const transferEnd = performance.now();
  const hits = pilot.batchNearestHits(
    staticBuffers.outlinesPtr,
    staticBuffers.metaPtr,
    staticBuffers.outlineCount,
    buffers.shipsPtr,
    shipCount,
    buffers.projectilesPtr,
    projectileCount,
    buffers.outputPtr
  );
  const computeEnd = performance.now();
  const output = Float64Array.from(new Float64Array(pilot.memory.buffer, buffers.outputPtr, projectileCount * OUTPUT_STRIDE));
  const readEnd = performance.now();
  return {
    hits,
    output,
    boundaryTransferMs: transferEnd - start,
    computeMs: computeEnd - transferEnd,
    resultReadMs: readEnd - computeEnd
  };
}

function runCorrectnessCases(pilot, staticBuffers, staticData) {
  const square = staticData.squareProfile;
  const projectile = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 });
  const cases = [
    {
      name: 'high-speed-crossing',
      objects: { ships: [createShip(square, 0, 0, 0, false)], projectiles: [projectile(-100, 0, 100, 0)] },
      expectedType: COLLISION_HULL
    },
    {
      name: 'grazing-edge',
      objects: { ships: [createShip(square, 0, 0, 0, false)], projectiles: [projectile(-10, 1, 10, 1)] },
      expectedType: COLLISION_HULL
    },
    {
      name: 'starts-overlapping',
      objects: { ships: [createShip(square, 0, 0, 0, false)], projectiles: [projectile(0, 0, 30, 0)] },
      expectedType: COLLISION_HULL
    },
    {
      name: 'overlapping-targets-nearest',
      objects: {
        ships: [createShip(square, 5, 0, 0, false), createShip(square, 9, 0, 0, false)],
        projectiles: [projectile(0, 0, 20, 0)]
      },
      expectedType: COLLISION_HULL
    },
    {
      name: 'shield-before-hull',
      objects: { ships: [createShip(square, 0, 0, 0, true)], projectiles: [projectile(-10, 0, 10, 0)] },
      expectedType: COLLISION_SHIELD
    }
  ];

  return cases.map((testCase) => {
    const expected = baseline(testCase.objects);
    const typed = prepareTyped(testCase.objects);
    const ts = optimized(typed, staticData);
    assertEquivalent(`${testCase.name}/optimizedTs`, expected, ts);
    if (expected.output[0] !== 0 || expected.output[4] !== testCase.expectedType) {
      throw new Error(`${testCase.name}: unexpected target/type ${expected.output[0]}/${expected.output[4]}`);
    }
    if (pilot) {
      const buffers = createWasmScenario(pilot, testCase.objects.ships.length, testCase.objects.projectiles.length);
      try {
        const wasmResult = runWasm(pilot, staticBuffers, buffers, typed, testCase.objects.ships.length, testCase.objects.projectiles.length);
        assertEquivalent(`${testCase.name}/wasm`, expected, wasmResult);
      } finally {
        buffers.dispose();
      }
    }
    return {
      name: testCase.name,
      passed: true,
      target: expected.output[0],
      t: expected.output[1],
      collisionType: expected.output[4]
    };
  });
}

const realProfiles = await loadHullProfiles();
const staticData = makeStaticOutlineData(realProfiles);
const wasmPilot = await loadWasmPilot();
const wasmStatic = wasmPilot ? createWasmStatic(wasmPilot, staticData) : null;
if (wasmPilot && wasmStatic) {
  wasmPilot.initialization.staticOutlineBytes = wasmStatic.staticBytes;
  wasmPilot.initialization.staticOutlineUploadMs = wasmStatic.uploadMs;
}
const correctnessCases = runCorrectnessCases(wasmPilot, wasmStatic, staticData);

const output = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  samples: SAMPLES,
  warmupSamples: WARMUP_SAMPLES,
  algorithm: 'circle broadphase + rotated project hull polygon + shield geometry + nearest in-step hit',
  hullProfiles: realProfiles.map((profile) => ({
    id: profile.name,
    vertices: profile.bounds.length,
    collisionRadius: profile.collisionRadius,
    shieldRadius: profile.shieldRadius,
    shieldArcDeg: profile.shieldArcDeg
  })),
  wasm: wasmPilot
    ? { status: 'measured', adopted: false, runtimeIntegrated: false, initialization: wasmPilot.initialization }
    : { status: 'unavailable', reason: `No compiled pilot at ${WASM_PATH}`, adopted: false, runtimeIntegrated: false },
  correctnessCases,
  scenarios: []
};

try {
  for (const scenario of scenarios) {
    const objects = makeObjects(scenario.ships, scenario.projectiles, staticData.realProfiles);
    const reference = baseline(objects);

    for (let i = 0; i < WARMUP_SAMPLES; i++) {
      baseline(objects);
      optimized(prepareTyped(objects), staticData);
    }

    const baselineCompute = [];
    const baselineTotal = [];
    const optimizedPrep = [];
    const optimizedCompute = [];
    const optimizedTotal = [];
    const wasmPrep = [];
    const wasmTransfer = [];
    const wasmCompute = [];
    const wasmRead = [];
    const wasmTotal = [];
    const memoryBefore = process.memoryUsage();

    let wasmBuffers = null;
    if (wasmPilot && wasmStatic) {
      wasmBuffers = createWasmScenario(wasmPilot, scenario.ships, scenario.projectiles);
      for (let i = 0; i < WARMUP_SAMPLES; i++) {
        const typed = prepareTyped(objects);
        const warm = runWasm(wasmPilot, wasmStatic, wasmBuffers, typed, scenario.ships, scenario.projectiles);
        assertEquivalent(`${scenario.name}/wasm-warmup`, reference, warm);
      }
    }

    try {
      for (let sample = 0; sample < SAMPLES; sample++) {
        let start = performance.now();
        const baselineResult = baseline(objects);
        let end = performance.now();
        baselineCompute.push(end - start);
        baselineTotal.push(end - start);
        if (sample === 0) assertEquivalent(`${scenario.name}/baseline`, reference, baselineResult);

        start = performance.now();
        const typedForTs = prepareTyped(objects);
        const prepared = performance.now();
        const optimizedResult = optimized(typedForTs, staticData);
        end = performance.now();
        optimizedPrep.push(prepared - start);
        optimizedCompute.push(end - prepared);
        optimizedTotal.push(end - start);
        if (sample === 0) assertEquivalent(`${scenario.name}/optimizedTs`, reference, optimizedResult);

        if (wasmPilot && wasmStatic && wasmBuffers) {
          start = performance.now();
          const typedForWasm = prepareTyped(objects);
          const wasmPrepared = performance.now();
          const wasmResult = runWasm(wasmPilot, wasmStatic, wasmBuffers, typedForWasm, scenario.ships, scenario.projectiles);
          end = performance.now();
          wasmPrep.push(wasmPrepared - start);
          wasmTransfer.push(wasmResult.boundaryTransferMs);
          wasmCompute.push(wasmResult.computeMs);
          wasmRead.push(wasmResult.resultReadMs);
          wasmTotal.push(end - start);
          if (sample === 0) assertEquivalent(`${scenario.name}/wasm`, reference, wasmResult);
        }
      }
    } finally {
      wasmBuffers?.dispose();
    }

    const memoryAfter = process.memoryUsage();
    output.scenarios.push({
      ...scenario,
      hits: reference.hits,
      baseline: {
        preparation: zeroStats(),
        boundaryTransfer: zeroStats(),
        compute: stats(baselineCompute),
        resultRead: zeroStats(),
        total: stats(baselineTotal)
      },
      optimizedTs: {
        preparation: stats(optimizedPrep),
        boundaryTransfer: zeroStats(),
        compute: stats(optimizedCompute),
        resultRead: zeroStats(),
        total: stats(optimizedTotal)
      },
      wasm: wasmPilot ? {
        preparation: stats(wasmPrep),
        boundaryTransfer: stats(wasmTransfer),
        compute: stats(wasmCompute),
        resultRead: stats(wasmRead),
        total: stats(wasmTotal),
        linearMemoryBytes: wasmPilot.memory.buffer.byteLength
      } : null,
      memory: {
        heapDeltaBytes: memoryAfter.heapUsed - memoryBefore.heapUsed,
        externalDeltaBytes: memoryAfter.external - memoryBefore.external,
        arrayBuffersDeltaBytes: memoryAfter.arrayBuffers - memoryBefore.arrayBuffers
      }
    });
  }
} finally {
  wasmStatic?.dispose();
}

if (wasmPilot) {
  const medium = output.scenarios.find((scenario) => scenario.name === 'medium');
  const large = output.scenarios.find((scenario) => scenario.name === 'large');
  const fastestTs = (scenario) => scenario.baseline.total.meanMs <= scenario.optimizedTs.total.meanMs
    ? { name: 'baseline', meanMs: scenario.baseline.total.meanMs }
    : { name: 'optimizedTs', meanMs: scenario.optimizedTs.total.meanMs };
  const mediumTs = fastestTs(medium);
  const largeTs = fastestTs(large);
  const mediumRatio = medium.wasm.total.meanMs / mediumTs.meanMs;
  const largeRatio = large.wasm.total.meanMs / largeTs.meanMs;
  const clearlyFaster = largeRatio <= 0.8 && mediumRatio <= 0.9;
  output.wasm.adopted = clearlyFaster;
  output.wasm.runtimeIntegrated = false;
  output.wasm.decision = clearlyFaster ? 'adopt-for-runtime-integration' : 'keep-typescript';
  output.wasm.comparison = {
    mediumFastestTs: mediumTs.name,
    mediumWasmToFastestTsRatio: mediumRatio,
    largeFastestTs: largeTs.name,
    largeWasmToFastestTsRatio: largeRatio,
    largeWasmP95Ms: large.wasm.total.p95Ms,
    largeWasmOver16_67Ms: large.wasm.total.over16_67Ms,
    threshold: { medium: 0.9, large: 0.8 }
  };
  output.wasm.reason = clearlyFaster
    ? `Pilot adoption threshold passed: end-to-end Wasm is ${(mediumRatio * 100).toFixed(1)}% of the fastest TS path at medium load and ${(largeRatio * 100).toFixed(1)}% at large load. Runtime integration remains outside this isolated pilot; the large-load P95 is ${large.wasm.total.p95Ms.toFixed(2)} ms, so spatial candidate reduction is still required for frame-budget safety.`
    : `Do not adopt: end-to-end Wasm did not clear the pilot threshold against the fastest TS path (${(mediumRatio * 100).toFixed(1)}% at medium load, ${(largeRatio * 100).toFixed(1)}% at large load).`;
}

await mkdir('benchmarks', { recursive: true });
await writeFile('benchmarks/collision-results.json', JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(output, null, 2));
