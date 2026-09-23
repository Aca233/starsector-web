import { finite, requireThat } from '../core/Values.mjs';

const f = Math.fround;
const scalar = (n, name) => f(finite(n, name, -3.4028234663852886e38, 3.4028234663852886e38));
const vector = (v, name) => {
  requireThat(Array.isArray(v) && v.length === 2, 'INVALID_TRAVEL', `Expected ${name} vector`);
  return v.map(n => f(finite(n, name, -1e12, 1e12)));
};
const lengthSquared = v => f(f(v[0] * v[0]) + f(v[1] * v[1]));
const length = v => f(Math.sqrt(lengthSquared(v)));
const scale = (v, amount) => { v[0] = f(v[0] * amount); v[1] = f(v[1] * amount); return v; };
const normalize = v => lengthSquared(v) > 2 ** -149 ? scale(v, f(1 / length(v))) : v;
const normalizeAngle = angle => f(f(angle % 360) + 360) % 360;

/** Native two-argument constructor is NOT smooth-capped. Passing the third
 * argument (even null) selects the delegating constructor, which enables it.
 * The delegate is a caller-owned handle to an actual object (including a saved
 * objectRef); its speed is resolved at advance, not copied or fabricated. Vectors retain their identity. */
export function createOriginalSmoothMovement(acceleration, maxSpeed, delegate = null) {
  return { position: [0, 0], velocity: [0, 0], accel: [0, 0],
    acceleration: scalar(acceleration, 'acceleration'), maxSpeed: scalar(maxSpeed, 'maximum speed'),
    delegate, smoothCap: arguments.length >= 3, hardSpeedLimit: -1 };
}

/** SmoothMovementModule.advance. Callbacks bind the actual delegate/fleet
 * without storing functions in the module/checkpoint. fleetTravelSpeed is absent
 * exactly when the native advance receives no CampaignFleet. This mutates state. */
export function advanceOriginalSmoothMovement(state, destination, targetVelocity, seconds, services = {}) {
  const dt = scalar(seconds, 'movement seconds'), dtSquared = f(dt * dt);
  if (dtSquared === 0 || dt <= 0) return state;
  let maxSpeed = scalar(state.maxSpeed, 'maximum speed');
  const acceleration = scalar(state.acceleration, 'acceleration');
  if (state.delegate !== null) {
    requireThat(typeof services.travelSpeedOf === 'function', 'INVALID_TRAVEL', 'Movement delegate requires its live speed resolver');
    maxSpeed = scalar(services.travelSpeedOf(state.delegate), 'delegate speed');
  }
  if (acceleration <= 0) { state.accel[0] = 0; state.accel[1] = 0; return state; }
  const target = vector(destination, 'destination'), targetVel = vector(targetVelocity, 'target velocity');
  const deltaPos = target.map((n, i) => f(n - f(state.position[i])));
  const deltaVel = targetVel.map((n, i) => f(n - f(state.velocity[i])));
  scale(deltaPos, 3);
  const velocityChangeTime = f(length(deltaVel) / acceleration);
  scale(deltaVel, f(velocityChangeTime + 0.75));
  const steering = deltaPos.map((n, i) => -f(n + deltaVel[i]));
  let accelMagnitude = f(length(steering) / dtSquared);
  if (accelMagnitude > acceleration) accelMagnitude = acceleration;
  state.accel = accelMagnitude > 0 ? scale(normalize(steering), -accelMagnitude) : scale(steering, -1);
  for (let i = 0; i < 2; i++) state.velocity[i] = f(f(state.velocity[i]) + f(state.accel[i] * dt));
  // This is deliberately the pre-cap speed, including in the hard-limit branch.
  const speed = length(state.velocity);
  if (speed >= maxSpeed && speed > 0) {
    if (state.smoothCap) {
      const opposite = normalize(state.velocity.map(n => -n));
      let deceleration = f(speed - maxSpeed);
      if (deceleration < 50) deceleration = 50;
      const floor = services.fleetTravelSpeed === undefined ? f(accelMagnitude * 2)
        : f(accelMagnitude + scalar(services.fleetTravelSpeed(), 'fleet travel speed'));
      if (deceleration < floor) deceleration = floor;
      if (f(deceleration * dt) > f(speed - maxSpeed) && dt > 0) deceleration = f(f(speed - maxSpeed) / dt);
      scale(opposite, deceleration);
      for (let i = 0; i < 2; i++) state.velocity[i] = f(state.velocity[i] + f(opposite[i] * dt));
    } else scale(state.velocity, f(maxSpeed / speed));
  }
  const hardLimit = scalar(state.hardSpeedLimit, 'hard speed limit');
  // Source does not check speed > hardLimit. Do not turn this into a clamp.
  if (hardLimit >= 0 && speed > 0) scale(state.velocity, f(hardLimit / speed));
  for (let i = 0; i < 2; i++) state.position[i] = f(f(state.position[i]) + f(state.velocity[i] * dt));
  return state;
}

