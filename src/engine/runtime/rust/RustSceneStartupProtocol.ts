/** Actual source fixed terrain/opening message, no constructor or RNG. */
import { standaloneNebulae } from '../../data/terrain/StandaloneNebulae';
import type { RustBodyHandle } from './RustCoreProtocol';
import type { CombatAudioEvent } from '../../audio/CombatAudioEvents';
export function encodeRustSceneStartup(id: number, handle: RustBodyHandle, radio: {
  readonly id?: number; readonly sender: string; readonly text: string; readonly color: readonly [number, number, number];
} = {
  sender: '战区指挥部', text: '全舰注意，进入交战空域！准备迎击敌方主力！', color: [100, 220, 255] as readonly [number, number, number],
}, audio?: readonly CombatAudioEvent[]): number[][] {
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(handle.slot) || handle.slot < 0 || !Number.isSafeInteger(handle.generation) || handle.generation <= 0) throw Error('Invalid Rust startup anchor');
  const payload = JSON.stringify({ nebulae: standaloneNebulae.map(c => ({ spriteUrl: c.spriteUrl, position: [c.x, c.y], opacity: c.opacity })),
    radio: { id: radio.id, sender: radio.sender, text: radio.text, color: radio.color }, audio });
  const rows: number[][] = [], append = (tag: number, data: number[]) => { const row = [tag, id, handle.slot, handle.generation, ...data]; while (row.length < 26) row.push(0); rows.push(row); };
  append(194, [1, payload.length]);
  for (let at = 0; at < payload.length; at += 20) { const n = Math.min(20, payload.length - at); append(195, [at, n, ...Array.from({ length: n }, (_, i) => payload.charCodeAt(at + i))]); }
  append(196, []); return rows;
}
