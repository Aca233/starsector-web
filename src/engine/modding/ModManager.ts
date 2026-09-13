import { ShieldType } from '../simulation/Shield';
import { ShipSystemType } from '../simulation/ShipSystem';
import { WeaponMountType, WeaponSlotSize, WeaponSpec } from '../simulation/Weapon';
import { i18n } from '../i18n/LocalizationManager';
import { ONSLAUGHT_BOUNDS, PARAGON_BOUNDS, DOOM_BOUNDS } from '../data/hull_bounds';
import { contentRegistry } from '../content/ContentRegistry';

export interface WeaponMountSlotConfig {
  slotId: string;
  mountType: WeaponMountType;
  slotSize: WeaponSlotSize;
  x: number; // 舰船局部坐标
  y: number;
  baseAngleDeg: number;
  arcDeg: number;
  defaultWeaponId?: string;
}

export interface EngineSlotConfig {
  x: number;
  y: number;
  angleDeg: number;
  width: number;
  length: number;
  style: 'LOW_TECH' | 'HIGH_TECH' | 'MIDLINE';
}

export interface ShipSpec {
  id: string;
  nameKey: string;
  descKey: string;
  designationKey: string;
  spriteUrl: string;
  spriteWidth: number; // 严格对齐官方贴图真实宽高
  spriteHeight: number;
  pivotX: number; // 严格对齐官方 .ship center 像素旋转中心
  pivotY: number;
  collisionRadius: number;
  mass: number;
  
  // 机动参数
  maxSpeed: number;
  acceleration: number;
  deceleration: number;
  maxTurnRateDeg: number; // 度/秒
  turnAccelerationDeg: number;
  
  // 生存参数
  hitpoints: number;
  armorRating: number;
  armorCols: number;
  armorRows: number;
  
  // 幅能参数
  maxFlux: number;
  fluxDissipation: number;
  
  // 战备与峰值性能参数 (1:1 ship_data.csv: peak CR sec, CR loss/sec, designation)
  peakCRSec?: number;
  crLossPerSec?: number;
  designation?: string;
  
  // 防御与系统
  shieldType: ShieldType;
  shieldArcDeg: number;
  shieldRadius: number;
  shieldCenterX?: number;
  shieldCenterY?: number;
  shieldEfficiency: number;
  systemType: ShipSystemType;
  
  // 挂点与发动机
  weaponSlots: WeaponMountSlotConfig[];
  engineSlots: EngineSlotConfig[];
  weaponRangeMult?: number; // 战列舰火控扩展核心 (DTC/ATC 射程加成倍率)
  fighterBays?: number; // 航母机库甲板数 (原版 ship_data.csv: fighter bays)
  
  // 原版 2D 碰撞多边形顶点 (Ship 局部坐标)
  bounds: [number, number][];

  // 默认武器编组 (Groups 1-5)
  defaultWeaponGroups?: {
    index: number;
    weaponSlotIds: string[];
    mode: 'LINKED' | 'ALTERNATING';
    isAutofire: boolean;
  }[];
  
  // 随包附带的本地化字典 (可选)
  i18n?: {
    zh_CN?: Record<string, string>;
    en_US?: Record<string, string>;
  };
}

export interface ModPackage {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  ships?: ShipSpec[];
  weapons?: WeaponSpec[];
  i18n?: {
    zh_CN?: Record<string, string>;
    en_US?: Record<string, string>;
  };
}

/**
 * 现代化模块化 Mod 管理与舰船注册中心 (ModManager)
 * 核心设计:
 * 1. 彻底告别原版繁琐易冲突的 CSV 拼接和 Java 脚本编译。
 * 2. 舰船即单一自包含声明式蓝图 (ShipSpec)，包含属性、挂点、尾焰、专属战术系统及多语言文本。
 * 3. 玩家可动态导入/热挂载 Mod，无损扩展新舰船与新武器。
 */
export class ModManager {
  private static instance: ModManager;
  private loadedMods: Map<string, ModPackage> = new Map();

