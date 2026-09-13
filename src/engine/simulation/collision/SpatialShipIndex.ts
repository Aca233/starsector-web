import { Vector2 } from '../../math/Vector2';
import type { Ship } from '../Ship';

/**
 * Uniform-grid broadphase for projectile-vs-ship collision queries.
 *
 * Ships are inserted using an AABB that conservatively covers both hull and
 * shield geometry. Segment queries only reduce candidate pairs; exact hit
 * authority remains in RuntimeCollisionKernel.
 */
export class SpatialShipIndex {
  private readonly rows = new Map<number, Map<number, number[]>>();
  private ships: Ship[] = [];
  private prepared = false;
  private visitMarks = new Uint32Array(0);
  private queryEpoch = 0;

  constructor(public readonly cellSize = 384) {}

  public rebuild(ships: Ship[]): void {
    this.rows.clear();
    this.ships = ships;
    this.prepared = true;
    if (this.visitMarks.length < ships.length) this.visitMarks = new Uint32Array(ships.length);
    else this.visitMarks.fill(0, 0, ships.length);
    this.queryEpoch = 0;

    for (let index = 0; index < ships.length; index++) {
      const ship = ships[index];
      if (ship.isDead || ship.isPhased) continue;

      const hullExtent = ship.spec.bounds?.reduce(
        (maxRadius, [x, y]) => Math.max(maxRadius, Math.hypot(x, y)),
        ship.spec.collisionRadius
      ) ?? ship.spec.collisionRadius;
      const shieldOffset = Math.hypot(ship.spec.shieldCenterX ?? 0, ship.spec.shieldCenterY ?? 0);
      const radius = Math.max(
        hullExtent,
        shieldOffset + Math.max(0, ship.shield.radius)
      );
      const minCellX = this.toCell(ship.pos.x - radius);
      const maxCellX = this.toCell(ship.pos.x + radius);
      const minCellY = this.toCell(ship.pos.y - radius);
      const maxCellY = this.toCell(ship.pos.y + radius);

      for (let cy = minCellY; cy <= maxCellY; cy++) {
        for (let cx = minCellX; cx <= maxCellX; cx++) {
          let row = this.rows.get(cy);
          if (!row) {
            row = new Map<number, number[]>();
            this.rows.set(cy, row);
          }
          const bucket = row.get(cx);
          if (bucket) bucket.push(index);
          else row.set(cx, [index]);
        }
      }
    }
  }

  public get isPrepared(): boolean {
    return this.prepared;
  }

  public querySegment(start: Vector2, end: Vector2, padding = 0): Ship[] {
    if (!this.prepared) return [];

    const pad = Math.max(0, padding);
    const minCellX = this.toCell(Math.min(start.x, end.x) - pad);
    const maxCellX = this.toCell(Math.max(start.x, end.x) + pad);
    const minCellY = this.toCell(Math.min(start.y, end.y) - pad);
    const maxCellY = this.toCell(Math.max(start.y, end.y) + pad);
    this.queryEpoch++;
    if (this.queryEpoch === 0xffffffff) {
      this.visitMarks.fill(0, 0, this.ships.length);
      this.queryEpoch = 1;
    }

    for (let cy = minCellY; cy <= maxCellY; cy++) {
      const row = this.rows.get(cy);
      if (!row) continue;
      for (let cx = minCellX; cx <= maxCellX; cx++) {
        const bucket = row.get(cx);
        if (!bucket) continue;
        for (const index of bucket) this.visitMarks[index] = this.queryEpoch;
      }
    }

    const candidates: Ship[] = [];
    for (let index = 0; index < this.ships.length; index++) {
      if (this.visitMarks[index] === this.queryEpoch) candidates.push(this.ships[index]);
    }
    return candidates;
  }

  private toCell(value: number): number {
    return Math.floor(value / this.cellSize);
  }

}
