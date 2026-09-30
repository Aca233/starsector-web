import type { Ship } from '../../simulation/Ship';
import type { ShipSystem } from '../../simulation/ShipSystem';

export type GlorianaBroadside = 'P' | 'S';
/** Forward/right coordinates. The dead cone prevents an arbitrary side on centerline. */
export function broadsideAt(point: {x:number;y:number}, origin: {x:number;y:number}, facing: number): GlorianaBroadside | undefined {
  const dx=point.x-origin.x,dy=point.y-origin.y;
  const right=-dx*Math.sin(facing)+dy*Math.cos(facing);
  if(!Number.isFinite(right)||Math.abs(right)<Math.max(8,Math.hypot(dx,dy)*.2))return undefined;
  return right<0?'P':'S';
}
export function lockedBroadside(system: ShipSystem): GlorianaBroadside | undefined {
  const input=system.activationInput;
  return input?broadsideAt(input.point,input.origin,input.facing):undefined;
}
export function batterySide(ship: Ship): GlorianaBroadside | undefined {
  const slot=ship.moduleMount?.slotId;
  return slot && /^[PS][123]$/.test(slot) ? slot[0] as GlorianaBroadside : undefined;
}
export function alive(ship: Ship): boolean { return !ship.isDead && ship.hullHp>0 && !ship.isRetreated && !ship.isDocked; }
export function usableBattery(ship: Ship): boolean {
  return alive(ship) && !ship.flux.isOverloaded && !ship.flux.isVenting && !ship.system.blocksWeapons
    && ship.weapons.some(w=>w.spec.weaponType==='BALLISTIC'&&!w.isDisabled&&w.ammo!==0);
}
export function readyBatteries(owner: Ship, side: GlorianaBroadside): Ship[] {
  return owner.childModules.filter(child=>child.parentShip===owner&&batterySide(child)===side&&usableBattery(child));
}
export function edictOnline(system: ShipSystem): boolean {
  const owner=system.owner;
  return !!owner && alive(owner) && !owner.retreating && !owner.flux.isOverloaded && !owner.flux.isVenting
    && system.available && !system.disabled && system.isActive && system.effectLevel>0;
}
