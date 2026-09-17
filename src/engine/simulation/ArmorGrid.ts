import { Vector2 } from '../math/Vector2';

export type DamageType = 'KINETIC' | 'HIGH_EXPLOSIVE' | 'ENERGY' | 'FRAGMENTATION';

export interface DamageResult {
  armorDamage: number;
  hullDamage: number;
  residualArmor: number;
}

/**
 * 远行星号经典 2D 装甲网格损伤矩阵 (Armor Grid)
 * 核心机制:
 * 1. 舰船装甲并非一个单一血条，而是分布在由 N x M 个单元格组成的 2D 网格上。
 * 2. 命中某单元格时，有效装甲由该单元格及其周围 3x3 邻域单元格的装甲值共同加权分担。
 * 3. 减伤公式: DR = Damage / (Damage + EffectiveArmor)。
 * 4. 动能/高爆/能量/破片对装甲与护盾各具不同的伤害倍率。
 */
export class ArmorGrid {
  public cols: number;
  public rows: number;
  public cellWidth: number;
  public cellHeight: number;
  /** 舰船局部坐标中装甲网格左下角；不再假定网格以 (0,0) 对称居中。 */
  public minX: number;
  public minY: number;
  public maxArmorRating: number;
  public maxCellArmor: number;
  
  // 单元格装甲当前值数组 (一维扁平存储，优化内存连续性)
  public cells: Float32Array;
  // 脏版本计数器，供 ShipPaperDoll 等装甲可视化按需重绘
  public dirtyVersion = 0;
  public damageTakenModifiers?: (type: DamageType) => { armor: number; hull: number };
  public effectiveArmorMultiplier = 1;
  public dynamicEffectiveArmorMultiplier?: () => number;
  public maxDamageReduction = .85;
  public minArmorFractionMultiplier = 1;
  public onCellDamage?: (c: number, r: number, damage: number) => void;

  constructor(
    cols = 16,
    rows = 8,
    cellWidth = 20,
    cellHeight = 20,
    maxArmorRating = 1500,
    minX = -(cols * cellWidth) / 2,
    minY = -(rows * cellHeight) / 2
  ) {
    this.cols = cols;
    this.rows = rows;
    this.cellWidth = cellWidth;
    this.cellHeight = cellHeight;
    this.minX = minX;
    this.minY = minY;
    this.maxArmorRating = maxArmorRating;
    
    // 原版公式：单个单元格满装甲约为总装甲的 1/15
    this.maxCellArmor = Math.max(1, maxArmorRating / 15);
    this.cells = new Float32Array(cols * rows);
    this.cells.fill(this.maxCellArmor);
  }

  public getCell(c: number, r: number): number {
    if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return 0;
    return this.cells[r * this.cols + c];
  }

  public setCell(c: number, r: number, val: number) {
    if (c >= 0 && c < this.cols && r >= 0 && r < this.rows) {
      const idx = r * this.cols + c;
      const next = Math.max(0, val);
      if (this.cells[idx] !== next) {
        this.cells[idx] = next;
        this.dirtyVersion++;
      }
    }
  }

  /**
   * 将舰船局部坐标转换为装甲网格坐标 (c, r)
   */
  public localToGrid(localPos: Vector2): { c: number; r: number } {
    // Native grids floor relative to the pivot, then add integer support-cell offsets.
    // Subtracting a floating min first can put Doom's 23.8-unit origin into the wrong cell.
    const originX = this.minX / this.cellWidth, originY = this.minY / this.cellHeight;
    const c = Math.abs(originX - Math.round(originX)) < 1e-9
      ? Math.floor(localPos.x / this.cellWidth) - Math.round(originX)
      : Math.floor((localPos.x - this.minX) / this.cellWidth);
    const r = Math.abs(originY - Math.round(originY)) < 1e-9
      ? Math.floor(localPos.y / this.cellHeight) - Math.round(originY)
      : Math.floor((localPos.y - this.minY) / this.cellHeight);
    return {
      c: Math.max(0, Math.min(this.cols - 1, c)),
      r: Math.max(0, Math.min(this.rows - 1, r))
    };
  }

  /** 将装甲格坐标还原为舰船局部坐标中的格子中心。 */
  public getCellCenterLocal(c: number, r: number): Vector2 {
    const safeC = Math.max(0, Math.min(this.cols - 1, c));
    const safeR = Math.max(0, Math.min(this.rows - 1, r));
    return new Vector2(
      this.minX + (safeC + 0.5) * this.cellWidth,
      this.minY + (safeR + 0.5) * this.cellHeight
    );
  }

