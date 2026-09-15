import { Vector2 } from '../math/Vector2';
import { DamageType } from './ArmorGrid';

export type ShieldType = 'FRONT' | 'OMNI' | 'PHASE' | 'NONE';

/**
 * 相位线圈状态机 (对齐 ship_systems.csv phasecloak 与 ShipSystemAPI.SystemState)。
 * IN 0.5s → ACTIVE (toggle 保持) → OUT 0.5s → COOLDOWN 2s → IDLE
 */
export type PhaseCloakState = 'IDLE' | 'IN' | 'ACTIVE' | 'OUT' | 'COOLDOWN';

/** PhaseCloakStats.FLUX_LEVEL_AFFECTS_SPEED / MIN_SPEED_MULT / BASE_FLUX_LEVEL_FOR_MIN_SPEED */
export const PHASE_MIN_SPEED_MULT = 0.33;
export const PHASE_BASE_FLUX_LEVEL_FOR_MIN_SPEED = 0.5;

export interface ShieldHitRipple {
  angle: number; // 击中角度 (弧度)
  intensity: number; // 涟漪强度 0.0 ~ 1.0
  life: number; // 剩余寿命 (秒)
  color: [number, number, number]; // RGB
}

/**
 * 能量护盾系统 (Shield)
 * 核心机制:
 * 1. 护盾类型: FRONT (前向固定弧度，如攻势 180°), OMNI (全向可转动，如典范 360°), PHASE (相位隐形斗篷，如厄运级).
 * 2. 展开速度 (Unfold Speed): 开启护盾时从 0° 迅速向两侧延展至全弧度。
 * 3. 护盾防御效率 (Efficiency): 伤害转化为硬幅能的比率 (攻势为 1.0，典范为 0.6 极高韧性)。
 * 4. 动态受击光晕与涟漪 (Impact Ripples)。
 * 5. 相位线圈进出阶段与冷却、开启/维持硬幅能成本、硬幅能减速 (Phase Cloak)。
 */
export class Shield {
  public type: ShieldType;
  public maxArcDeg: number; // 最大展开弧度 (度)
  public radius: number; // 护盾球体半径 (像素)
  public efficiency: number; // 护盾受损转幅能效率 (越低越肉)
  public upkeepRate: number; // 维持每秒幅能消耗 (ship_data.csv shield upkeep × flux dissipation)
  
  public isActive = false;
  public currentArcDeg = 0; // 当前已展开弧度 (度)
  public facingAngleRad = 0; // 当前护盾中心朝向 (弧度)
  public targetFacingAngleRad = 0;
  public unfoldRateDeg = 360; // 展开速率 (度/秒)
  
  public ripples: ShieldHitRipple[] = [];

  // --------------------------------------------------------------------------
  // 相位线圈 (ship_systems.csv phasecloak: charge up 0.5 / down 0.5 / cooldown 2, toggle)
  // --------------------------------------------------------------------------
  public phaseState: PhaseCloakState = 'IDLE';
  public phaseEffectLevel = 0;
  public phaseChargeUpDuration = 0.5;
  public phaseChargeDownDuration = 0.5;
  public phaseCooldownDuration = 2.0;
  /** ship_data.csv `phase cost` × 基础幅能容量：开启相位的硬幅能成本。 */
  public phaseActivationCost = 0;
  /** ship_data.csv `phase upkeep` × 基础幅能容量：每秒维持硬幅能。 */
  public phaseUpkeepPerSecond = 0;
  /** phasecloak.system: canNotCauseOverload=true，相位成本永远不会把舰船打进过载。 */
  public phaseCanNotCauseOverload = true;
  private phaseStageTimer = 0;
  private pendingActivationCost = 0;

  /** 相位成本入账回调 (硬幅能，永不触发过载)，由 Ship 注入 flux 追踪器。 */
  private readonly raisePhaseFlux?: (amount: number) => void;

