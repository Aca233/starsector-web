import { originalRetailProvider } from './rules/OriginalRetail.mjs';
import { originalCargoGesturesProvider } from './rules/OriginalCargoGestures.mjs';
import { cooperativeCargoProvider } from './rules/CooperativeCargo.mjs';
import { originalOrbitsProvider } from './rules/OriginalOrbits.mjs';
import { originalMarketProvider } from './rules/OriginalMarket.mjs';
import { originalCalendarProvider } from './rules/OriginalCalendar.mjs';
import { originalTravelProvider } from './rules/OriginalTravel.mjs';
import { cooperativeSimulationProvider } from './rules/CooperativeSimulation.mjs';
import { CampaignRuleRegistry } from './core/RuleRegistry.mjs';
import { originalLogisticsProvider } from './rules/OriginalLogistics.mjs';
import { cooperationProvider } from './rules/Cooperation.mjs';
import { originalFleetStatsProvider } from './rules/OriginalFleetStats.mjs';
import { encounterLifecycleProvider } from './rules/EncounterLifecycle.mjs';
/** A pinned, incomplete ruleset foundation. Unsupported mechanics remain unavailable. */
export function createReferenceRuleset() {
  return new CampaignRuleRegistry().register(originalRetailProvider).register(cooperativeCargoProvider).register(originalCargoGesturesProvider).register(originalOrbitsProvider).register(originalMarketProvider).register(originalCalendarProvider).register(originalTravelProvider).register(originalFleetStatsProvider).register(originalLogisticsProvider).register(cooperationProvider).register(encounterLifecycleProvider).register(cooperativeSimulationProvider).compile({
    id:'reference.cooperative',version:'0.17.0',originalReference:'Starsector 0.98a-RC8',
    providers:{retail:'reference.open-retail',cargoGestures:'reference.cargo-gestures',cargo:'cooperative.cargo',spaceMotion:'reference.orbits',market:'reference.market',calendar:'reference.calendar',travel:'reference.travel',simulation:'cooperative.simulation',fleetStats:'reference.fleet-stats',logistics:'reference.logistics',cooperation:'cooperative.parties',encounters:'cooperative.encounters'},
    settings:{simulation:{ticksPerSecond:60,encounterTimePolicy:'pause-participants',preparationTimeoutGameSeconds:30},cooperation:{rendezvousDistance:250,invitationLifetimeGameSeconds:3600,maxPartyFleets:4}}
  });
}
