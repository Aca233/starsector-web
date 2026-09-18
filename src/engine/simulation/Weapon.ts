import type { WeaponVisualProfile } from '../visual/VisualProfiles';
import type { ProjectileImpactFamily } from '../visual/ImpactVisuals';
import { Vector2 } from '../math/Vector2';
import { DamageType } from './ArmorGrid';

export type WeaponMountType = 'TURRET' | 'HARDPOINT' | 'HIDDEN';
export type WeaponSlotSize = 'SMALL' | 'MEDIUM' | 'LARGE';

export interface ProximityFuseSpec {
  range: number; // 接近引信引爆距离 (px)
  explosionRadius: number; // 爆炸范围杀伤波及半径 (px)
  coreRadius?: number; // 核心全伤半径；核心外至 explosionRadius 线性衰减
  soundKey?: string;
}

export interface MissileMirvSpec {
  splitRange: number;
  splitRangeRange: number;
  minTimeToSplit: number;
  canSplitEarly: boolean;
  numShots: number;
  damage: number;
  emp: number;
  damageType: DamageType;
  childHitpoints: number;
  evenSpread: boolean;
  arcDeg: number;
  spreadInaccuracyDeg: number;
  spreadSpeed: number;
  spreadSpeedRange: number;
  projectileRange: number;
  projectileSpec: string;
  splitSound?: string;
  smokeSpec?: LauncherSmokeSpec;
  childProjectile?: Partial<WeaponSpec>;
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
  /** WeaponSpecLoader defaults true; unrelated to explosionSpec or interception visuals. */
  useHitGlowWhenDealingDamage?: boolean;
}

/** Missile .proj explosionSpec, separate from cosmetic explosionRadius. */
export interface ProjectileExplosionSpec {
  /** ProximityFuseAI uses half damage at the edge; ordinary torpedoes use zero. */
  minDamageFraction?: number;
  duration: number;
  radius: number;
  coreRadius: number;
  collisionClass: string;
  particleCount: number;
  particleSizeMin: number;
  particleSizeRange: number;
  particleDuration: number;
  particleColor: [number, number, number, number];
  explosionColor?: [number, number, number, number];
  useDetailedExplosion?: boolean;
  detailedExplosionFlashRadius?: number;
  detailedExplosionFlashColorFringe?: [number, number, number, number];
}

export interface WeaponSpec {
  systemOnly?: boolean;
  /** Source DO_NOT_AIM / GUIDED_POOR: accept manual trigger regardless of cursor arc. */
  alwaysFire?: boolean;
  /** Source weapon_data.csv hints; unknown hints remain metadata, never ID-specific AI branches. */
  aiHints?: string[];
  autofireAccuracyBonus?: number;
  eccmChanceBonus?: number;
  missileGuidanceBonus?: number;
  /** Derived static percent, retained so temporary percent bonuses add instead of multiply. */
  projectileSpeedBonusPercent?: number;
  tags?: string[];
  ordnancePointCost?: number;
  /** Derived beam stat, never inferred from the damage type. */
  beamDealsHardFlux?: boolean;
  visualProfile?: WeaponVisualProfile;
  impactFamily?: ProjectileImpactFamily;
  id: string;
  nameKey: string;
  type: DamageType;
  mountSize: WeaponSlotSize;
  weaponType?: 'BALLISTIC' | 'ENERGY' | 'MISSILE';
  /** Native .wpn mounting category; independent of weaponType (e.g. ENERGY in HYBRID mounts). */
  mountTypeOverride?: 'BALLISTIC' | 'ENERGY' | 'MISSILE' | 'HYBRID' | 'COMPOSITE' | 'SYNERGY' | 'UNIVERSAL';
  isPointDefense?: boolean;
  isBeam: boolean;
  damagePerShot: number;
  /** weapon_data.csv EMP delivered by each solid projectile. */
  empPerShot?: number;
  damagePerSecond: number;
  fluxPerShot: number;
  range: number;
  refireDelay: number; // Chargedown; the complete cycle also includes chargeTime/burst.
  onHitEffect?: string;
  beamEffect?: string;
  everyFrameEffect?: string;
  passThroughMissiles?: boolean;
  passThroughFighters?: boolean;
  passThroughFightersOnlyWhenDestroyed?: boolean;
  chargeTime?: number;
  autoCharge?: boolean;
  interruptibleBurst?: boolean;
  soundIntroKey?: string;
  soundLoopKey?: string;
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
  /** 原版 .wpn 动画语义；GLOW_AND_FLASH 使用挂点 glow 图层做开火闪光。 */
  animationType?: 'GLOW_AND_FLASH';
  /** .wpn 显式 hardpointSprite:""：固定炮体已烘焙在舰体贴图里，不应回退绘制 turretSprite。 */
  hardpointUsesHullSprite?: boolean;
  visualRecoil?: number;
  renderBarrelBelow?: boolean;
  turretOffsets?: number[];
  hardpointOffsets?: number[];

