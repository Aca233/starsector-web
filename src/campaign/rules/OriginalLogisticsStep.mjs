import reference from '../data/reference-logistics.json' with { type: 'json' };
import { finite, integer, jsonCopy, requireThat } from '../core/Values.mjs';
import { advanceOriginalRecovery } from './OriginalRecovery.mjs';
import { resolveOriginalFleetStats } from './OriginalFleetStats.mjs';
import { quoteOriginalLogistics } from './OriginalLogisticsQuote.mjs';

// Explicit multiplayer scheduler quantum; native advance() accepts variable dt.
export const LOGISTICS_TICKS_PER_SECOND = 60;
export const LOGISTICS_MAX_TICKS = 600;
/** Pure bounded native-step simulation. Movement must already be authority-derived. */
export function advanceOriginalFleet(input, resolveStats = resolveOriginalFleetStats) {
  integer(input.ticks, 'logistics ticks', 0);
  requireThat(input.ticks <= LOGISTICS_MAX_TICKS, 'SIMULATION_LIMIT', 'Split long intervals into bounded tick batches');
  requireThat(typeof input.aiMode === 'boolean', 'INVALID_LOGISTICS', 'AI mode must be explicit');
  const motion = input.motion;
  requireThat(motion && typeof motion.inHyperspace === 'boolean', 'INVALID_LOGISTICS', 'Missing motion context');
  for (const key of ['speed', 'hyperFuelMultiplier', 'normalFuelMultiplier', 'hiddenFuelMultiplier']) finite(motion[key], key, 0);
  const fleet = jsonCopy(input.fleet), members = jsonCopy(input.members);
  const seconds = 1 / LOGISTICS_TICKS_PER_SECOND, days = seconds / reference.settings.secondsPerDay;
  let suppliesConsumed = 0, fuelConsumed = 0;
  const memberReports = Object.fromEntries(members.map(m => [m.id, { shortageCRLoss: 0, losingCR: false, repairsCompleted: false }]));
  for (let tick = 0; tick < input.ticks; tick++) {
    const stats = resolveStats(fleet, members, { aiMode: input.aiMode }), quote = quoteOriginalLogistics(stats);
    const supplies = finite(fleet.cargo.supplies ?? 0, 'supplies', 0);
    // LogisticsModule.advance uses starting supplies > 0 even when insufficient for this whole step.
    const hasSupplies = input.aiMode || supplies > 0;
    if (!input.aiMode) {
      const consumed = Math.min(supplies, finite(quote.totalSuppliesPerDay * days, 'supply charge', 0));
      fleet.cargo.supplies = Math.max(0, supplies - consumed); suppliesConsumed += consumed;
    }
    members.forEach((member, index) => {
      // RepairTracker clears the undo CR on every positive-time advance, even while mothballed.
      // A zero-tick read/preview never enters this loop and therefore preserves the saved value.
      if (member.logistics && Object.hasOwn(member.logistics, 'crPriorToMothballing')) member.logistics.crPriorToMothballing = 0;
      const result = advanceOriginalRecovery(member.condition, stats.members[index], days, hasSupplies);
      member.condition = result.condition;
      const report = memberReports[member.id];
      report.shortageCRLoss += result.shortageCRLoss; report.losingCR = result.losingCR;
      report.repairsCompleted ||= result.repairsCompleted;
    });
    if (!input.aiMode) {
      const cappedSpeed = Math.min(motion.speed, reference.navigation.baseTravelSpeed + 20 * reference.navigation.speedPerBurnLevel);
      const ly = cappedSpeed * seconds / reference.navigation.unitsPerLightYear;
      const multiplier = (motion.inHyperspace ? motion.hyperFuelMultiplier : motion.normalFuelMultiplier) * motion.hiddenFuelMultiplier;
      const required = finite(quote.baseFuelPerLightYear * multiplier * ly, 'fuel charge', 0);
      const fuel = finite(fleet.cargo.fuel ?? 0, 'fuel', 0), consumed = Math.min(fuel, required);
      fleet.cargo.fuel = Math.max(0, fuel - consumed); fuelConsumed += consumed;
    }
  }
  finite(suppliesConsumed, 'total supplies consumed', 0); finite(fuelConsumed, 'total fuel consumed', 0);
  return { fleet, members, suppliesConsumed, fuelConsumed, memberReports, elapsedGameSeconds: input.ticks / LOGISTICS_TICKS_PER_SECOND };
}
