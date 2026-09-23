import type { Beam } from '../simulation/Weapon';
import { nativeGetShieldCenter, nativeGetMotionStats, nativeFireControlPrototypes, type Ship } from '../simulation/Ship';
import type { Vector2 } from '../math/Vector2';

interface Bounds { minX: number; minY: number; maxX: number; maxY: number }
interface Entry extends Bounds { order: number }
interface Branch extends Bounds { start: number; end: number; left: number; right: number }
const nativeFind = Array.prototype.find;
const nativeIterator = Array.prototype[Symbol.iterator];
const nativeMapValues = Map.prototype.values;

// Check descriptors, not values read through an extension getter. This gate only
// qualifies an already-audited native phase; it is not a persistent mutation cache.
function data(object: object, key: PropertyKey): PropertyDescriptor | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor && 'value' in descriptor ? descriptor : undefined;
}
function optionalScalar(object: object, key: string, type: string): boolean {
  const field = data(object, key);
  return field ? field.value === undefined || typeof field.value === type : !(key in object);
}
function nativeDamageReads(ship: Ship): boolean {
  const shield = data(ship, 'shield')?.value;
  if (!shield || typeof data(shield, 'efficiency')?.value !== 'number'
    || typeof data(shield, 'energyDamageTakenMultiplier')?.value !== 'number') return false;
  const modifiers = data(shield, 'damageTakenModifiers')?.value;
  if (!(modifiers instanceof Map) || Object.getPrototypeOf(modifiers) !== Map.prototype
    || Object.hasOwn(modifiers, 'values') || Object.getOwnPropertyDescriptor(Map.prototype, 'values')?.value !== nativeMapValues) return false;
  for (const value of modifiers.values()) if (typeof value !== 'number') return false;
  return true;
}
function numericPoint(value: unknown): value is Vector2 {
  return value !== null && typeof value === 'object'
    && typeof data(value, 'x')?.value === 'number' && typeof data(value, 'y')?.value === 'number';
}
function nativeArray(array: readonly unknown[]): boolean {
  return Object.getPrototypeOf(array) === Array.prototype && !Object.hasOwn(array, 'find')
    && !Object.hasOwn(array, Symbol.iterator) && Object.getOwnPropertyDescriptor(Array.prototype, 'find')?.value === nativeFind
    && Object.getOwnPropertyDescriptor(Array.prototype, Symbol.iterator)?.value === nativeIterator;
}

/** Immutable geometry broadphase for ONE synchronous native AI phase. Source,
 * allegiance and damage are intentionally not cached. close before any motion,
 * beam advance, emission or external callback; unknown readers use the old scan. */
export class BeamThreatIndex {
  private active = true;
  private readonly entries: Entry[] = [];
  private readonly branches: Branch[] = [];
  private readonly unbounded: number[] = [];
  private readonly beamCount: number;
  private readonly shipCount: number;

  public static create(ships: readonly Ship[], beams: readonly Beam[]): BeamThreatIndex | undefined {
    if (!nativeArray(ships) || !nativeArray(beams) || !nativeFireControlPrototypes()) return;
    for (let i = 0; i < ships.length; i++) {
      const ship = data(ships, String(i))?.value as Ship | undefined;
      if (!ship || typeof data(ship, 'id')?.value !== 'string'
        || typeof data(ship, 'teamId')?.value !== 'number' || typeof data(ship, 'isDead')?.value !== 'boolean'
        || !data(ship, 'spec') || !data(ship, 'shield') || !data(ship, 'pos')
        || ship.getShieldCenter !== nativeGetShieldCenter || ship.getMotionStats !== nativeGetMotionStats
        || !ship.hasNativeThreatPhaseHooks || !nativeDamageReads(ship)) return;
    }
    for (let i = 0; i < beams.length; i++) {
      const beam = data(beams, String(i))?.value as Beam | undefined;
      if (!beam || typeof data(beam, 'sourceShipId')?.value !== 'string'
        || typeof data(beam, 'duration')?.value !== 'number' || !optionalScalar(beam, 'damageActive', 'boolean')
        || !optionalScalar(beam, 'slotId', 'string') || typeof data(beam, 'damagePerSec')?.value !== 'number' || typeof data(beam, 'damageType')?.value !== 'string'
        || !numericPoint(data(beam, 'startPos')?.value) || !numericPoint(data(beam, 'endPos')?.value)) return;
    }
    return new BeamThreatIndex(ships, beams);
  }