  private constructor() {
    // 注册基准战舰：攻势级与典范级
    this.registerBuiltInShips();
  }

  public static getInstance(): ModManager {
    if (!ModManager.instance) {
      ModManager.instance = new ModManager();
    }
    return ModManager.instance;
  }

  public registerShip(spec: ShipSpec) {
    contentRegistry.registerShip(spec);
    if (spec.i18n) {
      if (spec.i18n.zh_CN) i18n.registerStrings('zh_CN', spec.i18n.zh_CN);
      if (spec.i18n.en_US) i18n.registerStrings('en_US', spec.i18n.en_US);
    }
  }

  public getShip(id: string): ShipSpec | undefined {
    return contentRegistry.getShip(id);
  }

  public getAllShips(): ShipSpec[] {
    return contentRegistry.getAllShips();
  }

  public registerWeapon(spec: WeaponSpec) {
    contentRegistry.registerWeapon(spec);
  }

  public getWeapon(id: string): WeaponSpec | undefined {
    return contentRegistry.getWeapon(id);
  }

  /**
   * 加载外部 Mod 包 (例如用户拖拽或通过 JSON 配置导入)
   */
  public loadMod(mod: ModPackage) {
    this.loadedMods.set(mod.id, mod);
    if (mod.i18n) {
      if (mod.i18n.zh_CN) i18n.registerStrings('zh_CN', mod.i18n.zh_CN);
      if (mod.i18n.en_US) i18n.registerStrings('en_US', mod.i18n.en_US);
    }
    if (mod.weapons) {
      for (const w of mod.weapons) this.registerWeapon(w);
    }
    if (mod.ships) {
      for (const s of mod.ships) this.registerShip(s);
    }
  }

