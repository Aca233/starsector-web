export type Rgb255 = [number, number, number];
export type RgbUnit = [number, number, number];
export type ShieldVisualKey = 'lowTech' | 'highTech' | 'fortress';
export type WeaponVisualFamily = 'TPC' | 'BALLISTIC' | 'BEAM' | 'MISSILE';
export type ExplosionVisualKind = 'impact' | 'missile' | 'ship';

export interface ShieldVisualProfile {
  innerColor: Rgb255;
  outerColor: Rgb255;
  opacity: number;
  rimWidth: number;
  textureRotationSpeed: number;
  ringSpeedScale: number;
  hitFlash: number;
  brightness: number;
  deployCurve: 'linear' | 'ease-out';
}

export interface EngineVisualProfile {
  idleScale: number;
  accelerateScale: number;
  strafeScale: number;
  boostScale: number;
  shutdownSeconds: number;
  flameColor: RgbUnit;
  glowColor: RgbUnit;
  coreColor: RgbUnit;
  widthScale: number;
  throatScale: number;
}

export interface VentVisualProfile {
  fringeColor: Rgb255;
  coreColor: Rgb255;
  haloScale: number;
  plumeScale: number;
  particleScale: number;
}

export interface ExplosionVisualProfile {
  flash: number;
  fireball: number;
  shockwave: number;
  smoke: number;
  debris: number;
}

export interface WeaponVisualProfile {
  muzzleScale: number;
  glowScale: number;
  trailScale: number;
  impactScale: number;
  coreScale: number;
  brightness: number;
  fadeSeconds: number;
}

export interface ShipVisualProfile {
  hullTint: RgbUnit;
  phaseColor: RgbUnit;
  overloadColor: RgbUnit;
  shieldProfile: ShieldVisualKey;
  fortressShieldProfile?: ShieldVisualKey;
  vent: VentVisualProfile;
  explosion: ExplosionVisualProfile;
}

export const SHIELD_VISUAL_PROFILES: Record<ShieldVisualKey, ShieldVisualProfile> = {
  lowTech: {
    innerColor: [66, 142, 255], outerColor: [102, 226, 255], opacity: 0.74,
    rimWidth: 0.018, textureRotationSpeed: 0.36, ringSpeedScale: 0.86,
    hitFlash: 1.05, brightness: 1.0, deployCurve: 'ease-out'
  },
  highTech: {
    innerColor: [92, 118, 255], outerColor: [184, 116, 255], opacity: 0.8,
    rimWidth: 0.014, textureRotationSpeed: 0.48, ringSpeedScale: 1.16,
    hitFlash: 1.2, brightness: 1.08, deployCurve: 'ease-out'
  },
  fortress: {
    innerColor: [255, 188, 64], outerColor: [255, 255, 238], opacity: 0.9,
    rimWidth: 0.022, textureRotationSpeed: 0.62, ringSpeedScale: 1.35,
    hitFlash: 1.35, brightness: 1.38, deployCurve: 'ease-out'
  }
};

export const ENGINE_VISUAL_PROFILES: Record<string, EngineVisualProfile> = {
  LOW_TECH: {
    idleScale: 0.2, accelerateScale: 1, strafeScale: 0.7, boostScale: 1.78, shutdownSeconds: 0.2,
    flameColor: [1.0, 0.42, 0.09], glowColor: [1.0, 0.3, 0.055], coreColor: [1.0, 0.93, 0.76],
    widthScale: 1.08, throatScale: 1.06
  },
  HIGH_TECH: {
    idleScale: 0.24, accelerateScale: 1, strafeScale: 0.75, boostScale: 1.56, shutdownSeconds: 0.16,
    flameColor: [0.3, 0.68, 1.0], glowColor: [0.18, 0.52, 1.0], coreColor: [0.86, 0.97, 1.0],
    widthScale: 0.95, throatScale: 0.92
  },
  MIDLINE: {
    idleScale: 0.22, accelerateScale: 1, strafeScale: 0.72, boostScale: 1.64, shutdownSeconds: 0.18,
    flameColor: [1.0, 0.84, 0.38], glowColor: [1.0, 0.68, 0.24], coreColor: [1.0, 0.96, 0.8],
    widthScale: 1.0, throatScale: 1.0
  }
};

