import { damageToMissiles } from './DamageToMissiles';
import { segmentCircleEntry } from '../../../math/Geometry';
import { distanceToSegment, segmentHullHit } from '../../../visual/HulkGeometry';
import { Vector2 } from '../../../math/Vector2';
import { Ship } from '../../Ship';
import { Projectile } from '../../Weapon';
import { sound } from '../../../audio/SoundManager';
import { requireWeaponEffect } from '../../../extensions/weapon-effects/Registry';
import { applyComponentDamage } from './ComponentDamage';
import { projectileOutgoingMultiplier, projectileSource, bindProjectileSource } from './OutgoingDamage';
import { WeaponSimContext } from './WeaponSimContext';
import { SpatialShipIndex } from '../../collision/SpatialShipIndex';
import {
  RuntimeCollisionHit,
  RuntimeCollisionKernel,
  RuntimeCollisionQuery
} from '../../collision/RuntimeCollisionKernel';
import { getProjectileImpactVisualProfile } from '../../../visual/ImpactVisuals';
import { shieldHitGlowDamage } from '../../../visual/HitGlowVisuals';
import { distanceToDeployedShield } from '../../collision/ShieldCollisionGeometry';
import { getShipExplosionContact } from '../../collision/ExplosionContact';
import { distanceToShipHull, mayBeWithinShipHullDistance } from '../../collision/HullGeometry';

