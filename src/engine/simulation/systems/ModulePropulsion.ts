import type { Ship } from '../Ship';

/** Pure authority query: no accumulated modifiers, extra timers or hull-ID bridge.
 * The declared slot list survives missing modules; live children are never the denominator. */
export function modulePropulsionState(ship: Ship) {
  const config = ship.spec.modulePropulsion;
  if (!config) return undefined;
  let power = 0, online = 0;
  for (const slotId of config.slotIds) {
    const part = ship.childModules.find(child => child.parentShip === ship && child.moduleMount?.slotId === slotId);
    if (!part || part.isDead || part.hullHp <= 0 || part.isRetreated || part.isDocked
      || !part.spec.inheritParentEngineCommands || !part.engineController.engines.length || part.engineController.isFlamedOut) continue;
    const contribution = part.engineController.movementMultiplier;
    power += contribution;
    if (contribution > 0) online++;
  }
  const level = config.slotIds.length ? power / config.slotIds.length : 0;
  const fraction = (reserve: number) => reserve + (1 - reserve) * level;
  return { online, total: config.slotIds.length, level, speed: fraction(config.reserveSpeed),
    acceleration: fraction(config.reserveAcceleration), turn: fraction(config.reserveTurn) };
}
