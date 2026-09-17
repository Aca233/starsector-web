import { damageToMissiles } from './DamageToMissiles';
import { combatWeaponRange } from '../../WeaponRange';
import { applyComponentDamage } from './ComponentDamage';
import { outgoingDamageMultiplier } from './OutgoingDamage';
import { requireWeaponEffect } from '../../../extensions/weapon-effects/Registry';
import { Vector2 } from '../../../math/Vector2';
import { intersectSegmentWithPolygon, segmentCircleEntry } from '../../../math/Geometry';
import { Beam, type WeaponMount } from '../../Weapon';
import { advanceBeamDamage } from './BeamDamageClock';
import { Ship } from '../../Ship';
import { sound } from '../../../audio/SoundManager';
import { WeaponSimContext } from './WeaponSimContext';
import { advanceBeamContactPulse } from '../../../visual/ImpactVisuals';
import { advanceBeamGlow, beamIntensity, recordBeamGlowDamage, shortenBeamGlow } from '../../../visual/BeamVisuals';
import { shieldHitGlowDamage } from '../../../visual/HitGlowVisuals';

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

function getBeamTargetIntersectionDistance(origin: Vector2, end: Vector2, ship: Ship): number {
  const beamDir = end.clone().sub(origin);
  const beamLen = beamDir.length();
  if (beamLen <= 0.001) return Number.POSITIVE_INFINITY;
  const beamUnit = beamDir.clone().scale(1 / beamLen);
  let nearestT = Number.POSITIVE_INFINITY;

  if (ship.shield.isActive && ship.shield.currentArcDeg > 0 && ship.shield.type !== 'NONE' && ship.shield.type !== 'PHASE') {
    const shieldCenter = ship.getShieldCenter(ship.pos, ship.facingRad);
    const shieldEntry = intersectRayCircleEntry(origin, beamUnit, shieldCenter, ship.shield.radius);
    if (shieldEntry && shieldEntry.t <= beamLen && ship.isShieldPointBlocked(shieldEntry.point)) {
      nearestT = Math.min(nearestT, shieldEntry.t);
    } else {
      const distFromShieldCenter = origin.distanceTo(shieldCenter);
      if (distFromShieldCenter <= ship.shield.radius && distFromShieldCenter > ship.spec.collisionRadius * 0.3) {
        const toTarget = shieldCenter.clone().sub(origin);
        if (beamUnit.dot(toTarget) > 0 && ship.isShieldPointBlocked(origin)) {
          nearestT = 0;
        }
      }
    }
  }

  const hullCircleEntry = intersectRayCircleEntry(origin, beamUnit, ship.pos, ship.spec.collisionRadius);
  const isOriginInsideHull = origin.distanceTo(ship.pos) <= ship.spec.collisionRadius;
  if (isOriginInsideHull || (hullCircleEntry && hullCircleEntry.t <= beamLen)) {
    if (ship.spec.bounds && ship.spec.bounds.length >= 3) {
      const localStart = origin.clone().sub(ship.pos).rotate(-ship.facingRad);
      const localEnd = end.clone().sub(ship.pos).rotate(-ship.facingRad);
      const polyRes = intersectSegmentWithPolygon(localStart, localEnd, ship.spec.bounds);
      if (polyRes) nearestT = Math.min(nearestT, polyRes.t * beamLen);
    } else if (isOriginInsideHull) {
      nearestT = 0;
    } else if (hullCircleEntry) {
      nearestT = Math.min(nearestT, hullCircleEntry.t);
    }
  }

  return nearestT;
}

/**
 * 持续高能光束射线追踪与幅能渗透处理器 (BeamSimulationHandler)
 * 职责:
 * 1. 动态刚性锁定母舰挂点与真实炮口 (1:1 BeamWeaponRay.java:114)
 * 2. 射线-护盾球体物理交点解算与有效弧度偏转吸收 (Ray-Sphere Entry Intersection)
 * 3. 能量护盾吸收与软幅能积累 (Soft Flux Accumulation，绝不穿盾)
 * 4. 速子光矛高压电弧硬幅能渗透 (Tachyon Lance Hard Flux EMP Piercing)
 * 5. 舰体多边形交点截断与 2D 装甲网格 DPS 累积分批伤害
 * 6. 装甲/结构/EMP 伤害向 21 格部件图传递
 * 7. 原版速子 EMP 电弧与舰船摧毁判定
 */
