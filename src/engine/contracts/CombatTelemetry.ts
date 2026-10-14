/** Cross-realm data contracts. No simulation, renderer, Worker or DOM imports. */
export type RuntimeCollisionBackendState = 'idle' | 'loading' | 'ready' | 'failed';
export interface RuntimeCollisionTelemetry {
  backendState: RuntimeCollisionBackendState;
  typescriptBatches: number;
  wasmBatches: number;
  wasmFallbacks: number;
  projectileCount: number;
  candidatePairs: number;
  maxCandidatesPerProjectile: number;
  kernelMs: number;
}
export interface ContrailStats { stripCount: number; pointCount: number }
export interface MulticoreMetrics {
  packMs: number; waitMs: number; validateMs: number; mergeMs: number; recomputeMs: number;
  commits: number; fallbacks: number; authority: number; invalidated: boolean;
  kernelMaxMs: number; syncMaxMs: number;
}
export interface AuditedMulticoreStatus {
  readonly mode: 'serial' | '1-workers' | '2-workers' | '3-workers' | '4-workers';
  readonly reason: string;
  readonly metrics: Readonly<MulticoreMetrics> | null;
  readonly workers: number;
  readonly tier: 'legacy-native' | 'audited';
}
export interface CombatWorkerBudgetStatus {
  reason: string; serialMs: number; parallelMs: number; lastRejectedParallelMs: number;
  serialSamples: number; parallelSamples: number; serialProbeSamples: number;
  lastRejectedSerialMs: number; lastRejectedShips: number;
}
export interface LocalCombatAIStatus extends AuditedMulticoreStatus { budget: CombatWorkerBudgetStatus }
export interface LocalCombatTelemetry { collision: RuntimeCollisionTelemetry; trails: ContrailStats }
