import type { CombatDisplayShip as Ship } from '../engine/runtime/CombatDisplayReads';
import { Vector2 } from '../engine/math/Vector2';
import { signedAngle } from '../engine/math/Angles';
import { applyPlayerControls } from '../engine/runtime/PlayerControls';
import { advanceMotionWithStats } from '../engine/simulation/systems/ShipMotion';
import { setShipPresentationPose } from '../engine/visual/ShipPresentation';
import { blankInput, KEY_CODES } from './protocol';
import type { PlayerInput } from './protocol';

type MotionState = Pick<Ship, 'pos' | 'vel' | 'facingRad' | 'angularVelRad'>;
type SuspendReason = 'inactive' | 'collision' | 'unavailable' | 'stale';
const copyInput = (input: PlayerInput): PlayerInput => ({ ...input, aim: [...input.aim], actions: [] });
function replicaOf(ship: Ship, state: MotionState): Ship {
  // Inherited components are READ ONLY. Both motion functions write only own
  // pose/input fields. Never call combat fixedUpdate on this detached object.
  const replica = Object.create(ship) as Ship;
  replica.pos = state.pos.clone(); replica.vel = state.vel.clone();
  replica.facingRad = state.facingRad; replica.angularVelRad = state.angularVelRad;
  replica.aimTargetWorld = ship.aimTargetWorld.clone();
  return replica;
}
function advance(replica: Ship, input: PlayerInput, seconds: number) {
  const keys: Record<string, boolean> = {};
  KEY_CODES.forEach((key, bit) => { keys[key] = !!(input.keys & (1 << bit)); });
  applyPlayerControls(replica, keys, new Vector2(...input.aim), false, undefined, input.pointerActive);
  advanceMotionWithStats(replica, seconds * Math.min(4, replica.subjectiveTimeMultiplier), replica.getMotionStats());
}

