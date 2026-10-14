/** Startup scalar facts sampled from the actual source ships by the compiler. */
import type { RustCompiledContent } from './RustContentCompiler';
import type { RustBodyHandle } from './RustCoreProtocol';
export function encodeRustSceneRead(content: RustCompiledContent, id: number, handle: RustBodyHandle): number[][] {
  const rows: number[][] = [], keys = new Set<string>();
  const row = (tag: number, values: readonly number[]) => {
    if (values.some(n => !Number.isFinite(n))) throw Error('Nonfinite Rust scene read admission');
    const r = [tag, id, handle.slot, handle.generation, ...values]; while (r.length < 26) r.push(0); rows.push(r);
  };
  row(186, [content.pending.read.length]);
  for (const m of content.pending.read) {
    const key = `${m.handle.slot}:${m.handle.generation}`;
    if (!Number.isInteger(m.id) || m.id <= 0 || !Number.isInteger(m.handle.slot) || m.handle.slot < 0 || !Number.isInteger(m.handle.generation) || m.handle.generation <= 0 || keys.has(key) || m.weaponRepair < 0
      || !content.entities.some(e => e.id === m.id && e.handle.slot === m.handle.slot && e.handle.generation === m.handle.generation)) throw Error('Invalid Rust scene read identity');
    keys.add(key); row(187, [m.handle.slot, m.handle.generation, m.sightFlat, m.sightPercent, m.weaponRepair]);
  }
  row(188, []); return rows;
}
