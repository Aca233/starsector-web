import { signedAngle } from '../math/Angles';
import type { Ship } from '../simulation/Ship';
import type { WeaponMount } from '../simulation/Weapon';
import { combatWeaponRange } from '../simulation/WeaponRange';
import { isPointDefense, predictWeaponIntercept } from './AutofireController';
import { weaponMuzzle } from './FireControlGeometry';
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
  const targetHeading = target.pos.clone().sub(ship.pos).heading();
  const current = signedAngle(targetHeading - ship.facingRad);
  if (!mounts.length) return { relativeBearing: current, range: ship.spec.collisionRadius + radius + tacticalPolicy.collisionMargin, firepower: 0, weapons: 0 };
  const arcs = mounts.map(m => {
    const fixed = m.mountType === 'HARDPOINT' || (m.spec.turnRateDegPerSec ?? 1) <= 0;
    // Hull steering must line up the muzzle/intercept, not the ship centres. Start
    // leading on approach; far outside acquisition range, simply face the contact.
    const intercept = distance <= weaponRange(ship, m) * 1.5 + ship.spec.collisionRadius + radius
      ? predictWeaponIntercept(ship, m, { kind: 'SHIP', entity: target }) : null;
    const aimHeading = (intercept?.point ?? target.pos).clone().sub(weaponMuzzle(ship, m)).heading();
    return { mount: m, weight: weaponDps(m),
      base: signedAngle(m.baseAngleDeg * Math.PI / 180 - signedAngle(aimHeading - targetHeading)),
      // A fixed gun has no traverse. Inflating its arc by collisionRadius let the
      // hull stop turning while the bore missed the actual hull, especially off-centre mounts.
      half: fixed ? 0 : Math.min(Math.PI, m.arcDeg * Math.PI / 360) };
  });
  // Arc endpoints and interval midpoints cover every possible combination, without a coarse angular grid.
  const boundaries = arcs.flatMap(a => [signedAngle(a.base - a.half), signedAngle(a.base + a.half)]).sort((a,b) => a-b);
  const bearings = [current, 0, ...arcs.map(a => a.base), ...boundaries];
  for (let i = 0; i < boundaries.length; i++) bearings.push(signedAngle((boundaries[i] + (i+1 < boundaries.length ? boundaries[i+1] : boundaries[0]+Math.PI*2)) / 2));
  const at = (bearing: number) => arcs.filter(a => Math.abs(signedAngle(bearing-a.base)) <= a.half + 1e-8);
  let best = current, power = -1, alignment = Infinity;
  // Only adjacent identical candidates are redundant. Global deduplication can
  // change tolerance-based tie breaks when other candidates intervene.
  let previousBearing: number | undefined;
  for (const bearing of bearings) {
    if (Object.is(bearing, previousBearing)) continue;
    previousBearing = bearing;
    let score = 0, offset = 0;
    for (const a of arcs) {
      const delta = bearing - a.base;
      const magnitude = Math.abs(delta);
      // Both angles are signedAngle results in [-PI, PI]. Exclude only a
      // definite arc miss; keep the original trig and tolerance near either
      // wrap boundary (and for NaN). This is not an approximate angle result.
      const outside = a.half + 1e-8 + 1e-12;
      if (magnitude > outside && magnitude < Math.PI * 2 - outside) continue;
      const error = Math.abs(signedAngle(delta));
      if (error <= a.half + 1e-8) { score += a.weight; offset += a.weight * error; }
    }
    // Equal firepower: centre the battery before minimizing turn distance. Otherwise
    // a ship with wide turrets can keep its stern toward the enemy for the whole approach.
    if (score > power+1e-6 || (Math.abs(score-power)<1e-6 && (offset < alignment-1e-6
      || (Math.abs(offset-alignment)<1e-6 && Math.abs(signedAngle(bearing-current)) < Math.abs(signedAngle(best-current)))))) {
      best=bearing; power=score; alignment=offset;
    }
  }
  const useful = at(best);
  const ranges = useful.map(a => ({weight:a.weight, range: weaponRange(ship,a.mount)*tacticalPolicy.rangeFraction
    + a.mount.relativePos.x*Math.cos(best)+a.mount.relativePos.y*Math.sin(best)+radius})).sort((a,b)=>a.range-b.range);
  let accumulated = 0, range = ranges.at(-1)?.range ?? distance;
  for (const entry of ranges) { accumulated += entry.weight; if (accumulated >= power*.5) {range=entry.range;break;} }
  range = Math.max(ship.spec.collisionRadius+radius+tacticalPolicy.collisionMargin,range);
  return {relativeBearing:signedAngle(best),range,firepower:power,weapons:useful.length};
}