/** Bounded motion-only replay. No weapon, collision, flux, AI or combat fixedUpdate. */
export class MotionPrediction {
  private samples: { input: PlayerInput; time: number }[] = [];
  private held = blankInput();
  private receivedAt = -Infinity;
  private lastRender: number | null = null;
  private lastPredicted: MotionState | null = null;
  private lastPose: { pos: Vector2; facing: number } | null = null;
  private lastAuthority: Vector2 | null = null;
  private lastTeleportSequence: number | null = null;
  private correct = false;
  private offset = new Vector2();
  private angleOffset = 0;
  private state: 'reset' | 'active' | SuspendReason = 'reset';
  private counts = { renderedFrames: 0, suspendedFrames: 0, reconciliations: 0, hardSnaps: 0 };
  private correctionDistance = 0;
  private correctionAngleDeg = 0;
  private replayMs = 0;
  stats() {
    return { active: this.state === 'active', reason: this.state, ...this.counts,
      correctionDistance: this.correctionDistance, correctionAngleDeg: this.correctionAngleDeg,
      replayMs: this.replayMs, pendingInputs: this.samples.length };
  }
  record(input: PlayerInput, time: number) {
    this.samples.push({ input: copyInput(input), time });
    this.samples = this.samples.filter(sample => time - sample.time < 1000).slice(-60);
  }
  receive(ship: Ship, acknowledged: number, now: number) {
    // Teleportation / a large authoritative collision correction cannot be replayed.
    if ((this.lastTeleportSequence !== null && this.lastTeleportSequence !== ship.teleportSequence)
      || (this.lastAuthority && this.lastAuthority.distanceTo(ship.pos) > Math.max(100, ship.spec.collisionRadius * 2))) {
      this.clear(ship); this.counts.hardSnaps++;
    }
    // Held controls survive ACK pruning. Actions are never replayed here.
    for (const sample of this.samples) if (sample.input.seq <= acknowledged) this.held = sample.input;
    this.samples = this.samples.filter(sample => sample.input.seq > acknowledged);
    this.lastTeleportSequence = ship.teleportSequence;
    this.lastAuthority = ship.pos.clone();
    this.receivedAt = now;
    this.correct = true;
  }
  clear(ship: Ship, preservePresentation = false) {
    if (!preservePresentation) setShipPresentationPose(ship, null);
    this.samples = []; this.held = blankInput();
    this.lastPose = null; this.lastPredicted = null;
    this.offset.set(0, 0); this.angleOffset = 0;
    this.lastRender = null; this.receivedAt = -Infinity;
    this.lastAuthority = null; this.lastTeleportSequence = null;
    this.correct = false; this.replayMs = 0; this.state = 'reset';
  }
  /** Drop old correction/replay state even when the authority display lane wins. */
  suspend(ship: Ship, reason: SuspendReason, preservePresentation = false) {
    this.clear(ship, preservePresentation);
    this.state = reason; this.counts.suspendedFrames++;
  }
  render(ship: Ship, live: PlayerInput, now: number, enabled: boolean, authority: Ship = ship, preservePresentation = false) {
    if (!enabled || ship.isDead || ship.isRetreated || now - this.receivedAt > 500) {
      this.suspend(ship, !enabled ? 'inactive' : ship.isDead || ship.isRetreated ? 'unavailable' : 'stale', preservePresentation);
      return;
    }
    const replica = replicaOf(ship, authority);
    const gap = this.lastRender === null ? 0 : Math.max(0, (now - this.lastRender) / 1000);
    const elapsed = Math.min(.05, gap);
    this.lastRender = now;
    // New local samples must not erase elapsed time since the last baseline.
    const start = Math.max(now - 250, Math.min(this.receivedAt, this.samples[0]?.time ?? this.receivedAt));
    this.replayMs = Math.max(0, now - start);
    const liveSince = now - Math.min(16.67, elapsed * 1000);
    let input = this.held, index = 0;
    for (let time = start; time < now; ) {
      while (index < this.samples.length && this.samples[index].time <= time) input = this.samples[index++].input;
      if (time >= liveSince) input = live;
      const nextEdge = Math.min(this.samples[index]?.time ?? now, time < liveSince ? liveSince : now);
      const stepMs = Math.min(1000 / 60, now - time, nextEdge - time);
      advance(replica, input, stepMs / 1000);
      time += stepMs;
    }
    if (this.correct && this.lastPose && this.lastPredicted && gap <= .05) {
      // Compare poses at the SAME display time. Comparing last frame directly
      // with this frame treats ordinary forward motion as error on every ACK,
      // repeatedly adding the smoothing delay even on a perfect connection.
      const continuing = replicaOf(ship, this.lastPredicted);
      for (let remaining = elapsed; remaining > 1e-9; ) {
        const dt = Math.min(1 / 60, remaining); advance(continuing, live, dt); remaining -= dt;
      }
      const expected = this.lastPose.pos.clone().add(continuing.pos.clone().sub(this.lastPredicted.pos));
      const expectedAngle = this.lastPose.facing + continuing.facingRad - this.lastPredicted.facingRad;
      const distance = expected.distanceTo(replica.pos), angle = signedAngle(expectedAngle - replica.facingRad);
      this.correctionDistance = distance; this.correctionAngleDeg = Math.abs(angle) * 180 / Math.PI;
      this.counts.reconciliations++;
      const small = distance < Math.max(80, ship.spec.collisionRadius) && Math.abs(angle) < Math.PI / 4;
      this.offset = small ? expected.sub(replica.pos) : new Vector2();
      this.angleOffset = small ? angle : 0;
      if (!small) this.counts.hardSnaps++;
    } else if (gap > .05) {
      // A long local stall is not continuous motion; don't drag an old pose back.
      this.offset.set(0, 0); this.angleOffset = 0;
    }
    this.correct = false;
    const decay = Math.exp(-elapsed / .09);
    this.offset.scale(decay); this.angleOffset *= decay;
    this.lastPredicted = { pos: replica.pos.clone(), vel: replica.vel.clone(), facingRad: replica.facingRad, angularVelRad: replica.angularVelRad };
    this.lastPose = { pos: replica.pos.clone().add(this.offset), facing: replica.facingRad + this.angleOffset };
    this.state = 'active'; this.counts.renderedFrames++;
    setShipPresentationPose(ship, this.lastPose);
  }
}
