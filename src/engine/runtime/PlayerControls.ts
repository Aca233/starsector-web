import type { Ship } from '../simulation/Ship';
import { Vector2 } from '../math/Vector2';
import { signedAngle } from '../math/Angles';
import { DEFAULT_MOUSE_STEERING } from './CombatControlSettings';
/** Native OO0O turn-to-point: predict passive stopping angle, then issue digital commands. */
export function cursorTurnCommand(facing: number, angularVelocity: number, targetAngle: number, turnDeceleration: number): number {
  if (!(turnDeceleration > 0)) return 0;
  const stoppingAngle = angularVelocity * Math.abs(angularVelocity) / (2 * turnDeceleration);
  const predictedError = signedAngle(targetAngle - facing - stoppingAngle);
  if (Math.abs(predictedError) <= Math.PI / 180) return 0;
  const error = signedAngle(targetAngle - facing);
  if (Math.abs(error) < 1e-10) return -Math.sign(angularVelocity);
  const direction = Math.sign(error);
  return direction === Math.sign(angularVelocity) && Math.abs(stoppingAngle) > Math.abs(error) ? -direction : direction;
}
/** CSS client coordinates -> render pixels -> world. Works with offset/scaled/high-DPI canvases. */
export function clientToCombatWorld(client: {x:number;y:number}, canvas: Pick<HTMLCanvasElement,'width'|'height'|'getBoundingClientRect'>, camera: Vector2, zoom: number): Vector2 {
  const rect = canvas.getBoundingClientRect();
  if (!(rect.width > 0 && rect.height > 0 && zoom > 0)) return camera.clone();
  return new Vector2(((client.x - rect.left) * canvas.width / rect.width - canvas.width / 2) / zoom + camera.x,
    ((client.y - rect.top) * canvas.height / rect.height - canvas.height / 2) / zoom + camera.y);
}
/** Shift temporarily inverts the chosen steering mode; Q/E always strafe. */
export function applyPlayerControls(ship: Ship, keys: Readonly<Record<string,boolean>>, aim: Vector2, firing: boolean, defaultMouseSteering = DEFAULT_MOUSE_STEERING, pointerActive = true): void {
  ship.fireControlMode = 'MANUAL';
  ship.defenseFacingRad = undefined;
  ship.aiHoldOffensiveFire = false;
  ship.tacticalAI = undefined;
  // Input ownership is independent of the chosen A/D layout. A stale cursor must
  // not turn/fire the ship, nor turn A/D into rotation when mouse input is suspended.
  if (pointerActive) ship.aimTargetWorld.copy(aim);
  ship.isFiringMain = pointerActive && firing && !ship.isDead;
  if (ship.isDead) { ship.clearInput(); return; }
  const held = (...codes:string[]) => codes.some(code=>keys[code]);
  const steering = defaultMouseSteering !== held('ShiftLeft','ShiftRight');
  const horizontal = Number(held('KeyD','ArrowRight')) - Number(held('KeyA','ArrowLeft'));
  ship.throttle = Number(held('KeyW','ArrowUp')) - Number(held('KeyS','ArrowDown'));
  ship.brakeInput = held('KeyX');
  ship.strafeInput = Number(held('KeyE') || (steering && horizontal > 0)) - Number(held('KeyQ') || (steering && horizontal < 0));
  ship.turnInput = steering ? 0 : horizontal;
  if (steering && pointerActive && aim.distanceTo(ship.pos) > 1e-6) {
    ship.turnInput = cursorTurnCommand(ship.facingRad, ship.angularVelRad, Math.atan2(aim.y-ship.pos.y,aim.x-ship.pos.x),ship.getMotionStats().turnDeceleration);
  }
  if (ship.system.locksTurning || ship.flux.isOverloaded) ship.turnInput = 0;
}

export function zoomCombatView(zoom: number, wheelDelta: number): number {
  if (!Number.isFinite(wheelDelta) || wheelDelta === 0) return zoom;
  return Math.max(.3, Math.min(1.5, zoom * (wheelDelta < 0 ? 1.1 : .9)));
}
