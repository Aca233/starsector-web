import { contentRegistry } from '../content/ContentRegistry';
import type { ShipSpec } from '../content/ShipSpec';
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
  brightness: number;
  deployCurve: 'linear' | 'ease-out';
}

export interface EngineVisualProfile {
  flameColor: RgbUnit;
}

export interface VentVisualProfile {
  fringeColor: Rgb255;
  coreColor: Rgb255;
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

// Colors: local 0.98a-RC8 hull_styles.json and fortressshield.system.
// Rim width (world units), inner rotation and ring cadence: combat/systems/G.java.
// Impact/deployment envelopes still need matched runtime captures.
export const SHIELD_VISUAL_PROFILES: Record<ShieldVisualKey, ShieldVisualProfile> = {
  lowTech: {
    innerColor: [255, 125, 125], outerColor: [255, 255, 255], opacity: 1,
    rimWidth: 5, textureRotationSpeed: Math.PI / 8, ringSpeedScale: 1,
    brightness: 1, deployCurve: 'linear'
  },
  highTech: {
    innerColor: [125, 125, 255], outerColor: [255, 255, 255], opacity: 1,
    rimWidth: 5, textureRotationSpeed: Math.PI / 8, ringSpeedScale: 1,
    brightness: 1, deployCurve: 'linear'
  },
  fortress: {
    innerColor: [255, 100, 255], outerColor: [255, 255, 255], opacity: 1,
    rimWidth: 10, textureRotationSpeed: Math.PI / 8, ringSpeedScale: 1,
    brightness: 1, deployCurve: 'linear'
  }
};

// Flame RGB: local 0.98a-RC8 engine_styles.json engineColor, without rounding.
// Standard engine geometry and alpha live in ShipEngineRenderer, not artistic family multipliers.
export const ENGINE_VISUAL_PROFILES: Record<string, EngineVisualProfile> = {
  LOW_TECH: {
    flameColor: [1, 125 / 255, 25 / 255]
  },
  HIGH_TECH: {
    flameColor: [100 / 255, 165 / 255, 1]
  },
  MIDLINE: {
    flameColor: [1, 145 / 255, 75 / 255]
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
  fringeColor: [125, 0, 155], coreColor: [255, 255, 255]
};

const DEFAULT_SHIP_VISUAL: ShipVisualProfile = {
  hullTint:[1,1,1], phaseColor:[.34,.62,1], overloadColor:[.35,.8,1],
  shieldProfile:'highTech', vent:DEFAULT_VENT, explosion:DEFAULT_EXPLOSION_PROFILE
};

export const WEAPON_VISUAL_PROFILES: Record<WeaponVisualFamily, WeaponVisualProfile> = {
  TPC: { muzzleScale: 1.22, glowScale: 1.34, trailScale: 1.08, impactScale: 1.24, coreScale: 0.52, brightness: 1.15, fadeSeconds: 0.18 },
  BALLISTIC: { muzzleScale: 1.0, glowScale: 0.82, trailScale: 1.0, impactScale: 0.94, coreScale: 0.72, brightness: 1.0, fadeSeconds: 0.14 },
  BEAM: { muzzleScale: 0.82, glowScale: 1.28, trailScale: 1.08, impactScale: 1.22, coreScale: 0.48, brightness: 1.12, fadeSeconds: 0.1 },
  MISSILE: { muzzleScale: 0.95, glowScale: 1.16, trailScale: 1.2, impactScale: 1.34, coreScale: 0.62, brightness: 1.05, fadeSeconds: 0.24 }
};

export function getShipVisualProfile(input: string | ShipSpec): ShipVisualProfile {
  const spec = typeof input === 'string' ? contentRegistry.getShip(input) : input;
  if (spec?.visualProfile) return spec.visualProfile;
  return { ...DEFAULT_SHIP_VISUAL, shieldProfile: spec?.engineSlots[0]?.style === 'LOW_TECH' ? 'lowTech' : 'highTech' };
}

export function getWeaponVisualFamily(
  _specId: string,
  spawnType?: string,
  isRocket = false,
  isBeam = false
): WeaponVisualFamily {
  if (isBeam || spawnType === 'BEAM') return 'BEAM';
  if (isRocket || spawnType === 'MISSILE') return 'MISSILE';
  if (spawnType === 'BALLISTIC_AS_BEAM') return 'TPC';
  return 'BALLISTIC';
}

export function getWeaponVisualProfile(
  specId: string,
  spawnType?: string,
  isRocket = false,
  isBeam = false
): WeaponVisualProfile {
  const spec = contentRegistry.getWeapon(specId);
  return spec?.visualProfile ?? WEAPON_VISUAL_PROFILES[getWeaponVisualFamily(specId, spawnType ?? spec?.spawnType, isRocket || !!spec?.isRocket, isBeam || !!spec?.isBeam)];
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
