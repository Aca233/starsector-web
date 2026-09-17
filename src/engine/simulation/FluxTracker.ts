/**
 * 远行星号幅能追踪与热量管理系统 (Flux Tracker)
 * 核心机制:
 * 1. 软幅能 (Soft Flux): 开火消耗与护盾维持产热，护盾展开时只要净耗散大于产出仍可缓慢消散。
 * 2. 硬幅能 (Hard Flux): 护盾受到敌方实弹/能量攻击转化而成，护盾开启时【绝对无法消散】。
 * 3. 过载 (Overload): 总幅能达 100% 极限时系统暴走，护盾熄灭、武器宕机、进入长达数秒的强制过载。
 * 4. 主动排散 (Vent): 玩家主动关盾全功率散热，散热速度加倍，但短时间内丧失防御与火控。
 */
import { sound } from '../audio/SoundManager';

export type HullSize = 'FIGHTER' | 'FRIGATE' | 'DESTROYER' | 'CRUISER' | 'CAPITAL_SHIP';

export class FluxTracker {
  public maxFlux: number;
  public baseDissipation: number;
  public ventRateMultiplier = 1;
  public overloadTimeMultiplier = 1;
  public timeSinceFluxIncrease = 0;
  public hullSize: HullSize;
  public softFlux = 0;
  public hardFlux = 0;
  
  public isOverloaded = false;
  public overloadTimer = 0;
  public overloadDuration = 0;

  public isVenting = false;
  public ventProgress = 0; // 0.0 ~ 1.0

  // 零幅能引擎推进加力 (严格对齐 D.java: isEngineBoostActive & settings.json: zeroFluxEngineBoost = 50)
  public zeroFluxTimer = 0;
  public boostDelay = 1.0; // 官方基础延迟 1.0 秒
  public isEngineBoostActive = false;

  constructor(maxFlux = 17000, baseDissipation = 600, hullSize: HullSize = 'CAPITAL_SHIP') {
    this.maxFlux = maxFlux;
    this.baseDissipation = baseDissipation;
    this.hullSize = hullSize;
  }

  public get totalFlux(): number {
    return this.softFlux + this.hardFlux;
  }

  public get fluxPercent(): number {
    return Math.min(1.0, this.totalFlux / this.maxFlux);
  }

  /**
   * 增加幅能 (严格对齐 D.java: increaseFlux)
   * @param amount 数值
   * @param isHard 是否为硬幅能 (护盾吸收实弹转为硬幅能)
   * @returns 是否导致了过载
   */
  public increaseFlux(amount: number, isHard: boolean): boolean {
    if (this.isOverloaded) return true;
    if (amount > 0) this.timeSinceFluxIncrease = 0;

    if (isHard) {
      this.hardFlux += amount;
    } else {
      this.softFlux += amount;
    }

    if (this.totalFlux >= this.maxFlux) {
      const excess = this.totalFlux - this.maxFlux;
      return this.triggerOverload(excess);
    }
    return false;
  }

  /**
   * 增加幅能但不触发过载 (对齐原版 ship_systems.csv: canNotCauseOverload=TRUE)。
   * 相位线圈的开启与维持成本会顶到容量上限，但绝不会把舰船打进过载。
   */
  public increaseFluxClamped(amount: number, isHard: boolean): void {
    if (!(amount > 0)) return;
    this.timeSinceFluxIncrease = 0;
    if (isHard) {
      this.hardFlux = Math.min(this.maxFlux, this.hardFlux + amount);
    } else {
      const room = Math.max(0, this.maxFlux - this.hardFlux);
      this.softFlux = Math.min(room, this.softFlux + amount);
    }
  }

  /**
   * 触发严重过载 (严格对齐 com.fs.starfarer.combat.entities.ship.D.java: beginOverload)
   * 官方按舰级基础过载时长:
   * CAPITAL_SHIP: 10.0s, CRUISER: 8.0s, DESTROYER: 6.0s, FRIGATE: 4.0s, FIGHTER: 10.0s
   * 超量幅能惩罚: f3 += excess / 25.0f (最大上限 15.0s)
   */
  public triggerOverload(excessFlux = 0): boolean {
    const started = this.beginOverload(excessFlux);
    if (started) sound.play('overload', 1.0);
    return started;
  }

  /** Native forceOverload adds seconds to the hull-size base, without normal hit audio. */
  public forceOverload(extraSeconds = 0): boolean {
    return this.beginOverload(extraSeconds * 25);
  }

  /** AcausalDisruptor uses a total duration, not forceOverload's extra seconds. */
  public overloadFor(seconds: number): boolean {
    if (!Number.isFinite(seconds) || seconds <= 0 || !this.beginOverload(0)) return false;
    this.overloadDuration = this.overloadTimer = seconds * this.overloadTimeMultiplier;
    sound.play('overload', 1);
    return true;
  }

