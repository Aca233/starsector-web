import { Vector2 } from '../math/Vector2';
import { ArmorGrid } from './ArmorGrid';
import { FluxTracker } from './FluxTracker';
import { Shield } from './Shield';
import { ShipSystem } from './ShipSystem';
import { Projectile, Beam, WeaponMount, WeaponGroup, LauncherSmokeSpec, MuzzleFlashSpec } from './Weapon';
import { ShipSpec } from '../modding/ModManager';
import { sound } from '../audio/SoundManager';
import { ShipWeaponControlSystem } from './systems/ShipWeaponControlSystem';
import { SimulationRandom } from './SimulationRandom';

export interface ScorchMark {
  localPos: Vector2;
  intensity: number;
  size: number;
  life: number;
  maxLife: number;
}

export interface EngineStatus {
  isFlameout: boolean;
  flameoutTimer: number;
  currentThrust: number; // 当前实际物理平滑推力 [0.0, 2.5]
  prevThrust: number;    // 上一物理帧推力 (用于渲染亚帧平滑插值)
}

export interface PhaseGhost {
  pos: Vector2;
  facingRad: number;
  alpha: number;
  life: number;
  maxLife: number;
}

export class Ship {
  public id: string;
  public spec: ShipSpec;
  public isPlayer: boolean;

  // 物理与刚体 (支持亚帧插值)
  public pos: Vector2;
  public prevPos: Vector2;
  public vel: Vector2;
  public facingRad: number;
  public prevFacingRad: number;
  public angularVelRad: number;

  // 核心机体状态
  public hullHp: number;
  public armor: ArmorGrid;
  public flux: FluxTracker;
  public shield: Shield;
  public system: ShipSystem;
  public readonly weaponControl: ShipWeaponControlSystem;
  private readonly random: SimulationRandom;

  // --------------------------------------------------------------------------
  // 向后兼容 Getters / Setters (保证 UI、Renderer 和 Hooks 零修改平滑过渡)
  // --------------------------------------------------------------------------
  public get weapons(): WeaponMount[] { return this.weaponControl.weapons; }
  public set weapons(val: WeaponMount[]) { this.weaponControl.weapons = val; }
  public get weaponGroups(): WeaponGroup[] { return this.weaponControl.weaponGroups; }
  public set weaponGroups(val: WeaponGroup[]) { this.weaponControl.weaponGroups = val; }
  public get selectedGroupIndex(): number { return this.weaponControl.selectedGroupIndex; }
  public set selectedGroupIndex(val: number) { this.weaponControl.selectedGroupIndex = val; }
  public get justDisabledMounts(): WeaponMount[] { return this.weaponControl.justDisabledMounts; }
  public set justDisabledMounts(val: WeaponMount[]) { this.weaponControl.justDisabledMounts = val; }
  public get justRepairedMounts(): WeaponMount[] { return this.weaponControl.justRepairedMounts; }
  public set justRepairedMounts(val: WeaponMount[]) { this.weaponControl.justRepairedMounts = val; }

  // 发动机喷口独立健康与熄火状态 (Engine Flameout)
  public engineStatuses: EngineStatus[] = [];

  // 相位潜航时空残影 (Phase Cloak Ghost Echoes)
  public phaseGhosts: PhaseGhost[] = [];
  public phaseGhostTimer = 0;

  // 星云流体阻力减速系数
  public terrainSpeedMult = 1.0;

  // 装甲灼烧痕迹 (Armor Thermal Scorch Decals)
  public scorchMarks: ScorchMark[] = [];

  // 操纵指令输入
  public throttle = 0; // -0.5 (倒车) ~ 1.0 (前进)
  public strafeInput = 0; // -1.0 (向左侧向平移) ~ 1.0 (向右侧向平移)
  public turnInput = 0; // -1.0 (左转) ~ 1.0 (右转)
  public aimTargetWorld: Vector2 = new Vector2();
  public isFiringMain = false;
  
  public isDead = false;
  public prevOverloaded = false;
  public prevVenting = false;
  public currentTargetShip: Ship | null = null;