export class BeamSimulationHandler {
  public update(dt: number, ctx: WeaponSimContext, beams: Beam[]) {
    const ships = ctx.ships ?? [ctx.playerShip, ctx.enemyShip, ...(ctx.fighters || [])];
    const worldDt = dt;
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i];
      const srcShip = ships.find(s => s.id === b.sourceShipId);
      // BeamWeaponRay.advance multiplies damage/glow clocks by the firing ship's time multiplier.
      const dt = worldDt * (srcShip?.subjectiveTimeMultiplier ?? 1);
      b.elapsedTime += dt;
      b.duration -= dt;
      b.isHitting = false;
      let contactedThisTick = false;
      let damageTarget: Ship | undefined;
      let active = b.damageActive !== false;
      let sourceMount: WeaponMount | undefined;
      b.brightness = beamIntensity(b);

      // Mounted beams expire with the authoritative tracker, not a second timer that
      // starts one step earlier and can erase glow/UV state before chargedown begins.
      if (b.duration <= 0 && (!b.slotId || b.firingCycleId === undefined)) {
        beams.splice(i, 1);
        continue;
      }

      // 1. 动态锁定发射挂点坐标与炮口物理偏移 (1:1 BeamWeaponRay.java:114)


      // 母舰阵亡后其挂点不会再收到 update，firingState 会永久停留在 ACTIVE；
      // 因此光束有效性必须同时检查发射舰本身。vanilla BeamWeaponRay.isExpired() 无条件判定
      // `getShip().isHulk() && !getShip().isAlive()`，即舰船被摧毁的瞬间所有光束
      // (含充能收束阶段) 一并消失；发射舰已不在战场实体列表时同样无法维持光束。
      // Native tracker D destroys its ray on overload/venting instead of retaining a visual tail.
      if (!srcShip || srcShip.isDead || srcShip.flux.isOverloaded || srcShip.flux.isVenting) {
        beams.splice(i, 1);
        continue;
      }

      if (b.slotId) {
        const mount = srcShip.weapons.find((w) => w.slotId === b.slotId);

        // All stages and explicit visual-only fixtures belong to the same live mount/cycle;
        // none survive a removed, disabled, replaced or idle mount.
        if (!mount || mount.isDisabled || mount.spec.id !== b.specId || mount.firingState === 'IDLE' ||
          (b.firingCycleId !== undefined && mount.firingCycleId !== b.firingCycleId)) {
          beams.splice(i, 1);
          continue;
        }

        if (mount) {
          sourceMount = mount;
          active = mount.firingState === 'ACTIVE';
          b.duration = Number.isFinite(mount.firingStateTimer) ? Math.max(0, mount.firingStateTimer) : Number.MAX_SAFE_INTEGER;
          b.brightness = beamIntensity(b, mount);
          // Live source damage modifiers, not a snapshot from the last phase emission.
          b.damagePerSec = (b.baseDamagePerSec ?? mount.spec.damagePerSecond) * srcShip.crDamageDealtMultiplier
            * srcShip.getWeaponDamageMultiplier(mount.spec.weaponType) * srcShip.system.getBeamDamageMultiplier();
          b.empPerSec = (mount.spec.empPerSecond ?? 0) * srcShip.crDamageDealtMultiplier;
          const previousLength = b.startPos.distanceTo(b.endPos);
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
          const maxRange = combatWeaponRange(srcShip, mount.spec);
          b.rayEndPrevFrame = b.startPos.clone().addScaled(fireDir, previousLength);
          const frontLength = Math.min(maxRange, previousLength + dt * (mount.spec.beamSpeed ?? 1400));
          b.endPos = b.startPos.clone().addScaled(fireDir, frontLength);
          mount.glowAlpha = b.brightness;
        }
      }

      advanceBeamGlow(b, dt, active);
      const sample = advanceBeamDamage(b, dt, ctx.random, sourceMount);

      // 2. 光束射线与目标物理相交检测 (优先按发射距离由近至远测试障碍物)
      const targetShips = ships
        .filter((s) => s.id !== b.sourceShipId && (b.isPlayer === undefined || s.isPlayer !== b.isPlayer) && !s.isDead && !s.isPhased)
        .map((ship) => ({ ship, hitT: getBeamTargetIntersectionDistance(b.startPos, b.endPos, ship) }))
        .filter(({ hitT }) => Number.isFinite(hitT))
        .sort((a, bTarget) => a.hitT - bTarget.hitT)
        .map(({ ship }) => ship);

