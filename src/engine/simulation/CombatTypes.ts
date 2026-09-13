import { Vector2 } from '../math/Vector2';

export interface Particle {
  pos: Vector2;
  vel: Vector2;
  life: number;
  maxLife: number;
  size: number;
  color: [number, number, number];
  alpha: number;
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

export interface ExplosionAnimation {
  id: number;
  pos: Vector2;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  frame: number; // 0 到 6 对应 explosion0.png 到 explosion6.png
  rotation: number;
  color: [number, number, number];
  hasShockwaveRing: boolean;
  shockwaveRadius: number;
  maxShockwaveRadius: number;
}

export interface EmpArcBranch {
  segments: Vector2[];
  thickness: number;
}

export interface EmpArc {
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
  id: number;
  pos: Vector2;
  vel: Vector2;
  sourceShipId: string;
  armedTimer: number;
  isArmed: boolean;
  detonatingTimer: number;
  isDetonating: boolean;
  triggerRadius: number;
  explosionRadius: number;
  damage: number;
  life: number;
  pingTimer: number;
  rotation: number;
}

export interface HulkFragment {
  id: number;
  pos: Vector2;
  vel: Vector2;
  facingRad: number;
  angularVel: number;
  life: number;
  maxLife: number;
  spriteUrl: string;
  spriteWidth: number;
  spriteHeight: number;
  pivotX: number;
  pivotY: number;
  clipPart: 'FRONT' | 'REAR' | 'FULL';
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
  radius: number;
  type: 'AMBER' | 'BLUE';
  rotation: number;
  angularVel: number;
  scale: number;
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
  type: 'ENGAGE' | 'WAYPOINT';
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
  wingId: string;
  name: string;
  specId: string;
  isPlayer: boolean;
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

