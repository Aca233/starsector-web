import type { Ship } from '../Ship';
import type { HullSize } from '../FluxTracker';
import type { Vector2 } from '../../math/Vector2';

/** ship/null.cfr_renamed_4(): hull-size-specific lateral acceleration. */
export function strafeAccelerationMultiplier(size: HullSize | undefined): number {
  return size === 'CAPITAL_SHIP' ? .25 : size === 'CRUISER' ? .5 : size === 'DESTROYER' || size === 'FIGHTER' ? .75 : 1;
}

export function shipMotionStats(ship: Ship, excludedSystemSpeedFlat = 0) {
  const mult = ship.engineController.movementMultiplier * ship.terrainSpeedMult * ship.crMovementMultiplier;
  const boost = ship.flux.isEngineBoostActive;
  let maxSpeed = (ship.spec.maxSpeed + ship.hullStats.speedBonus + ship.system.getSpeedFlatBonus() - excludedSystemSpeedFlat + (boost ? 50 + ship.hullStats.zeroFluxSpeedBonus : 0)) * (1 + (ship.hullStats.speedPercent + ship.fleetSpeedBonusPercent + ship.system.getSpeedPercentBonus()) / 100) * ship.hullStats.speedMultiplier * mult;
  if (ship.shield.type === 'PHASE' && ship.shield.isPhaseEngaged) {
    maxSpeed *= ship.shield.getPhaseSpeedMultiplier(ship.flux.maxFlux > 0 ? ship.flux.hardFlux / ship.flux.maxFlux : 0);
  }
  const disabled = ship.engineController.state === 'DISABLED';
  const turnAcceleration = (disabled ? 1 : Math.max(1, (ship.spec.turnAccelerationDeg + ship.system.getTurnAccelerationFlatBonus()) * (1 + (ship.hullStats.turnAccelerationPercent + ship.system.getTurnAccelerationPercentBonus()) / 100) * ship.hullStats.turnAccelerationMultiplier * mult)) * Math.PI / 180;
  return {
    acceleration: disabled ? 1 : Math.max(1, (ship.spec.acceleration + ship.hullStats.accelerationBonus + ship.system.getAccelerationFlatBonus()) * (1 + (ship.hullStats.accelerationPercent + ship.system.getAccelerationPercentBonus()) / 100) * ship.hullStats.accelerationMultiplier * mult),
    deceleration: disabled ? 1 : Math.max(1, (ship.spec.deceleration + ship.hullStats.decelerationBonus + ship.system.getDecelerationFlatBonus()) * (1 + (ship.hullStats.decelerationPercent + ship.system.getDecelerationPercentBonus()) / 100) * ship.hullStats.decelerationMultiplier * mult),
    maxSpeed: disabled ? 1 : Math.max(1, maxSpeed),
    maxTurnRate: (disabled ? 1 : Math.max(1, (ship.spec.maxTurnRateDeg + ship.system.getTurnRateFlatBonus() + (boost ? 10 * ship.hullStats.zeroFluxTurnMultiplier : 0)) * (1 + (ship.hullStats.turnRatePercent + ship.system.getTurnRatePercentBonus()) / 100) * ship.hullStats.turnRateMultiplier * mult)) * Math.PI / 180,
    turnAcceleration,
    turnDeceleration: turnAcceleration * .5,
    driftAcceleration: ship.engineController.driftAcceleration(turnAcceleration, ship.isEngineGlowExtended),
    strafeMultiplier: strafeAccelerationMultiplier(ship.spec.hullSize)
  };
}

/** Reduce excess speed at a finite rate without changing the direction. */
export function reduceOverspeed(velocity: Vector2, limit: number, amount: number): void {
  const speed = velocity.length();
  if (speed > limit) velocity.scale((speed - Math.min(amount, speed - limit)) / speed);
}

export function advanceAngularVelocity(velocity: number, input: number, dt: number, acceleration: number, limit: number): number {
  if (Math.abs(input) <= .01) {
    return velocity - Math.sign(velocity) * Math.min(Math.abs(velocity), acceleration * .5 * dt);
  }
  const step = dt * Math.min(1, Math.abs(input)) * acceleration;
  if (Math.abs(velocity) > limit) return velocity - Math.sign(velocity) * Math.min(Math.abs(velocity), step * 2);
  const next = velocity + Math.sign(input) * step;
  return Math.abs(next) > limit ? Math.sign(input) * limit : next;
}

