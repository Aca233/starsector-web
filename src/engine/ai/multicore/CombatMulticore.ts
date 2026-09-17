import { OwnershipPool, UnsupportedOwnershipScene } from './OwnershipPool';
import { supportsOwnership } from './Eligibility';
import type { CombatEngine } from '../../simulation/CombatEngine';
import type { CapitalShipAI } from '../CapitalShipAI';
import type { AIPhaseBatch } from './Types';
/** Session-local optional acceleration. No changes to LAN's synchronous authority API. */
export class CombatMulticore {
    private pool: OwnershipPool | null = null;
    private ready = false;
    private failed = false;
    private reason = 'not-started';
    enabled = true;
    get status() { return { mode: this.ready && !this.pool?.isDisposed ? '4-workers' : 'serial', reason: this.pool?.isDisposed ? 'unsupported-scene' : this.reason, metrics: this.pool?.metrics ?? null }; }
    prepare(engine: CombatEngine, playerAI: CapitalShipAI, dt: number): Promise<AIPhaseBatch> | null {
        if (!this.enabled || this.failed)
            return null;
        if (typeof Worker === 'undefined' || typeof SharedArrayBuffer === 'undefined'
            || globalThis.crossOriginIsolated !== true || (globalThis.navigator?.hardwareConcurrency ?? 0) < 8) {
            this.reason = 'browser-or-isolation';
            return null;
        }
        const ais = [playerAI, ...engine.getNativeAIs()];
        if (!this.pool && !supportsOwnership(engine, ais)) {
            this.reason = 'unsupported-scene';
            return null;
        }
        if (!this.pool) {
            try {
                const pool = this.pool = new OwnershipPool(engine, ais);
                this.reason = 'starting';
                // Initialization does not stall combat; snapshots are first published AFTER ready.
                void pool.ready.then(() => {
                    if (this.pool === pool) {
                        this.ready = true;
                        this.reason = 'native-onslaught';
                    }
                }, error => {
                    if (this.pool === pool)
                        this.fail(error);
                });
            }
            catch (error) {
                this.fail(error);
            }
            return null;
        }
        if (!this.ready)
            return null;
        const pool = this.pool;
        return pool.prepare(dt).catch(error => {
            if (this.pool === pool) {
                if (error instanceof UnsupportedOwnershipScene) { this.reset(); this.reason = 'unsupported-scene'; }
                else this.fail(error);
            }
            throw error;
        });
    }
    private fail(error: unknown): void {
        this.reset();
        this.failed = true;
        this.reason = error instanceof Error ? error.message : String(error);
    }
    reset(): void {
        this.pool?.dispose();
        this.pool = null;
        this.ready = false;
        this.failed = false;
        this.reason = 'not-started';
    }
}
