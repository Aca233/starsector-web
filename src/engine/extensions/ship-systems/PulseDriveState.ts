import type { Projectile } from '../../simulation/Weapon';
import type { WeaponMountSlotConfig } from '../../content/ShipSpec';
import type { SystemModifiers } from './Types';
interface Impact { bomb: Projectile; slot: WeaponMountSlotConfig; elapsed: number; forceAngle?: number; impactTime: number; brakingTime?: number }
interface PlateImpulse { time: number }
interface State { impacts: Impact[]; compression: number; velocity: number; plate: PlateImpulse[]; mods: SystemModifiers; braking: boolean }
export const states = new WeakMap<object, State>();
export function stateFor(s: object): State {
  let state = states.get(s);
  if (!state) { state = { impacts: [], compression: 0, velocity: 0, plate: [], mods: {}, braking: false }; states.set(s,state); }
  return state;
}
export function pulsePusherOffset(system: object): number { return (states.get(system)?.compression ?? 0)*14; }
