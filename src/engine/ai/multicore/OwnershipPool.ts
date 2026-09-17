import { sameFleetPlan } from '../FleetTactics';
import { Publisher } from './Protocol';
import { supportsOwnership } from './Eligibility';
import type { CapitalShipAI } from '../CapitalShipAI';
import type { Ship } from '../../simulation/Ship';
import type { CombatEngine } from '../../simulation/CombatEngine';
import type { AIPhaseBatch, MulticoreMetrics, OwnerRequest, OwnerReply, OwnerResult } from './Types';
type Pending = {
    resolve: (reply: OwnerReply) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
};
type Entry = {
    worker: Worker;
    pending: Map<number, Pending>;
};
const timeoutMs = 3000;
function signature(s: Ship) {
    return {
        active: s.shield.isActive,
        threat: [s.flux.isVenting, s.flux.isOverloaded, s.flux.overloadTimer, s.flux.getTimeToVent(), s.system.state, s.system.effectLevel, s.system.blocksWeapons, s.system.chargeDownDuration].join('/'),
        broad: [s.isDead, s.isPhased, s.retreating, s.pos.x, s.pos.y, s.vel.x, s.vel.y, s.shield.radius, s.shield.type].join('/')
    };
}
export class UnsupportedOwnershipScene extends Error {}

