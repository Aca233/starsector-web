import reference from '../data/reference-logistics.json' with { type: 'json' };
import { finite, integer, isRecord, requireThat } from '../core/Values.mjs';

// Translation of LogisticsModule's quote functions. Inputs are EFFECTIVE stats,
// after hullmods/skills/mothballing; this does not invent a replacement stat resolver.
export const ORIGINAL_LOGISTICS_CONSTANTS = Object.freeze({ ...reference.settings });
const amount = (v, name) => finite(v, name, 0);
/** Read-only native sidebar estimate; absent replacement-provider inputs remain unknown. */
function repairCompletion(members) {
  const f = Math.fround;
  let supplyCost = 0, anyRecovery = false, allSuspended = true;
  for (const member of members) {
    const fighter = member.fighterCount !== null;
    if (!fighter) { if (member.recoveryPerDay > 0) anyRecovery = true; if (!member.suspendRepairs) allSuspended = false; }
    // FleetData's predicate differs for legacy fighter-wing members; do not simplify it to a ship-only filter.
    if (!fighter && (member.mothballed || member.suspendRepairs) || fighter && member.suspendRepairs) continue;
    const state = member.repairCompletionState;
    if (state === undefined || state === null) return null;
    requireThat(isRecord(state), 'INVALID_LOGISTICS', 'Invalid repair completion inputs');
    const hull = f(finite(state.hullFraction, 'repair estimate hull', 0, 1));
    const armor = f(finite(state.averageArmorFraction, 'repair estimate armor', 0, 1));
    const repairRate = f(finite(state.repairRatePerDayAtFullCrew, 'full-crew repair rate', 0));
    const crMissing = f(f(member.maxCR) - f(member.cr)), recoveryRate = f(member.recoveryPerDay);
    const crDays = crMissing <= 0 || recoveryRate <= 0 ? 0 : f(crMissing / recoveryRate);
    const repairDays = f(f(1 - Math.min(hull, armor)) / repairRate);
    const days = Math.min(1000, Math.max(repairDays, crDays));
    const hullOnly = member.needsRepairs && ! (member.cr < member.maxCR);
    const rate = hullOnly ? f(f(member.baseRecoveryPercentPerDay) * f(0.01)) : recoveryRate;
    const deploy = Math.max(f(0.01), f(hullOnly ? member.baseDeployCR : member.deployCR));
    const daily = rate > 0 ? f(f(f(member.deploymentSupplies) * rate) / deploy) : 0;
    supplyCost = f(supplyCost + f(daily * days));
    // Do not encode native NaN as a fabricated zero or destroy otherwise-valid billing/HUD data.
    if (!Number.isFinite(supplyCost)) return null;
  }
  return { supplyCost, applicable: anyRecovery || allSuspended };
}
export function quoteOriginalLogistics(input, constants = ORIGINAL_LOGISTICS_CONSTANTS) {
  requireThat(isRecord(input) && Array.isArray(input.members), 'INVALID_LOGISTICS', 'Expected effective fleet statistics');
  for (const [key,value] of Object.entries(constants)) amount(value, key);
  requireThat(constants.daysPerMonth > 0 && constants.secondsPerDay > 0, 'INVALID_LOGISTICS', 'Invalid time conversion');
  integer(constants.maxShips, 'max ships');
  let maintenance = 0, activeMaintenance = 0, recovery = 0, repairSuppliesPerDay = 0, baseFuelPerLightYear = 0;
  const members = input.members.map(member => {
    requireThat(isRecord(member) && typeof member.mothballed === 'boolean' && typeof member.suspendRepairs === 'boolean'
      && typeof member.needsRepairs === 'boolean', 'INVALID_LOGISTICS', 'Missing repair state');
    const monthly = amount(member.suppliesPerMonth, 'effective supplies/month');
    const fighterCount = member.fighterCount === null ? 1 : integer(member.fighterCount, 'existing fighters');
    const daily = monthly * fighterCount / constants.daysPerMonth;
    const cr = finite(member.cr, 'CR', 0, 1), maxCR = finite(member.maxCR, 'max CR', 0, 1);
    const rate = amount(member.recoveryPerDay, 'effective CR recovery');
    const baseRate = amount(member.baseRecoveryPercentPerDay, 'base CR recovery percent') * 0.01;
    const deploy = amount(member.deployCR, 'effective deploy CR');
    const baseDeploy = amount(member.baseDeployCR, 'base deploy CR');
    const suppliesToRecover = amount(member.deploymentSupplies, 'deployment supplies');
    let extra = 0;
    if (!member.mothballed && !member.suspendRepairs && rate > 0 && (cr < maxCR || member.needsRepairs)) {
      const hullOnly = member.needsRepairs && cr >= maxCR;
      extra = suppliesToRecover * (hullOnly ? baseRate : rate) / Math.max(0.01, hullOnly ? baseDeploy : deploy);
      // Native Fleet core sidebar includes recovering members' daily upkeep.
      // Display subtotal only: never charge it again in totalSuppliesPerDay.
      repairSuppliesPerDay += daily + extra;
    }
    maintenance += daily; recovery += extra;
    if (!member.mothballed) activeMaintenance += daily;
    baseFuelPerLightYear += amount(member.fuelPerLightYear, 'effective fuel/light year');
    return { maintenancePerDay:daily, recoveryPerDay:extra };
  });
  const cargo = input.cargo;
  requireThat(isRecord(cargo), 'INVALID_LOGISTICS', 'Missing cargo statistics');
  for (const key of ['spaceUsed','capacity','fuel','fuelCapacity','crew','marines','personnelCapacity']) amount(cargo[key], key);
  const excess = (used,capacity,rate) => Math.min(constants.excessPerCategoryCap,Math.max(0,used-capacity)*rate);
  const excessCargo = excess(cargo.spaceUsed,cargo.capacity,constants.excessCargoPerDay);
  const excessFuel = excess(cargo.fuel,cargo.fuelCapacity,constants.excessFuelPerDay);
  const excessPersonnel = excess(cargo.crew+cargo.marines,cargo.personnelCapacity,constants.excessPersonnelPerDay);
  const excessShips = activeMaintenance * constants.excessShipFraction * Math.max(0,input.members.length-constants.maxShips);
  const crew = cargo.crew*constants.crewPerDay, marines=cargo.marines*constants.marinesPerDay;
  const fuelPerLightYear = baseFuelPerLightYear * amount(input.fuelUseHyperMult, 'hyperspace fuel modifier');
  const result = {members, maintenancePerDay:maintenance,recoveryPerDay:recovery,repairSuppliesPerDay,crewPerDay:crew,marinesPerDay:marines,
    excessCargoPerDay:excessCargo,excessFuelPerDay:excessFuel,excessPersonnelPerDay:excessPersonnel,excessShipsPerDay:excessShips,
    totalSuppliesPerDay:maintenance+recovery+crew+marines+excessCargo+excessFuel+excessPersonnel+excessShips,
    baseFuelPerLightYear,fuelPerLightYear};
  for (const [key,value] of Object.entries(result)) if (key !== 'members') amount(value,key);
  return { ...result, repairCompletion: repairCompletion(input.members) };
}