  public get isPhased(): boolean {
    if (this.type !== 'PHASE') return false;
    if (this.phaseState === 'IN' || this.phaseState === 'ACTIVE') return true;
    // PhaseCloakStats: OUT 阶段 effectLevel > 0.5 时仍然处于相位潜航。
    return this.phaseState === 'OUT' && this.phaseEffectLevel > 0.5;
  }

  /** 相位线圈是否处于已开启生命周期 (IN / ACTIVE / OUT)，对齐 ShipSystemAPI.isActive()。 */
  public get isPhaseEngaged(): boolean {
    return this.phaseState === 'IN' || this.phaseState === 'ACTIVE' || this.phaseState === 'OUT';
  }

  /** 相位维持成本只在 IN 与 ACTIVE 阶段产生 (原版 charge tracker)。 */
  public get isPhaseUpkeepActive(): boolean {
    return this.phaseState === 'IN' || this.phaseState === 'ACTIVE';
  }

  constructor(
    type: ShieldType = 'FRONT',
    maxArcDeg = 180,
    radius = 250,
    efficiency = 1.0,
    upkeepRate = 0,
    raisePhaseFlux?: (amount: number) => void
  ) {
    this.type = type;
    this.maxArcDeg = maxArcDeg;
    this.radius = radius;
    this.efficiency = efficiency;
    this.upkeepRate = upkeepRate;
    this.raisePhaseFlux = raisePhaseFlux;
  }

  public toggle(): boolean {
    if (this.type === 'PHASE') return this.togglePhase();
    this.isActive = !this.isActive;
    return this.isActive;
  }

  /**
   * 相位线圈开关：IDLE 时可开启 (进入 0.5s IN 阶段)，IN/ACTIVE 时可关闭 (进入 0.5s OUT 阶段)，
   * OUT 与 COOLDOWN 阶段拒绝操作 —— 因此无法瞬时反复切换。
   */
  public togglePhase(): boolean {
    if (this.phaseState === 'IDLE') {
      this.beginPhaseIn();
      return true;
    }
    if (this.phaseState === 'IN' || this.phaseState === 'ACTIVE') {
      this.beginPhaseOut();
    }
    return false;
  }

  public setActive(active: boolean) {
    if (this.type !== 'PHASE') {
      this.isActive = active;
      return;
    }
    if (active) {
      if (this.phaseState === 'IDLE') this.beginPhaseIn();
      return;
    }
    if (this.phaseState === 'IN' || this.phaseState === 'ACTIVE') this.beginPhaseOut();
  }

  private beginPhaseIn(): void {
    this.phaseState = 'IN';
    this.phaseStageTimer = Math.max(0, this.phaseChargeUpDuration);
    this.phaseEffectLevel = this.phaseChargeUpDuration <= 0 ? 1 : 0;
    this.isActive = true;
    if (this.phaseChargeUpDuration <= 0) this.beginPhaseActive();

    // 开启成本：原版在 charge tracker 里于 activate 时立刻扣除 (硬幅能)。
    if (this.phaseActivationCost > 0) {
      this.pendingActivationCost += this.phaseActivationCost;
      this.flushPendingActivationCost();
    }
  }

  private beginPhaseActive(): void {
    this.phaseState = 'ACTIVE';
    this.phaseEffectLevel = 1;
    this.phaseStageTimer = 0;
  }

  private beginPhaseOut(): void {
    this.phaseState = 'OUT';
    // 保留当前 effectLevel，退出过程按剩余比例平滑衰减 (原版 charge-down 语义)。
    this.phaseStageTimer = Math.max(0, this.phaseEffectLevel) * this.phaseChargeDownDuration;
    if (this.phaseStageTimer <= 0) this.finishPhaseOut();
  }

  private finishPhaseOut(): void {
    this.phaseEffectLevel = 0;
    this.isActive = false;
    if (this.phaseCooldownDuration > 0) {
      this.phaseState = 'COOLDOWN';
      this.phaseStageTimer = this.phaseCooldownDuration;
    } else {
      this.phaseState = 'IDLE';
      this.phaseStageTimer = 0;
    }
  }

