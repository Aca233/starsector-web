import { effectiveHullModWeaponSpec } from '../../extensions/HullMods';
import { AutofireController, type FireControlWorld } from '../../ai/AutofireController';
import { signedAngle } from '../../math/Angles';
import { manualFireSlots, advanceTurretAim } from './weapon/WeaponAim';
import { combatWeaponRange, combatProjectileSpeed } from '../WeaponRange';
import { bindProjectileSource } from './weapon/OutgoingDamage';
import { canPermanentlyDisableWeapon, finalizePermanentWeaponMalfunction, weaponIsInFiringCycle } from './ComponentMalfunctions';
import { advanceWeaponComponent, createWeaponHealthTracker, damageWeaponComponent, disableWeaponComponent, weaponHealthProfile } from './weapon/WeaponComponentHealth';
import { Vector2 } from '../../math/Vector2';
import { Projectile, Beam, WeaponMount, WeaponGroup, LauncherSmokeSpec, MuzzleFlashSpec } from '../Weapon';
import { ShipSpec } from '../../modding/ModManager';
import { initializeSourceProjectile } from './weapon/SourceProjectileLifecycle';
import { sound } from '../../audio/SoundManager';
import type { Ship } from '../Ship';
import { contentRegistry } from '../../content/ContentRegistry';
import { SimulationRandom } from '../SimulationRandom';

/**
 * 战舰武器挂点、火控散布、交替射击与弹道发射控制子系统 (ShipWeaponControlSystem)
 * 纯粹负责管理各挂点旋转、火控散布衰减、自动火控解算与多管射击偏移。
 */
export class ShipWeaponControlSystem {
  private readonly autofire = new AutofireController();
  private previousHullFacingRad = 0;
  public weapons: WeaponMount[] = [];
  public weaponGroups: WeaponGroup[] = [];
  public selectedGroupIndex = 0;
  public justDisabledMounts: WeaponMount[] = [];
  public justRepairedMounts: WeaponMount[] = [];

  constructor(private readonly random = new SimulationRandom()) {}

