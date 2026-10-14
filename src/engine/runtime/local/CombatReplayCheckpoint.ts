import { copyControlSample, type CombatControlSample } from '../CombatControl';
import type { CommandResult } from '../CombatCommands';
import type { LocalCombatCommand, LocalCombatConfig } from './LocalCombatContracts';
import type { CombatBackendIdentity, CombatStartupFallback } from '../../contracts/LocalCombatWire';

// A seed + complete committed history, not a render snapshot or an O(1) world dump.
declare const __COMBAT_REPLAY_BUILD__: string;
export const COMBAT_REPLAY_BUILD = typeof __COMBAT_REPLAY_BUILD__ === 'string' ? __COMBAT_REPLAY_BUILD__ : 'in-memory-only';
export const COMBAT_REPLAY_FORMAT = 3;
export const MAX_REPLAY_TICKS = 216_000;
const MAX_ENTRIES = 131_072;
const MAX_JOURNAL_BYTES = 32 * 1024 * 1024;
export type ReplayOperation = { kind: 'step'; sample: CombatControlSample } |
  { kind: 'commands'; commands: LocalCombatCommand[] };
export type CombatReplayEntry =
  | { kind: 'step'; sample: CombatControlSample; count: number }
  | { kind: 'commands'; commands: LocalCombatCommand[]; results: CommandResult[] };
export interface CombatReplayCheckpoint {
  format: number;
  build: string;
  protocol: number;
  config: LocalCombatConfig;
  authority: CombatBackendIdentity;
  tick: number;
  entries: CombatReplayEntry[];
  /** Small authority witness; does not replace the replay of hidden AI/effect state. */
  witness: number[];
}
export function sameReplayWitness(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
}
export function copyBackendIdentity(source: CombatBackendIdentity, config: LocalCombatConfig): CombatBackendIdentity {
  if (!source || source.kind !== (config.backend ?? 'typescript') || source.kind === 'rust-wasm' && !/^[a-f0-9]{64}$/.test(source.sha256))
    throw Error('Invalid combat authority identity');
  return source.kind === 'rust-wasm' ? { kind: source.kind, sha256: source.sha256 } : { kind: source.kind };
}
export function sameBackendIdentity(a: CombatBackendIdentity, b: CombatBackendIdentity): boolean {
  return a.kind === b.kind && (a.kind !== 'rust-wasm' || b.kind === 'rust-wasm' && a.sha256 === b.sha256);
}
/** Only the first, unadvanced init ACK may select TS after a Rust cold failure. */
export function resolveStartupBackend(config: LocalCombatConfig, authority: CombatBackendIdentity,
  fallback?: CombatStartupFallback): LocalCombatConfig {
  if (fallback === undefined) { copyBackendIdentity(authority, config); return { ...config, backend: authority.kind }; }
  if (!fallback || fallback.requested !== 'rust-wasm' || fallback.selected !== 'typescript'
    || typeof fallback.reason !== 'string' || !fallback.reason.length || fallback.reason.length > 4096
    || config.backend !== 'rust-wasm' || authority?.kind !== 'typescript') throw Error('Invalid cold combat backend fallback');
  const selected = { ...config, backend: 'typescript' as const };
  copyBackendIdentity(authority, selected);
  return selected;
}
export function copyReplayCheckpoint(source: CombatReplayCheckpoint, protocol: number): CombatReplayCheckpoint {
  if (!source || source.format !== COMBAT_REPLAY_FORMAT || source.build !== COMBAT_REPLAY_BUILD || source.protocol !== protocol
    || !source.config || !source.config.expectedContent || !Number.isSafeInteger(source.tick)
    || source.tick < 0 || source.tick > MAX_REPLAY_TICKS || !Array.isArray(source.entries)
    || source.entries.length > MAX_ENTRIES || !Array.isArray(source.witness)
    || source.witness.length !== 22 || source.witness[0] !== source.tick || !source.witness.every(Number.isFinite))
    throw new Error('Invalid or incompatible combat replay checkpoint');
  let ticks = 0, bytes = 0;
  for (const entry of source.entries) {
    if (entry?.kind === 'step') {
      if (!Number.isSafeInteger(entry.count) || entry.count < 1 || (ticks += entry.count) > MAX_REPLAY_TICKS)
        throw new Error('Combat replay tick budget exceeded');
      copyControlSample(entry.sample);
    } else if (entry?.kind === 'commands') {
      if (!Array.isArray(entry.commands) || entry.commands.length > 128 || !Array.isArray(entry.results)
        || entry.results.length !== entry.commands.length || entry.results.some(result => typeof result?.accepted !== 'boolean'))
        throw new Error('Invalid combat replay command receipt');
    } else throw new Error('Unknown combat replay entry');
    bytes += JSON.stringify(entry).length * 2;
    if (bytes > MAX_JOURNAL_BYTES) throw new Error('Combat replay journal budget exceeded');
  }
  if (ticks !== source.tick) throw new Error('Combat replay tick count differs from checkpoint');
  copyBackendIdentity(source.authority, source.config);
  return structuredClone(source);
}