  private constructor(private readonly ships: readonly Ship[], private readonly beams: readonly Beam[]) {
    this.beamCount = beams.length; this.shipCount = ships.length;
    for (let order = 0; order < beams.length; order++) {
      const { startPos: a, endPos: b } = beams[order];
      const scale = Math.max(1, Math.abs(a.x), Math.abs(a.y), Math.abs(b.x), Math.abs(b.y));
      // Beyond this scale the original quadratic's fourth-order intermediates
      // may overflow. Never certify exclusion with an uncertain numeric bound.
      if (!Number.isFinite(scale) || scale > 1e75) { this.unbounded.push(order); continue; }
      const pad = 1e-6 * scale;
      this.entries.push({ order, minX: Math.min(a.x, b.x) - pad, minY: Math.min(a.y, b.y) - pad,
        maxX: Math.max(a.x, b.x) + pad, maxY: Math.max(a.y, b.y) + pad });
    }
    this.entries.sort((a, b) => a.minX - b.minX || a.order - b.order);
    if (this.entries.length) this.build(0, this.entries.length);
  }

  private build(start: number, end: number): number {
    const index = this.branches.length;
    const branch: Branch = { start, end, left: -1, right: -1, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    this.branches.push(branch);
    if (end - start <= 8) {
      for (let i = start; i < end; i++) {
        const e = this.entries[i];
        branch.minX = Math.min(branch.minX, e.minX); branch.minY = Math.min(branch.minY, e.minY);
        branch.maxX = Math.max(branch.maxX, e.maxX); branch.maxY = Math.max(branch.maxY, e.maxY);
      }
    } else {
      const middle = (start + end) >>> 1;
      branch.left = this.build(start, middle); branch.right = this.build(middle, end);
      const a = this.branches[branch.left], b = this.branches[branch.right];
      branch.minX = Math.min(a.minX, b.minX); branch.minY = Math.min(a.minY, b.minY);
      branch.maxX = Math.max(a.maxX, b.maxX); branch.maxY = Math.max(a.maxY, b.maxY);
    }
    return index;
  }

  public query(beams: readonly Beam[], ships: readonly Ship[], ship: Ship, center: Vector2, radius: number): readonly Beam[] | null {
    if (!this.active || beams !== this.beams || ships !== this.ships || beams.length !== this.beamCount || ships.length !== this.shipCount
      || ship.getShieldCenter !== nativeGetShieldCenter || !ship.hasNativeThreatPhaseHooks || !nativeDamageReads(ship) || !numericPoint(center)
      || !Number.isFinite(radius)) return null;
    const scale = Math.max(1, Math.abs(center.x), Math.abs(center.y), Math.abs(radius));
    if (!Number.isFinite(scale) || scale > 1e75) return null;
    const extent = Math.abs(radius) + 1e-6 * scale;
    const minX = center.x - extent, minY = center.y - extent, maxX = center.x + extent, maxY = center.y + extent;
    const orders = this.unbounded.slice(), stack = this.branches.length ? [0] : [];
    while (stack.length) {
      const branch = this.branches[stack.pop()!];
      if (branch.maxX < minX || branch.minX > maxX || branch.maxY < minY || branch.minY > maxY) continue;
      if (branch.left >= 0) { stack.push(branch.left, branch.right); continue; }
      for (let i = branch.start; i < branch.end; i++) {
        const e = this.entries[i];
        if (!(e.maxX < minX || e.minX > maxX || e.maxY < minY || e.minY > maxY)) orders.push(e.order);
      }
    }
    return orders.sort((a, b) => a - b).map(order => beams[order]);
  }

  public close(): void { this.active = false; }
}
