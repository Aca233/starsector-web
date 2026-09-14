import type { DamageType } from '../simulation/ArmorGrid';

export type ProjectileImpactSurface = 'SHIELD' | 'ARMOR' | 'HULL' | 'AIRBURST' | 'MISSILE_INTERCEPT';
export type ProjectileImpactFamily = 'ENERGY' | 'BALLISTIC' | 'FRAGMENTATION' | 'ROCKET' | 'HEAVY_TORPEDO';

export interface ProjectileImpactVisualInput {
  specId: string;
  damageType: DamageType;
  damage: number;
  isRocket: boolean;
  surface: ProjectileImpactSurface;
}

export interface ProjectileImpactVisualProfile {
  family: ProjectileImpactFamily;
  soundKey: string;
  soundVolume: number;
  sparkCount: number;
  shieldRippleRadius: number;
  cameraShake: number;
}

/**
 * W07 impact routing. These are conservative Web presentation defaults, not
 * claims of source-runtime pixel parity. The key invariant is semantic: a
 * shield contact never creates a hull/missile fireball, projectile hit glow is
 * not an explosion radius, and visual size never feeds collision or damage.
 */
export function getProjectileImpactVisualProfile(input: ProjectileImpactVisualInput): ProjectileImpactVisualProfile {
  const heavyTorpedo = input.specId === 'typhoon';
  const family: ProjectileImpactFamily = heavyTorpedo
    ? 'HEAVY_TORPEDO'
    : input.isRocket
      ? 'ROCKET'
      : input.damageType === 'ENERGY'
        ? 'ENERGY'
        : input.damageType === 'FRAGMENTATION'
          ? 'FRAGMENTATION'
          : 'BALLISTIC';

  if (input.surface === 'SHIELD') {
    const sparkCount = family === 'HEAVY_TORPEDO' ? 28 : family === 'ROCKET' ? 20 : family === 'ENERGY' ? 10 : 15;
    return {
      family,
      soundKey: 'shield_hit',
      soundVolume: 0.45,
      sparkCount,
      shieldRippleRadius: input.damage > 200 ? 75 : 45,
      cameraShake: family === 'HEAVY_TORPEDO' ? 4 : family === 'ROCKET' ? 3 : 2
    };
  }

  const soundKey = input.damage >= 180 ? 'armor_hit_heavy' : input.damage >= 80 ? 'armor_hit_solid' : 'armor_hit_light';
  const soundVolume = input.damage >= 180 ? 0.7 : input.damage >= 80 ? 0.6 : 0.45;
  return {
    family,
    soundKey,
    soundVolume,
    sparkCount: input.isRocket ? 0 : (input.surface === 'HULL' && family === 'ENERGY' ? 24 : 20),
    shieldRippleRadius: 0,
    cameraShake: Math.min(15, input.damage * 0.04)
  };
}

export type BeamContactSurface = 'SHIELD' | 'HULL';

export interface BeamContactPulseState {
  contactSurface?: BeamContactSurface;
  contactFxCooldown?: number;
  contactSoundCooldown?: number;
}

export interface BeamContactPulse {
  emitFx: boolean;
  emitSound: boolean;
}

export const BEAM_CONTACT_FX_INTERVAL = 0.08;
export const BEAM_CONTACT_SOUND_INTERVAL = 0.18;

/** Fixed-step contact cadence: event decisions depend on simulation dt, never visual RNG or wall-clock audio time. */
export function advanceBeamContactPulse(
  state: BeamContactPulseState,
  surface: BeamContactSurface,
  dt: number
): BeamContactPulse {
  state.contactFxCooldown = Math.max(0, (state.contactFxCooldown ?? 0) - dt);
  state.contactSoundCooldown = Math.max(0, (state.contactSoundCooldown ?? 0) - dt);
  const changedSurface = state.contactSurface !== surface;
  const emitFx = changedSurface || state.contactFxCooldown <= 0;
  const emitSound = changedSurface || state.contactSoundCooldown <= 0;
  state.contactSurface = surface;
  if (emitFx) state.contactFxCooldown = BEAM_CONTACT_FX_INTERVAL;
  if (emitSound) state.contactSoundCooldown = BEAM_CONTACT_SOUND_INTERVAL;
  return { emitFx, emitSound };
}
