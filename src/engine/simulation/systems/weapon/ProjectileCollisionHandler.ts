import { Vector2 } from '../../../math/Vector2';
import { Ship } from '../../Ship';
import { Projectile } from '../../Weapon';
import { sound } from '../../../audio/SoundManager';
import { i18n } from '../../../i18n/LocalizationManager';
import { WeaponSimContext } from './WeaponSimContext';
import { SpatialShipIndex } from '../../collision/SpatialShipIndex';
import {
  RuntimeCollisionHit,
  RuntimeCollisionKernel,
  RuntimeCollisionQuery
} from '../../collision/RuntimeCollisionKernel';
import { getProjectileImpactVisualProfile } from '../../../visual/ImpactVisuals';

export interface LightMGInterceptionResult {
  targetProjectileId: number;
  targetDestroyed: boolean;
}

/**
 * 弹道物理碰撞、近炸引信与装甲毁伤处理器 (ProjectileCollisionHandler)
 * 职责:
 * 1. 双管高射炮近炸引信与凌空殉爆判定 (Proximity Fuse Airburst PD AOE)
 * 2. 点防轻型机枪弹幕拦截近距导弹 (Light MG Point Defense)
 * 3. 舰船残骸掩体阻挡 (Hulk Fragments)
 * 4. 能量偏振护盾偏转与幅能积累 (Shield Impact & Flux Surge)
 * 5. 精确多边形外廓穿透与 2D 装甲网格战损解算 (Armor Grid Damage Model)
 * 6. 武器挂点瘫痪 (Mount Disabling) 与主推进器熄火 (Engine Flameout)
 * 7. 真实物理爆鸣声效、金属撕裂碎片、EMP 跳跃电弧与舰船击沉
 */
export class ProjectileCollisionHandler {
  private readonly spatialIndex = new SpatialShipIndex();
  public readonly runtimeCollisionKernel = new RuntimeCollisionKernel();

  private spawnMissileDestructionVisual(
    projectile: Projectile,
    pos: Vector2,
    ctx: WeaponSimContext,
    fallbackColor: [number, number, number] = [255, 160, 40]
  ): void {
    if (projectile.missileExplosionVisualSpec) {
      ctx.fx.spawnSourceMissileExplosion(pos, projectile.missileExplosionVisualSpec);
    } else {
      ctx.fx.spawnAuthenticExplosion(pos, 35, fallbackColor, true, 'missile');
    }
  }

  public prepareShipCollisionFrame(allShips: Ship[]): void {
    this.spatialIndex.rebuild(allShips);
  }

  public canBatchShipCollision(p: Projectile): boolean {
    return !p.isRocket && !p.proximityFuse && p.specId !== 'lightmg' && !p.isFlare;
  }

  public checkShipCollisionsBatch(projectiles: Projectile[], allShips: Ship[], ctx: WeaponSimContext): Set<number> {
    if (projectiles.length === 0) return new Set<number>();
    if (!this.spatialIndex.isPrepared) this.prepareShipCollisionFrame(allShips);

    const queries = projectiles.map((projectile) => this.createRuntimeQuery(projectile, allShips));
    const hits = this.runtimeCollisionKernel.findHits(queries);
    const consumed = new Set<number>();

    for (let index = 0; index < queries.length; index++) {
      let hit = hits[index];
      if (!hit) continue;

      // A previous projectile in this same fixed step may have destroyed the
      // snapshotted target. Re-resolve only that rare query against surviving
      // candidates so the authoritative TS state keeps the original ordering
      // semantics without throwing away the whole batch.
      if (hit.ship.isDead || hit.ship.isPhased) {
        const surviving: RuntimeCollisionQuery = {
          projectile: queries[index].projectile,
          candidates: queries[index].candidates.filter((ship) => !ship.isDead && !ship.isPhased)
        };
        hit = this.runtimeCollisionKernel.findHitTypeScript(surviving);
      }

      if (hit && this.applyShipCollisionHit(hit, ctx)) consumed.add(hit.projectile.id);
    }

    return consumed;
  }