  // 弹道/光束渲染材质与参数 (严格对齐 .proj 和 .wpn)
  spawnType?: 'BALLISTIC' | 'BALLISTIC_AS_BEAM' | 'MISSILE' | 'BEAM';
  /** Native missile .proj flag, defaults true. Does not turn ballistic shots into missiles. */
  renderTargetIndicator?: boolean;
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
  /** Native radius: projectile < 0 disables, 0/omitted derives from length;
   * beams use width-derived glow for any nonpositive/omitted value. */
  hitGlowRadius?: number;
  glowRadius?: number;
  coreWidthMult?: number;
  beamSpeed?: number; // weapon_data.csv front growth speed; default 1400 world units/s
  beamWidth?: number; // .wpn width；仅光束视觉宽度
  beamDuration?: number; // BURST 光束满亮度 ACTIVE 时长；充能/收束也按亮度结算伤害
  beamVisualMode?: 'BURST' | 'SUSTAINED';
  beamSourceChargeupTime?: number; // weapon_data chargeup，参与真实开火状态机
  beamSourceChargedownTime?: number; // weapon_data chargedown，参与真实退能状态机
  beamBurstDelay?: number; // burst beam 完整周期结束后的 source burst delay
  fluxPerSecond?: number; // 持续/爆发光束的 source energy/second
  empPerSecond?: number;
  maxAmmo?: number;
  ammoRegenPerSec?: number;
  hitGlowBrightenDuration?: number; // WeaponSpecLoader default: 1 second
  useGlowColorForHitGlow?: boolean;
  beamFireOnlyOnFullCharge?: boolean;
  fringeScrollSpeedMult?: number;
  darkCore?: boolean;
  darkFringeIter?: number;
  darkCoreIter?: number;

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
  launchSpeed?: number; // missile launch velocity before engine acceleration
  flightTime?: number; // authoritative missile lifetime in seconds
  armingTime?: number;
  engineAcceleration?: number;
  missileDeceleration?: number;
  maxSpeed?: number;
  maxTurnRate?: number; // radians/sec at runtime
  maxTurnAcceleration?: number; // radians/sec^2 at runtime
  engineFlameColor?: [number, number, number];
  missileEngineVisualSpec?: MissileEngineVisualSpec;
  missileTrailSpec?: MissileTrailSpec;
  missileExplosionVisualSpec?: MissileExplosionVisualSpec;
  projectileExplosionSpec?: ProjectileExplosionSpec;
  isTwoStage?: boolean;
  mirv?: MissileMirvSpec;
  missileHp?: number; // 导弹生命值 (对齐 weapon_data.csv / 各 .proj 文件)
}

export interface WeaponMount {
  /** Per-mount targeting, independent of the ship target used by orders/HUD. */
  fireControl?: { targetId?: string | number; targetKind?: 'SHIP' | 'MISSILE'; reason: string };
  fireControlTargetShipId?: string;
  fireControlTargetProjectileId?: number;
  /** Captured at charge start so later retargeting cannot redirect an in-flight burst. */
  cycleTargetShipId?: string;
  cycleTargetProjectileId?: number;
  healthTracker?: import('./systems/weapon/WeaponComponentHealth').WeaponHealthTracker;
  isPermanentlyDisabled?: boolean;
  slotId: string;
  spec: WeaponSpec;
  /** Original weapon capacity before hullmods, used by base-ammo reload systems. */
  baseMaxAmmo?: number;
  mountType: WeaponMountType;
  relativePos: Vector2; // 舰船局部挂点坐标
  baseAngleDeg: number; // 默认朝向角度 (度)
  arcDeg: number; // 射界旋转限制弧度 (度)
  aimIdleSeconds?: number;
  currentAngleRad: number; // 当前实际指向角度 (世界弧度)
  cooldownTimer: number;
  isAutofire: boolean;
  lifecycleDt?: number;
  burstFluxReserved?: boolean;
  burstRemaining: number;
  burstTimer: number;
  firingState: 'IDLE' | 'CHARGING' | 'ACTIVE' | 'CHARGEDOWN';
  firingStateTimer: number;
  triggerHeld: boolean;
  firingCycleId: number;
  ammo: number;
  ammoRechargeProgress: number;
  /** Extra source-weapon seconds before the ordinary cooldown after an autoload. */
  reloadDelayRemaining?: number;

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
  /**
   * 交替射击组当前活动挂点已持续的时间 (秒)；自动模式从成功开始的射击周期计时。
   * 对齐 WeaponGroup.advanceAlternating(): 同一时刻只允许活动挂点开火，
   * 活动权按 ((burstSize-1)*burstDelay + refireDelay + chargeTime)/炮数 的时间片轮换。
   */
  alternatingElapsed?: number;
  /** 上一帧是否处于击发状态（用于原版的"松开扳机即手动换炮"判定）。 */
  alternatingWasFiring?: boolean;
  /** 上一次活动权变更是时间片自动轮换而非玩家手动切换。 */
  alternatingJustSwitched?: boolean;
}

