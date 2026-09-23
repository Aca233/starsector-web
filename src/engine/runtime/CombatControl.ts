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
  | { kind: 'ship'; command: ShipCommand; aim?: readonly [number, number] };

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
  if (engine.battleResult || ship.isDead || ship.isRetreated) { ship.clearInput(); return; }
  // Existing local behavior: autopilot continues under chart/focus blocking.
  if (sample.autopilot) { engine.updateShipAI(playerAI, dt); return; }
  ship.fireControlMode = 'MANUAL'; ship.defenseFacingRad = undefined;
  ship.aiHoldOffensiveFire = false; ship.tacticalAI = undefined;
  if (engine.isTacticalMap || sample.blocked) { ship.clearInput(); return; }
  applyPlayerControls(ship, sample.keys, new Vector2(...sample.aim), sample.firing, sample.mouseSteering, sample.pointerActive);
}

/** Edge commands also run while paused; they never advance simulation time. */
export function applyCombatControlCommand(engine: CombatEngine, command: CombatControlCommand): CommandResult {
  const ship = engine.playerShip;
  switch (command.kind) {
    case 'tactical': return applyTacticalCommand(engine, command.command);
    case 'clear-input': ship.clearInput(); break;
    case 'stop-firing': ship.isFiringMain = false; break;
    case 'toggle-map': engine.toggleTacticalMap(); break;
    case 'pilot':
      if (engine.battleResult || ship.isDead || ship.hullHp <= 0 || ship.isRetreated || ship.isDocked || ship.retreating)
        return { accepted: false, reason: '舰船不可接管' };
      ship.clearInput(); ship.fireControlMode = command.autopilot ? 'AI' : 'MANUAL';
      ship.defenseFacingRad = undefined; ship.aiHoldOffensiveFire = false; ship.tacticalAI = undefined;
      if (!command.autopilot) ship.currentTargetShip = lockedCombatTarget(engine.ships, ship);
      break;
    case 'ship': {
      const result = dispatchShipCommand(ship, command.command, command.aim ? new Vector2(...command.aim) : undefined, engine.ships);
      if (!result.accepted && result.reason) engine.addFloatingText(ship.pos.clone(), result.reason, [255, 190, 90], 13, 1.3);
      return result;
    }
    default: throw new Error('Unknown combat control command');
  }
  return { accepted: true };
}
