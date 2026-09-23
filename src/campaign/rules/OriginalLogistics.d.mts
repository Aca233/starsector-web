import type { advanceOriginalFleet } from './OriginalLogisticsStep.mjs';
import type { CampaignRuleProvider } from '../Types.js';
export interface EffectiveMemberLogistics {
  repairCompletionState?: { hullFraction: number; averageArmorFraction: number; repairRatePerDayAtFullCrew: number } | null;
  mothballed: boolean; suspendRepairs: boolean; needsRepairs: boolean; suppliesPerMonth: number; fighterCount: number | null;
  cr: number; maxCR: number; recoveryPerDay: number; baseRecoveryPercentPerDay: number;
  deployCR: number; baseDeployCR: number; deploymentSupplies: number; fuelPerLightYear: number;
}
export interface LogisticsInput {
  members: readonly EffectiveMemberLogistics[];
  cargo: { spaceUsed: number; capacity: number; fuel: number; fuelCapacity: number; crew: number; marines: number; personnelCapacity: number };
  fuelUseHyperMult: number;
}
export interface LogisticsConstants {
  daysPerMonth: number; secondsPerDay: number; crewPerDay: number; marinesPerDay: number;
  excessCargoPerDay: number; excessFuelPerDay: number; excessPersonnelPerDay: number; excessPerCategoryCap: number;
  maxShips: number; excessShipFraction: number;
}
export interface LogisticsQuote {
  repairCompletion: { supplyCost: number; applicable: boolean } | null;
  members: { maintenancePerDay: number; recoveryPerDay: number }[];
  maintenancePerDay: number; recoveryPerDay: number; repairSuppliesPerDay: number; crewPerDay: number; marinesPerDay: number;
  excessCargoPerDay: number; excessFuelPerDay: number; excessPersonnelPerDay: number; excessShipsPerDay: number;
  totalSuppliesPerDay: number; baseFuelPerLightYear: number; fuelPerLightYear: number;
}
export const ORIGINAL_LOGISTICS_CONSTANTS: Readonly<LogisticsConstants>;
export function quoteOriginalLogistics(input: LogisticsInput, constants?: LogisticsConstants): LogisticsQuote;
export const originalLogisticsProvider: CampaignRuleProvider & { methods: { quote: typeof quoteOriginalLogistics; advance: typeof advanceOriginalFleet } };
