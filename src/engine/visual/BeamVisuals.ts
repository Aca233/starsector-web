import type { Beam, WeaponMount } from '../simulation/Weapon';
import { hitGlowSize, type HitGlowDamageResult } from './HitGlowVisuals';
import { BEAM_DAMAGE_INTERVAL } from '../simulation/systems/weapon/BeamDamageClock';

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Weapon tracker D: width follows charge level; beam strip opacity is its square. */
export function beamIntensity(beam: Beam, mount?: WeaponMount): number {
  if (mount) {
    if (mount.firingState === 'ACTIVE') return 1;
    if (mount.firingState === 'CHARGING') {
      return clamp01(1 - mount.firingStateTimer / Math.max(0.001, mount.spec.beamSourceChargeupTime ?? 0));
    }
    if (mount.firingState === 'CHARGEDOWN') {
      return clamp01(mount.firingStateTimer / Math.max(0.001, mount.spec.beamSourceChargedownTime ?? 0));
    }
    return 0;
  }
  return beam.damageActive === false ? clamp01(beam.duration / Math.max(0.001, beam.maxDuration)) : 1;
}

export function beamHitGlowRadius(beam: Beam): number {
  return (beam.hitGlowRadius ?? 0) > 0 ? beam.hitGlowRadius! : beam.width * (beam.brightness ?? 1) * 3;
}

/** Advance uses the previous collision's showGlow, as BeamWeaponRay.advance does. */
export function advanceBeamGlow(beam: Beam, dt: number, active: boolean): void {
  let brightness = beam.hitGlowBrightness ?? 0;
  if (beam.wasShortened && active) {
    const brighten = beam.hitGlowBrightenDuration ?? 1;
    brightness = brighten <= 0 ? 1 : brightness + dt / brighten;
  } else brightness -= dt;
  beam.hitGlowBrightness = clamp01(brightness);
  beam.wasShortened = false;
}

/** Geometry shortens every frame, including between damage samples. */
export function shortenBeamGlow(beam: Beam): void {
  beam.wasShortened = true;
  if ((beam.hitGlowBrightenDuration ?? 1) <= 0) beam.hitGlowBrightness = 1;
}

/** Native notifyDealtDamage always compares against base DPS * .1, including
 * uneven first batches; call only when actual damage is applied. */
export function recordBeamGlowDamage(beam: Beam, result: HitGlowDamageResult): void {
  const radius = beamHitGlowRadius(beam);
  if (radius <= 0 || beam.damageActive === false) return;
  const baseDamage = (beam.baseDamagePerSec ?? beam.damagePerSec) * BEAM_DAMAGE_INTERVAL;
  beam.hitGlowSizeMult = hitGlowSize(radius, baseDamage, beam.damageType, result) / radius;
}

/** L uses two integer truncations before multiplying source color alpha. */
export function beamStripAlpha(brightness: number, colorAlpha: number): number {
  const byte = Math.trunc(255 * clamp01(brightness));
  const squared = Math.trunc(255 * (byte / 255) ** 2);
  return Math.trunc(squared * colorAlpha / 255) / 255;
}

/** Sprite.renderAtCenter uses integer color alpha * alphaMult for both hit layers. */
export function beamGlowAlpha(beam: Beam, colorAlpha: number): number {
  return Math.trunc(colorAlpha * Math.min(beam.hitGlowBrightness ?? 0, beam.brightness ?? 1)) / 255;
}
