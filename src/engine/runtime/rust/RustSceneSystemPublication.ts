/** Complete native dynamic facts. This decoder only validates and copies data. */
import { Vector2 } from '../../math/Vector2';
import type { GravityTarget, GravityTractorState } from '../../simulation/GravityTractorState';
import type { GravityFieldState } from '../../simulation/GravityFieldState';
import type { GravityPushState } from '../../simulation/GravityPushState';
import type { RustPresentationShipFact, RustPresentationSystemFact, RustPresentationWeaponFact } from './RustCombatPresentationFacts';
export type RustSceneSystemRead = Pick<RustPresentationSystemFact, 'systemId' | 'isActive' | 'activationFailureReason' | 'statusText' | 'passiveStatusText'
  | 'fortressVisualLevel' | 'pulseOffset' | 'gravityControlHeld' | 'gravityPolarity' | 'gravityField' | 'gravityPush' | 'gravityManeuver' | 'teleportVisual'> & { readonly id: number; readonly available: boolean };
export type RustSceneMountDynamicRead = Pick<RustPresentationWeaponFact, 'componentId' | 'presentationRelativeAngle' | 'gravityTractor' | 'gravityDeflection'> & { readonly id: number };
export type RustSceneShipDynamicRead = Pick<RustPresentationShipFact, 'id' | 'presentationPose' | 'teleportCameraOffset'>;
export interface RustSceneSystemPublication { readonly systems: readonly RustSceneSystemRead[]; readonly mounts: readonly RustSceneMountDynamicRead[]; readonly ships: readonly RustSceneShipDynamicRead[] }
class Reader {
  private at = 0;
  constructor(readonly values: Float64Array) {}
  number(): number { const n = this.values[this.at++]; if (!Number.isFinite(n)) throw Error('Truncated/nonfinite Rust system fact'); return n; }
  integer(max = Number.MAX_SAFE_INTEGER): number { const n = this.number(); if (!Number.isSafeInteger(n) || n < 0 || n > max) throw Error('Invalid Rust system fact integer'); return n; }
  flag(): boolean { return this.integer(1) === 1; }
  optional(): number | undefined { return this.flag() ? this.number() : undefined; }
  optionalFlag(): boolean | undefined { return this.flag() ? this.flag() : undefined; }
  polarity(): 1 | -1 | undefined { const n = this.optional(); if (n === undefined || n === 1 || n === -1) return n as 1 | -1 | undefined; throw Error('Invalid Rust polarity'); }
  point(): [number, number] { return [this.number(), this.number()]; }
  count(): number { const n = this.integer(); if (n > this.values.length - this.at) throw Error('Rust system count exceeds data'); return n; }
  string(): string { const n = this.count(); let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(this.integer(65535)); return s; }
  optionalString(): string | undefined { return this.flag() ? this.string() : undefined; }
  target(): GravityTarget { const kind = (['SHIP', 'PROJECTILE', 'ASTEROID', 'HULK'] as const)[this.integer(3)]; return kind === 'SHIP' ? { kind, id: this.string() } : { kind, id: this.number() }; }
  optionalTarget(): GravityTarget | undefined { return this.flag() ? this.target() : undefined; }
  record(): Float64Array { const n = this.count(), v = this.values.subarray(this.at, this.at + n); this.at += n; return v; }
  finish(): void { if (this.at !== this.values.length) throw Error('Trailing Rust system facts'); }
}
function field(r: Reader): GravityFieldState {
  const kind = (['WELL', 'REPULSOR', 'COLLAPSE'] as const)[r.integer(2)], serial = r.optional(), polarity = r.polarity(), cursorControlled = r.optionalFlag(), lingerRemaining = r.optional();
  const [x, y] = r.point(), age = r.number(), radius = r.number(), shipBudgetRemaining = r.number(), projectileBudgetRemaining = r.number(), duration = r.optional(), environmentBudgetRemaining = r.optional(), collapseApplied = r.optionalFlag();
  const shipHits = Array.from({ length: r.count() }, () => r.string()), projectileHits = Array.from({ length: r.count() }, () => r.number());
  const environmentHits = r.flag() ? Array.from({ length: r.count() }, () => r.string()) : undefined;
  const releaseTargets = r.flag() ? Array.from({ length: r.count() }, () => r.target()) : undefined;
  return { kind, ...(serial !== undefined ? { serial } : {}), ...(polarity !== undefined ? { polarity } : {}), ...(cursorControlled !== undefined ? { cursorControlled } : {}), ...(lingerRemaining !== undefined ? { lingerRemaining } : {}),
    x, y, age, radius, shipBudgetRemaining, projectileBudgetRemaining, ...(duration !== undefined ? { duration } : {}), ...(environmentBudgetRemaining !== undefined ? { environmentBudgetRemaining } : {}), ...(collapseApplied !== undefined ? { collapseApplied } : {}),
    shipHits, projectileHits, ...(environmentHits !== undefined ? { environmentHits } : {}), ...(releaseTargets !== undefined ? { releaseTargets } : {}) };
}
function push(r: Reader): GravityPushState { const target = r.optionalTarget(), [x, y] = r.point(), radius = r.number(), [dx, dy] = r.point(), age = r.number(), status = r.string(); return { ...(target ? { target } : {}), x, y, radius, dx, dy, age, status }; }
function tractor(r: Reader): GravityTractorState {
  const phase = (['IDLE', 'CAPTURE', 'HOLD'] as const)[r.integer(2)], polarity = r.polarity(), target = r.optionalTarget(), capture = r.number(), age = r.number(), [anchorX, anchorY] = r.point(), [contactX, contactY] = r.point(), targetRadius = r.optional(), waitRelease = r.flag(), status = r.string(), damageClock = r.optional();
  return { phase, ...(polarity !== undefined ? { polarity } : {}), ...(target ? { target } : {}), capture, age, anchorX, anchorY, contactX, contactY, ...(targetRadius !== undefined ? { targetRadius } : {}), waitRelease, status, ...(damageClock !== undefined ? { damageClock } : {}) };
}
export function decodeRustSceneSystemPublication(data: Float64Array, detached=false): RustSceneSystemPublication {
  const block = new Reader(detached?data:data.slice()); if (block.integer() !== 1) throw Error('Rust system read version differs'); const count = block.count();
  const systems: RustSceneSystemRead[] = [], mounts: RustSceneMountDynamicRead[] = [], ships: RustSceneShipDynamicRead[] = [], seen = new Set<string>();
  for (let i = 0; i < count; i++) {
    const tag = block.integer(3), r = new Reader(block.record()), id = r.integer(0xffffffff); if (!id) throw Error('Invalid Rust system read body');
    if (tag === 1) {
      const systemId = r.integer(0xffffffff), isActive = r.flag(), available = r.flag(), activationFailureReason = r.optionalString(), statusText = r.optionalString(), passiveStatusText = r.optionalString(), fortressVisualLevel = r.number(), pulseOffset = r.number(), gravityControlHeld = r.flag(), gravityPolarity = r.polarity();
      const gravityField = r.flag() ? field(r) : undefined, gravityPush = r.flag() ? push(r) : undefined;
      const gravityManeuver = r.flag() ? { targetAngle: r.number(), age: r.number(), turnRemaining: r.number() } : undefined;
      let teleportVisual: RustSceneSystemRead['teleportVisual'];
      if (r.flag()) { const serial = r.number(), destination = new Vector2(...r.point()), destinationFacing = r.number(), origin = r.flag() ? new Vector2(...r.point()) : undefined, originFacing = r.optional(); teleportVisual = { serial, destination, destinationFacing, ...(origin ? { origin } : {}), ...(originFacing !== undefined ? { originFacing } : {}) }; }
      const key = `s:${id}:${systemId}`; if (!systemId || seen.has(key)) throw Error('Duplicate/invalid Rust system read'); seen.add(key);
      systems.push({ id, systemId, isActive, available, activationFailureReason, statusText, passiveStatusText, fortressVisualLevel, pulseOffset, gravityControlHeld, gravityPolarity, gravityField, gravityPush, gravityManeuver, teleportVisual });
    } else if (tag === 2) {
      const componentId = r.integer(0xffffffff), presentationRelativeAngle = r.optional(), gravityTractor = r.flag() ? tractor(r) : undefined;
      const gravityDeflection = r.flag() ? { x: r.number(), y: r.number(), age: r.number() } : undefined;
      const key = `m:${id}:${componentId}`; if (!componentId || seen.has(key)) throw Error('Duplicate/invalid Rust mount read'); seen.add(key);
      mounts.push({ id, componentId, presentationRelativeAngle, gravityTractor, gravityDeflection });
    } else if (tag === 3) {
      const presentationPose = r.flag() ? { position: r.point(), facing: r.number() } : undefined;
      if (!r.flag()) throw Error('Missing admitted Rust teleport camera offset'); const teleportCameraOffset = new Vector2(...r.point());
      const key = `b:${id}`; if (seen.has(key)) throw Error('Duplicate Rust ship dynamic read'); seen.add(key); ships.push({ id, presentationPose, teleportCameraOffset });
    } else throw Error('Unknown Rust system fact');
    r.finish();
  }
  block.finish(); const bodyIds = new Set(ships.map(s => s.id)); if ([...systems, ...mounts].some(s => !bodyIds.has(s.id))) throw Error('Rust dynamic read references absent body');
  return { systems, mounts, ships };
}