  /** 相位成本 (开启 + 维持) 立刻以硬幅能入账，且永不触发过载。 */
  private flushPendingActivationCost(): void {
    if (this.pendingActivationCost <= 0) return;
    this.raisePhaseFlux?.(this.pendingActivationCost);
    this.pendingActivationCost = 0;
  }

  /** 消耗尚未入账的开启成本 (供没有注入回调的调用方手动结算)。 */
  public consumePendingPhaseActivationCost(): number {
    const cost = this.pendingActivationCost;
    this.pendingActivationCost = 0;
    return cost;
  }

  private updatePhase(dt: number): void {
    if (this.phaseCanNotCauseOverload) this.flushPendingActivationCost();

    switch (this.phaseState) {
      case 'IN':
        this.phaseStageTimer -= dt;
        this.phaseEffectLevel = this.phaseChargeUpDuration <= 0
          ? 1
          : 1 - Math.max(0, this.phaseStageTimer) / this.phaseChargeUpDuration;
        if (this.phaseStageTimer <= 0) this.beginPhaseActive();
        break;
      case 'ACTIVE':
        this.phaseEffectLevel = 1;
        break;
      case 'OUT':
        this.phaseStageTimer -= dt;
        this.phaseEffectLevel = this.phaseChargeDownDuration <= 0
          ? 0
          : Math.max(0, this.phaseStageTimer) / this.phaseChargeDownDuration;
        if (this.phaseStageTimer <= 0) this.finishPhaseOut();
        break;
      case 'COOLDOWN':
        this.phaseStageTimer -= dt;
        if (this.phaseStageTimer <= 0) {
          this.phaseState = 'IDLE';
          this.phaseStageTimer = 0;
        }
        break;
      default:
        break;
    }
  }

  /**
   * PhaseCloakStats.getSpeedMult: 硬幅能超过 50% 基础阈值后按缺口降低最高航速，
   * 满缺口时降到 33%。
   */
  public getPhaseSpeedMultiplier(hardFluxLevel: number): number {
    if (!this.isPhaseEngaged) return 1;
    const threshold = PHASE_BASE_FLUX_LEVEL_FOR_MIN_SPEED;
    if (threshold <= 0) return PHASE_MIN_SPEED_MULT;
    let disruption = hardFluxLevel / threshold;
    if (disruption > 1) disruption = 1;
    if (disruption <= 0) return 1;
    return PHASE_MIN_SPEED_MULT + (1 - PHASE_MIN_SPEED_MULT) * (1 - disruption * this.phaseEffectLevel);
  }

  /** Visual deployment survives toggle-off until the retract animation reaches zero. */
  public get deploymentLevel(): number {
    if (this.maxArcDeg <= 0) return 0;
    return Math.max(0, Math.min(1, this.currentArcDeg / this.maxArcDeg));
  }

  public get isVisuallyDeployed(): boolean {
    return this.type !== 'NONE' && this.type !== 'PHASE' && this.currentArcDeg > 0.01;
  }

  /**
   * 判断某个击中点是否被当前护盾阻挡
   * @param shieldCenter 护盾实际中心世界坐标（已包含舰体 shieldCenter 偏移）
   * @param hitWorldPos 击中点世界坐标
   * @param shipFacing 舰船自身朝向 (弧度)
   */
  public isHitBlocked(shieldCenter: Vector2, hitWorldPos: Vector2, shipFacing: number): boolean {
    if (!this.isActive || this.currentArcDeg <= 5 || this.type === 'NONE' || this.type === 'PHASE') {
      return false;
    }

    // 击中点相对于护盾实际中心的角度
    const hitAngle = Math.atan2(hitWorldPos.y - shieldCenter.y, hitWorldPos.x - shieldCenter.x);
    
    // 护盾中心朝向
    const centerFacing = this.type === 'FRONT' ? shipFacing : this.facingAngleRad;
    
    // 计算角差，规约至 [-PI, PI]
    let diff = hitAngle - centerFacing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const halfArcRad = (this.currentArcDeg * Math.PI) / 360;
    return Math.abs(diff) <= halfArcRad;
  }

