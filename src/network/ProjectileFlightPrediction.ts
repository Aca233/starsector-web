import { Vector2 } from '../engine/math/Vector2';
import type { CombatEngine } from '../engine/simulation/CombatEngine';
import type { Projectile } from '../engine/simulation/Weapon';
import { advanceSourceProjectile, hasSourceProjectileLifecycle } from '../engine/simulation/systems/weapon/SourceProjectileLifecycle';
import { setProjectileFlightLayer } from '../engine/render/ProjectileFlightLayer';
import { projectileVisualLayer } from '../engine/render/ProjectileVisualLayer';

export const PROJECTILE_FLIGHT_LIMITS = Object.freeze({ horizonMs: 100, staleMs: 250 });
const STEP = 1 / 60;
type Pose = { source: Projectile; sim: Projectile; display: Projectile; seconds: number; horizon: number; native: boolean };
const finiteVector = (v?: Vector2): boolean => !!v && Number.isFinite(v.x) && Number.isFinite(v.y);

function eligible(p: Projectile): boolean {
  return (p.spawnType === 'BALLISTIC' || p.spawnType === 'BALLISTIC_AS_BEAM' || p.spawnType === 'PLASMA')
    && !p.isRocket && !p.isGuided && !p.isMine && !p.isFlare && !p.isFighterDecoy && !p.mote
    && !p.isHullExplosion && !p.didDamage && !p.isDisarmed && !p.inertialFlight && !p.angularVelocityRad
    && !p.proximityFuse && !p.mirv && !p.flareBehavior && !p.missileLifecycleSpec
    && p.systemFuseSeconds === undefined && p.flightTimeRemaining === undefined
    && !(p.fadeProgress ?? 0) && Number.isFinite(p.id) && finiteVector(p.pos) && finiteVector(p.vel)
    && (!p.ballisticTail || finiteVector(p.ballisticTail)) && (!p.sourceVelocity || finiteVector(p.sourceVelocity))
    && (p.facingRad === undefined || Number.isFinite(p.facingRad))
    && (p.projLength === undefined || Number.isFinite(p.projLength))
    && (p.fadeTime === undefined || Number.isFinite(p.fadeTime))
    && (p.sourceMoveSpeed === undefined || Number.isFinite(p.sourceMoveSpeed))
    && (p.movingRayMoveSpeed === undefined || Number.isFinite(p.movingRayMoveSpeed))
    && Number.isFinite(p.elapsedTime) && Number.isFinite(p.rangeRemaining) && p.rangeRemaining > 0;
}
function makePose(source: Projectile): Projectile {
  return { ...source, pos: new Vector2(), prevPos: new Vector2(),
    ballisticTail: source.ballisticTail ? new Vector2() : undefined,
    prevBallisticTail: source.ballisticTail ? new Vector2() : undefined }; 
}
function copyMotion(to: Projectile, from: Projectile): void {
  to.pos.copy(from.pos); to.prevPos.copy(from.pos);
  if (from.ballisticTail) {
    (to.ballisticTail ??= new Vector2()).copy(from.ballisticTail);
    (to.prevBallisticTail ??= new Vector2()).copy(from.ballisticTail);
  } else { to.ballisticTail = undefined; to.prevBallisticTail = undefined; }
  to.elapsedTime = from.elapsedTime; to.rangeRemaining = from.rangeRemaining;
  to.fadeProgress = from.fadeProgress; to.prevFadeProgress = from.fadeProgress;
  to.sourceMoveSpeed = from.sourceMoveSpeed; to.unfadedDamage = from.unfadedDamage; to.unfadedEmp = from.unfadedEmp;
  to.damage = from.damage; to.empDamage = from.empDamage; to.softFlux = from.softFlux;
}
function advance(p: Projectile, seconds: number, native: boolean): void {
  if (seconds <= 0) return;
  p.elapsedTime += seconds;
  if (native) advanceSourceProjectile(p, seconds);
  else { p.pos.addScaled(p.vel, seconds); p.rangeRemaining -= p.vel.length() * seconds; }
}

/** Predicts only the flight of already confirmed ordinary shots. Each full
 * snapshot rebases the view. No new entities, hit tests, FX, RNG or authority
 * progress. The fixed-step state never consumes fractional RAF remainders. */
