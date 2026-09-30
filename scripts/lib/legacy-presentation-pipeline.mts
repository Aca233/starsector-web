// Pinned PRE-extraction LanBattle stages, lifted from frozen source 6acd1a71caf57a3caf3bc75d0a401b367fbcf7c246598abba245475d344f8dbe.
// Only replace UI/diagnostic closures with explicit arguments; no new production
// pipeline import here. This is a regression oracle, not an alternative app path.
import { LocalTurretPrediction } from '../../src/network/LocalTurretPrediction';
import { LocalParticleEffects } from '../../src/network/LocalParticleEffects';
import { LocalFirePrediction } from '../../src/network/LocalFirePrediction';
import { CriticalCombatReplica } from '../../src/network/CriticalCombatReplica';
import { ProjectileVisualReplica } from '../../src/network/ProjectileVisualReplica';
import { LocalMuzzleEffects } from '../../src/network/LocalMuzzleEffects';
import { LocalContrails } from '../../src/network/LocalContrails';
import { ProjectileFlightPrediction } from '../../src/network/ProjectileFlightPrediction';
import { MotionPrediction } from '../../src/network/MotionPrediction';
import { MotionReplica, motionAuthority } from '../../src/network/MotionReplica';
import { applyLanDisplaySnapshots, projectileSnapshotTick } from '../../src/network/LanDisplaySnapshot';
import { Vector2 } from '../../src/engine/math/Vector2';
export function legacyPresentationPipeline(matchId, seat) {
  const motion = new MotionReplica(), combat = new CriticalCombatReplica(), projectileVisuals = new ProjectileVisualReplica(matchId);
  const prediction = new MotionPrediction(), projectileFlight = new ProjectileFlightPrediction(), firePrediction = new LocalFirePrediction(), turretPrediction = new LocalTurretPrediction();
  const localContrails = new LocalContrails(), localMuzzles = new LocalMuzzleEffects(), localParticles = new LocalParticleEffects();
  return {
    receive(frame) { localMuzzles.receive(frame.muzzleEvents); },
    applyEndpoints(engine, presentation, now, afterApply) {           if (presentation.reset) { firePrediction.reset(engine); turretPrediction.reset(); projectileFlight.reset(); }
          applyLanDisplaySnapshots(engine, presentation.frames, presentation.reset, snapshot => {
            // Prediction needs the player pose at EACH restored endpoint, not
            // all acknowledgements against the final world's pose.
            afterApply(snapshot);
            if (snapshot.projectileVisuals !== 1) projectileFlight.receive(engine, snapshot.tick, now);
            else projectileFlight.reset();
            localParticles.receive(snapshot.particleEvents, snapshot.world.combatTime);
            firePrediction.receive(engine, snapshot.tick, snapshot.acknowledged[seat], now,
              (presentation.confirmedTime - snapshot.world.combatTime) * 1000);
            turretPrediction.receive(engine, snapshot.tick, snapshot.acknowledged[seat], now);
            combat.apply(engine, snapshot.tick);
            if (!motion.fresh(now, snapshot.tick)) prediction.receive(engine.playerShip, snapshot.acknowledged[seat], now);
          }); // Explicit display records; no simulation restoration.
 },
    renderPose(engine, appliedTick, now, readInput, enabled) { const active = () => enabled;         combat.apply(engine, appliedTick, true); // No repeated per-weapon writes between component arrivals/restores.
        motion.render(engine, now, appliedTick);
        projectileVisuals.render(engine, now, projectileSnapshotTick(engine));
        // The host also renders a snapshot replica; its authority lives in the
        // Worker. Predict only this display pose for every local pilot.
        {
          const p = engine.playerShip;
          const { seq, keys, aim: point, firing, pointerActive } = readInput(); const aim = new Vector2(point[0], point[1]);
          const nearCollision = engine.capitalShips.some(other => other !== p && !other.isDead && other.pos.distanceTo(p.pos) < p.spec.collisionRadius + other.spec.collisionRadius + 60);
          const row = motion.row(p.id, now, appliedTick);
          // Reset suspended prediction internals without erasing a fresh motion
          // lane pose. Otherwise re-entry reconciles against a pre-collision frame.
          const predict = active() && !nearCollision && !row?.[8];
          if (predict) prediction.render(p,
            { seq, keys, aim: [aim.x, aim.y], firing: false, pointerActive, actions: [] }, now,
            true, row ? motionAuthority(p, row) : p, !!row);
          else prediction.suspend(p, !active() ? 'inactive' : nearCollision ? 'collision' : 'unavailable', !!row && !row[8]);
          turretPrediction.render(engine, { seq, keys, aim: [aim.x, aim.y], firing, pointerActive, actions: [] }, now, active());
        }
 },
    renderEffects(engine, presentation, now, activity) {
      const launched = activity.running, synced = true, receivedAt = now, alpha = presentation.alpha;
      const hasCombatInputFocus = () => activity.projectilesActive, active = () => activity.fireActive;
              if (launched && synced) localContrails.update(engine, presentation.visualTime, alpha, presentation.reset);
        else localContrails.reset(engine);
        if (launched && synced) localMuzzles.update(engine, presentation.visualTime, presentation.reset);
        else localMuzzles.reset(engine);
        localParticles.update(engine, presentation.visualTime, presentation.reset);
        projectileFlight.render(engine, now, launched && synced && hasCombatInputFocus());
        firePrediction.render(engine, now, active() && now - receivedAt <= 250);

    },
    reset(engine) {
      motion.clear(); combat.clear(); projectileVisuals.clear(); prediction.clear(engine.playerShip); firePrediction.reset(engine); turretPrediction.reset(); projectileFlight.reset(); localContrails.reset(engine); localMuzzles.reset(engine); localParticles.reset(engine);
    }
  };
}

