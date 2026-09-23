export type MotionVector = [number, number];
export interface OriginalSmoothMovement<D = object> {
  position: MotionVector; velocity: MotionVector; accel: MotionVector;
  acceleration: number; maxSpeed: number; delegate: D | null; smoothCap: boolean; hardSpeedLimit: number;
}
export interface OriginalMovementServices<D = object> {
  travelSpeedOf?: (delegate: D) => number;
  fleetTravelSpeed?: () => number;
}
export function createOriginalSmoothMovement<D = object>(acceleration: number, maxSpeed: number, delegate?: D | null): OriginalSmoothMovement<D>;
export function advanceOriginalSmoothMovement<D>(state: OriginalSmoothMovement<D>, destination: readonly [number, number], targetVelocity: readonly [number, number], seconds: number, services?: OriginalMovementServices<D>): OriginalSmoothMovement<D>;
export interface OriginalSmoothFacing { turnAcceleration: number; maxTurnRate: number; turnRate: number; facing: number }
export function createOriginalSmoothFacing(turnAcceleration: number, maxTurnRate: number): OriginalSmoothFacing;
export function advanceOriginalSmoothFacing(state: OriginalSmoothFacing, targetFacing: number, seconds: number): OriginalSmoothFacing;
export function getOriginalMovementFacing(velocity: readonly [number, number]): number;
export interface MovementInput {
  position: readonly [number, number]; velocity: readonly [number, number]; destination: readonly [number, number];
  acceleration: number; maxSpeed: number; seconds: number;
}
export function advanceOriginalMovement(input: MovementInput): { position: MotionVector; velocity: MotionVector };
