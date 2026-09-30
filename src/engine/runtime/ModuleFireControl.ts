import { pickCombatContact } from './CombatTargeting';
import { assemblyShipIds } from '../content/ModuleGeometry';
import type { Ship } from '../simulation/Ship';
import type { Vector2 } from '../math/Vector2';

type WeaponOwner = Pick<Ship, 'id'|'spec'|'fireControlMode'|'isDead'|'hullHp'|'isDocked'|'isRetreated'>;
const active = (ship: WeaponOwner) => !ship.isDead && ship.hullHp > 0 && !ship.isDocked && !ship.isRetreated;
type ModuleContact = Parameters<typeof pickCombatContact>[0][number];
/** Pick only this assembly's live hull interiors, never padded circles or another ship.
 * Return an index, not mutable ownership: the existing command authority still admits it. */
export function pickModuleFireControl(root: ModuleContact, ships: readonly ModuleContact[], point: Vector2, alpha = 1): number | undefined {
  if (!root.spec.modules?.length || root.isDead || root.hullHp <= 0 || root.isDocked || root.isRetreated) return undefined;
  const ids = assemblyShipIds(root.id, root.spec), own = new Set(ids);
  const part = pickCombatContact(ships.filter(ship => own.has(ship.id)), root, point, 0, false, alpha);
  return part ? ids.indexOf(part.id) : undefined;
}
/** Selection is authoritative existing fireControlMode, not a UI-only ID/WeakMap. */
export function manualWeaponShip<T extends WeaponOwner>(root: T, ships: readonly T[]): T {
  if (root.fireControlMode !== 'MANUAL' || !active(root) || !root.spec.modules?.length) return root;
  const ids = new Set(assemblyShipIds(root.id, root.spec).slice(1));
  return ships.find(ship => ids.has(ship.id) && ship.fireControlMode === 'MANUAL' && active(ship)) ?? root;
}
export function moduleWeaponCandidate(root: Ship, index: number): Ship | undefined {
  if (!Number.isInteger(index) || index < 0 || index >= 128) return undefined;
  const id = assemblyShipIds(root.id, root.spec)[index];
  return root.assemblyShips.find(ship => ship.id === id);
}
export function releaseModuleFireControl(root: Ship): void {
  for (const part of root.assemblyShips) if (part !== root && part.fireControlMode === 'MANUAL') {
    part.clearInput(); part.fireControlMode = 'AI'; part.playerTargetId = null;
    part.aiHoldOffensiveFire = false;
  }
}
export function selectModuleFireControl(root: Ship, part: Ship): void {
  if (part !== root && manualWeaponShip(root, root.assemblyShips) === part) return;
  releaseModuleFireControl(root); root.isFiringMain = false;
  if (part !== root) {
    part.clearInput(); part.fireControlMode = 'MANUAL'; part.aiHoldOffensiveFire = false;
    part.playerTargetId = root.playerTargetId; part.aimTargetWorld.copy(root.aimTargetWorld);
  }
}
/** Ship controls stay on the root; only a selected module receives the trigger. */
export function applyModuleWeaponInput(root: Ship, aim: Vector2, firing: boolean, pointerActive: boolean): void {
  const selected = manualWeaponShip(root, root.assemblyShips);
  if (selected === root) { releaseModuleFireControl(root); return; }
  root.isFiringMain = false;
  selected.playerTargetId = root.playerTargetId;
  if (pointerActive) selected.aimTargetWorld.copy(aim);
  selected.isFiringMain = firing && pointerActive;
  selected.aiHoldOffensiveFire = false;
}
export function stopModuleFiring(root: Ship): void {
  root.isFiringMain = false;
  for (const part of root.assemblyShips) if (part.fireControlMode === 'MANUAL') part.isFiringMain = false;
}
/** Used at the AI boundary, including disconnect/death/autopilot transitions. */
export function isManualWeaponModule(part: Ship): boolean {
  const root=part.assemblyRoot;
  return part!==root && root.fireControlMode==='MANUAL' && part.fireControlMode==='MANUAL' && active(root) && active(part);
}
