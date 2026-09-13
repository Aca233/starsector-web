import { intersectSegmentWithPolygon, isPointInPolygon } from '../../math/Geometry';
import { Vector2 } from '../../math/Vector2';
import type { Ship } from '../Ship';
import type { Projectile } from '../Weapon';

const SHIP_STRIDE = 13;
const PROJECTILE_STRIDE = 4;
const OUTPUT_STRIDE = 5;
const COLLISION_SHIELD = 2;

export type RuntimeCollisionBackend = 'typescript' | 'wasm';
export type RuntimeCollisionKind = 'HULL' | 'SHIELD';

export interface RuntimeCollisionQuery {
  projectile: Projectile;
  candidates: Ship[];
}

export interface RuntimeCollisionHit {
  projectile: Projectile;
  ship: Ship;
  kind: RuntimeCollisionKind;
  t: number;
  worldPoint: Vector2;
  localPoint: Vector2;
}

export interface RuntimeCollisionBatchStats {
  backend: RuntimeCollisionBackend;
  projectileCount: number;
  candidatePairs: number;
  maxCandidatesPerProjectile: number;
}

interface WasmExports {
  memory: WebAssembly.Memory;
  alloc_bytes: (len: number) => number;
  dealloc_bytes: (ptr: number, len: number) => void;
  batch_nearest_hits_indexed: (
    outlinesPtr: number,
    outlineMetaPtr: number,
    outlineCount: number,
    shipsPtr: number,
    shipCount: number,
    projectilesPtr: number,
    projectileCount: number,
    candidateOffsetsPtr: number,
    candidateIndicesPtr: number,
    candidateCount: number,
    outputPtr: number
  ) => number;
}

type WasmState = 'idle' | 'loading' | 'ready' | 'failed';
interface WasmBuffer {
  ptr: number;
  capacity: number;
}

/**
 * Exact swept projectile collision kernel.
 *
 * TypeScript remains authoritative for combat state and damage. When the
 * bundled Wasm module is ready, this class only delegates packed geometry
 * queries and converts the result back into Ship/Projectile references.
 * Any load/runtime/shape failure fails closed to the deterministic TS path.
 */
export class RuntimeCollisionKernel {
  private static readonly MIN_WASM_BATCH = 8;
  private wasm: WasmExports | null = null;
  private wasmState: WasmState = 'idle';
  private readonly wasmUrl: string;
  private readonly wasmBuffers = new Map<string, WasmBuffer>();

  public lastBatchStats: RuntimeCollisionBatchStats = {
    backend: 'typescript',
    projectileCount: 0,
    candidatePairs: 0,
    maxCandidatesPerProjectile: 0
  };

  constructor(wasmUrl = '/runtime/collision_core.wasm', autoLoad = true) {
    this.wasmUrl = wasmUrl;
    if (autoLoad && typeof window !== 'undefined' && typeof fetch === 'function' && typeof WebAssembly !== 'undefined') {
      void this.loadWasm();
    }
  }

  public get backendState(): WasmState {
    return this.wasmState;
  }