export class ProjectileFlightPrediction {
  private poses: Pose[] = [];
  private readonly layer = new Map<Projectile, Projectile>();
  private tick = -1;
  private at = 0;
  private engine: DisplaySource | null = null;
  private frames = 0;
  private ageMs = 0;
  private active = false;
  reset(): void {
    if (this.engine) setProjectileFlightLayer(this.engine);
    this.poses.length = 0; this.layer.clear(); this.tick = -1; this.active = false; this.ageMs = 0;
  }
  receive(engine: DisplaySource, tick: number, now: number): void {
    if (!Number.isSafeInteger(tick) || tick < 0 || !Number.isFinite(now)) return;
    if (this.engine !== engine) { this.reset(); this.engine = engine; }
    if (tick <= this.tick) return;
    this.tick = tick; this.at = now; this.layer.clear();
    let count = 0;
    for (const p of engine.projectiles) {
      if (!eligible(p)) continue;
      const native = hasSourceProjectileLifecycle(p);
      // Do not enter unconfirmed fade/range expiry, even on a low-rate link.
      const speed = native ? (p.sourceMoveSpeed ?? p.movingRayMoveSpeed ?? p.vel.length()) : p.vel.length();
      if (!Number.isFinite(speed) || speed <= 0) continue;
      const horizon = Math.min(PROJECTILE_FLIGHT_LIMITS.horizonMs / 1000, p.rangeRemaining / speed * (1 - 1e-9));
      let pose = this.poses[count];
      if (!pose || pose.source !== p) pose = { source: p, sim: makePose(p), display: makePose(p), seconds: 0, horizon, native };
      // A unique prototype per entity makes the hot advance/render path
      // megamorphic. Use plain records and retain owned vector storage. Refresh
      // full appearance only at a snapshot, never on each display frame.
      const old = pose.display;
      pose.display = { ...p, pos: old.pos, prevPos: old.prevPos,
        ballisticTail: old.ballisticTail, prevBallisticTail: old.prevBallisticTail };
      // Only these immutable inputs are read by the shared native flight kernel.
      const sim = pose.sim;
      sim.spawnType = p.spawnType; sim.vel = p.vel; sim.sourceVelocity = p.sourceVelocity;
      sim.facingRad = p.facingRad; sim.movingRayMoveSpeed = p.movingRayMoveSpeed;
      sim.fadeTime = p.fadeTime; sim.projLength = p.projLength;
      sim.didDamage = p.didDamage;
      copyMotion(sim, p); copyMotion(pose.display, p); pose.seconds = 0; pose.horizon = horizon; pose.native = native;
      this.poses[count++] = pose;
      this.layer.set(p, pose.display);
    }
    this.poses.length = count;
  }
  render(engine: DisplaySource, now: number, enabled: boolean): void {
    const age = now - this.at;
    this.active = enabled && engine === this.engine && this.tick >= 0 && Number.isFinite(now)
      && age >= 0 && age <= PROJECTILE_FLIGHT_LIMITS.staleMs && !projectileVisualLayer(engine) && this.poses.length > 0;
    if (!this.active) { setProjectileFlightLayer(engine); return; }
    this.ageMs = Math.min(age, PROJECTILE_FLIGHT_LIMITS.horizonMs);
    for (const pose of this.poses) {
      const target = Math.min(this.ageMs / 1000, pose.horizon);
      if (target < pose.seconds) { copyMotion(pose.sim, pose.source); pose.seconds = 0; }
      while (pose.seconds + STEP <= target + 1e-12 && pose.seconds + STEP <= pose.horizon) {
        advance(pose.sim, STEP, pose.native); pose.seconds += STEP;
      }
      copyMotion(pose.display, pose.sim);
      advance(pose.display, Math.max(0, target - pose.seconds), pose.native);
      // The draw alpha is for authority endpoints, not this current display pose.
      pose.display.prevPos.copy(pose.display.pos);
      pose.display.prevBallisticTail?.copy(pose.display.ballisticTail!);
      pose.display.prevFadeProgress = pose.display.fadeProgress;
    }
    setProjectileFlightLayer(engine, this.layer); this.frames++;
  }
  stats() { return { active: this.active, tick: this.tick, entities: this.poses.length, renderedFrames: this.frames, extrapolationMs: this.ageMs }; }
}

/** Minimal display capabilities; never an authority-world requirement. */
type DisplaySource = Pick<CombatEngine, 'projectiles'>;
