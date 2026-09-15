/**
 * 舰船专属战术系统 (Ship System)
 * 攻势与典范经典绝技:
 * 1. 攻势级: 冲刺推进系统 (Burn Drive)
 *    点火所有主发动机进行直线超负荷狂暴加速，惯性巨大，用于高速逼近、刺穿阵型并进行毁灭性撞击。
 * 2. 典范级: 堡垒护盾系统 (Fortress Shield)
 *    将能量全面注入护盾发生器，护盾承受伤害巨幅削减 90%，代价是武器暂时停火，坚不可摧。
 */

export type ShipSystemType = 'BURN_DRIVE' | 'FORTRESS_SHIELD' | 'MINE_STRIKE' | 'NONE';
export type ShipSystemState = 'IDLE' | 'IN' | 'ACTIVE' | 'OUT' | 'COOLDOWN';

export class ShipSystem {
  public type: ShipSystemType;
  public state: ShipSystemState = 'IDLE';
  public effectLevel = 0;
  public isActive = false;
  public isCoolingDown = false;
  /** Remaining time in the current finite stage, kept for HUD compatibility. */
  public activeTimer = 0;
  public cooldownTimer = 0;

  public maxDuration = 4.0;
  public maxCooldown = 10.0;
  public chargeUpDuration = 0;
  public activeDuration = 4.0;
  public chargeDownDuration = 0;

  // 战术系统充能层数 (例如空雷突袭 5 次充能)
  public maxCharges = 1;
  public charges = 1;
  public chargeRegenRate = 0;
  /** CRPluginImpl: cr <= 0 时 setShipSystemDisabled(true)，系统彻底离线。 */
  public disabled = false;
  /** ship_systems.csv `f/u (base cap)`: 每次使用的幅能成本 (基础容量比例 × maxFlux)。 */
  public fluxCostPerUse = 0;
  /** 系统成本类型：只有 hardFlux=TRUE 的系统 (相位线圈/堡垒护盾) 生成硬幅能。 */
  public generatesHardFlux = false;
  private pendingActivationFlux = 0;
  private chargeRegenTimer = 0;
  private stageTimer = 0;

  constructor(type: ShipSystemType = 'NONE', baseFluxCapacity = 0) {
    this.type = type;
    if (type === 'BURN_DRIVE') {
      // ship_systems.csv: charge up 2, active 5, down 1, cooldown 10.
      this.chargeUpDuration = 2.0;
      this.activeDuration = 5.0;
      this.chargeDownDuration = 1.0;
      this.maxDuration = 5.0;
      this.maxCooldown = 10.0;
      // ship_systems.csv: burndrive 只有 flux/second 1 (每秒 1% 基础容量) 的持续成本，
      // 无 flux/use 激活成本；该持续成本目前尚未建模，故此处保持 0。
      this.fluxCostPerUse = 0;
    } else if (type === 'FORTRESS_SHIELD') {
      // Toggle system: 1.5s IN / indefinite ACTIVE / 1.5s OUT / no cooldown.
      this.chargeUpDuration = 1.5;
      this.activeDuration = Number.POSITIVE_INFINITY;
      this.chargeDownDuration = 1.5;
      this.maxDuration = 1.5;
      this.maxCooldown = 0;
      this.generatesHardFlux = true;
    } else if (type === 'MINE_STRIKE') {
      this.maxDuration = 0.3;
      this.activeDuration = 0.3;
      this.maxCooldown = 0.5;
      this.maxCharges = 5;
      this.charges = 5;
      this.chargeRegenRate = 0.2;
      // ship_systems.csv: mine_strike `f/u (base cap)` 0.1 → 每次使用消耗 10% 基础幅能容量。
      this.fluxCostPerUse = Math.max(0, baseFluxCapacity) * 0.1;
    }
  }

  public reset(): void {
    this.state = 'IDLE';
    this.effectLevel = 0;
    this.isActive = false;
    this.isCoolingDown = false;
    this.activeTimer = 0;
    this.cooldownTimer = 0;
    this.stageTimer = 0;
    this.chargeRegenTimer = 0;
    this.charges = this.maxCharges;
    this.pendingActivationFlux = 0;
  }

  /** Activate a ready system, or toggle an engaged toggle-system into OUT. */
  public activate(): boolean {
    if (this.type === 'NONE' || this.disabled) return false;
    if (this.type === 'MINE_STRIKE') {
      if (this.charges <= 0 || this.isCoolingDown) return false;
      this.charges--;
      // 原版 system charge tracker 在激活时立刻扣除 flux/use (mine_strike: 10% 基础容量)。
      this.pendingActivationFlux += this.fluxCostPerUse;
      this.isCoolingDown = true;
      this.cooldownTimer = this.maxCooldown;
      this.isActive = true;
      this.activeTimer = this.maxDuration;
      return true;
    }

    if (this.state === 'COOLDOWN' || this.isCoolingDown) return false;
    if (this.state === 'IN' || this.state === 'ACTIVE') {
      this.beginOut();
      return false;
    }
    if (this.state === 'OUT') return false;

    this.beginIn();
    return true;
  }

  /** 取出并清空待结算的系统激活幅能成本 (由 Ship 在幅能追踪器上结算)。 */
  public consumePendingActivationFlux(): number {
    const cost = this.pendingActivationFlux;
    this.pendingActivationFlux = 0;
    return cost;
  }

  public deactivate(): void {
    if (this.type === 'MINE_STRIKE') {
      this.isActive = false;
      return;
    }
    if (this.state === 'IN' || this.state === 'ACTIVE') this.beginOut();
  }

