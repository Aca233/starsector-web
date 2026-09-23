import { ArmorGrid } from '../engine/simulation/ArmorGrid';
import { PackedSnapshotNumbers } from './PackedSnapshotNumbers.mjs';

/** First native component: owned armor cells. Weak keys bind reuse to the
 * actual grid lifetime, never a ship ID that a later spawn might reuse. */
const captured = new WeakMap<ArmorGrid, {revision:number; value:ArmorCells}>();
const applied = new WeakMap<ArmorGrid, {revision:number; value:PackedSnapshotNumbers}>();
type ArmorCells = Readonly<{$typed:'Float32Array';values:PackedSnapshotNumbers}>;
const counters = {captures:0,captureReuses:0,restores:0,restoreSkips:0,fallbacks:0};
export function ownedArmorGrid(value: unknown): value is ArmorGrid {
  return value instanceof ArmorGrid && Object.getPrototypeOf(value) === ArmorGrid.prototype
    && !Object.hasOwn(value, 'cellMutationRevision')
    && value.copyCells === ArmorGrid.prototype.copyCells
    && value.restoreCellSnapshot === ArmorGrid.prototype.restoreCellSnapshot
    && value.replaceCells === ArmorGrid.prototype.replaceCells
    && value.cellMutationRevision !== null;
}
export function captureArmorCells(grid: ArmorGrid): ArmorCells | null {
  const revision = grid.cellMutationRevision;
  if (revision === null) { counters.fallbacks++; return null; }
  const prior = captured.get(grid);
  if (prior?.revision === revision) { counters.captureReuses++; return prior.value; }
  const numbers = PackedSnapshotNumbers.capture(grid.copyCells());
  if (!numbers || numbers.type !== 'Float32Array') return null;
  const value = Object.freeze({$typed:'Float32Array' as const, values:numbers});
  captured.set(grid,{revision,value}); counters.captures++;
  return value;
}
/** Called only from the native receiver at the armor cells field; all other
 * armor metadata still restores normally. No untrusted version enables a skip. */
export function restoreArmorCells(grid: ArmorGrid, wire: unknown): boolean {
  if (!wire || typeof wire !== 'object') return false;
  const value = wire as {$typed?:unknown;values?:unknown};
  if (value.$typed !== 'Float32Array' || !(value.values instanceof PackedSnapshotNumbers)
      || value.values.type !== 'Float32Array') return false;
  const revision = grid.cellMutationRevision;
  if (revision === null) { counters.fallbacks++; return false; }
  const prior = applied.get(grid);
  if (prior?.revision === revision && prior.value === value.values) {
    counters.restoreSkips++; return true;
  }
  grid.restoreCellSnapshot(value.values.numbers);
  applied.set(grid,{revision:grid.cellMutationRevision!,value:value.values});
  counters.restores++; return true;
}
export function armorReplicationDiagnostics() { return {...counters}; }
