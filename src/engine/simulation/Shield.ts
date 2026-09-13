import { Vector2 } from '../math/Vector2';
import { DamageType } from './ArmorGrid';

export type ShieldType = 'FRONT' | 'OMNI' | 'PHASE' | 'NONE';

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
 */
export class Shield {
  public type: ShieldType;
  public maxArcDeg: number; // 最大展开弧度 (度)
  public radius: number; // 护盾球体半径 (像素)
  public efficiency: number; // 护盾受损转幅能效率 (越低越肉)
  public upkeepRate: number; // 维持每秒幅能消耗
  
  public isActive = false;
  public currentArcDeg = 0; // 当前已展开弧度 (度)
  public facingAngleRad = 0; // 当前护盾中心朝向 (弧度)
  public targetFacingAngleRad = 0;
  public unfoldRateDeg = 360; // 展开速率 (度/秒)
  
  public ripples: ShieldHitRipple[] = [];

  public get isPhased(): boolean {
    return this.type === 'PHASE' && this.isActive;
  }

  constructor(
    type: ShieldType = 'FRONT',
    maxArcDeg = 180,
    radius = 250,
    efficiency = 1.0,
    upkeepRate = 150
  ) {
    this.type = type;
    this.maxArcDeg = maxArcDeg;
    this.radius = radius;
    this.efficiency = efficiency;
    this.upkeepRate = upkeepRate;
    if (type === 'PHASE') {
      this.upkeepRate = 1200; // 严格对齐 ship_data.csv: doom phase upkeep 1200/s
    }
  }

  public toggle(): boolean {
    this.isActive = !this.isActive;
    return this.isActive;
  }

  public setActive(active: boolean) {
    this.isActive = active;
  }

  /**
   * 判断某个击中点是否被当前护盾阻挡
   * @param shipPos 舰船中心世界坐标
   * @param hitWorldPos 击中点世界坐标
   * @param shipFacing 舰船自身朝向 (弧度)
   */
  public isHitBlocked(shipPos: Vector2, hitWorldPos: Vector2, shipFacing: number): boolean {
    if (!this.isActive || this.currentArcDeg <= 5 || this.type === 'NONE' || this.type === 'PHASE') {
      return false;
    }

    // 击中点相对于舰船中心的角度
    const hitAngle = Math.atan2(hitWorldPos.y - shipPos.y, hitWorldPos.x - shipPos.x);
    
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
