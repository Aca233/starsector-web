export interface SimulationStatus {
  readonly worldId: string; readonly status: 'running' | 'stopped' | 'error'; readonly tick: number;
  readonly pendingTicks: number; readonly epoch: string; readonly error: null | { readonly code: string; readonly message: string };
}
import type { CampaignRepository } from './Repository.mjs';
export class CampaignSimulationLoop {
  constructor(store: CampaignRepository, options?: { now?: () => number; intervalMs?: number });
  start(worldId: string): SimulationStatus;
  stop(worldId: string): SimulationStatus;
  status(worldId: string): SimulationStatus;
  pulse(): void;
  close(): void;
}
