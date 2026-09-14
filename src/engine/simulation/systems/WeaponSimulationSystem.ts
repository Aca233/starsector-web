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

  public readonly missileGuidance = new MissileGuidanceHandler();
  public readonly collisionHandler = new ProjectileCollisionHandler();
  public readonly beamHandler = new BeamSimulationHandler();

  constructor() {}

  public clear() {
    this.projectiles = [];
    this.beams = [];
  }

  public update(dt: number, ctx: WeaponSimContext) {
    this.updateProjectiles(dt, ctx);
    this.updateBeams(dt, ctx);
  }

  public updateProjectiles(dt: number, ctx: WeaponSimContext) {
    const allShips = [ctx.playerShip, ctx.enemyShip, ...ctx.fighters];
    this.collisionHandler.prepareShipCollisionFrame(allShips);
    const batchedCollisionProjectiles: Projectile[] = [];
    const flushBatchedCollisions = () => {
      if (batchedCollisionProjectiles.length === 0) return;
      const consumedIds = this.collisionHandler.checkShipCollisionsBatch(
        batchedCollisionProjectiles,
        allShips,
        ctx
      );
      batchedCollisionProjectiles.length = 0;
      if (consumedIds.size === 0) return;

      // Pending batches contain only already-visited (higher-index) projectiles,
      // so removing them here preserves the descending iteration cursor while
      // restoring the original collision/damage ordering before a special shot.
      for (let j = this.projectiles.length - 1; j >= 0; j--) {
        if (consumedIds.has(this.projectiles[j].id)) this.projectiles.splice(j, 1);
      }
    };

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (!this.collisionHandler.canBatchShipCollision(p)) flushBatchedCollisions();
      p.elapsedTime += dt;
      p.prevPos.copy(p.pos);
      if (p.armingTimeRemaining !== undefined) {
        p.armingTimeRemaining = Math.max(0, p.armingTimeRemaining - dt);
      }
      if (p.flightTimeRemaining !== undefined) {
        p.flightTimeRemaining -= dt;
        if (p.flightTimeRemaining <= 0) {
          if (p.isRocket) ctx.contrailEngine?.detach(p.id);
          this.projectiles.splice(i, 1);
          continue;
        }
      }

      // 0. 诱饵热焰弹全生命周期模拟 (Decoy Flares)
      if (p.isFlare) {
        if (this.missileGuidance.updateFlare(p, dt, ctx)) {
          this.projectiles.splice(i, 1);
        }
        continue;
      }

      // 1. 导弹自主航行与比例导引制导
      if (p.isRocket) {
        const spoofedOrDetonated = this.missileGuidance.updateMissile(
          p,
          dt,
          ctx,
          this.projectiles,
          allShips
        );
        if (spoofedOrDetonated) {
          ctx.contrailEngine?.detach(p.id);
          this.projectiles.splice(i, 1);
          continue;
        }
      }

      // 位移更新与剩余射程计算
      const moveStep = p.vel.clone().scale(dt);
      p.pos.add(moveStep);
      p.rangeRemaining -= moveStep.length();

      // 尾迹缎带点与等离子余烬微粒采样
      this.missileGuidance.updateParticlesAndContrail(p, ctx);

      // 2. 高射炮近炸引信与凌空殉爆判定 (Proximity Fuse Airburst PD)
      if (p.proximityFuse) {
        const burst = this.collisionHandler.checkProximityFuse(p, ctx, this.projectiles);
        if (burst) {
          if (p.isRocket) ctx.contrailEngine?.detach(p.id);

          // checkProximityFuse() may destroy multiple hostile missiles by splicing
          // this same array. Re-resolve the fuse round by id instead of deleting at
          // the stale outer-loop index, then re-anchor the descending cursor.
          const burstIndex = this.projectiles.findIndex((projectile) => projectile.id === p.id);
          if (burstIndex >= 0) {
            this.projectiles.splice(burstIndex, 1);
            i = burstIndex;
          }
          continue;
        }
      }

      // 非导弹继续用弹道射程决定寿命；有 source flightTime 的导弹由飞行时间独立控制。
      if (p.rangeRemaining <= 0 && p.flightTimeRemaining === undefined) {
        if (p.isRocket) ctx.contrailEngine?.detach(p.id);
        this.projectiles.splice(i, 1);
        continue;
      }

      // 3. 轻型机枪点防拦截导弹 (Light MG PD)
      if (p.specId === 'lightmg') {
        const interception = this.collisionHandler.checkLightMGInterception(p, ctx, this.projectiles);
        if (interception) {
          if (interception.targetDestroyed) {
            const targetIndex = this.projectiles.findIndex((projectile) => projectile.id === interception.targetProjectileId);
            if (targetIndex >= 0) this.projectiles.splice(targetIndex, 1);
          }

          // 删除拦截弹后把外层游标重新锚定到它的当前索引。若前方/后方导弹刚被移除，
          // 下一次 i-- 仍会落在“尚未处理”的原始弹丸上，不会重复更新或误删邻居。
          const interceptorIndex = this.projectiles.findIndex((projectile) => projectile.id === p.id);
          if (interceptorIndex >= 0) {
            this.projectiles.splice(interceptorIndex, 1);
            i = interceptorIndex;
          }
          continue;
        }
      }

      // 4. 舰船残骸阻挡弹道
      if (this.collisionHandler.checkHulkCollision(p, ctx)) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // 5. 与敌对舰船碰撞判定 (护盾与装甲)
      if (this.collisionHandler.canBatchShipCollision(p)) {
        batchedCollisionProjectiles.push(p);
        continue;
      }

      const hit = this.collisionHandler.checkShipCollision(p, allShips, ctx);
      if (hit) {
        if (p.isRocket) ctx.contrailEngine?.detach(p.id);
        this.projectiles.splice(i, 1);
      }
    }

    // Flush the final contiguous ordinary-ballistic run. Damage/effects are
    // still applied in the same descending projectile order as the legacy loop.
    flushBatchedCollisions();
  }

  public updateBeams(dt: number, ctx: WeaponSimContext) {
    this.beamHandler.update(dt, ctx, this.beams);
  }
}