  /**
   * 初始化官方基准两大战舰：攻势级 (Onslaught) 与 典范级 (Paragon)
   */
  private registerBuiltInShips() {
    // 1. 攻势级 战列舰 (Onslaught-class)
    const onslaught: ShipSpec = {
      id: 'onslaught',
      nameKey: 'ship.onslaught.name',
      descKey: 'ship.onslaught.desc',
      designationKey: 'ship.onslaught.designation',
      spriteUrl: '/game-assets/graphics/ships/onslaught/onslaught_base.png',
      spriteWidth: 288,
      spriteHeight: 384,
      pivotX: 144, // 严格对齐 onslaught.ship: center [144, 140] (384 - 140 = 244)
      pivotY: 244,
      collisionRadius: 275,
      mass: 3500,
      maxSpeed: 25, // 严格对齐 ship_data.csv: max speed 25
      acceleration: 10, // 严格对齐 ship_data.csv: acceleration 10
      deceleration: 10, // 严格对齐 ship_data.csv: deceleration 10
      maxTurnRateDeg: 4, // 严格对齐 ship_data.csv: max turn rate 4 deg/s
      turnAccelerationDeg: 4, // 严格对齐 ship_data.csv: turn acceleration 4 deg/s
      hitpoints: 20000,
      armorRating: 1750, // 极其厚重装甲
      armorCols: 16,
      armorRows: 10,
      maxFlux: 17000,
      fluxDissipation: 600,
      peakCRSec: 720,
      crLossPerSec: 0.25,
      designation: '战列舰',
      shieldType: 'FRONT',
      shieldArcDeg: 180, // 前向半圈盾
      shieldRadius: 240,
      shieldCenterX: 32, // 严格对齐 onslaught.ship: shieldCenter [32, 0]
      shieldCenterY: 0,
      shieldEfficiency: 1.0,
      systemType: 'BURN_DRIVE', // 冲刺推进
      weaponSlots: [
        // 双联装内置核心重炮 TPC (WS 016, WS 017 位于船体左右前突主炮位)
        { slotId: 'WS 016', mountType: 'HARDPOINT', slotSize: 'LARGE', x: 198, y: 70, baseAngleDeg: 0, arcDeg: 5, defaultWeaponId: 'tpc' },
        { slotId: 'WS 017', mountType: 'HARDPOINT', slotSize: 'LARGE', x: 198, y: -70, baseAngleDeg: 0, arcDeg: 5, defaultWeaponId: 'tpc' },
        // 前向/侧向重型旋转炮塔
        { slotId: 'WS 019', mountType: 'TURRET', slotSize: 'LARGE', x: 126, y: 0, baseAngleDeg: 0, arcDeg: 150, defaultWeaponId: 'mark9' },
        { slotId: 'WS 018', mountType: 'TURRET', slotSize: 'LARGE', x: 77, y: 88, baseAngleDeg: 80, arcDeg: 135, defaultWeaponId: 'mark9' },
        { slotId: 'WS 020', mountType: 'TURRET', slotSize: 'LARGE', x: 77, y: -87, baseAngleDeg: -80, arcDeg: 135, defaultWeaponId: 'mark9' },
        // 中型实弹炮塔
        { slotId: 'WS 012', mountType: 'TURRET', slotSize: 'MEDIUM', x: 49, y: 18, baseAngleDeg: 60, arcDeg: 140, defaultWeaponId: 'hveldriver' },
        { slotId: 'WS 013', mountType: 'TURRET', slotSize: 'MEDIUM', x: 49, y: -18, baseAngleDeg: -60, arcDeg: 140, defaultWeaponId: 'hveldriver' },
        { slotId: 'WS 014', mountType: 'TURRET', slotSize: 'MEDIUM', x: -9, y: 22, baseAngleDeg: 170, arcDeg: 120, defaultWeaponId: 'dualflak' },
        { slotId: 'WS 015', mountType: 'TURRET', slotSize: 'MEDIUM', x: -9, y: -22, baseAngleDeg: 190, arcDeg: 120, defaultWeaponId: 'dualflak' },
        // 歼灭者火箭发射巢 (WS 021 - WS 024 严格对齐 onslaught.ship)
        { slotId: 'WS 021', mountType: 'TURRET', slotSize: 'MEDIUM', x: -9, y: 65, baseAngleDeg: 30, arcDeg: 120, defaultWeaponId: 'annihilatorpod' },
        { slotId: 'WS 022', mountType: 'TURRET', slotSize: 'MEDIUM', x: 8, y: 40, baseAngleDeg: 20, arcDeg: 120, defaultWeaponId: 'annihilatorpod' },
        { slotId: 'WS 023', mountType: 'TURRET', slotSize: 'MEDIUM', x: 8, y: -40, baseAngleDeg: -20, arcDeg: 120, defaultWeaponId: 'annihilatorpod' },
        { slotId: 'WS 024', mountType: 'TURRET', slotSize: 'MEDIUM', x: -9, y: -65, baseAngleDeg: -30, arcDeg: 120, defaultWeaponId: 'annihilatorpod' }
      ],
      engineSlots: [
        { x: -82, y: 70, angleDeg: 160, width: 20, length: 64, style: 'LOW_TECH' },
        { x: -103, y: 40, angleDeg: 180, width: 20, length: 64, style: 'LOW_TECH' },
        { x: -113, y: 11, angleDeg: 180, width: 30, length: 100, style: 'LOW_TECH' },
        { x: -113, y: -11, angleDeg: 180, width: 30, length: 100, style: 'LOW_TECH' },
        { x: -103, y: -40, angleDeg: 180, width: 20, length: 64, style: 'LOW_TECH' },
        { x: -82, y: -70, angleDeg: 200, width: 20, length: 64, style: 'LOW_TECH' }
      ],
      bounds: ONSLAUGHT_BOUNDS,
      weaponRangeMult: 1.6, // Dedicated Targeting Core (ITU: +60% 战列舰射程加成)
      defaultWeaponGroups: [
        { index: 0, weaponSlotIds: ['WS 016', 'WS 017'], mode: 'LINKED', isAutofire: false },
        { index: 1, weaponSlotIds: ['WS 021', 'WS 022', 'WS 023', 'WS 024'], mode: 'ALTERNATING', isAutofire: false },
        { index: 2, weaponSlotIds: ['WS 019'], mode: 'LINKED', isAutofire: true },
        { index: 3, weaponSlotIds: ['WS 012', 'WS 013'], mode: 'LINKED', isAutofire: true },
        { index: 4, weaponSlotIds: ['WS 014', 'WS 015'], mode: 'LINKED', isAutofire: true }
      ]
    };

    // 2. 典范级 战列舰 (Paragon-class)
    const paragon: ShipSpec = {
      id: 'paragon',
      nameKey: 'ship.paragon.name',
      descKey: 'ship.paragon.desc',
      designationKey: 'ship.paragon.designation',
      spriteUrl: '/game-assets/graphics/ships/paragon.png',
      spriteWidth: 330,
      spriteHeight: 364,
      pivotX: 164, // 严格对齐 paragon.ship: center [164, 190] (364 - 190 = 174)
      pivotY: 174,
      collisionRadius: 270,
      mass: 3500,
      maxSpeed: 30, // 严格对齐 ship_data.csv: max speed 30
      acceleration: 15, // 严格对齐 ship_data.csv
      deceleration: 12,
      maxTurnRateDeg: 6,
      turnAccelerationDeg: 6,
      hitpoints: 18000,
      armorRating: 1500,
      armorCols: 14,
      armorRows: 14,
      maxFlux: 25000, // 极高幅能容量
      fluxDissipation: 1250, // 极高散热
      peakCRSec: 720,
      crLossPerSec: 0.25,
      designation: '战列舰',
      shieldType: 'OMNI',
      shieldArcDeg: 360, // 360 度全向无死角能量护盾
      shieldRadius: 270,
      shieldCenterX: 1, // 严格对齐 paragon.ship: shieldCenter [1, 0]
      shieldCenterY: 0,
      shieldEfficiency: 0.6, // 0.6 超高防御效率
      systemType: 'FORTRESS_SHIELD', // 堡垒护盾
      weaponRangeMult: 1.8, // Advanced Targeting Core (ATC: +80% ~ +100% 战列舰能量射程加成)
      weaponSlots: [
        // 4 门大型能量主挂点：2 门双联速子长矛 (WS 003, WS 004) + 2 门自动脉冲激光 (WS 001, WS 002)
        { slotId: 'WS 001', mountType: 'HARDPOINT', slotSize: 'LARGE', x: 163, y: -16, baseAngleDeg: 0, arcDeg: 5, defaultWeaponId: 'autopulse' },
        { slotId: 'WS 002', mountType: 'HARDPOINT', slotSize: 'LARGE', x: 163, y: 16, baseAngleDeg: 0, arcDeg: 5, defaultWeaponId: 'autopulse' },
        { slotId: 'WS 003', mountType: 'TURRET', slotSize: 'LARGE', x: 3, y: -99, baseAngleDeg: -80, arcDeg: 220, defaultWeaponId: 'tachyonlance' },
        { slotId: 'WS 004', mountType: 'TURRET', slotSize: 'LARGE', x: 3, y: 99, baseAngleDeg: 80, arcDeg: 220, defaultWeaponId: 'tachyonlance' },
        // 引力子压力光束与战术激光
        { slotId: 'WS 005', mountType: 'TURRET', slotSize: 'MEDIUM', x: 126, y: -40, baseAngleDeg: -20, arcDeg: 210, defaultWeaponId: 'gravitonbeam' },
        { slotId: 'WS 006', mountType: 'TURRET', slotSize: 'MEDIUM', x: 126, y: 40, baseAngleDeg: 20, arcDeg: 210, defaultWeaponId: 'gravitonbeam' },
        { slotId: 'WS 007', mountType: 'TURRET', slotSize: 'SMALL', x: 51, y: -90, baseAngleDeg: -70, arcDeg: 210, defaultWeaponId: 'taclaser' },
        { slotId: 'WS 008', mountType: 'TURRET', slotSize: 'SMALL', x: 51, y: 90, baseAngleDeg: 70, arcDeg: 210, defaultWeaponId: 'taclaser' }
      ],
      engineSlots: [
        { x: -179, y: 140, angleDeg: 180, width: 12, length: 48, style: 'HIGH_TECH' },
        { x: -179, y: -140, angleDeg: 180, width: 12, length: 48, style: 'HIGH_TECH' },
        { x: -187, y: 105, angleDeg: 180, width: 12, length: 48, style: 'HIGH_TECH' },
        { x: -187, y: -105, angleDeg: 180, width: 12, length: 48, style: 'HIGH_TECH' },
        { x: -189, y: 73, angleDeg: 180, width: 8, length: 32, style: 'HIGH_TECH' },
        { x: -189, y: -73, angleDeg: 180, width: 8, length: 32, style: 'HIGH_TECH' }
      ],
      bounds: PARAGON_BOUNDS,
      defaultWeaponGroups: [
        { index: 0, weaponSlotIds: ['WS 001', 'WS 002'], mode: 'LINKED', isAutofire: false },
        { index: 1, weaponSlotIds: ['WS 003', 'WS 004'], mode: 'LINKED', isAutofire: false },
        { index: 2, weaponSlotIds: ['WS 005', 'WS 006'], mode: 'LINKED', isAutofire: true },
        { index: 3, weaponSlotIds: ['WS 007', 'WS 008'], mode: 'LINKED', isAutofire: true }
      ]
    };

    // 3. 厄运级 相位打击巡洋舰 (Doom-class)
    const doom: ShipSpec = {
      id: 'doom',
      nameKey: 'ship.doom.name',
      descKey: 'ship.doom.desc',
      designationKey: 'ship.doom.designation',
      spriteUrl: '/game-assets/graphics/ships/phase/phase_ca.png',
      spriteWidth: 200,
      spriteHeight: 238,
      pivotX: 100, // 严格对齐 doom.ship: center [100, 105] (238 - 105 = 133)
      pivotY: 133,
      collisionRadius: 170,
      mass: 2200,
      maxSpeed: 75, // 严格对齐 ship_data.csv: max speed 75
      acceleration: 55,
      deceleration: 40,
      maxTurnRateDeg: 20,
      turnAccelerationDeg: 25,
      hitpoints: 8000,
      armorRating: 1250,
      armorCols: 12,
      armorRows: 12,
      maxFlux: 10000,
      fluxDissipation: 900,
      peakCRSec: 420,
      crLossPerSec: 0.25,
      designation: '相位巡洋舰',
      shieldType: 'PHASE', // 相位隐形披风
      shieldArcDeg: 360,
      shieldRadius: 155,
      shieldEfficiency: 1.0,
      systemType: 'MINE_STRIKE', // 核心专属系统：空雷突袭
      weaponSlots: [
        // 2 门死神鱼雷发射器 (WS 001, WS 002)
        { slotId: 'WS 001', mountType: 'HARDPOINT', slotSize: 'MEDIUM', x: 115, y: 31, baseAngleDeg: 0, arcDeg: 5, defaultWeaponId: 'typhoon' },
        { slotId: 'WS 002', mountType: 'HARDPOINT', slotSize: 'MEDIUM', x: 115, y: -30, baseAngleDeg: 0, arcDeg: 5, defaultWeaponId: 'typhoon' },
        // 4 门赛博 SRM 导弹 (WS 003 ~ WS 006)
        { slotId: 'WS 003', mountType: 'HARDPOINT', slotSize: 'SMALL', x: 109, y: 70, baseAngleDeg: 0, arcDeg: 5, defaultWeaponId: 'sabot' },
        { slotId: 'WS 004', mountType: 'HARDPOINT', slotSize: 'SMALL', x: 114, y: 47, baseAngleDeg: 0, arcDeg: 5, defaultWeaponId: 'sabot' },
        { slotId: 'WS 005', mountType: 'HARDPOINT', slotSize: 'SMALL', x: 114, y: -47, baseAngleDeg: 0, arcDeg: 5, defaultWeaponId: 'sabot' },
        { slotId: 'WS 006', mountType: 'HARDPOINT', slotSize: 'SMALL', x: 109, y: -70, baseAngleDeg: 0, arcDeg: 5, defaultWeaponId: 'sabot' },
        // 2 门重型冲击波炮塔 (WS 007, WS 008)
        { slotId: 'WS 007', mountType: 'TURRET', slotSize: 'MEDIUM', x: 90, y: 68, baseAngleDeg: 45, arcDeg: 210, defaultWeaponId: 'heavyblaster' },
        { slotId: 'WS 008', mountType: 'TURRET', slotSize: 'MEDIUM', x: 90, y: -68, baseAngleDeg: -45, arcDeg: 210, defaultWeaponId: 'heavyblaster' },
        // 4 门点防御脉冲激光 (WS 009 ~ WS 012)
        { slotId: 'WS 009', mountType: 'TURRET', slotSize: 'SMALL', x: -58, y: 66, baseAngleDeg: 90, arcDeg: 210, defaultWeaponId: 'pdburst' },
        { slotId: 'WS 010', mountType: 'TURRET', slotSize: 'SMALL', x: -58, y: -66, baseAngleDeg: -90, arcDeg: 210, defaultWeaponId: 'pdburst' },
        { slotId: 'WS 011', mountType: 'TURRET', slotSize: 'SMALL', x: 63, y: 80, baseAngleDeg: 90, arcDeg: 225, defaultWeaponId: 'pdburst' },
        { slotId: 'WS 012', mountType: 'TURRET', slotSize: 'SMALL', x: 63, y: -80, baseAngleDeg: -90, arcDeg: 225, defaultWeaponId: 'pdburst' }
      ],
      engineSlots: [
        { x: -99, y: 63, angleDeg: 180, width: 12, length: 32, style: 'HIGH_TECH' },
        { x: -99, y: -62, angleDeg: 180, width: 12, length: 32, style: 'HIGH_TECH' },
        { x: -102, y: 53, angleDeg: 180, width: 12, length: 48, style: 'HIGH_TECH' },
        { x: -102, y: 34, angleDeg: 180, width: 12, length: 48, style: 'HIGH_TECH' },
        { x: -102, y: -33, angleDeg: 180, width: 12, length: 48, style: 'HIGH_TECH' },
        { x: -102, y: -52, angleDeg: 180, width: 12, length: 48, style: 'HIGH_TECH' },
        { x: -94, y: 17, angleDeg: 180, width: 16, length: 64, style: 'HIGH_TECH' },
        { x: -94, y: -17, angleDeg: 180, width: 16, length: 64, style: 'HIGH_TECH' }
      ],
      bounds: DOOM_BOUNDS,
      defaultWeaponGroups: [
        { index: 0, weaponSlotIds: ['WS 003', 'WS 004', 'WS 005', 'WS 006'], mode: 'ALTERNATING', isAutofire: false },
        { index: 1, weaponSlotIds: ['WS 001', 'WS 002'], mode: 'ALTERNATING', isAutofire: false },
        { index: 2, weaponSlotIds: ['WS 007', 'WS 008'], mode: 'LINKED', isAutofire: true },
        { index: 3, weaponSlotIds: ['WS 009', 'WS 010', 'WS 011', 'WS 012'], mode: 'LINKED', isAutofire: true }
      ]
    };

    // 4. 阔剑重型战斗机 (Broadsword Heavy Fighter)
    const broadsword: ShipSpec = {
      id: 'broadsword',
      nameKey: 'ship.broadsword.name',
      descKey: 'ship.broadsword.desc',
      designationKey: 'ship.broadsword.designation',
      spriteUrl: '/game-assets/graphics/ships/broadsword.png',
      spriteWidth: 30,
      spriteHeight: 33,
      pivotX: 15,
      pivotY: 20, // 严格对齐 broadsword.ship: center [15, 13] -> (33 - 13 = 20)
      collisionRadius: 28,
      mass: 30,
      maxSpeed: 200,
      acceleration: 220,
      deceleration: 160,
      maxTurnRateDeg: 90,
      turnAccelerationDeg: 180,
      hitpoints: 550,
      armorRating: 120,
      armorCols: 4,
      armorRows: 4,
      maxFlux: 200,
      fluxDissipation: 80,
      shieldType: 'FRONT',
      shieldArcDeg: 90,
      shieldRadius: 22,
      shieldEfficiency: 1.0,
      systemType: 'NONE',
      weaponSlots: [
        { slotId: 'WS 001', mountType: 'TURRET', slotSize: 'SMALL', x: 2, y: 7, baseAngleDeg: 0, arcDeg: 15, defaultWeaponId: 'lightmg' },
        { slotId: 'WS 002', mountType: 'TURRET', slotSize: 'SMALL', x: 2, y: -7, baseAngleDeg: 0, arcDeg: 15, defaultWeaponId: 'lightmg' }
      ],
      engineSlots: [
        { x: -11, y: 6, angleDeg: 180, width: 8, length: 24, style: 'LOW_TECH' },
        { x: -11, y: -5, angleDeg: 180, width: 8, length: 24, style: 'LOW_TECH' }
      ],
      bounds: [
        [-5, 12],
        [20, 0],
        [-5, -12],
        [-10, 0]
      ],
      defaultWeaponGroups: [
        { index: 0, weaponSlotIds: ['WS 001', 'WS 002'], mode: 'LINKED', isAutofire: true }
      ]
    };

    // 5. 匕首级鱼雷轰炸机 (Dagger Torpedo Bomber)
    const dagger: ShipSpec = {
      id: 'dagger',
      nameKey: 'ship.dagger.name',
      descKey: 'ship.dagger.desc',
      designationKey: 'ship.dagger.designation',
      spriteUrl: '/game-assets/graphics/ships/dagger_trp.png',
      spriteWidth: 26,
      spriteHeight: 34,
      pivotX: 15,
      pivotY: 18, // 严格对齐 dagger.ship: center [15, 16] -> 34 - 16 = 18
      collisionRadius: 39,
      mass: 35,
      maxSpeed: 180,
      acceleration: 200,
      deceleration: 140,
      maxTurnRateDeg: 80,
      turnAccelerationDeg: 160,
      hitpoints: 450,
      armorRating: 100,
      armorCols: 3,
      armorRows: 3,
      maxFlux: 250,
      fluxDissipation: 90,
      shieldType: 'FRONT',
      shieldArcDeg: 100,
      shieldRadius: 28,
      shieldEfficiency: 0.9,
      systemType: 'NONE',
      weaponSlots: [
        { slotId: 'WS 002', mountType: 'HIDDEN', slotSize: 'SMALL', x: 7, y: 0, baseAngleDeg: 0, arcDeg: 10, defaultWeaponId: 'atropos_single' }
      ],
      engineSlots: [
        { x: -13, y: 0, angleDeg: 180, width: 12, length: 40, style: 'HIGH_TECH' }
      ],
      bounds: [
        [8, 14],
        [19, 0],
        [6, -9],
        [-2, -4],
        [-12, -5],
        [-11, 5],
        [0, 5]
      ],
      defaultWeaponGroups: [
        { index: 0, weaponSlotIds: ['WS 002'], mode: 'LINKED', isAutofire: false }
      ]
    };

    this.registerShip(onslaught);
    this.registerShip(paragon);
    this.registerShip(doom);
    this.registerShip(broadsword);
    this.registerShip(dagger);
  }
}

export const modManager = ModManager.getInstance();
