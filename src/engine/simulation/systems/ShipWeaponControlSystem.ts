import { Vector2 } from '../../math/Vector2';
import { Projectile, Beam, WeaponMount, WeaponGroup, MuzzleFlashSpec } from '../Weapon';
import { ShipSpec } from '../../modding/ModManager';
import { sound } from '../../audio/SoundManager';
import type { Ship } from '../Ship';
import { contentRegistry } from '../../content/ContentRegistry';
import { SimulationRandom } from '../SimulationRandom';

/**
 * 战舰武器挂点、火控散布、交替射击与弹道发射控制子系统 (ShipWeaponControlSystem)
 * 纯粹负责管理各挂点旋转、火控散布衰减、自动火控解算与多管射击偏移。
 */
export class ShipWeaponControlSystem {
  public weapons: WeaponMount[] = [];
  public weaponGroups: WeaponGroup[] = [];
  public selectedGroupIndex = 0;
  public justDisabledMounts: WeaponMount[] = [];
  public justRepairedMounts: WeaponMount[] = [];

  constructor(private readonly random = new SimulationRandom()) {}

  public init(spec: ShipSpec, initialFacingRad: number) {
    this.weapons = [];
    this.weaponGroups = [];
    this.selectedGroupIndex = 0;
    this.justDisabledMounts = [];
    this.justRepairedMounts = [];

    // 装备挂点与武器
    for (const slot of spec.weaponSlots) {
      const weaponSpec = slot.defaultWeaponId ? contentRegistry.getWeapon(slot.defaultWeaponId) : undefined;
      if (weaponSpec) {
        this.weapons.push({
          slotId: slot.slotId,
          spec: weaponSpec,
          mountType: slot.mountType,
          relativePos: new Vector2(slot.x, slot.y),
          baseAngleDeg: slot.baseAngleDeg,
          arcDeg: slot.arcDeg,
          currentAngleRad: initialFacingRad + (slot.baseAngleDeg * Math.PI) / 180,
          cooldownTimer: 0,
          isAutofire: slot.mountType === 'TURRET',
          burstRemaining: 0,
          burstTimer: 0,
          recoil: 0,
          glowAlpha: 0,
          barrelIndex: 0,
          currentSpreadDeg: weaponSpec.minSpread || 0,
          health: weaponSpec.mountSize === 'LARGE' ? 1500 : weaponSpec.mountSize === 'MEDIUM' ? 800 : 500,
          maxHealth: weaponSpec.mountSize === 'LARGE' ? 1500 : weaponSpec.mountSize === 'MEDIUM' ? 800 : 500,
          isDisabled: false,
          disabledTimer: 0,
          disabledDuration: 0
        });
      }
    }

    // 初始化武器编组 (Groups 1 - 5)
    if (spec.defaultWeaponGroups && spec.defaultWeaponGroups.length > 0) {
      this.weaponGroups = spec.defaultWeaponGroups.map((g) => ({
        index: g.index,
        mode: g.mode,
        isAutofire: g.isAutofire,
        weaponSlotIds: [...g.weaponSlotIds],
        alternatingIndex: 0
      }));
    } else {
      this.weaponGroups = [
        {
          index: 0,
          mode: 'LINKED',
          isAutofire: false,
          weaponSlotIds: this.weapons.map((w) => w.slotId),
          alternatingIndex: 0
        }
      ];
    }
  }

  public selectGroup(index: number) {
    if (index >= 0 && index < this.weaponGroups.length) {
      if (this.selectedGroupIndex !== index) {
        this.selectedGroupIndex = index;
        sound.play('ui_button_press', 0.5);
      }
    }
  }

  public toggleAutofire(groupIndex: number) {
    if (groupIndex >= 0 && groupIndex < this.weaponGroups.length) {
      const g = this.weaponGroups[groupIndex];
      g.isAutofire = !g.isAutofire;
      sound.play('autofire_toggle', 0.7);
    }
  }

  public toggleFireMode(groupIndex: number) {
    if (groupIndex >= 0 && groupIndex < this.weaponGroups.length) {
      const g = this.weaponGroups[groupIndex];
      g.mode = g.mode === 'LINKED' ? 'ALTERNATING' : 'LINKED';
      sound.play('ui_button_press', 0.6);
    }
  }