export function createOriginalSmoothFacing(turnAcceleration, maxTurnRate) {
  return { turnAcceleration: scalar(turnAcceleration, 'turn acceleration'), maxTurnRate: scalar(maxTurnRate, 'maximum turn rate'), turnRate: 0, facing: 0 };
}

/** SmoothFacingModule.advance, including signed (not abs) snap threshold and
 * no non-positive-dt early return. Zero acceleration's intermediate NaN is native. */
export function advanceOriginalSmoothFacing(state, targetFacing, seconds) {
  const target = scalar(targetFacing, 'target facing'), dt = scalar(seconds, 'facing seconds');
  const acceleration = scalar(state.turnAcceleration, 'turn acceleration'), maxRate = scalar(state.maxTurnRate, 'maximum turn rate');
  const facing = scalar(state.facing, 'facing'), rate = scalar(state.turnRate, 'turn rate');
  const speed = Math.abs(rate), stopTime = f(speed / acceleration);
  const stopDistance = f(f(speed * stopTime) - f(f(f(0.5 * acceleration) * stopTime) * stopTime));
  let distance = normalizeAngle(f(facing - target));
  if (distance > 180) distance = f(360 - distance);
  let delta = f(normalizeAngle(target) - normalizeAngle(facing));
  if (delta < 0) delta = f(delta + 360);
  let direction = delta === 0 || delta === 360 ? 0 : delta > 180 ? -1 : 1;
  if (Math.sign(rate) === Math.sign(direction) && stopDistance >= distance) direction = -direction;
  state.turnRate = f(rate + f(f(direction * acceleration) * dt));
  if (Math.abs(state.turnRate) > maxRate) state.turnRate = f(maxRate * Math.sign(state.turnRate));
  state.facing = normalizeAngle(f(facing + f(state.turnRate * dt)));
  if (distance < f(f(state.turnRate * dt) * 1.5)) state.facing = target;
  return state;
}

const javaInt = n => Number.isNaN(n) ? 0 : Math.max(-2147483648, Math.min(2147483647, Math.trunc(n)));
/** Utils vector angle: lazily evaluate the selected entry of its 1024x1024 atan
 * table, not atan2 of the input vector. The source's float index and quadrant
 * arithmetic, including zero/subnormal vectors and int overflow, are retained. */
export function getOriginalMovementFacing(velocity) {
  let [x, y] = vector(velocity, 'velocity'), offset = 0, sign = 1;
  if (x < 0) { x = -x; if (y < 0) y = -y; else sign = -1; offset = f(-Math.PI); }
  else if (y < 0) { y = -y; sign = -1; }
  const reciprocal = f(1 / f((x < y ? y : x) * f(1 / 1023)));
  const index = (javaInt(f(y * reciprocal)) * 1024 + javaInt(f(x * reciprocal))) | 0;
  if (index < 0 || index >= 1048576) return 0;
  const entry = f(Math.atan2(f(Math.floor(index / 1024) / 1024), f((index % 1024) / 1024)));
  return f(f(f(entry + offset) * sign) * f(57.295784));
}

/** Existing authoritative travel entry point: fleet smooth cap, zero target
 * velocity, no go-slow. It now uses the same float module as native fleet motion.
 * Travel stats passed here are already resolved; this is not full CampaignFleet.advance. */
export function advanceOriginalMovement({ position, velocity, destination, acceleration, maxSpeed, seconds }) {
  const p = vector(position, 'position'), v = vector(velocity, 'velocity'), target = vector(destination, 'destination');
  finite(acceleration, 'acceleration', 0, 1e9); finite(maxSpeed, 'maximum speed', 0, 1e9); finite(seconds, 'movement seconds', 0, 10);
  const state = createOriginalSmoothMovement(acceleration, maxSpeed, null);
  state.position = p; state.velocity = v;
  advanceOriginalSmoothMovement(state, target, [0, 0], seconds, { fleetTravelSpeed: () => maxSpeed });
  return { position: vector(state.position, 'next position'), velocity: vector(state.velocity, 'next velocity') };
}
