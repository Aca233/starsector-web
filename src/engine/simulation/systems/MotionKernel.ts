import { coordinateLength } from '../../math/Vector2';

/** Numeric packet layout. First six values are the authoritative pose during
 * this motion stage. No entities, property readers, allocations or random state. */
export const MOTION_WIDTH = 22;
export enum MotionField {
  X, Y, VelocityX, VelocityY, Facing, AngularVelocity, Dt, Turn, Brake, Throttle, Strafe, Flags,
  Acceleration, Deceleration, MaxSpeed, TurnAcceleration, MaxTurnRate, DriftAcceleration,
  StrafeMultiplier, Accelerating, Spreading, CommitState
}
function overspeedScale(vx: number, vy: number, limit: number, amount: number): number {
  const speed = coordinateLength(vx, vy);
  return speed > limit ? (speed - Math.min(amount, speed - limit)) / speed : 1;
}
export enum MotionFlag {
  FlamedOut = 1, ForceForward = 2, LockedTurning = 4, ForcedRightTurn = 8,
  ForceBraking = 16, BlockAcceleration = 32, BlockStrafing = 64, Fighter = 128
}
export function advanceAngularVelocity(velocity: number, input: number, dt: number, acceleration: number, limit: number): number {
  if (Math.abs(input) <= .01) return velocity - Math.sign(velocity) * Math.min(Math.abs(velocity), acceleration * .5 * dt);
  const step = dt * Math.min(1, Math.abs(input)) * acceleration;
  if (Math.abs(velocity) > limit) return velocity - Math.sign(velocity) * Math.min(Math.abs(velocity), step * 2);
  const next = velocity + Math.sign(input) * step;
  return Math.abs(next) > limit ? Math.sign(input) * limit : next;
}

/** Independent rows can be partitioned without depending on commit order. */
export function advanceMotionRow(values: Float64Array, offset: number): void {
  const dt = values[offset + MotionField.Dt];
  values[offset + MotionField.Accelerating] = values[offset + MotionField.Spreading] = 0;
  if (!(dt > 0)) return;
  let vx = values[offset + MotionField.VelocityX], vy = values[offset + MotionField.VelocityY];
  const facing = values[offset + MotionField.Facing], flags = values[offset + MotionField.Flags];
  let angular = values[offset + MotionField.AngularVelocity];
  if (!(flags & MotionFlag.FlamedOut)) {
    const acceleration = values[offset + MotionField.Acceleration], deceleration = values[offset + MotionField.Deceleration];
    const maxSpeed = values[offset + MotionField.MaxSpeed], turnAcceleration = values[offset + MotionField.TurnAcceleration];
    const maxTurnRate = values[offset + MotionField.MaxTurnRate];
    const burn = !!(flags & MotionFlag.ForceForward);
    const turn = flags & MotionFlag.LockedTurning ? 0 : flags & MotionFlag.ForcedRightTurn ? 1 : values[offset + MotionField.Turn];
    const turning = Math.abs(turn) > .01;
    if (turning) angular = advanceAngularVelocity(angular, turn, dt, turnAcceleration, maxTurnRate);
    angular += values[offset + MotionField.DriftAcceleration] * dt;
    if (!turning) angular = advanceAngularVelocity(angular, 0, dt, turnAcceleration, maxTurnRate);
    const brake = !!(flags & MotionFlag.ForceBraking) || (!burn && !(flags & MotionFlag.BlockAcceleration) && !!values[offset + MotionField.Brake]);
    const throttle = brake || flags & MotionFlag.BlockAcceleration ? 0 : burn ? 1 : Math.max(-1, Math.min(1, values[offset + MotionField.Throttle]));
    const strafe = brake || burn || flags & MotionFlag.BlockStrafing ? 0 : Math.max(-1, Math.min(1, values[offset + MotionField.Strafe]));
    let accelerating = false, spreading = false, commanded = false;
    // Match Vector2.length / scale arithmetic and the authored command order.
    if (brake) {
      const speed = coordinateLength(vx, vy);
      if (speed > 0) {
        const amount = deceleration * dt, scale = Math.max(0, speed - amount) / speed;
        vx *= scale; vy *= scale;
        const remaining = coordinateLength(vx, vy);
        const limitScale = overspeedScale(vx,vy,maxSpeed,acceleration * 2 * dt); vx *= limitScale; vy *= limitScale;
        if (remaining <= 1 || remaining < amount) vx = vy = 0;
      }
      spreading = commanded = true;
    } else {
      if (Math.abs(strafe) > .01) {
        const amount = dt * Math.abs(strafe), angle = facing + Math.sign(strafe) * Math.PI / 2;
        const thrust = amount * acceleration * values[offset + MotionField.StrafeMultiplier];
        vx += Math.cos(angle) * thrust; vy += Math.sin(angle) * thrust;
        const scale=overspeedScale(vx,vy,maxSpeed,acceleration * 2 * amount); vx*=scale; vy*=scale;
        spreading = commanded = true;
      }
      if (Math.abs(throttle) > .01) {
        const amount = dt * Math.abs(throttle), thrust = amount * (throttle < 0 ? -deceleration : acceleration);
        vx += Math.cos(facing) * thrust; vy += Math.sin(facing) * thrust;
        const scale=overspeedScale(vx,vy,maxSpeed,Math.max(acceleration, deceleration) * 2 * amount); vx*=scale; vy*=scale;
        accelerating = throttle > 0; spreading ||= throttle < 0; commanded = true;
      }
    }
    if (!commanded && !(flags & MotionFlag.Fighter) && coordinateLength(vx, vy) > maxSpeed) {
      const scale=overspeedScale(vx,vy,maxSpeed,acceleration * 2 * dt); vx*=scale; vy*=scale; spreading = true;
    }
    values[offset + MotionField.Accelerating] = Number(accelerating);
    values[offset + MotionField.Spreading] = Number(spreading);
  }
  values[offset + MotionField.VelocityX] = vx; values[offset + MotionField.VelocityY] = vy;
  values[offset + MotionField.X] += vx * dt; values[offset + MotionField.Y] += vy * dt;
  values[offset + MotionField.AngularVelocity] = angular;
  values[offset + MotionField.Facing] = facing + angular * dt;
}
