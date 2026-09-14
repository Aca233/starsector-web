import { Vector2 } from '../../../math/Vector2';
import { Projectile } from '../../Weapon';
import { Ship } from '../../Ship';
import { sound } from '../../../audio/SoundManager';
import { WeaponSimContext } from './WeaponSimContext';

/**
 * 导弹制导与诱饵热焰弹物理处理器 (MissileGuidanceHandler)
 * 职责:
 * 1. 诱饵热焰弹全生命周期、真空微阻尼与镁光火星喷射
 * 2. 比例导引机动、最大回转角速度解算
 * 3. 敌对诱饵弹热源捕获诱骗 (Flare Spoofing) 与冲撞殉爆
 * 4. 赛博 SRM 导弹二段式动能弹头爆发 (Sabot Stage 2)
 * 5. 持续主推加速度累加与极速钳制
 * 6. 导弹引擎喷口原版缎带尾迹采样 (ContrailEngine Ribbon)
 * 7. TPC 炽热等离子余烬微粒喷溅
 */
export class MissileGuidanceHandler {
  /**
   * 模拟诱饵热焰弹生命周期与燃烧效果
   * @returns 是否寿命耗尽应被销毁
   */
  public updateFlare(p: Projectile, dt: number, ctx: WeaponSimContext): boolean {
    p.flareLife = (p.flareLife ?? 3.5) - dt;
    if (p.flareLife <= 0) {
      return true;
    }

    // 强真空微阻尼减速
    p.vel.scale(Math.max(0, 1 - dt * 1.8));
    p.pos.add(p.vel.clone().scale(dt));

    // 燃烧螺旋烟雾尾迹
    if (ctx.visualRandom.next() < 0.75) {
      ctx.fx.contrails.push({
        pos: p.pos.clone().add(new Vector2((ctx.visualRandom.next() - 0.5) * 8, (ctx.visualRandom.next() - 0.5) * 8)),
        vel: Vector2.fromAngle(ctx.visualRandom.next() * Math.PI * 2, 8 + ctx.visualRandom.next() * 15),
        life: 0.55 + ctx.visualRandom.next() * 0.35,
        maxLife: 0.9,
        size: 8 + ctx.visualRandom.next() * 6,
        maxSize: 22 + ctx.visualRandom.next() * 10,
        alpha: 0.65,
        rotation: ctx.visualRandom.next() * Math.PI * 2,
        color: [225, 225, 230]
      });
    }

    // 溅射强光镁粉火星
    if (ctx.visualRandom.next() < 0.65) {
      ctx.fx.particles.push({
        pos: p.pos.clone(),
        vel: Vector2.fromAngle(ctx.visualRandom.next() * Math.PI * 2, 35 + ctx.visualRandom.next() * 55),
        life: 0.15 + ctx.visualRandom.next() * 0.15,
        maxLife: 0.3,
        size: 2.5 + ctx.visualRandom.next() * 2,
        color: [255, 220, 130],
        alpha: 1.0
      });
    }

    return false;
  }

  /**
   * 模拟导弹制导机动与主推加速
   * @returns 导弹是否在制导过程中殉爆 (如撞击诱饵弹)
   */
  public updateMissile(
    p: Projectile,
    dt: number,
    ctx: WeaponSimContext,
    allProjectiles: Projectile[],
    allShips: Ship[]
  ): boolean {
    if (p.facingRad === undefined) {
      p.facingRad = p.vel.heading();
    }

    if (p.isGuided) {
      const isHostileProjectile = (other: Projectile) => p.isPlayer === undefined
        ? other.sourceShipId !== p.sourceShipId
        : other.isPlayer !== p.isPlayer;
      const isHostileShip = (ship: Ship) => ship.id !== p.sourceShipId
        && !ship.isDead
        && !ship.isPhased
        && (p.isPlayer === undefined || ship.isPlayer !== p.isPlayer);

      // 只允许敌对阵营诱饵欺骗导引头；友军热焰弹不能吸走己方导弹。
      const nearbyFlare = allProjectiles.find(
        (fl) => fl.isFlare
          && fl.sourceShipId !== p.sourceShipId
          && isHostileProjectile(fl)
          && p.pos.distanceTo(fl.pos) < 400
      );

      if (nearbyFlare) {
        // 导引头被诱饵热源剧烈干扰并吸引转向
        const toFlare = nearbyFlare.pos.clone().sub(p.pos);
        const distFlare = toFlare.length();
        const flareAngle = toFlare.heading();

        let angleDiff = flareAngle - p.facingRad;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        const turnStep = (p.maxTurnRate || 2.2) * 1.6 * dt;
        p.facingRad += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), turnStep);

        // 近距离冲撞诱饵弹发生殉爆
        if (distFlare < 26) {
          sound.playAtPos('missile_explosion', p.pos, ctx.playerShip.pos, 0.7);
          if (p.missileExplosionVisualSpec) {
            ctx.fx.spawnSourceMissileExplosion(p.pos, p.missileExplosionVisualSpec);
          } else {
            ctx.fx.spawnAuthenticExplosion(p.pos, 45, [255, 160, 60], true, 'missile');
            ctx.fx.spawnSparks(p.pos, 25, [255, 200, 80]);
          }
          ctx.fx.addFloatingText(p.pos.clone(), 'MISSILE SPOOFED', [255, 200, 80], 13, 1.2);
          if (nearbyFlare.sourceShipId === ctx.playerShip.id) {
            ctx.addRadioMessage('电子战中控', 'PLAYER', '防空雷达确认：敌方制导鱼雷被诱饵热焰弹诱骗引爆！', [140, 255, 180]);
          }
          return true;
        }
      } else {
        // 发射时保存的 targetShipId 是权威锁定。只要该目标仍是有效敌对舰船就持续追踪；
        // 目标失效后才重新捕获另一艘敌舰，并把新锁定写回 projectile。
        let targetShip = p.targetShipId
          ? allShips.find((ship) => ship.id === p.targetShipId && isHostileShip(ship))
          : undefined;
        if (!targetShip) {
          targetShip = allShips.find(isHostileShip);
          if (targetShip) p.targetShipId = targetShip.id;
        }
        if (targetShip) {
          const toTarget = targetShip.pos.clone().sub(p.pos);
          const dist = toTarget.length();
          const targetAngle = toTarget.heading();

          let angleDiff = targetAngle - p.facingRad;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

          const turnStep = (p.maxTurnRate || 2.2) * dt;
          p.facingRad += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), turnStep);

