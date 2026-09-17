import { Vector2 } from '../../math/Vector2';
import type { NebulaCloud } from '../CombatTypes';
import type { Ship } from '../Ship';
import { SimulationRandom } from '../SimulationRandom';

// combat/entities/terrain/A.java and Cloud.java; settings.json smallClouds=true.
export const NEBULA_TILE_SIZE = 125;
export const NEBULA_SPRITE_SIZE = 312.5;
const NEBULA_ATLAS = '/game-assets/graphics/terrain/nebula.png';

export class NebulaSystem {
  public nebulae: NebulaCloud[] = [];

  constructor(private readonly visualRandom = new SimulationRandom(0x4e454255)) {}

  public init() {
    this.nebulae = [];
    // These regions remain the sandbox map, not an original mission layout.
    const regions = [
      { x: 0, y: 750, radius: 650 },
      { x: -150, y: -750, radius: 680 },
      { x: 500, y: 350, radius: 520 }
    ];
    const occupied = new Set<string>();
    for (const region of regions) {
      // A.spawnCloud(): power-of-two noise grid, radial thinning and >= .25 thickness.
      const radius = Math.max(1, Math.floor(region.radius / NEBULA_TILE_SIZE));
      let span = 2;
      while (span < radius * 2) span *= 2;
      const thickness = this.createThicknessGrid(span + 1);
      const centerX = Math.floor(region.x / NEBULA_TILE_SIZE);
      const centerY = Math.floor(region.y / NEBULA_TILE_SIZE);
      const half = span / 2;
      for (let x = 0; x <= span; x++) {
        for (let y = 0; y <= span; y++) {
          const distance = Math.hypot(x - half, y - half);
          if (distance > radius || this.visualRandom.next() <= distance / (radius * 1.5)) continue;
          const tileX = centerX - half + x;
          const tileY = centerY - half + y;
          const key = tileX + ',' + tileY;
          if (occupied.has(key)) continue;
          occupied.add(key);
          this.nebulae.push({
            id: this.nebulae.length,
            pos: new Vector2((tileX + 0.5) * NEBULA_TILE_SIZE, (tileY + 0.5) * NEBULA_TILE_SIZE),
            thickness: Math.max(0.25, thickness[x][y]),
            atlasColumn: Math.floor(this.visualRandom.next() * 4),
            atlasRow: Math.floor(this.visualRandom.next() * 4),
            spriteUrl: NEBULA_ATLAS
          });
        }
      }
    }
    // A.renderBelow traverses the tile grid column first; alpha blending is ordered.
    this.nebulae.sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y);
  }

  public update(allShips: readonly Ship[]) {
    // settings.json nebulaSpeed{Fighter,Frigate,Destroyer,Cruiser,Capital}=1.
    // A.advance only runs the hull-speed path with smallClouds enabled. It does
    // not apply the old sandbox's rocket drag or emit random contact particles.
    for (const ship of allShips) ship.terrainSpeedMult = 1;
  }

  /** Seeded port of terrain/B.java's recursive midpoint-displacement field. */
  private createThicknessGrid(size: number): number[][] {
    const grid = Array.from({ length: size }, () => Array<number>(size).fill(-1));
    const end = size - 1;
    grid[0][0] = grid[0][end] = grid[end][0] = grid[end][end] = 1;
    const midpoint = (x: number, y: number, ax: number, ay: number, bx: number, by: number, level: number) => {
      if (grid[x][y] !== -1) return;
      grid[x][y] = (grid[ax][ay] + grid[bx][by]) / 2 + Math.pow(0.7, level) * (this.visualRandom.next() - 0.5);
    };
    const subdivide = (left: number, top: number, right: number, bottom: number, level: number) => {
      if (left + 1 >= right || top + 1 >= bottom) return;
      const x = (left + right) / 2;
      const y = (top + bottom) / 2;
      midpoint(x, top, left, top, right, top, level);
      midpoint(x, bottom, left, bottom, right, bottom, level);
      midpoint(left, y, left, top, left, bottom, level);
      midpoint(right, y, right, top, right, bottom, level);
      // The source's second midpoint call is a no-op after the first fills it.
      midpoint(x, y, x, top, x, bottom, level);
      subdivide(left, top, x, y, level + 1);
      subdivide(left, y, x, bottom, level + 1);
      subdivide(x, top, right, y, level + 1);
      subdivide(x, y, right, bottom, level + 1);
    };
    subdivide(0, 0, end, end, 1);
    let min = 1;
    let max = 0;
    for (const column of grid) for (const value of column) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    if (min < max) for (const column of grid) {
      for (let y = 0; y < size; y++) column[y] = (column[y] - min) / (max - min);
    }
    return grid;
  }
}
