import type { DeepReadonly } from '../Types.js';
import type { EconomyMutable, EconomyIndustry } from './OriginalMarketEconomy.mjs';
import type { OriginalIndustryOperating, OriginalResourceIndustryModifiers } from './OriginalResourceIndustries.mjs';
export type OriginalCivicIndustryId = 'population' | 'spaceport' | 'megaport' | 'station_base' | 'orbitalstation' | 'battlestation' | 'starfortress' | 'orbitalstation_mid' | 'battlestation_mid' | 'starfortress_mid' | 'orbitalstation_high' | 'battlestation_high' | 'starfortress_high' | 'grounddefenses' | 'heavybatteries' | 'patrolhq' | 'militarybase' | 'highcommand';
export interface OriginalCivicIndustryModifiers extends Omit<OriginalResourceIndustryModifiers, 'specialItemId'> { specialItemId: 'fullerene_spool' | null }
export interface OriginalCivicIndustryState {
  schemaVersion: 1; industryId: OriginalCivicIndustryId;
  supplyBonus: EconomyMutable; demandReduction: EconomyMutable;
  supply: Record<string, EconomyMutable>; demand: Record<string, EconomyMutable>;
}
export const ORIGINAL_INDUSTRY_COMMODITIES: DeepReadonly<{
  schemaVersion: 1; originalReference: string; scope: string; sources: Record<string, { sha256: string }>;
  industries: Record<OriginalCivicIndustryId, { plugin: string; className: 'PopulationAndInfrastructure' | 'Spaceport' | 'MilitaryBase' | 'GroundDefenses' | 'OrbitalStation'; tags: string[] }>;
  resourceConditionPlugins: Record<string, string>; resourceIndustryPlugins: Record<string, string>;
  conditions: Record<string, { plugin: string; commodityEffect: 'none-direct' }>;
}>;
export function validateOriginalCivicIndustry(state: unknown): asserts state is DeepReadonly<OriginalCivicIndustryState>;
export function newOriginalCivicIndustry(industryId: OriginalCivicIndustryId): DeepReadonly<OriginalCivicIndustryState>;
export function applyOriginalCivicIndustry(input: DeepReadonly<{
  state: OriginalCivicIndustryState; marketSize: number; habitable: boolean; operating: OriginalIndustryOperating; modifiers: OriginalCivicIndustryModifiers;
}>): DeepReadonly<OriginalCivicIndustryState>;
export function originalCivicIndustryOutput(state: DeepReadonly<OriginalCivicIndustryState>, context: DeepReadonly<{ commodityId: string; illegal: boolean }>): DeepReadonly<EconomyIndustry>;
