import { HYPERION_JUMP_ID } from '../content/HyperionIds';
import { HYPERION_REACTOR, hyperionJumpPointFailure } from '../content/HyperionJumpTarget';
import { applyModuleWeaponInput, releaseModuleFireControl, stopModuleFiring } from './ModuleFireControl';
import { applyTacticalCommand, type TacticalCommand } from './TacticalControl';
import type { CapitalShipAI } from '../ai/CapitalShipAI';
import type { CombatEngine } from '../simulation/CombatEngine';
import { Vector2 } from '../math/Vector2';
import { applyPlayerControls } from './PlayerControls';
import { dispatchShipCommand, type CommandResult, type ShipCommand } from './CombatCommands';
import { lockedCombatTarget } from './CombatTargeting';

/** Data only: a sample belongs to ONE fixed tick, not to a render frame. */
export interface CombatControlSample {
  autopilot: boolean;
  blocked: boolean;
  keys: Readonly<Record<string, boolean>>;
  aim: readonly [number, number];
  firing: boolean;
  mouseSteering: boolean;
  pointerActive: boolean;
}
export type CombatControlCommand =
  | { kind: 'tactical'; command: TacticalCommand }
  | { kind: 'clear-input' | 'stop-firing' | 'toggle-map' }
  | { kind: 'pilot'; autopilot: boolean }
  | { kind: 'ship'; command: ShipCommand; aim?: readonly [number, number]; facing?: number };

/** Copy at the host boundary: caller mutation cannot rewrite an accepted tick. */
export function copyControlSample(sample: CombatControlSample): CombatControlSample {
  if (!sample || typeof sample !== 'object' || !Array.isArray(sample.aim) || sample.aim.length !== 2
    || !sample.aim.every(Number.isFinite) || !sample.keys || typeof sample.keys !== 'object'
    || Object.keys(sample.keys).length > 32
    || Object.values(sample.keys).some(value => typeof value !== 'boolean')
    || [sample.autopilot, sample.blocked, sample.firing, sample.mouseSteering, sample.pointerActive].some(value => typeof value !== 'boolean'))
    throw new Error('Invalid combat control sample');
  return { ...sample, keys: { ...sample.keys }, aim: [sample.aim[0], sample.aim[1]] };
}

/** Called before the native engine AI phase in BOTH local and worker hosts. */
export function applyCombatControlSample(engine: CombatEngine, playerAI: CapitalShipAI, dt: number, sample: CombatControlSample): void {
  const ship = engine.playerShip;
  if (engine.battleResult || ship.isDead || ship.hullHp <= 0 || ship.isRetreated || ship.isDocked) { ship.clearInput(); releaseModuleFireControl(ship); return; }
  // Existing local behavior: autopilot continues under chart/focus blocking.
  if (sample.autopilot) { releaseModuleFireControl(ship); engine.updateShipAI(playerAI, dt); return; }
  ship.fireControlMode = 'MANUAL'; ship.defenseFacingRad = undefined;
  ship.aiHoldOffensiveFire = false; ship.tacticalAI = undefined;
  if (engine.isTacticalMap || sample.blocked) { ship.clearInput(); stopModuleFiring(ship); return; }
  applyPlayerControls(ship, sample.keys, new Vector2(...sample.aim), sample.firing, sample.mouseSteering, sample.pointerActive);
  applyModuleWeaponInput(ship, new Vector2(...sample.aim), sample.firing, sample.pointerActive);
}

/** Edge commands also run while paused; they never advance simulation time. */
export function applyCombatControlCommand(engine: CombatEngine, command: CombatControlCommand): CommandResult {
  const ship = engine.playerShip;
  switch (command.kind) {
    case 'tactical': return applyTacticalCommand(engine, command.command);
    case 'clear-input': ship.clearInput(); stopModuleFiring(ship); break;
    case 'stop-firing': stopModuleFiring(ship); break;
    case 'toggle-map': ship.clearInput(); stopModuleFiring(ship); engine.toggleTacticalMap(); break;
    case 'pilot':
      if (engine.battleResult || ship.isDead || ship.hullHp <= 0 || ship.isRetreated || ship.isDocked || ship.retreating)
        return { accepted: false, reason: '舰船不可接管' };
      ship.clearInput(); stopModuleFiring(ship);
      if (command.autopilot) releaseModuleFireControl(ship);
      ship.fireControlMode = command.autopilot ? 'AI' : 'MANUAL';
      ship.defenseFacingRad = undefined; ship.aiHoldOffensiveFire = false; ship.tacticalAI = undefined;
      if (!command.autopilot) ship.currentTargetShip = lockedCombatTarget(engine.ships, ship);
      break;
    case 'ship': {
      if (command.facing !== undefined && !Number.isFinite(command.facing)) return {accepted:false,reason:'跃迁朝向无效'};
      // The client ghost is advisory. Reject invalid landing before activate().
      if (command.command.kind === 'system' && ship.getSystem(command.command.value ?? 0)?.type === HYPERION_JUMP_ID) {
        const reason = !command.aim ? '请选择跃迁落点' : hyperionJumpPointFailure(ship, new Vector2(...command.aim), HYPERION_REACTOR.jumpRange*ship.hullStats.systemRangeMultiplier, engine);
        if (reason) { engine.addFloatingText(ship.pos.clone(),reason,[255,190,90],13,1.3); return {accepted:false,reason}; }
      }
      const result = dispatchShipCommand(ship, command.command, command.aim ? new Vector2(...command.aim) : undefined, engine.ships);
      if (result.accepted && command.command.kind === 'system' && command.facing !== undefined) {
        const system=ship.getSystem(command.command.value ?? 0);
        if (system?.type===HYPERION_JUMP_ID && system.activationInput)
          system.activationInput.facing=Math.atan2(Math.sin(command.facing),Math.cos(command.facing));
      }
      if (!result.accepted && result.reason) engine.addFloatingText(ship.pos.clone(), result.reason, [255, 190, 90], 13, 1.3);
      return result;
    }
    default: throw new Error('Unknown combat control command');
  }
  return { accepted: true };
}