  // 1:1 原版战备值与峰值性能时钟 (Combat Readiness & Peak Performance Time)
  public shipName: string;
  public currentCR = 0.70; // 标准 70% 战备值
  public peakPerformanceRemaining: number;

  constructor(
    id: string,
    spec: ShipSpec,
    isPlayer = false,
    initialPos = new Vector2(),
    initialFacingRad = 0,
    random = new SimulationRandom()
  ) {
    this.id = id;
    this.spec = spec;
    this.isPlayer = isPlayer;
    this.random = random;
    this.weaponControl = new ShipWeaponControlSystem(random);
    this.shipName = isPlayer
      ? (spec.id === 'onslaught' ? 'TTS HEGEMON' : spec.id === 'doom' ? 'TTS HARBINGER' : 'TTS INVINCIBLE')
      : (spec.id === 'paragon' ? 'ISS RADIANCE' : 'ISS TRI-TACHYON');
    this.peakPerformanceRemaining = spec.peakCRSec ?? 720;

    this.pos = initialPos.clone();
    this.prevPos = initialPos.clone();
    this.vel = new Vector2();
    this.facingRad = initialFacingRad;
    this.prevFacingRad = initialFacingRad;
    this.angularVelRad = 0;

    this.hullHp = spec.hitpoints;
    this.armor = new ArmorGrid(
      spec.armorCols,
      spec.armorRows,
      spec.collisionRadius / (spec.armorCols / 2),
      spec.collisionRadius / (spec.armorRows / 2),
      spec.armorRating
    );
    const inferredHullSize = spec.collisionRadius <= 50
      ? 'FIGHTER'
      : spec.collisionRadius <= 90
      ? 'FRIGATE'
      : spec.collisionRadius <= 140
      ? 'DESTROYER'
      : spec.collisionRadius <= 210
      ? 'CRUISER'
      : 'CAPITAL_SHIP';
    this.flux = new FluxTracker(spec.maxFlux, spec.fluxDissipation, spec.hullSize ?? inferredHullSize);
    this.shield = new Shield(
      spec.shieldType,
      spec.shieldArcDeg,
      spec.shieldRadius,
      spec.shieldEfficiency
    );
    this.system = new ShipSystem(spec.systemType);

    // 初始化挂点武器与武器编组
    this.weaponControl.init(spec, initialFacingRad);

    // 初始化各个独立发动机喷口健康与平滑推力状态
    if (spec.engineSlots && spec.engineSlots.length > 0) {
      this.engineStatuses = spec.engineSlots.map(() => ({
        isFlameout: false,
        flameoutTimer: 0,
        currentThrust: 0,
        prevThrust: 0
      }));
    }
  }

  public interpolatedPos(alpha: number): Vector2 {
    if (!this.prevPos) return this.pos.clone();
    return Vector2.lerp(this.prevPos, this.pos, alpha);
  }

  public interpolatedFacing(alpha: number): number {
    if (this.prevFacingRad === undefined) return this.facingRad;
    let dAngle = this.facingRad - this.prevFacingRad;
    while (dAngle > Math.PI) dAngle -= Math.PI * 2;
    while (dAngle < -Math.PI) dAngle += Math.PI * 2;
    return this.prevFacingRad + dAngle * alpha;
  }

  /**
   * 计算护盾物理与视觉旋转锚点中心 (1:1 G.java:333-335: shieldPivot.computePosition)
   */
  public getShieldCenter(shipPos: Vector2 = this.pos, shipFacingRad: number = this.facingRad): Vector2 {
    const cx = this.spec.shieldCenterX || 0;
    const cy = this.spec.shieldCenterY || 0;
    if (cx === 0 && cy === 0) return shipPos.clone();
    return shipPos.clone().add(new Vector2(cx, cy).rotate(shipFacingRad));
  }

  /** Use the same offset shield center for every simulation-side arc test. */
  public isShieldPointBlocked(hitWorldPos: Vector2): boolean {
    const shieldCenter = this.getShieldCenter();
    return this.shield.isHitBlocked(shieldCenter, hitWorldPos, this.facingRad);
  }

