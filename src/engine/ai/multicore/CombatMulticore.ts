import { CombatWorkerBudget } from './CombatWorkerBudget';
import { AuditedCombatMulticore } from './AuditedCombatMulticore';
import type { CombatEngine } from '../../simulation/CombatEngine';
import type { CapitalShipAI } from '../CapitalShipAI';
import type { AIPhaseBatch } from './Types';

/** Single-player adapter: player controls/AI have already executed before prepare.
 * Only the engine's later native AI phase is predicted, exactly as on a LAN host.
 * Generic support is behavior-audited; the proven native fast tier is retained.
 * Unknown behavior still crosses a serial barrier.
 */
export class CombatMulticore {
    private readonly owners = new AuditedCombatMulticore({
        minShips: 50, minJobs: 4, minHardwareConcurrency: 8,
        frameTimeoutMs: 250, readyReason: 'audited-native-local',
    });
    // Retrying a measured losing mixed codec every ten seconds creates its own
    // repeating hitch. Local battles use a longer hysteresis; LAN keeps its policy.
    private readonly budget = new CombatWorkerBudget(60000);
    enabled = true;
    get status() {
        const status = this.owners.status;
        return { ...status, budget: this.budget.status,
            reason: !status.workers && status.reason === 'not-started' ? this.budget.status.reason : status.reason };
    }
    prepare(engine: CombatEngine, playerAI: CapitalShipAI, dt: number): Promise<AIPhaseBatch> | null {
        if (!this.enabled) return null;
        return this.owners.prepare(engine, dt, { ais: [playerAI, ...engine.getNativeAIs()],
            allowAudited: this.budget.allow(engine.capitalShips.length, performance.now()) });
    }
    record(ms: number, usedOwners: boolean): void {
        if (this.owners.status.tier !== 'legacy-native' && this.budget.record(ms, usedOwners, performance.now())) this.owners.reset();
    }
    reset(): void { this.owners.reset(); this.budget.reset(); }
}