  private createRuntimeQuery(p: Projectile, allShips: Ship[]): RuntimeCollisionQuery {
    const broadphaseCandidates = this.spatialIndex.isPrepared
      ? this.spatialIndex.querySegment(p.prevPos, p.pos, Math.max(0, p.radius))
      : allShips;
    return {
      projectile: p,
      candidates: broadphaseCandidates.filter((ship) =>
        ship.id !== p.sourceShipId &&
        (p.isPlayer === undefined || ship.isPlayer !== p.isPlayer) &&
        !ship.isDead &&
        !ship.isPhased
      )
    };
  }
  private getExplosionDamageScale(p: Projectile, surfaceDistance: number): number {
    const fuse = p.proximityFuse;
    if (!fuse) return 0;
    const outer = Math.max(0, fuse.explosionRadius);
    const core = Math.max(0, Math.min(fuse.coreRadius ?? outer, outer));
    const distance = Math.max(0, surfaceDistance);
    if (distance <= core) return 1;
    if (distance >= outer || outer <= core) return 0;
    return 1 - (distance - core) / (outer - core);
  }

  private isHostileProjectile(source: Projectile, candidate: Projectile): boolean {
    if (candidate.id === source.id || candidate.sourceShipId === source.sourceShipId) return false;
    return source.isPlayer === undefined || candidate.isPlayer === undefined
      ? candidate.sourceShipId !== source.sourceShipId
      : candidate.isPlayer !== source.isPlayer;
  }

