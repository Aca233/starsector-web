import type { Ship } from '../engine/simulation/Ship';
import { Vector2 } from '../engine/math/Vector2';
import { signedAngle } from '../engine/math/Angles';
import { applyPlayerControls } from '../engine/runtime/PlayerControls';
import { advanceShipMotion } from '../engine/simulation/systems/ShipMotion';
import { setShipPresentationPose } from '../engine/visual/ShipPresentation';
import { blankInput, KEY_CODES } from './protocol';
import type { PlayerInput } from './protocol';

/** Bounded motion-only replay. No weapon, collision, flux, AI or combat fixedUpdate. */
export class MotionPrediction {
  private samples: { input: PlayerInput; time: number }[] = [];
  private receivedAt = 0;
  private lastRender = 0;
  private lastPose: { pos: Vector2; facing: number } | null = null;
  private lastAuthority: Vector2 | null = null;
  private correct = false;
  private offset = new Vector2();
  private angleOffset = 0;
  record(input: PlayerInput, time: number) {
    this.samples.push({ input: { ...input, aim: [...input.aim], actions: [] }, time });
    this.samples = this.samples.filter(sample => time - sample.time < 1000).slice(-60);
  }
  receive(ship: Ship, acknowledged: number, now: number) {
    this.samples = this.samples.filter(sample => sample.input.seq > acknowledged);
    // Teleportation / a large authoritative collision correction cannot be replayed.
    if (this.lastAuthority && this.lastAuthority.distanceTo(ship.pos) > Math.max(100, ship.spec.collisionRadius * 2)) this.clear(ship);
    this.lastAuthority = ship.pos.clone();
    this.receivedAt = now;
    this.correct = true;
  }
  clear(ship: Ship) {
    setShipPresentationPose(ship, null);
    this.samples = [];
    this.lastPose = null;
    this.offset.set(0, 0);
    this.angleOffset = 0;
    this.lastRender = 0;
  }
  render(ship: Ship, live: PlayerInput, now: number, enabled: boolean) {
    if (!enabled || ship.isDead || ship.isRetreated || now - this.receivedAt > 500) {
      this.clear(ship);
      return;
    }
    // Inherited components are READ ONLY. The motion equations write only these
    // own pose/input fields, and applyPlayerControls receives its own aim vector.
    const replica = Object.create(ship) as Ship;
    replica.pos = ship.pos.clone();
    replica.vel = ship.vel.clone();
    replica.facingRad = ship.facingRad;
    replica.angularVelRad = ship.angularVelRad;
    replica.aimTargetWorld = ship.aimTargetWorld.clone();
    const elapsed = Math.min(.05, Math.max(0, (now - (this.lastRender || now)) / 1000));
    this.lastRender = now;
    const start = Math.max(now - 250, this.samples[0]?.time ?? this.receivedAt);
    const liveSince = now - Math.min(16.67, elapsed * 1000);
    let input = blankInput(), index = 0;
    for (let time = start; time < now; ) {
      while (index < this.samples.length && this.samples[index].time <= time) input = this.samples[index++].input;
      if (time >= liveSince) input = live;
      const nextEdge = Math.min(this.samples[index]?.time ?? now, time < liveSince ? liveSince : now);
      const stepMs = Math.min(1000 / 60, now - time, Math.max(.001, nextEdge - time));
      const keys: Record<string, boolean> = {};
      KEY_CODES.forEach((key, bit) => { keys[key] = !!(input.keys & (1 << bit)); });
      applyPlayerControls(replica, keys, new Vector2(...input.aim), false, undefined, input.pointerActive);
      advanceShipMotion(replica, stepMs / 1000 * Math.min(4, ship.subjectiveTimeMultiplier));
      time += stepMs;
    }
    if (this.correct && this.lastPose) {
      const distance = this.lastPose.pos.distanceTo(replica.pos);
      this.offset = distance < Math.max(80, ship.spec.collisionRadius) ? this.lastPose.pos.clone().sub(replica.pos) : new Vector2();
      this.angleOffset = distance < 80 ? signedAngle(this.lastPose.facing - replica.facingRad) : 0;
    }
    this.correct = false;
    const decay = Math.exp(-elapsed / .09);
    this.offset.scale(decay);
    this.angleOffset *= decay;
    this.lastPose = { pos: replica.pos.clone().add(this.offset), facing: replica.facingRad + this.angleOffset };
    setShipPresentationPose(ship, this.lastPose);
  }
}
