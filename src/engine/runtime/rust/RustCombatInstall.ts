/** Complete trusted startup boundary. Existing Ship constructors run only in
 * compileRustContent; no TS combat owner is retained or stepped afterwards. */
import { encodeRustFlightAdmission } from './RustFlightProtocol';
import { encodeRustScenePrelude } from './RustScenePreludeProtocol';
import { encodeRustSceneRead } from './RustSceneReadProtocol';
import { encodeRustVisualAdmission } from './RustVisualAdmission';
import { encodeRustSceneSystemMetadata } from './RustSceneShipCommandProtocol';
import { encodeRustSceneStartup } from './RustSceneStartupProtocol';
import type { RustCombatCore } from './RustCombatCore';
import type { RustCompiledContent } from './RustContentCompiler';
import type { RustSceneAdmission } from './RustSceneProtocol';
import type { CombatAudioEvent } from '../../audio/CombatAudioEvents';

export interface RustInstallOptions {
  readonly playerId: number; readonly enemyId: number;
  readonly asteroids: boolean; readonly scene?: RustSceneAdmission;
  readonly startupRadio?: { readonly id: number; readonly sender: string; readonly text: string; readonly color: readonly [number, number, number] };
  readonly startupAudio?: readonly CombatAudioEvent[];
}
export function installRustCombat(core: RustCombatCore, content: RustCompiledContent, options: RustInstallOptions): void {
  const player = content.entities.find(e => e.id === options.playerId), enemy = content.entities.find(e => e.id === options.enemyId);
  if (!player || !enemy || player.parentId !== undefined || player.carrierId !== undefined || enemy.parentId !== undefined || enemy.carrierId !== undefined)
    throw Error('Missing Rust encounter primary identity');
  const anchor = { id: player.id, handle: player.handle };
  for (const batch of content.batches) {
    const commands = batch.commands.filter(c => c.kind !== 'initialize-gravity-ship'); core.apply(commands);
  }
  core.apply([{ kind: 'initialize-battle-world', ...anchor, enemy: { id: enemy.id, handle: enemy.handle }, asteroids: options.asteroids }]);
  const gravity = content.commands.filter(c => c.kind === 'initialize-gravity-ship');
  // Intl ranks are startup certificates. Native uses the complete published
  // character table for numeric IDs and the literal source names for ships.
  const ranks = (keys: readonly string[]) => { const ordered = [...new Set(keys)].sort((a, b) => a.localeCompare(b)); return keys.map(k => ordered.indexOf(k)); };
  const names = content.entities.map(e => 'SHIP:' + e.stableId), shipRanks = ranks(names);
  const prefixes = ['ASTEROID', 'HULK', 'PROJECTILE', 'SHIP'], alphabet = Array.from('-.0123456789+e');
  const chars = [...alphabet].sort((a, b) => a.localeCompare(b)), lex = (a: string, b: string) => { for (let i = 0; i < Math.min(a.length, b.length); i++) { const d = chars.indexOf(a[i]) - chars.indexOf(b[i]); if (d) return Math.sign(d); } return Math.sign(a.length - b.length); };
  for (const left of ['', '0', '-', '1e+']) for (const a of alphabet) for (const b of alphabet) for (const right of ['', '0', 'e-9'])
    if (Math.sign((left + a + right).localeCompare(left + b + right)) !== lex(a + right, b + right)) throw Error('Unsupported Rust numeric Intl collation');
  core.apply([{ kind: 'initialize-gravity-world', ...anchor }, ...gravity,
    ...content.entities.map((e, i) => ({ kind: 'initialize-gravity-collation' as const, id: e.id, handle: e.handle, shipRank: shipRanks[i], prefixes: i === 0 ? ranks(prefixes) : undefined, alphabet: i === 0 ? ranks(alphabet) : undefined }))]);
  const p = content.pending.phase.ships;
  core.apply([{ kind: 'initialize-phase-world', ...anchor, ships: p.flatMap(s => s.anchorCRCost === undefined ? [] : [{ id: s.id, handle: s.handle, anchorCRCost: s.anchorCRCost }]),
    controls: p.flatMap(s => s.controls.map(c => ({ ...c, id: s.id, handle: s.handle }))) },
    { kind: 'initialize-aux-world', ...anchor, ...content.pending.aux },
    { kind: 'initialize-ai-world', ...anchor, data: { actors: content.pending.ai, policy: content.pending.combatPolicy } }]);
  const bySpec = new Map(content.dictionary.ships.map(s => [s.key, s.spec]));
  core.apply([{ kind: 'initialize-motion-world', ...anchor, data: { ships: content.entities.map(e => {
    const spec = bySpec.get(e.specKey); if (!spec) throw Error('Missing Rust motion specification');
    return { id: e.id, handle: e.handle, station: !!spec.sourceHullTraits?.includes('STATION'), axial: !!spec.sourceHullTraits?.includes('axialrotation'),
      independent: !!spec.sourceHullTraits?.includes('INDEPENDENT_ROTATION'), inheritParentEngineCommands: !!spec.inheritParentEngineCommands,
      turnAcceleration: spec.turnAccelerationDeg * Math.PI / 180, maxTurnRate: spec.maxTurnRateDeg * Math.PI / 180 };
  }) } }]);
  core.applyPacked(Float64Array.from(encodeRustFlightAdmission(content, player.id, player.handle).flat()));
  core.applyPacked(Float64Array.from(encodeRustVisualAdmission(content, player.id, player.handle).flat()));
  if (options.scene) {
    core.apply([{ kind: 'initialize-scene-world', ...anchor, data: options.scene }]);
    for (const rows of [encodeRustScenePrelude(content.pending.prelude, player.id, player.handle), encodeRustSceneRead(content, player.id, player.handle),
      encodeRustSceneSystemMetadata(content.pending.systemRead, player.id, player.handle), encodeRustSceneStartup(player.id, player.handle, options.startupRadio, options.startupAudio)])
      core.applyPacked(Float64Array.from(rows.flat()));
  }
  core.apply(content.finalize);
}