  /**
   * 计算指定单元格处的局部有效装甲 (严格对齐 com.fs.starfarer.combat.entities.ship.new.java)
   * 采用 5x5 邻域排除 4 个角落 (±2, ±2) 的 21 单元格十字加权矩阵:
   * - 中心点 (0,0): 权重 1.0 (P_MULT / P_MULT = 0.06666667 / 0.06666667)
   * - 1 环相邻 8 格 (±1, ±1): 权重 1.0 (S_MULT / P_MULT = 0.06666667 / 0.06666667)
   * - 2 环外围十字 12 格 (±2, 0) 等: 权重 0.5 (T_MULT / P_MULT = 0.033333335 / 0.06666667)
   * - 保底残留装甲: maxArmorRating * minArmorFraction (0.05)
   */
  public getEffectiveArmor(c: number, r: number): number {
    let effectiveArmor = 0;
    const P_MULT = 0.06666667;
    const S_MULT = 0.06666667;
    const T_MULT = 0.033333335;

    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        // 排除 5x5 矩阵的 4 个对角尖角，得到精确 21 单元格十字矩阵
        if (Math.abs(dx) === 2 && Math.abs(dy) === 2) continue;

        let weight = (dx === 0 && dy === 0) ? P_MULT : (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) ? S_MULT : T_MULT;
        weight /= P_MULT; // 归一化: 中心与1环为 1.0，2环外十字为 0.5
        effectiveArmor += this.getCell(c + dx, r + dy) * weight;
      }
    }

    // 最低保底残留装甲 (严格对齐 settings.json: minArmorFraction = 0.05)
    const minResidual = this.maxArmorRating * 0.05 * this.minArmorFractionMultiplier;
    return Math.max(effectiveArmor * this.effectiveArmorMultiplier * (this.dynamicEffectiveArmorMultiplier?.() ?? 1), minResidual);
  }

  /**
   * 受到伤害结算 (严格对齐 com.fs.starfarer.combat.entities.ship.new.java: applyDamage / o00000)
   * @param localHitPos 舰船局部坐标
   * @param baseDamage 伤害基数
   * @param damageType 伤害类型 (KINETIC, HIGH_EXPLOSIVE, ENERGY, FRAGMENTATION)
   * @param hitStrength 单发冲击力 (若未提供则为 baseDamage)
   * @param isDps 是否为持续性照射光束 (是则 hitStrength *= 0.5)
   */
  public takeDamage(
    localHitPos: Vector2,
    baseDamage: number,
    damageType: DamageType,
    hitStrength?: number,
    isDps = false
  ): DamageResult {
    // 1. 伤害倍率映射 (严格对齐 com.fs.starfarer.api.combat.DamageType)
    let armorMult = 1.0;
    let hullMult = 1.0;
    switch (damageType) {
      case 'KINETIC':
        armorMult = 0.5; // 动能对装甲 50%
        hullMult = 1.0;
        break;
      case 'HIGH_EXPLOSIVE':
        armorMult = 2.0; // 高爆对装甲 200%
        hullMult = 1.0;
        break;
      case 'ENERGY':
        armorMult = 1.0; // 能量 100%
        hullMult = 1.0;
        break;
      case 'FRAGMENTATION':
        armorMult = 0.25; // 破片对装甲 25%
        hullMult = 1.0;
        break;
    }

    const { c, r } = this.localToGrid(localHitPos);
    const effectiveArmor = this.getEffectiveArmor(c, r);

    const incoming = this.damageTakenModifiers?.(damageType);
    armorMult *= incoming?.armor ?? 1;
    hullMult *= incoming?.hull ?? 1;
    if (armorMult <= 0) return { armorDamage: 0, hullDamage: 0, residualArmor: effectiveArmor };
    // 2. 装甲减伤与实际伤害解算
    let modifiedDamage = baseDamage * armorMult;
    let effectiveHitStr = (hitStrength ?? baseDamage) * armorMult;
    if (isDps) {
      // 严格对齐 settings.json: dpsToHitStrengthMult = 0.5
      effectiveHitStr *= 0.5;
    }
    if (effectiveHitStr < 1.0) effectiveHitStr = 1.0;

    // Damage multiplier is hitStrength/(hitStrength+armor), with an 85%
    // maximum reduction (therefore a 15% minimum damage multiplier).
    const rawDamageMult = effectiveHitStr / (effectiveHitStr + effectiveArmor);
    const damageMult = Math.max(1 - this.maxDamageReduction, rawDamageMult);
    const damageAfterReduction = modifiedDamage * damageMult;

    // 3. 21 单元格装甲扣减与船体溢出穿透计算
    // P_MULT = 1/15, S_MULT = 1/15, T_MULT = 1/30 (总计 1/15 + 8/15 + 12/30 = 15/15 = 100%)
    const pDamage = damageAfterReduction * 0.06666667;
    const sDamage = damageAfterReduction * 0.06666667;
    const tDamage = damageAfterReduction * 0.033333335;
    const hullFactor = (hullMult / armorMult);

    let totalArmorDamage = 0;
    let totalHullDamage = 0;

    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) === 2 && Math.abs(dy) === 2) continue;

        const cellDmg = (dx === 0 && dy === 0)
          ? pDamage
          : (Math.abs(dx) <= 1 && Math.abs(dy) <= 1)
          ? sDamage
          : tDamage;

        const curArmor = this.getCell(c + dx, r + dy);
        const nextArmor = Math.max(0, curArmor - cellDmg);
        const overflow = Math.max(0, cellDmg - curArmor);

        this.setCell(c + dx, r + dy, nextArmor);
        if (cellDmg > 0) this.onCellDamage?.(c + dx, r + dy, cellDmg);
        totalArmorDamage += (curArmor - nextArmor);
        // 单元格装甲完全被击穿后，剩余溢出的伤害直接击入船体 HP
        totalHullDamage += overflow * hullFactor;
      }
    }

    return {
      armorDamage: totalArmorDamage,
      hullDamage: totalHullDamage,
      residualArmor: this.getEffectiveArmor(c, r)
    };
  }

  /**
   * 获取全舰整体装甲完好度百分比 (0.0 ~ 1.0)
   */
  public getIntegrityPercentage(): number {
    let total = 0;
    for (let i = 0; i < this.cells.length; i++) {
      total += this.cells[i];
    }
    const maxTotal = this.cells.length * this.maxCellArmor;
    return maxTotal > 0 ? total / maxTotal : 0;
  }
}
