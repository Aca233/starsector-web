import type { CampaignEvent, CampaignRuleContext, CampaignEffectPlan, DeepReadonly, Fleet, Member, ReadonlyWorld, SpaceEntity, JsonObject } from '../Types.js';
import type { LogisticsInput } from './OriginalLogistics.mjs';
export function originalFleetRadius(members: DeepReadonly<Member[]>): number;
export function quoteOriginalJumpFuel(effectiveStats: LogisticsInput, inHyperspace: boolean): number;
export function nearestOriginalGravityWell(world: ReadonlyWorld, fleet: DeepReadonly<Fleet>): DeepReadonly<SpaceEntity> | null;
export function requestOriginalJump(ctx: CampaignRuleContext, payload: DeepReadonly<JsonObject>): CampaignEffectPlan;
export function advanceOriginalTransitions(world: ReadonlyWorld, fleet: DeepReadonly<Fleet>, members: DeepReadonly<Member[]>): { fleet: DeepReadonly<Fleet>; events: CampaignEvent[] };