  public update(dt: number): void {
    if (this.type === 'MINE_STRIKE') {
      this.updateMineStrike(dt);
      this.updateChargeRegen(dt);
      return;
    }

    if (this.state === 'IN') {
      this.stageTimer = Math.max(0, this.stageTimer - dt);
      this.effectLevel = this.chargeUpDuration <= 0 ? 1 : 1 - this.stageTimer / this.chargeUpDuration;
      this.activeTimer = this.stageTimer;
      if (this.stageTimer <= 0) this.beginActive();
    } else if (this.state === 'ACTIVE') {
      this.effectLevel = 1;
      if (Number.isFinite(this.activeDuration)) {
        this.stageTimer = Math.max(0, this.stageTimer - dt);
        this.activeTimer = this.stageTimer;
        if (this.stageTimer <= 0) this.beginOut();
      } else {
        this.activeTimer = this.maxDuration;
      }
    } else if (this.state === 'OUT') {
      this.stageTimer = Math.max(0, this.stageTimer - dt);
      this.effectLevel = this.chargeDownDuration <= 0 ? 0 : this.stageTimer / this.chargeDownDuration;
      this.activeTimer = this.stageTimer;
      if (this.stageTimer <= 0) this.finishOut();
    } else if (this.state === 'COOLDOWN') {
      this.stageTimer = Math.max(0, this.stageTimer - dt);
      this.cooldownTimer = this.stageTimer;
      if (this.stageTimer <= 0) {
        this.state = 'IDLE';
        this.isCoolingDown = false;
        this.cooldownTimer = 0;
      }
    }

    this.updateChargeRegen(dt);
  }

  private beginIn(): void {
    this.state = 'IN';
    this.isActive = true;
    this.isCoolingDown = false;
    this.effectLevel = 0;
    this.stageTimer = this.chargeUpDuration;
    this.activeTimer = this.stageTimer;
    this.cooldownTimer = 0;
    if (this.chargeUpDuration <= 0) this.beginActive();
  }

  private beginActive(): void {
    this.state = 'ACTIVE';
    this.isActive = true;
    this.effectLevel = 1;
    this.stageTimer = this.activeDuration;
    this.activeTimer = Number.isFinite(this.stageTimer) ? this.stageTimer : this.maxDuration;
  }

  private beginOut(): void {
    if (!this.isActive) return;
    this.state = 'OUT';
    this.isActive = true;
    this.effectLevel = Math.max(0, Math.min(1, this.effectLevel));
    this.stageTimer = this.chargeDownDuration * this.effectLevel;
    this.activeTimer = this.stageTimer;
    if (this.stageTimer <= 0) this.finishOut();
  }

  private finishOut(): void {
    this.effectLevel = 0;
    this.isActive = false;
    this.activeTimer = 0;
    if (this.maxCooldown > 0) {
      this.state = 'COOLDOWN';
      this.isCoolingDown = true;
      this.stageTimer = this.maxCooldown;
      this.cooldownTimer = this.maxCooldown;
    } else {
      this.state = 'IDLE';
      this.isCoolingDown = false;
      this.stageTimer = 0;
      this.cooldownTimer = 0;
    }
  }

  private updateMineStrike(dt: number): void {
    if (this.isActive) {
      this.activeTimer -= dt;
      if (this.activeTimer <= 0) {
        this.activeTimer = 0;
        this.isActive = false;
      }
    } else if (this.isCoolingDown) {
      this.cooldownTimer -= dt;
      if (this.cooldownTimer <= 0) {
        this.cooldownTimer = 0;
        this.isCoolingDown = false;
      }
    }
  }

  private updateChargeRegen(dt: number): void {
    if (this.charges >= this.maxCharges || this.chargeRegenRate <= 0) return;
    this.chargeRegenTimer += dt;
    const interval = 1 / this.chargeRegenRate;
    while (this.chargeRegenTimer >= interval && this.charges < this.maxCharges) {
      this.charges++;
      this.chargeRegenTimer -= interval;
    }
    if (this.charges >= this.maxCharges) this.chargeRegenTimer = 0;
  }

  /** FortressShieldStats.java: shield damage mult = 1 - 0.9 * effectLevel. */
  public getShieldDamageMultiplier(): number {
    return this.type === 'FORTRESS_SHIELD' && this.isActive
      ? 1 - 0.9 * this.effectLevel
      : 1.0;
  }

  /** Fortress shield upkeep is zero for the entire applied IN/ACTIVE/OUT lifecycle. */
  public getShieldUpkeepMultiplier(): number {
    return this.type === 'FORTRESS_SHIELD' && this.isActive ? 0.0 : 1.0;
  }

  /** ship_systems.csv: Fortress Shield generates hard flux at 2.5% of base capacity per second. */
  public getHardFluxPerSecond(baseFluxCapacity: number): number {
    return this.type === 'FORTRESS_SHIELD' && this.isActive
      ? Math.max(0, baseFluxCapacity) * 0.025
      : 0;
  }

  /** BurnDriveStats.java removes max-speed bonus immediately in OUT. */
  public getSpeedFlatBonus(): number {
    if (this.type !== 'BURN_DRIVE' || !this.isActive || this.state === 'OUT') return 0;
    return 200 * this.effectLevel;
  }

  /** The source script leaves the +200 acceleration modifier applied through OUT until unapply(). */
  public getAccelerationFlatBonus(): number {
    if (this.type !== 'BURN_DRIVE' || !this.isActive) return 0;
    return this.state === 'OUT' ? 200 : 200 * this.effectLevel;
  }
}