  /**
   * 判定高射炮近炸引信与凌空殉爆 AOE 破片杀伤
   * @returns 弹丸是否发生近炸引信引爆
   */
  public checkProximityFuse(p: Projectile, ctx: WeaponSimContext, allProjectiles: Projectile[]): boolean {
    if (!p.proximityFuse) return false;

    let shouldAirburst = false;

    // 引信检测 A: 接近敌方导弹
    for (const targetM of allProjectiles) {
      if (targetM.isRocket && this.isHostileProjectile(p, targetM)) {
        if (p.pos.distanceTo(targetM.pos) <= p.proximityFuse.range) {
          shouldAirburst = true;
          break;
        }
      }
    }

    // 引信检测 B: 接近敌方战机/轰炸机
    if (!shouldAirburst) {
      for (const f of ctx.fighters) {
        if (f.id !== p.sourceShipId && (p.isPlayer === undefined || f.isPlayer !== p.isPlayer) && !f.isDead && !f.isPhased) {
          if (p.pos.distanceTo(f.pos) <= p.proximityFuse.range + f.spec.collisionRadius * 0.7) {
            shouldAirburst = true;
            break;
          }
        }
      }
    }

    // 引信检测 C: 接近敌方大舰护盾或外壳
    if (!shouldAirburst) {
      for (const s of [ctx.playerShip, ctx.enemyShip]) {
        if (s.id !== p.sourceShipId && (p.isPlayer === undefined || s.isPlayer !== p.isPlayer) && !s.isDead && !s.isPhased) {
          const targetRadius = s.shield.isActive ? s.shield.radius : s.spec.collisionRadius;
          if (p.pos.distanceTo(s.pos) <= targetRadius + p.proximityFuse.range * 0.5) {
            shouldAirburst = true;
            break;
          }
        }
      }
    }

    // 引信检测 D: 达到最大射程时的不稳定近炸触发
    if (!shouldAirburst && p.rangeRemaining <= 0) {
      shouldAirburst = true;
    }

    if (!shouldAirburst) return false;

    const expRadius = p.proximityFuse.explosionRadius || 45;
    sound.playAtPos(p.proximityFuse.soundKey || 'flak_explosion', p.pos, ctx.playerShip.pos, 0.6);

    // 核心白炽火球与冲击波
    ctx.fx.spawnAuthenticExplosion(p.pos, expRadius, [255, 175, 85], true);

    // 360 度密集破片火花
    ctx.fx.spawnSparks(p.pos, 32, [255, 160, 60]);

    // 特色原版残渣黑烟团 (Airburst Dirty Smoke Clouds)
    for (let sIdx = 0; sIdx < 8; sIdx++) {
      const smokeAngle = (sIdx / 8) * Math.PI * 2 + (ctx.visualRandom.next() - 0.5) * 0.4;
      const smokeSpeed = 15 + ctx.visualRandom.next() * 35;
      ctx.fx.contrails.push({
        pos: p.pos.clone().add(new Vector2((ctx.visualRandom.next() - 0.5) * 16, (ctx.visualRandom.next() - 0.5) * 16)),
        vel: Vector2.fromAngle(smokeAngle, smokeSpeed),
        life: 0.7 + ctx.visualRandom.next() * 0.4,
        maxLife: 1.1,
        size: 12 + ctx.visualRandom.next() * 8,
        maxSize: 32 + ctx.visualRandom.next() * 16,
        alpha: 0.85,
        rotation: ctx.visualRandom.next() * Math.PI * 2,
        color: [42, 40, 44]
      });
    }

    // 范围破片杀伤结算 (AOE Damage)
    let damagedHostileTarget = false;
    // 1) 拦截波及范围内的敌方导弹 (计算导弹生命值损耗与殉爆)
    let interceptedCount = 0;
    for (let mIdx = allProjectiles.length - 1; mIdx >= 0; mIdx--) {
      const targetM = allProjectiles[mIdx];
      if (targetM.isRocket && this.isHostileProjectile(p, targetM)) {
        if (p.pos.distanceTo(targetM.pos) <= expRadius) {
          const damage = p.damage * this.getExplosionDamageScale(p, p.pos.distanceTo(targetM.pos));
          if (damage <= 0) continue;
          targetM.hitpoints = (targetM.hitpoints ?? 100) - damage;
          damagedHostileTarget = true;
          if (targetM.hitpoints <= 0) {
            if (targetM.isRocket) ctx.contrailEngine?.detach(targetM.id);
            allProjectiles.splice(mIdx, 1);
            sound.playAtPos('missile_explosion', targetM.pos, ctx.playerShip.pos, 0.55);
            this.spawnMissileDestructionVisual(targetM, targetM.pos, ctx, [255, 140, 40]);
            ctx.fx.addFloatingText(targetM.pos.clone(), 'BURST INTERCEPTED', [120, 255, 160], 12, 0.85);
            interceptedCount++;
          } else {
            ctx.fx.spawnSparks(targetM.pos, 10, [255, 160, 60]);
            ctx.fx.addFloatingDamage(targetM.pos.clone(), damage, [255, 180, 70]);
          }
        }
      }
    }

    if (interceptedCount > 0) {
      ctx.addCameraShake(3, 0.1);
      if (p.sourceShipId === ctx.playerShip.id && ctx.visualRandom.next() < 0.6) {
        ctx.addRadioMessage('点防火控', 'PLAYER', `双管高射炮近炸拦截成功！引爆 ${interceptedCount} 枚来袭导弹！`, [140, 255, 180]);
      }
    }

    // 2) 撕裂波及范围内的敌方战机/轰炸机
    for (const f of ctx.fighters) {
      if (f.id !== p.sourceShipId && (p.isPlayer === undefined || f.isPlayer !== p.isPlayer) && !f.isDead && !f.isPhased) {
        const dist = p.pos.distanceTo(f.pos);
        if (dist <= expRadius + f.spec.collisionRadius) {
          const surfaceDistance = Math.max(0, dist - f.spec.collisionRadius);
          const aoeDmg = p.damage * this.getExplosionDamageScale(p, surfaceDistance);
          if (aoeDmg <= 0) continue;
          f.hullHp = Math.max(0, f.hullHp - aoeDmg);
          damagedHostileTarget = true;
          ctx.fx.addFloatingDamage(f.pos.clone(), aoeDmg, [255, 180, 60]);
          ctx.fx.spawnSparks(f.pos, 10, [255, 120, 40]);
          if (f.hullHp <= 0) {
            ctx.handleShipDestruction(f);
            ctx.fx.addFloatingText(f.pos.clone(), 'BOMBER SPLASHED', [255, 80, 80], 14, 1.2);
            if (p.sourceShipId === ctx.playerShip.id) {
              ctx.addRadioMessage('点防火控', 'PLAYER', '目标敌机已被双管高射炮破片弹幕彻底凌空撕碎！', [120, 255, 140]);
            }
          }
        }
      }
    }

    // 3) 敌舰近距离破片擦伤
    for (const s of [ctx.playerShip, ctx.enemyShip]) {
      if (s.id !== p.sourceShipId && (p.isPlayer === undefined || s.isPlayer !== p.isPlayer) && !s.isDead && !s.isPhased) {
        const distToShip = p.pos.distanceTo(s.pos);
        if (distToShip <= expRadius + (s.shield.isActive ? s.shield.radius : s.spec.collisionRadius)) {
          if (s.isShieldPointBlocked(p.pos)) {
            const shieldSurfaceDistance = Math.max(0, p.pos.distanceTo(s.getShieldCenter()) - s.shield.radius);
            const damage = p.damage * this.getExplosionDamageScale(p, shieldSurfaceDistance);
            if (damage > 0) {
              damagedHostileTarget = true;
              const fluxGain = s.shield.absorbDamage(damage, 'FRAGMENTATION', p.pos.clone().sub(s.getShieldCenter()).heading());
              s.flux.increaseFlux(fluxGain, true);
              ctx.statsTracker?.recordDamageDealt(p.isPlayer ?? false, 'FRAGMENTATION', damage, 'SHIELD');
              ctx.fx.spawnShieldRipple(p.pos, 35, [255, 120, 100]);
            }
          } else if (distToShip <= expRadius + s.spec.collisionRadius) {
            const surfaceDistance = Math.max(0, distToShip - s.spec.collisionRadius);
            const damage = p.damage * this.getExplosionDamageScale(p, surfaceDistance);
            if (damage <= 0) continue;
            const localImpact = p.pos.clone().sub(s.pos).rotate(-s.facingRad);
            damagedHostileTarget = true;
            const res = s.armor.takeDamage(localImpact, damage, 'FRAGMENTATION', damage, false);
            if (res.armorDamage > 0) ctx.statsTracker?.recordDamageDealt(p.isPlayer ?? false, 'FRAGMENTATION', res.armorDamage, 'ARMOR');
            if (res.hullDamage > 0) ctx.statsTracker?.recordDamageDealt(p.isPlayer ?? false, 'FRAGMENTATION', res.hullDamage, 'HULL');
            s.hullHp = Math.max(0, s.hullHp - res.hullDamage);
            s.addScorchMark(localImpact, res.armorDamage || res.hullDamage);
          }
        }
      }
    }

    if (damagedHostileTarget) ctx.statsTracker?.recordShotHit(p.isPlayer ?? false);

    return true;
  }

