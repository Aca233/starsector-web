import type { MissileLifecycleSpec } from '../simulation/Weapon';

/** Native WeaponSpecLoader.java, not o00o_0's superseded field initializers. */
export function missileLifecycleSpecFromSource(proj: Record<string, unknown>): MissileLifecycleSpec {
  const collision = proj.collisionClassAfterFlameout ?? 'MISSILE_FF';
  if (!['NONE', 'MISSILE_NO_FF', 'MISSILE_FF'].includes(String(collision))) throw new Error('Unsupported missile flameout collision class: ' + collision);
  return {
    flameoutTime: Number(proj.flameoutTime ?? 4),
    noEngineGlowTime: Number(proj.noEngineGlowTime ?? 2.5),
    fadeTime: Number(proj.fadeTime ?? .5),
    dudProbabilityOnFlameout: Number(proj.dudProbabilityOnFlameout ?? .5),
    collisionClassAfterFlameout: collision as MissileLifecycleSpec['collisionClassAfterFlameout'],
    fizzleOnReachingWeaponRange: proj.fizzleOnReachingWeaponRange === true,
    noCollisionWhileFading: proj.noCollisionWhileFading === true,
    reduceDamageWhileFading: proj.reduceDamageWhileFading === true,
  };
}