      let missileContact = false;
      const rayLength = b.startPos.distanceTo(b.endPos);
      const shipDistance = targetShips.length ? getBeamTargetIntersectionDistance(b.startPos, b.endPos, targetShips[0]) : Infinity;
      let missileIndex = -1, missileT = Infinity;
      for (let index = 0; index < (ctx.projectiles?.length ?? 0); index++) {
        const candidate = ctx.projectiles![index];
        if (!candidate.isRocket || candidate.sourceShipId === b.sourceShipId || (b.isPlayer !== undefined && candidate.isPlayer === b.isPlayer)) continue;
        const t = segmentCircleEntry(b.startPos, b.endPos, candidate.pos, candidate.radius);
        if (t !== null && t < missileT && t * rayLength < shipDistance) { missileT = t; missileIndex = index; }
      }
      if (missileIndex >= 0) {
        const missile = ctx.projectiles![missileIndex];
        b.endPos.copy(Vector2.lerp(b.startPos, b.endPos, missileT));
        b.isHitting = b.damageActive !== false;
        contactedThisTick = missileContact = true;
        shortenBeamGlow(b);
        if (sample && sample.damage > 0 && b.damageActive !== false) {
          if (!b.hasRecordedHit) { ctx.statsTracker?.recordShotHit(b.isPlayer ?? false); b.hasRecordedHit = true; }
          const damage = damageToMissiles(sample.damage * outgoingDamageMultiplier(srcShip, undefined, sourceMount?.spec.weaponType, b.startPos, b.endPos), b.sourceShipId, ctx);
          const dealt = Math.min(missile.hitpoints ?? 100, damage);
          missile.hitpoints = (missile.hitpoints ?? 100) - damage;
          recordBeamGlowDamage(b, { hullDamage: dealt });
          if (missile.hitpoints <= 0) {
            ctx.contrailEngine?.detach(missile.id);
            ctx.statsTracker?.recordMissileIntercepted(b.isPlayer ?? false);
            if (missile.missileExplosionVisualSpec) ctx.fx.spawnSourceMissileExplosion(missile.pos, missile.missileExplosionVisualSpec);
            sound.playAtPos('missile_explosion', missile.pos, ctx.playerShip.pos, .5);
            ctx.projectiles!.splice(missileIndex, 1);
          }
        }
      }