/** Source command equations, with Web analog-input magnitudes retained. */
export function advanceShipMotion(ship: Ship, dt: number): { accelerating: boolean; spreading: boolean } {
  if (!(dt > 0)) return { accelerating: false, spreading: false };
  if (ship.engineController.isFlamedOut) {
    ship.pos.addScaled(ship.vel, dt);
    ship.facingRad += ship.angularVelRad * dt;
    return { accelerating: false, spreading: false };
  }
  const stats = shipMotionStats(ship);
  const burnDrive = ship.system.forcesForward;
  const turn = ship.system.locksTurning || ship.flux.isOverloaded ? 0 : ship.hullStats.forcedRightTurn > 0 ? 1 : ship.turnInput;
  const turning = Math.abs(turn) > .01;
  if (turning) ship.angularVelRad = advanceAngularVelocity(ship.angularVelRad, turn, dt, stats.turnAcceleration, stats.maxTurnRate);
  // Source order: commanded turn, damage drift, then passive braking only when
  // no turn command was accepted. Drift is not canceled by steering or throttle0.
  ship.angularVelRad += stats.driftAcceleration * dt;
  if (!turning) ship.angularVelRad = advanceAngularVelocity(ship.angularVelRad, 0, dt, stats.turnAcceleration, stats.maxTurnRate);
  const brake = ship.system.forcesBraking || (!burnDrive && !ship.system.blocksAcceleration && ship.brakeInput);
  const throttle = brake || ship.system.blocksAcceleration ? 0 : burnDrive ? 1 : Math.max(-1, Math.min(1, ship.throttle));
  const strafe = brake || burnDrive || ship.system.blocksStrafing ? 0 : Math.max(-1, Math.min(1, ship.strafeInput));
  let accelerating = false, spreading = false, commanded = false;

  if (brake) {
    const speed = ship.vel.length();
    if (speed > 0) {
      const amount = stats.deceleration * dt;
      ship.vel.scale(Math.max(0, speed - amount) / speed);
      const remaining = ship.vel.length();
      reduceOverspeed(ship.vel, stats.maxSpeed, stats.acceleration * 2 * dt);
      if (remaining <= 1 || remaining < amount) ship.vel.set(0, 0);
    }
    spreading = commanded = true;
  } else {
    // Keep a fixed command ordering for simultaneous Web controls. The native
    // API accepts an ordered command list; analog/digital input translation is ours.
    if (Math.abs(strafe) > .01) {
      const amount = dt * Math.abs(strafe);
      const angle = ship.facingRad + Math.sign(strafe) * Math.PI / 2;
      const thrust = amount * stats.acceleration * stats.strafeMultiplier;
      ship.vel.x += Math.cos(angle) * thrust; ship.vel.y += Math.sin(angle) * thrust;
      reduceOverspeed(ship.vel, stats.maxSpeed, stats.acceleration * 2 * amount);
      spreading = commanded = true;
    }
    if (Math.abs(throttle) > .01) {
      const amount = dt * Math.abs(throttle);
      const thrust = amount * (throttle < 0 ? -stats.deceleration : stats.acceleration);
      ship.vel.x += Math.cos(ship.facingRad) * thrust; ship.vel.y += Math.sin(ship.facingRad) * thrust;
      reduceOverspeed(ship.vel, stats.maxSpeed, Math.max(stats.acceleration, stats.deceleration) * 2 * amount);
      accelerating = throttle > 0;
      spreading ||= throttle < 0;
      commanded = true;
    }
  }
  // Ship.advance adds the source slow-to-max command while idle and overspeed.
  // Wing-leader-specific fighter behavior is not represented by the Web roster.
  if (!commanded && ship.spec.hullSize !== 'FIGHTER' && ship.vel.length() > stats.maxSpeed) {
    reduceOverspeed(ship.vel, stats.maxSpeed, stats.acceleration * 2 * dt);
    spreading = true;
  }
  // No invented below-limit idle drag; explicit braking uses deceleration.
  ship.pos.addScaled(ship.vel, dt);
  ship.facingRad += ship.angularVelRad * dt;
  return { accelerating, spreading };
}
