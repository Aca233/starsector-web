import { Vector2 } from '../math/Vector2';
import type { MuzzleParticle } from '../simulation/CombatTypes';
import type { SimulationRandom } from '../simulation/SimulationRandom';
import type { MuzzleFlashSpec, LauncherSmokeSpec } from '../simulation/Weapon';

/** Shared authored cosmetic generators. They never read or mutate combat state. */
export function appendMuzzleFlash(
    particles: MuzzleParticle[], random: SimulationRandom,
    spec: MuzzleFlashSpec,
    muzzlePos: Vector2,
    angleRad: number,
    shipVel: Vector2
  ) {
    const spreadRad = (spec.spread * Math.PI) / 180;
    const baseAngle = angleRad - spreadRad / 2;
    for (let i = 0; i < spec.particleCount; i++) {
      const pSize = spec.particleSizeRange * random.next() + spec.particleSizeMin;
      const pAngle = random.next() * spreadRad + baseAngle;
      const pDist = random.next() * spec.length;
      const f10 = Math.cos(pAngle) * pDist;
      const f11 = Math.sin(pAngle) * pDist;
      particles.push({
        pos: new Vector2(muzzlePos.x + f10, muzzlePos.y + f11),
        vel: new Vector2(f10 + shipVel.x, f11 + shipVel.y),
        size: pSize,
        life: spec.particleDuration,
        maxLife: spec.particleDuration,
        color: [...spec.particleColor]
      });
    }
  }

export function appendLauncherSmoke(
    particles: MuzzleParticle[], random: SimulationRandom,
    spec: LauncherSmokeSpec,
    muzzlePos: Vector2,
    angleRad: number,
    shipVel: Vector2
  ) {
    const [r, g, b, a] = spec.particleColor;
    for (let i = 0; i < spec.cloudParticleCount; i++) {
      const theta = random.next() * Math.PI * 2;
      const radius = Math.sqrt(random.next()) * spec.cloudRadius;
      const outward = 4 + random.next() * 10;
      particles.push({
        pos: muzzlePos.clone().add(Vector2.fromAngle(theta, radius)),
        vel: shipVel.clone().add(Vector2.fromAngle(theta, outward)),
        size: spec.particleSizeMin + random.next() * spec.particleSizeRange,
        life: spec.cloudDuration,
        maxLife: spec.cloudDuration,
        color: [r, g, b, a],
        blendMode: 'NORMAL'
      });
    }

    const spreadRad = (spec.blowbackSpread * Math.PI) / 180;
    const rearAngle = angleRad + Math.PI;
    for (let i = 0; i < spec.blowbackParticleCount; i++) {
      const theta = rearAngle + (random.next() - 0.5) * spreadRad;
      const dist = random.next() * spec.blowbackLength;
      const offset = Vector2.fromAngle(theta, dist);
      particles.push({
        pos: muzzlePos.clone().add(offset),
        vel: shipVel.clone().add(offset),
        size: spec.particleSizeMin + random.next() * spec.particleSizeRange,
        life: spec.blowbackDuration,
        maxLife: spec.blowbackDuration,
        color: [r, g, b, a],
        blendMode: 'NORMAL'
      });
    }
  }

