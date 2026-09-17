import { damageToMissiles } from './DamageToMissiles';
import { Vector2 } from '../../../math/Vector2';
import type { Projectile, ProjectileExplosionSpec } from '../../Weapon';
import type { WeaponSimContext } from './WeaponSimContext';
import { getShipExplosionContact } from '../../collision/ExplosionContact';
import { applyComponentDamage } from './ComponentDamage';
import { projectileOutgoingMultiplier, projectileSource, bindProjectileSource } from './OutgoingDamage';

interface Explosion {
  projectile: Projectile;
  spec: ProjectileExplosionSpec;
  pos: Vector2;
  life: number;
  ships: Set<string>;
  asteroids: Set<number>;
  missiles: Set<number>;
}

/** Missile.notifyDealtDamage + DamagingExplosion: one hit/entity, linear core falloff,
 * native short lifetime, direct target excluded. HITS_SHIPS_AND_ASTEROIDS allows
 * friendly fire/self damage, but never fighters or other missiles. */
export class ProjectileExplosionSystem {
  public active: Explosion[] = [];
  public spawn(p: Projectile, point: Vector2, ctx: WeaponSimContext, shipId?: string, asteroidId?: number): void {
    bindProjectileSource(p, projectileSource(p, ctx));
    const spec = p.projectileExplosionSpec;
    if (!spec || spec.radius <= 0) return;
    const explosion: Explosion = { projectile: p, spec, pos: point.clone(), life: spec.duration,
      ships: new Set(shipId ? [shipId] : []), asteroids: new Set(asteroidId === undefined ? [] : [asteroidId]), missiles: new Set([p.id]) };
    this.active.push(explosion);
    this.apply(explosion, ctx);
  }

  public update(dt: number, ctx: WeaponSimContext): void {
    if (dt <= 0) return;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const explosion = this.active[i];
      explosion.life -= dt;
      if (explosion.life < -1e-9) { this.active.splice(i, 1); continue; }
      explosion.pos.addScaled(explosion.projectile.vel, dt);
      this.apply(explosion, ctx);
    }
  }

  private apply(e: Explosion, ctx: WeaponSimContext): void {
    const p = e.projectile, spec = e.spec;
    const scale = (distance: number) => distance <= spec.coreRadius ? 1
      : 1 - (1 - (spec.minDamageFraction ?? 0)) * Math.min(1, Math.max(0, (distance - spec.coreRadius) / Math.max(.001, spec.radius - spec.coreRadius)));
    const source = projectileSource(p, ctx);
    const noFriendlyFire = spec.collisionClass.endsWith('_NO_FF');
    const hitsSmall = ['MISSILE_FF','MISSILE_NO_FF','PROJECTILE_NO_FF','PROJECTILE_FF'].includes(spec.collisionClass);
    for (const ship of ctx.ships ?? [ctx.playerShip, ctx.enemyShip, ...ctx.fighters]) {
      if (e.ships.has(ship.id) || ship.isDead || ship.isPhased || (ship.spec.hullSize === 'FIGHTER' && !hitsSmall) || (noFriendlyFire && ship.isPlayer === p.isPlayer)) continue;
      const hit = getShipExplosionContact(ship, e.pos), damage = p.damage * scale(hit.distance) * projectileOutgoingMultiplier(p, ship, hit.point, ctx);
      if (hit.distance > spec.radius || damage <= 0) continue;
      e.ships.add(ship.id);
      if (hit.shield) {
        const taken = damage * ship.crDamageTakenMultiplier * ship.system.getShieldDamageMultiplier();
        const flux = ship.shield.absorbDamage(taken, p.damageType, hit.point.clone().sub(ship.getShieldCenter()).heading());
        ship.flux.increaseFlux(flux, !p.softFlux);
        ctx.statsTracker?.recordDamageDealt(p.isPlayer ?? false, p.damageType, taken * ship.shield.damageTakenMultiplierFor(p.damageType), 'SHIELD', 0, ship.isPlayer);
        ctx.fx.addFloatingDamage(hit.point, taken * ship.shield.damageTakenMultiplierFor(p.damageType), [80, 200, 255]);
      } else {
        const local = hit.point.clone().sub(ship.pos).rotate(-ship.facingRad);
        const result = ship.armor.takeDamage(local, damage * ship.crDamageTakenMultiplier, p.damageType, damage, false);
        ship.hullHp = Math.max(0, ship.hullHp - result.hullDamage);
        applyComponentDamage(ship, local, result, 0, source);
        ctx.fx.spawnArmorDamageSparks(ship, local, result.armorDamage);
        ctx.statsTracker?.recordDamageDealt(p.isPlayer ?? false, p.damageType, result.armorDamage, 'ARMOR', 0, ship.isPlayer);
        ctx.statsTracker?.recordDamageDealt(p.isPlayer ?? false, p.damageType, result.hullDamage, 'HULL', 0, ship.isPlayer);
        if (result.armorDamage > 0) ctx.fx.addFloatingDamage(hit.point, result.armorDamage, [255, 175, 40]);
        if (result.hullDamage > 0) ctx.fx.addFloatingDamage(hit.point, result.hullDamage, [255, 55, 45]);
        if (ship.hullHp <= 0) ctx.handleShipDestruction(ship);
      }
    }
    // Native heavy mines use MISSILE_FF, including friendly missiles and fighters.
    if (hitsSmall) {
      const projectiles = ctx.projectiles ?? [];
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const missile = projectiles[i];
        if (!missile.isRocket || missile.didDamage || e.missiles.has(missile.id) || (noFriendlyFire && missile.isPlayer === p.isPlayer)) continue;
        const distance = Math.max(0, missile.pos.distanceTo(e.pos) - missile.radius);
        if (distance > spec.radius) continue;
        e.missiles.add(missile.id);
        const damage = damageToMissiles(p.damage * scale(distance) * projectileOutgoingMultiplier(p, undefined, missile.pos, ctx), p.sourceShipId, ctx, projectileSource(p, ctx));
        missile.hitpoints = (missile.hitpoints ?? 100) - damage;
        if (missile.hitpoints <= 0) {
          ctx.contrailEngine?.detach(missile.id);
          if (missile.isPlayer !== p.isPlayer) ctx.statsTracker?.recordMissileIntercepted(p.isPlayer ?? false);
          projectiles.splice(i, 1);
        }
      }
    }
    // Reuse the real asteroid damage/shatter path, with a non-missile payload to
    // avoid recursively detonating the same missile or adding substitute explosions.
    for (const asteroid of [...(ctx.asteroids ?? [])]) {
      if (e.asteroids.has(asteroid.id) || asteroid.hp <= 0) continue;
      const delta = asteroid.pos.clone().sub(e.pos), distance = Math.max(0, delta.length() - asteroid.radius);
      const damage = p.damage * scale(distance);
      if (distance > spec.radius || damage <= 0) continue;
      e.asteroids.add(asteroid.id);
      const index = ctx.asteroids!.indexOf(asteroid);
      const point = e.pos.clone().addScaled(delta.normalize(), distance);
      if (index >= 0) ctx.commitAsteroidImpact?.({ ...p, damage, isRocket: false, projectileExplosionSpec: undefined },
        { asteroidIndex: index, t: 0, point });
    }
  }
}
