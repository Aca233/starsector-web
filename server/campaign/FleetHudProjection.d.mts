import type { CompiledRuleset, DeepReadonly, Fleet, ReadonlyWorld } from '../../src/campaign/Types.js';
import type { FleetLogisticsView } from '../../src/campaign/client/Protocol.js';
export function projectFleetLogistics(world: ReadonlyWorld, fleet: DeepReadonly<Fleet>, rules?: CompiledRuleset): { logistics: FleetLogisticsView | null; logisticsUnavailable: string | null };
