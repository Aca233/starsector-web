import { Vector2 } from '../math/Vector2';
import { DamageType } from './ArmorGrid';

export type WeaponMountType = 'TURRET' | 'HARDPOINT' | 'HIDDEN';
export type WeaponSlotSize = 'SMALL' | 'MEDIUM' | 'LARGE';

export interface ProximityFuseSpec {
  range: number; // 接近引信引爆距离 (px)
  explosionRadius: number; // 爆炸范围杀伤波及半径 (px)
  soundKey?: string;
}

/**
 * 原版枪口爆炸风粒子规格 (1:1 com.fs.starfarer.api.loading.MuzzleFlashSpec & _class.java)
 */
export interface MuzzleFlashSpec {
  length: number;
  spread: number;
  particleSizeMin: number;
  particleSizeRange: number;
  particleDuration: number;
  particleCount: number;
  particleColor: [number, number, number, number];
}

/** Launcher smoke/backblast is visual-only and must not alter projectile physics. */
export interface LauncherSmokeSpec {
  particleSizeMin: number;
  particleSizeRange: number;
  cloudParticleCount: number;
  cloudDuration: number;
  cloudRadius: number;
  blowbackParticleCount: number;
  blowbackDuration: number;
  blowbackLength: number;
  blowbackSpread: number;
  particleColor: [number, number, number, number];
}

/** Source missile-engine sprite parameters, separate from acceleration/turning mechanics. */
export interface MissileEngineVisualSpec {
  nozzleOffset: number;
  width: number;
  length: number;
  color: [number, number, number, number];
  glowSizeMult?: number;
  glowAlternateColor?: [number, number, number, number];
}

/** Persistent visual trail contract. All dimensions are world units/seconds, not damage radii. */
export interface MissileTrailSpec {
  duration: number;
  baseWidth: number;
  widenMult: number;
  minSeg: number;
  spawnOffset: number;
  color: [number, number, number, number];
  blendMode: 'NORMAL' | 'GLOW';
}

/** Top-level .proj missile explosion fields. Purely visual; never a damage/collision radius. */
export interface MissileExplosionVisualSpec {
  radius: number;
  color: [number, number, number, number];
}

export interface WeaponSpec {
  id: string;
  nameKey: string;
  type: DamageType;
  mountSize: WeaponSlotSize;
  isBeam: boolean;
  damagePerShot: number;
  damagePerSecond: number;
  fluxPerShot: number;
  range: number;
  refireDelay: number; // 射击间隔 (秒)
  projSpeed: number;
  projRadius: number;
  color: [number, number, number];

  // 真实转向角速度与散布规格 (严格对齐 weapon_data.csv)
  turnRateDegPerSec?: number; // 炮塔每秒转速 (度/秒)
  minSpread?: number; // 最小散布 (度)
  maxSpread?: number; // 最大散布 (度)
  spreadPerShot?: number; // 单发累积散布 (度)
  spreadDecay?: number; // 散布恢复速率 (度/秒)

  // 真实视觉与动画规格
  turretSpriteUrl?: string;
  turretGunSpriteUrl?: string;
  hardpointSpriteUrl?: string;
  hardpointGunSpriteUrl?: string;
  glowSpriteUrl?: string;
  hardpointGlowSpriteUrl?: string;
  visualRecoil?: number;
  renderBarrelBelow?: boolean;
  turretOffsets?: number[];
  hardpointOffsets?: number[];

  // 弹道/光束渲染材质与参数 (严格对齐 .proj 和 .wpn)
  spawnType?: 'BALLISTIC' | 'BALLISTIC_AS_BEAM' | 'MISSILE' | 'BEAM';
  // 仅渲染语义；用于来源视觉类型与当前 gameplay 碰撞/实体语义暂时不一致的迁移场景。
  // 不得用于决定碰撞类别、伤害结算或实体生命周期。
  visualSpawnType?: 'BALLISTIC' | 'BALLISTIC_AS_BEAM' | 'MISSILE' | 'BEAM';
  textureType?: 'ROUGH' | 'SMOOTH';
  textureScrollSpeed?: number;
  fadeTime?: number; // 原版投射物视觉消退字段（秒）；不得延长实体碰撞寿命
  pixelsPerTexel?: number; // 原版纹理采样比例字段，必须为正数
  fringeColor?: [number, number, number, number];
  coreColor?: [number, number, number, number];
  glowColor?: [number, number, number, number];
  hitGlowRadius?: number;
  glowRadius?: number;
  coreWidthMult?: number;
  beamWidth?: number; // .wpn width；仅光束视觉宽度
  beamDuration?: number; // 当前 Web 模拟中的 Beam 实体寿命；不得与来源 chargedown 混为一谈
  beamVisualMode?: 'BURST' | 'SUSTAINED';
  beamSourceChargeupTime?: number; // weapon_data 来源元数据；当前不改变实际开火延迟
  beamSourceChargedownTime?: number; // weapon_data 来源元数据；当前不延长伤害/碰撞寿命
  hitGlowBrightenDuration?: number; // .wpn 命中辉光增亮时长；仅视觉，不改变光束伤害节拍

  projSpriteUrl?: string;
  projLength?: number;
  projWidth?: number;
  muzzleFlashSpec?: MuzzleFlashSpec;
  launcherSmokeSpec?: LauncherSmokeSpec;
  muzzleFlashColor?: [number, number, number];
  muzzleFlashSize?: number;
  soundKey?: string;
  burstSize?: number;
  burstDelay?: number;

