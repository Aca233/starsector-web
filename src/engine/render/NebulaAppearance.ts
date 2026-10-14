import { standaloneNebulae } from '../data/terrain/StandaloneNebulae';
import { NEBULA_SPRITE_SIZE } from '../simulation/systems/NebulaSystem';

/** Full-image UVs for standalone assets; recorded atlas snapshots remain readable.
 * Battle and map use these same dimensions without procedural variation. */
export function nebulaAppearance(cloud: {
  readonly spriteUrl: string; readonly atlasColumn: number; readonly atlasRow: number;
}) {
  const art = standaloneNebulae.find(entry => entry.spriteUrl === cloud.spriteUrl);
  const width = art?.width ?? NEBULA_SPRITE_SIZE;
  const height = art?.height ?? NEBULA_SPRITE_SIZE;
  const u = art ? 0 : cloud.atlasColumn / 4;
  const v = art ? 0 : cloud.atlasRow / 4;
  const span = art ? 1 : .25;
  return {
    width, height, rotationRad: 0, opacityMult: 1,
    renderRadius: Math.hypot(width, height) / 2,
    u, v, u2: u + span, v2: v + span
  };
}
