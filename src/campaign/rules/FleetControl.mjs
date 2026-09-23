import { requireThat } from '../core/Values.mjs';

/** Cooperative authorization policy. Control is explicit and never inferred from title to assets. */
export function canCommandFleet(world, fleet, playerId) {
  if (!world.players[playerId]) return false;
  if (fleet.control.kind === 'player') return fleet.control.id === playerId;
  if (fleet.control.kind === 'faction') return ['leader', 'manager'].includes(world.factions[fleet.control.id]?.playerRoles[playerId]);
  return false;
}
export function fleetUsesNpcLogistics(fleet) {
  requireThat(fleet.control && ['player', 'faction', 'npc'].includes(fleet.control.kind), 'INVALID_CONTROL', 'Fleet requires an explicit controller');
  return fleet.control.kind === 'npc';
}
