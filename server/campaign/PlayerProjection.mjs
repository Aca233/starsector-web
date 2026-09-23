import { projectCampaignBodies } from './BodyProjection.mjs';
import { projectFleetLogistics } from './FleetHudProjection.mjs';
import { canCommandFleet } from '../../src/campaign/rules/FleetControl.mjs';
import { immutableJSON, requireThat } from '../../src/campaign/core/Values.mjs';
/** Explicit cooperative disclosure policy, NOT a native sensor simulation.
 * Only commandable assets and consensual party navigation are visible. No raw world/outbox escapes.
 */
export function projectCampaignPlayer(world, playerId, rules) {
  if (rules) rules.validateWorld(world);
  const calendar = rules?.services.calendar?.projectWorld?.(world) ?? null;
  const self = world.players[playerId]; requireThat(self, 'FORBIDDEN', 'Player is not in this world');
  const owned = new Set(Object.values(world.fleets).filter(f => canCommandFleet(world, f, playerId)).map(f => f.id));
  const partyIds = new Set([...owned].map(id => world.fleets[id].partyId).filter(Boolean));
  const parties = [...partyIds].map(id => world.parties[id]);
  const visible = new Set([...owned, ...parties.flatMap(p => p.fleetIds)]);
  const fleets = [...visible].sort().map(id => {
    const f = world.fleets[id], canCommand = owned.has(id);
    return { id, version: f.version, name: f.name ?? id, locationId: f.locationId, position: f.position, canCommand,
      partyId: f.partyId, encounterId: f.encounterId,
      navigation: f.navigation ? { interaction: f.navigation.interaction ?? null, jumpSourceId: f.navigation.transition?.sourceId ?? null, velocity: f.navigation.velocity, destination: f.navigation.destination,
        jumpPhase: f.navigation.transition?.phase ?? null, noEngageUntilTick: f.navigation.noEngageUntilTick ?? 0 } : null,
      private: canCommand ? { ...projectFleetLogistics(world, f, rules), cargo: f.cargo, members: f.memberIds.map(memberId => { const m = world.members[memberId];
        return { id: m.id, version: m.version, hullId: m.loadout.hullId, hullFraction: m.condition.hullFraction,
          combatReadiness: m.condition.combatReadiness, mothballed: m.logistics?.mothballed ?? false, repairsSuspended: m.logistics?.suspendRepairs ?? false }; }) } : null };
  });
  const locationIds = new Set(fleets.map(f => f.locationId));
  const locations = [...locationIds].sort().map(id => ({ id, name: world.locations[id].name, space: world.locations[id].navigation?.space ?? 'unavailable', background: typeof world.locations[id].presentation?.background === 'string' ? world.locations[id].presentation.background : null, navigationUnavailable: world.rules.providers.travel?.id === 'reference.travel' && world.locations[id].navigation?.terrain.length ? '此星系地形与生成阶段尚未接通，航行暂不可用' : null }));
  const points = Object.values(world.spaceEntities).filter(p => p.jump !== undefined && locationIds.has(p.locationId)).map(p => ({
    id: p.id, version: p.version, name: p.name, locationId: p.locationId, position: p.position, radius: p.radius, tags: p.tags,
    destinations: (p.jump?.destinations ?? []).map((d, index) => { const target = world.spaceEntities[d.targetId];
      return { index, targetId: target.id, targetVersion: target.version, name: target.name, locationName: world.locations[target.locationId].name }; }),
  }));
  // Public markers, but contents only when an authorized fleet can physically collect.
  // Raw provenance and arbitrary container metadata never reach the player DTO.
  const cargoPods = Object.values(world.spaceEntities).filter(p => p.cargoPod?.schemaVersion === 1 && locationIds.has(p.locationId)).map(p => {
    const accessibleToFleetIds = [...owned].filter(id => rules?.services.cargo?.canCollect(world, world.fleets[id], p));
    return { id: p.id, version: p.version, name: p.name, locationId: p.locationId, position: p.position, radius: p.radius,
      accessibleToFleetIds, items: accessibleToFleetIds.length ? p.cargoPod.items : null, lifecyclePolicy: 'persistent-until-collected' };
  });
  const invitations = Object.values(world.invitations).filter(i => owned.has(i.fromFleetId) || owned.has(i.toFleetId) || i.createdBy === playerId).map(i => ({
    id: i.id, version: i.version, fromFleetId: i.fromFleetId, toFleetId: i.toFleetId, fromName: world.fleets[i.fromFleetId].name ?? i.fromFleetId,
    toName: world.fleets[i.toFleetId].name ?? i.toFleetId, fromVersion: world.fleets[i.fromFleetId].version, toVersion: world.fleets[i.toFleetId].version,
    partyId: i.partyId, partyVersion: i.partyId ? world.parties[i.partyId].version : null, expiresAt: i.expiresAt, canAccept: owned.has(i.toFleetId),
  }));
  // The multiplayer invitation directory exposes identity only, never positions or inventories.
  const contacts = Object.values(world.fleets).filter(f => f.control.kind === 'player' && !owned.has(f.id)).map(f => ({ id: f.id, name: f.name ?? f.id, commander: world.players[f.control.id].name }));
  return immutableJSON({ schemaVersion: 1, visibilityPolicy: 'control-and-consensual-party', worldId: world.id, revision: world.revision, clock: world.clock, calendar,
    rules: { id: world.rules.id, version: world.rules.version, originalReference: world.rules.originalReference }, self: { id: self.id, name: self.name },
    ports: rules?.services.market?.ports?.(world, { kind: 'player', id: playerId }) ?? [],
    fleets, locations, points, cargoPods, bodies: projectCampaignBodies(world, locationIds), parties: parties.map(p => ({ id: p.id, version: p.version, leaderFleetId: p.leaderFleetId, fleetIds: p.fleetIds })), invitations, contacts });
}
