import { sameTeam } from "../../CombatTeams";
import { initializeSourceProjectile } from './SourceProjectileLifecycle';
import { Vector2 } from '../../../math/Vector2';
import { bindProjectileSource, projectileSource } from './OutgoingDamage';
import { Projectile } from '../../Weapon';
import { Ship } from '../../Ship';
import { sound } from '../../../audio/SoundManager';
import { WeaponSimContext } from './WeaponSimContext';

import { missileGuidancePoint } from './MissileLeading';
import { FlareGuidance } from './FlareGuidance';
import { advanceMote } from './MoteGuidance';

/** Missile steering, source decoy behavior, MIRV and authored trails. */
export class MissileGuidanceHandler {
  private readonly flares = new FlareGuidance();
  public updateFlare(p: Projectile, dt: number, ctx: WeaponSimContext, projectiles: Projectile[] = ctx.projectiles ?? []): boolean {
    return this.flares.update(p, dt, ctx, projectiles);
  }

  private steerToward(p: Projectile, targetAngle: number, dt: number, turnRateMult = 1): void {
    if (p.facingRad === undefined) return;
    let angleDiff = targetAngle - p.facingRad;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    const maxTurnRate = Math.max(0, (p.maxTurnRate ?? 0) * turnRateMult);
    if (maxTurnRate <= 0) {
      p.turnVelocityRad = 0;
      return;
    }

    const maxTurnAcceleration = Math.max(0, (p.maxTurnAcceleration ?? Number.POSITIVE_INFINITY) * turnRateMult);
    const desiredTurnVelocity = Math.sign(angleDiff) * maxTurnRate;
    let turnVelocity = p.turnVelocityRad ?? 0;
    if (Number.isFinite(maxTurnAcceleration)) {
      const velocityDelta = desiredTurnVelocity - turnVelocity;
      const maxVelocityDelta = maxTurnAcceleration * dt;
      turnVelocity += Math.sign(velocityDelta) * Math.min(Math.abs(velocityDelta), maxVelocityDelta);
    } else {
      turnVelocity = desiredTurnVelocity;
    }

    const turnStep = turnVelocity * dt;
    if (Math.abs(turnStep) >= Math.abs(angleDiff)) {
      p.facingRad += angleDiff;
      p.turnVelocityRad = 0;
    } else {
      p.facingRad += turnStep;
      p.turnVelocityRad = turnVelocity;
    }
  }