export interface Projectile {
  /** Hull-reactor blast: not a weapon shot and never gains offensive weapon/skill scaling. */
  isHullExplosion?: boolean;
  /** Original weapon category and immutable launch point for hit-time damage listeners. */
  sourceWeaponType?: WeaponSpec['weaponType'];
  spawnLocation?: Vector2;
  /** Launch-time damage scaling inherited by payloads, including zero-damage MIRV shells. */
  sourceDamageMultiplier?: number;
  id: number;
  sourceShipId: string;
  slotId?: string;
  isPlayer?: boolean;
  teamId?: number;
  specId: string;
  pos: Vector2;
  prevPos: Vector2; // 用于插值
  /** Source OoOO/L projectile lifecycle, shared by native ballistic shots and moving rays. */
  ballisticTail?: Vector2;
  sourceMoveSpeed?: number;
  sourceVelocity?: Vector2;
  fadeProgress?: number;
  prevFadeProgress?: number;
  unfadedDamage?: number;
  unfadedEmp?: number;
  didDamage?: boolean;
  /** Attached drone entities supply the body; missile engine/trail remain visible. */
  spriteAlphaOverride?: number;
  interceptsMissiles?: boolean;
  mote?: { age:number; turnSign:number; scanRemaining:number; };
  onHitEffect?: string;
  passThroughMissiles?: boolean;
  passThroughFighters?: boolean;
  passThroughFightersOnlyWhenDestroyed?: boolean;
  damagedTargetIds?: string[];
  softFlux?: boolean;
  prevBallisticTail?: Vector2;
  vel: Vector2;
  /** Source DamageAPI.getBaseDamage, before CR/stat modifiers. */
  baseDamage?: number;
  damage: number;
  damageType: DamageType;
  empDamage?: number;
  empResistance?: number;
  /** Disabled warhead drifts without guiding, thrust, contact or proximity damage. */
  isDisarmed?: boolean;
  radius: number;
  rangeRemaining: number;
  totalRange: number;
  elapsedTime: number;
  color: [number, number, number];

  spawnType?: 'BALLISTIC' | 'BALLISTIC_AS_BEAM' | 'MISSILE' | 'BEAM';
  renderTargetIndicator?: boolean;
  visualSpawnType?: 'BALLISTIC' | 'BALLISTIC_AS_BEAM' | 'MISSILE' | 'BEAM';
  textureType?: 'ROUGH' | 'SMOOTH';
  textureScrollSpeed?: number;
  fadeTime?: number;
  pixelsPerTexel?: number;
  fringeColor?: [number, number, number, number];
  coreColor?: [number, number, number, number];
  glowColor?: [number, number, number, number];
  /** Native radius: projectile < 0 disables, 0/omitted derives from length;
   * beams use width-derived glow for any nonpositive/omitted value. */
  hitGlowRadius?: number;
  glowRadius?: number;
  coreWidthMult?: number;
  /** MovingRay propagation speed relative to the source ship; excludes inherited source velocity. */
  movingRayMoveSpeed?: number;

  projSpriteUrl?: string;
  projLength?: number;
  projWidth?: number;
  barrelOffset?: { x: number; y: number };
  isRocket?: boolean;