  public async loadWasm(): Promise<boolean> {
    if (this.wasmState === 'ready') return true;
    if (this.wasmState === 'loading') return false;
    this.wasmState = 'loading';
    try {
      const response = await fetch(this.wasmUrl, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`Wasm collision kernel HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      const instantiated = await WebAssembly.instantiate(bytes, {});
      const exports = instantiated.instance.exports as unknown as Partial<WasmExports>;
      if (
        !(exports.memory instanceof WebAssembly.Memory) ||
        typeof exports.alloc_bytes !== 'function' ||
        typeof exports.dealloc_bytes !== 'function' ||
        typeof exports.batch_nearest_hits_indexed !== 'function'
      ) {
        throw new Error('Wasm collision kernel exports are incomplete');
      }
      if (this.wasm) this.releaseWasmBuffers(this.wasm);
      this.wasm = exports as WasmExports;
      this.wasmState = 'ready';
      return true;
    } catch {
      this.wasm = null;
      this.wasmState = 'failed';
      return false;
    }
  }

  public findHits(queries: RuntimeCollisionQuery[]): Array<RuntimeCollisionHit | null> {
    const candidatePairs = queries.reduce((sum, query) => sum + query.candidates.length, 0);
    const maxCandidatesPerProjectile = queries.reduce((max, query) => Math.max(max, query.candidates.length), 0);

    if (queries.length === 0) {
      this.lastBatchStats = { backend: 'typescript', projectileCount: 0, candidatePairs: 0, maxCandidatesPerProjectile: 0 };
      return [];
    }

    if (
      queries.length >= RuntimeCollisionKernel.MIN_WASM_BATCH &&
      this.wasmState === 'ready' &&
      this.wasm &&
      this.canUseWasm(queries)
    ) {
      try {
        const hits = this.findHitsWasm(queries, this.wasm);
        this.lastBatchStats = { backend: 'wasm', projectileCount: queries.length, candidatePairs, maxCandidatesPerProjectile };
        return hits;
      } catch {
        this.releaseWasmBuffers(this.wasm);
        this.wasm = null;
        this.wasmState = 'failed';
      }
    }

    this.lastBatchStats = { backend: 'typescript', projectileCount: queries.length, candidatePairs, maxCandidatesPerProjectile };
    return queries.map((query) => this.findHitTypeScript(query));
  }

  public findHitTypeScript(query: RuntimeCollisionQuery): RuntimeCollisionHit | null {
    const { projectile } = query;
    let best: RuntimeCollisionHit | null = null;

    for (const ship of query.candidates) {
      const shieldHit = this.findShieldHit(projectile, ship);
      if (shieldHit && (!best || shieldHit.t < best.t)) best = shieldHit;

      const hullHit = this.findHullHit(projectile, ship);
      if (hullHit && (!best || hullHit.t < best.t)) best = hullHit;
    }

    return best;
  }

  private canUseWasm(queries: RuntimeCollisionQuery[]): boolean {
    for (const query of queries) {
      for (const ship of query.candidates) {
        if (!ship.spec.bounds || ship.spec.bounds.length < 3) return false;
      }
    }
    return true;
  }

  private findShieldHit(projectile: Projectile, ship: Ship): RuntimeCollisionHit | null {
    if (!ship.shield.isActive || ship.shield.currentArcDeg <= 5 || ship.shield.type === 'NONE' || ship.shield.type === 'PHASE') {
      return null;
    }

    const center = ship.getShieldCenter(ship.pos, ship.facingRad);
    const roots = this.circleRoots(projectile.prevPos, projectile.pos, center, ship.shield.radius * ship.shield.radius);
    const shieldFacing = ship.shield.type === 'FRONT' ? ship.facingRad : ship.shield.facingAngleRad;
    const halfArcCos = Math.cos((ship.shield.currentArcDeg * Math.PI) / 360);

    for (const t of roots) {
      if (t == null) continue;
      const point = Vector2.lerp(projectile.prevPos, projectile.pos, t);
      const radial = point.clone().sub(center);
      const length = radial.length();
      const accepted = length <= 1e-12 || halfArcCos <= -0.999999 ||
        (radial.x * Math.cos(shieldFacing) + radial.y * Math.sin(shieldFacing)) / length >= halfArcCos;
      if (!accepted) continue;
      return {
        projectile,
        ship,
        kind: 'SHIELD',
        t,
        worldPoint: point,
        localPoint: point.clone().sub(ship.pos).rotate(-ship.facingRad)
      };
    }
    return null;
  }

  private findHullHit(projectile: Projectile, ship: Ship): RuntimeCollisionHit | null {
    const localStart = projectile.prevPos.clone().sub(ship.pos).rotate(-ship.facingRad);
    const localEnd = projectile.pos.clone().sub(ship.pos).rotate(-ship.facingRad);
    const bounds = ship.spec.bounds;

    if (!bounds || bounds.length < 3) {
      const roots = this.circleRoots(projectile.prevPos, projectile.pos, ship.pos, ship.spec.collisionRadius * ship.spec.collisionRadius);
      const t = roots.find((root) => root != null) ?? null;
      if (t == null) return null;
      const worldPoint = Vector2.lerp(projectile.prevPos, projectile.pos, t);
      return { projectile, ship, kind: 'HULL', t, worldPoint, localPoint: worldPoint.clone().sub(ship.pos).rotate(-ship.facingRad) };
    }

    if (isPointInPolygon(localStart, bounds)) {
      return {
        projectile,
        ship,
        kind: 'HULL',
        t: 0,
        worldPoint: projectile.prevPos.clone(),
        localPoint: localStart
      };
    }

    const hit = intersectSegmentWithPolygon(localStart, localEnd, bounds);
    if (!hit) return null;
    return {
      projectile,
      ship,
      kind: 'HULL',
      t: hit.t,
      worldPoint: Vector2.lerp(projectile.prevPos, projectile.pos, hit.t),
      localPoint: hit.point
    };
  }

  private circleRoots(start: Vector2, end: Vector2, center: Vector2, radiusSquared: number): Array<number | null> {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const fx = start.x - center.x;
    const fy = start.y - center.y;
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
    return [
      t0 >= 0 && t0 <= 1 ? t0 : null,
      t1 >= 0 && t1 <= 1 ? t1 : null
    ];
  }

  private ensureWasmBuffer(wasm: WasmExports, key: string, bytes: number): number {
    if (bytes <= 0) return 0;
    const existing = this.wasmBuffers.get(key);
    if (existing && existing.capacity >= bytes) return existing.ptr;
    if (existing) wasm.dealloc_bytes(existing.ptr, existing.capacity);
    const ptr = wasm.alloc_bytes(bytes);
    if (!ptr) {
      this.wasmBuffers.delete(key);
      throw new Error(`Wasm collision allocation failed for ${key}`);
    }
    this.wasmBuffers.set(key, { ptr, capacity: bytes });
    return ptr;
  }

  private releaseWasmBuffers(wasm: WasmExports): void {
    try {
      for (const buffer of this.wasmBuffers.values()) {
        if (buffer.ptr && buffer.capacity > 0) wasm.dealloc_bytes(buffer.ptr, buffer.capacity);
      }
    } catch {
      // A trapped/invalid module is being abandoned anyway; the TS fallback
      // remains authoritative and the whole Wasm instance becomes collectible.
    }
    this.wasmBuffers.clear();
  }

  private findHitsWasm(queries: RuntimeCollisionQuery[], wasm: WasmExports): Array<RuntimeCollisionHit | null> {
    const ships: Ship[] = [];
    const shipIndex = new Map<Ship, number>();
    for (const query of queries) {
      for (const ship of query.candidates) {
        if (!shipIndex.has(ship)) {
          shipIndex.set(ship, ships.length);
          ships.push(ship);
        }
      }
    }
    if (ships.length === 0) return queries.map(() => null);

    const outlineIds = new Map<object, number>();
    const outlineMetaValues: number[] = [];
    const outlineValues: number[] = [];
    for (const ship of ships) {
      const specKey = ship.spec as object;
      if (outlineIds.has(specKey)) continue;
      const outlineId = outlineMetaValues.length / 2;
      outlineIds.set(specKey, outlineId);
      outlineMetaValues.push(outlineValues.length / 2, ship.spec.bounds.length);
      for (const [x, y] of ship.spec.bounds) outlineValues.push(x, y);
    }

    const packedShips = new Float64Array(ships.length * SHIP_STRIDE);
    ships.forEach((ship, index) => {
      const base = index * SHIP_STRIDE;
      const hullCos = Math.cos(ship.facingRad);
      const hullSin = Math.sin(ship.facingRad);
      const shieldFacing = ship.shield.type === 'FRONT' ? ship.facingRad : ship.shield.facingAngleRad;
      packedShips[base] = ship.pos.x;
      packedShips[base + 1] = ship.pos.y;
      packedShips[base + 2] = hullCos;
      packedShips[base + 3] = hullSin;
      const hullExtent = ship.spec.bounds.reduce(
        (maxRadius, [x, y]) => Math.max(maxRadius, Math.hypot(x, y)),
        ship.spec.collisionRadius
      );
      const shieldExtent = Math.hypot(ship.spec.shieldCenterX ?? 0, ship.spec.shieldCenterY ?? 0) + ship.shield.radius;
      const broadphaseRadius = Math.max(hullExtent, shieldExtent);
      packedShips[base + 4] = broadphaseRadius * broadphaseRadius;
      packedShips[base + 5] = outlineIds.get(ship.spec as object) ?? 0;
      packedShips[base + 6] = ship.shield.radius * ship.shield.radius;
      packedShips[base + 7] = Math.cos((ship.shield.currentArcDeg * Math.PI) / 360);
      packedShips[base + 8] = ship.shield.isActive && ship.shield.currentArcDeg > 5 && ship.shield.type !== 'NONE' && ship.shield.type !== 'PHASE' ? 1 : 0;
      packedShips[base + 9] = ship.spec.shieldCenterX ?? 0;
      packedShips[base + 10] = ship.spec.shieldCenterY ?? 0;
      packedShips[base + 11] = Math.cos(shieldFacing);
      packedShips[base + 12] = Math.sin(shieldFacing);
    });

    const packedProjectiles = new Float64Array(queries.length * PROJECTILE_STRIDE);
    const candidateOffsets = new Float64Array(queries.length + 1);
    const candidateIndices = new Float64Array(queries.reduce((sum, query) => sum + query.candidates.length, 0));
    let candidateCursor = 0;
    queries.forEach((query, index) => {
      const base = index * PROJECTILE_STRIDE;
      packedProjectiles[base] = query.projectile.prevPos.x;
      packedProjectiles[base + 1] = query.projectile.prevPos.y;
      packedProjectiles[base + 2] = query.projectile.pos.x;
      packedProjectiles[base + 3] = query.projectile.pos.y;
      candidateOffsets[index] = candidateCursor;
      for (const ship of query.candidates) candidateIndices[candidateCursor++] = shipIndex.get(ship) ?? -1;
    });
    candidateOffsets[queries.length] = candidateCursor;

    const outlines = new Float64Array(outlineValues);
    const outlineMeta = new Float64Array(outlineMetaValues);
    const output = new Float64Array(queries.length * OUTPUT_STRIDE);
    const outlinesPtr = this.ensureWasmBuffer(wasm, 'outlines', outlines.byteLength);
    const metaPtr = this.ensureWasmBuffer(wasm, 'outlineMeta', outlineMeta.byteLength);
    const shipsPtr = this.ensureWasmBuffer(wasm, 'ships', packedShips.byteLength);
    const projectilesPtr = this.ensureWasmBuffer(wasm, 'projectiles', packedProjectiles.byteLength);
    const offsetsPtr = this.ensureWasmBuffer(wasm, 'candidateOffsets', candidateOffsets.byteLength);
    const candidatesPtr = this.ensureWasmBuffer(wasm, 'candidateIndices', candidateIndices.byteLength);
    const outputPtr = this.ensureWasmBuffer(wasm, 'output', output.byteLength);

    const memory = wasm.memory.buffer;
    new Float64Array(memory, outlinesPtr, outlines.length).set(outlines);
    new Float64Array(memory, metaPtr, outlineMeta.length).set(outlineMeta);
    new Float64Array(memory, shipsPtr, packedShips.length).set(packedShips);
    new Float64Array(memory, projectilesPtr, packedProjectiles.length).set(packedProjectiles);
    new Float64Array(memory, offsetsPtr, candidateOffsets.length).set(candidateOffsets);
    if (candidateIndices.length > 0) new Float64Array(memory, candidatesPtr, candidateIndices.length).set(candidateIndices);

    wasm.batch_nearest_hits_indexed(
      outlinesPtr,
      metaPtr,
      outlineMeta.length / 2,
      shipsPtr,
      ships.length,
      projectilesPtr,
      queries.length,
      offsetsPtr,
      candidatesPtr,
      candidateIndices.length,
      outputPtr
    );
    output.set(new Float64Array(wasm.memory.buffer, outputPtr, output.length));

    return queries.map((query, index) => {
      const base = index * OUTPUT_STRIDE;
      const targetIndex = output[base];
      if (targetIndex < 0 || targetIndex >= ships.length) return null;
      const ship = ships[targetIndex];
      const t = output[base + 1];
      const worldPoint = new Vector2(output[base + 2], output[base + 3]);
      return {
        projectile: query.projectile,
        ship,
        kind: output[base + 4] === COLLISION_SHIELD ? 'SHIELD' : 'HULL',
        t,
        worldPoint,
        localPoint: worldPoint.clone().sub(ship.pos).rotate(-ship.facingRad)
      };
    });
  }
}
