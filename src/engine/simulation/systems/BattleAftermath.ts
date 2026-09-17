import type { CombatEngine } from '../CombatEngine';

/** Keep the battlefield alive after settlement without AI, firing, collisions or damage.
 * Combat time, RNG, loadouts and damage statistics stay frozen for fleet/save handoff.
 * This is Web observation policy, not an extra native combat tick. */
export function advanceBattleAftermath(engine: CombatEngine, dt: number): void {
  engine.aftermathTime += dt;
  for (const ship of engine.ships) {
    ship.prevPos.copy(ship.pos);
    ship.prevFacingRad = ship.facingRad;
    ship.clearInput();
    if (ship.isDead || ship.isDocked || ship.isRetreated) continue;
    ship.pos.addScaled(ship.vel, dt);
    ship.facingRad += ship.angularVelRad * dt;
  }
  // Existing ordnance coasts and expires visually. Never invoke weapon/effect callbacks:
  // even a zero-damage collision can mutate shields, components, ammo and statistics.
  for (let i = engine.projectiles.length - 1; i >= 0; i--) {
    const projectile = engine.projectiles[i];
    projectile.prevPos.copy(projectile.pos);
    if (projectile.ballisticTail) {
      projectile.prevBallisticTail?.copy(projectile.ballisticTail);
      projectile.ballisticTail.addScaled(projectile.vel, dt);
    }
    projectile.pos.addScaled(projectile.vel, dt);
    projectile.elapsedTime += dt;
    projectile.rangeRemaining -= projectile.vel.length() * dt;
    if (projectile.rangeRemaining <= 0 || engine.aftermathTime >= 5) {
      engine.contrailEngine.detach(projectile.id);
      engine.projectiles.splice(i, 1);
    }
  }
  for (let i = engine.beams.length - 1; i >= 0; i--) {
    const beam = engine.beams[i];
    beam.elapsedTime += dt;
    beam.duration -= dt;
    beam.damageActive = false;
    beam.isHitting = false;
    if (beam.duration <= 0 || engine.aftermathTime >= 1) engine.beams.splice(i, 1);
  }
  engine.asteroidSystem.update(dt);
  engine.fxSystem.update(dt);
  engine.contrailEngine.update(dt);
  engine.cameraShakeIntensity *= Math.pow(0.02, dt);
}