      for (const ship of missileContact ? [] : targetShips) {
        const beamDir = b.endPos.clone().sub(b.startPos);
        const beamLen = beamDir.length();
        if (beamLen <= 0.001) break;
        const beamUnit = beamDir.clone().normalize();

        // 2.1 护盾球体相交检测 (Ray-Circle Intersection with Shield Sphere)
        if (ship.shield.isActive && ship.shield.currentArcDeg > 0 && ship.shield.type !== 'NONE' && ship.shield.type !== 'PHASE') {
          const sCenter = ship.getShieldCenter(ship.pos, ship.facingRad);
          const shieldEntry = intersectRayCircleEntry(b.startPos, beamUnit, sCenter, ship.shield.radius);
          let shieldHitPoint: Vector2 | null = null;

          if (shieldEntry && shieldEntry.t <= beamLen) {
            if (ship.isShieldPointBlocked(shieldEntry.point)) {
              shieldHitPoint = shieldEntry.point;
            }
          } else {
            // 特殊情况：当光束发射起点由于贴身/冲撞位于护盾半径内，但处于护盾保护扇区并朝向船体时，
            // 护盾力场立即阻截光束，严禁直接贯穿船体装甲！
            const distFromShieldCenter = b.startPos.distanceTo(sCenter);
            if (distFromShieldCenter <= ship.shield.radius && distFromShieldCenter > ship.spec.collisionRadius * 0.3) {
              const toTarget = sCenter.clone().sub(b.startPos);
              if (beamUnit.dot(toTarget) > 0) {
                if (ship.isShieldPointBlocked(b.startPos)) {
                  shieldHitPoint = b.startPos.clone();
                }
              }
            }
          }

          if (shieldHitPoint) {
            b.endPos.copy(shieldHitPoint);
            b.isHitting = true;
            contactedThisTick = true;
            damageTarget = ship;
            shortenBeamGlow(b);
            if (b.damageActive === false) {
              b.isHitting = false;
              break;
            }
            if (sample && sample.damage > 0) {
              if (!b.hasRecordedHit) {
                ctx.statsTracker?.recordShotHit(b.isPlayer ?? false);
                b.hasRecordedHit = true;
              }
              const outgoing = outgoingDamageMultiplier(srcShip, ship, sourceMount?.spec.weaponType, b.startPos, b.endPos);
              const tickDmg = sample.damage * outgoing;
              const shieldMult = ship.system.getShieldDamageMultiplier();
              // 护盾吸收量同样按目标战备值修正 (CRPluginImpl.getDamageTakenChangePercent)
              const absorbedDmg = tickDmg * shieldMult * ship.crDamageTakenMultiplier;
              const hitAngle = Math.atan2(shieldHitPoint.y - sCenter.y, shieldHitPoint.x - sCenter.x);
              const fluxGain = ship.shield.absorbDamage(absorbedDmg, b.damageType, hitAngle);
              recordBeamGlowDamage(b, { shieldDamage: shieldHitGlowDamage(fluxGain,
                ship.flux.maxFlux - ship.flux.totalFlux, ship.shield.efficiency) });
              ship.flux.increaseFlux(fluxGain, sourceMount?.spec.beamDealsHardFlux === true);
              if (ctx.statsTracker) {
                ctx.statsTracker.recordDamageDealt(b.isPlayer ?? false, b.damageType, absorbedDmg * ship.shield.damageTakenMultiplierFor(b.damageType), 'SHIELD');
              }
            }
            // Contact audio remains an independent per-frame ACTIVE adapter.
            if (!active) break;

            const contactPulse = advanceBeamContactPulse(b, 'SHIELD', dt);
            // The beam renderer owns its continuous contact glow; shield absorption
            // already updates the native segment reaction. No extra timed spark/ring emitter.
            if (contactPulse.emitSound) {
              sound.playAtPos('shield_hit', shieldHitPoint, ctx.playerShip.pos, 0.22);
            }
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
            contactedThisTick = true;
            damageTarget = ship;
            shortenBeamGlow(b);
            if (b.damageActive === false) {
              b.isHitting = false;
              break;
            }
            if (sample && sample.damage > 0) {
              if (!b.hasRecordedHit) {
                ctx.statsTracker?.recordShotHit(b.isPlayer ?? false);
                b.hasRecordedHit = true;
              }
              const outgoing = outgoingDamageMultiplier(srcShip, ship, sourceMount?.spec.weaponType, b.startPos, b.endPos);
              const tickDmg = sample.damage * outgoing;
              const tickEmp = sample.emp;
              // 装甲/结构承受伤害按目标战备值修正 (CRPluginImpl.getDamageTakenChangePercent)
              const takenDmg = tickDmg * ship.crDamageTakenMultiplier;
              const result = ship.armor.takeDamage(localImpact, takenDmg, b.damageType, sample.effectiveDps * outgoing * ship.crDamageTakenMultiplier, true);
              recordBeamGlowDamage(b, result);
              ctx.fx.spawnArmorDamageSparks(ship, localImpact, result.armorDamage);
              if (ctx.statsTracker) {
                let empRecorded = false;
                if (result.armorDamage > 0) {
                  ctx.statsTracker.recordDamageDealt(b.isPlayer ?? false, b.damageType, result.armorDamage, 'ARMOR', tickEmp);
                  empRecorded = tickEmp > 0;
                }
                if (result.hullDamage > 0) {
                  ctx.statsTracker.recordDamageDealt(b.isPlayer ?? false, b.damageType, result.hullDamage, 'HULL', empRecorded ? 0 : tickEmp);
                }
              }
              ship.hullHp = Math.max(0, ship.hullHp - result.hullDamage);

              applyComponentDamage(ship, localImpact, result, tickEmp, srcShip);
            }
            if (!active) {
              if (ship.hullHp <= 0) ctx.handleShipDestruction(ship);
              break;
            }

            const contactPulse = advanceBeamContactPulse(b, 'HULL', dt);
            if (contactPulse.emitSound) {
              sound.playAtPos('beam_hit', worldImpact, ctx.playerShip.pos, 0.35);
            }

            if (ship.hullHp <= 0) {
              ctx.handleShipDestruction(ship);
            }

            break; // 击中最近的船体装甲，截断光束
          }
        }
      }
      if (!contactedThisTick) b.contactSurface = undefined;
      if (b.beamEffect && b.damageActive !== false) requireWeaponEffect(b.beamEffect, 'beam', b.specId).beam!(b, damageTarget, sourceMount, ctx);
    }
  }
}
