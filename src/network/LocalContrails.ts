import { Vector2 } from '../engine/math/Vector2';
import type { CombatEngine } from '../engine/simulation/CombatEngine';
import { appendMissileContrail } from '../engine/simulation/MissileContrails';

/** Client-owned cosmetic ribbons. Authority snapshots still own every projectile. */
export class LocalContrails {
  private time: number | null = null;
  private serial = 0;
  private tracked = new Map<number, { strip: string; position: Vector2; seen: boolean }>();

  reset(engine: CombatEngine): void {
    engine.contrailEngine.clear();
    this.tracked.clear();
    this.time = null;
  }

  update(engine: CombatEngine, visualTime: number, alpha: number, reset = false): void {
    if (!Number.isFinite(visualTime) || !Number.isFinite(alpha)) { this.reset(engine); return; }
    const elapsed = this.time === null ? 0 : visualTime - this.time;
    if (reset || elapsed < 0 || elapsed > .5) this.reset(engine);
    const dt = this.time === null ? 0 : visualTime - this.time;
    // Freeze with SnapshotPlayback on packet starvation/pause; never use wall time
    // to keep flying missiles or emitting smoke after the authority has stopped.
    if (this.time !== null && (dt === 0 || Math.floor(visualTime * 60 + 1e-6) === Math.floor(this.time * 60 + 1e-6))) return;
    // At most one emission sample per 60 Hz visual slot: a 180 Hz renderer must
    // not triple the ribbon point count. Slow frames do not replay a burst.
    this.time = visualTime;
    engine.contrailEngine.update(dt);
    for (const state of this.tracked.values()) state.seen = false;
    const blend = Math.max(0, Math.min(1, alpha));
    for (const p of engine.projectiles) {
      if (!p.isRocket || p.isFlare || p.isMine || p.collisionDisabled || p.isDisarmed || p.flareFizzling || p.didDamage
        || (p.hitpoints !== undefined && p.hitpoints <= 0) || (p.flightTimeRemaining !== undefined && p.flightTimeRemaining <= 0)) continue;
      const position = Vector2.lerp(p.prevPos, p.pos, blend);
      if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) continue;
      let state = this.tracked.get(p.id);
      const maxStep = Math.max(250, p.vel.length() * Math.max(dt, 1 / 60) * 4);
      if (state && position.distanceTo(state.position) > maxStep) {
        // A new strip prevents a teleport/correction from drawing across the map.
        engine.contrailEngine.detach(state.strip);
        state = undefined;
      }
      if (!state) {
        state = { strip: 'local:' + ++this.serial, position, seen: true };
        this.tracked.set(p.id, state);
      } else { state.position.copy(position); state.seen = true; }
      appendMissileContrail(engine.contrailEngine, p, position, state.strip);
    }
    for (const [id, state] of this.tracked) if (!state.seen) {
      engine.contrailEngine.detach(state.strip);
      this.tracked.delete(id);
    }
  }
}
