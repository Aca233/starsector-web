export interface ShieldVisualProfile {
  innerColor: [number, number, number];
  outerColor: [number, number, number];
  opacity: number;
  rimWidth: number;
  textureRotationSpeed: number;
  hitFlash: number;
  deployCurve: 'linear' | 'ease-out';
}

export interface EngineVisualProfile {
  idleScale: number;
  accelerateScale: number;
  strafeScale: number;
  boostScale: number;
  shutdownSeconds: number;
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
  fadeSeconds: number;
}

export const SHIELD_VISUAL_PROFILES: Record<string, ShieldVisualProfile> = {
  lowTech: { innerColor: [70, 150, 255], outerColor: [90, 220, 255], opacity: 0.62, rimWidth: 0.08, textureRotationSpeed: 0.035, hitFlash: 1, deployCurve: 'ease-out' },
  highTech: { innerColor: [90, 120, 255], outerColor: [160, 100, 255], opacity: 0.68, rimWidth: 0.06, textureRotationSpeed: 0.05, hitFlash: 1.15, deployCurve: 'ease-out' }
};

export const ENGINE_VISUAL_PROFILES: Record<string, EngineVisualProfile> = {
  LOW_TECH: { idleScale: 0.2, accelerateScale: 1, strafeScale: 0.7, boostScale: 1.7, shutdownSeconds: 0.2 },
  HIGH_TECH: { idleScale: 0.24, accelerateScale: 1, strafeScale: 0.75, boostScale: 1.5, shutdownSeconds: 0.16 },
  MIDLINE: { idleScale: 0.22, accelerateScale: 1, strafeScale: 0.72, boostScale: 1.6, shutdownSeconds: 0.18 }
};

export const DEFAULT_EXPLOSION_PROFILE: ExplosionVisualProfile = {
  flash: 1, fireball: 1, shockwave: 1, smoke: 1, debris: 1
};

export const WEAPON_VISUAL_PROFILES: Record<'TPC' | 'BALLISTIC' | 'BEAM' | 'MISSILE', WeaponVisualProfile> = {
  TPC: { muzzleScale: 1.15, glowScale: 1.2, trailScale: 1, impactScale: 1.1, fadeSeconds: 0.2 },
  BALLISTIC: { muzzleScale: 1, glowScale: 0.7, trailScale: 0.8, impactScale: 1, fadeSeconds: 0.16 },
  BEAM: { muzzleScale: 0.75, glowScale: 1.25, trailScale: 0, impactScale: 1.15, fadeSeconds: 0.12 },
  MISSILE: { muzzleScale: 0.9, glowScale: 1, trailScale: 1.25, impactScale: 1.3, fadeSeconds: 0.28 }
};
