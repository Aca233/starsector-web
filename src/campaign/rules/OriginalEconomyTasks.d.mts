import type { DeepReadonly } from '../Types.js';
export interface OriginalEconomyCommoditySpec { id: string; economyTier: number; tags: string[] }
export interface OriginalEconomyWorkParams { withIncomeAndUpkeep: boolean; withStockpileUpdate: boolean; forceNonUIStep: boolean; withImmigration: boolean }
export type OriginalEconomyTaskOptions = { mode: 'forced'; params: OriginalEconomyWorkParams } | { mode: 'scheduled'; lastIteration: boolean };
/** Stable object handles, not reusable live lookup slots: captured markets/listeners stay resolvable after removal. */
export interface OriginalEconomyTaskRuntime {
  listReachMarkets(): readonly string[]; listEconomyMarkets(): readonly string[];
  getCommoditySpecs(): readonly DeepReadonly<OriginalEconomyCommoditySpec>[]; getMarketEconGroup(marketId: string): string | null;
  refreshCharacterEffects(marketId: string): void; refreshGovernedOutpostEffects(marketId: string): void;
  reapplyConditions(marketId: string): void; reapplyIndustries(marketId: string): void;
  computeCommodityData(commodityId: string, econGroup: string | null): void;
  updateStockpileAndPrice(marketId: string, commodityId: string): void;
  advanceImmigration(marketId: string, days: number, uiUpdateOnly: boolean): void;
  /** Native list permits duplicate listener object identities; removal removes one occurrence. */
  listUpdateListeners(): readonly string[]; isEconomyListenerExpired(listenerId: string): boolean;
  removeUpdateListener(listenerId: string): void; commodityUpdated(listenerId: string, commodityId: string): void; economyUpdated(listenerId: string): void;
}
export interface OriginalEconomyTaskStatus { scope: 'native-economy-task-orchestration-only'; mode: 'forced' | 'scheduled'; phase: 'main' | 'reapply-again' | 'immigration' | 'finish' | 'done'; failed: boolean; batches: number; mainMarketIndex: number; commodityIndex: number; againMarketIndex: number; immigrationMarketIndex: number; commodityOrder: readonly string[] | null }
export const ORIGINAL_ECONOMY_TASKS: DeepReadonly<{ schemaVersion: 1; originalReference: string; scope: string; sources: Record<string,{sha256:string}>; iterationsPerMonth: number; qualityPenaltyForImports:number; commodities: Record<string,{economyTier:number;tags:string[]}> }>;
export function originalEconomyCommodityOrder(specs: readonly DeepReadonly<OriginalEconomyCommoditySpec>[]): readonly string[];
export interface OriginalEconomyTaskCheckpoint {
 scope:'web-economy-task-checkpoint';schemaVersion:1;mode:'scheduled'|'forced';params:OriginalEconomyWorkParams;
 main:string[];again:string[]|null;immigration:string[]|null;specs:string[]|null;
 marketIndex:number;commodityIndex:number;againIndex:number;immigrationIndex:number;phase:OriginalEconomyTaskStatus['phase'];batches:number;
}
export class OriginalEconomyTaskRunner {
  static fromCheckpoint(runtime:OriginalEconomyTaskRuntime,checkpoint:unknown):OriginalEconomyTaskRunner;
  checkpoint():DeepReadonly<OriginalEconomyTaskCheckpoint>;
  constructor(runtime: OriginalEconomyTaskRuntime, options: DeepReadonly<OriginalEconomyTaskOptions>);
  advanceTask(task:import('./OriginalMarketEconomySchedule.mjs').OriginalEconomyTask,options?:{nowSeconds?:()=>number;budgetSeconds?:number}):DeepReadonly<{task:import('./OriginalMarketEconomySchedule.mjs').OriginalEconomyTask;complete:boolean;batches:number;elapsedSeconds:number;status:OriginalEconomyTaskStatus}>;
  step(): DeepReadonly<OriginalEconomyTaskStatus>;
  run(): DeepReadonly<OriginalEconomyTaskStatus>;
  status(): DeepReadonly<OriginalEconomyTaskStatus>;
}