export const DEFAULT_EXPLOSION_PROFILE: ExplosionVisualProfile = {
  flash: 1, fireball: 1, shockwave: 1, smoke: 1, debris: 1
};

export const MISSILE_EXPLOSION_PROFILE: ExplosionVisualProfile = {
  flash: 1.18, fireball: 1.08, shockwave: 1.15, smoke: 1.12, debris: 0.72
};

export const CAPITAL_EXPLOSION_PROFILE: ExplosionVisualProfile = {
  flash: 1.28, fireball: 1.18, shockwave: 1.22, smoke: 1.35, debris: 1.2
};

const DEFAULT_VENT: VentVisualProfile = {
  fringeColor: [135, 15, 175], coreColor: [240, 245, 255], haloScale: 1, plumeScale: 1, particleScale: 1
};

export const SHIP_VISUAL_PROFILES: Record<string, ShipVisualProfile> = {
  onslaught: {
    hullTint: [1.0, 0.965, 0.91], phaseColor: [0.34, 0.62, 1.0], overloadColor: [0.3, 0.82, 1.0],
    shieldProfile: 'lowTech',
    vent: { fringeColor: [150, 20, 180], coreColor: [255, 244, 238], haloScale: 1.08, plumeScale: 1.08, particleScale: 1.05 },
    explosion: { flash: 1.28, fireball: 1.18, shockwave: 1.22, smoke: 1.35, debris: 1.22 }
  },
  paragon: {
    hullTint: [0.93, 0.975, 1.0], phaseColor: [0.38, 0.58, 1.0], overloadColor: [0.52, 0.66, 1.0],
    shieldProfile: 'highTech', fortressShieldProfile: 'fortress',
    vent: { fringeColor: [86, 78, 220], coreColor: [230, 247, 255], haloScale: 0.96, plumeScale: 0.95, particleScale: 0.92 },
    explosion: { flash: 1.2, fireball: 1.1, shockwave: 1.18, smoke: 1.1, debris: 1.08 }
  },
  doom: {
    hullTint: [0.92, 0.94, 1.0], phaseColor: [0.46, 0.3, 1.0], overloadColor: [0.46, 0.72, 1.0],
    shieldProfile: 'highTech',
    vent: { fringeColor: [112, 45, 210], coreColor: [224, 244, 255], haloScale: 0.9, plumeScale: 0.92, particleScale: 0.9 },
    explosion: { flash: 1.12, fireball: 1.06, shockwave: 1.08, smoke: 1.12, debris: 1.08 }
  },
  default: {
    hullTint: [1, 1, 1], phaseColor: [0.34, 0.62, 1.0], overloadColor: [0.35, 0.8, 1.0],
    shieldProfile: 'highTech', vent: DEFAULT_VENT, explosion: DEFAULT_EXPLOSION_PROFILE
  }
};

export const WEAPON_VISUAL_PROFILES: Record<WeaponVisualFamily, WeaponVisualProfile> = {
  TPC: { muzzleScale: 1.22, glowScale: 1.34, trailScale: 1.08, impactScale: 1.24, coreScale: 0.52, brightness: 1.15, fadeSeconds: 0.18 },
  BALLISTIC: { muzzleScale: 1.0, glowScale: 0.82, trailScale: 1.0, impactScale: 0.94, coreScale: 0.72, brightness: 1.0, fadeSeconds: 0.14 },
  BEAM: { muzzleScale: 0.82, glowScale: 1.28, trailScale: 1.08, impactScale: 1.22, coreScale: 0.48, brightness: 1.12, fadeSeconds: 0.1 },
  MISSILE: { muzzleScale: 0.95, glowScale: 1.16, trailScale: 1.2, impactScale: 1.34, coreScale: 0.62, brightness: 1.05, fadeSeconds: 0.24 }
};