  // 挂点受创损坏与故障判定 (严格对齐 WeaponAPI.java 与 EMP 瘫痪算法)
  public damageMount(localImpactPos: Vector2, damage: number, isEmp: boolean): WeaponMount | null {
    for (const mount of this.weapons) {
      if (mount.isDisabled) continue;
      const dist = mount.relativePos.distanceTo(localImpactPos);
      const threshold = mount.spec.mountSize === 'LARGE' ? 65 : mount.spec.mountSize === 'MEDIUM' ? 45 : 30;
      if (dist < threshold) {
        const effectiveDamage = isEmp ? damage * 2.8 : damage * 0.65;
        mount.health -= effectiveDamage;
        if (mount.health <= 0) {
          mount.health = 0;
          mount.isDisabled = true;
          mount.disabledDuration = 5.0 + this.random.next() * 4.0;
          mount.disabledTimer = mount.disabledDuration;

          const sfx = mount.spec.mountSize === 'LARGE' 
            ? 'weapon_malfunction_large' 
            : mount.spec.mountSize === 'MEDIUM' 
            ? 'weapon_malfunction_medium' 
            : 'weapon_malfunction_small';
          sound.play(sfx, 0.75);

          this.justDisabledMounts.push(mount);
          return mount;
        }
      }
    }
    return null;
  }

