import reference from '../data/reference-logistics.json' with { type: 'json' };
import { finite, integer, identifier, isRecord, requireThat } from '../core/Values.mjs';

const SIZE_BONUS = { FRIGATE: 30, DESTROYER: 60, CRUISER: 100, CAPITAL_SHIP: 200 };
const SUPPORTED_MODS = new Set(['efficiency_overhaul', 'expanded_cargo_holds', 'auxiliary_fuel_tanks', 'additional_berthing',
  'militarized_subsystems', 'civgrade', 'hbi', 'ballistic_rangefinder']);
const list = (value, label) => {
  requireThat(Array.isArray(value) && new Set(value).size === value.length, 'INVALID_LOGISTICS', `Invalid ${label}`);
  value.forEach(id => identifier(id, label)); return value;
};
export const needsOriginalRepairs = condition => condition.hullFraction < 1 || condition.armor !== null;

function repairCompletionState(condition, repairRatePerDayAtFullCrew) {
  const hullFraction = finite(condition.hullFraction, 'hull for repair estimate', 0, 1), armor = condition.armor;
  let averageArmorFraction = 1;
  if (armor !== null) {
    requireThat(isRecord(armor), 'INVALID_LOGISTICS', 'Missing captured armor grid');
    integer(armor.cols, 'armor columns', 1); integer(armor.rows, 'armor rows', 1);
    requireThat(Array.isArray(armor.fractions) && armor.fractions.length === armor.cols * armor.rows, 'INVALID_LOGISTICS', 'Invalid captured armor grid');
    armor.fractions.forEach(value => finite(value, 'armor fraction', 0, 1));
    // Native ModuleStatus treats undersized grids as missing. Keep the stored grid untouched in this projection.
    if (armor.cols >= 4 && armor.rows >= 4) {
      let sum = 0;
      for (let x = 0; x < armor.cols; x++) for (let y = 0; y < armor.rows; y++) sum = Math.fround(sum + Math.fround(armor.fractions[y * armor.cols + x]));
      averageArmorFraction = Math.fround(sum / armor.fractions.length);
    }
  }
  return { hullFraction, averageArmorFraction, repairRatePerDayAtFullCrew };
}