// W02/W03：家族参数仍作为默认值，但已确认来源尺寸的脉冲武器不再被家族几何倍率二次放大。
// 这样 TPC 100×35、Autopulse 50×20 可作为与原版逐帧对照的可信起点，其他亮度/命中补偿仍待视觉验收。
const WEAPON_VISUAL_PROFILES_BY_ID: Record<string, WeaponVisualProfile> = {
  tpc: { ...WEAPON_VISUAL_PROFILES.TPC, muzzleScale: 1.0, glowScale: 1.0, trailScale: 1.0, impactScale: 1.0, coreScale: 1.0, brightness: 1.0 },
  autopulse: { ...WEAPON_VISUAL_PROFILES.TPC, muzzleScale: 1.0, glowScale: 1.0, trailScale: 1.0, impactScale: 1.0, coreScale: 1.0, brightness: 1.0 },
  lightmg: { ...WEAPON_VISUAL_PROFILES.TPC, muzzleScale: 1.0, trailScale: 1.0, glowScale: 1.0 },
  heavyblaster: { ...WEAPON_VISUAL_PROFILES.TPC, trailScale: 1.0, glowScale: 1.0, coreScale: 1.0, brightness: 1.0 },
  tachyonlance: { ...WEAPON_VISUAL_PROFILES.BEAM, trailScale: 1.0, glowScale: 1.0, coreScale: 1.0, brightness: 1.0 },
  gravitonbeam: { ...WEAPON_VISUAL_PROFILES.BEAM, trailScale: 1.0, glowScale: 1.0, coreScale: 1.0, brightness: 1.0 },
  taclaser: { ...WEAPON_VISUAL_PROFILES.BEAM, trailScale: 1.0, glowScale: 1.0, coreScale: 1.0, brightness: 1.0 },
  pdburst: { ...WEAPON_VISUAL_PROFILES.BEAM, trailScale: 1.0, glowScale: 1.0, coreScale: 1.0, brightness: 1.0 }
};

export function getShipVisualProfile(shipId: string): ShipVisualProfile {
  return SHIP_VISUAL_PROFILES[shipId] ?? SHIP_VISUAL_PROFILES.default;
}

export function getWeaponVisualFamily(
  specId: string,
  spawnType?: string,
  isRocket = false,
  isBeam = false
): WeaponVisualFamily {
  if (isBeam || spawnType === 'BEAM') return 'BEAM';
  if (isRocket || spawnType === 'MISSILE') return 'MISSILE';
  if (specId === 'tpc' || specId === 'autopulse' || spawnType === 'BALLISTIC_AS_BEAM') return 'TPC';
  return 'BALLISTIC';
}

export function getWeaponVisualProfile(
  specId: string,
  spawnType?: string,
  isRocket = false,
  isBeam = false
): WeaponVisualProfile {
  return WEAPON_VISUAL_PROFILES_BY_ID[specId]
    ?? WEAPON_VISUAL_PROFILES[getWeaponVisualFamily(specId, spawnType, isRocket, isBeam)];
}

export function getExplosionVisualProfile(
  maxRadius: number,
  kind: ExplosionVisualKind = 'impact',
  shipId?: string
): ExplosionVisualProfile {
  if (kind === 'ship') return shipId ? getShipVisualProfile(shipId).explosion : CAPITAL_EXPLOSION_PROFILE;
  if (kind === 'missile') return MISSILE_EXPLOSION_PROFILE;
  return maxRadius >= 140 ? CAPITAL_EXPLOSION_PROFILE : DEFAULT_EXPLOSION_PROFILE;
}
