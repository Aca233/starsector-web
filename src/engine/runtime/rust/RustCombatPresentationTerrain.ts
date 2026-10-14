import { Vector2 } from '../../math/Vector2';
import type { CombatRenderView } from '../../render/CombatRenderView';
import type { ShipRenderState } from '../../render/ShipRenderState';
import type { RustWorldSnapshot } from './RustWorldProtocol';
import { RustPresentationReader as Reader } from './RustCombatPresentationData';

export function rustPresentationTerrain(world: RustWorldSnapshot,
  shipByWorldIdentity: (id: number, generation: number) => ShipRenderState, asteroidSprites: readonly string[]):
  Pick<CombatRenderView, 'asteroids' | 'nebulae' | 'hulkFragments'> {
  const nebulae = world.terrain.nebulae.map(row => {
    const r = new Reader(row.values), id = r.n(), spriteUrl = r.string(), pos = r.point(), thickness = r.n(), atlasColumn = r.n(), atlasRow = r.n(); r.finish();
    return { id, spriteUrl, pos, thickness, atlasColumn, atlasRow };
  });
  const asteroids = world.terrain.asteroids.map(row => {
    const r = new Reader(row.values), id = r.n(); r.n();
    const pos = r.point(), vel = r.point(), facingRad = r.n(), angularVel = r.n(), radius = r.n(), mass = r.n(), hp = r.n(), maxHp = r.n();
    const spriteUrl = asteroidSprites[r.n()]; if (!spriteUrl) throw Error('Unknown Rust asteroid artwork'); const gravityFixed = r.flag(); r.finish();
    return { id, pos, vel, facingRad, angularVel, radius, mass, hp, maxHp, spriteUrl, gravityFixed };
  });
  const hulkFragments = world.terrain.hulks.map(row => {
    const r = new Reader(row.values), id = r.n(), sourceShip = shipByWorldIdentity(r.n(), r.n());
    r.skip(3); const pos = r.point(), vel = r.point(), facingRad = r.n(), angularVel = r.n(), age = r.n(), localOffset = r.point(), collisionRadius = r.n();
    const hasSequence = r.flag(), sequenceId = r.n(), gravityFixed = r.flag(), gravityManaged = r.flag();
    const bounds = Array.from({ length: r.count() }, () => r.point());
    const visualBounds = r.flag() ? Array.from({ length: r.count() }, () => r.point()) : null;
    const mountSlotIds = Array.from({ length: r.count() }, () => { const slot = r.n(); r.point();
      const key = sourceShip.spec.weaponSlots[slot - 1]?.slotId;
      if (key === undefined) throw Error('Missing Rust hulk slot binding'); return key;
    });
    r.finish();
    const sequence = hasSequence ? world.terrain.sequences.find(s => s.values[0] === sequenceId) : undefined;
    if (hasSequence && !sequence) throw Error('Missing Rust hulk breakup state');
    const breakup = sequence ? { remainingSplits: sequence.values[1], interval: sequence.values[2], elapsed: sequence.values[3], nextInterval: sequence.values[4] } : null;
    return { id, sourceShip, pos, vel, facingRad, angularVel, age, localOffset, collisionRadius, gravityFixed, gravityManaged, bounds, visualBounds, mountSlotIds, breakup };
  });
  return { nebulae, asteroids, hulkFragments };
}
export function rustPresentationFloating(world: RustWorldSnapshot) {
  return world.floating.map(row => {
    const r = new Reader(row.values), id = r.n(), pos = r.point(), vel = r.point(), text = r.string();
    const color: [number, number, number] = [r.n(), r.n(), r.n()], size = r.n(), life = r.n(), maxLife = r.n(); r.finish();
    return { id, pos, vel, text, color, size, life, maxLife };
  });
}
export const rustPresentationPoint = (point: readonly [number, number]): Vector2 => new Vector2(point[0], point[1]);