/** Persistent owners; a frame is immutable until every owner has replied or been terminated. */
export class OwnershipPool {
    private readonly publisher: Publisher;
    private readonly entries: Entry[] = [];
    private serial = 0;
    private busy = false;
    private disposed = false;
    metrics: MulticoreMetrics | null = null;
    get isDisposed(): boolean { return this.disposed; }
    readonly ready: Promise<void>;
    constructor(private readonly engine: CombatEngine, private readonly allAis: CapitalShipAI[], readonly count = 4) {
        if (count !== 4 || !supportsOwnership(engine, allAis))
            throw new Error('Unsupported ownership scene');
        this.publisher = new Publisher(engine.ships, allAis);
        const groups = Array.from({ length: count }, () => [] as number[]);
        const n = engine.ships.length;
        // Coprime traversal avoids empty partitions for counts divisible by the prototype's 37 stride.
        let stride = 37;
        const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
        while (gcd(stride, n) !== 1)
            stride++;
        for (let i = 0; i < n; i++)
            groups[Math.floor(((i * stride) % n) * count / n)].push(i);
        try {
            for (let i = 0; i < count; i++) {
                const worker = new Worker(new URL('./owner.worker.ts', import.meta.url), { type: 'module' });
                const entry: Entry = { worker, pending: new Map() };
                worker.onmessage = ({ data }: MessageEvent<OwnerReply>) => {
                    const pending = entry.pending.get(data.id);
                    if (!pending)
                        return;
                    entry.pending.delete(data.id);
                    clearTimeout(pending.timer);
                    if (data.error)
                        pending.reject(new Error(data.error));
                    else
                        pending.resolve(data);
                };
                worker.onerror = event => this.dispose(new Error(event.message || 'AI owner failed'));
                worker.onmessageerror = () => this.dispose(new Error('Unreadable AI owner reply'));
                this.entries.push(entry);
            }
            this.ready = Promise.all(this.entries.map((e, i) => this.call(e, { type: 'init', models: this.publisher.models, indices: groups[i] }).then(r => {
                if (!r.ready)
                    throw new Error('Invalid owner initialization');
            }))).then(() => undefined).catch(error => { this.dispose(); throw error; });
        }
        catch (error) {
            this.dispose();
            throw error;
        }
    }
    private call(entry: Entry, data: Omit<Extract<OwnerRequest, {
        type: 'init';
    }>, 'id'> | Omit<Extract<OwnerRequest, {
        type: 'plan';
    }>, 'id'>): Promise<OwnerReply> {
        if (this.disposed)
            return Promise.reject(new Error('AI pool disposed'));
        return new Promise((resolve, reject) => {
            const id = ++this.serial;
            const timer = setTimeout(() => this.dispose(new Error('AI owner timed out')), timeoutMs);
            entry.pending.set(id, { resolve, reject, timer });
            try {
                entry.worker.postMessage({ id, ...data });
            }
            catch (error) {
                this.dispose(error instanceof Error ? error : new Error(String(error)));
            }
        });
    }
    supports(checkWeapons = false): boolean { return !this.disposed && supportsOwnership(this.engine, this.allAis, this.publisher, checkWeapons); }
    async prepare(dt: number): Promise<AIPhaseBatch> {
        if (this.busy) throw new Error('Overlapping AI frame');
        if (!this.supports(true)) throw new UnsupportedOwnershipScene('Unsupported ownership scene');
        this.busy = true;
        const start = performance.now();
        try {
            // This preview restores the handful of idempotent prephase fields before returning.
            // No authoritative simulation step is suspended across this await.
            const frame = this.engine.previewNativeAI(ais => this.publisher.publish(this.engine, ais, dt));
            const packMs = performance.now() - start, waiting = performance.now();
            const results: OwnerResult[] = await Promise.all(this.entries.map(e => this.call(e, { type: 'plan', frame }).then(r => {
                if (!r.result)
                    throw new Error('Missing owner result');
                return r.result;
            })));
            const rows = new Map(results.flatMap(r => r.rows).map(r => [r.index, r]));
            if (rows.size !== frame.jobs.length || frame.jobs.some(index => !rows.has(index)))
                throw new Error('Incomplete AI batch');
            const metrics: MulticoreMetrics = { packMs, waitMs: performance.now() - waiting, validateMs: 0, mergeMs: 0, recomputeMs: 0,
                commits: 0, fallbacks: 0, authority: 0, invalidated: false,
                kernelMaxMs: Math.max(...results.map(r => r.kernelMs)), syncMaxMs: Math.max(...results.map(r => r.syncMs)) };
            const changed: {
                index: number;
                active: boolean;
                threat: boolean;
                broad: boolean;
            }[] = [];
            let finished = false;
            return {
                matches: (engine, ais, phaseDt, fleetPlan) => {
                    const t = performance.now();
                    let matches = false;
                    try {
                        const supported = !finished && engine === this.engine && this.supports(true);
                        if (!supported)
                            this.dispose();
                        matches = supported && this.publisher.matches(engine, ais, phaseDt)
                            && sameFleetPlan(new Map(frame.fleetPlan), fleetPlan ?? engine.planFleetAI());
                    }
                    finally {
                        metrics.validateMs += performance.now() - t;
                        metrics.invalidated = !matches;
                    }
                    return matches;
                },
                commit: (ai, projectileIndex, envelope, fleetPlan) => {
                    const t = performance.now(), index = this.publisher.indices.get(ai.ship)!, row = rows.get(index)!;
                    const before = signature(ai.ship);
                    const stale = changed.some(c => c.broad || c.threat && this.publisher.ships[c.index].teamId !== ai.ship.teamId || c.active && row.navigationDeps.includes(c.index));
                    if (stale || row.needsAuthority) {
                        const retry = performance.now();
                        this.engine.updateShipAI(ai, dt, projectileIndex, envelope, fleetPlan ?? new Map(frame.fleetPlan));
                        metrics.recomputeMs += performance.now() - retry;
                        metrics.fallbacks++;
                        if (row.needsAuthority)
                            metrics.authority++;
                    }
                    else {
                        this.publisher.commit(index, row);
                        metrics.commits++;
                    }
                    const after = signature(ai.ship);
                    if (before.active !== after.active || before.threat !== after.threat || before.broad !== after.broad) {
                        changed.push({ index, active: before.active !== after.active, threat: before.threat !== after.threat, broad: before.broad !== after.broad });
                    }
                    metrics.mergeMs += performance.now() - t;
                },
                finish: () => { if (!finished) {
                    finished = true;
                    this.metrics = metrics;
                    this.busy = false;
                } }
            };
        }
        catch (error) {
            this.busy = false;
            this.dispose();
            throw error;
        }
    }
    dispose(reason = new Error('AI pool disposed')): void {
        if (this.disposed)
            return;
        this.disposed = true;
        for (const { worker, pending } of this.entries) {
            worker.terminate();
            for (const p of pending.values()) {
                clearTimeout(p.timer);
                p.reject(reason);
            }
            pending.clear();
        }
    }
}
