import type { Ship } from '../Ship';

/** ElectronicWarfareScript: both sides suffer penalties, not only the lower-rated fleet. */
export function updateElectronicWarfare(ships: readonly Ship[]): void {
  let player = 0, enemy = 0;
  for (const ship of ships) {
    if (ship.isDead || ship.spec.hullSize === 'FIGHTER' || ship.spec.sourceHullTraits?.includes('STATION_MODULE')) continue;
    if (ship.isPlayer) player += ship.hullStats.ecmRating; else enemy += ship.hullStats.ecmRating;
  }
  player = Math.trunc(Math.max(0, player)); enemy = Math.trunc(Math.max(0, enemy));
  const penalty = (own: number, other: number) => Math.round(Math.min(10, other) * (own > 0 && other > 0 ? other / (own + other) : 1));
  for (const ship of ships) {
    const raw = ship.isPlayer ? penalty(player, enemy) : penalty(enemy, player);
    ship.ecmRangePenalty = ship.isDead || ship.spec.hullSize === 'FIGHTER' ? 0
      : Math.max(0, Math.min(10, raw * ship.hullStats.ecmPenaltyMultiplier));
  }
}