  /**
   * 护盾吸收伤害结算
   * @returns 转化产生的硬幅能数值
   */
  public absorbDamage(damage: number, damageType: DamageType, hitAngleRad: number): number {
    // 伤害类型对护盾的倍率
    let shieldMult = 1.0;
    switch (damageType) {
      case 'KINETIC':
        shieldMult = 2.0; // 动能对护盾 200% 暴击
        break;
      case 'HIGH_EXPLOSIVE':
        shieldMult = 0.5; // 高爆对护盾 50% 疲软
        break;
      case 'ENERGY':
        shieldMult = 1.0; // 能量 100%
        break;
      case 'FRAGMENTATION':
        shieldMult = 0.25; // 破片对护盾 25%
        break;
    }

    // 最终幅能增加值 = 基础伤害 * 伤害类型倍率 * 护盾效率
    const fluxGenerated = damage * shieldMult * this.efficiency;

    // 记录受击光斑与涟漪 (合并同一方位高频撞击，如连续激光扫射)
    const existing = this.ripples.find(r => Math.abs(r.angle - hitAngleRad) < 0.18);
    const hitColor: [number, number, number] = damageType === 'KINETIC' ? [80, 200, 255] : (damageType === 'HIGH_EXPLOSIVE' ? [255, 120, 50] : [200, 100, 255]);
    if (existing) {
      existing.life = 0.38;
      existing.intensity = Math.min(1.4, existing.intensity + 0.25);
      existing.color = hitColor;
    } else {
      const ripple: ShieldHitRipple = {
        angle: hitAngleRad,
        intensity: 1.0,
        life: 0.4,
        color: hitColor
      };
      // The shader exposes four ripple slots. Keep that capacity deterministic and recycle
      // the weakest/oldest slot rather than silently accumulating invisible hit state.
      if (this.ripples.length >= 4) {
        let replaceIndex = 0;
        for (let i = 1; i < this.ripples.length; i++) {
          if (this.ripples[i].intensity < this.ripples[replaceIndex].intensity) replaceIndex = i;
        }
        this.ripples[replaceIndex] = ripple;
      } else {
        this.ripples.push(ripple);
      }
    }

    return fluxGenerated;
  }

  /**
   * 60Hz 逻辑步长更新
   */
  public update(dt: number, shipFacing: number, aimFacing: number) {
    // 0. 相位线圈状态机 (IN 0.5s → ACTIVE → OUT 0.5s → COOLDOWN 2s) 与硬幅能成本
    if (this.type === 'PHASE') this.updatePhase(dt);

    // 1. 展开或收拢动画计算
    if (this.isActive) {
      this.currentArcDeg = Math.min(this.maxArcDeg, this.currentArcDeg + this.unfoldRateDeg * dt);
    } else {
      this.currentArcDeg = Math.max(0, this.currentArcDeg - this.unfoldRateDeg * 1.5 * dt);
    }

    // 2. 护盾朝向追踪
    if (this.type === 'FRONT') {
      this.facingAngleRad = shipFacing;
    } else if (this.type === 'OMNI') {
      // 全向护盾追踪瞄准方向
      let diff = aimFacing - this.facingAngleRad;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const turnSpeed = 4.0; // rad/s
      this.facingAngleRad += Math.sign(diff) * Math.min(Math.abs(diff), turnSpeed * dt);
    }

    // 3. 更新受击涟漪
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      this.ripples[i].life -= dt;
      this.ripples[i].intensity = Math.max(0, this.ripples[i].life / 0.4);
      if (this.ripples[i].life <= 0) {
        this.ripples.splice(i, 1);
      }
    }
  }
}
