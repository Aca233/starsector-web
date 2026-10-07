import { cursorTurnCommand } from '../runtime/PlayerControls';

/** Numeric movement policy. No entities, callbacks, clocks, random state or writes. */
export interface SteeringObservation {
  facing: number; angularVelocity: number; velocityX: number; velocityY: number;
  acceleration: number; deceleration: number; strafeMultiplier: number; turnDeceleration: number;
  locked: boolean;
}
export interface SteeringCommand {
  turnInput: number; throttle: number; strafeInput: number; brakeInput: boolean;
}

export function solveSteering(observation: SteeringObservation, desiredX: number, desiredY: number,
  desiredFacing: number, response: number): SteeringCommand {
  const turnInput = observation.locked ? 0 : cursorTurnCommand(observation.facing,
    observation.angularVelocity, desiredFacing, observation.turnDeceleration);
  const brakeInput = Math.sqrt(desiredX * desiredX + desiredY * desiredY) < 1;
  if (brakeInput) return { turnInput, throttle: 0, strafeInput: 0, brakeInput };
  const dx = desiredX - observation.velocityX, dy = desiredY - observation.velocityY;
  const c = Math.cos(observation.facing), s = Math.sin(observation.facing);
  const x = dx * c + dy * s, y = -dx * s + dy * c;
  return { turnInput, brakeInput,
    throttle: Math.max(-1, Math.min(1, x / ((x >= 0 ? observation.acceleration : observation.deceleration) * response))),
    strafeInput: Math.max(-1, Math.min(1, y / (observation.acceleration * observation.strafeMultiplier * response))) };
}