  public init(spec: ShipSpec, initialFacingRad: number, healthMultiplier = 1) {
    this.autofire.reset();
    this.previousHullFacingRad = initialFacingRad;
    this.weapons = [];
    this.weaponGroups = [];
    this.selectedGroupIndex = 0;
    this.justDisabledMounts = [];
    this.justRepairedMounts = [];

    // 装备挂点与武器
    for (const slot of spec.weaponSlots) {
      const baseWeapon = slot.defaultWeaponId ? contentRegistry.getWeapon(slot.defaultWeaponId) : undefined;
      const weaponSpec = baseWeapon ? effectiveHullModWeaponSpec(spec, baseWeapon) : undefined;
      if (slot.defaultWeaponId && !weaponSpec) throw new Error(`${spec.id}.${slot.slotId}: unknown weapon ${slot.defaultWeaponId}`);
      if (weaponSpec) {
        const health = weaponHealthProfile(weaponSpec.mountSize, slot.mountType, healthMultiplier);
        this.weapons.push({
          slotId: slot.slotId,
          spec: weaponSpec,
          mountType: slot.mountType,
          relativePos: new Vector2(slot.x, slot.y),
          baseAngleDeg: slot.baseAngleDeg,
          arcDeg: slot.arcDeg,
          aimIdleSeconds: 15.1,
          currentAngleRad: initialFacingRad + (slot.baseAngleDeg * Math.PI) / 180,
          cooldownTimer: 0,
          isAutofire: slot.mountType === 'TURRET',
          burstRemaining: 0,
          burstTimer: 0,
          firingState: 'IDLE',
          firingStateTimer: 0,
          triggerHeld: false,
          firingCycleId: 0,
          baseMaxAmmo: baseWeapon?.maxAmmo,
          ammo: weaponSpec.maxAmmo ?? Number.POSITIVE_INFINITY,
          ammoRechargeProgress: 0,
          recoil: 0,
          glowAlpha: 0,
          barrelIndex: 0,
          currentSpreadDeg: weaponSpec.minSpread || 0,
          health: health.health,
          maxHealth: health.health,
          healthTracker: createWeaponHealthTracker(health.repairDuration, this.random),
          isPermanentlyDisabled: false,
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
    // Native variants may start with an empty group. Never spawn with an invisible
    // selected group while all visible weapon rows appear unselected.
    const occupied = this.weaponGroups.findIndex(g => g.weaponSlotIds.some(id => this.weapons.some(w => w.slotId === id)));
    this.selectedGroupIndex = Math.max(0, occupied);
  }

  private resolveGroupArrayIndex(declaredIndex: number): number {
    return this.weaponGroups.findIndex((group) => group.index === declaredIndex);
  }

  public selectGroup(declaredIndex: number) {
    const arrayIndex = this.resolveGroupArrayIndex(declaredIndex);
    if (arrayIndex >= 0 && this.selectedGroupIndex !== arrayIndex) {
      this.selectedGroupIndex = arrayIndex;
      sound.play('ui_button_press', 0.5);
    }
  }

  public toggleAutofire(declaredIndex: number) {
    const arrayIndex = this.resolveGroupArrayIndex(declaredIndex);
    if (arrayIndex >= 0) {
      const g = this.weaponGroups[arrayIndex];
      g.isAutofire = !g.isAutofire;
      sound.play('autofire_toggle', 0.7);
    }
  }

  public toggleFireMode(declaredIndex: number) {
    const arrayIndex = this.resolveGroupArrayIndex(declaredIndex);
    if (arrayIndex >= 0) {
      const g = this.weaponGroups[arrayIndex];
      g.mode = g.mode === 'LINKED' ? 'ALTERNATING' : 'LINKED';
      sound.play('ui_button_press', 0.6);
    }
  }

  /** Raw component transfer; periodic health checks, not damage calls, disable. */
  public damageComponent(mount: WeaponMount, damage: number): void {
    damageWeaponComponent(mount, damage, this.random);
  }

  public disableComponent(mount: WeaponMount, permanent = false): void {
    if (disableWeaponComponent(mount, this.random, permanent)) this.onComponentDisabled(mount);
  }

  private onComponentDisabled(mount: WeaponMount): void {
    // Destroy charge/burst state immediately; normal weapon cooldown keeps running
    // during repairs. There is no invented half-second cooldown on recovery.
    if (mount.firingState !== 'IDLE' || mount.burstRemaining > 0) {
      mount.cooldownTimer = Math.max(mount.cooldownTimer, mount.spec.beamBurstDelay ?? mount.spec.refireDelay);
    }
    mount.burstRemaining = 0;
    mount.burstFluxReserved = false;
    mount.burstTimer = 0;
    mount.firingState = 'IDLE';
    mount.firingStateTimer = 0;
    mount.triggerHeld = false;
    this.justDisabledMounts.push(mount);
  }

  public update(
    dt: number,
    ship: Ship,
    cursorAngle: number,
    targetShip: Ship | null,
    spawnProjectile: (p: Projectile) => void,
    spawnBeam: (b: Beam) => void,
    spawnMuzzleFlash?: (pos: Vector2, angleRad: number, size: number, color: [number, number, number], spec?: MuzzleFlashSpec, shipVel?: Vector2, launcherSmokeSpec?: LauncherSmokeSpec) => void,
    fireControlWorld?: FireControlWorld
  ) {
    const world: FireControlWorld = fireControlWorld ?? { ships: targetShip ? [ship, targetShip] : [ship], missiles: [], asteroids: [] };
    const manualControl = ship.fireControlMode === 'MANUAL' && !ship.system.forcesAutofire;
    const hullTurn = signedAngle(ship.facingRad - this.previousHullFacingRad);
    this.previousHullFacingRad = ship.facingRad;
    for (const mount of this.weapons) mount.currentAngleRad += hullTurn;
    const systemBlocksWeapons = ship.system.blocksWeapons;
    const isPhaseBlockingWeapons = ship.isPhased;
    const canShipFire = !ship.flux.isOverloaded && !ship.flux.isVenting && !systemBlocksWeapons && !isPhaseBlockingWeapons;

    // 冷却计时器、后坐力回位与弹道散布收束 (严格对齐 MultiBarrelRecoilTracker.java 与 weapon_data.csv)
    const cr = ship.crEffects;
    for (const mount of this.weapons) {
      // Timers remain in source weapon seconds. Apply transient RoF to their clock,
      // never to shared specs, ammo regeneration, repair, turret aim or projectile speed.
      const rate = this.weaponClockRate(mount, ship);
      const reloadDelay = mount.reloadDelayRemaining ?? 0;
      mount.reloadDelayRemaining = Math.max(0, reloadDelay - dt * rate);
      const weaponDt = Math.max(0, dt * rate - reloadDelay);
      mount.lifecycleDt = mount.spec.isBeam
        ? Math.max(0, (weaponDt - mount.cooldownTimer) / rate)
        : Math.max(0, weaponDt - mount.cooldownTimer);
      if (mount.cooldownTimer > 0) {
        mount.cooldownTimer = Math.max(0, mount.cooldownTimer - weaponDt);
        if (mount.cooldownTimer < 1e-9) mount.cooldownTimer = 0;
      }
      if (Number.isFinite(mount.ammo) && mount.spec.maxAmmo !== undefined && mount.spec.ammoRegenPerSec) {
        mount.ammoRechargeProgress += mount.spec.ammoRegenPerSec * ship.system.getAmmoRegenMultiplier(mount.spec.weaponType) * dt;
        while (mount.ammoRechargeProgress >= 1 && mount.ammo < mount.spec.maxAmmo) {
          mount.ammo++;
          mount.ammoRechargeProgress -= 1;
        }
        if (mount.ammo >= mount.spec.maxAmmo) mount.ammoRechargeProgress = 0;
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
        mount.currentSpreadDeg = Math.max(minSpr, mount.currentSpreadDeg - (mount.spec.spreadDecay || 5) * ship.system.getRecoilMultiplier() * dt);
      }
      const healthEvent = advanceWeaponComponent(mount, dt, this.random, !ship.isDead,
        ship.combatWeaponRepairTimeMultiplier * ship.system.getRepairTimeMultiplier(), ship.canRepairModulesUnderFire,
        cr.weaponMalfunctionChance > 0 && weaponIsInFiringCycle(mount) ? {
          chance: cr.weaponMalfunctionChance, criticalChance: cr.criticalMalfunctionChance,
          canPermanentlyDisable: () => canPermanentlyDisableWeapon(ship, mount),
          disable: (critical, permanent) => {
            const onset = disableWeaponComponent(mount, this.random, permanent);
            if (permanent) finalizePermanentWeaponMalfunction(ship, mount);
            if (critical) ship.applyCriticalMalfunctionDamage(mount.relativePos);
            return onset;
          }
        } : undefined);
      if (healthEvent.disabled) this.onComponentDisabled(mount);
      if (healthEvent.repaired) this.justRepairedMounts.push(mount);
    }

    if (ship.hullHp <= 0) return;

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

    // 交替射击组：同一时刻只允许"当前活动挂点"开火，并按原版时间片轮换
    // (见 advanceAlternatingActive)。故障/无弹挂点会被跳过，否则它们会永久阻塞整组。
    const isAlternatingGroup = manualControl && !!activeGroup && activeGroup.mode === 'ALTERNATING';
    if (isAlternatingGroup && activeGroup) {
      if (ship.isFiringMain && canShipFire) {
        this.advanceAlternatingActive(activeGroup, dt, ship);
      } else {
        // 原版 WeaponGroup.advanceAlternating：松开扳机时，若上一次活动权不是被时间片
        // 自动轮换掉的，就把活动权手动交给下一门可用炮——也就是玩家常用的"轻点扳机换炮"。
        if (activeGroup.alternatingWasFiring && !activeGroup.alternatingJustSwitched) {
          this.selectNextAlternatingActive(activeGroup);
        }
        activeGroup.alternatingElapsed = 0;
        activeGroup.alternatingWasFiring = false;
        activeGroup.alternatingJustSwitched = false;
      }
    }
    const alternatingSlotId = isAlternatingGroup && activeGroup
      ? activeGroup.weaponSlotIds[((activeGroup.alternatingIndex % activeGroup.weaponSlotIds.length) + activeGroup.weaponSlotIds.length) % activeGroup.weaponSlotIds.length]
      : undefined;

    const manualSlots = manualFireSlots(ship, this.weapons, activeSlotSet, alternatingSlotId);
    for (const mount of this.weapons) {
      mount.triggerHeld = false;
      if (mount.isDisabled) {
        this.autofire.clear(mount);
        // 故障挂点电机失灵无法旋转瞄准，射控电路短路无法击发
        mount.burstRemaining = 0;
        mount.burstFluxReserved = false;
        mount.firingState = 'IDLE';
        mount.firingStateTimer = 0;
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
      const isHardpoint = mount.mountType === 'HARDPOINT' || (mount.spec.turnRateDegPerSec !== undefined && mount.spec.turnRateDegPerSec <= 0);
      const turretTurnRateRad = isHardpoint ? 0 : (((mount.spec.turnRateDegPerSec ?? 30) * Math.PI) / 180);

      // 官方炮塔瞄准算法 (com.fs.starfarer.combat.entities.ship.trackers.oooo_0.java:106-171)
      const aimTurret = (targetPoint: Vector2 | null): void => {
        if (isHardpoint || turretTurnRateRad <= 0) {
          mount.currentAngleRad = mountBaseWorldAngle;
          return;
        }

        if (!targetPoint) {
          mount.aimIdleSeconds = (mount.aimIdleSeconds ?? 15.1) + dt;
          if (mount.aimIdleSeconds > 15) mount.currentAngleRad = advanceTurretAim(mount.currentAngleRad,mountBaseWorldAngle,mountBaseWorldAngle,mount.arcDeg,turretTurnRateRad,ship.angularVelRad,dt);
          return;
        }

        mount.aimIdleSeconds = 0;
        // 1. 各挂点独立计算朝向目标的世界角度 (从该挂点实际世界坐标计算，避免舰体视差)
        const dx = targetPoint.x - mountX;
        const dy = targetPoint.y - mountY;
        const targetAngle = Math.atan2(dy, dx);

        // 2. 官方射界判定与边界吸附 (Starsector: trackers/oooo_0.java:162-171)
        let diffFromBase = targetAngle - mountBaseWorldAngle;
        while (diffFromBase > Math.PI) diffFromBase -= Math.PI * 2;
        while (diffFromBase < -Math.PI) diffFromBase += Math.PI * 2;

        const isWithinArc = mount.arcDeg >= 360 || Math.abs(diffFromBase) <= halfArcRad;
        let desiredAngle = targetAngle;
        if (!isWithinArc) {
          // 原版机制：光标超出射界时，炮塔紧贴射界边缘指向光标，绝不倒转回中！
          desiredAngle = mountBaseWorldAngle + Math.sign(diffFromBase) * halfArcRad;
        }

        mount.currentAngleRad = advanceTurretAim(mount.currentAngleRad,mountBaseWorldAngle,desiredAngle,mount.arcDeg,turretTurnRateRad,ship.angularVelRad,dt);

      };

      // 1. 当前选中的主力武器编组 (Active Group - 玩家手动瞄准与击发，绝对优先级)
      if (manualControl && isInActiveGroup) {
        this.autofire.clear(mount);
        if (isHardpoint) {
          mount.currentAngleRad = mountBaseWorldAngle;
        } else {
          aimTurret(ship.aimTargetWorld);
        }

        // Manual fire follows the group selection rule, not an invented alignment tolerance.
        if (ship.isFiringMain && canShipFire && mount.cooldownTimer <= 0 && manualSlots.has(mount.slotId)) {
          if (activeGroup.mode === 'LINKED') {
            this.requestWeaponFire(mount, ship, spawnProjectile, spawnBeam, spawnMuzzleFlash);
          } else if (activeGroup.mode === 'ALTERNATING') {
            // 原版交替模式：本帧只把开火指令发给当前活动挂点，其余挂点禁止击发。
            // 活动权由 advanceAlternatingActive 按时间片轮换，因此两门炮会错开半个周期。
            if (mount.slotId === alternatingSlotId) {
              this.requestWeaponFire(mount, ship, spawnProjectile, spawnBeam, spawnMuzzleFlash);
            }
          }
        }
      }
      // Native advanceAutofire evaluates each weapon independently (including alternating groups).
      // AI owns all mounts; a manual pilot owns the selected group and opts others into autofire.
      else if (!manualControl || isAutofireSlot) {
        const solution = this.autofire.aim(dt, ship, mount, world);
        aimTurret(solution?.point ?? null);
        if (this.autofire.decide(ship, mount, solution, world, dt) === 'FIRE' && canShipFire && mount.cooldownTimer <= 0) {
          this.requestWeaponFire(mount, ship, spawnProjectile, spawnBeam, spawnMuzzleFlash);
        }
      }
      // 3. 其余未激活且非自动开火挂点 (Inactive Manual Weapons: Starsector WeaponGroup.java:334)
      else {
        this.autofire.clear(mount);
        const idleTargetAngle = Math.atan2(ship.aimTargetWorld.y-mountY,ship.aimTargetWorld.x-mountX);
        const cursorNearArc = Math.abs(signedAngle(idleTargetAngle-mountBaseWorldAngle)) <= (mount.arcDeg+30)*Math.PI/360;
        // Native inactive manual turrets receive the cursor only near their arc.
        if (ship.isPlayer && !isHardpoint && (cursorNearArc || mount.spec.alwaysFire)) {
          aimTurret(ship.aimTargetWorld);
        } else {
          aimTurret(null);
        }
      }

      this.advanceWeaponLifecycle(mount.lifecycleDt ?? dt, mount, ship, canShipFire && ship.system.canFireWeapon(mount), spawnProjectile, spawnBeam, spawnMuzzleFlash);
    }
  }

  /**
   * 交替射击组的时间片轮换 (1:1 原版 WeaponGroup.advanceAlternating)
   *
   * 原版规则：同一时刻只把"开火指令"发给当前活动挂点，其余挂点一律 advance(false) 禁止击发；
   * 活动权按下述时间片轮换，而不是"谁冷却好了谁打"——因此两门同型炮在交替模式下会
   * 各占半个周期、交替倾泻，而不会像齐射那样同帧齐发。
   *
   *   非光束时间片 = ((burstSize-1)*burstDelay + refireDelay + chargeTime) / 炮数
   *   爆发光束时间片 = (burstDuration + burstCooldown + chargeup + chargedown) / 炮数
   *   持续光束不轮换 (原版只在 isBurstBeam 分支里 selectNextActive)
   *
   * 故障/无弹挂点会被立即跳过（原版 findNextWeaponFrom 跳过 getAmmo()<=0），
   * 因此单个坏挂点既不会卡死整组，也不会白占一个时间片。
   */
  private advanceAlternatingActive(group: WeaponGroup, dt: number, ship: Ship): void {
    const slotIds = group.weaponSlotIds;
    if (slotIds.length === 0) return;

    const mountAt = (index: number) => this.weapons.find((w) => w.slotId === slotIds[index]);
    const isFireable = (mount?: WeaponMount) =>
      !!mount && !mount.isDisabled && (!Number.isFinite(mount.ammo) || mount.ammo >= 1);

    const startIndex = ((group.alternatingIndex % slotIds.length) + slotIds.length) % slotIds.length;
    let activeIndex = startIndex;
    let active = mountAt(activeIndex);
    let rotated = false;

    // 活动挂点不可用时立即轮换到下一个可用挂点 (不让坏挂点白占时间片)
    if (!isFireable(active)) {
      const nextIndex = this.findNextFireableAlternatingIndex(group, startIndex);
      if (nextIndex === undefined) {
        // 整组都不可击发：本帧不开火，指针保持不动 (不空转)
        group.alternatingWasFiring = true;
        group.alternatingJustSwitched = false;
        return;
      }
      activeIndex = nextIndex;
      active = mountAt(activeIndex)!;
      group.alternatingElapsed = 0;
      rotated = true;
    }

    // 持续光束不参与轮换：原版只对爆发光束做 selectNextActive
    const isSustainedBeam = !!active.spec.isBeam && active.spec.beamVisualMode !== 'BURST';
    if (isSustainedBeam) {
      group.alternatingIndex = activeIndex;
      group.alternatingElapsed = 0;
      group.alternatingWasFiring = true;
      group.alternatingJustSwitched = false;
      return;
    }

    const slice = this.getAlternatingSlice(active, slotIds.length, ship);
    const elapsed = (group.alternatingElapsed ?? 0) + dt;
    if (elapsed > slice) {
      const nextIndex = this.findNextFireableAlternatingIndex(group, activeIndex);
      if (nextIndex !== undefined && nextIndex !== activeIndex) {
        activeIndex = nextIndex;
      }
      group.alternatingElapsed = 0;
      rotated = true;
    } else {
      group.alternatingElapsed = elapsed;
    }

    group.alternatingIndex = activeIndex;
    group.alternatingWasFiring = true;
    group.alternatingJustSwitched = rotated;
  }

  /** 从 fromIndex 之后开始找下一个可击发挂点在 weaponSlotIds 中的下标 (跳过故障/无弹)。 */
  private findNextFireableAlternatingIndex(group: WeaponGroup, fromIndex: number): number | undefined {
    const slotIds = group.weaponSlotIds;
    for (let offset = 1; offset <= slotIds.length; offset++) {
      const index = (fromIndex + offset) % slotIds.length;
      const mount = this.weapons.find((w) => w.slotId === slotIds[index]);
      if (mount && !mount.isDisabled && (!Number.isFinite(mount.ammo) || mount.ammo >= 1)) return index;
    }
    return undefined;
  }

  /** 玩家手动换炮 (轻点扳机)：把活动权交给下一门可击发挂点。 */
  private selectNextAlternatingActive(group: WeaponGroup): void {
    const slotIds = group.weaponSlotIds;
    if (slotIds.length === 0) return;
    const current = ((group.alternatingIndex % slotIds.length) + slotIds.length) % slotIds.length;
    const next = this.findNextFireableAlternatingIndex(group, current);
    if (next !== undefined) group.alternatingIndex = next;
    group.alternatingElapsed = 0;
  }

  /** 原版时间片长度：单门炮的完整射击周期除以炮数与实时 RoF 倍率 (包含 source chargeTime)。 */
  private getAlternatingSlice(mount: WeaponMount, weaponCount: number, ship: Ship): number {
    const count = Math.max(1, weaponCount);
    const spec = mount.spec;
    let cycle: number;
    if (spec.isBeam) {
      // burstduration + burstcooldown + chargeup + chargedown，原版缺省 3 秒
      cycle =
        (spec.beamDuration ?? 0) +
        (spec.beamBurstDelay ?? 0) +
        (spec.beamSourceChargeupTime ?? 0) +
        (spec.beamSourceChargedownTime ?? 0);
      if (!(cycle > 0)) cycle = 3.0;
    } else {
      const burstSize = spec.burstSize && Number.isFinite(spec.burstSize) ? spec.burstSize : 1;
      // 原版对超大弹数 (>50) 直接使用 3 秒固定时间片
      cycle =
        burstSize > 50
          ? 3.0
          : Math.max(0, burstSize - 1) * (spec.burstDelay ?? 0) + spec.refireDelay + (spec.chargeTime ?? 0);
    }
    return Math.max(1 / 240, cycle / count / Math.max(.001, ship.system.getWeaponRateOfFireMultiplier(spec.weaponType)));
  }

  /** Native projectile controller ship/A/if.java and settings.json minRefireDelay=0.05.
   * Burst beams use RoF only for cooldown; their charge/ACTIVE/chargedown and flux
   * stay on real time (ship/A/oooo_1.java). Continuous beams are not accelerated.
   */
  private weaponClockRate(mount: WeaponMount, ship: Ship): number {
    const rate = Math.max(.001, ship.system.getWeaponRateOfFireMultiplier(mount.spec.weaponType));
    if (mount.spec.isBeam) return mount.spec.beamVisualMode === 'BURST' ? rate : 1;
    if (rate <= 1) return rate;
    const sourceDelay = mount.burstRemaining > 0
      ? mount.spec.burstDelay ?? 0
      : mount.spec.refireDelay + (mount.spec.chargeTime ?? 0);
    return sourceDelay / rate < .05 ? Math.max(1, sourceDelay / .05) : rate;
  }

  private weaponFluxPerShot(mount: WeaponMount, ship: Ship): number {
    return mount.spec.fluxPerShot * ship.system.getWeaponFluxCostMultiplier(mount.spec.weaponType);
  }

  private requestWeaponFire(
    mount: WeaponMount,
    ship: Ship,
    spawnProjectile: (p: Projectile) => void,
    spawnBeam: (b: Beam) => void,
    spawnMuzzleFlash?: (pos: Vector2, angleRad: number, size: number, color: [number, number, number], spec?: MuzzleFlashSpec, shipVel?: Vector2, launcherSmokeSpec?: LauncherSmokeSpec) => void
  ): boolean {
    if ((mount.reloadDelayRemaining ?? 0) > 0 || !ship.system.canFireWeapon(mount)) return false;
    mount.triggerHeld = true;

    if (mount.spec.isBeam) {
      if (mount.firingState !== 'IDLE' || mount.cooldownTimer > 0) return false;
      if (Number.isFinite(mount.ammo) && mount.ammo < 1) return false;
      if (Number.isFinite(mount.ammo)) mount.ammo = Math.max(0, mount.ammo - 1);
      mount.firingCycleId++;
      if (mount.spec.soundIntroKey) sound.play(mount.spec.soundIntroKey, ship.isPlayer ? .85 : .45);
      const chargeup = mount.spec.beamSourceChargeupTime ?? 0;
      if (chargeup > 0) {
        mount.firingState = 'CHARGING';
        mount.firingStateTimer = chargeup;
        mount.glowAlpha = 0;
        if (!mount.spec.beamFireOnlyOnFullCharge) this.emitBeamState(mount, ship, spawnBeam, true, chargeup);
      } else {
        this.activateBeam(mount, ship, spawnProjectile, spawnBeam, spawnMuzzleFlash);
      }
      return true;
    }

    if (mount.firingState !== 'IDLE' || mount.burstRemaining > 0 || mount.cooldownTimer > 0) return false;
    if (Number.isFinite(mount.ammo) && mount.ammo < 1) return false;
    const cost = this.weaponFluxPerShot(mount, ship) * (mount.spec.interruptibleBurst ? 1 : Math.max(1, mount.spec.burstSize ?? 1));
    if (ship.flux.maxFlux - ship.flux.totalFlux < cost) return false;
    mount.cycleTargetShipId = mount.fireControl ? mount.fireControlTargetShipId : ship.currentTargetShip?.id;
    mount.cycleTargetProjectileId = mount.fireControl ? mount.fireControlTargetProjectileId : undefined;
    mount.firingState = 'CHARGING';
    mount.firingStateTimer = mount.spec.chargeTime ?? 0;

    return true;
  }

  private activateBeam(
    mount: WeaponMount,
    ship: Ship,
    spawnProjectile: (p: Projectile) => void,
    spawnBeam: (b: Beam) => void,
    spawnMuzzleFlash?: (pos: Vector2, angleRad: number, size: number, color: [number, number, number], spec?: MuzzleFlashSpec, shipVel?: Vector2, launcherSmokeSpec?: LauncherSmokeSpec) => void
  ): void {
    mount.firingState = 'ACTIVE';
    mount.firingStateTimer = mount.spec.beamVisualMode === 'BURST'
      ? Math.max(0.001, mount.spec.beamDuration ?? 0.001)
      : Number.POSITIVE_INFINITY;
    this.fireWeapon(mount, ship, spawnProjectile, spawnBeam, spawnMuzzleFlash);
  }

  private emitBeamState(
    mount: WeaponMount,
    ship: Ship,
    spawnBeam: (b: Beam) => void,
    damageActive: boolean,
    duration: number
  ): void {
    const mountOffset = mount.relativePos.clone().rotate(ship.facingRad);
    const firePos = ship.pos.clone().add(mountOffset);
    spawnBeam({
      id: this.random.next(),
      sourceShipId: ship.id,
      slotId: mount.slotId,
      isPlayer: ship.isPlayer, teamId: ship.teamId,
      specId: mount.spec.id,
      startPos: firePos,
      endPos: firePos.clone(),
      // Charging and chargedown share the real ray and brightness-squared damage clock.
      damagePerSec: mount.spec.damagePerSecond * ship.crDamageDealtMultiplier * ship.getWeaponDamageMultiplier(mount.spec.weaponType) * ship.system.getBeamDamageMultiplier(),
      baseDamagePerSec: mount.spec.damagePerSecond,
      empPerSec: mount.spec.empPerSecond,
      baseEmpPerSec: mount.spec.empPerSecond,
      damageType: mount.spec.type,
      color: mount.spec.color,
      duration: Math.max(0.001, duration),
      maxDuration: Math.max(0.001, duration),
      damageActive,
      firingCycleId: mount.firingCycleId,
      width: mount.spec.beamWidth ?? 12,
      visualMode: mount.spec.beamVisualMode,
      beamEffect: mount.spec.beamEffect,
      elapsedTime: 0,
      textureType: mount.spec.textureType,
      textureScrollSpeed: mount.spec.textureScrollSpeed,
      pixelsPerTexel: mount.spec.pixelsPerTexel,
      fringeColor: mount.spec.fringeColor,
      coreColor: mount.spec.coreColor,
      glowColor: mount.spec.glowColor,
      hitGlowRadius: mount.spec.hitGlowRadius,
      hitGlowBrightenDuration: mount.spec.hitGlowBrightenDuration,
      useGlowColorForHitGlow: mount.spec.useGlowColorForHitGlow,
      fringeScrollSpeedMult: mount.spec.fringeScrollSpeedMult,
      coreWidthMult: mount.spec.coreWidthMult,
      darkCore: mount.spec.darkCore,
      darkFringeIter: mount.spec.darkFringeIter,
      darkCoreIter: mount.spec.darkCoreIter
    });
  }

  private enterBeamChargedown(mount: WeaponMount, ship: Ship, spawnBeam: (b: Beam) => void, hadActiveBeam: boolean): void {
    const chargedown = mount.spec.beamSourceChargedownTime ?? 0;
    const level = mount.firingState === 'CHARGING'
      ? Math.max(0, Math.min(1, 1 - mount.firingStateTimer / Math.max(0.001, mount.spec.beamSourceChargeupTime ?? 0))) : 1;
    const remaining = chargedown * level;
    if ((hadActiveBeam || !mount.spec.beamFireOnlyOnFullCharge) && remaining > 0) {
      this.emitBeamState(mount, ship, spawnBeam, true, remaining);
    }
    if (remaining > 0) {
      mount.firingState = 'CHARGEDOWN';
      mount.firingStateTimer = remaining;
    } else {
      mount.firingState = 'IDLE';
      mount.firingStateTimer = 0;
      mount.cooldownTimer = Math.max(mount.cooldownTimer, mount.spec.beamBurstDelay ?? mount.spec.refireDelay);
    }
  }

  private advanceWeaponLifecycle(
    dt: number,
    mount: WeaponMount,
    ship: Ship,
    canShipFire: boolean,
    spawnProjectile: (p: Projectile) => void,
    spawnBeam: (b: Beam) => void,
    spawnMuzzleFlash?: (pos: Vector2, angleRad: number, size: number, color: [number, number, number], spec?: MuzzleFlashSpec, shipVel?: Vector2, launcherSmokeSpec?: LauncherSmokeSpec) => void
  ): void {
    if (!mount.spec.isBeam && mount.firingState === 'CHARGING') {
      if (!canShipFire || (!mount.triggerHeld && !mount.spec.autoCharge)) {
        mount.firingState = 'IDLE';
        mount.firingStateTimer = 0;
        return;
      }
      mount.firingStateTimer -= dt;
      mount.glowAlpha = 1 - Math.max(0, mount.firingStateTimer) / Math.max(.001, mount.spec.chargeTime ?? 0);
      if (mount.firingStateTimer > 1e-9) return;
      mount.firingState = 'IDLE';
      const count = Math.max(1, Math.floor(mount.spec.burstSize ?? 1));
      if (!mount.spec.interruptibleBurst && count > 1) {
        const cost = this.weaponFluxPerShot(mount, ship) * count;
        if (ship.flux.maxFlux - ship.flux.totalFlux < cost) return;
        ship.flux.increaseFlux(cost, false);
        mount.burstFluxReserved = true; // Native B reserves noninterruptible bursts as a whole.
      }
      if (!this.fireWeapon(mount, ship, spawnProjectile, spawnBeam, spawnMuzzleFlash)) {
        mount.burstFluxReserved = false;
        return;
      }
      mount.burstRemaining = count - 1;
      if (count > 1) mount.burstTimer = mount.spec.burstDelay ?? 0;
      else mount.cooldownTimer = mount.spec.refireDelay;
      return; // Do not advance a freshly fired burst by this same dt a second time.
    }
    if (!mount.spec.isBeam && mount.burstRemaining > 0) {
      // A burst is not an autonomous entity: overload/venting/phase/system weapon
      // lock interrupts the remaining shots immediately.
      if (!canShipFire || (mount.spec.interruptibleBurst && !mount.triggerHeld)) {
        mount.burstRemaining = 0;
        mount.burstFluxReserved = false;
        mount.burstTimer = 0;
        mount.cooldownTimer = Math.max(mount.cooldownTimer, mount.spec.refireDelay);
        return;
      }

      mount.burstTimer -= dt;
      const delay = Math.max(0.0001, mount.spec.burstDelay ?? 0.0001);
      while (mount.burstRemaining > 0 && mount.burstTimer <= 1e-9) {
        if (!this.fireWeapon(mount, ship, spawnProjectile, spawnBeam, spawnMuzzleFlash)) {
          mount.burstRemaining = 0;
          mount.burstFluxReserved = false;
          mount.burstTimer = 0;
          mount.cooldownTimer = Math.max(mount.cooldownTimer, mount.spec.refireDelay);
          break;
        }
        mount.burstRemaining--;
        if (mount.burstRemaining === 0) mount.burstFluxReserved = false;
        if (mount.burstRemaining > 0) mount.burstTimer += delay;
        else mount.cooldownTimer = mount.spec.refireDelay;
      }
      return;
    }

    if (!mount.spec.isBeam) return;
    if (mount.firingState === 'CHARGING') {
      if ((!mount.triggerHeld && mount.spec.beamVisualMode !== 'BURST') || !canShipFire) {
        this.enterBeamChargedown(mount, ship, spawnBeam, false);
        return;
      }
      if (mount.spec.fluxPerSecond && !ship.flux.trySpendSoftFlux(mount.spec.fluxPerSecond * ship.system.getWeaponFluxCostMultiplier(mount.spec.weaponType) * dt)) {
        this.enterBeamChargedown(mount, ship, spawnBeam, true);
        return;
      }
      mount.firingStateTimer -= dt;
      const chargeup = Math.max(0.001, mount.spec.beamSourceChargeupTime ?? 0.001);
      mount.glowAlpha = Math.max(mount.glowAlpha, 1 - Math.max(0, mount.firingStateTimer) / chargeup);
      if (mount.firingStateTimer <= 0) this.activateBeam(mount, ship, spawnProjectile, spawnBeam, spawnMuzzleFlash);
      return;
    }

    if (mount.firingState === 'ACTIVE') {
      const isBurstBeam = mount.spec.beamVisualMode === 'BURST';
      // 光束射击循环不是独立实体：母舰过载/排散/相位/堡垒护盾锁定会立即打断它
      // (vanilla stoppedFiring() 在 isOverloadedOrVenting 时直接销毁光束)，
      // 否则速子长矛这类爆发光束会在母舰过载期间继续倾泻伤害。
      if (!canShipFire) {
        this.enterBeamChargedown(mount, ship, spawnBeam, true);
        return;
      }
      if (!isBurstBeam && !mount.triggerHeld) {
        this.enterBeamChargedown(mount, ship, spawnBeam, true);
        return;
      }
      if (mount.spec.fluxPerSecond && !ship.flux.trySpendSoftFlux(mount.spec.fluxPerSecond * ship.system.getWeaponFluxCostMultiplier(mount.spec.weaponType) * dt)) {
        this.enterBeamChargedown(mount, ship, spawnBeam, true);
        return;
      }
      if (isBurstBeam) {
        mount.firingStateTimer -= dt;
        if (mount.firingStateTimer <= 0) this.enterBeamChargedown(mount, ship, spawnBeam, true);
      }
      return;
    }

    if (mount.firingState === 'CHARGEDOWN') {
      mount.firingStateTimer -= dt;
      const chargedown = Math.max(0.001, mount.spec.beamSourceChargedownTime ?? 0.001);
      mount.glowAlpha = Math.min(mount.glowAlpha, Math.max(0, mount.firingStateTimer) / chargedown);
      if (mount.firingStateTimer <= 0) {
        mount.firingState = 'IDLE';
        mount.firingStateTimer = 0;
        mount.cooldownTimer = Math.max(mount.cooldownTimer, mount.spec.beamBurstDelay ?? mount.spec.refireDelay);
      }
    }
  }

  public fireWeapon(
    mount: WeaponMount,
    ship: Ship,
    spawnProjectile: (p: Projectile) => void,
    spawnBeam: (b: Beam) => void,
    spawnMuzzleFlash?: (pos: Vector2, angleRad: number, size: number, color: [number, number, number], spec?: MuzzleFlashSpec, shipVel?: Vector2, launcherSmokeSpec?: LauncherSmokeSpec) => void
  ): boolean {
    if ((mount.reloadDelayRemaining ?? 0) > 0 || !ship.system.canFireWeapon(mount)) return false;
    // 开火必须校验剩余幅能容量 (vanilla com/fs/starfarer/combat/entities/ship/A/if.java:346
    // startedChargeup(): `getFluxAvailable() >= getFluxCostToFire()`，与弹药、过载/排散判定并列)。
    // 幅能不足时严禁产生任何副作用：不扣弹药、不产生后坐力/散布增长/枪口火焰/音效，也不生成弹丸。
    // 光束不受此限：其幅能按充能和 ACTIVE 时长以 fluxPerSecond 连续累积。
    if (
      !mount.spec.isBeam && !mount.burstFluxReserved &&
      mount.spec.fluxPerShot > 0 &&
      ship.flux.maxFlux - ship.flux.totalFlux < this.weaponFluxPerShot(mount, ship)
    ) {
      return false;
    }

    // 非光束有限弹药按“实际发射一发”扣除；无弹时不得产生任何发射副作用。
    if (!mount.spec.isBeam && Number.isFinite(mount.ammo)) {
      if (mount.ammo < 1) return false;
      mount.ammo = Math.max(0, mount.ammo - 1);
    }

    // 触发动态视觉后坐力与充能发光
    mount.recoil = 1.0;
    mount.glowAlpha = 1.0;

    // 累积散布与计算实际开火偏角 (严格对齐 weapon_data.csv: min/max spread, spread/shot)
    const minSpr = mount.spec.minSpread || 0;
    const maxSpr = Math.max(minSpr, (mount.spec.maxSpread || minSpr) * ship.system.getRecoilMultiplier());
    const sprPerShot = (mount.spec.spreadPerShot || 0) * ship.system.getRecoilMultiplier();
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

    // 实体弹药按发射次数产生幅能；光束按充能和 ACTIVE 时间连续产生 source energy/second 幅能。
    if (!mount.spec.isBeam && !mount.burstFluxReserved && mount.spec.fluxPerShot > 0) ship.flux.increaseFlux(this.weaponFluxPerShot(mount, ship), false);

    // 播放官方真实音效
    if (mount.spec.soundKey && !mount.spec.soundLoopKey && !mount.spec.soundIntroKey) {
      sound.play(mount.spec.soundKey, ship.isPlayer ? 0.85 : 0.45);
    }

    // 激发枪口火焰 (1:1 官方原版粒子暴风 _class.o00000 & SmoothParticle.java)
    if (spawnMuzzleFlash) {
      if (mount.spec.launcherSmokeSpec) {
        spawnMuzzleFlash(
          firePos,
          fireAngleRad,
          mount.spec.muzzleFlashSize || 25,
          [mount.spec.launcherSmokeSpec.particleColor[0], mount.spec.launcherSmokeSpec.particleColor[1], mount.spec.launcherSmokeSpec.particleColor[2]],
          undefined,
          ship.vel,
          mount.spec.launcherSmokeSpec
        );
      } else if (mount.spec.muzzleFlashSpec) {
        spawnMuzzleFlash(
          firePos,
          fireAngleRad,
          mount.spec.muzzleFlashSize || 25,
          [mount.spec.muzzleFlashSpec.particleColor[0], mount.spec.muzzleFlashSpec.particleColor[1], mount.spec.muzzleFlashSpec.particleColor[2]],
          mount.spec.muzzleFlashSpec,
          ship.vel
        );
      } else if (mount.spec.muzzleFlashColor && !mount.spec.isBeam) {
        spawnMuzzleFlash(
          firePos,
          fireAngleRad,
          mount.spec.muzzleFlashSize || 25,
          mount.spec.muzzleFlashColor
        );
      }
    }

    const effectiveRange = combatWeaponRange(ship, mount.spec);

    if (mount.spec.isBeam) {
      // 每个 beam firing cycle 只创建一个实体；持续光束由挂点 ACTIVE 状态维持。
      // A new ray starts at zero length; the handler grows its collision front.
      const endPos = firePos.clone();
      const beamDuration = mount.spec.beamVisualMode === 'SUSTAINED'
        ? Number.MAX_SAFE_INTEGER
        : Math.max(0.001, mount.spec.beamDuration ?? 0.001);
      mount.glowAlpha = 1.0;
      spawnBeam({
        id: this.random.next(),
        sourceShipId: ship.id,
        slotId: mount.slotId,
        isPlayer: ship.isPlayer, teamId: ship.teamId,
        specId: mount.spec.id,
        startPos: firePos,
        endPos: endPos,
        barrelOffset: { x: offX, y: offY },
        // 武器输出伤害按母舰战备值修正 (CRPluginImpl.getDamageChangePercent)
        damagePerSec: mount.spec.damagePerSecond * ship.crDamageDealtMultiplier * ship.getWeaponDamageMultiplier(mount.spec.weaponType) * ship.system.getBeamDamageMultiplier(),
        baseDamagePerSec: mount.spec.damagePerSecond,
        empPerSec: mount.spec.empPerSecond,
        baseEmpPerSec: mount.spec.empPerSecond,
        damageType: mount.spec.type,
        color: mount.spec.color,
        duration: beamDuration,
        maxDuration: beamDuration,
        damageActive: true,
        firingCycleId: mount.firingCycleId,
        hasRecordedHit: false,
        width: mount.spec.beamWidth ?? 12,
        visualMode: mount.spec.beamVisualMode,
        beamEffect: mount.spec.beamEffect,
        elapsedTime: 0,
        textureType: mount.spec.textureType,
        textureScrollSpeed: mount.spec.textureScrollSpeed,
        pixelsPerTexel: mount.spec.pixelsPerTexel,
        fringeColor: mount.spec.fringeColor,
        coreColor: mount.spec.coreColor,
        glowColor: mount.spec.glowColor,
        hitGlowRadius: mount.spec.hitGlowRadius,
        hitGlowBrightenDuration: mount.spec.hitGlowBrightenDuration,
        useGlowColorForHitGlow: mount.spec.useGlowColorForHitGlow,
        fringeScrollSpeedMult: mount.spec.fringeScrollSpeedMult,
        coreWidthMult: mount.spec.coreWidthMult,
        darkCore: mount.spec.darkCore,
        darkFringeIter: mount.spec.darkFringeIter,
        darkCoreIter: mount.spec.darkCoreIter
      });
    } else {
      // 实体弹药使用弹速；导弹则严格区分发射初速与发动机额定极速。
      const projectileLaunchSpeed = (mount.spec.isRocket || mount.spec.spawnType === 'MISSILE')
        ? (mount.spec.launchSpeed ?? mount.spec.projSpeed)
        : combatProjectileSpeed(ship, mount.spec);
      const projVel = Vector2.fromAngle(fireAngleRad, projectileLaunchSpeed).add(ship.vel);
      const projectile: Projectile = {
        id: this.random.next(),
        sourceShipId: ship.id,
        slotId: mount.slotId,
        isPlayer: ship.isPlayer, teamId: ship.teamId,
        specId: mount.spec.id,
        pos: firePos.clone(),
        prevPos: firePos.clone(),
        ballisticTail: mount.spec.spawnType === 'BALLISTIC' ? firePos.clone() : undefined,
        prevBallisticTail: mount.spec.spawnType === 'BALLISTIC' ? firePos.clone() : undefined,
        vel: projVel,
        // 武器输出伤害按母舰战备值修正 (CRPluginImpl.getDamageChangePercent)
        baseDamage: mount.spec.damagePerShot,
        sourceDamageMultiplier: ship.crDamageDealtMultiplier * ship.getWeaponDamageMultiplier(mount.spec.weaponType),
        sourceWeaponType: mount.spec.weaponType,
        spawnLocation: firePos.clone(),
        empDamage: mount.spec.empPerShot ?? 0,
        damage: mount.spec.damagePerShot * ship.crDamageDealtMultiplier * ship.getWeaponDamageMultiplier(mount.spec.weaponType),
        damageType: mount.spec.type,
        onHitEffect: mount.spec.onHitEffect,
        passThroughMissiles: mount.spec.passThroughMissiles,
        passThroughFighters: mount.spec.passThroughFighters,
        passThroughFightersOnlyWhenDestroyed: mount.spec.passThroughFightersOnlyWhenDestroyed,
        radius: mount.spec.projRadius,
        rangeRemaining: effectiveRange,
        totalRange: effectiveRange,
        elapsedTime: 0,
        color: mount.spec.color,
        spawnType: mount.spec.spawnType,
        renderTargetIndicator: mount.spec.renderTargetIndicator,
        visualSpawnType: mount.spec.visualSpawnType,
        textureType: mount.spec.textureType,
        textureScrollSpeed: mount.spec.textureScrollSpeed,
        fadeTime: mount.spec.fadeTime,
        pixelsPerTexel: mount.spec.pixelsPerTexel,
        fringeColor: mount.spec.fringeColor,
        coreColor: mount.spec.coreColor,
        glowColor: mount.spec.glowColor,
        hitGlowRadius: mount.spec.hitGlowRadius,
        glowRadius: mount.spec.glowRadius,
        coreWidthMult: mount.spec.coreWidthMult,
        movingRayMoveSpeed: mount.spec.spawnType === 'BALLISTIC_AS_BEAM' ? combatProjectileSpeed(ship, mount.spec) : undefined,
        projSpriteUrl: mount.spec.projSpriteUrl,
        projLength: mount.spec.projLength,
        projWidth: mount.spec.projWidth,
        barrelOffset: { x: offX, y: offY },
        isRocket: mount.spec.isRocket || mount.spec.spawnType === 'MISSILE',
        isGuided: mount.spec.isGuided,
        eccmChance: mount.spec.eccmChanceBonus,
        guidanceBonus: mount.spec.missileGuidanceBonus,
        targetShipId: mount.cycleTargetShipId,
        targetProjectileId: mount.cycleTargetProjectileId,
        facingRad: fireAngleRad,
        flightTimeRemaining: mount.spec.flightTime === undefined ? undefined : mount.spec.flightTime * (1 - ship.ecmRangePenalty / 100),
        maxFlightTime: mount.spec.flightTime === undefined ? undefined : mount.spec.flightTime * (1 - ship.ecmRangePenalty / 100),
        armingTimeRemaining: mount.spec.armingTime,
        turnVelocityRad: 0,
        engineAcceleration: mount.spec.engineAcceleration,
        missileDeceleration: mount.spec.missileDeceleration,
        maxSpeed: mount.spec.maxSpeed ?? (mount.spec.isRocket || mount.spec.spawnType === 'MISSILE' ? mount.spec.projSpeed : undefined),
        maxTurnRate: mount.spec.maxTurnRate,
        maxTurnAcceleration: mount.spec.maxTurnAcceleration,
        engineFlameColor: mount.spec.engineFlameColor,
        missileEngineVisualSpec: mount.spec.missileEngineVisualSpec,
        missileTrailSpec: mount.spec.missileTrailSpec,
        missileExplosionVisualSpec: mount.spec.missileExplosionVisualSpec,
        projectileExplosionSpec: mount.spec.projectileExplosionSpec,
        isTwoStage: mount.spec.isTwoStage,
        mirv: mount.spec.mirv,
        proximityFuse: mount.spec.proximityFuse,
        hitpoints: mount.spec.missileHp || (mount.spec.isRocket || mount.spec.spawnType === 'MISSILE' ? 100 : undefined),
        maxHitpoints: mount.spec.missileHp || (mount.spec.isRocket || mount.spec.spawnType === 'MISSILE' ? 100 : undefined)
      };
      initializeSourceProjectile(projectile, combatProjectileSpeed(ship, mount.spec), ship.vel);
      spawnProjectile(bindProjectileSource(projectile, ship));
    }
    return true;
  }
}