  public triggerEngineFlameout(engineIndex?: number) {
    if (this.engineStatuses.length === 0) return;
    if (engineIndex !== undefined && this.engineStatuses[engineIndex]) {
      if (!this.engineStatuses[engineIndex].isFlameout) {
        this.engineStatuses[engineIndex].isFlameout = true;
        this.engineStatuses[engineIndex].flameoutTimer = 6.0 + this.random.next() * 4.0;
        sound.play('engine_flameout', 0.9);
        if (this.isPlayer) {
          sound.play('flameout_alarm', 0.85);
        }
      }
    } else {
      const activeEngines = this.engineStatuses
        .map((e, idx) => ({ e, idx }))
        .filter(item => !item.e.isFlameout);
      if (activeEngines.length > 0) {
        const picked = activeEngines[Math.floor(this.random.next() * activeEngines.length)];
        picked.e.isFlameout = true;
        picked.e.flameoutTimer = 6.0 + this.random.next() * 4.0;
        sound.play('engine_flameout', 0.9);
        if (this.isPlayer) {
          sound.play('flameout_alarm', 0.85);
        }
      }
    }
  }

  public getFlameoutRatio(): number {
    if (this.engineStatuses.length === 0) return 0;
    const flamed = this.engineStatuses.filter(e => e.isFlameout).length;
    return flamed / this.engineStatuses.length;
  }

  public selectWeaponGroup(index: number) {
    this.weaponControl.selectGroup(index);
  }

  public toggleAutofire(groupIndex: number) {
    this.weaponControl.toggleAutofire(groupIndex);
  }

  public toggleFireMode(groupIndex: number) {
    this.weaponControl.toggleFireMode(groupIndex);
  }

  // 挂点受创损坏与故障判定 (严格对齐 WeaponAPI.java 与 EMP 瘫痪算法)
  public damageWeaponMount(localImpactPos: Vector2, damage: number, isEmp: boolean): WeaponMount | null {
    return this.weaponControl.damageMount(localImpactPos, damage, isEmp);
  }

  /**
   * 60Hz 逻辑步长更新
   */
  public get isPhased(): boolean {
    return this.shield.isPhased;
  }

  /**
   * 判断当前是否允许开启护盾 (严格对齐 D.java: canUseShields / ship_systems.csv noShield).
   * Burn Drive 的 IN/ACTIVE/OUT 全阶段都带 noShield；冷却阶段则允许重新展开护盾。
   */
  public canUseShields(): boolean {
    const systemBlocksShield = this.system.type === 'BURN_DRIVE' && this.system.isActive;
    return !systemBlocksShield && !this.flux.isOverloaded && !this.flux.isVenting && !this.isDead;
  }

  private lowerShieldWithFeedback(): boolean {
    if (!this.shield.isActive) return false;
    this.shield.setActive(false);
    if (this.shield.type === 'PHASE') sound.play('phase_deactivate', 0.9);
    else sound.play('shield_down', 0.7);
    return true;
  }

  /**
   * 启动主动幅能排散 (严格对齐 D.java: ventFlux & Ship.java: notifyVentingStarted)
   * 1. 立即取消护盾防护状态，但保留 currentArcDeg 让视觉按正常收拢速率退场
   * 2. 强制退出相位潜航与关闭战术系统
   * 3. 播放关盾音效与排散启动音效
   */
  public startVenting(): boolean {
    if (this.isDead || this.flux.isOverloaded || this.flux.isVenting || this.flux.totalFlux <= 5) {
      return false;
    }

    // 1. 取消防护但不清零当前展开弧度；Shield.update() 会完成收拢动画。
    this.lowerShieldWithFeedback();

    // 2. 强制解除战术技能 (堡垒护盾 / 冲刺推进)
    if (this.system.isActive) {
      this.system.deactivate();
    }

    // 3. 触发幅能排散状态
    const started = this.flux.startVenting();
    if (started) {
      sound.play('flux_vent', 0.9);
      sound.startLoop('flux_flush_loop', 0.65);
    }
    return started;
  }

