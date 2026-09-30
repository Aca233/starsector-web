/** A command-edge direction, not a live cursor reference or a velocity bank. */
export interface GravityManeuverState {
  targetAngle: number;
  age: number;
  turnRemaining: number;
}
export interface GravityManeuverSpec {
  duration: number;
  maxTurn: number;
  turnRate: number;
  lateralAcceleration: number;
  minSpeed: number;
  minAimDistance: number;
}
export function validateGravityManeuver(spec?: GravityManeuverSpec): void {
  if (!spec) return;
  for (const key of ['duration', 'maxTurn', 'turnRate', 'lateralAcceleration', 'minSpeed', 'minAimDistance'] as const) if (!Number.isFinite(spec[key]) || spec[key] <= 0) throw Error('Invalid gravity maneuver ' + key);
  if (spec.maxTurn > Math.PI || spec.turnRate > Math.PI * 2) throw Error('Invalid gravity maneuver angle');
}
