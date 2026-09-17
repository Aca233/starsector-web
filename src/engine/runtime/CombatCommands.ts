import type { Ship } from '../simulation/Ship';
import type { Vector2 } from '../math/Vector2';
import { pickCombatContact } from './CombatTargeting';
import { sound } from '../audio/SoundManager';

/** Shared by local input, HUD, LAN authority and the Worker experiment. */
export type ShipCommand =
  | { kind: 'shield' | 'vent' | 'system' | 'target' | 'recall' }
  | { kind: 'group' | 'mode' | 'autofire'; value: number };
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
export function shipCommandForKey(key: CombatKey): ShipCommand | undefined {
  if (key.altKey || key.metaKey) return undefined;
  const digit = /^(?:Digit|Numpad)([1-7])$/.exec(key.code);
  if (digit) {
    if (key.ctrlKey && key.shiftKey) return undefined;
    return { kind: key.ctrlKey ? 'autofire' : key.shiftKey ? 'mode' : 'group', value: Number(digit[1]) - 1 };
  }
  if (key.ctrlKey) return undefined;
  if (key.code === 'KeyF') return { kind: 'system' };
  if (key.code === 'KeyV') return { kind: 'vent' };
  if (key.code === 'KeyR') return { kind: 'target' };
  if (key.code === 'KeyZ') return { kind: 'recall' };
  return undefined;
}
export function shipCommandFailure(ship: Ship, command: ShipCommand): string | undefined {
  if (ship.isDead || ship.hullHp <= 0) return '舰船已失去战斗能力';
  if (ship.isDocked || ship.isRetreated) return '舰船不在战场';
  if (command.kind === 'group' || command.kind === 'mode' || command.kind === 'autofire') {
    if (!Number.isInteger(command.value) || !ship.weaponGroups.some(g => g.index === command.value && g.weaponSlotIds.length)) return '该武器组不存在或没有武器';
    return undefined;
  }
  if (command.kind === 'target') return undefined;
  if (command.kind === 'recall') return ship.hullStats.fighterBays > 0 && ((ship.spec.fighterWings?.length ?? 0) > 0 || ship.deployedWingCraft.size > 0) ? undefined : '本舰没有舰载联队';
  if (command.kind === 'system') return ship.system.activationFailureReason;
  if (command.kind === 'vent') return ship.ventFailureReason;
  return ship.defenseFailureReason;
}
/** Aim is sampled at the command edge, not at the preceding simulation frame. */
export function dispatchShipCommand(ship: Ship, command: ShipCommand, aim?: Vector2, ships: readonly Ship[] = ship.combatShips): CommandResult {
  if (aim && Number.isFinite(aim.x) && Number.isFinite(aim.y)) ship.aimTargetWorld.copy(aim);
  const reason = shipCommandFailure(ship, command);
  if (reason) return { accepted: false, reason };
  let accepted = true;
  switch (command.kind) {
    case 'recall':
      ship.fighterRecall = !ship.fighterRecall;
      sound.play(ship.fighterRecall ? 'fighter_recall' : 'fighter_deploy', .85);
      break;
    case 'target': {
      if (!aim || !Number.isFinite(aim.x) || !Number.isFinite(aim.y)) return { accepted: false, reason: '请将鼠标移到要锁定的敌舰上' };
      const target = pickCombatContact(ships, ship, aim, 50, true);
      setPlayerCombatTarget(ship, target?.id === ship.playerTargetId ? null : target ?? null);
      break;
    }
    case 'system': accepted = ship.system.activate(); break;
    case 'shield': accepted = ship.toggleDefense(); break;
    case 'vent': accepted = ship.startVenting(); break;
    case 'group': ship.selectWeaponGroup(command.value); break;
    case 'mode': ship.toggleFireMode(command.value); break;
    case 'autofire': ship.toggleAutofire(command.value); break;
  }
  return accepted ? { accepted: true } : { accepted: false, reason: shipCommandFailure(ship, command) ?? '当前无法执行该操作' };
}

/** Target selection never moves the cursor or the ship's aim point. */
export function setPlayerCombatTarget(ship: Ship, target: Ship | null): void {
  ship.playerTargetId = target?.id ?? null;
  ship.currentTargetShip = target;
}
