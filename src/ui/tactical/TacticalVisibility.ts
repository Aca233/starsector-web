import type { CombatEngine } from '../../engine/simulation/CombatEngine';
import type { Ship } from '../../engine/simulation/Ship';
import { combatObservers, contactVisible } from '../../engine/simulation/systems/CombatVisibility';
export function tacticalObservers(engine: CombatEngine): Ship[] { return combatObservers(engine.ships,engine.playerShip.teamId); }
// The observing team survives loss of its last observer; never fall back to the host.
export function tacticalContactVisible(ship: Ship, observers: readonly Ship[], team: number, revealAll = false): boolean {
  return contactVisible(ship,observers,team,revealAll);
}
