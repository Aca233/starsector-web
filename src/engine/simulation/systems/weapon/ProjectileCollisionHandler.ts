import { Vector2 } from '../../../math/Vector2';
import { intersectSegmentWithPolygon } from '../../../math/Geometry';
import { Ship } from '../../Ship';
import { Projectile } from '../../Weapon';
import { sound } from '../../../audio/SoundManager';
import { i18n } from '../../../i18n/LocalizationManager';
import { WeaponSimContext } from './WeaponSimContext';

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
  /**
   * 判定高射炮近炸引信与凌空殉爆 AOE 破片杀伤
   * @returns 弹丸是否发生近炸引信引爆
   */
  public checkProximityFuse(p: Projectile, ctx: WeaponSimContext, allProjectiles: Projectile[]): boolean {
    if (!p.proximityFuse) return false;

    let shouldAirburst = false;

    // 引信检测 A: 接近敌方导弹
    for (const targetM of allProjectiles) {
      if (targetM.isRocket && targetM.sourceShipId !== p.sourceShipId) {
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
      const smokeAngle = (sIdx / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const smokeSpeed = 15 + Math.random() * 35;
      ctx.fx.contrails.push({
        pos: p.pos.clone().add(new Vector2((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16)),
        vel: Vector2.fromAngle(smokeAngle, smokeSpeed),
        life: 0.7 + Math.random() * 0.4,
        maxLife: 1.1,
        size: 12 + Math.random() * 8,
        maxSize: 32 + Math.random() * 16,
        alpha: 0.85,
        rotation: Math.random() * Math.PI * 2,
        color: [42, 40, 44]
      });
    }

    // 范围破片杀伤结算 (AOE Damage)
    // 1) 拦截波及范围内的敌方导弹 (计算导弹生命值损耗与殉爆)
    let interceptedCount = 0;
    for (let mIdx = allProjectiles.length - 1; mIdx >= 0; mIdx--) {
      const targetM = allProjectiles[mIdx];
      if (targetM.isRocket && targetM.sourceShipId !== p.sourceShipId) {
        if (p.pos.distanceTo(targetM.pos) <= expRadius) {
          targetM.hitpoints = (targetM.hitpoints ?? 100) - p.damage;
          if (targetM.hitpoints <= 0) {
            if (targetM.isRocket) ctx.contrailEngine?.detach(targetM.id);
            allProjectiles.splice(mIdx, 1);
            sound.playAtPos('missile_explosion', targetM.pos, ctx.playerShip.pos, 0.55);
            ctx.fx.spawnAuthenticExplosion(targetM.pos, 35, [255, 140, 40], true);
            ctx.fx.addFloatingText(targetM.pos.clone(), 'BURST INTERCEPTED', [120, 255, 160], 12, 0.85);
            interceptedCount++;
          } else {
            ctx.fx.spawnSparks(targetM.pos, 10, [255, 160, 60]);
            ctx.fx.addFloatingDamage(targetM.pos.clone(), p.damage, [255, 180, 70]);
          }
        }
      }
    }

    if (interceptedCount > 0) {
      ctx.addCameraShake(3, 0.1);
      if (p.sourceShipId === ctx.playerShip.id && Math.random() < 0.6) {
        ctx.addRadioMessage('点防火控', 'PLAYER', `双管高射炮近炸拦截成功！引爆 ${interceptedCount} 枚来袭导弹！`, [140, 255, 180]);
      }
    }

    // 2) 撕裂波及范围内的敌方战机/轰炸机
    for (const f of ctx.fighters) {
      if (f.id !== p.sourceShipId && (p.isPlayer === undefined || f.isPlayer !== p.isPlayer) && !f.isDead && !f.isPhased) {
        const dist = p.pos.distanceTo(f.pos);
        if (dist <= expRadius + f.spec.collisionRadius) {
          const aoeDmg = p.damage * Math.max(0.3, 1.0 - dist / (expRadius + f.spec.collisionRadius));
          f.hullHp = Math.max(0, f.hullHp - aoeDmg);
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
          if (s.shield.isActive && s.shield.isHitBlocked(s.pos, p.pos, s.facingRad)) {
            const fluxGain = s.shield.absorbDamage(p.damage * 0.5, 'FRAGMENTATION', p.pos.clone().sub(s.pos).heading());
            s.flux.increaseFlux(fluxGain, true);
            ctx.fx.spawnShieldRipple(p.pos, 35, [255, 120, 100]);
          } else if (distToShip <= expRadius + s.spec.collisionRadius) {
            const localImpact = p.pos.clone().sub(s.pos).rotate(-s.facingRad);
            const res = s.armor.takeDamage(localImpact, p.damage * 0.5, 'FRAGMENTATION', p.damage * 0.5, false);
            s.hullHp = Math.max(0, s.hullHp - res.hullDamage);
            s.addScorchMark(localImpact, res.armorDamage || res.hullDamage);
          }
        }
      }
    }

    return true;
  }

  /**
   * 轻型机枪点防拦截导弹判定 (Light MG PD)
   * @returns 是否成功打靶拦截并消耗机枪子弹
   */
  public checkLightMGInterception(p: Projectile, ctx: WeaponSimContext, allProjectiles: Projectile[]): boolean {
    if (p.specId !== 'lightmg') return false;

    for (let mIdx = allProjectiles.length - 1; mIdx >= 0; mIdx--) {
      const targetM = allProjectiles[mIdx];
      if (targetM.isRocket && targetM.sourceShipId !== p.sourceShipId) {
        if (p.pos.distanceTo(targetM.pos) < 24) {
          targetM.hitpoints = (targetM.hitpoints ?? 100) - p.damage;
          if (targetM.hitpoints <= 0) {
            if (targetM.isRocket) ctx.contrailEngine?.detach(targetM.id);
            allProjectiles.splice(mIdx, 1);
            if (ctx.statsTracker) ctx.statsTracker.recordMissileIntercepted(p.isPlayer ?? false);
            sound.playAtPos('missile_explosion', targetM.pos, ctx.playerShip.pos, 0.5);
            ctx.fx.spawnAuthenticExplosion(targetM.pos, 35, [255, 160, 40], true);
            ctx.fx.addFloatingText(targetM.pos.clone(), 'MG INTERCEPTED', [120, 255, 150], 12, 0.8);
            if (Math.random() < 0.45) {
              ctx.addRadioMessage('点防火控', 'PLAYER', '近防机枪已成功打爆一枚来袭重型导弹！', [140, 255, 180]);
            }
          } else {
            ctx.fx.spawnSparks(targetM.pos, 8, [255, 180, 60]);
          }
          return true;
        }
      }
    }

    return false;
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
    for (const ship of allShips) {
      if (
        ship.id === p.sourceShipId ||
        (p.isPlayer !== undefined && ship.isPlayer === p.isPlayer) ||
        ship.isDead ||
        ship.isPhased
      ) {
        continue;
      }

      const toShip = p.pos.clone().sub(ship.pos);
      const distToShip = toShip.length();

      // 1) 优先检测护盾阻挡 (严格对齐 Starsector 护盾几何球面判定，防止高速弹丸穿模)
      if (ship.shield.isActive && ship.shield.currentArcDeg > 5 && ship.shield.type !== 'NONE' && ship.shield.type !== 'PHASE') {
        const sCenter = ship.getShieldCenter(ship.pos, ship.facingRad);
        const toShield = p.pos.clone().sub(sCenter);
        const distToShield = toShield.length();
        const prevDist = p.prevPos.distanceTo(sCenter);

        if (distToShield <= ship.shield.radius || (prevDist > ship.shield.radius && distToShield <= ship.shield.radius + 35)) {
          const hitPosOnShield = distToShield > 0
            ? sCenter.clone().addScaled(toShield.clone().normalize(), ship.shield.radius)
            : p.pos;

          if (ship.shield.isHitBlocked(sCenter, hitPosOnShield, ship.facingRad)) {
            const shieldMult = ship.system.getShieldDamageMultiplier();
            const absorbedDmg = p.damage * shieldMult;
            const fluxGain = ship.shield.absorbDamage(absorbedDmg, p.damageType, toShield.heading());
            if (ctx.statsTracker) {
              ctx.statsTracker.recordDamageDealt(p.isPlayer ?? false, p.damageType, absorbedDmg, 'SHIELD');
            }
            ship.flux.increaseFlux(fluxGain, true);
            ctx.fx.addFloatingDamage(hitPosOnShield, absorbedDmg, [80, 200, 255]);

            sound.playAtPos('shield_hit', hitPosOnShield, ctx.playerShip.pos, 0.45);
            ctx.fx.spawnShieldRipple(hitPosOnShield, p.damage > 200 ? 75 : 45, p.color);

            const hitRadius = p.hitGlowRadius || (p.damage > 200 ? 55 : 30);
            if (p.isRocket || p.damage >= 200) {
              ctx.fx.spawnAuthenticExplosion(hitPosOnShield, hitRadius, p.color, true);
            } else {
              ctx.fx.spawnSparks(hitPosOnShield, 15, p.color);
            }
            ctx.addCameraShake(2, 0.1);
            return true;
          }
        }
      }

      // 2) 检测船体与装甲精确多边形碰撞
      if (distToShip <= ship.spec.collisionRadius) {
        let isHullHit = false;
        let impactPoint = p.pos.clone().sub(ship.pos).rotate(-ship.facingRad);

        if (ship.spec.bounds && ship.spec.bounds.length >= 3) {
          const localPrev = p.prevPos.clone().sub(ship.pos).rotate(-ship.facingRad);
          const polyResult = intersectSegmentWithPolygon(localPrev, impactPoint, ship.spec.bounds);
          if (polyResult) {
            isHullHit = true;
            impactPoint = polyResult.point;
          }
        } else {
          isHullHit = true;
        }

        if (isHullHit) {
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

          // 武器挂点损伤与故障短路判定
          const disabledMount = ship.damageWeaponMount(impactPoint, p.damage + (p.empDamage || 0), !!p.empDamage);
          if (disabledMount) {
            ctx.fx.addFloatingText(p.pos.clone(), `WEAPON DISABLED: ${disabledMount.slotId}`, [255, 140, 40], 14, 2.0);
            ctx.fx.spawnSparks(p.pos, 30, [100, 200, 255]);
            const weaponName = i18n.t(disabledMount.spec.nameKey).split(' ')[0] || disabledMount.slotId;
            if (ship.isPlayer) {
              ctx.addRadioMessage('损管警报', 'PLAYER', `武器挂点 [${disabledMount.slotId} - ${weaponName}] 遭受过载短路，已强制下线！`, [255, 120, 60]);
            } else {
              ctx.addRadioMessage('战术火控', 'PLAYER', `成功瘫痪目标舰武器挂点 [${weaponName}]！`, [100, 255, 160]);
            }
          }

          // 引擎后向击穿与 EMP 过载熄火判定
          if (impactPoint.x < -ship.spec.collisionRadius * 0.25 && (p.damage >= 150 || (p.empDamage && p.empDamage > 120))) {
            if (Math.random() < 0.55) {
              ship.triggerEngineFlameout();
              ctx.fx.addFloatingText(p.pos.clone(), 'ENGINE FLAMEOUT', [255, 140, 40], 14, 1.8);
              if (ship.isPlayer) {
                ctx.addRadioMessage('损管警报', 'PLAYER', '主推进器受损熄火！机动性严重受阻！', [255, 100, 80]);
              } else {
                ctx.addRadioMessage('战术火控', 'PLAYER', '敌舰推进引擎遭受重创，已过载熄火！', [120, 255, 150]);
              }
            }
          }

          // 真实金属装甲与舰体撞击爆鸣音效
          if (p.damage >= 180) {
            sound.playAtPos('armor_hit_heavy', p.pos, ctx.playerShip.pos, 0.7);
          } else if (p.damage >= 80) {
            sound.playAtPos('armor_hit_solid', p.pos, ctx.playerShip.pos, 0.6);
          } else {
            sound.playAtPos('armor_hit_light', p.pos, ctx.playerShip.pos, 0.45);
          }

          // 浮动伤害跳字
          if (result.armorDamage > 0) {
            ctx.fx.addFloatingDamage(p.pos, result.armorDamage, [255, 175, 40]);
          }
          if (result.hullDamage > 0) {
            ctx.fx.addFloatingDamage(p.pos, result.hullDamage, [255, 55, 45]);
          }

          const hitRadius = p.hitGlowRadius || (p.damage > 200 ? 50 : 25);
          if (p.isRocket || p.damage >= 200) {
            ctx.fx.spawnAuthenticExplosion(p.pos, hitRadius, p.color, true);
          } else {
            ctx.fx.spawnSparks(p.pos, 20, p.color);
          }

          // 金属撕裂碎片 (1:1 DebrisParticleSystem.java: 仅高伤穿甲或重型火炮抛出 1~2 片微量正方破片)
          if (p.damage >= 150) {
            const debrisColor: [number, number, number] =
              ship.spec.id === 'onslaught' ? [125, 110, 95] : [100, 130, 160];
            const count = p.damage >= 450 ? 3 : (p.damage >= 280 ? 2 : 1);
            const sizeCat = p.damage >= 450 ? 'medium' : 'small';
            ctx.fx.spawnDebris(p.pos, count, debrisColor, 100, sizeCat);
          }

          // EMP 电弧击穿跳跃
          if (p.empDamage && p.empDamage > 0) {
            for (let a = 0; a < 2; a++) {
              const empEnd = ship.pos.clone().add(
                new Vector2(
                  (Math.random() - 0.5) * ship.spec.collisionRadius,
                  (Math.random() - 0.5) * ship.spec.collisionRadius
                ).rotate(ship.facingRad)
              );
              ctx.fx.spawnEmpArc(p.pos, empEnd);
            }
            sound.playAtPos('emp_discharge', p.pos, ctx.playerShip.pos, 0.55);
            ctx.fx.addFloatingDamage(p.pos.clone().add(new Vector2(10, -10)), p.empDamage, [130, 220, 255]);
          }

          ctx.addCameraShake(Math.min(15, p.damage * 0.04), 0.15);

          if (ship.hullHp <= 0) {
            ctx.handleShipDestruction(ship);
          }

          return true;
        }
      }
    }

    return false;
  }
}
