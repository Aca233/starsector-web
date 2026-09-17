import type { Beam, WeaponMount } from '../../Weapon';
import type { SimulationRandom } from '../../SimulationRandom';

export const BEAM_DAMAGE_INTERVAL = 0.1;

export interface BeamDamageSample {
  damage: number;
  emp: number;
  effectiveDps: number;
}

/** BeamWeaponRay.advance: integrate tracker brightness squared, then apply the
 * current batch to the current collision only. Missed samples are never banked.
 * The phase uses gameplay RNG, because it changes collision/damage timing.
 */
export function advanceBeamDamage(
  beam: Beam, dt: number, random: SimulationRandom, mount?: WeaponMount
): BeamDamageSample | null {
  beam.dpsDuration = 0;
  beam.damageMultiplier = 0;
  if (beam.damageActive === false || dt <= 0) return null;
  beam.elapsedSinceDamage ??= random.next() * BEAM_DAMAGE_INTERVAL;
  const brightness = Math.max(0, Math.min(1, beam.brightness ?? 1));
  beam.accumulatedBrightness = (beam.accumulatedBrightness ?? 0) + brightness * brightness * dt;
  beam.elapsedSinceDamage += dt;
  // Suppress only double-precision fixed-step roundoff at the .1s boundary.
  if (beam.elapsedSinceDamage + 1e-9 < BEAM_DAMAGE_INTERVAL) return null;

  const down = mount?.spec.beamSourceChargedownTime ?? 0;
  if (mount?.firingState === 'CHARGEDOWN' && mount.spec.beamVisualMode === 'BURST' &&
    brightness * down < BEAM_DAMAGE_INTERVAL) {
    beam.accumulatedBrightness += brightness * brightness / 4 * down;
  }
  const integral = beam.accumulatedBrightness;
  beam.dpsDuration = beam.elapsedSinceDamage;
  beam.damageMultiplier = integral / beam.dpsDuration;
  beam.elapsedSinceDamage = 0;
  beam.accumulatedBrightness = 0;
  return {
    damage: beam.damagePerSec * integral,
    emp: (beam.empPerSec ?? 0) * integral,
    effectiveDps: beam.damagePerSec * beam.damageMultiplier
  };
}
