import { Vector2 } from '../math/Vector2';
import type { Ship } from './Ship';

export type ParticleMaterial = 'GLOW' | 'SPARK' | 'SMOKE' | 'SOURCE_SMOOTH';

export interface Particle {
  pos: Vector2;
  vel: Vector2;
  life: number;
  maxLife: number;
  size: number;
  color: [number, number, number];
  alpha: number;
  /** Optional modern FX semantics. Legacy particles omit these and keep linear fade behaviour. */
  material?: ParticleMaterial;
  startSize?: number;
  endSize?: number;
  peakAlpha?: number;
  rampUpFraction?: number;
  fadeOutFraction?: number;
  drag?: number;
  rotation?: number;
  angularVel?: number;
  /** Velocity-aligned elongation for sparks; 1 means a compact particle. */
  stretch?: number;
}

export interface ContrailParticle {
  pos: Vector2;
  vel: Vector2;
  life: number;
  maxLife: number;
  size: number;
  maxSize: number;
  alpha: number;
  rotation: number;
  color?: [number, number, number];
}

export interface ExplosionPuff {
  offset: Vector2;
  velocity: Vector2;
  startSize: number;
  endSize: number;
  texture: 0 | 1 | 2 | 3;
  rotation: number;
}

export interface ExplosionAnimation {
  id: number;
  visualKind?: 'impact' | 'missile' | 'ship';
  sourceShipId?: string;
  sourceAuthored?: boolean;
  puffs?: ExplosionPuff[];
  puffDuration?: number;
  flash?: { diameter: number; coreDiameter?: number; color: [number, number, number]; duration: number; velocity: Vector2 };
  flare?: { width: number; height: number; color: [number, number, number]; velocity: Vector2 };
  pos: Vector2;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  frame: number; // Legacy synthetic scene frame; runtime puffs retain their texture.
  rotation: number;
  color: [number, number, number];
  hasShockwaveRing: boolean;
  shockwaveRadius: number;
  maxShockwaveRadius: number;  /** Procedural secondary layers attached to the main explosion without spawning simulation entities. */
  clusterSeed?: number;
  debrisCount?: number;
  smokeDensity?: number;
  fireballScale?: number;
}

/** One native GenericTextureParticle, not a composite expanding flash. */
export interface HitGlowAnimation {
  id: number;
  pos: Vector2;
  vel: Vector2;
  diameter: number;
  life: number;
  maxLife: number;
  peakAlpha: number;
  color: [number, number, number];
}

/** Visual-only remnant of a MovingRay after a solid impact. */
export interface MovingRayFade {
  id: number;
  headPos: Vector2;
  tailPos: Vector2;
  direction: Vector2;
  moveSpeed: number;
  life: number;
  maxLife: number;
  elapsedTime: number;
  maxPulseLength: number;
  width: number;
  textureType: 'ROUGH' | 'SMOOTH';
  textureScrollSpeed: number;
  pixelsPerTexel: number;
  fringeColor: [number, number, number, number];
  coreColor: [number, number, number, number];
}

export interface EmpArcBranch {
  segments: Vector2[];
  thickness: number;
}

export interface EmpArc {
  native?: import('../visual/EmpArcVisuals').NativeEmpArcVisual;
  startPos: Vector2;
  endPos: Vector2;
  life: number;
  maxLife: number;
  segments: Vector2[];
  branches: EmpArcBranch[];
  coreColor: [number, number, number];
  glowColor: [number, number, number];
  thickness: number;
}

export interface MuzzleFlash {
  id: number;
  specId?: string;
  pos: Vector2;
  angleRad: number;
  size: number;
  color: [number, number, number];
  life: number;
  maxLife: number;
}

/**
 * 原版枪口爆炸风粒子 (1:1 SmoothParticle.java & _class.java)
 */
export interface MuzzleParticle {
  pos: Vector2;
  vel: Vector2;
  size: number;
  life: number;
  maxLife: number;
  color: [number, number, number, number]; // RGBA
  blendMode?: 'ADDITIVE' | 'NORMAL';
}

