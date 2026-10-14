import { Vector2 } from '../../math/Vector2';
import type { NebulaCloud } from '../CombatTypes';
import type { Ship } from '../Ship';
import type { SimulationRandom } from '../SimulationRandom';
import { standaloneNebulae } from '../../data/terrain/StandaloneNebulae';
import { knownProjectionKeys } from '../../runtime/local/RenderShipProjection';

// Kept for decoding previously recorded atlas-based battles.
export const NEBULA_TILE_SIZE = 125;
export const NEBULA_SPRITE_SIZE = 312.5;

const nebulaProjectionKeys = Object.freeze([
  'id', 'pos', 'thickness', 'atlasColumn', 'atlasRow', 'spriteUrl'
]);

export class NebulaSystem {
  public nebulae: NebulaCloud[] = [];

  constructor(_visualRandom?: SimulationRandom) {}

  public init() {
    // Each definition is one complete authored image, drawn once. No tile grid,
    // procedural density field, random holes, or repeated cloud fragments.
    this.nebulae = standaloneNebulae.map((cloud, id) => {
      const nebula: NebulaCloud = {
        id, pos: new Vector2(cloud.x, cloud.y), thickness: cloud.opacity,
        atlasColumn: 0, atlasRow: 0, spriteUrl: cloud.spriteUrl
      };
      knownProjectionKeys.set(nebula, nebulaProjectionKeys);
      return nebula;
    });
  }

  public update(allShips: readonly Ship[]) {
    for (const ship of allShips) ship.terrainSpeedMult = 1;
  }
}
