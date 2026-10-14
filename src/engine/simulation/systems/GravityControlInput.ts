import type { Ship } from '../Ship';
import { GRAVITY_SYSTEM_IDS } from '../../content/GravityIds';

/** Logical hold bit, independent of keyboard/side-button rebinding. */
export const GRAVITY_HOLD_KEY = 'GravityField';
export const GRAVITY_PUSH_KEY = 'GravityPush';
export const isDirectionalGravitySystem = (type: string) => type === GRAVITY_SYSTEM_IDS.push;
/** Continuous intent, not repeated shield/toggle edges. */
export function applyGravityPushHold(ship: Ship, held: boolean): void {
  for (const system of ship.allSystems) if (system.definition.gravityDirectionalPush) {
    if (!held || ship.fireControlMode !== 'MANUAL') { system.deactivate(); continue; }
    if (system.state === 'IDLE') system.activate();
    system.gravityControlHeld = (system.state === 'IN' || system.state === 'ACTIVE') && !system.disabled;
  }
}
export const isCursorGravitySystem = (type: string) => type === GRAVITY_SYSTEM_IDS.battleWell;
export function gravityPolarity(ship: Ship): 1 | -1 {
  return ship.allSystems.find(s => s.definition.gravityPolaritySwitch)?.gravityPolarity ?? 1;
}
export function applyGravityControlHold(ship: Ship, held: boolean): void {
  for (const system of ship.systems) if (system.definition.gravityField?.cursorSpeed) {
    system.gravityControlHeld = held && system.gravityField?.kind!=='COLLAPSE' && ship.fireControlMode === 'MANUAL' && !system.disabled
      && (system.state === 'IN' || system.state === 'ACTIVE');
  }
}
export function cursorGravityOwnsAim(ship: Ship): boolean {
  return ship.systems.some(s => s.definition.gravityField?.cursorSpeed && s.gravityField?.kind!=='COLLAPSE' && s.gravityControlHeld
    && (s.state === 'IN' || s.state === 'ACTIVE') && !s.disabled
    && !ship.flux.isOverloaded && !ship.flux.isVenting);
}
