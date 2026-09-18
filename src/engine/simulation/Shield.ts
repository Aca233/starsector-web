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

/**
 * 能量护盾系统 (Shield)
 * 核心机制:
 * 1. 护盾类型: FRONT (前向固定弧度，如攻势 180°), OMNI (全向可转动，如典范 360°), PHASE (相位隐形斗篷，如厄运级).
 * 2. 展开速度 (Unfold Speed): 开启护盾时从 0° 迅速向两侧延展至全弧度。
 * 3. 护盾防御效率 (Efficiency): 伤害转化为硬幅能的比率 (攻势为 1.0，典范为 0.6 极高韧性)。
 * 4. 分段受击亮度与恢复 (Segment hit state)。
 * 5. 相位线圈进出阶段与冷却、开启/维持硬幅能成本、硬幅能减速 (Phase Cloak)。
 */
export class Shield {
  /** Separate from efficiency: Graviton modifies all incoming shield damage,
   * not upkeep or the flux-to-damage conversion used by native hit glows. */
  public readonly damageTakenModifiers = new Map<string, number>();
  public externalDamageTakenMultiplier = () => 1;
  public energyDamageTakenMultiplier = 1;
  public damageTakenMultiplierFor(type: DamageType): number { return this.damageTakenMultiplier * (type === "ENERGY" ? this.energyDamageTakenMultiplier : 1); }
  public get damageTakenMultiplier(): number { return [...this.damageTakenModifiers.values()].reduce((a, b) => a * b, 1) * this.externalDamageTakenMultiplier(); }
  /** Actual shield contact age, separate from cosmetic hit levels. Advanced by Ship. */
  public sinceLastDamageTaken = Number.POSITIVE_INFINITY;

  public recordDamageContact(damage: number): void {
    if (damage > 0) this.sinceLastDamageTaken = 0;
  }
  public type: ShieldType;
  public maxArcDeg: number; // 最大展开弧度 (度)
  public radius: number; // 护盾球体半径 (像素)
  public efficiency: number; // 护盾受损转幅能效率 (越低越肉)
  public upkeepRate: number; // 维持每秒幅能消耗 (ship_data.csv shield upkeep × flux dissipation)
  
  public toggleLocked = false;
  public isActive = false;
  public currentArcDeg = 0; // 当前已展开弧度 (度)
  public facingAngleRad = 0; // 当前护盾中心朝向 (弧度)
  public targetFacingAngleRad = 0;
  private closeTimeRemaining = 0;
  private pendingRaise = false;

  public unfoldRateMultiplier = 1;
  public turnRateMultiplier = 1;

  public get unfoldRateDeg(): number {
    return 100 * 180 / (Math.PI * Math.max(1, this.radius)) * (this.type === 'FRONT' ? 2 : 1) * this.unfoldRateMultiplier;
  }

  public get unfoldDuration(): number {
    return this.maxArcDeg / this.unfoldRateDeg;
  }

  /** The source charge tracker fades brightness independently of the collision arc. */
  public get visualAlpha(): number {
    if (!this.isActive) return this.closeTimeRemaining / 0.35;
    const fadeIn = Math.min(0.75, this.unfoldDuration);
    return fadeIn > 0 ? Math.min(1, this.currentArcDeg / this.unfoldRateDeg / fadeIn) : 1;
  }
  
  private hitLevels = new Float32Array(0);
  private hitRadius = -1;
  private hitArcDeg = -1;

  /** Source G.setArc: vertex count derived from 20-world-unit and 5-degree resolutions. */
  public get hitSegmentLevels(): Float32Array {
    if (this.hitRadius !== this.radius || this.hitArcDeg !== this.maxArcDeg) {
      const arcLength = 2 * Math.PI * Math.max(0, this.radius) * this.maxArcDeg / 360;
      const count = Math.max(2, Math.floor(arcLength / 20) + 1, Math.floor(this.maxArcDeg / 5) + 1);
      this.hitLevels = new Float32Array(count).fill(100);
      this.hitRadius = this.radius;
      this.hitArcDeg = this.maxArcDeg;
    }
    return this.hitLevels;
  }

  /** Five degrees of visual fringe at each full-deployment arc endpoint. */
  public get renderArcRad(): number {
    return (this.maxArcDeg + 10) * this.deploymentLevel * Math.PI / 180;
  }

  public resetVisualHits(): void {
    this.hitSegmentLevels.fill(100);
  }

  /** Source G.shieldHit consumes post-mitigation shield flux, not a damage-type color. */
  public recordVisualHit(flux: number, hitAngleRad: number): void {
    if (this.type !== 'FRONT' && this.type !== 'OMNI') return;
    const arc = this.renderArcRad;
    if (arc <= 0 || flux <= 0) return;
    const levels = this.hitSegmentLevels;
    const tau = Math.PI * 2;
    const start = this.facingAngleRad - arc / 2;
    const offset = ((hitAngleRad - start) % tau + tau) % tau;
    const hitIndex = Math.round(offset / arc * (levels.length - 1));
    const segmentLength = tau * this.radius * this.maxArcDeg / 360 / (levels.length - 1);
    for (let i = 0; i < levels.length; i++) {
      const weight = Math.max(0, 1 - Math.abs(hitIndex - i) * segmentLength / 50);
      levels[i] = Math.max(0, levels[i] - flux * weight);
    }
  }

  // --------------------------------------------------------------------------
  // 相位线圈 (ship_systems.csv phasecloak: charge up 0.5 / down 0.5 / cooldown 2, toggle)
  // --------------------------------------------------------------------------
  public phaseState: PhaseCloakState = 'IDLE';
  /** Explicit forced state for emergency phase dives, independent of ordinary player toggles. */
  public forcedPhaseEffectLevel?: number;
  public phaseEffectLevel = 0;
  public phaseMinSpeedFluxThresholdMultiplier = 1;
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