export interface FloatingText {
  id: number;
  pos: Vector2;
  text: string;
  color: [number, number, number];
  size: number;
  life: number;
  maxLife: number;
  vel: Vector2;
}

export interface DebrisParticle {
  pos: Vector2;
  vel: Vector2;
  rotation: number;
  angularVel: number;
  size: number;
  life: number;
  maxLife: number;
  color: [number, number, number];
  points: Vector2[];
  spriteUrl?: string;
  isGlowing?: boolean;
}

export interface ShieldRipple {
  pos: Vector2;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: [number, number, number];
}

export interface SpatialMine {
  weaponId?: import('../extensions/NativeMines').NativeMineWeapon;
  fadeInSeconds?: number;
  sourceDamageMultiplier?: number;
  id: number;
  pos: Vector2;
  vel: Vector2;
  sourceShipId: string;
  // 部署时的阵营快照；发射舰被击毁后仍可据此判定引信敌我 (对齐 MISSILE_NO_FF)
  sourceIsPlayer?: boolean;
  teamId?: number;
  age: number;
  windupPlayed: boolean;
  detonatingTimer: number;
  isDetonating: boolean;
  triggerRadius: number;
  explosionRadius: number;
  damage: number;
  life: number;
  rotation: number;
}

export interface HulkBreakup {
  remainingSplits: number;
  interval: number;
  elapsed: number;
  nextInterval: number;
}

export interface HulkFragment {
  id: number;
  pos: Vector2;
  vel: Vector2;
  facingRad: number;
  angularVel: number;
  /** Dead source instance retains its mounted weapons and permanent damage decals. */
  sourceShip: Ship;
  age: number;
  breakup: HulkBreakup | null;
  /** All polygon vertices remain in the original ship's local coordinate system. */
  bounds: Vector2[];
  visualBounds: Vector2[] | null;
  mountSlotIds: string[];
  /** Piece center in source ship coordinates; keeps the sprite continuous at splitting. */
  localOffset: Vector2;
  collisionRadius: number;
}

export interface Asteroid {
  id: number;
  pos: Vector2;
  vel: Vector2;
  facingRad: number;
  angularVel: number;
  radius: number;
  mass: number;
  hp: number;
  maxHp: number;
  spriteUrl: string;
}

export interface NebulaCloud {
  id: number;
  pos: Vector2;
  thickness: number;
  atlasColumn: number;
  atlasRow: number;
  spriteUrl: string;
}

export interface RadioMessage {
  id: number;
  sender: string;
  senderFaction: 'PLAYER' | 'ENEMY' | 'HQ';
  text: string;
  time: number;
  color: [number, number, number];
}

export interface TacticalOrder {
  id: string;
  type: 'ENGAGE' | 'WAYPOINT' | 'ASSAULT' | 'DEFEND' | 'ESCORT' | 'AVOID';
  targetShipId?: string;
  targetPos?: Vector2;
  issuedTime: number;
}

export interface FighterAIState {
  state: 'ESCORT' | 'ATTACK' | 'INTERCEPT' | 'DOGFIGHT';
  timer: number;
  targetUnitId?: string;
}

export interface FlightDeckWing {
  tags?: string[];
  wingId: string;
  carrierId?: string;
  role?: 'FIGHTER' | 'BOMBER';
  rebuildSeconds?: number;
  range?: number;
  name: string;
  specId: string;
  isPlayer: boolean;
  teamId?: number;
  maxCrafts: number;
  crr: number; // 战备率 0.25 ~ 1.0
  rebuildQueue: {
    craftId: string;
    timer: number;
    maxTimer: number;
  }[];
}

export interface BomberAIState {
  state: 'ESCORT' | 'ATTACK_RUN' | 'RETURN_TO_REARM' | 'DOCKED';
  timer: number;
  hasTorpedo: boolean;
}

export interface RebuildingCraft {
  id: string;
  specId: string;
  isPlayer: boolean;
  timer: number;
  maxTimer: number;
}
