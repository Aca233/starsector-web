import type { CombatEngine } from '../../engine/simulation/CombatEngine';
import type { Ship } from '../../engine/simulation/Ship';
/** combat/new/T.java: base sight radius 3000; fog feather (radius + 250) * 1.05.
 * Chart-only visibility: combat AI/sensors and modifier-driven sight are not ported here. */
export const TACTICAL_SIGHT_RADIUS = 3000;
export function tacticalObservers(engine: CombatEngine): Ship[] {
  const craft = [...engine.fighters, ...engine.bombers];
  const leaders = engine.fighterSystem.playerWings.flatMap(wing => {
    const leader = craft.find(ship => !ship.isDead && ship.flightDeckWingId === wing.wingId);
    return leader ? [leader] : [];
  });
  return [...engine.capitalShips.filter(ship => ship.isPlayer && !ship.isDead), ...leaders];
}
export function tacticalContactVisible(ship: Ship, observers: readonly Ship[]): boolean {
  return !ship.isDead && (ship.isPlayer || observers.some(observer => observer.pos.distanceTo(ship.pos) <= TACTICAL_SIGHT_RADIUS));
}
