import { supportsOwnership } from './Eligibility';
import type { CapitalShipAI } from '../CapitalShipAI';
import { OwnershipPool, UnsupportedOwnershipScene } from './OwnershipPool';
import { LanOwnershipGate, lanPhaseAIs } from './LanEligibility';
import type { CombatEngine } from '../../simulation/CombatEngine';
import type { AIPhaseBatch, MulticoreMetrics } from './Types';

export interface AuditedMulticoreStatus {
    readonly mode: 'serial' | '1-workers' | '2-workers' | '3-workers' | '4-workers';
    readonly reason: string;
    readonly metrics: Readonly<MulticoreMetrics> | null;
    readonly workers: number;
    readonly tier: 'legacy-native' | 'audited';
}
export interface AuditedMulticoreOptions {
    minShips?: number;
    minJobs?: number;
    minHardwareConcurrency?: number;
    frameTimeoutMs?: number;
    readyReason?: string;
}
/** Host-local acceleration only. No remote commands, damage or world simulation.
 * Initialization never stalls a host tick. After ready, prepare publishes an immutable
 * prephase prediction; the caller must synchronously fixedUpdate({aiBatch}) or finish it.
 * Rejected/stale batches must use the ordinary serial fixedUpdate exactly once.
 */
export class AuditedCombatMulticore {
    constructor(private readonly options: AuditedMulticoreOptions = {}) {}
    private pool: OwnershipPool | null = null;
    private legacy = false;
    private engine: CombatEngine | null = null;
    private ready = false;
    private failed = false;
    private disposed = false;
    private pending = false;
    private reason = 'not-started';
    private retryAfter = 0;
    private retryEngine: CombatEngine | null = null;
    get status(): AuditedMulticoreStatus {
        const workers = this.ready && !this.pool?.isDisposed ? this.pool?.count ?? 0 : 0;
        return Object.freeze({
            mode: workers ? `${workers}-workers` as AuditedMulticoreStatus['mode'] : 'serial',
            reason: this.pool?.isDisposed && !this.failed ? 'unsupported-scene' : this.reason,
            metrics: this.pool?.metrics ? Object.freeze({ ...this.pool.metrics }) : null,
            workers, tier: this.legacy ? 'legacy-native' : 'audited',
        });
    }
    prepare(engine: CombatEngine, dt: number, local?: { ais: CapitalShipAI[]; allowAudited: boolean }): Promise<AIPhaseBatch> | null {
        if (this.disposed || this.failed || this.pending) return null;
        if (engine.ships.length < (this.options.minShips ?? 0)) {
            if (this.pool) this.reset();
            this.reason = 'below-worker-threshold'; return null;
        }
        if (engine.ships.length > 200) {
            if (this.pool) this.reset();
            this.reason = 'ship-limit';
            return null;
        }
        if (!this.pool && this.retryEngine === engine && performance.now() < this.retryAfter) return null;
        if (!(dt > 0) || !Number.isFinite(dt)) { this.reason = 'invalid-dt'; return null; }
        if (typeof Worker === 'undefined' || typeof SharedArrayBuffer === 'undefined'
            || globalThis.crossOriginIsolated !== true) {
            this.reason = 'worker-or-isolation-unavailable';
            return null;
        }
        const hardware = globalThis.navigator?.hardwareConcurrency ?? 0;
        if (hardware < (this.options.minHardwareConcurrency ?? 2)) { this.reason = 'hardware-concurrency'; return null; }
        if (this.pool && (engine !== this.engine || this.pool.isDisposed)) this.reset();
        if (!engine.canPreviewNativeAI) { this.reason = 'unsupported-prephase'; return null; }
        if (this.pool && !this.legacy && local && !local.allowAudited) return null;
        if (!this.pool) {
            try {
                // Preserve the already measured default-Onslaught fast codec. The
                // generic derived-world audit is intentionally more expensive.
                this.legacy = !!local && supportsOwnership(engine, local.ais);
                if (!this.legacy && local && !local.allowAudited) return null;
                const ais = this.legacy ? local!.ais : engine.getNativeAIs();
                let count = 4;
                if (!this.legacy) {
                    const gate = new LanOwnershipGate(engine, ais), jobs = gate.jobs(lanPhaseAIs(engine, ais));
                    if (!gate.supports() || jobs.length < (this.options.minJobs ?? 1)) {
                        this.reason = 'no-audited-jobs';
                        this.retryEngine = engine; this.retryAfter = performance.now() + 250;
                        return null;
                    }
                    count = Math.min(4, hardware - 1, jobs.length);
                }
                const pool = this.pool = new OwnershipPool(engine, ais, count, {
                    lan: !this.legacy,
                    // Preserve the proven native lane's original deadlines. Under synchronous
                    // catch-up, even a ready owner's startup reply can be serviced late.
                    // Generic LAN/local jobs retain their shorter, fail-closed deadlines.
                    frameTimeoutMs: this.legacy ? 3000 : this.options.frameTimeoutMs ?? 64,
                    initTimeoutMs: this.legacy ? 3000 : 1500,
                });
                this.engine = engine;
                this.reason = 'starting';
                void pool.ready.then(() => {
                    if (this.pool === pool) { this.ready = true; this.reason = this.legacy ? 'native-onslaught' : this.options.readyReason ?? 'audited-native-lan'; }
                }, error => { if (this.pool === pool) this.fail(error); });
            } catch (error) { this.fail(error); }
            return null;
        }
        if (!this.ready) return null;
        const pool = this.pool;
        this.pending = true;
        return pool.prepare(dt).catch(error => {
            if (this.pool === pool) {
                if (error instanceof UnsupportedOwnershipScene) {
                    this.reset(); this.reason = 'unsupported-scene';
                    // Dynamic carrier rosters must not create/terminate four workers every tick.
                    this.retryEngine = engine; this.retryAfter = performance.now() + 250;
                }
                else this.fail(error);
            }
            throw error;
        }).finally(() => { if (this.pool === pool) this.pending = false; });
    }
    /** Host may compare complete serial/parallel tick timings, including awaiting owners.
     * Preserve the last measured counters when the adaptive scheduler chooses serial.
     * Call after finishing a batch; reset() explicitly starts a new calibration epoch.
     */
    useSerial(reason = 'slower-than-serial'): void {
        this.pool?.dispose();
        this.ready = this.pending = false;
        this.failed = true;
        this.reason = reason;
    }
    private fail(error: unknown): void {
        this.pool?.dispose();
        this.ready = false;
        this.pending = false;
        this.failed = true;
        this.reason = error instanceof Error ? error.message : String(error);
    }
    reset(): void {
        this.pool?.dispose();
        this.pool = null;
        this.engine = null; this.legacy = false;
        this.ready = this.failed = this.disposed = this.pending = false;
        this.reason = 'not-started';
        this.retryAfter = 0; this.retryEngine = null;
    }
    dispose(): void { this.reset(); this.disposed = true; this.reason = 'disposed'; }
}