  public update(
    dt: number,
    ship: Ship,
    cursorAngle: number,
    targetShip: Ship | null,
    spawnProjectile: (p: Projectile) => void,
    spawnBeam: (b: Beam) => void,
    spawnMuzzleFlash?: (pos: Vector2, angleRad: number, size: number, color: [number, number, number], spec?: MuzzleFlashSpec, shipVel?: Vector2) => void
  ) {
    const isFortressShieldBlockingWeapons = (ship.system.type === 'FORTRESS_SHIELD' && ship.system.isActive);
    const isPhaseBlockingWeapons = ship.isPhased;
    const canShipFire = !ship.flux.isOverloaded && !ship.flux.isVenting && !isFortressShieldBlockingWeapons && !isPhaseBlockingWeapons;

    // 冷却计时器、后坐力回位与弹道散布收束 (严格对齐 MultiBarrelRecoilTracker.java 与 weapon_data.csv)
    for (const mount of this.weapons) {
      if (mount.cooldownTimer > 0) {
        mount.cooldownTimer -= dt;
      }
      // 官方真实后坐力恢复时间: refireDelay * 0.8
      if (mount.recoil > 0) {
        const recoveryTime = Math.max(0.12, mount.spec.refireDelay * 0.8);
        mount.recoil = Math.max(0, mount.recoil - dt / recoveryTime);
      }
      if (mount.glowAlpha > 0) {
        mount.glowAlpha = Math.max(0, mount.glowAlpha - dt * 3.5);
      }
      // 真实弹道散布自然恢复 (spread decay)
      const minSpr = mount.spec.minSpread || 0;
      if (mount.currentSpreadDeg > minSpr) {
        mount.currentSpreadDeg = Math.max(minSpr, mount.currentSpreadDeg - (mount.spec.spreadDecay || 5) * dt);
      }
      // 挂点故障倒计时与自动抢修
      if (mount.isDisabled) {
        mount.disabledTimer -= dt;
        if (mount.disabledTimer <= 0) {
          mount.isDisabled = false;
          mount.disabledTimer = 0;
          mount.health = mount.maxHealth * 0.5;
          mount.cooldownTimer = 0.5;
          this.justRepairedMounts.push(mount);
        }
      }
    }

    const activeGroup = this.weaponGroups[this.selectedGroupIndex];
    const activeSlotSet = new Set(activeGroup ? activeGroup.weaponSlotIds : []);
    const autofireGroupMap = new Map<string, WeaponGroup>();
    for (const g of this.weaponGroups) {
      if (g.isAutofire) {
        for (const slotId of g.weaponSlotIds) {
          autofireGroupMap.set(slotId, g);
        }
      }
    }

    for (const mount of this.weapons) {
      if (mount.isDisabled) {
        // 故障挂点电机失灵无法旋转瞄准，射控电路短路无法击发
        continue;
      }

      const isInActiveGroup = activeSlotSet.has(mount.slotId);
      const isAutofireSlot = autofireGroupMap.has(mount.slotId);

      const mountOffset = new Vector2(mount.relativePos.x, mount.relativePos.y).rotate(ship.facingRad);
      const mountX = ship.pos.x + mountOffset.x;
      const mountY = ship.pos.y + mountOffset.y;
      const mountBaseWorldAngle = ship.facingRad + (mount.baseAngleDeg * Math.PI) / 180;
      const halfArcRad = (mount.arcDeg * Math.PI) / 360;

      // 硬挂点或固定主炮不可独立转动 (对齐 Starsector: if.java:781)
      const isHardpoint = mount.mountType === 'HARDPOINT' || mount.arcDeg <= 10 || (mount.spec.turnRateDegPerSec !== undefined && mount.spec.turnRateDegPerSec <= 0);
      const turretTurnRateRad = isHardpoint ? 0 : (((mount.spec.turnRateDegPerSec || 30) * Math.PI) / 180);

      // 官方炮塔瞄准算法 (com.fs.starfarer.combat.entities.ship.trackers.oooo_0.java:106-171)
      const aimTurret = (targetPoint: Vector2 | null, maxAimErrorTolerance = 0.20): { targetAngle: number; isAimedAtTarget: boolean; isWithinArc: boolean } => {
        if (isHardpoint || turretTurnRateRad <= 0) {
          mount.currentAngleRad = mountBaseWorldAngle;
          return { targetAngle: mountBaseWorldAngle, isAimedAtTarget: true, isWithinArc: true };
        }

        if (!targetPoint) {
          // 无瞄准目标点：平滑回正至基准角
          let curDiff = mountBaseWorldAngle - mount.currentAngleRad;
          while (curDiff > Math.PI) curDiff -= Math.PI * 2;
          while (curDiff < -Math.PI) curDiff += Math.PI * 2;
          mount.currentAngleRad += Math.sign(curDiff) * Math.min(Math.abs(curDiff), (turretTurnRateRad || 1.5) * dt);
          return { targetAngle: mountBaseWorldAngle, isAimedAtTarget: false, isWithinArc: false };
        }

        // 1. 各挂点独立计算朝向目标的世界角度 (从该挂点实际世界坐标计算，避免舰体视差)
        const dx = targetPoint.x - mountX;
        const dy = targetPoint.y - mountY;
        const targetAngle = Math.atan2(dy, dx);

        // 2. 官方射界判定与边界吸附 (Starsector: trackers/oooo_0.java:162-171)
        let diffFromBase = targetAngle - mountBaseWorldAngle;
        while (diffFromBase > Math.PI) diffFromBase -= Math.PI * 2;
        while (diffFromBase < -Math.PI) diffFromBase += Math.PI * 2;

        const isWithinArc = mount.arcDeg >= 355 || Math.abs(diffFromBase) <= halfArcRad;
        let desiredAngle = targetAngle;
        if (!isWithinArc) {
          // 原版机制：光标超出射界时，炮塔紧贴射界边缘指向光标，绝不倒转回中！
          desiredAngle = mountBaseWorldAngle + Math.sign(diffFromBase) * halfArcRad;
        }

        // 3. 以炮塔额定转速 (turnRate) 向期望朝向平滑回转 (trackers/oooo_0.java:133-138)
        let curDiff = desiredAngle - mount.currentAngleRad;
        while (curDiff > Math.PI) curDiff -= Math.PI * 2;
        while (curDiff < -Math.PI) curDiff += Math.PI * 2;
        mount.currentAngleRad += Math.sign(curDiff) * Math.min(Math.abs(curDiff), turretTurnRateRad * dt);

        let aimError = targetAngle - mount.currentAngleRad;
        while (aimError > Math.PI) aimError -= Math.PI * 2;
        while (aimError < -Math.PI) aimError += Math.PI * 2;

        const isAimedAtTarget = Math.abs(aimError) <= maxAimErrorTolerance && isWithinArc;
        return { targetAngle, isAimedAtTarget, isWithinArc };
      };

      // 1. 当前选中的主力武器编组 (Active Group - 玩家手动瞄准与击发，绝对优先级)
      if (isInActiveGroup) {
        if (isHardpoint) {
          mount.currentAngleRad = mountBaseWorldAngle;
        } else {
          aimTurret(ship.aimTargetWorld);
        }

        // 瞄准误差与开火条件
        const dx = ship.aimTargetWorld.x - mountX;
        const dy = ship.aimTargetWorld.y - mountY;
        const targetAngle = Math.atan2(dy, dx);
        let aimError = targetAngle - mount.currentAngleRad;
        while (aimError > Math.PI) aimError -= Math.PI * 2;
        while (aimError < -Math.PI) aimError += Math.PI * 2;
        let diffFromBase = targetAngle - mountBaseWorldAngle;
        while (diffFromBase > Math.PI) diffFromBase -= Math.PI * 2;
        while (diffFromBase < -Math.PI) diffFromBase += Math.PI * 2;

        // 严格对齐 Starsector 原版 WeaponGroup.java:329 (硬挂点瞄准容差额外增加 +30.0f 度)
        const hardpointTolerance = ((mount.arcDeg + 30) * Math.PI) / 360;
        const isAimed = isHardpoint
          ? Math.abs(diffFromBase) <= hardpointTolerance
          : (Math.abs(aimError) < 0.20 && (mount.arcDeg >= 355 || Math.abs(diffFromBase) <= halfArcRad + 0.05));

        if (ship.isFiringMain && canShipFire && mount.cooldownTimer <= 0 && isAimed) {
          if (activeGroup.mode === 'LINKED') {
            this.fireWeapon(mount, ship, spawnProjectile, spawnBeam, spawnMuzzleFlash);
          } else if (activeGroup.mode === 'ALTERNATING') {
            const nextSlotId = activeGroup.weaponSlotIds[activeGroup.alternatingIndex % activeGroup.weaponSlotIds.length];
            if (mount.slotId === nextSlotId) {
              this.fireWeapon(mount, ship, spawnProjectile, spawnBeam, spawnMuzzleFlash);
              activeGroup.alternatingIndex = (activeGroup.alternatingIndex + 1) % activeGroup.weaponSlotIds.length;
            }
          }
        }
      }
      // 2. 独立自动开火武器编组 (Autofire Slots - 优先追踪射程内的敌舰)
      else if (isAutofireSlot) {
        const effectiveRange = mount.spec.spawnType === 'MISSILE'
          ? mount.spec.range
          : mount.spec.range * (ship.spec.weaponRangeMult || 1.0);

        let targetFound = false;
        if (targetShip && !targetShip.isDead) {
          // 目标前置量计算 (Target Leading for Ballistics)
          let aimTargetPoint = targetShip.pos;
          if (!mount.spec.isBeam && mount.spec.projSpeed && mount.spec.projSpeed > 0) {
            const distEst = targetShip.pos.distanceTo(new Vector2(mountX, mountY));
            const t = distEst / mount.spec.projSpeed;
            const relVel = targetShip.vel.clone().sub(ship.vel);
            aimTargetPoint = targetShip.pos.clone().addScaled(relVel, t);
          }

          const toTarget = aimTargetPoint.clone().sub(new Vector2(mountX, mountY));
          const distToTarget = toTarget.length();
          const targetAngle = toTarget.heading();

          let angleDiff = targetAngle - mountBaseWorldAngle;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

          if (distToTarget <= effectiveRange + 150 && (mount.arcDeg >= 355 || Math.abs(angleDiff) <= halfArcRad)) {
            targetFound = true;
            // 计算基于目标舰体碰撞半径的严格瞄准容差，杜绝未对准就胡乱开火射向虚空
            const targetRadius = (targetShip.spec.collisionRadius || 120) * 0.7;
            const maxAimTol = Math.min(0.065, Math.max(0.015, targetRadius / Math.max(80, distToTarget)));

            if (isHardpoint) {
              mount.currentAngleRad = mountBaseWorldAngle;
              let aimError = targetAngle - mountBaseWorldAngle;
              while (aimError > Math.PI) aimError -= Math.PI * 2;
              while (aimError < -Math.PI) aimError += Math.PI * 2;
              if (canShipFire && mount.cooldownTimer <= 0 && Math.abs(aimError) <= maxAimTol && distToTarget <= effectiveRange) {
                this.fireWeapon(mount, ship, spawnProjectile, spawnBeam, spawnMuzzleFlash);
              }
            } else {
              const res = aimTurret(aimTargetPoint, maxAimTol);
              if (canShipFire && mount.cooldownTimer <= 0 && res.isAimedAtTarget && distToTarget <= effectiveRange) {
                this.fireWeapon(mount, ship, spawnProjectile, spawnBeam, spawnMuzzleFlash);
              }
            }
          }
        }

        if (!targetFound) {
          // 敌舰不在射界内或无目标：若是玩家座舰，跟随鼠标光标瞄准 (Starsector 官方逻辑: trackers/oooo_0.java)
          if (ship.isPlayer && !isHardpoint) {
            aimTurret(ship.aimTargetWorld);
          } else {
            aimTurret(null);
          }
        }
      }
      // 3. 其余未激活且非自动开火挂点 (Inactive Manual Weapons: Starsector WeaponGroup.java:334)
      else {
        // 官方机制：全舰所有非自动开火的手动旋转炮塔，全量跟随玩家鼠标光标瞄准！
        if (ship.isPlayer && !isHardpoint) {
          aimTurret(ship.aimTargetWorld);
        } else {
          aimTurret(null);
        }
      }
    }
  }