/** Source-derived, deliberately rejects unported effects instead of silently ignoring them. */
export function resolveOriginalFleetStats(fleet, members, { aiMode = false, world, includeRepairCompletion = false } = {}) {
  requireThat(isRecord(fleet) && Array.isArray(members) && members.length === fleet.memberIds.length,
    'INVALID_LOGISTICS', 'Expected the complete ordered fleet');
  for (let i = 0; i < members.length; i++) requireThat(members[i].id === fleet.memberIds[i] && members[i].fleetId === fleet.id,
    'INVALID_LOGISTICS', 'Member order/reference mismatch');
  requireThat(typeof aiMode === 'boolean' && typeof includeRepairCompletion === 'boolean', 'INVALID_LOGISTICS', 'Invalid stat resolution mode');
  if (world) {
    const owner = fleet.owner.kind === 'player' ? world.players[fleet.owner.id] : world.factions[fleet.owner.id];
    const controller = fleet.control.kind === 'player' ? world.players[fleet.control.id] : fleet.control.kind === 'faction' ? world.factions[fleet.control.id] : null;
    requireThat(owner && [owner, controller].every(person => !person?.skills || Object.keys(person.skills).length === 0), 'UNSUPPORTED_LOGISTICS', 'Commander skill effects are not ported yet');
  }
  requireThat(!fleet.commanderId && !fleet.logisticsModifiers, 'UNSUPPORTED_LOGISTICS', 'Unported fleet modifiers');
  const resolved = members.map(member => {
    requireThat(!member.officerId && !member.skills, 'UNSUPPORTED_LOGISTICS', 'Unported officer/skill effects');
    const hull = reference.hulls[member.loadout.hullId];
    requireThat(hull && !hull.hasModules && Object.hasOwn(SIZE_BONUS, hull.hullSize), 'UNSUPPORTED_LOGISTICS',
      `Unported hull/module logistics: ${member.loadout.hullId}`);
    requireThat(member.condition.status === 'ready', 'UNSUPPORTED_LOGISTICS', 'Destroyed ships require explicit recovery before fleet upkeep');
    const acceptedKeys = ['hullId', 'hullMods', 'sMods', 'weapons', 'weaponGroups', 'vents', 'capacitors'];
    requireThat(Object.keys(member.loadout).every(k => acceptedKeys.includes(k)), 'UNSUPPORTED_LOGISTICS', 'Unported loadout fields (officers, modules or wings)');
    const installed = list(member.loadout.hullMods ?? [], 'hullmods');
    const mods = new Set([...hull.builtInMods, ...installed]);
    const sMods = new Set(list(member.loadout.sMods ?? [], 'S-mods'));
    for (const id of mods) requireThat(SUPPORTED_MODS.has(id), 'UNSUPPORTED_LOGISTICS', `Unported hullmod logistics: ${id}`);
    for (const id of sMods) requireThat(mods.has(id), 'INVALID_LOGISTICS', `S-mod is not installed: ${id}`);
    const flags = member.logistics ?? { mothballed: false, suspendRepairs: false };
    requireThat(typeof flags.mothballed === 'boolean' && typeof flags.suspendRepairs === 'boolean', 'INVALID_LOGISTICS', 'Invalid repair flags');
    let maintenanceMult = 1, maintenancePercent = 0, crewMult = 1, fuelMult = 1, recoveryMult = 1, repairMult = 1;
    let cargoCapacity = hull.cargoCapacity, fuelCapacity = hull.fuelCapacity, personnelCapacity = hull.maxCrew;
    if (mods.has('efficiency_overhaul')) {
      maintenanceMult = crewMult = fuelMult = sMods.has('efficiency_overhaul') ? 0.7 : 0.8;
      recoveryMult = repairMult = 1.5;
    }
    if (mods.has('militarized_subsystems') && !sMods.has('militarized_subsystems')) crewMult *= 2;
    const expansion = (id, base) => {
      if (!mods.has(id)) return 0;
      if (!sMods.has(id) && mods.has('civgrade') && !mods.has('militarized_subsystems')) maintenancePercent += 50;
      return Math.max(SIZE_BONUS[hull.hullSize], base * 0.3) * (sMods.has(id) ? 2 : 1);
    };
    cargoCapacity += expansion('expanded_cargo_holds', hull.cargoCapacity);
    fuelCapacity += expansion('auxiliary_fuel_tanks', hull.fuelCapacity);
    personnelCapacity += expansion('additional_berthing', hull.maxCrew);
    const mothballed = flags.mothballed;
    return {
      id: member.id, maxBurn: hull.maxBurn + (mods.has('militarized_subsystems') ? 1 : 0), minCrew: mothballed ? 0 : Math.ceil(hull.minCrew * crewMult),
      cargoCapacity: mothballed ? 0 : Math.trunc(cargoCapacity), fuelCapacity: mothballed ? 0 : Math.trunc(fuelCapacity),
      personnelCapacity: mothballed ? 0 : Math.trunc(personnelCapacity),
      mothballed, suspendRepairs: flags.suspendRepairs, fighterCount: null,
      needsRepairs: needsOriginalRepairs(member.condition), cr: member.condition.combatReadiness,
      suppliesPerMonth: hull.suppliesPerMonth * (1 + maintenancePercent / 100) * maintenanceMult * (mothballed ? reference.recovery.mothballedMaintenanceMult : 1),
      fuelPerLightYear: hull.fuelPerLightYear * fuelMult,
      baseRecoveryPercentPerDay: hull.baseRecoveryPercentPerDay, uncrewedRecoveryPerDay: hull.baseRecoveryPercentPerDay * 0.01 * recoveryMult,
      repairRatePerDayAtFullCrew: reference.recovery.repairPercentPerDay[hull.hullSize] * 0.01 * repairMult,
      ...(includeRepairCompletion ? { repairCompletionState: repairCompletionState(member.condition, reference.recovery.repairPercentPerDay[hull.hullSize] * 0.01 * repairMult) } : {}),
      deploymentSupplies: hull.deploymentSupplies, deployCR: hull.deployCRPercent / 100, baseDeployCR: hull.deployCRPercent / 100,
      aiCaptain: false,
    };
  });
  let crew = finite(fleet.cargo.crew ?? 0, 'crew', 0), spaceUsed = 0;
  for (const [id, quantity] of Object.entries(fleet.cargo)) {
    finite(quantity, 'cargo quantity', 0);
    if (quantity === 0) continue;
    const commodity = reference.commodities[id];
    requireThat(commodity, 'UNSUPPORTED_LOGISTICS', `Unported cargo space: ${id}`);
    spaceUsed += quantity * commodity.cargoSpace;
  }
  const totalMinimum = resolved.reduce((sum, m) => sum + m.minCrew, 0);
  if (aiMode) crew = totalMinimum;
  const crewRatio = totalMinimum === 0 ? 0 : Math.min(1, crew / totalMinimum);
  // FleetData.recrewFleetMembersV2: rounded per member, in fleet order, not a uniform fractional ratio.
  const stats = resolved.map(m => {
    const assigned = Math.min(crew, Math.floor(m.minCrew * crewRatio + 0.5)); crew -= assigned;
    const crewFraction = m.minCrew === 0 ? 1 : Math.min(1, assigned / m.minCrew);
    return { ...m, crewFraction, assignedCrew: assigned,
      maxCR: Math.max(0, 0.7 - 0.5 * (1 - crewFraction)), recoveryPerDay: m.uncrewedRecoveryPerDay * crewFraction,
      repairRatePerDay: m.repairRatePerDayAtFullCrew * crewFraction };
  });
  return { minimumCrew: totalMinimum, members: stats, fuelUseHyperMult: 1, cargo: { spaceUsed,
    capacity: stats.reduce((sum, m) => sum + m.cargoCapacity, 0),
    fuelCapacity: stats.reduce((sum, m) => sum + m.fuelCapacity, 0),
    personnelCapacity: stats.reduce((sum, m) => sum + m.personnelCapacity, 0),
    fuel: fleet.cargo.fuel ?? 0, crew: fleet.cargo.crew ?? 0, marines: fleet.cargo.marines ?? 0,
  } };
}
export const originalFleetStatsProvider = Object.freeze({
  id: 'reference.fleet-stats', version: '0.3.0', service: 'fleetStats', apiVersion: 1,
  capabilities: ['ordered-native-crew-allocation', 'effective-logistics-stats', 'effective-travel-stats'],
  evidence: [{ source: 'FleetMember.java / FleetData.java / CRPluginImpl.java / native hullmod sources',
    scope: 'Known hullmods and base crew/repair/capacity stats only; unsupported effects fail explicitly',
    settings: reference.recovery, sourceDigests: reference.provenance }],
  methods: { resolve: resolveOriginalFleetStats },
});
