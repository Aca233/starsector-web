import { Vector2 } from '../../../math/Vector2';
import { intersectSegmentWithPolygon } from '../../../math/Geometry';
import { Beam } from '../../Weapon';
import { sound } from '../../../audio/SoundManager';
import { i18n } from '../../../i18n/LocalizationManager';
import { WeaponSimContext } from './WeaponSimContext';

/**
 * 计算射线与圆的物理入射交点与参数 t (Ray-Circle Entry Intersection)
 * 射线: O + t * D (其中 D 为单位方向向量, t >= 0)
 * 圆: 中心 C, 半径 R
 * 返回交点信息；若无前向交点或起点在圆内则返回 null
 */
function intersectRayCircleEntry(
  origin: Vector2,
  dir: Vector2,
  center: Vector2,
  radius: number
): { t: number; point: Vector2 } | null {
  const vx = origin.x - center.x;
  const vy = origin.y - center.y;
  const b = vx * dir.x + vy * dir.y;
  const c = vx * vx + vy * vy - radius * radius;
  const discriminant = b * b - c;

  if (discriminant < 0) return null;

  // 起点在圆外时求最小正根 (入射点)
  if (c > 0) {
    if (b >= 0) return null; // 射线背离圆心
    const t = -b - Math.sqrt(discriminant);
    if (t > 0) {
      return {
        t,
        point: new Vector2(origin.x + dir.x * t, origin.y + dir.y * t)
      };
    }
  }
  return null;
}

/**
 * 持续高能光束射线追踪与幅能渗透处理器 (BeamSimulationHandler)
 * 职责:
 * 1. 动态刚性锁定母舰挂点与真实炮口 (1:1 BeamWeaponRay.java:114)
 * 2. 射线-护盾球体物理交点解算与有效弧度偏转吸收 (Ray-Sphere Entry Intersection)
 * 3. 能量护盾吸收与软幅能积累 (Soft Flux Accumulation，绝不穿盾)
 * 4. 速子光矛高压电弧硬幅能渗透 (Tachyon Lance Hard Flux EMP Piercing)
 * 5. 舰体精确多边形穿透点截断与 2D 装甲网格 DPS 连续切割
 * 6. 光束死光熔毁武器挂点与推进器熄火
 * 7. EMP 特斯拉跳跃电弧、融甲熔渣与死光击沉判定
 */
export class BeamSimulationHandler {
  public update(dt: number, ctx: WeaponSimContext, beams: Beam[]) {
    const ships = [ctx.playerShip, ctx.enemyShip, ...(ctx.fighters || [])];

    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i];
      b.elapsedTime += dt;
      b.duration -= dt;
      b.isHitting = false;

      if (b.duration <= 0) {
        beams.splice(i, 1);
        continue;
      }

      // 1. 动态锁定发射挂点坐标与炮口物理偏移 (1:1 BeamWeaponRay.java:114)
      const srcShip = ships.find((s) => s.id === b.sourceShipId);
      if (srcShip && b.slotId) {
        const mount = srcShip.weapons.find((w) => w.slotId === b.slotId);
        if (mount) {
          const isHardpoint = mount.mountType === 'HARDPOINT';
          const offsets = isHardpoint
            ? (mount.spec.hardpointOffsets && mount.spec.hardpointOffsets.length >= 2 ? mount.spec.hardpointOffsets : mount.spec.turretOffsets)
            : (mount.spec.turretOffsets && mount.spec.turretOffsets.length >= 2 ? mount.spec.turretOffsets : mount.spec.hardpointOffsets);

          let barrelOffsetWorld = new Vector2(0, 0);
          if (b.barrelOffset) {
            barrelOffsetWorld = new Vector2(b.barrelOffset.x, b.barrelOffset.y).rotate(mount.currentAngleRad);
          } else if (offsets && offsets.length >= 2) {
            barrelOffsetWorld = new Vector2(offsets[0], offsets[1]).rotate(mount.currentAngleRad);
          }

          const mountOffset = new Vector2(mount.relativePos.x, mount.relativePos.y).rotate(srcShip.facingRad);
          const mountWorldPos = srcShip.pos.clone().add(mountOffset);
          const fireDir = Vector2.fromAngle(mount.currentAngleRad, 1);
          b.startPos.copy(mountWorldPos.add(barrelOffsetWorld));
          const maxRange = mount.spec.range * (srcShip.spec.weaponRangeMult || 1.0);
          b.endPos = b.startPos.clone().addScaled(fireDir, maxRange);
          mount.glowAlpha = Math.max(mount.glowAlpha, b.duration / b.maxDuration);
        }
      }

