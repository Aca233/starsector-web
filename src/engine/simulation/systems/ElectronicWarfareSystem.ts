import type { Ship } from '../Ship';
/** Same-team navigation/ECM support. Hostile teams do not grant each other bonuses. */
export function updateElectronicWarfare(ships: readonly Ship[]): void {
  const teams = new Map<number, {ecm:number; nav:number}>();
  for (const ship of ships) {
    if (ship.isDead || ship.isRetreated || ship.spec.hullSize === 'FIGHTER' || ship.spec.sourceHullTraits?.includes('STATION_MODULE')) continue;
    const rating = teams.get(ship.teamId) ?? {ecm:0, nav:0};
    rating.ecm += ship.hullStats.ecmRating; rating.nav += ship.hullStats.navRating; teams.set(ship.teamId,rating);
  }
  for (const rating of teams.values()) rating.ecm = Math.trunc(Math.max(0,rating.ecm));
  const penalty = (own:number, other:number) => Math.round(Math.min(10,other) * (own > 0 && other > 0 ? other / (own + other) : 1));
  for (const ship of ships) {
    const own = teams.get(ship.teamId) ?? {ecm:0,nav:0};
    // Apply the strongest hostile fleet's penalty; do not multiply the two-team cap.
    const raw = Math.max(0,...[...teams].filter(([id])=>id!==ship.teamId).map(([,rating])=>penalty(own.ecm,rating.ecm)));
    const inactive = ship.isDead || ship.isRetreated || ship.spec.hullSize === 'FIGHTER';
    ship.fleetSpeedBonusPercent = inactive ? 0 : Math.min(20,own.nav);
    ship.ecmRangePenalty = inactive ? 0 : Math.max(0,Math.min(10,raw * ship.hullStats.ecmPenaltyMultiplier));
  }
}
