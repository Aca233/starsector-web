import { terrainPenetrationCost, spendTerrainPenetration } from './weapon/TerrainPenetration';
import { advanceSourceMissile, hasSourceMissileLifecycle, initializeSourceMissile } from './weapon/SourceMissileLifecycle';
import { combatAudio as sound } from '../../audio/CombatAudioEvents';
import { ProjectileInterceptionIndex } from '../collision/ProjectileInterceptionIndex';
import { requireWeaponEffect } from '../../extensions/weapon-effects/Registry';
import { ProjectileExplosionSystem } from './weapon/ProjectileExplosionSystem';
import { advanceSourceProjectile, hasSourceProjectileLifecycle, markSourceProjectileImpact } from './weapon/SourceProjectileLifecycle';
import { Projectile, Beam } from '../Weapon';
import { WeaponSimContext } from './weapon/WeaponSimContext';
import { MissileGuidanceHandler } from './weapon/MissileGuidanceHandler';
import { ProjectileCollisionHandler } from './weapon/ProjectileCollisionHandler';
import { BeamSimulationHandler } from './weapon/BeamSimulationHandler';

// 向后兼容导出
export type { WeaponSimContext } from './weapon/WeaponSimContext';

/**
 * 武器仿真与弹道碰撞子系统 (WeaponSimulationSystem)
 * 采用分工解耦架构 (Decoupled Handler Architecture):
 * 1. MissileGuidanceHandler: 导弹制导机动、诱饵干扰欺骗、二段爆发推进与尾迹粒子
 * 2. ProjectileCollisionHandler: 高射炮近炸破片引信、机枪点防拦截、掩体遮挡、护盾偏转与 2D 装甲网格穿透
 * 3. BeamSimulationHandler: 刚性锁定母舰挂点、连续射线投射、软硬幅能渗透与装甲切割
 */
export class WeaponSimulationSystem {
  public projectiles: Projectile[] = [];
  public beams: Beam[] = [];
  public readonly explosions = new ProjectileExplosionSystem();

  public readonly missileGuidance = new MissileGuidanceHandler();
  public readonly collisionHandler = new ProjectileCollisionHandler();
  public readonly beamHandler = new BeamSimulationHandler();

  constructor() {}

  public clear() {
    this.projectiles = [];
    this.beams = [];
    this.explosions.active = [];
  }

  public update(dt: number, ctx: WeaponSimContext) {
    for (const ship of ctx.ships ?? [ctx.playerShip,ctx.enemyShip,...ctx.fighters]) if (!ship.isDead) for (const mount of ship.weapons) {
      if (mount.spec.everyFrameEffect) requireWeaponEffect(mount.spec.everyFrameEffect, 'advance', mount.spec.id).advance!(ship, mount, dt, ctx);
    }
    this.updateProjectiles(dt, ctx);
    this.updateBeams(dt, ctx);
  }