  public fireWeapon(
    mount: WeaponMount,
    ship: Ship,
    spawnProjectile: (p: Projectile) => void,
    spawnBeam: (b: Beam) => void,
    spawnMuzzleFlash?: (pos: Vector2, angleRad: number, size: number, color: [number, number, number], spec?: MuzzleFlashSpec, shipVel?: Vector2) => void
  ) {
    // 触发动态视觉后坐力与充能发光
    mount.recoil = 1.0;
    mount.glowAlpha = 1.0;

    // 累积散布与计算实际开火偏角 (严格对齐 weapon_data.csv: min/max spread, spread/shot)
    const minSpr = mount.spec.minSpread || 0;
    const maxSpr = mount.spec.maxSpread || minSpr;
    const sprPerShot = mount.spec.spreadPerShot || 0;
    mount.currentSpreadDeg = Math.min(maxSpr, mount.currentSpreadDeg + sprPerShot);
    const spreadRad = ((this.random.next() - 0.5) * mount.currentSpreadDeg * Math.PI) / 180;
    const fireAngleRad = mount.currentAngleRad + spreadRad;

    // 多管武器交替射击管位切换与枪口世界坐标偏移 (1:1 官方 Starsector 炮管偏移算法)
    let barrelOffsetWorld = new Vector2(0, 0);
    const isHardpoint = mount.mountType === 'HARDPOINT';
    const offsets = isHardpoint
      ? (mount.spec.hardpointOffsets && mount.spec.hardpointOffsets.length >= 2 ? mount.spec.hardpointOffsets : mount.spec.turretOffsets)
      : (mount.spec.turretOffsets && mount.spec.turretOffsets.length >= 2 ? mount.spec.turretOffsets : mount.spec.hardpointOffsets);

    let offX = 0;
    let offY = 0;
    if (offsets && offsets.length >= 2) {
      const barrelCount = Math.floor(offsets.length / 2);
      const bIdx = mount.barrelIndex % barrelCount;
      offX = offsets[bIdx * 2];
      offY = offsets[bIdx * 2 + 1];
      barrelOffsetWorld = new Vector2(offX, offY).rotate(mount.currentAngleRad);
      mount.barrelIndex = (mount.barrelIndex + 1) % barrelCount;
    }

    // 挂点世界绝对坐标 (加上炮管偏移)
    const rotatedOffset = mount.relativePos.clone().rotate(ship.facingRad);
    const firePos = ship.pos.clone().add(rotatedOffset).add(barrelOffsetWorld);

    // 开火增加幅能
    ship.flux.increaseFlux(mount.spec.fluxPerShot, false);
    mount.cooldownTimer = mount.spec.refireDelay;

    // 播放官方真实音效
    if (mount.spec.soundKey) {
      sound.play(mount.spec.soundKey, ship.isPlayer ? 0.85 : 0.45);
    }

    // 激发枪口火焰 (1:1 官方原版粒子暴风 _class.o00000 & SmoothParticle.java)
    if (spawnMuzzleFlash) {
      if (mount.spec.muzzleFlashSpec) {
        spawnMuzzleFlash(
          firePos,
          fireAngleRad,
          mount.spec.muzzleFlashSize || 25,
          [mount.spec.muzzleFlashSpec.particleColor[0], mount.spec.muzzleFlashSpec.particleColor[1], mount.spec.muzzleFlashSpec.particleColor[2]],
          mount.spec.muzzleFlashSpec,
          ship.vel
        );
      } else if (mount.spec.muzzleFlashColor) {
        spawnMuzzleFlash(
          firePos,
          fireAngleRad,
          mount.spec.muzzleFlashSize || 25,
          mount.spec.muzzleFlashColor
        );
      }
    }

    const effectiveRange = mount.spec.spawnType === 'MISSILE'
      ? mount.spec.range
      : mount.spec.range * (ship.spec.weaponRangeMult || 1.0);

    if (mount.spec.isBeam) {
      // 发射持续光束 (严格对齐 Starsector BeamWeaponRay.java 与 weapon_data.csv)
      const beamDir = Vector2.fromAngle(fireAngleRad, effectiveRange);
      const endPos = firePos.clone().add(beamDir);
      const isBurst = mount.spec.id === 'tachyonlance';
      const beamDuration = isBurst ? 1.0 : 0.22;
      mount.glowAlpha = 1.0;
      spawnBeam({
        id: this.random.next(),
        sourceShipId: ship.id,
        slotId: mount.slotId,
        isPlayer: ship.isPlayer,
        specId: mount.spec.id,
        startPos: firePos,
        endPos: endPos,
        barrelOffset: { x: offX, y: offY },
        damagePerSec: mount.spec.damagePerSecond,
        damageType: mount.spec.type,
        color: mount.spec.color,
        duration: beamDuration,
        maxDuration: beamDuration,
        width: mount.spec.id === 'tachyonlance' ? 25 : (mount.spec.id === 'gravitonbeam' ? 18 : 12),
        isEmpPiercing: mount.spec.id === 'tachyonlance',
        elapsedTime: 0,
        textureType: mount.spec.textureType,
        textureScrollSpeed: mount.spec.textureScrollSpeed,
        fringeColor: mount.spec.fringeColor,
        coreColor: mount.spec.coreColor,
        glowColor: mount.spec.glowColor,
        hitGlowRadius: mount.spec.hitGlowRadius
      });
    } else {
      // 发射实体弹药/脉冲 (使用计入散布的真实弹道角 fireAngleRad)
      const projVel = Vector2.fromAngle(fireAngleRad, mount.spec.projSpeed).add(ship.vel);
      spawnProjectile({
        id: this.random.next(),
        sourceShipId: ship.id,
        isPlayer: ship.isPlayer,
        specId: mount.spec.id,
        pos: firePos.clone(),
        prevPos: firePos.clone(),
        vel: projVel,
        damage: mount.spec.damagePerShot,
        damageType: mount.spec.type,
        radius: mount.spec.projRadius,
        rangeRemaining: effectiveRange,
        totalRange: effectiveRange,
        elapsedTime: 0,
        color: mount.spec.color,
        spawnType: mount.spec.spawnType,
        textureType: mount.spec.textureType,
        textureScrollSpeed: mount.spec.textureScrollSpeed,
        fringeColor: mount.spec.fringeColor,
        coreColor: mount.spec.coreColor,
        glowColor: mount.spec.glowColor,
        hitGlowRadius: mount.spec.hitGlowRadius,
        glowRadius: mount.spec.glowRadius || mount.spec.hitGlowRadius,
        coreWidthMult: mount.spec.coreWidthMult,
        projSpriteUrl: mount.spec.projSpriteUrl,
        projLength: mount.spec.projLength,
        projWidth: mount.spec.projWidth,
        isRocket: mount.spec.isRocket || mount.spec.spawnType === 'MISSILE',
        isGuided: mount.spec.isGuided,
        targetShipId: ship.currentTargetShip?.id,
        facingRad: fireAngleRad,
        engineAcceleration: mount.spec.engineAcceleration,
        maxSpeed: mount.spec.maxSpeed,
        maxTurnRate: mount.spec.maxTurnRate,
        engineFlameColor: mount.spec.engineFlameColor,
        isTwoStage: mount.spec.isTwoStage,
        proximityFuse: mount.spec.proximityFuse,
        hitpoints: mount.spec.missileHp || (mount.spec.isRocket || mount.spec.spawnType === 'MISSILE' ? 100 : undefined),
        maxHitpoints: mount.spec.missileHp || (mount.spec.isRocket || mount.spec.spawnType === 'MISSILE' ? 100 : undefined)
      });
    }
  }
}