  private splitMirv(p: Projectile, ctx: WeaponSimContext, allProjectiles: Projectile[]): void {
    const mirv = p.mirv;
    if (!mirv || p.facingRad === undefined) return;
    const count = Math.max(1, Math.floor(mirv.numShots));
    const arcRad = (mirv.arcDeg * Math.PI) / 180;
    const inaccuracyRad = (mirv.spreadInaccuracyDeg * Math.PI) / 180;

    for (let index = 0; index < count; index++) {
      const spreadT = count <= 1 ? 0.5 : index / (count - 1);
      const evenOffset = mirv.evenSpread ? (spreadT - 0.5) * arcRad : (ctx.random.next() - 0.5) * arcRad;
      const inaccuracy = (ctx.random.next() - 0.5) * inaccuracyRad;
      const angle = p.facingRad + evenOffset + inaccuracy;
      const speed = Math.max(0, mirv.spreadSpeed + ctx.random.next() * mirv.spreadSpeedRange);
      const pos = p.pos.clone().addScaled(Vector2.fromAngle(p.facingRad), 5);
      const child: Projectile = {
        id: ctx.random.next(),
        sourceShipId: p.sourceShipId,
        slotId: p.slotId,
        isPlayer: p.isPlayer, teamId: p.teamId,
        specId: mirv.projectileSpec,
        pos,
        prevPos: pos.clone(),
        vel: Vector2.fromAngle(angle, speed).add(p.vel),
        baseDamage: mirv.damage,
        damage: mirv.damage * (p.sourceDamageMultiplier ?? (p.baseDamage > 0 ? p.damage / p.baseDamage : 1)),
        sourceDamageMultiplier: p.sourceDamageMultiplier,
        sourceWeaponType: p.sourceWeaponType,
        spawnLocation: pos.clone(),
        damageType: mirv.damageType,
        empDamage: mirv.emp,
        radius: mirv.childProjectile?.projRadius ?? 1.75,
        rangeRemaining: mirv.projectileRange,
        totalRange: mirv.projectileRange,
        elapsedTime: 0,
        color: [175, 210, 255],
        spawnType: mirv.childProjectile?.spawnType ?? 'BALLISTIC',
        onHitEffect: mirv.childProjectile?.onHitEffect,
        textureScrollSpeed: mirv.childProjectile?.textureScrollSpeed,
        fadeTime: mirv.childProjectile?.fadeTime,
        pixelsPerTexel: mirv.childProjectile?.pixelsPerTexel,
        fringeColor: mirv.childProjectile?.fringeColor,
        coreColor: mirv.childProjectile?.coreColor,
        glowColor: mirv.childProjectile?.glowColor,
        glowRadius: mirv.childProjectile?.glowRadius,
        hitGlowRadius: mirv.childProjectile?.hitGlowRadius,
        projSpriteUrl: mirv.childProjectile?.projSpriteUrl,
        projLength: mirv.childProjectile?.projLength,
        projWidth: mirv.childProjectile?.projWidth,
        facingRad: angle,
        hitpoints: mirv.childHitpoints,
        maxHitpoints: mirv.childHitpoints
      };
      initializeSourceProjectile(child, speed, p.vel);
      allProjectiles.push(bindProjectileSource(child, projectileSource(p, ctx)));
    }

    p.stageTriggered = true;
    if (mirv.splitSound) sound.playAtPos(mirv.splitSound, p.pos, ctx.playerShip.pos, 1);
    if (mirv.smokeSpec) ctx.fx.spawnLauncherSmoke(mirv.smokeSpec, p.pos.clone().addScaled(Vector2.fromAngle(p.facingRad), 5), p.facingRad, p.vel);
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
    if (p.mote) { advanceMote(p,dt,ctx,allProjectiles,allShips); return false; }
    if (p.facingRad === undefined) {
      p.facingRad = p.vel.heading();
    }

    if (p.isGuided) {
      const isHostileShip = (ship: Ship) => ship.id !== p.sourceShipId
        && !ship.isDead
        && !ship.isPhased
        && (p.isPlayer === undefined || !sameTeam(ship, p));

      // Lock changes only when a flare's source probability/ECCM check succeeds.
      // Range is checked by the flare at capture, not continuously against the seeker.
      const decoy = p.targetProjectileId === undefined ? undefined : allProjectiles.find(other =>
        other.id === p.targetProjectileId && other.isFlare && !other.flareFizzling && (other.hitpoints ?? 1) > 0
        && (p.isPlayer === undefined ? other.sourceShipId !== p.sourceShipId : !sameTeam(other, p)));
      if (decoy) {
        this.steerToward(p, decoy.pos.clone().sub(p.pos).heading(), dt);
      } else {
        p.targetProjectileId = undefined;
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
          const toTarget = missileGuidancePoint(p, targetShip).clone().sub(p.pos);
          const targetAngle = toTarget.heading();

          this.steerToward(p, targetAngle, dt);
        }
      }
    }

    if (p.mirv && !p.stageTriggered) {
      p.mirvSplitDistance ??= p.mirv.splitRange + ctx.random.next() * p.mirv.splitRangeRange;
      const target = p.targetShipId ? allShips.find(ship => ship.id === p.targetShipId && !ship.isDead && !ship.isPhased) : undefined;
      if (target) {
        const toTarget = target.pos.clone().sub(p.pos);
        const distance = toTarget.length();
        const closing = p.vel.clone().sub(target.vel).dot(toTarget.clone().normalize());
        const eta = closing > 10 ? Math.max(0, distance - target.spec.collisionRadius - p.mirvSplitDistance * .75) / closing : 1000;
        const eligible = p.elapsedTime >= p.mirv.minTimeToSplit || (p.mirv.canSplitEarly && p.elapsedTime > 1 && eta < p.mirv.minTimeToSplit - p.elapsedTime);
        const angle = toTarget.heading() - p.facingRad;
        const error = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));
        const tolerance = target.spec.collisionRadius / Math.max(.001, distance) * .2 + Math.max(0, p.mirv.arcDeg - 1.5) * Math.PI / 180;
        if (eligible && distance < p.mirvSplitDistance + target.spec.collisionRadius && error < tolerance) {
          this.splitMirv(p, ctx, allProjectiles);
          return true;
        }
      }
    }

    const accel = p.engineAcceleration ?? 0;
    if (accel > 0) p.vel.add(Vector2.fromAngle(p.facingRad, accel * dt));
    const curSpd = p.vel.length();
    const maxSpd = p.maxSpeed ?? curSpd;
    if (curSpd > maxSpd) {
      p.vel.scale(maxSpd / curSpd);
    }

    return false;
  }

  /**
   * 采集来源定义的导弹尾迹缎带点。
   * 普通投射物不在这里追加臆造粒子；MovingRay/TPC 的视觉由投射物渲染器负责。
   */
  public updateParticlesAndContrail(p: Projectile, ctx: WeaponSimContext) {
    // 导弹烟雾尾迹带 (1:1 对齐原版 ContrailEngine.java)
    if (p.isRocket && !p.isFlare) {
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

  }
}