          // 赛博 SRM 导弹二段式动能弹头爆发 (Sabot Stage 2)
          if (p.isTwoStage && !p.stageTriggered && dist < 320) {
            p.stageTriggered = true;
            sound.playAtPos('sabot_fire', p.pos, ctx.playerShip.pos, 0.7);
            ctx.fx.spawnEmpArc(p.pos, p.pos.clone().add(Vector2.fromAngle(p.facingRad, 80)));
            ctx.fx.spawnSparks(p.pos, 16, [150, 220, 255]);
            p.vel.addScaled(Vector2.fromAngle(p.facingRad), 420);
            ctx.fx.addFloatingText(p.pos.clone(), 'SABOT STAGE 2', [120, 220, 255], 11, 0.9);
          }
        }
      }
    }

    const accel = p.engineAcceleration || 300;
    p.vel.add(Vector2.fromAngle(p.facingRad, accel * dt));
    const curSpd = p.vel.length();
    const maxSpd = p.maxSpeed || 650;
    if (curSpd > maxSpd) {
      p.vel.scale(maxSpd / curSpd);
    }

    return false;
  }

  /**
   * 采集尾迹缎带点与生成等离子余烬微粒
   */
  public updateParticlesAndContrail(p: Projectile, ctx: WeaponSimContext) {
    // 导弹烟雾尾迹带 (1:1 对齐原版 ContrailEngine.java)
    if (p.isRocket) {
      const heading = p.facingRad !== undefined ? p.facingRad : p.vel.heading();
      const fallbackNozzleOffset = -(p.projLength || 25) * 0.5;
      const nozzleOffset = p.missileEngineVisualSpec?.nozzleOffset ?? fallbackNozzleOffset;
      const trail = p.missileTrailSpec;
      const nozzlePos = p.pos.clone().addScaled(
        Vector2.fromAngle(heading, 1),
        nozzleOffset + (trail?.spawnOffset ?? 0)
      );

      const contrailDuration = trail?.duration ?? 1.6;
      const baseWidth = trail?.baseWidth ?? 11;
      const widenMult = trail?.widenMult ?? 2.4;
      const minSeg = trail?.minSeg ?? 5.0;
      const smokeColor: [number, number, number, number] = trail?.color ?? [200, 200, 205, 215];
      const blendMode = trail?.blendMode ?? 'NORMAL';

      ctx.contrailEngine?.addPoint(
        p.id,
        nozzlePos,
        contrailDuration,
        baseWidth,
        widenMult,
        minSeg,
        smokeColor,
        blendMode
      );
    }

    // TPC 炽热等离子残渣
    if (p.specId === 'tpc' && ctx.visualRandom.next() < 0.7) {
      ctx.fx.particles.push({
        pos: p.pos.clone().addScaled(Vector2.fromAngle(p.vel.heading(), 1), -35 + (ctx.visualRandom.next() - 0.5) * 20),
        vel: Vector2.fromAngle(p.vel.heading() + Math.PI + (ctx.visualRandom.next() - 0.5) * 0.8, 40 + ctx.visualRandom.next() * 60),
        life: 0.15 + ctx.visualRandom.next() * 0.15,
        maxLife: 0.3,
        size: 3 + ctx.visualRandom.next() * 4,
        color: [255, 120 + ctx.visualRandom.next() * 80, 20],
        alpha: 0.95
      });
    }
  }
}