  // 导弹航行与自主制导状态
  isGuided?: boolean;
  targetShipId?: string;
  /** A guided seeker can lock a decoy without replacing its fallback ship target. */
  targetProjectileId?: number;
  eccmChance?: number;
  guidanceBonus?: number;
  facingRad?: number;
  turnVelocityRad?: number;
  flightTimeRemaining?: number;
  maxFlightTime?: number;
  armingTimeRemaining?: number;
  engineAcceleration?: number;
  missileDeceleration?: number;
  maxSpeed?: number;
  maxTurnRate?: number;
  maxTurnAcceleration?: number;
  engineFlameColor?: [number, number, number];
  missileEngineVisualSpec?: MissileEngineVisualSpec;
  missileTrailSpec?: MissileTrailSpec;
  missileExplosionVisualSpec?: MissileExplosionVisualSpec;
  projectileExplosionSpec?: ProjectileExplosionSpec;
  isTwoStage?: boolean;
  stageTriggered?: boolean;
  mirv?: MissileMirvSpec;
  mirvSplitDistance?: number;

  // 近炸引信规格与引爆判定
  proximityFuse?: ProximityFuseSpec;
  /** Authored system bomb: ballistic flight, source spin, and no range-end detonation. */
  inertialFlight?: boolean;
  angularVelocityRad?: number;
  fizzleAtRange?: boolean;
  proximityExplosionSpec?: ProjectileExplosionSpec;

  // 导弹实体生命值 (支持机枪与破片拦截打爆)
  hitpoints?: number;
  maxHitpoints?: number;

  // 诱饵热焰弹规格与燃烧寿命
  /** MineSystem owns movement/fuse; shared weapon paths own interception. */
  isMine?: boolean;
  isFlare?: boolean;
  flareLife?: number;
  flareMaxLife?: number;
  /** Native FLARE_JAMMER uses FIGHTER collision/targeting, not missile spoofing. */
  isFighterDecoy?: boolean;
  /** Collision NONE is distinct from harmless/fizzling: EMP-resistant pulse bombs cannot be shot. */
  collisionDisabled?: boolean;
  systemFuseSeconds?: number;
  systemFadeInSeconds?: number;
  systemFuseTriggered?: boolean;
  systemExplosionSound?: string;
  flareBehavior?: { mode: 'STANDARD' | 'SEEKER' | 'JAMMER'; effectRange: number; effectChance: number; flameoutTime: number; noEngineGlowTime: number; fadeTime: number };
  flareFizzling?: boolean;
}

export interface Beam {
  id: number;
  sourceShipId: string;
  slotId?: string;
  isPlayer?: boolean;
  teamId?: number;
  specId: string;
  startPos: Vector2;
  endPos: Vector2;
  barrelOffset?: { x: number; y: number };
  damagePerSec: number;
  baseDamagePerSec?: number;
  baseEmpPerSec?: number;
  empPerSec?: number;
  damageType: DamageType;
  color: [number, number, number];
  duration: number;
  maxDuration: number;
  /** False is reserved for explicit visual-only fixtures, not charging/chargedown. */
  damageActive?: boolean;
  /** Per-ray native .1s damage clock. Reset only when a new ray/cycle is created. */
  elapsedSinceDamage?: number;
  accumulatedBrightness?: number;
  dpsDuration?: number;
  damageMultiplier?: number;
  /** Previous shortened length projected from this frame's muzzle and direction. */
  rayEndPrevFrame?: Vector2;
  firingCycleId?: number;
  hasRecordedHit?: boolean;
  width: number;
  visualMode?: 'BURST' | 'SUSTAINED';
  beamEffect?: string;
  elapsedTime: number;

  textureType?: 'ROUGH' | 'SMOOTH';
  textureScrollSpeed?: number;
  pixelsPerTexel?: number;
  fringeColor?: [number, number, number, number];
  coreColor?: [number, number, number, number];
  glowColor?: [number, number, number, number];
  /** Native radius: projectile < 0 disables, 0/omitted derives from length;
   * beams use width-derived glow for any nonpositive/omitted value. */
  hitGlowRadius?: number;
  isHitting?: boolean;
  hitGlowBrightenDuration?: number;
  useGlowColorForHitGlow?: boolean;
  fringeScrollSpeedMult?: number;
  coreWidthMult?: number;
  darkCore?: boolean;
  darkFringeIter?: number;
  darkCoreIter?: number;
  brightness?: number;
  hitGlowBrightness?: number;
  hitGlowSizeMult?: number;
  wasShortened?: boolean;
  /** BeamAPI runtime switch, default true; not a .wpn field. */
  scaleGlowBasedOnDamageEffectiveness?: boolean;
  /** Visual-only deterministic contact cadence; never gates damage/contact simulation. */
  contactSurface?: 'SHIELD' | 'HULL';
  contactFxCooldown?: number;
  contactSoundCooldown?: number;
}

export { WEAPON_REGISTRY } from '../data/WeaponRegistry';

