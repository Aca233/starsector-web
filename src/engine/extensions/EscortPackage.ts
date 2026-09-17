import { sameTeam } from "../simulation/CombatTeams";
import type { Ship } from '../simulation/Ship';
const sizes = {FIGHTER:0,FRIGATE:1,DESTROYER:2,CRUISER:3,CAPITAL_SHIP:4};
const last = new WeakMap<Ship,number>();
/** EscortPackage.java uses the strongest link, never the sum of nearby ships. */
export function escortTelemetry(ship: Ship): number {
  let best = 0;
  for (const other of ship.combatShips) {
    if (other===ship || other.isDead || other.isDocked || other.hullHp<=0 || !sameTeam(other, ship) || sizes[other.spec.hullSize ?? 'FRIGATE']<=sizes[ship.spec.hullSize ?? 'FRIGATE']) continue;
    const distance = ship.getShieldCenter().distanceTo(other.getShieldCenter())-.75*(ship.shield.radius+other.shield.radius);
    const strength = Math.max(0,Math.min(1,1-(distance-700)/500))*(ship.spec.hullSize==='DESTROYER'&&other.spec.hullSize==='CAPITAL_SHIP'?2:1);
    best = Math.max(best,strength);
  }
  return best;
}
export function advanceEscortPackage(ship: Ship): void {
  const mag = escortTelemetry(ship);
  if(last.get(ship)===mag)return;
  last.set(ship,mag);
  if(mag<=0){ship.runtimeModifiers.delete('escort_package');return;}
  ship.runtimeModifiers.set('escort_package',{
    accelerationPercent:25*mag,decelerationPercent:25*mag,turnAccelerationPercent:50*mag,turnRatePercent:25*mag,speedPercent:10*mag,
    shieldDamageMultiplier:ship.spec.sMods?.includes('escort_package')&&ship.spec.hullSize==='DESTROYER'?1-.1*mag:1,
    weapons:{BALLISTIC:{rangePercent:20*mag},ENERGY:{rangePercent:20*mag}},
  });
}