      // 2. 光束射线与目标物理相交检测 (优先按发射距离由近至远测试障碍物)
      const targetShips = ships
        .filter((s) => s.id !== b.sourceShipId && (b.isPlayer === undefined || s.isPlayer !== b.isPlayer) && !s.isDead && !s.isPhased)
        .sort((a, bShip) => a.pos.distanceTo(b.startPos) - bShip.pos.distanceTo(b.startPos));

      for (const ship of targetShips) {
        const beamDir = b.endPos.clone().sub(b.startPos);
        const beamLen = beamDir.length();
        if (beamLen <= 0.001) break;
        const beamUnit = beamDir.clone().normalize();

        // 2.1 护盾球体相交检测 (Ray-Circle Intersection with Shield Sphere)
        if (ship.shield.isActive && ship.shield.currentArcDeg > 5 && ship.shield.type !== 'NONE' && ship.shield.type !== 'PHASE') {
          const sCenter = ship.getShieldCenter(ship.pos, ship.facingRad);
          const shieldEntry = intersectRayCircleEntry(b.startPos, beamUnit, sCenter, ship.shield.radius);
          let shieldHitPoint: Vector2 | null = null;

          if (shieldEntry && shieldEntry.t <= beamLen) {
            if (ship.shield.isHitBlocked(sCenter, shieldEntry.point, ship.facingRad)) {
              shieldHitPoint = shieldEntry.point;
            }
          } else {
            // 特殊情况：当光束发射起点由于贴身/冲撞位于护盾半径内，但处于护盾保护扇区并朝向船体时，
            // 护盾力场立即阻截光束，严禁直接贯穿船体装甲！
            const distFromShieldCenter = b.startPos.distanceTo(sCenter);
            if (distFromShieldCenter <= ship.shield.radius && distFromShieldCenter > ship.spec.collisionRadius * 0.3) {
              const toTarget = sCenter.clone().sub(b.startPos);
              if (beamUnit.dot(toTarget) > 0) {
                if (ship.shield.isHitBlocked(sCenter, b.startPos, ship.facingRad)) {
                  shieldHitPoint = b.startPos.clone();
                }
              }
            }
          }

          if (shieldHitPoint) {
            b.endPos.copy(shieldHitPoint);
            b.isHitting = true;
            const tickDmg = b.damagePerSec * dt;
            const shieldMult = ship.system.getShieldDamageMultiplier();
            const absorbedDmg = tickDmg * shieldMult;
            const hitAngle = Math.atan2(shieldHitPoint.y - sCenter.y, shieldHitPoint.x - sCenter.x);
            const fluxGain = ship.shield.absorbDamage(absorbedDmg, b.damageType, hitAngle);
            ship.flux.increaseFlux(fluxGain, false);

            // Tachyon Lance 护盾硬幅能穿透电弧 (严格对齐 1:1 TachyonLanceEffect.java)
            // 只有当硬幅能高于 10% (pierceChance = hardFlux - 0.1) 且随机通过时，才可能产生电弧瘫痪武器/引擎挂点，
            // 绝不直接穿盾扣除舰船结构 HP！
            if (b.isEmpPiercing) {
              const hardFluxLevel = ship.flux.hardFlux / ship.spec.maxFlux;
              const pierceChance = hardFluxLevel - 0.1;
              if (pierceChance > 0 && Math.random() < pierceChance * dt * 3.5) {
                const activeMounts = ship.weapons.filter(w => !w.isDisabled && w.mountType !== 'HIDDEN');
                if (activeMounts.length > 0) {
                  const targetMount = activeMounts[Math.floor(Math.random() * activeMounts.length)];
                  const mOffset = new Vector2(targetMount.relativePos.x, targetMount.relativePos.y).rotate(ship.facingRad);
                  const mPos = ship.pos.clone().add(mOffset);
                  ctx.fx.spawnEmpArc(shieldHitPoint, mPos, {
                    thickness: 2.8,
                    glowColor: [165, 100, 255],
                    coreColor: [255, 255, 255]
                  });
                  sound.playAtPos('emp_discharge', shieldHitPoint, ctx.playerShip.pos, 0.45);
                  ship.damageWeaponMount(targetMount.relativePos, 200, true);
                } else {
                  ctx.fx.spawnEmpArc(shieldHitPoint, ship.pos, {
                    thickness: 2.2,
                    glowColor: [165, 100, 255],
                    coreColor: [255, 255, 255]
                  });
                  sound.playAtPos('emp_discharge', shieldHitPoint, ctx.playerShip.pos, 0.45);
                }
              }
            }
            ctx.fx.spawnSparks(shieldHitPoint, 2, b.color);
            // 光束截断于护盾表面，绝对不穿透至船体装甲！
            break;
          }
        }

        // 2.2 船体装甲与多边形外廓物理相交 (Ray-Polygon Intersection with Hull Bounds)
        const hullCircleEntry = intersectRayCircleEntry(b.startPos, beamUnit, ship.pos, ship.spec.collisionRadius);
        const isOriginInsideHull = b.startPos.distanceTo(ship.pos) <= ship.spec.collisionRadius;

        if (isOriginInsideHull || (hullCircleEntry && hullCircleEntry.t <= beamLen)) {
          const localStart = b.startPos.clone().sub(ship.pos).rotate(-ship.facingRad);
          const localEnd = b.endPos.clone().sub(ship.pos).rotate(-ship.facingRad);

          let hitPoly = false;
          let localImpact = new Vector2();
          let worldImpact = new Vector2();

          if (ship.spec.bounds && ship.spec.bounds.length >= 3) {
            const polyRes = intersectSegmentWithPolygon(localStart, localEnd, ship.spec.bounds);
            if (polyRes) {
              hitPoly = true;
              localImpact = polyRes.point;
              worldImpact = polyRes.point.clone().rotate(ship.facingRad).add(ship.pos);
            }
          } else {
            hitPoly = true;
            worldImpact = hullCircleEntry ? hullCircleEntry.point : b.startPos.clone();
            localImpact = worldImpact.clone().sub(ship.pos).rotate(-ship.facingRad);
          }

          if (hitPoly) {
            b.endPos.copy(worldImpact);
            b.isHitting = true;
            const tickDmg = b.damagePerSec * dt;
            const result = ship.armor.takeDamage(localImpact, tickDmg, b.damageType, b.damagePerSec, true);
            ship.hullHp = Math.max(0, ship.hullHp - result.hullDamage);
            ship.addScorchMark(localImpact, result.armorDamage || result.hullDamage);

            if (Math.random() < dt * 6) {
              sound.playAtPos('beam_hit', worldImpact, ctx.playerShip.pos, 0.35);
            }

            // 速子长矛命中船体/装甲时释放剧烈紫白 EMP 跳跃电弧 (严格对齐 1:1 TachyonLanceEffect.java)
            if (b.isEmpPiercing && Math.random() < dt * 4.5) {
              const activeMounts = ship.weapons.filter(w => !w.isDisabled && w.mountType !== 'HIDDEN');
              if (activeMounts.length > 0) {
                const targetMount = activeMounts[Math.floor(Math.random() * activeMounts.length)];
                const mOffset = new Vector2(targetMount.relativePos.x, targetMount.relativePos.y).rotate(ship.facingRad);
                const mPos = ship.pos.clone().add(mOffset);
                ctx.fx.spawnEmpArc(worldImpact, mPos, {
                  thickness: 3.0,
                  glowColor: [165, 100, 255],
                  coreColor: [255, 255, 255]
                });
                sound.playAtPos('emp_discharge', worldImpact, ctx.playerShip.pos, 0.5);
                ship.damageWeaponMount(targetMount.relativePos, 350, true);
              } else {
                ctx.fx.spawnEmpArc(worldImpact, ship.pos, {
                  thickness: 2.5,
                  glowColor: [165, 100, 255],
                  coreColor: [255, 255, 255]
                });
                sound.playAtPos('emp_discharge', worldImpact, ctx.playerShip.pos, 0.5);
              }
            }

            // 光束穿透破坏武器挂点
            const beamEmpDmg = b.isEmpPiercing ? tickDmg * 2.5 : tickDmg * 0.4;
            const disabledMount = ship.damageWeaponMount(localImpact, tickDmg + beamEmpDmg, b.isEmpPiercing);
            if (disabledMount) {
              ctx.fx.spawnSparks(worldImpact, 25, [165, 100, 255]);
              const weaponName = i18n.t(disabledMount.spec.nameKey).split(' ')[0] || disabledMount.slotId;
              if (ship.isPlayer) {
                ctx.addRadioMessage('损管警报', 'PLAYER', `武器挂点 [${disabledMount.slotId} - ${weaponName}] 遭高能死光击毁，强制下线！`, [255, 120, 60]);
              } else {
                ctx.addRadioMessage('战术火控', 'PLAYER', `死光主炮瘫痪敌舰武器挂点 [${weaponName}]！`, [100, 255, 160]);
              }
            }

            // 引擎后向甲板熔穿熄火
            if (localImpact.x < -ship.spec.collisionRadius * 0.25 && (b.specId === 'tachyonlance' || b.damagePerSec > 500)) {
              if (Math.random() < dt * 0.45) {
                ship.triggerEngineFlameout();
                if (ship.isPlayer) {
                  ctx.addRadioMessage('损管警报', 'PLAYER', '高能光束熔穿后向甲板！推进器过载熄火！', [255, 100, 80]);
                } else {
                  ctx.addRadioMessage('战术火控', 'PLAYER', '死光主炮熔断敌方推进机组！敌舰熄火！', [120, 255, 150]);
                }
              }
            }

            if (Math.random() < 0.08) {
              const debrisColor: [number, number, number] =
                ship.spec.id === 'onslaught' ? [125, 110, 95] : [100, 130, 160];
              ctx.fx.spawnDebris(worldImpact, 1, debrisColor, 50, 'small');
            }

            if (b.isEmpPiercing) {
              for (let arcIdx = 0; arcIdx < 3; arcIdx++) {
                const arcDest = ship.pos.clone().add(
                  new Vector2(
                    (Math.random() - 0.5) * ship.spec.collisionRadius * 1.2,
                    (Math.random() - 0.5) * ship.spec.collisionRadius * 1.2
                  ).rotate(ship.facingRad)
                );
                ctx.fx.spawnEmpArc(worldImpact, arcDest);
              }
              sound.playAtPos('emp_discharge', worldImpact, ctx.playerShip.pos, 0.5);
              ctx.fx.spawnSparks(worldImpact, 8, [160, 220, 255]);
              ctx.addCameraShake(4, 0.12);
            }

            if (ship.hullHp <= 0) {
              ctx.handleShipDestruction(ship);
            }

            break; // 击中最近的船体装甲，截断光束
          }
        }
      }
    }
  }
}
