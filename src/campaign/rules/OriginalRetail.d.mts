import type { CampaignRuleProvider, DeepReadonly, ReadonlyWorld, CampaignEffectPlan } from '../Types.js';
export interface OriginalRetailState { id: string; version: number; schemaVersion: 1; data: { marketId: string; atTick: number; submarkets: Record<string,{ specId: string; sinceLastCargoUpdate: number; source: string }> } }
export function originalRetailStateId(marketId: string): string;
export function validateOriginalRetailState(world: ReadonlyWorld, marketId: string): DeepReadonly<OriginalRetailState>;
export function validateOriginalRetailWorld(world: ReadonlyWorld): void;
export function advanceOriginalRetailFrame(world: ReadonlyWorld): DeepReadonly<Pick<CampaignEffectPlan,'changes' | 'events'>>;
export const originalRetailProvider: CampaignRuleProvider;