  public updateProjectiles(dt: number, ctx: WeaponSimContext) {
    const interceptionIndex = new ProjectileInterceptionIndex();
    const removeProjectileAt = (index: number) => {
      const removed = this.projectiles.splice(index, 1);
      if (removed.length) interceptionIndex.remove(removed[0]);
    };
    ctx = { ...ctx, spawnProjectileExplosion: (p, point, shipId, asteroidId) => {
      // Contacts can run arbitrary on-hit effects before reaching this boundary.
      // Explosions can also remove missiles or spawn further entities.
      interceptionIndex.invalidate();
      this.explosions.spawn(p, point, ctx, shipId, asteroidId);
    } };
    this.explosions.update(dt, ctx);
    const allShips = ctx.ships ?? [ctx.playerShip, ctx.enemyShip, ...ctx.fighters];
    const hasMissiles = this.projectiles.some(projectile => projectile.isRocket);
    this.collisionHandler.prepareShipCollisionFrame(allShips);
    const batchedCollisionProjectiles: Projectile[] = [];
    // 射程在本帧耗尽的弹丸必须先把最后一段位移交给碰撞检测，再决定是否移除。
    const expiredProjectileIds = new Set<number>();
    const flushBatchedCollisions = () => {
      if (batchedCollisionProjectiles.length === 0) return;
      const consumedIds = this.collisionHandler.checkShipCollisionsBatch(
        batchedCollisionProjectiles,
        allShips,
        ctx
      );
      batchedCollisionProjectiles.length = 0;
      // Missile checks may flush a single shot at a time. A miss with no range
      // expiry has nothing to remove; avoid rescanning the entire live array.
      if (consumedIds.size === 0 && expiredProjectileIds.size === 0) return;

      // Pending batches contain only already-visited (higher-index) projectiles,
      // so removing them here preserves the descending iteration cursor while
      // restoring the original collision/damage ordering before a special shot.
      for (let j = this.projectiles.length - 1; j >= 0; j--) {
        const candidate = this.projectiles[j];
        if (!consumedIds.has(candidate.id) && !expiredProjectileIds.has(candidate.id)) continue;
        if (consumedIds.has(candidate.id) && markSourceProjectileImpact(candidate)) continue;
        if (candidate.isRocket) ctx.contrailEngine?.detach(candidate.id);
        removeProjectileAt(j);
      }
      expiredProjectileIds.clear();
    };

    let previousProjectile: Projectile | undefined;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      // Publish the preceding missile's final pose, including fading impact
      // remnants. Removed entries stay removed. This covers every continue path.
      if (previousProjectile) interceptionIndex.update(previousProjectile);
      const p = this.projectiles[i];
      previousProjectile = p;
      if (!this.collisionHandler.canBatchShipCollision(p)) flushBatchedCollisions();
      if (p.isMine) continue; // Interceptable missile, lifecycle owned by MineSystem.
      p.elapsedTime += dt;
      p.prevPos.copy(p.pos);
      if (p.armingTimeRemaining !== undefined) {
        p.armingTimeRemaining = Math.max(0, p.armingTimeRemaining - dt);
      }
      if (hasSourceMissileLifecycle(p)) {
        // Also support restored/custom source projectiles lacking construction state.
        if (p.armedWhileFizzling === undefined) initializeSourceMissile(p, ctx.random);
        const wasFizzling = p.missileFizzleTime !== undefined;
        const expired = advanceSourceMissile(p, dt);
        if (!wasFizzling && p.missileFizzleTime !== undefined) ctx.contrailEngine?.detach(p.id);
        if (expired) { removeProjectileAt(i); continue; }
      } else if (p.flightTimeRemaining !== undefined) {
        p.flightTimeRemaining -= dt;
        if (p.flightTimeRemaining <= 0) {
          if (p.isRocket) ctx.contrailEngine?.detach(p.id);
          removeProjectileAt(i);
          continue;
        }
      }

      // 0. 诱饵热焰弹全生命周期模拟 (Decoy Flares)
      if (p.isFlare) {
        if (this.missileGuidance.updateFlare(p, dt, ctx, this.projectiles)) {
          ctx.contrailEngine?.detach(p.id);
          removeProjectileAt(i);
          continue;
        }
      }

      // 1. 导弹自主航行与比例导引制导
      if (p.angularVelocityRad) p.facingRad = (p.facingRad ?? p.vel.heading()) + p.angularVelocityRad * dt;
      if (p.isRocket && !p.inertialFlight && !p.isFlare && p.missileFizzleTime === undefined && !p.isDisarmed) {
        const spoofedOrDetonated = this.missileGuidance.updateMissile(
          p,
          dt,
          ctx,
          this.projectiles,
          allShips
        );
        if (spoofedOrDetonated) {
          interceptionIndex.invalidate(); // MIRV may append children before parent removal.
          ctx.contrailEngine?.detach(p.id);
          removeProjectileAt(i);
          continue;
        }
      }

      if (hasSourceProjectileLifecycle(p)) {
        if (advanceSourceProjectile(p, dt)) { removeProjectileAt(i); continue; }
        if (p.didDamage) continue; // Fading impact remnants never collide/deal damage twice.
      } else {
        const moveStep = p.vel.clone().scale(dt);
        p.pos.add(moveStep);
        p.rangeRemaining -= moveStep.length();
      }

      if (p.systemFuseSeconds !== undefined) {
        p.fadeProgress = p.systemFadeInSeconds ? Math.max(0, 1-p.elapsedTime/p.systemFadeInSeconds) : 0;
        if (p.elapsedTime + 1e-9 >= p.systemFuseSeconds) {
          p.systemFuseTriggered = true;
          if (p.missileExplosionVisualSpec) ctx.fx.spawnSourceMissileExplosion(p.pos, p.missileExplosionVisualSpec);
          if (p.systemExplosionSound) sound.playAtPos(p.systemExplosionSound, p.pos, ctx.playerShip.pos, 1);
          ctx.spawnProjectileExplosion?.(p, p.pos, p.sourceShipId);
          const index = this.projectiles.findIndex(other => other.id === p.id);
          if (index >= 0) { removeProjectileAt(index); i = index; }
          continue;
        }
      }
      if (p.collisionDisabled) continue;
      // Fizzling source decoys drift/fade but no longer attract or deal impact damage.
      if (p.flareFizzling || p.isDisarmed) continue;

      // 尾迹缎带点与等离子余烬微粒采样
      this.missileGuidance.updateParticlesAndContrail(p, ctx);

      // 弹道射程是否在本帧耗尽。注意此处只记录、不立即删除：最后一段位移
      // 仍然必须参与碰撞检测，否则近距离的最后一击会被直接吞掉。
      const isRangeExpired = !p.flareBehavior && !hasSourceProjectileLifecycle(p) && p.rangeRemaining <= 0 && p.flightTimeRemaining === undefined;

      // 2. 高射炮近炸引信与凌空殉爆判定 (Proximity Fuse Airburst PD)
      if (p.fizzleAtRange && p.rangeRemaining <= 0) {
        ctx.contrailEngine?.detach(p.id); removeProjectileAt(i); continue;
      }
      if (p.proximityFuse) {
        // Publish this round's movement before sharing the live missile grid.
        interceptionIndex.update(p);
        const burst = this.collisionHandler.checkProximityFuse(p, ctx, this.projectiles,
          interceptionIndex.queryRadius(p.pos, p.proximityFuse.range, this.projectiles));
        if (burst) {
          interceptionIndex.invalidate(); // Fuse damage may splice several other missiles.
          if (p.isRocket) ctx.contrailEngine?.detach(p.id);

          // checkProximityFuse() may destroy multiple hostile missiles by splicing
          // this same array. Re-resolve the fuse round by id instead of deleting at
          // the stale outer-loop index, then re-anchor the descending cursor.
          const burstIndex = this.projectiles.findIndex((projectile) => projectile.id === p.id);
          if (burstIndex >= 0) {
            if (!markSourceProjectileImpact(p)) removeProjectileAt(burstIndex);
            i = burstIndex;
          }
          continue;
        }
      }

      // Source projectile/missile swept contacts; TPC may pierce several missiles.
      let intercepted = false;
      if ((!p.isRocket || p.interceptsMissiles || p.targetProjectileId !== undefined) && hasMissiles) {
        flushBatchedCollisions();
        interceptionIndex.update(p); // A rocket pursuing a flare queries after its own movement.
        for (let remaining = this.projectiles.length; remaining > 0; remaining--) {
          const hit = this.collisionHandler.checkMissileInterception(p, ctx, interceptionIndex.query(p, this.projectiles));
          if (!hit) break;
          interceptionIndex.invalidate(); // Damage hooks/explosions may mutate other missiles.
          if (hit.targetDestroyed) {
            const targetIndex = this.projectiles.findIndex(candidate => candidate.id === hit.targetProjectileId);
            if (targetIndex >= 0) removeProjectileAt(targetIndex);
          }
          i = this.projectiles.findIndex(candidate => candidate.id === p.id);
          if (hit.consumesProjectile) {
            if (i >= 0 && !markSourceProjectileImpact(p)) removeProjectileAt(i);
            intercepted = true;
            break;
          }
        }
      }
      if (intercepted) continue;

      // Every continuation queries the remainder of the SAME swept segment.
      // A pierced pebble cannot hide a second obstacle or ship crossed this frame.
      const canBatch = this.collisionHandler.canBatchShipCollision(p);
      let solidConsumed = false;
      while (true) {
        let hulkImpact = this.collisionHandler.queryHulkCollision(p, ctx);
        let asteroidImpact = ctx.queryAsteroidImpact?.(p) ?? null;
        if (!hulkImpact && !asteroidImpact) break;
        flushBatchedCollisions();
        hulkImpact = this.collisionHandler.queryHulkCollision(p, ctx);
        asteroidImpact = ctx.queryAsteroidImpact?.(p) ?? null;
        const shipT = this.collisionHandler.findShipHitParameter(p, allShips) ?? Infinity;
        const end = p.pos.clone();
        let key: string | undefined, cost: number | undefined;
        if (hulkImpact && hulkImpact.t <= Math.min(shipT, asteroidImpact?.t ?? Infinity)) {
          key = 'terrain:wreck:' + hulkImpact.id;
          cost = terrainPenetrationCost(p, 'wreck', hulkImpact.radius);
          this.collisionHandler.applyEnvironmentImpact(p, hulkImpact.point, hulkImpact.velocity, ctx);
          ctx.fx.spawnSparks(hulkImpact.point, 10, [255, 160, 60]);
          ctx.fx.spawnDebris(hulkImpact.point, 1, [80, 75, 70], 50, 'small');
        } else if (asteroidImpact && asteroidImpact.t <= shipT) {
          const asteroid = ctx.asteroids?.[asteroidImpact.asteroidIndex];
          const asteroidId = asteroid?.id, velocity = asteroid?.vel.clone();
          if (asteroid) {
            key = 'terrain:asteroid:' + asteroid.id;
            cost = terrainPenetrationCost(p, 'asteroid', asteroid.radius, asteroid.hp);
          }
          ctx.commitAsteroidImpact?.(p, asteroidImpact);
          if (!asteroid || asteroid.hp > 0) cost = undefined; // Never pierce an intact rock.
          this.collisionHandler.applyEnvironmentImpact(p, asteroidImpact.point, velocity ?? p.vel.clone().scale(0), ctx, asteroidId);
        } else break; // A real ship/shield is closer; keep its normal collision semantics.
        if (cost !== undefined && key) {
          spendTerrainPenetration(p, key, cost);
          p.prevPos.copy(p.pos); p.pos.copy(end);
          continue;
        }
        // A blast can remove earlier missiles from this same array. Resolve the
        // original shot again rather than deleting whatever moved into its old index.
        i = this.projectiles.indexOf(p);
        if (i >= 0 && !markSourceProjectileImpact(p)) removeProjectileAt(i);
        solidConsumed = true;
        break;
      }
      if (solidConsumed) continue;

      // 5. 与敌对舰船碰撞判定 (护盾与装甲)
      if (canBatch) {
        batchedCollisionProjectiles.push(p);
        if (isRangeExpired) expiredProjectileIds.add(p.id);
        continue;
      }

      const hit = this.collisionHandler.checkShipCollision(p, allShips, ctx);
      if (hit) {
        if (p.isRocket) ctx.contrailEngine?.detach(p.id);
        i = this.projectiles.indexOf(p);
        if (i >= 0 && !markSourceProjectileImpact(p)) removeProjectileAt(i);
        continue;
      }

      // 6. 最后一段位移未命中任何目标，射程耗尽才真正移除。
      if (isRangeExpired) {
        if (p.isRocket) ctx.contrailEngine?.detach(p.id);
        removeProjectileAt(i);
      }
    }

    if (previousProjectile) interceptionIndex.update(previousProjectile);

    // Flush the final contiguous ordinary-ballistic run. Damage/effects are
    // still applied in the same descending projectile order as the legacy loop.
    flushBatchedCollisions();
  }


  public updateBeams(dt: number, ctx: WeaponSimContext) {
    this.beamHandler.update(dt, { ...ctx, projectiles: this.projectiles }, this.beams);
  }
}
