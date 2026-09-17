import type { ExplosionAnimation, ExplosionPuff } from '../simulation/CombatTypes';
import type { ShipSpec } from '../content/ShipSpec';
import type { SimulationRandom } from '../simulation/SimulationRandom';
import { Vector2 } from '../math/Vector2';

/** ExplosionParticleSystem / GenericTextureParticle: independent fixed-texture puffs. */
export function createExplosionPuffs(diameter: number, random: SimulationRandom, rings: boolean, velocity = new Vector2()): ExplosionPuff[] {
  const baseSize = 20 + 60 * diameter / 500;
  const count = Math.ceil(Math.max(5, Math.pow(diameter / 2 / (baseSize * 0.66), 2) * 6));
  const puffs: ExplosionPuff[] = [];
  for (let i = 0; i < count; i++) {
    let texture = Math.floor(random.next() * 4);
    if (texture === 3) texture = Math.floor(random.next() * 4);
    if (texture === 3 && !rings) texture = Math.floor(random.next() * 3);
    let startSize = baseSize * (1 + random.next());
    let endSize = startSize * 1.25;
    if (texture === 3) { endSize = startSize * 3; startSize = endSize / 10; }
    const angle = random.next() * Math.PI * 2;
    const rotation = random.next() * Math.PI * 2;
    const distance = texture === 3 || i < 5 ? 0 : diameter / 4 * random.next();
    const speed = 10 + random.next() * 20 * diameter / 500;
    puffs.push({
      texture: texture as ExplosionPuff['texture'], startSize, endSize, rotation,
      offset: Vector2.fromAngle(angle, distance),
      velocity: texture === 3 ? velocity.clone() : Vector2.fromAngle(angle, speed).add(velocity)
    });
  }
  return puffs;
}

/** CombatEngine.addHitParticle derives duration from the sprite's diameter. */
export function hitParticleDuration(diameter: number): number {
  return Math.min(2, diameter < 50 ? diameter * 0.01 : diameter > 100 ? 0.5 + (diameter - 100) * 0.01 : 0.5);
}

/** Ship.java's standard hull explosion, excluding breakup and damage mechanics. */
export function createShipExplosion(spec: ShipSpec, pos: Vector2, velocity: Vector2, random: SimulationRandom): ExplosionAnimation {
  const fighter = spec.hullSize === 'FIGHTER';
  const scale = spec.hullSize === 'CAPITAL_SHIP' ? 1.7 : ['CRUISER', 'DESTROYER'].includes(spec.hullSize ?? '') ? 1.5 : 1;
  const diameter = Math.sqrt(spec.collisionRadius) * 15 * (fighter ? 1.75 : 4) * scale;
  const flashDiameter = Math.sqrt(spec.collisionRadius) * 60 * (fighter ? 0.5 : 1) * scale;
  const color = spec.explosionColor ?? [255, 165, 100];
  const flashColor = spec.explosionFlashColor ?? [255, 125, 25];
  const largeFlare = !fighter && spec.hullSize !== 'FRIGATE';
  const duration = fighter ? 1.5 : largeFlare ? 2.25 : 2;
  return {
    id: random.next(), visualKind: 'ship', sourceShipId: spec.id, pos: pos.clone(),
    radius: diameter / 2, maxRadius: diameter / 2, life: duration, maxLife: duration,
    frame: 0, rotation: 0, color, hasShockwaveRing: true, shockwaveRadius: 0, maxShockwaveRadius: diameter,
    puffs: createExplosionPuffs(diameter, random, true, velocity),
    puffDuration: fighter ? 1 : 2,
    flash: { diameter: flashDiameter * 3, coreDiameter: spec.hullSize === 'FRIGATE' ? flashDiameter * 0.5 : undefined,
      color: flashColor, duration: 1.5, velocity: velocity.clone() },
    flare: largeFlare ? { width: diameter * 0.47786722 * 4 * scale, height: diameter * 0.47786722 * 1.6 * scale,
      color: flashColor, velocity: velocity.clone() } : undefined
  };
}