  /**
   * 轻型机枪点防拦截导弹判定 (Light MG PD)
   * 返回命中的导弹身份，由外层统一执行数组删除，避免嵌套 splice 破坏遍历游标。
   */
  public checkLightMGInterception(
    p: Projectile,
    ctx: WeaponSimContext,
    allProjectiles: Projectile[]
  ): LightMGInterceptionResult | null {
    if (p.specId !== 'lightmg') return null;

    for (let mIdx = allProjectiles.length - 1; mIdx >= 0; mIdx--) {
      const targetM = allProjectiles[mIdx];
      const hostile = p.isPlayer === undefined
        ? targetM.sourceShipId !== p.sourceShipId
        : targetM.isPlayer !== p.isPlayer;
      if (targetM.isRocket && hostile && targetM.sourceShipId !== p.sourceShipId) {
        if (p.pos.distanceTo(targetM.pos) < 24) {
          targetM.hitpoints = (targetM.hitpoints ?? 100) - p.damage;
          const targetDestroyed = targetM.hitpoints <= 0;
          if (targetDestroyed) {
            ctx.contrailEngine?.detach(targetM.id);
            if (ctx.statsTracker) ctx.statsTracker.recordMissileIntercepted(p.isPlayer ?? false);
            sound.playAtPos('missile_explosion', targetM.pos, ctx.playerShip.pos, 0.5);
            this.spawnMissileDestructionVisual(targetM, targetM.pos, ctx, [255, 160, 40]);
            ctx.fx.addFloatingText(targetM.pos.clone(), 'MG INTERCEPTED', [120, 255, 150], 12, 0.8);
            if (ctx.visualRandom.next() < 0.45) {
              ctx.addRadioMessage('点防火控', 'PLAYER', '近防机枪已成功打爆一枚来袭重型导弹！', [140, 255, 180]);
            }
          } else {
            ctx.fx.spawnSparks(targetM.pos, 8, [255, 180, 60]);
          }
          ctx.statsTracker?.recordShotHit(p.isPlayer ?? false);
          return { targetProjectileId: targetM.id, targetDestroyed };
        }
      }
    }

    return null;
  }

