import type { ShipSpec } from '../content/ShipSpec';
import type { Ship } from '../simulation/Ship';
import type { WeaponMount } from '../simulation/Weapon';
import type { SimulationRandom } from '../simulation/SimulationRandom';

/** MissileAutoloader: count native slots, including empty ones, not fitted launchers. */
export function missileReloadCapacity(spec: ShipSpec): number {
  const n = spec.weaponSlots.filter(s => s.slotSize === 'SMALL' && s.weaponType === 'MISSILE').length;
  if (!n) return 0;
  switch (spec.hullSize) {
    case 'FRIGATE': return n === 1 ? 6 : 4;
    case 'DESTROYER': return n === 1 ? 9 : 4;
    case 'CRUISER': return n <= 2 ? 15 : n === 3 ? 12 : 8;
    case 'CAPITAL_SHIP': return n <= 3 ? 24 : n <= 6 ? 18 : 10;
    default: return 0;
  }
}
export function missileReloadCost(w: WeaponMount): number {
  const tags = w.spec.tags ?? [];
  for (const [tag, cost] of [['reload_1pt',1],['reload_1_and_a_half_pt',1.5],['reload_2pt',2],['reload_3pt',3],['reload_4pt',4],['reload_5pt',5],['reload_6pt',6]] as const) if (tags.includes(tag)) return cost;
  const op = Math.round(w.spec.ordnancePointCost ?? 0);
  return op === 1 ? 1 : op === 2 || op === 3 ? 2 : op === 4 ? 3 : op === 5 || op === 6 ? 4 : op === 7 || op === 8 ? 5 : 6;
}
function affected(ship: Ship, w: WeaponMount): boolean {
  const slot = ship.spec.weaponSlots.find(s => s.slotId === w.slotId);
  return w.spec.weaponType === 'MISSILE' && w.spec.mountSize === 'SMALL'
    && slot?.slotSize === 'SMALL' && slot.weaponType === 'MISSILE'
    && !w.spec.tags?.includes('no_reload') && Number.isFinite(w.ammo)
    && (w.baseMaxAmmo ?? 0) > 0 && !(w.spec.ammoRegenPerSec! > 0);
}
interface ReloadState { capacity: number; interval: number }
const loaders = new WeakMap<Ship, ReloadState>();
const periodic = new WeakMap<Ship, { interval: number }>();
export function missileReloadRemaining(ship: Ship): number { return loaders.get(ship)?.capacity ?? missileReloadCapacity(ship.spec); }
export function advanceMissileAutoloader(ship: Ship, dt: number, random: SimulationRandom): void {
  if (ship.isDead || ship.hullHp <= 0 || !(dt > 0)) return;
  let state = loaders.get(ship);
  if (!state) { state = {capacity: missileReloadCapacity(ship.spec), interval: .2 + random.next() * .2}; loaders.set(ship, state); }
  if (state.capacity <= .05) { state.capacity = 0; return; }
  state.interval -= dt;
  if (state.interval > 1e-9) return;
  state.interval = .2 + random.next() * .2;
  for (const w of ship.weapons) {
    if (!affected(ship,w) || w.ammo > 0 || (w.reloadDelayRemaining ?? 0) > 0) continue;
    const cost = missileReloadCost(w), salvo = Math.max(1,w.spec.burstSize ?? 1);
    let amount = w.baseMaxAmmo!;
    if (cost > state.capacity) amount = Math.ceil(amount * state.capacity / cost / salvo) * salvo;
    w.ammo = Math.min(w.spec.maxAmmo!, amount);
    w.reloadDelayRemaining = ship.spec.sMods?.includes('missile_autoloader') ? 10 : 5;
    w.cooldownTimer = Math.max(w.cooldownTimer, w.spec.refireDelay);
    state.capacity = Math.max(0, state.capacity - cost);
    if (!state.capacity) break;
  }
}
/** PeriodicMissileReload: all missile mounts refill on a fresh 10–15s interval. */
export function advancePeriodicMissileReload(ship: Ship, dt: number, random: SimulationRandom): void {
  if (ship.isDead || ship.hullHp <= 0 || !(dt > 0)) return;
  let state = periodic.get(ship);
  if (!state) { state = {interval: 10 + random.next() * 5}; periodic.set(ship, state); }
  state.interval -= dt;
  if (state.interval > 1e-9) return;
  state.interval = 10 + random.next() * 5;
  for (const w of ship.weapons) if (w.spec.weaponType === 'MISSILE' && Number.isFinite(w.ammo) && w.spec.maxAmmo !== undefined) w.ammo = w.spec.maxAmmo;
}
