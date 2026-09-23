import { isRecord } from '../../src/campaign/core/Values.mjs';
/** Whitelisted public spatial presentation only; never inventory, market state or player fleet state. */
export function projectCampaignBodies(world, locationIds) {
  return Object.values(world.spaceEntities).filter(e => locationIds.has(e.locationId) && isRecord(e.presentation)
    && ['star', 'planet', 'custom'].includes(e.presentation.kind)
    && typeof e.presentation.nativeType === 'string' && typeof e.presentation.sourceHandle === 'string')
    .map(e => ({ id: e.id, version: e.version, name: e.name, locationId: e.locationId, position: e.position, radius: e.radius,
      facingDegrees: Number.isFinite(e.facingDegrees) ? e.facingDegrees : 0,
      presentation: { kind: e.presentation.kind, nativeType: e.presentation.nativeType, sourceHandle: e.presentation.sourceHandle },
      // Authored initial texture phase must be explicit, not a fresh random number on reconnect.
      surfacePhase: Number.isFinite(e.surfacePhase) ? e.surfacePhase : null,
      cloudPhase: Number.isFinite(e.cloudPhase) ? e.cloudPhase : null,
      lightSourceId: typeof e.lightSourceId === 'string' && world.spaceEntities[e.lightSourceId]?.locationId === e.locationId ? e.lightSourceId : null,
      orbit: isRecord(e.orbit) && typeof e.orbit.focusId === 'string' && Number.isFinite(e.orbit.radius)
        ? { focusId: e.orbit.focusId, radius: e.orbit.radius } : null,
    }));
}
