/**
 * 舰船专属战术系统 (Ship System)
 * 攻势与典范经典绝技:
 * 1. 攻势级: 冲刺推进系统 (Burn Drive)
 *    点火所有主发动机进行直线超负荷狂暴加速，惯性巨大，用于高速逼近、刺穿阵型并进行毁灭性撞击。
 * 2. 典范级: 堡垒护盾系统 (Fortress Shield)
 *    将能量全面注入护盾发生器，护盾承受伤害巨幅削减 90%，代价是武器暂时停火，坚不可摧。
 */

export type ShipSystemType = 'BURN_DRIVE' | 'FORTRESS_SHIELD' | 'MINE_STRIKE' | 'NONE';

export class ShipSystem {
  public type: ShipSystemType;
  public isActive = false;
  public isCoolingDown = false;
  public activeTimer = 0;
  public cooldownTimer = 0;

  public maxDuration = 4.0; // 持续时间 (秒)
  public maxCooldown = 10.0; // 冷却时间 (秒)

  // 战术系统充能层数 (例如空雷突袭 5 次充能)
  public maxCharges = 1;
  public charges = 1;
  public chargeRegenRate = 0; // 充能恢复速率 (次/秒)
  private chargeRegenTimer = 0;

  constructor(type: ShipSystemType = 'NONE') {
    this.type = type;
    if (type === 'BURN_DRIVE') {
      this.maxDuration = 4.5;
      this.maxCooldown = 12.0;
    } else if (type === 'FORTRESS_SHIELD') {
      this.maxDuration = 8.0; // 也可以由玩家主动提前关闭
      this.maxCooldown = 15.0;
    } else if (type === 'MINE_STRIKE') {
      this.maxDuration = 0.3;
      this.maxCooldown = 0.5;
      this.maxCharges = 5;
      this.charges = 5;
      this.chargeRegenRate = 0.2; // 每 5 秒恢复 1 枚水雷充能
    }
  }

  /**
   * 激活/切换战术系统
   */
  public activate(): boolean {
    if (this.type === 'MINE_STRIKE') {
      if (this.charges <= 0 || this.isCoolingDown) return false;
      this.charges--;
      this.isCoolingDown = true;
      this.cooldownTimer = this.maxCooldown;
      this.isActive = true;
      this.activeTimer = this.maxDuration;
      return true;
    }

    if (this.isCoolingDown) return false;

    if (this.isActive) {
      // 允许玩家主动关闭
      this.deactivate();
      return false;
    }

    this.isActive = true;
    this.activeTimer = this.maxDuration;
    return true;
  }

  public deactivate() {
    if (!this.isActive) return;
    this.isActive = false;
    this.isCoolingDown = true;
    this.cooldownTimer = this.maxCooldown;
  }

  public update(dt: number) {
    if (this.isActive) {
      this.activeTimer -= dt;
      if (this.activeTimer <= 0) {
        this.deactivate();
      }
    } else if (this.isCoolingDown) {
      this.cooldownTimer -= dt;
      if (this.cooldownTimer <= 0) {
        this.isCoolingDown = false;
      }
    }

    // 充能恢复逻辑
    if (this.charges < this.maxCharges && this.chargeRegenRate > 0) {
      this.chargeRegenTimer += dt;
      if (this.chargeRegenTimer >= 1 / this.chargeRegenRate) {
        this.charges = Math.min(this.maxCharges, this.charges + 1);
        this.chargeRegenTimer = 0;
      }
    }
  }

  /**
   * 严格对齐 FortressShieldStats.java:
   * public static float DAMAGE_MULT = 0.9f;
   * stats.getShieldDamageTakenMult().modifyMult(id, 1f - DAMAGE_MULT * effectLevel);
   * stats.getShieldUpkeepMult().modifyMult(id, 0f);
   */
  public getShieldDamageMultiplier(): number {
    if (this.type === 'FORTRESS_SHIELD' && this.isActive) {
      return 0.10; // 1.0 - 0.9 = 0.10 (护盾只受 10% 伤害)
    }
    return 1.0;
  }

  /**
   * 严格对齐 FortressShieldStats.java: 激活期间护盾维持能耗归零
   */
  public getShieldUpkeepMultiplier(): number {
    if (this.type === 'FORTRESS_SHIELD' && this.isActive) {
      return 0.0;
    }
    return 1.0;
  }

  /**
   * 严格对齐 BurnDriveStats.java:
   * stats.getMaxSpeed().modifyFlat(id, 200f * effectLevel);
   * stats.getAcceleration().modifyFlat(id, 200f * effectLevel);
   */
  public getSpeedFlatBonus(): number {
    if (this.type === 'BURN_DRIVE' && this.isActive) {
      return 200.0;
    }
    return 0.0;
  }

  public getAccelerationFlatBonus(): number {
    if (this.type === 'BURN_DRIVE' && this.isActive) {
      return 200.0;
    }
    return 0.0;
  }
}
