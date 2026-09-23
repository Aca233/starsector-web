import { fleetUsesNpcLogistics } from '../../src/campaign/rules/FleetControl.mjs';
import { finite, requireThat } from '../../src/campaign/core/Values.mjs';
/** Read-only, owner-private DTO from the same pinned providers that bill the world.
 * Missing/unported stats are not zero. Never leak raw provider exceptions or state. */
export function projectFleetLogistics(world, fleet, rules) {
  if (!rules) return { logistics: null, logisticsUnavailable: 'RULES_UNAVAILABLE' };
  requireThat(rules.acceptsLock(world.rules), 'RULESET_MISMATCH', 'Projection rules must match the saved world');
  const services = rules.services;
  if (!services.fleetStats?.resolve || !services.logistics?.quote) return { logistics: null, logisticsUnavailable: 'RULES_UNAVAILABLE' };
  try {
    const members = fleet.memberIds.map(id => world.members[id]);
    const input = services.fleetStats.resolve(fleet, members, { aiMode: fleetUsesNpcLogistics(fleet), world, includeRepairCompletion: true });
    const quote = services.logistics.quote(input), cargo = input.cargo;
    const logistics = { cargoSpaceUsed: cargo.spaceUsed, cargoCapacity: cargo.capacity, fuelCapacity: cargo.fuelCapacity,
      personnelUsed: cargo.crew + cargo.marines, personnelCapacity: cargo.personnelCapacity,
      suppliesPerDay: quote.totalSuppliesPerDay, maintenancePerDay: quote.maintenancePerDay,
      recoveryPerDay: quote.recoveryPerDay, fuelPerLightYear: quote.fuelPerLightYear };
    for (const [key, value] of Object.entries(logistics)) finite(value, key, 0);
    logistics.minimumCrew = input.minimumCrew == null ? null : finite(input.minimumCrew, 'minimum crew', 0);
    // Replacement providers may omit this native-specific sidebar subtotal.
    logistics.repairSuppliesPerDay = quote.repairSuppliesPerDay == null ? null
      : finite(quote.repairSuppliesPerDay, 'repair supplies/day', 0);
    const completion = quote.repairCompletion;
    logistics.repairCompletion = null;
    if (completion != null) {
      requireThat(typeof completion.applicable === 'boolean', 'INVALID_LOGISTICS', 'Missing repair applicability');
      logistics.repairCompletion = { supplyCost: finite(completion.supplyCost, 'completion supplies', 0), applicable: completion.applicable };
    }
    return { logistics, logisticsUnavailable: null };
  } catch (error) {
    // The gateway stays usable for recovery/diagnostics of an unsupported fleet.
    // Details belong to host diagnostics, not cross-player error messages.
    const code = typeof error?.code === 'string' && /^[A-Z_]{1,64}$/.test(error.code) ? error.code : 'STATS_UNAVAILABLE';
    return { logistics: null, logisticsUnavailable: code };
  }
}