  // 近炸引信规格 (对齐 PROXIMITY_FUSE)
  proximityFuse?: ProximityFuseSpec;

  // 导弹与制导物理规格 (严格对齐 Missile.java & MissileAI.java)
  isRocket?: boolean;
  isGuided?: boolean;
  engineAcceleration?: number;
  maxSpeed?: number;
  maxTurnRate?: number;
  engineFlameColor?: [number, number, number];
  missileEngineVisualSpec?: MissileEngineVisualSpec;
  missileTrailSpec?: MissileTrailSpec;
  missileExplosionVisualSpec?: MissileExplosionVisualSpec;
  isTwoStage?: boolean;
  missileHp?: number; // 导弹生命值 (对齐 settings.json / 各 .proj 文件)
}

export interface WeaponMount {
  slotId: string;
  spec: WeaponSpec;
  mountType: WeaponMountType;
  relativePos: Vector2; // 舰船局部挂点坐标
  baseAngleDeg: number; // 默认朝向角度 (度)
  arcDeg: number; // 射界旋转限制弧度 (度)
  currentAngleRad: number; // 当前实际指向角度 (世界弧度)
  cooldownTimer: number;
  isAutofire: boolean;
  burstRemaining: number;
  burstTimer: number;

  // 动态视觉后坐力与充能光晕状态
  recoil: number; // 0.0 ~ 1.0 (后坐到位为1，逐渐回位至0)
  glowAlpha: number; // 0.0 ~ 1.0 (充能/发射时发光，之后淡出)
  barrelIndex: number; // 双管/多管武器交替射击索引
  currentSpreadDeg: number; // 当前累积弹着散布角 (度)

  // 挂点健康度与 EMP/装甲穿透瘫痪状态 (对齐 WeaponAPI.java)
  health: number;
  maxHealth: number;
  isDisabled: boolean;
  disabledTimer: number;
  disabledDuration: number;
}

export interface WeaponGroup {
  index: number;
  mode: 'LINKED' | 'ALTERNATING';
  isAutofire: boolean;
  weaponSlotIds: string[];
  alternatingIndex: number;
}

export interface Projectile {
  id: number;
  sourceShipId: string;
  slotId?: string;
  isPlayer?: boolean;
  specId: string;
  pos: Vector2;
  prevPos: Vector2; // 用于插值
  vel: Vector2;
  damage: number;
  damageType: DamageType;
  empDamage?: number;
  radius: number;
  rangeRemaining: number;
  totalRange: number;
  elapsedTime: number;
  color: [number, number, number];

  spawnType?: 'BALLISTIC' | 'BALLISTIC_AS_BEAM' | 'MISSILE' | 'BEAM';
  visualSpawnType?: 'BALLISTIC' | 'BALLISTIC_AS_BEAM' | 'MISSILE' | 'BEAM';
  textureType?: 'ROUGH' | 'SMOOTH';
  textureScrollSpeed?: number;
  fadeTime?: number;
  pixelsPerTexel?: number;
  fringeColor?: [number, number, number, number];
  coreColor?: [number, number, number, number];
  glowColor?: [number, number, number, number];
  hitGlowRadius?: number;
  glowRadius?: number;
  coreWidthMult?: number;

  projSpriteUrl?: string;
  projLength?: number;
  projWidth?: number;
  barrelOffset?: { x: number; y: number };
  isRocket?: boolean;

  // 导弹航行与自主制导状态
  isGuided?: boolean;
  targetShipId?: string;
  facingRad?: number;
  engineAcceleration?: number;
  maxSpeed?: number;
  maxTurnRate?: number;
  engineFlameColor?: [number, number, number];
  missileEngineVisualSpec?: MissileEngineVisualSpec;
  missileTrailSpec?: MissileTrailSpec;
  missileExplosionVisualSpec?: MissileExplosionVisualSpec;
  isTwoStage?: boolean;
  stageTriggered?: boolean;

  // 近炸引信规格与引爆判定
  proximityFuse?: ProximityFuseSpec;

  // 导弹实体生命值 (支持机枪与破片拦截打爆)
  hitpoints?: number;
  maxHitpoints?: number;

  // 诱饵热焰弹规格与燃烧寿命
  isFlare?: boolean;
  flareLife?: number;
  flareMaxLife?: number;
}

export interface Beam {
  id: number;
  sourceShipId: string;
  slotId?: string;
  isPlayer?: boolean;
  specId: string;
  startPos: Vector2;
  endPos: Vector2;
  barrelOffset?: { x: number; y: number };
  damagePerSec: number;
  damageType: DamageType;
  color: [number, number, number];
  duration: number;
  maxDuration: number;
  width: number;
  visualMode?: 'BURST' | 'SUSTAINED';
  isEmpPiercing?: boolean;
  elapsedTime: number;

  textureType?: 'ROUGH' | 'SMOOTH';
  textureScrollSpeed?: number;
  pixelsPerTexel?: number;
  fringeColor?: [number, number, number, number];
  coreColor?: [number, number, number, number];
  glowColor?: [number, number, number, number];
  hitGlowRadius?: number;
  isHitting?: boolean;
  hitGlowBrightenDuration?: number;
  /** Visual-only deterministic contact cadence; never gates damage/contact simulation. */
  contactSurface?: 'SHIELD' | 'HULL';
  contactFxCooldown?: number;
  contactSoundCooldown?: number;
}

export { WEAPON_REGISTRY } from '../data/WeaponRegistry';