  /**
   * 舰船残骸遮挡碰撞检测
   * @returns 是否命中残骸
   */
  public checkHulkCollision(p: Projectile, ctx: WeaponSimContext): boolean {
    for (const frag of ctx.hulkFragments) {
      if (p.pos.distanceTo(frag.pos) < frag.collisionRadius) {
        sound.playAtPos('shield_hit', p.pos, ctx.playerShip.pos, 0.3);
        ctx.fx.spawnSparks(p.pos, 10, [255, 160, 60]);
        ctx.fx.spawnDebris(p.pos, 1, [80, 75, 70], 50, 'small');
        return true;
      }
    }
    return false;
  }

  /**
   * 弹丸与舰船碰撞综合解算 (护盾偏振、多边形外廓与装甲网格)
   * @returns 是否命中舰船 (护盾或舰体)
   */
  public checkShipCollision(p: Projectile, allShips: Ship[], ctx: WeaponSimContext): boolean {
    if (!this.spatialIndex.isPrepared) this.prepareShipCollisionFrame(allShips);
    const query = this.createRuntimeQuery(p, allShips);
    const hit = this.runtimeCollisionKernel.findHits([query])[0];
    return hit ? this.applyShipCollisionHit(hit, ctx) : false;
  }

  private applyShipCollisionHit(hit: RuntimeCollisionHit, ctx: WeaponSimContext): boolean {
    const { projectile: p, ship } = hit;
    if (ship.isDead || ship.isPhased) return false;
    const impactWorld = hit.worldPoint;
    ctx.statsTracker?.recordShotHit(p.isPlayer ?? false);

    if (hit.kind === 'SHIELD') {
      const sCenter = ship.getShieldCenter(ship.pos, ship.facingRad);
      const toShield = impactWorld.clone().sub(sCenter);
      const shieldMult = ship.system.getShieldDamageMultiplier();
      const absorbedDmg = p.damage * shieldMult;
      const fluxGain = ship.shield.absorbDamage(absorbedDmg, p.damageType, toShield.heading());
      if (ctx.statsTracker) {
        ctx.statsTracker.recordDamageDealt(p.isPlayer ?? false, p.damageType, absorbedDmg, 'SHIELD');
      }
      ship.flux.increaseFlux(fluxGain, true);
      ctx.fx.addFloatingDamage(impactWorld, absorbedDmg, [80, 200, 255]);
      const visual = getProjectileImpactVisualProfile({
        specId: p.specId,
        damageType: p.damageType,
        damage: p.damage,
        isRocket: !!p.isRocket,
        surface: 'SHIELD'
      });
      sound.playAtPos(visual.soundKey, impactWorld, ctx.playerShip.pos, visual.soundVolume);
      ctx.fx.spawnShieldRipple(impactWorld, visual.shieldRippleRadius, p.color);
      // Shield contacts stay on the field surface: never draw a hull/missile
      // fireball merely because a high-damage projectile was blocked.
      ctx.fx.spawnSparks(impactWorld, visual.sparkCount, p.color);
      ctx.addCameraShake(visual.cameraShake, 0.1);
      return true;
    }

    const impactPoint = hit.localPoint;
    const result = ship.armor.takeDamage(impactPoint, p.damage, p.damageType, p.damage, false);
    if (ctx.statsTracker) {
      if (result.armorDamage > 0) {
        ctx.statsTracker.recordDamageDealt(
          p.isPlayer ?? false,
          p.damageType,
          result.armorDamage,
          'ARMOR',
          p.empDamage || 0
        );
      }
      if (result.hullDamage > 0) {
        ctx.statsTracker.recordDamageDealt(p.isPlayer ?? false, p.damageType, result.hullDamage, 'HULL');
      }
    }
    ship.hullHp = Math.max(0, ship.hullHp - result.hullDamage);
    ship.addScorchMark(impactPoint, result.armorDamage || result.hullDamage);

    const disabledMount = ship.damageWeaponMount(impactPoint, p.damage + (p.empDamage || 0), !!p.empDamage);
    if (disabledMount) {
      ctx.fx.addFloatingText(impactWorld.clone(), `WEAPON DISABLED: ${disabledMount.slotId}`, [255, 140, 40], 14, 2.0);
      ctx.fx.spawnSparks(impactWorld, 30, [100, 200, 255]);
      const weaponName = i18n.t(disabledMount.spec.nameKey).split(' ')[0] || disabledMount.slotId;
      if (ship.isPlayer) {
        ctx.addRadioMessage('损管警报', 'PLAYER', `武器挂点 [${disabledMount.slotId} - ${weaponName}] 遭受过载短路，已强制下线！`, [255, 120, 60]);
      } else {
        ctx.addRadioMessage('战术火控', 'PLAYER', `成功瘫痪目标舰武器挂点 [${weaponName}]！`, [100, 255, 160]);
      }
    }

    if (impactPoint.x < -ship.spec.collisionRadius * 0.25 && (p.damage >= 150 || (p.empDamage && p.empDamage > 120))) {
      if (ctx.random.next() < 0.55) {
        ship.triggerEngineFlameout();
        ctx.fx.addFloatingText(impactWorld.clone(), 'ENGINE FLAMEOUT', [255, 140, 40], 14, 1.8);
        if (ship.isPlayer) {
          ctx.addRadioMessage('损管警报', 'PLAYER', '主推进器受损熄火！机动性严重受阻！', [255, 100, 80]);
        } else {
          ctx.addRadioMessage('战术火控', 'PLAYER', '敌舰推进引擎遭受重创，已过载熄火！', [120, 255, 150]);
        }
      }
    }

    const impactSurface = result.hullDamage > 0 ? 'HULL' : 'ARMOR';
    const visual = getProjectileImpactVisualProfile({
      specId: p.specId,
      damageType: p.damageType,
      damage: p.damage,
      isRocket: !!p.isRocket,
      surface: impactSurface
    });
    sound.playAtPos(visual.soundKey, impactWorld, ctx.playerShip.pos, visual.soundVolume);

    if (result.armorDamage > 0) ctx.fx.addFloatingDamage(impactWorld, result.armorDamage, [255, 175, 40]);
    if (result.hullDamage > 0) ctx.fx.addFloatingDamage(impactWorld, result.hullDamage, [255, 55, 45]);

    if (p.hitGlowRadius && p.hitGlowRadius > 0) {
      ctx.fx.spawnHitGlow(impactWorld, p.hitGlowRadius, p.color);
    }
    if (p.isRocket) {
      this.spawnMissileDestructionVisual(p, impactWorld, ctx, p.color);
    } else if (visual.sparkCount > 0) {
      ctx.fx.spawnSparks(impactWorld, visual.sparkCount, p.color);
    }

    if (p.damage >= 150) {
      const debrisColor: [number, number, number] =
        ship.spec.id === 'onslaught' ? [125, 110, 95] : [100, 130, 160];
      const count = p.damage >= 450 ? 3 : (p.damage >= 280 ? 2 : 1);
      const sizeCat = p.damage >= 450 ? 'medium' : 'small';
      ctx.fx.spawnDebris(impactWorld, count, debrisColor, 100, sizeCat);
    }

    if (p.empDamage && p.empDamage > 0) {
      for (let a = 0; a < 2; a++) {
        const empEnd = ship.pos.clone().add(
          new Vector2(
            (ctx.visualRandom.next() - 0.5) * ship.spec.collisionRadius,
            (ctx.visualRandom.next() - 0.5) * ship.spec.collisionRadius
          ).rotate(ship.facingRad)
        );
        ctx.fx.spawnEmpArc(impactWorld, empEnd);
      }
      sound.playAtPos('emp_discharge', impactWorld, ctx.playerShip.pos, 0.55);
      ctx.fx.addFloatingDamage(impactWorld.clone().add(new Vector2(10, -10)), p.empDamage, [130, 220, 255]);
    }

    ctx.addCameraShake(visual.cameraShake, 0.15);
    if (ship.hullHp <= 0) ctx.handleShipDestruction(ship);
    return true;
  }
}
