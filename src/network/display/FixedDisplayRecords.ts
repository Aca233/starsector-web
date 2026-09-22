/** Fixed hot records on the existing LAN snapshot, not another packet/ACK lane.
 * Only native weapon/engine display leaves move here. Their remaining gameplay
 * presentation fields and all ship/motion/relay-visible roots keep the old DTO.
 * A complete table travels in every snapshot: drops/reconnect need no new baseline.
 */
import { PackedSnapshotNumbers } from '../PackedSnapshotNumbers.mjs';
import { DisplayBufferRecord } from './ShipDisplayBuffer';
import { WEAPON_NUMBERS, WEAPON_BOOLEANS, ENGINE_NUMBERS } from './ShipDisplayLayout';
import type { WeaponMount } from '../../engine/simulation/Weapon';
import type { EngineStatus } from '../../engine/simulation/systems/EngineController';
// Required finite HUD/critical fields share the same buffer; Infinity-capable ammo
// and firingStateTimer deliberately stay in the existing tagged-number codec.
export const LAN_WEAPON_NUMBERS = [...WEAPON_NUMBERS, 'cooldownTimer', 'ammoRechargeProgress', 'barrelIndex', 'health', 'maxHealth', 'disabledTimer', 'disabledDuration', 'burstRemaining', 'burstTimer', 'firingCycleId'] as const satisfies readonly (keyof WeaponMount)[];
const LAN_WEAPON_FLAGS = [...WEAPON_BOOLEANS, 'isAutofire', 'triggerHeld'] as const satisfies readonly (keyof WeaponMount)[];
const LAN_ENGINE_NUMBERS = [...ENGINE_NUMBERS, 'health', 'maxHealth', 'contribution', 'driftContribution'] as const satisfies readonly (keyof EngineStatus)[];
const LAN_ENGINE_FLAGS = ['systemActivated', 'temporaryMalfunction', 'glowDisabled', 'isDisabled', 'isPermanentlyDisabled'] as const satisfies readonly (keyof EngineStatus)[];

export type DisplayRecordKind = 1 | 2;
const schemas = [undefined,
  { numbers: LAN_WEAPON_NUMBERS, flags: LAN_WEAPON_FLAGS },
  { numbers: LAN_ENGINE_NUMBERS, flags: LAN_ENGINE_FLAGS },
] as const;
const fieldSets = [new Set<string>(), new Set<string>([...LAN_WEAPON_NUMBERS, ...LAN_WEAPON_FLAGS]), new Set<string>([...LAN_ENGINE_NUMBERS, ...LAN_ENGINE_FLAGS])];
const MAX_VALUES = 262144;
const invalid = (): never => { throw new Error('Invalid fixed display record'); };
export const fixedDisplayStride = (kind: DisplayRecordKind): number => schemas[kind].numbers.length + schemas[kind].flags.length;
export const fixedDisplayField = (kind: DisplayRecordKind, key: string): boolean => fieldSets[kind].has(key);
export interface FixedDisplayTable { version: 1; values: PackedSnapshotNumbers | number[] }

const sourceSlots = new WeakMap<readonly string[], Map<DisplayRecordKind, { numbers: number[]; flags: number[] }>>();
export class FixedDisplayCapture {
  private values: number[] = [];
  capture(kind: DisplayRecordKind, source: Record<string, unknown>, raw?: readonly string[], fields?: readonly unknown[]): number | null {
    const schema = schemas[kind], offset = this.values.length;
    if (offset + schema.numbers.length + schema.flags.length > MAX_VALUES) return null;
    let slots: { numbers: number[]; flags: number[] } | undefined;
    if (raw && fields) {
      let byKind = sourceSlots.get(raw); if (!byKind) sourceSlots.set(raw, byKind = new Map());
      slots = byKind.get(kind);
      if (!slots) { slots = { numbers: schema.numbers.map(key => raw.indexOf(key)), flags: schema.flags.map(key => raw.indexOf(key)) }; byKind.set(kind, slots); }
    }
    for (let i = 0; i < schema.numbers.length; i++) {
      const value = slots ? fields![slots.numbers[i]] : source[schema.numbers[i]];
      if (typeof value !== 'number' || !Number.isFinite(value)) { this.values.length = offset; return null; }
      this.values.push(value);
    }
    for (let i = 0; i < schema.flags.length; i++) {
      const value = slots ? fields![slots.flags[i]] : source[schema.flags[i]];
      if (typeof value !== 'boolean') { this.values.length = offset; return null; }
      this.values.push(value ? 1 : 0);
    }
    return offset;
  }
  finish(): FixedDisplayTable {
    // Use the existing exact Float64-capable numeric writer. It encodes zero and
    // small integer slots compactly; a raw Float64 block inflated actual packets.
    return { version: 1, values: this.values };
  }
}
// Weak ownership: no retained worlds; never attach these records to authority.
type DisplayRecordEntry = { kind: DisplayRecordKind; record: DisplayBufferRecord };
const records = new WeakMap<object, DisplayRecordEntry>();
const batches = new WeakMap<object[], { kind: DisplayRecordKind; targets: object[]; entries: DisplayRecordEntry[] }>();
function displayRecord(kind: DisplayRecordKind, target: object): DisplayRecordEntry {
  let entry = records.get(target);
  if (entry && entry.kind !== kind) invalid();
  if (!entry) {
    const schema = schemas[kind], record = new DisplayBufferRecord(schema.numbers, schema.flags, true);
    record.attach(target); entry = { kind, record }; records.set(target, entry);
  }
  return entry;
}
export class FixedDisplayRestore {
  private readonly values: Float64Array;
  constructor(table: FixedDisplayTable) {
    if (!table || table.version !== 1) invalid();
    const input = table.values instanceof PackedSnapshotNumbers ? table.values.numbers : table.values;
    if (!(input instanceof Float64Array) && !Array.isArray(input)) invalid();
    if (input.length > MAX_VALUES) invalid();
    for (const value of input) if (typeof value !== 'number' || !Number.isFinite(value)) invalid();
    this.values = input instanceof Float64Array ? input : new Float64Array(input);
  }
  validate(kind: unknown, offset: unknown): void { this.validateBatch(kind, offset, 1); }
  validateBatch(kind: unknown, offset: unknown, count: number): void {
    if ((kind !== 1 && kind !== 2) || typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(count) || count < 0 || count > 32768) invalid();
    const schema = schemas[kind as DisplayRecordKind], at = offset as number;
    const stride = schema.numbers.length + schema.flags.length;
    if (at + count * stride > this.values.length) invalid();
    for (let row = 0; row < count; row++) for (let i = 0; i < schema.flags.length; i++) {
      const flag = this.values[at + row * stride + schema.numbers.length + i];
      if (flag !== 0 && flag !== 1) invalid();
    }
  }
  bindValidated(kind: DisplayRecordKind, offset: number, target: object): void {
    displayRecord(kind, target).record.bind(this.values, offset);
  }
  bindBatchValidated(kind: DisplayRecordKind, offset: number, targets: object[]): void {
    let batch = batches.get(targets);
    if (!batch || batch.kind !== kind) { batch = { kind, targets: [], entries: [] }; batches.set(targets, batch); }
    const stride = fixedDisplayStride(kind);
    for (let i = 0; i < targets.length; i++) {
      if (batch.targets[i] !== targets[i]) { batch.entries[i] = displayRecord(kind, targets[i]); batch.targets[i] = targets[i]; }
      batch.entries[i].record.bind(this.values, offset + i * stride);
    }
    batch.targets.length = batch.entries.length = targets.length;
  }
}
