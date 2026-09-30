import { LocalTurretPrediction } from './LocalTurretPrediction';
import { LocalParticleEffects } from './LocalParticleEffects';
import { LocalFirePrediction } from './LocalFirePrediction';
import { CriticalCombatReplica } from './CriticalCombatReplica';
import { ProjectileVisualReplica } from './ProjectileVisualReplica';
import { LocalMuzzleEffects } from './LocalMuzzleEffects';
import { LocalContrails } from './LocalContrails';
import { MotionReplica, motionAuthority } from './MotionReplica';
import { ProjectileFlightPrediction } from './ProjectileFlightPrediction';
import { MotionPrediction } from './MotionPrediction';
import { applyLanDisplaySnapshots, projectileSnapshotTick } from './LanDisplaySnapshot';
import type { SnapshotPlayback } from './SnapshotPlayback';
import type { CombatSnapshot } from './CombatSnapshot';
import type { LanDisplayWorld } from './LanDisplayWorld';
import type { PlayerInput, Seat } from './protocol';

export type LanPresentationSample = ReturnType<SnapshotPlayback['sample']>;
export interface LanEffectActivity {
  running: boolean;
  projectilesActive: boolean;
  fireActive: boolean;
}

/** The SAME display stages used by LanBattle and the offscreen owner. No DOM,
 * network ACKs, audio, simulation updates or implicit clocks here. Keep the
 * stages separate: synchronization belongs between endpoints and pose, and
 * camera follow belongs between pose and effects. */
export class LanPresentationPipeline {
  readonly motion = new MotionReplica();
  readonly combat = new CriticalCombatReplica();
  readonly projectileVisuals: ProjectileVisualReplica;
  readonly prediction = new MotionPrediction();
  readonly projectileFlight = new ProjectileFlightPrediction();
  readonly firePrediction = new LocalFirePrediction();
  readonly turretPrediction = new LocalTurretPrediction();
  readonly localContrails = new LocalContrails();
  readonly localMuzzles = new LocalMuzzleEffects();
  readonly localParticles = new LocalParticleEffects();

  constructor(matchId: string, private readonly seat: Seat) {
    this.projectileVisuals = new ProjectileVisualReplica(matchId);
  }

  applyEndpoints(world: LanDisplayWorld, sample: LanPresentationSample, now: number,
    afterApply: (frame: CombatSnapshot) => void): void {
    if (sample.reset) { this.firePrediction.reset(world); this.turretPrediction.reset(); this.projectileFlight.reset(); }
    applyLanDisplaySnapshots(world, sample.frames, sample.reset, snapshot => {
      // The caller records tick/Hz first, as LanBattle always did. Every endpoint
      // supplies its OWN player pose and ACK to the predictions below.
      afterApply(snapshot);
      if (snapshot.projectileVisuals !== 1) this.projectileFlight.receive(world, snapshot.tick, now);
      else this.projectileFlight.reset();
      this.localParticles.receive(snapshot.particleEvents, snapshot.world.combatTime);
      this.firePrediction.receive(world, snapshot.tick, snapshot.acknowledged[this.seat], now,
        (sample.confirmedTime - snapshot.world.combatTime) * 1000);
      this.turretPrediction.receive(world, snapshot.tick, snapshot.acknowledged[this.seat], now);
      this.combat.apply(world, snapshot.tick);
      if (!this.motion.fresh(now, snapshot.tick)) this.prediction.receive(world.playerShip, snapshot.acknowledged[this.seat], now);
    });
  }

  renderPose(world: LanDisplayWorld, appliedTick: number, now: number, readInput: () => PlayerInput, active: boolean): void {
    this.combat.apply(world, appliedTick, true);
    this.motion.render(world, now, appliedTick);
    this.projectileVisuals.render(world, now, projectileSnapshotTick(world));
    // Read aim AFTER restoring the fresher lanes; an inactive pointer uses the
    // current authority aim, not an earlier world's one. No DOM callback in workers.
    const player = world.playerShip, input = readInput();
    const nearCollision = world.capitalShips.some(other => other !== player && !other.isDead && other.pos.distanceTo(player.pos) < player.spec.collisionRadius + other.spec.collisionRadius + 60);
    const row = this.motion.row(player.id, now, appliedTick);
    const predict = active && !nearCollision && !row?.[8];
    if (predict) this.prediction.render(player, { ...input, firing: false, actions: [] }, now,
      true, row ? motionAuthority(player, row) : player, !!row);
    else this.prediction.suspend(player, !active ? 'inactive' : nearCollision ? 'collision' : 'unavailable', !!row && !row[8]);
    this.turretPrediction.render(world, input, now, active);
  }

  /** Called only after the transport accepted this exact sequence. Keep ordering:
   * motion -> turret -> fire, without consuming/replacing the caller's actions. */
  recordAcceptedInput(world: LanDisplayWorld, input: PlayerInput, now: number, active: boolean): void {
    this.prediction.record(input, now);
    this.turretPrediction.record(input, now);
    this.firePrediction.record(world, input, now, active);
  }

  renderEffects(world: LanDisplayWorld, sample: LanPresentationSample, now: number, activity: LanEffectActivity): void {
    if (activity.running) this.localContrails.update(world, sample.visualTime, sample.alpha, sample.reset);
    else this.localContrails.reset(world);
    if (activity.running) this.localMuzzles.update(world, sample.visualTime, sample.reset);
    else this.localMuzzles.reset(world);
    this.localParticles.update(world, sample.visualTime, sample.reset);
    this.projectileFlight.render(world, now, activity.projectilesActive);
    this.firePrediction.render(world, now, activity.fireActive);
  }

  reset(world: LanDisplayWorld): void {
    this.motion.clear(); this.combat.clear(); this.projectileVisuals.clear();
    this.prediction.clear(world.playerShip); this.firePrediction.reset(world); this.turretPrediction.reset(); this.projectileFlight.reset();
    this.localContrails.reset(world); this.localMuzzles.reset(world); this.localParticles.reset(world);
  }
}
