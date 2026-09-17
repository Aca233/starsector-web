import { signedAngle } from '../math/Angles';
import type { Ship } from '../simulation/Ship';
import type { WeaponMount } from '../simulation/Weapon';
import { combatWeaponRange } from '../simulation/WeaponRange';
import { isPointDefense } from './AutofireController';
import { tacticalPolicy } from './TacticalWorld';

export interface CombatProfile { relativeBearing: number; range: number; firepower: number; weapons: number }
export function weaponDps(m: WeaponMount): number {
  if (m.spec.damagePerSecond > 0) return m.spec.damagePerSecond;
  const count = Math.max(1, m.spec.burstSize ?? 1);
  const cycle = (m.spec.chargeTime ?? 0) + (count - 1) * (m.spec.burstDelay ?? 0) + m.spec.refireDelay;
  return m.spec.damagePerShot * count / Math.max(1 / 60, cycle);
}
export function weaponRange(ship: Ship, m: WeaponMount): number {
  return combatWeaponRange(ship, m.spec);
}

/** Pick the strongest overlapping authored firing arcs, then a DPS-weighted median range.
 * PD and disposable strike weapons cannot drag sustained main-battery stationkeeping around;
 * missile/PD-only ships fall back to their actual available weapons rather than a fake gun. */
export function combatProfile(ship: Ship, target: Ship): CombatProfile {
  const available = ship.weapons.filter(m => !m.isDisabled && m.ammo >= 1 && weaponDps(m) > 0);
  const offense = available.filter(m => !isPointDefense(m));
  const sustained = offense.filter(m => m.spec.weaponType !== 'MISSILE' && m.spec.spawnType !== 'MISSILE' && !m.spec.aiHints?.includes('STRIKE'));
  const mounts = sustained.length ? sustained : offense.length ? offense : available;
  const radius = target.spec.collisionRadius;
  const distance = Math.max(1, ship.pos.distanceTo(target.pos));
  const targetHalfArc = Math.asin(Math.min(1, radius / distance));
  const current = signedAngle(target.pos.clone().sub(ship.pos).heading() - ship.facingRad);
  if (!mounts.length) return { relativeBearing: current, range: ship.spec.collisionRadius + radius + tacticalPolicy.collisionMargin, firepower: 0, weapons: 0 };
  const arcs = mounts.map(m => ({ mount: m, weight: weaponDps(m), base: m.baseAngleDeg * Math.PI / 180,
    half: Math.min(Math.PI, (m.mountType === 'HARDPOINT' || (m.spec.turnRateDegPerSec ?? 1) <= 0 ? 0 : m.arcDeg * Math.PI / 360) + targetHalfArc) }));
  // Arc endpoints and interval midpoints cover every possible combination, without a coarse angular grid.
  const boundaries = arcs.flatMap(a => [signedAngle(a.base - a.half), signedAngle(a.base + a.half)]).sort((a,b) => a-b);
  const bearings = [current, 0, ...arcs.map(a => a.base), ...boundaries];
  for (let i = 0; i < boundaries.length; i++) bearings.push(signedAngle((boundaries[i] + (i+1 < boundaries.length ? boundaries[i+1] : boundaries[0]+Math.PI*2)) / 2));
  const at = (bearing: number) => arcs.filter(a => Math.abs(signedAngle(bearing-a.base)) <= a.half + 1e-8);
  let best = current, power = -1;
  for (const bearing of bearings) {
    let score = 0;
    // Same arc order/tie-break, without materializing a set for every bearing.
    for (const a of arcs) if (Math.abs(signedAngle(bearing-a.base)) <= a.half + 1e-8) score += a.weight;
    if (score > power+1e-6 || (Math.abs(score-power)<1e-6 && Math.abs(signedAngle(bearing-current)) < Math.abs(signedAngle(best-current)))) { best=bearing; power=score; }
  }
  const useful = at(best);
  const ranges = useful.map(a => ({weight:a.weight, range: weaponRange(ship,a.mount)*tacticalPolicy.rangeFraction
    + a.mount.relativePos.x*Math.cos(best)+a.mount.relativePos.y*Math.sin(best)+radius})).sort((a,b)=>a.range-b.range);
  let accumulated = 0, range = ranges.at(-1)?.range ?? distance;
  for (const entry of ranges) { accumulated += entry.weight; if (accumulated >= power*.5) {range=entry.range;break;} }
  range = Math.max(ship.spec.collisionRadius+radius+tacticalPolicy.collisionMargin,range);
  return {relativeBearing:signedAngle(best),range,firepower:power,weapons:useful.length};
}