/** ACK-only, bounded, in-memory replay journal. Exhaustion disables recovery, never simulation.
 * Adjacent identical samples are losslessly run-length encoded. No dropping ticks/commands. */
export class CombatReplayJournal {
  private entries: CombatReplayEntry[] = [];
  private witness: number[] = [];
  private bytes = 0;
  private lastSampleKey = '';
  private disabled?: string;
  private tick = 0;
  private authority?: CombatBackendIdentity;
  constructor(private config: LocalCombatConfig, private readonly protocol: number) {}
  get unavailableReason(): string | undefined { return this.disabled ?? (!this.witness.length ? '尚无已确认的战斗进度。' : undefined); }
  initialize(witness: number[], authority: CombatBackendIdentity = { kind: 'typescript' }, fallback?: CombatStartupFallback): void {
    this.config = resolveStartupBackend(this.config, authority, fallback);
    this.authority = copyBackendIdentity(authority, this.config); this.witness = witness.slice();
  }
  verifyAuthority(authority: CombatBackendIdentity): void {
    const current = copyBackendIdentity(authority, this.config);
    if (!this.authority || !sameBackendIdentity(current, this.authority)) throw Error('Combat authority changed inside a replay epoch');
  }
  seed(checkpoint: CombatReplayCheckpoint): void {
    const copy = copyReplayCheckpoint(checkpoint, this.protocol);
    this.entries = copy.entries; this.witness = copy.witness; this.tick = copy.tick; this.authority = copy.authority;
    this.bytes = this.entries.reduce((sum, entry) => sum + JSON.stringify(entry).length * 2, 0);
    this.lastSampleKey = '';
  }
  record(operation: ReplayOperation, results: CommandResult[], witness: number[]): void {
    if (this.disabled) return;
    this.witness = witness.slice();
    if (operation.kind === 'commands' && !operation.commands.length) return;
    if (operation.kind === 'step' && ++this.tick > MAX_REPLAY_TICKS) { this.disable(); return; }
    const key = operation.kind === 'step' ? JSON.stringify(operation.sample) : '';
    const previous = this.entries[this.entries.length - 1];
    if (operation.kind === 'step' && previous?.kind === 'step' && key === this.lastSampleKey) {
      // Account for the (rare) extra decimal digit in the RLE count as well.
      this.bytes += (String(previous.count + 1).length - String(previous.count).length) * 2;
      if (this.bytes > MAX_JOURNAL_BYTES) { this.disable(); return; }
      previous.count++; return;
    }
    const entry: CombatReplayEntry = operation.kind === 'step'
      ? {kind:'step', sample:structuredClone(operation.sample), count:1}
      : {kind:'commands', commands:structuredClone(operation.commands), results:structuredClone(results)};
    const cost = JSON.stringify(entry).length * 2;
    if (this.entries.length >= MAX_ENTRIES || this.bytes + cost > MAX_JOURNAL_BYTES) { this.disable(); return; }
    this.entries.push(entry); this.bytes += cost; this.lastSampleKey = key;
  }
  private disable(): void {
    this.disabled = '恢复日志已达到内存上限；当前战斗仍可继续，但无法完整重建。';
    this.entries = []; this.witness = []; this.bytes = 0; this.lastSampleKey = '';
  }
  checkpoint(): CombatReplayCheckpoint {
    if (this.unavailableReason) throw new Error(this.unavailableReason);
    return copyReplayCheckpoint({format:COMBAT_REPLAY_FORMAT, build:COMBAT_REPLAY_BUILD, protocol:this.protocol, config:this.config,
      tick:this.tick, entries:this.entries, witness:this.witness, authority:this.authority!}, this.protocol);
  }
}
