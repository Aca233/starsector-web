import type { CombatEngine } from '../../engine/simulation/CombatEngine';
import type { Ship } from '../../engine/simulation/Ship';
import { combatObservers, contactVisible } from '../../engine/simulation/systems/CombatVisibility';
export function tacticalObservers(engine: CombatEngine): Ship[] { return combatObservers(engine.ships,engine.playerShip.teamId); }
export function tacticalContactVisible(ship: Ship, observers: readonly Ship[]): boolean {
  return contactVisible(ship,observers,observers[0]?.teamId ?? 0);
}