  private beginOverload(excessFlux: number): boolean {
    // D.beginOverload never restarts an existing overload or interrupts venting.
    if (this.isOverloaded || this.isVenting) return false;
    this.isOverloaded = true;

    let baseDuration = 5.0;
    switch (this.hullSize) {
      case 'CAPITAL_SHIP': baseDuration = 10.0; break;
      case 'CRUISER': baseDuration = 8.0; break;
      case 'DESTROYER': baseDuration = 6.0; break;
      case 'FRIGATE': baseDuration = 4.0; break;
      case 'FIGHTER': baseDuration = 10.0; break;
    }

    if (excessFlux > 0) {
      baseDuration += excessFlux / 25.0;
    }
    baseDuration = Math.min(15.0, baseDuration) * this.overloadTimeMultiplier;

    this.overloadDuration = baseDuration;
    this.overloadTimer = baseDuration;
    this.zeroFluxTimer = 0;
    this.isEngineBoostActive = false;
    return true;
  }

  public initialVentFlux = 0;

  /**
   * 获取预计排散完毕剩余时长 (严格对齐 D.java: getTimeToVent)
   */
  public getTimeToVent(): number {
    const ventRate = this.baseDissipation * 2.0 * this.ventRateMultiplier;
    return ventRate > 0 ? this.totalFlux / ventRate : 0;
  }

  /**
   * 开始主动排散幅能 (严格对齐 D.java: ventFlux)
   */
  public startVenting(): boolean {
    if (this.isOverloaded || this.totalFlux <= 5) return false;
    this.isVenting = true;
    this.initialVentFlux = this.totalFlux;
    this.ventProgress = 0;
    this.zeroFluxTimer = 0;
    this.isEngineBoostActive = false;
    return true;
  }

  public cancelVenting() {
    this.isVenting = false;
    this.ventProgress = 0;
    this.initialVentFlux = 0;
    sound.stopLoop('flux_flush_loop');
  }

  /**
   * 60Hz 逻辑步长更新 (严格对齐 com.fs.starfarer.combat.entities.ship.D.java: advance)
   * @param dt 步长时间 (秒)
   * @param shieldActive 护盾是否开启
   */
  public update(dt: number, shieldActive: boolean, allowDissipation = true) {
    if (dt > 0) this.timeSinceFluxIncrease = this.isOverloaded || this.isVenting ? 0 : this.timeSinceFluxIncrease + dt;
    // 1. 处理过载状态倒计时与过载散热 (D.java: getOverloadDissipationRate = dissipation * 0.5f)
    if (this.isOverloaded) {
      this.overloadTimer -= dt;
      const overloadDissipation = this.baseDissipation * 0.5 * dt;
      
      // 过载散热 (优先耗散软幅能，随后耗散硬幅能)
      let d = overloadDissipation;
      if (this.softFlux > 0) {
        const sub = Math.min(this.softFlux, d);
        this.softFlux -= sub;
        d -= sub;
      }
      if (d > 0 && this.hardFlux > 0) {
        this.hardFlux = Math.max(0, this.hardFlux - d);
      }

      if (this.overloadTimer <= 0) {
        this.isOverloaded = false;
        this.overloadTimer = 0;
      }
      this.zeroFluxTimer = 0;
      this.isEngineBoostActive = false;
      return;
    }

    // 2. 主动排散 (D.java: getVentRate = dissipation * 2.0f)
    if (this.isVenting) {
      const ventRate = this.baseDissipation * 2.0 * this.ventRateMultiplier * dt;
      let d = ventRate;
      if (this.softFlux > 0) {
        const sub = Math.min(this.softFlux, d);
        this.softFlux -= sub;
        d -= sub;
      }
      if (d > 0 && this.hardFlux > 0) {
        this.hardFlux = Math.max(0, this.hardFlux - d);
      }

      if (this.initialVentFlux > 0) {
        this.ventProgress = Math.max(0, Math.min(1.0, 1.0 - this.totalFlux / this.initialVentFlux));
      }

      if (this.totalFlux <= 0) {
        this.softFlux = 0;
        this.hardFlux = 0;
        this.isVenting = false;
        this.ventProgress = 0;
        this.initialVentFlux = 0;
        sound.stopLoop('flux_flush_loop');
      }
      this.zeroFluxTimer = 0;
      this.isEngineBoostActive = false;
      return;
    }

    // 3. 常规被动耗散 (D.java: cfr_renamed_4)
    let dissipation = allowDissipation ? this.baseDissipation * dt : 0;
    
    // 护盾开启时：硬幅能绝对无法消散，仅耗散软幅能
    if (shieldActive) {
      if (this.softFlux > 0) {
        this.softFlux = Math.max(0, this.softFlux - dissipation);
      }
    } else {
      // 护盾关闭时：优先耗散软幅能，随后耗散硬幅能
      if (this.softFlux > 0) {
        const d = Math.min(this.softFlux, dissipation);
        this.softFlux -= d;
        dissipation -= d;
      }
      if (dissipation > 0 && this.hardFlux > 0) {
        this.hardFlux = Math.max(0, this.hardFlux - dissipation);
      }
    }

    // 4. 零幅能引擎推进加力检测 (D.java: isEngineBoostActive)
    if (this.totalFlux <= 0 && !this.isOverloaded && !this.isVenting) {
      this.zeroFluxTimer += dt;
      if (this.zeroFluxTimer >= this.boostDelay) {
        this.isEngineBoostActive = true;
      }
    } else {
      this.zeroFluxTimer = 0;
      this.isEngineBoostActive = false;
    }
  }
}