export interface ProjectileInterceptionResult {
  targetProjectileId: number;
  targetDestroyed: boolean;
  consumesProjectile: boolean;
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
    return !p.isRocket && !p.proximityFuse && !p.passThroughFighters && p.specId !== 'lightmg' && !p.isFlare;
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
        !p.damagedTargetIds?.includes(ship.id) &&
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
  public checkProximityFuse(p: Projectile, ctx: WeaponSimContext, allProjectiles: Projectile[],
    fuseCandidates: Projectile[] = allProjectiles): boolean {
    if (!p.proximityFuse) return false;

    let shouldAirburst = false;

    // 引信检测 A: 接近敌方导弹
    for (const targetM of fuseCandidates) {
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
      for (const s of ctx.capitalShips ?? [ctx.playerShip, ctx.enemyShip]) {
        if (s.id !== p.sourceShipId && (p.isPlayer === undefined || s.isPlayer !== p.isPlayer) && !s.isDead && !s.isPhased) {
          // Fuse contacts must match the currently deployed arc and authored hull,
          // not a full shield/bounding circle as soon as the toggle is active.
          const shieldDistance = distanceToDeployedShield(s, p.pos);
          // Most fuse/ship pairs are distant. Do not walk an entire hull unless
          // its conservative bound can reach the fuse or the shield is already
          // close. Keep Math.min and the exact fallback for NaN/Infinity inputs.
          if (shieldDistance > p.proximityFuse.range * 0.5
            && !mayBeWithinShipHullDistance(s, p.pos, p.proximityFuse.range * 0.5)) continue;
          const surfaceDistance = Math.min(shieldDistance, distanceToShipHull(s, p.pos));
          if (surfaceDistance <= p.proximityFuse.range * 0.5) {
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

    if (p.proximityExplosionSpec) {
      if (!ctx.spawnProjectileExplosion) throw new Error('Source fuse requires explosion simulation');
      ctx.spawnProjectileExplosion(bindProjectileSource({ ...p, vel: new Vector2(), projectileExplosionSpec:p.proximityExplosionSpec }, projectileSource(p, ctx)),p.pos);
      sound.playAtPos(p.proximityFuse.soundKey || 'flak_explosion',p.pos,ctx.playerShip.pos,.6);
      ctx.fx.spawnSourceMissileExplosion(p.pos,{radius:p.proximityExplosionSpec.radius,color:p.proximityExplosionSpec.explosionColor ?? [255,155,125,255]});
      return true;
    }
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
          const damage = damageToMissiles(p.damage * this.getExplosionDamageScale(p, p.pos.distanceTo(targetM.pos)) * projectileOutgoingMultiplier(p, undefined, targetM.pos, ctx), p.sourceShipId, ctx, projectileSource(p, ctx));
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

    // Fighters are Ships too: shield/system/CR, hull and component damage must
    // use the same route. Deduplicate mixed contexts so a target is hit once.
    const ships = ctx.ships ?? [...(ctx.capitalShips ?? [ctx.playerShip, ctx.enemyShip]), ...ctx.fighters];
    const sourceShip = projectileSource(p, ctx);
    const sourceIsPlayer = p.isPlayer ?? sourceShip?.isPlayer;
    const fighterIds = new Set(ctx.fighters.map(ship => ship.id));
    const visited = new Set<string>();
    for (const ship of ships) {
      if (visited.has(ship.id)) continue;
      visited.add(ship.id);
      if (ship.id === p.sourceShipId || (sourceIsPlayer !== undefined && ship.isPlayer === sourceIsPlayer) || ship.isDead || ship.isPhased) continue;

      const contact = getShipExplosionContact(ship, p.pos);
      const shieldContact = contact.shield;
      const surfaceDistance = contact.distance;
      const shieldCenter = ship.getShieldCenter();
      const rawDamage = p.damage * this.getExplosionDamageScale(p, surfaceDistance) * projectileOutgoingMultiplier(p, ship, contact.point, ctx);
      if (rawDamage <= 0) continue;
      const takenDamage = rawDamage * ship.crDamageTakenMultiplier;
      damagedHostileTarget = true;
      if (shieldContact) {
        const shieldDamage = takenDamage * ship.system.getShieldDamageMultiplier();
        const fluxGain = ship.shield.absorbDamage(shieldDamage, 'FRAGMENTATION', contact.point.clone().sub(shieldCenter).heading());
        ship.flux.increaseFlux(fluxGain, true);
        ctx.statsTracker?.recordDamageDealt(p.isPlayer ?? false, 'FRAGMENTATION', shieldDamage * ship.shield.damageTakenMultiplierFor("FRAGMENTATION"), 'SHIELD');
        ctx.fx.spawnShieldRipple(p.pos, 35, [255, 120, 100]);
        continue;
      }

      const localImpact = contact.point.clone().sub(ship.pos).rotate(-ship.facingRad);
      const result = ship.armor.takeDamage(localImpact, takenDamage, 'FRAGMENTATION', rawDamage, false);
      applyComponentDamage(ship, localImpact, result, 0, sourceShip);
      ctx.fx.spawnArmorDamageSparks(ship, localImpact, result.armorDamage);
      if (result.armorDamage > 0) ctx.statsTracker?.recordDamageDealt(p.isPlayer ?? false, 'FRAGMENTATION', result.armorDamage, 'ARMOR');
      if (result.hullDamage > 0) ctx.statsTracker?.recordDamageDealt(p.isPlayer ?? false, 'FRAGMENTATION', result.hullDamage, 'HULL');
      ship.hullHp = Math.max(0, ship.hullHp - result.hullDamage);
      const fighter = fighterIds.has(ship.id) || ship.spec.hullSize === 'FIGHTER';
      if (fighter) {
        const applied = result.armorDamage + result.hullDamage;
        if (applied > 0) ctx.fx.addFloatingDamage(ship.pos.clone(), applied, [255, 180, 60]);
        ctx.fx.spawnSparks(ship.pos, 10, [255, 120, 40]);
      }
      if (ship.hullHp <= 0) {
        ctx.handleShipDestruction(ship);
        if (fighter) {
          ctx.fx.addFloatingText(ship.pos.clone(), 'BOMBER SPLASHED', [255, 80, 80], 14, 1.2);
          if (p.sourceShipId === ctx.playerShip.id) {
            ctx.addRadioMessage('点防火控', 'PLAYER', '目标敌机已被双管高射炮破片弹幕彻底凌空撕碎！', [120, 255, 140]);
          }
        }
      }
    }

    if (damagedHostileTarget) ctx.statsTracker?.recordShotHit(p.isPlayer ?? false);

    return true;
  }

  /**
   * 来源弹丸与导弹的连续扫掠碰撞 (含 TPC 穿透)
   * 返回命中的导弹身份，由外层统一执行数组删除，避免嵌套 splice 破坏遍历游标。
   */
  public checkMissileInterception(
    p: Projectile,
    ctx: WeaponSimContext,
    allProjectiles: Projectile[]
  ): ProjectileInterceptionResult | null {
    if ((p.isRocket && p.targetProjectileId === undefined) || p.isFlare || p.didDamage) return null;
    let target: Projectile | undefined, first = Infinity;
    for (const candidate of allProjectiles) {
      if (!candidate.isRocket || !this.isHostileProjectile(p, candidate) || p.damagedTargetIds?.includes('projectile:' + candidate.id)) continue;
      if (p.isRocket && (candidate.id !== p.targetProjectileId || !candidate.isFlare || candidate.flareFizzling)) continue;
      const t = segmentCircleEntry(p.prevPos, p.pos, candidate.pos, candidate.radius + (p.spawnType === 'BALLISTIC_AS_BEAM' ? 0 : p.radius));
      if (t !== null && t < first) { target = candidate; first = t; }
    }
    if (!target) return null;
    // No obstruction can matter unless the swept path actually reaches a missile.
    // The nearest missile is the only candidate needed: if it is behind a blocker,
    // all later candidates are too. Keep strict t comparisons and original tie order.
    const ships = ctx.ships ?? [ctx.playerShip, ctx.enemyShip, ...ctx.fighters];
    const shipHit = this.runtimeCollisionKernel.findHits([this.createRuntimeQuery(p, ships)])[0];
    let limit = Math.min(shipHit?.t ?? Infinity, ctx.queryAsteroidImpact?.(p)?.t ?? Infinity);
    for (const frag of ctx.hulkFragments) {
      const local = (point: Vector2) => point.clone().sub(frag.pos).rotate(-frag.facingRad).add(frag.localOffset);
      const t = segmentHullHit(local(p.prevPos), local(p.pos), frag.bounds);
      if (t !== null) limit = Math.min(limit, t);
    }
    if (!(first < limit)) return null;
    const point = Vector2.lerp(p.prevPos, p.pos, first);
    target.hitpoints = (target.hitpoints ?? 100) - damageToMissiles(p.damage * projectileOutgoingMultiplier(p, undefined, point, ctx), p.sourceShipId, ctx, projectileSource(p, ctx));
    const targetDestroyed = target.hitpoints <= 0;
    if (targetDestroyed) {
      ctx.contrailEngine?.detach(target.id);
      ctx.statsTracker?.recordMissileIntercepted(p.isPlayer ?? false);
      sound.playAtPos('missile_explosion', target.pos, ctx.playerShip.pos, .5);
      this.spawnMissileDestructionVisual(target, target.pos, ctx);
    } else ctx.fx.spawnSparks(point, 8, [255, 180, 60]);
    ctx.statsTracker?.recordShotHit(p.isPlayer ?? false);
    (p.damagedTargetIds ??= []).push('projectile:' + target.id);
    if (!p.passThroughMissiles) p.pos.copy(point);
    if (p.isRocket) {
      ctx.contrailEngine?.detach(p.id);
      ctx.spawnProjectileExplosion?.(p, point);
      this.spawnMissileDestructionVisual(p, point, ctx);
    }
    return { targetProjectileId: target.id, targetDestroyed, consumesProjectile: !p.passThroughMissiles };
  }

  /**
   * 舰船残骸遮挡碰撞检测
   * @returns 是否命中残骸
   */
  public checkHulkCollision(p: Projectile, ctx: WeaponSimContext): boolean {
    let first = Infinity;
    for (const frag of ctx.hulkFragments) {
      if (distanceToSegment(frag.pos, p.prevPos, p.pos).distance > frag.collisionRadius + Math.max(0, p.radius)) continue;
      const toSource = (point: Vector2) => point.clone().sub(frag.pos).rotate(-frag.facingRad).add(frag.localOffset);
      const t = segmentHullHit(toSource(p.prevPos), toSource(p.pos), frag.bounds);
      if (t !== null) first = Math.min(first, t);
    }
    if (!Number.isFinite(first)) return false;
    p.pos.copy(p.prevPos.clone().addScaled(p.pos.clone().sub(p.prevPos), first));
    sound.playAtPos('shield_hit', p.pos, ctx.playerShip.pos, 0.3);
    ctx.fx.spawnSparks(p.pos, 10, [255, 160, 60]);
    ctx.fx.spawnDebris(p.pos, 1, [80, 75, 70], 50, 'small');
    return true;
  }

  /**
   * 弹丸与舰船碰撞综合解算 (护盾偏振、多边形外廓与装甲网格)
   * @returns 是否命中舰船 (护盾或舰体)
   */
  public checkShipCollision(p: Projectile, allShips: Ship[], ctx: WeaponSimContext): boolean {
    if (!this.spatialIndex.isPrepared) this.prepareShipCollisionFrame(allShips);
    const end = p.pos.clone();
    for (let remaining = allShips.length; remaining > 0; remaining--) {
      const hit = this.runtimeCollisionKernel.findHits([this.createRuntimeQuery(p, allShips)])[0];
      if (!hit) return false;
      if (this.applyShipCollisionHit(hit, ctx)) return true;
      p.pos.copy(end);
      if (!p.damagedTargetIds?.includes(hit.ship.id)) return false;
    }
    return false;
  }

  private applyShipCollisionHit(hit: RuntimeCollisionHit, ctx: WeaponSimContext): boolean {
    const { projectile: p, ship } = hit;
    if (ship.isDead || ship.isPhased) return false;
    const impactWorld = hit.worldPoint;
    const impactDamage = p.damage * projectileOutgoingMultiplier(p, ship, impactWorld, ctx);
    p.pos.copy(impactWorld);
    ctx.statsTracker?.recordShotHit(p.isPlayer ?? false);

    if (hit.kind === 'SHIELD') {
      const sCenter = ship.getShieldCenter(ship.pos, ship.facingRad);
      const toShield = impactWorld.clone().sub(sCenter);
      const shieldMult = ship.system.getShieldDamageMultiplier();
      // CRPluginImpl: 护盾承伤按战备值修正 (标准 70% 战备时为 1.0)
      const absorbedDmg = impactDamage * shieldMult * ship.crDamageTakenMultiplier;
      const fluxGain = ship.shield.absorbDamage(absorbedDmg, p.damageType, toShield.heading());
      if (ctx.statsTracker) {
        ctx.statsTracker.recordDamageDealt(p.isPlayer ?? false, p.damageType, absorbedDmg * ship.shield.damageTakenMultiplierFor(p.damageType), 'SHIELD');
      }
      const shieldDamage = shieldHitGlowDamage(fluxGain, ship.flux.maxFlux - ship.flux.totalFlux, ship.shield.efficiency);
      ship.flux.increaseFlux(fluxGain, !p.softFlux);
      ctx.fx.addFloatingDamage(impactWorld, absorbedDmg * ship.shield.damageTakenMultiplierFor(p.damageType), [80, 200, 255]);
      const visual = getProjectileImpactVisualProfile({
        specId: p.specId,
        damageType: p.damageType,
        damage: p.damage,
        isRocket: !!p.isRocket,
        surface: 'SHIELD'
      });
      sound.playAtPos(visual.soundKey, impactWorld, ctx.playerShip.pos, visual.soundVolume);
      // Shield.absorbDamage already updates the source shield segments. The projectile
      // adds its own native hit-particle pair, including missiles; no generic ring/spark burst.
      ctx.fx.spawnProjectileHitGlows(p, impactWorld, ship, { shieldDamage });
      ctx.fx.spawnMovingRayImpactFade(p, impactWorld);
      if (p.onHitEffect) requireWeaponEffect(p.onHitEffect, 'hit', p.specId).hit!(p, ship, impactWorld, true, ctx.ships?.find(s => s.id === p.sourceShipId), ctx);
      ctx.spawnProjectileExplosion?.(p, impactWorld, ship.id);
      ctx.addCameraShake(visual.cameraShake, 0.1);
      return true;
    }

    const impactPoint = hit.localPoint;
    // 装甲/结构承伤按目标战备值修正 (CRPluginImpl.getDamageTakenChangePercent)；
    // hitStrength 保持武器标称伤害，避免战备修正被装甲减伤公式二次放大。
    const takenDamage = impactDamage * ship.crDamageTakenMultiplier;
    const result = ship.armor.takeDamage(impactPoint, takenDamage, p.damageType, impactDamage, false);
    ctx.fx.spawnArmorDamageSparks(ship, impactPoint, result.armorDamage);
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

    const source = projectileSource(p, ctx);
    applyComponentDamage(ship, impactPoint, result, p.empDamage ?? 0, source);

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

    ctx.fx.spawnProjectileHitGlows(p, impactWorld, ship, result);
    ctx.fx.spawnMovingRayImpactFade(p, impactWorld);
    // Armor-loss sparks and the source hit-particle pair are independent. A missile's
    // top-level explosionRadius is that pair, not an extra interception/explosion flash.
    // explosionSpec damage is a separate source-duration entity; Sabot owns its optional EMP arc.

    if (p.damage >= 150) {
      const debrisColor: [number, number, number] =
        ship.spec.debrisColor ?? [100, 130, 160];
      const count = p.damage >= 450 ? 3 : (p.damage >= 280 ? 2 : 1);
      const sizeCat = p.damage >= 450 ? 'medium' : 'small';
      ctx.fx.spawnDebris(impactWorld, count, debrisColor, 100, sizeCat);
    }

    if (p.onHitEffect) requireWeaponEffect(p.onHitEffect, 'hit', p.specId).hit!(p, ship, impactWorld, false, source, ctx);

    ctx.spawnProjectileExplosion?.(p, impactWorld, ship.id);
    ctx.addCameraShake(visual.cameraShake, 0.15);
    if (ship.hullHp <= 0) ctx.handleShipDestruction(ship);
    if (p.passThroughFighters && ship.spec.hullSize === 'FIGHTER' && (!p.passThroughFightersOnlyWhenDestroyed || ship.hullHp <= 0)) {
      (p.damagedTargetIds ??= []).push(ship.id);
      return false;
    }
    return true;
  }
}