  /**
   * 判定视野与战术测距内是否存在重要敌对主力舰 (1:1 com.fs.starfarer.combat.entities.Ship.areSignificantEnemiesInRange)
   */
  public areSignificantEnemiesInRange(range = 2500, enemy?: Ship | null): boolean {
    const target = enemy || this.currentTargetShip;
    if (!target || target.isDead) return false;
    return this.pos.distanceTo(target.pos) <= range;
  }

  public update(
    dt: number,
    targetShip: Ship | null,
    spawnProjectile: (p: Projectile) => void,
    spawnBeam: (b: Beam) => void,
    spawnMuzzleFlash?: (pos: Vector2, angleRad: number, size: number, color: [number, number, number], spec?: MuzzleFlashSpec, shipVel?: Vector2, launcherSmokeSpec?: LauncherSmokeSpec) => void
  ) {
    if (this.isDead) return;

    // 记录上一物理帧状态，用于渲染亚帧平滑插值
    this.prevPos.copy(this.pos);
    this.prevFacingRad = this.facingRad;
    this.currentTargetShip = targetShip || null;

    // 战备值与峰值性能时钟推进 (1:1 RepairTracker.java & C.java)
    if (this.spec.peakCRSec && this.spec.peakCRSec > 0) {
      if (this.areSignificantEnemiesInRange(2500, targetShip)) {
        if (this.peakPerformanceRemaining > 0) {
          this.peakPerformanceRemaining = Math.max(0, this.peakPerformanceRemaining - dt);
        } else {
          const lossRate = (this.spec.crLossPerSec ?? 0.25) * 0.01;
          this.currentCR = Math.max(0, this.currentCR - lossRate * dt);
        }
      }
    }

    for (const eng of this.engineStatuses) {
      eng.prevThrust = eng.currentThrust;
    }

    // 相位时钟膨胀 (严格对齐 PhaseCloakStats.java: 3x 主观战术时钟加速)
    const effectiveDt = this.isPhased ? dt * 3.0 : dt;

    // 1. 更新战术技能与幅能
    this.system.update(effectiveDt);

    // 严禁过载或主动排散时开启/保持系统，或在全发动机熄火时继续冲刺
    if ((this.flux.isOverloaded || this.flux.isVenting) && this.system.isActive) {
      this.system.deactivate();
    }
    if (this.system.isActive && this.system.type === 'BURN_DRIVE' && this.getFlameoutRatio() >= 1.0) {
      this.system.deactivate();
    }

    // ship_systems.csv marks Burn Drive as noShield for its entire applied IN/ACTIVE/OUT lifecycle.
    // noShield 立即取消碰撞防护，但视觉仍通过 currentArcDeg 平滑收拢。
    if (this.system.isActive && this.system.type === 'BURN_DRIVE' && this.shield.isActive) {
      this.lowerShieldWithFeedback();
    }

    // 严禁过载或排散时使用护盾；同样保留视觉收拢阶段，避免一帧消失。
    if ((this.flux.isOverloaded || this.flux.isVenting) && this.shield.isActive) {
      this.lowerShieldWithFeedback();
    }
    
    // 护盾维持能耗 (堡垒护盾激活时普通 shield upkeep 为 0，对齐 FortressShieldStats.java)
    if (this.shield.isActive && !this.flux.isOverloaded && !this.flux.isVenting) {
      const upkeepMult = this.system.getShieldUpkeepMultiplier();
      this.flux.increaseFlux(this.shield.upkeepRate * upkeepMult * dt, false);
    }

    // Fortress Shield 自身另有 2.5% 基础幅能容量/秒的硬幅能成本；
    // 不能被上面的 shield-upkeep 归零逻辑一并吞掉。
    if (!this.flux.isOverloaded && !this.flux.isVenting) {
      const systemHardFluxPerSecond = this.system.getHardFluxPerSecond(this.spec.maxFlux);
      if (systemHardFluxPerSecond > 0) {
        this.flux.increaseFlux(systemHardFluxPerSecond * dt, true);
      }
    }
    this.flux.update(dt, this.shield.isActive);

    // 2. 物理运动推力与转向 (相位下机动时限加速)
    this.updateMotion(effectiveDt);

    // 3. 护盾朝向与展开
    const aimAngle = Math.atan2(this.aimTargetWorld.y - this.pos.y, this.aimTargetWorld.x - this.pos.x);
    this.shield.update(effectiveDt, this.facingRad, aimAngle);

    // 4. 武器挂点瞄准与开火解算
    this.weaponControl.update(effectiveDt, this, aimAngle, targetShip, spawnProjectile, spawnBeam, spawnMuzzleFlash);

    // 5. 更新装甲灼烧与热斑冷却
    this.updateScorchMarks(dt);

    // 6. 更新各个发动机熄火倒计时
    for (const eng of this.engineStatuses) {
      if (eng.isFlameout) {
        eng.flameoutTimer -= dt;
        if (eng.flameoutTimer <= 0) {
          eng.isFlameout = false;
          eng.flameoutTimer = 0;
        }
      }
    }

    // 7. 相位潜航时空残影记录与衰减
    if (this.isPhased) {
      this.phaseGhostTimer += dt;
      if (this.phaseGhostTimer >= 0.08) {
        this.phaseGhostTimer = 0;
        this.phaseGhosts.push({
          pos: this.pos.clone(),
          facingRad: this.facingRad,
          alpha: 0.65,
          life: 0.55,
          maxLife: 0.55
        });
      }
    }
    for (let i = this.phaseGhosts.length - 1; i >= 0; i--) {
      const g = this.phaseGhosts[i];
      g.life -= dt;
      g.alpha = Math.max(0, (g.life / g.maxLife) * 0.65);
      if (g.life <= 0) {
        this.phaseGhosts.splice(i, 1);
      }
    }
  }