  public get phaseCooldownLevel(): number {
    return this.phaseState === 'COOLDOWN' && this.phaseCooldownDuration > 0
      ? Math.max(0, Math.min(1, this.phaseStageTimer / this.phaseCooldownDuration)) : 0;
  }

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

  /** Requested state includes a raise queued behind the shield's physical close time. */
  public get isRaiseRequested(): boolean { return this.isActive || this.pendingRaise; }

  public toggle(): boolean {
    if (this.toggleLocked) return this.isActive;
    if (this.type === 'NONE') return false;
    if (this.type === 'PHASE') return this.togglePhase();
    this.setActive(!(this.isActive || this.pendingRaise));
    return this.isActive;
  }

  /**
   * 相位线圈开关：IDLE 时可开启 (进入 0.5s IN 阶段)，IN/ACTIVE 时可关闭 (进入 0.5s OUT 阶段)，
   * OUT 与 COOLDOWN 阶段拒绝操作 —— 因此无法瞬时反复切换。
   */
  public togglePhase(): boolean {
    if (this.toggleLocked) return this.isActive;
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
    if (this.type === 'NONE') { this.isActive = false; return; }
    if (this.type !== 'PHASE') {
      this.pendingRaise = active && this.closeTimeRemaining > 0;
      if (active && this.closeTimeRemaining <= 0) this.isActive = true;
      else if (!active && this.isActive) {
        this.isActive = false;
        this.closeTimeRemaining = 0.35;
      }
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
    const threshold = PHASE_BASE_FLUX_LEVEL_FOR_MIN_SPEED * this.phaseMinSpeedFluxThresholdMultiplier;
    if (threshold <= 0) return PHASE_MIN_SPEED_MULT;
    let disruption = hardFluxLevel / threshold;
    if (disruption > 1) disruption = 1;
    if (disruption <= 0) return 1;
    return PHASE_MIN_SPEED_MULT + (1 - PHASE_MIN_SPEED_MULT) * (1 - disruption * this.phaseEffectLevel);
  }

  /** Arc coverage is retained throughout the separate fade-out. */
  public get deploymentLevel(): number {
    if (this.maxArcDeg <= 0) return 0;
    return Math.max(0, Math.min(1, this.currentArcDeg / this.maxArcDeg));
  }

  public get isVisuallyDeployed(): boolean {
    return this.type !== 'NONE' && this.type !== 'PHASE' && this.currentArcDeg > 0.01 && this.visualAlpha > 0;
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
    this.recordDamageContact(damage);
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

    // 最终幅能增加值 = 基础伤害 * 护盾易伤倍率 * 伤害类型倍率 * 护盾效率
    const fluxGenerated = damage * this.damageTakenMultiplierFor(damageType) * shieldMult * this.efficiency;

    this.recordVisualHit(fluxGenerated, hitAngleRad);

    return fluxGenerated;
  }

  /**
   * 60Hz 逻辑步长更新
   */
  public update(dt: number, shipFacing: number, aimFacing: number) {
    // 0. 相位线圈状态机 (IN 0.5s → ACTIVE → OUT 0.5s → COOLDOWN 2s) 与硬幅能成本
    if (this.type === 'PHASE') {
      if (this.forcedPhaseEffectLevel === undefined) this.updatePhase(dt);
      else { this.phaseState = 'IN'; this.isActive = true; this.phaseEffectLevel = Math.max(0,Math.min(1,this.forcedPhaseEffectLevel)); }
    }

    // A fresh omni deployment starts at the aim point, not at the bow.
    // Once deployed, rotation is rate-limited; shutdown retains the last facing.
    const openingOmni = this.type === 'OMNI' && this.isActive && this.currentArcDeg === 0;

    // systems/G.java and ship/trackers/oooO: unfold the arc, then fade it in place on shutdown.
    if (this.type === 'FRONT' || this.type === 'OMNI') {
      if (this.isActive) {
        this.currentArcDeg = Math.min(this.maxArcDeg, this.currentArcDeg + this.unfoldRateDeg * dt);
      } else {
        this.closeTimeRemaining = Math.max(0, this.closeTimeRemaining - dt);
        if (this.closeTimeRemaining <= 1e-8) {
          this.closeTimeRemaining = 0;
          this.currentArcDeg = 0;
          if (this.pendingRaise) {
            this.pendingRaise = false;
            this.isActive = true;
          }
        }
      }
    }

    // 2. 护盾朝向追踪
    if (this.type === 'FRONT') {
      this.facingAngleRad = shipFacing;
    } else if (this.type === 'OMNI' && this.isActive) {
      if (openingOmni || this.currentArcDeg === 0) {
        // Also covers a queued raise when the previous arc has fully closed.
        this.facingAngleRad = aimFacing;
      } else {
        // Once raised, follow the cursor (or AI defense aim) by the shortest turn.
        let diff = aimFacing - this.facingAngleRad;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const turnSpeed = 100 / Math.max(1, this.radius) * this.turnRateMultiplier;
        this.facingAngleRad += Math.sign(diff) * Math.min(Math.abs(diff), turnSpeed * dt);
      }
    } else if (this.type === 'OMNI' && this.closeTimeRemaining === 0) {
      this.facingAngleRad = shipFacing;
    }

    // G.advance restores the 100-point visual meter over five seconds, even while off.
    if (this.type === 'FRONT' || this.type === 'OMNI') {
      const levels = this.hitSegmentLevels;
      for (let i = 0; i < levels.length; i++) levels[i] = Math.min(100, levels[i] + 20 * dt);
    }
  }
}
