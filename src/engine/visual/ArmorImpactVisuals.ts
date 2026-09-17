import { Vector2 } from '../math/Vector2';
import type { Particle } from '../simulation/CombatTypes';
import type { SimulationRandom } from '../simulation/SimulationRandom';

/** Ship.applyDamageInner -> EmitterFactory's one-shot armor-damage SmoothParticles. */
export function createArmorDamageParticles(pos: Vector2, armorDamage: number, random: SimulationRandom): Particle[] {
  if (!Number.isFinite(armorDamage) || armorDamage <= 0) return [];
  let damage = Math.min(100, armorDamage);
  if (damage < 10 && random.next() * 10 < damage) damage = 10;
  const count = Math.floor(damage / 10);
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const size = Math.floor(random.next() * 3 + 3);
    const offset = Vector2.fromAngle(random.next() * Math.PI * 2, random.next() * 10);
    // Native emitter independently scales the two components; no inherited ship velocity or drag.
    const vel = new Vector2(offset.x * 3 * random.next(), offset.y * 3 * random.next());
    particles.push({ pos: pos.clone().add(offset), vel, size, life: 1, maxLife: 1,
      color: [255, 200, 55], alpha: 1, material: 'SOURCE_SMOOTH' });
  }
  return particles;
}