  public addScorchMark(localPos: Vector2, damage: number) {
    if (damage < 25) return;
    const size = Math.min(45, 14 + Math.sqrt(damage) * 1.1);
    const life = 10.0;
    this.scorchMarks.push({
      localPos: localPos.clone(),
      intensity: 1.0,
      size,
      life,
      maxLife: life
    });
    // 限制最大贴花数以保持极高渲染帧率
    if (this.scorchMarks.length > 28) {
      this.scorchMarks.shift();
    }
  }

  private updateScorchMarks(dt: number) {
    for (let i = this.scorchMarks.length - 1; i >= 0; i--) {
      const s = this.scorchMarks[i];
      s.life -= dt;
      s.intensity = Math.max(0, s.life / s.maxLife);
      if (s.life <= 0) {
        this.scorchMarks.splice(i, 1);
      }
    }
  }

  private updateMotion(dt: number) {
    // 引擎健康度与星云流体阻尼系数 (发动机全灭时机动损失 70%)
    const flameoutRatio = this.getFlameoutRatio();
    const engineMult = Math.max(0.18, 1.0 - flameoutRatio * 0.72) * this.terrainSpeedMult;

    // 转向加减速
    const maxTurnRateRad = ((this.spec.maxTurnRateDeg * Math.PI) / 180) * engineMult;
    const turnAccelRad = ((this.spec.turnAccelerationDeg * Math.PI) / 180) * engineMult;

    // ship_systems.csv: Burn Drive has noTurning=true for the full system lifecycle.
    const burnDriveLocked = this.system.isActive && this.system.type === 'BURN_DRIVE';
    if (!burnDriveLocked && Math.abs(this.turnInput) > 0.01 && !this.flux.isOverloaded) {
      this.angularVelRad += this.turnInput * turnAccelRad * dt;
      this.angularVelRad = Math.max(-maxTurnRateRad, Math.min(maxTurnRateRad, this.angularVelRad));
    } else {
      // Existing angular momentum damps while turning input is unavailable.
      this.angularVelRad *= Math.pow(0.05, dt);
    }
    this.facingRad += this.angularVelRad * dt;

    // 前进推力与极速 (对齐 BurnDriveStats.java: stats.getMaxSpeed().modifyFlat(200f))
    let accel = (this.spec.acceleration + this.system.getAccelerationFlatBonus()) * engineMult;
    let maxSpeed = (this.spec.maxSpeed + this.system.getSpeedFlatBonus()) * engineMult;

    // 零幅能引擎推进加力 (严格对齐 settings.json: zeroFluxEngineBoost = 50)
    if (this.flux.isEngineBoostActive) {
      maxSpeed += 50 * engineMult;
      accel += 50 * engineMult;
    }

    // 冲刺推进强制全功率前进且禁止侧移 (对齐 burndrive.system: alwaysAccelerate)
    let curThrottle = this.throttle;
    let curStrafe = this.strafeInput;
    if (burnDriveLocked) {
      // burndrive.system: alwaysAccelerate=true, noStrafing=true, noAccel=true (manual input disabled).
      curThrottle = 1.0;
      curStrafe = 0;
    }

    const forward = Vector2.fromAngle(this.facingRad);
    const right = Vector2.fromAngle(this.facingRad + Math.PI / 2);

    // 姿态推进器侧向平移加速度 (Maneuvering Thrusters: 85% 前向推力)
    const strafeAccel = accel * 0.85;

    let hasThrust = false;
    if (Math.abs(curThrottle) > 0.01) {
      this.vel.addScaled(forward, curThrottle * accel * dt);
      hasThrust = true;
    }
    if (Math.abs(curStrafe) > 0.01) {
      this.vel.addScaled(right, curStrafe * strafeAccel * dt);
      hasThrust = true;
    }

    if (!hasThrust) {
      // 线性阻尼自然制动
      this.vel.scale(Math.pow(0.2, dt));
    }

    // 限速
    const curSpeed = this.vel.length();
    if (curSpeed > maxSpeed) {
      this.vel.scale(maxSpeed / curSpeed);
    }

    // 坐标积分
    this.pos.addScaled(this.vel, dt);

    // 独立发动机平滑物理推力插值与差动转向模拟 (Engine Spooling & Differential Steering)
    const isBurnDrive = burnDriveLocked;
    const isBraking = curThrottle < -0.05;
    const forwardCmd = Math.max(0, curThrottle);

    for (let i = 0; i < this.engineStatuses.length; i++) {
      const eng = this.engineStatuses[i];
      const slot = this.spec.engineSlots[i];
      if (!slot) continue;

      let targetThrust = 0;
      if (eng.isFlameout) {
        targetThrust = 0;
      } else if (isBurnDrive) {
        targetThrust = 2.4;
      } else if (isBraking) {
        targetThrust = 0;
      } else {
        targetThrust = forwardCmd;

        // 差动转向推力补偿 (Differential Steering)
        if (Math.abs(this.turnInput) > 0.05) {
          const steerSign = this.turnInput > 0 ? 1 : -1;
          const yNorm = slot.y / (this.spec.collisionRadius * 0.4 || 40);
          const steerBonus = yNorm * steerSign * Math.abs(this.turnInput) * 0.45;
          targetThrust = Math.max(0.0, Math.min(1.0, targetThrust + steerBonus));
        }

        // 侧移辅助响应 (Strafe)
        if (Math.abs(curStrafe) > 0.05 && slot.angleDeg !== 180) {
          targetThrust = Math.max(targetThrust, Math.abs(curStrafe) * 0.7);
        }
      }

      // 物理惯性平滑过渡 (升温起喷 ~0.26s，减速回火 ~0.38s)
      const spoolRate = targetThrust > eng.currentThrust ? 3.8 : 2.6;
      if (targetThrust > eng.currentThrust) {
        eng.currentThrust = Math.min(targetThrust, eng.currentThrust + spoolRate * dt);
      } else {
        eng.currentThrust = Math.max(targetThrust, eng.currentThrust - spoolRate * dt);
      }
    }
  }
}

