import { manualWeaponShip, moduleWeaponCandidate, selectModuleFireControl } from './ModuleFireControl';
import { mouseBindingCode, readSystemBindings, selectedSystemSlot } from './SystemBindings';
import type { Ship } from '../simulation/Ship';
import type { Vector2 } from '../math/Vector2';
import { pickCombatContact } from './CombatTargeting';
import { combatAudio as sound } from '../audio/CombatAudioEvents';

/** Shared by local input, HUD, LAN authority and the Worker experiment. */
export type ShipCommand =
  | { kind: 'shield' | 'hullShield' | 'vent' | 'target' | 'recall' }
  | { kind: 'system'; value?: number }
  | { kind: 'group' | 'mode' | 'autofire' | 'module'; value: number };
export interface CommandResult { accepted: boolean; reason?: string }
export interface CombatKey { code: string; ctrlKey: boolean; altKey: boolean; metaKey: boolean; shiftKey: boolean }
export const flightKeyAliases: Readonly<Record<string, string>> = {
  ArrowUp: 'KeyW', ArrowDown: 'KeyS', ArrowLeft: 'KeyA', ArrowRight: 'KeyD', ShiftRight: 'ShiftLeft',
};
export const flightKeys = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'KeyX'] as const;
export function flightKey(code: string): string | undefined {
  const canonical = flightKeyAliases[code] ?? code;
  return (flightKeys as readonly string[]).includes(canonical) ? canonical : undefined;
}
/** Only declared chords are consumed; Ctrl+F/Ctrl+R/Alt+arrows stay browser commands. */
export function shipCommandForKey(key: CombatKey, ship?: { readonly systems: readonly unknown[] }): ShipCommand | undefined {
  if (key.altKey || key.metaKey) return undefined;
  const digit = /^(?:Digit|Numpad)([1-7])$/.exec(key.code);
  if (digit) {
    if (key.ctrlKey && key.shiftKey) return undefined;
    return { kind: key.ctrlKey ? 'autofire' : key.shiftKey ? 'mode' : 'group', value: Number(digit[1]) - 1 };
  }
  if (key.ctrlKey) return undefined;
  const bindings = readSystemBindings();
  const slot = bindings.slots.indexOf(key.code);
  if (slot >= 0) return { kind: 'system', value: slot };
  if (bindings.wheelSelect && key.code === bindings.selectedKey && ship) return { kind: 'system', value: selectedSystemSlot(ship) };
  if (key.code === 'KeyV') return { kind: 'vent' };
  if (key.code === 'KeyR') return { kind: 'target' };
  if (key.code === 'KeyZ') return { kind: 'recall' };
  return undefined;
}
/** Side buttons share the exact slot/selection/modifier rules of keyboard skills. */
export function shipCommandForMouse(mouse: Omit<CombatKey, 'code'> & { button: number }, ship?: { readonly systems: readonly unknown[] }): ShipCommand | undefined {
  const code = mouseBindingCode(mouse.button);
  if (!code) return undefined;
  return shipCommandForKey({ code, ctrlKey: mouse.ctrlKey, altKey: mouse.altKey, metaKey: mouse.metaKey, shiftKey: mouse.shiftKey }, ship);
}
export function shipCommandFailure(ship: Ship, command: ShipCommand): string | undefined {
  if (ship.isDead || ship.hullHp <= 0) return '舰船已失去战斗能力';
  if (ship.isDocked || ship.isRetreated) return '舰船不在战场';
  if (command.kind === 'module') {
    const part = moduleWeaponCandidate(ship, command.value);
    if (!part || part.isDead || part.hullHp <= 0 || part.isDocked || part.isRetreated) return '该模块已失效或不属于本舰';
    if (part !== ship && ship.fireControlMode !== 'MANUAL') return '请先关闭自动驾驶';
    if (part !== ship && !part.weapons.length) return '该模块没有可手操的武器';
    return undefined;
  }
  if (command.kind === 'group' || command.kind === 'mode' || command.kind === 'autofire') {
    if (!Number.isInteger(command.value) || !manualWeaponShip(ship, ship.assemblyShips).weaponGroups.some(g => g.index === command.value && g.weaponSlotIds.length)) return '该武器组不存在或没有武器';
    return undefined;
  }
  if (command.kind === 'target') return undefined;
  if (command.kind === 'recall') return ship.assemblyShips.some(part => !part.isDead && part.hullHp > 0 && !part.isRetreated && !part.isDocked
    && part.hullStats.fighterBays > 0 && ((part.spec.fighterWings?.length ?? 0) > 0 || part.deployedWingCraft.size > 0)) ? undefined : '本舰及存活模块没有舰载联队';
  if (command.kind === 'system') {
    const system = ship.getSystem(command.value ?? 0);
    return system ? system.activationFailureReason : '该技能槽为空或不存在';
  }
  if (command.kind === 'vent') return ship.ventFailureReason;
  if (command.kind === 'hullShield') return ship.hullShieldFailureReason;
  return ship.defenseFailureReason;
}
/** Aim is sampled at the command edge, not at the preceding simulation frame. */
export function dispatchShipCommand(ship: Ship, command: ShipCommand, aim?: Vector2, ships: readonly Ship[] = ship.combatShips): CommandResult {
  if (aim && Number.isFinite(aim.x) && Number.isFinite(aim.y)) ship.aimTargetWorld.copy(aim);
  const reason = shipCommandFailure(ship, command);
  if (reason) return { accepted: false, reason };
  let accepted = true;
  const weaponShip = manualWeaponShip(ship, ship.assemblyShips);
  switch (command.kind) {
    case 'recall':
      ship.fighterRecall = !ship.fighterRecall;
      // Edge commands also execute while paused: do not wait for pose synchronization.
      for (const part of ship.assemblyShips) if (!part.isDead && part.hullHp > 0 && !part.isRetreated && !part.isDocked)
        part.fighterRecall = ship.fighterRecall;
      sound.play(ship.fighterRecall ? 'fighter_recall' : 'fighter_deploy', .85);
      break;
    case 'target': {
      if (!aim || !Number.isFinite(aim.x) || !Number.isFinite(aim.y)) return { accepted: false, reason: '请将鼠标移到要锁定的敌舰上' };
      const target = pickCombatContact(ships, ship, aim, 50, true);
      setPlayerCombatTarget(ship, target?.id === ship.playerTargetId ? null : target ?? null);
      break;
    }
    case 'system': accepted = ship.getSystem(command.value ?? 0)!.activate(); break;
    case 'shield': accepted = ship.toggleDefense(); break;
    case 'hullShield': accepted = ship.toggleHullShield(); break;
    case 'vent': accepted = ship.startVenting(); break;
    case 'module': selectModuleFireControl(ship, moduleWeaponCandidate(ship, command.value)!); break;
    case 'group': weaponShip.selectWeaponGroup(command.value); break;
    case 'mode': weaponShip.toggleFireMode(command.value); break;
    case 'autofire': weaponShip.toggleAutofire(command.value); break;
  }
  return accepted ? { accepted: true } : { accepted: false, reason: shipCommandFailure(ship, command) ?? '当前无法执行该操作' };
}

/** Target selection never moves the cursor or the ship's aim point. */
export function setPlayerCombatTarget(ship: Ship, target: Ship | null): void {
  ship.playerTargetId = target?.id ?? null;
  ship.currentTargetShip = target;
}
