/** Trusted once-only Ship.updateMotion/source trait metadata. */
import type { RustBodyHandle } from './RustCoreProtocol';
export interface RustMotionAdmission {
  readonly ships: readonly { readonly id: number; readonly handle: RustBodyHandle; readonly station: boolean;
    readonly axial: boolean; readonly independent: boolean; readonly inheritParentEngineCommands: boolean;
    readonly turnAcceleration: number; readonly maxTurnRate: number }[];
}
export function encodeRustMotionAdmission(data: RustMotionAdmission, id: number, h: RustBodyHandle): number[][] {
  const rows: number[][] = [], seen = new Set<string>();
  const integer = (v: number) => { if (!Number.isInteger(v) || v < 0 || v > 0xffffffff) throw Error('Invalid Rust motion identity'); return v; };
  const flag = (v: boolean) => { if (typeof v !== 'boolean') throw Error('Invalid Rust motion flag'); return +v; };
  const append = (tag: number, id: number, handle: RustBodyHandle, v: readonly number[]) => {
    if (!integer(id) || !integer(handle.generation)) throw Error('Missing Rust motion identity');
    const row = [tag, id, integer(handle.slot), handle.generation, ...v]; while (row.length < 26) row.push(0); rows.push(row);
  };
  append(166, id, h, [integer(data.ships.length)]);
  for (const s of data.ships) {
    const key = s.handle.slot + ':' + s.handle.generation; if (seen.has(key)) throw Error('Duplicate Rust motion handle'); seen.add(key);
    if (![s.turnAcceleration, s.maxTurnRate].every(n => Number.isFinite(n) && n >= 0)) throw Error('Invalid Rust motion stats');
    append(167, s.id, s.handle, [flag(s.station) | flag(s.axial) * 2 | flag(s.independent) * 4 | flag(s.inheritParentEngineCommands) * 8, s.turnAcceleration, s.maxTurnRate]);
  }
  append(168, id, h, []); return rows;
}
