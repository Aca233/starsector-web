import type { Projectile } from '../Weapon';
import type { Vector2 } from '../../math/Vector2';

type CellBounds = readonly [number, number, number, number];
interface Entry { projectile: Projectile; order: number; cells: CellBounds | null }

/** Transient missile broadphase, owned by one ordered projectile update.
 * Ordinary motion/removal updates individual entries. Unknown effect mutations
 * invalidate the index; the next query rebuilds from the authoritative array.
 * Exact circle contacts and tie-breaking stay in ProjectileCollisionHandler. */
export class ProjectileInterceptionIndex {
  private readonly rows = new Map<number, Map<number, Set<Entry>>>();
  private readonly entries = new Map<Projectile, Entry>();
  private readonly unbounded = new Set<Entry>();
  private source: Projectile[] | null = null;
  private sourceLength = -1;
  private linearOnly = false;
  private readonly cellSize = 256;

  public invalidate(): void { this.sourceLength = -1; }

  private cells(minX: number, minY: number, maxX: number, maxY: number): CellBounds | null {
    const x0 = Math.floor(minX / this.cellSize), y0 = Math.floor(minY / this.cellSize);
    const x1 = Math.floor(maxX / this.cellSize), y1 = Math.floor(maxY / this.cellSize);
    if (!Number.isSafeInteger(x0) || !Number.isSafeInteger(y0) || !Number.isSafeInteger(x1) || !Number.isSafeInteger(y1)
      || (x1 - x0 + 1) * (y1 - y0 + 1) > 4096) return null;
    return [x0, y0, x1, y1];
  }

  private missileCells(projectile: Projectile): CellBounds | null {
    const { x, y } = projectile.pos, radius = Math.abs(projectile.radius);
    const pad = 1e-7 * Math.max(1, Math.abs(x), Math.abs(y), radius);
    return this.cells(x - radius - pad, y - radius - pad, x + radius + pad, y + radius + pad);
  }

  private insert(entry: Entry): void {
    if (!entry.cells) { this.unbounded.add(entry); return; }
    const [x0, y0, x1, y1] = entry.cells;
    for (let cy = y0; cy <= y1; cy++) {
      let row = this.rows.get(cy);
      if (!row) { row = new Map(); this.rows.set(cy, row); }
      for (let cx = x0; cx <= x1; cx++) {
        let bucket = row.get(cx);
        if (!bucket) { bucket = new Set(); row.set(cx, bucket); }
        bucket.add(entry);
      }
    }
  }

  private unlink(entry: Entry): void {
    if (!entry.cells) { this.unbounded.delete(entry); return; }
    const [x0, y0, x1, y1] = entry.cells;
    for (let cy = y0; cy <= y1; cy++) {
      const row = this.rows.get(cy);
      if (!row) continue;
      for (let cx = x0; cx <= x1; cx++) {
        const bucket = row.get(cx);
        if (!bucket) continue;
        bucket.delete(entry);
        if (bucket.size === 0) row.delete(cx);
      }
      if (row.size === 0) this.rows.delete(cy);
    }
  }

  /** Call when splicing an element from the indexed array (including bullets).
   * Removing a bullet changes the length, but not any missile's relative order. */
  public remove(projectile: Projectile): void {
    if (this.sourceLength < 0) return;
    this.sourceLength--;
    const entry = this.entries.get(projectile);
    if (entry) { this.unlink(entry); this.entries.delete(projectile); }
  }

  /** Refresh a surviving missile after its motion/contact. Never resurrect a
   * removed entry; unannounced additions are detected by the array length. */
  public update(projectile: Projectile): void {
    if (this.sourceLength < 0 || this.linearOnly) return;
    const entry = this.entries.get(projectile);
    if (!entry) return;
    if (!projectile.isRocket) { this.unlink(entry); this.entries.delete(projectile); return; }
    const cells = this.missileCells(projectile), old = entry.cells;
    if (cells === null && old === null) return;
    if (cells && old && cells[0] === old[0] && cells[1] === old[1] && cells[2] === old[2] && cells[3] === old[3]) return;
    this.unlink(entry);
    entry.cells = cells;
    this.insert(entry);
  }

  private rebuild(projectiles: Projectile[]): void {
    this.rows.clear(); this.entries.clear(); this.unbounded.clear();
    this.source = projectiles; this.sourceLength = projectiles.length; this.linearOnly = false;
    for (let order = 0; order < projectiles.length; order++) {
      const projectile = projectiles[order];
      if (!projectile.isRocket) continue;
      // An extension may insert the same object twice. Do not merge its array
      // positions or rely on a single movement/removal entry in that case.
      if (this.entries.has(projectile)) { this.linearOnly = true; continue; }
      const entry = { projectile, order, cells: this.missileCells(projectile) };
      this.entries.set(projectile, entry); this.insert(entry);
    }
  }

  public query(projectile: Projectile, projectiles: Projectile[]): Projectile[] {
    // Avoid building an index in small fights and for non-colliding remnants.
    if (projectiles.length < 64) return projectiles;
    if (projectile.isFlare || projectile.didDamage || (projectile.isRocket && projectile.targetProjectileId === undefined)) return [];
    const start = projectile.prevPos, end = projectile.pos;
    const radius = projectile.spawnType === 'BALLISTIC_AS_BEAM' ? 0 : Math.abs(projectile.radius);
    const pad = radius + 1e-7 * Math.max(1, radius, Math.abs(start.x), Math.abs(start.y), Math.abs(end.x), Math.abs(end.y));
    const cells = this.cells(Math.min(start.x, end.x) - pad, Math.min(start.y, end.y) - pad,
      Math.max(start.x, end.x) + pad, Math.max(start.y, end.y) + pad);
    return this.queryCells(cells, projectiles);
  }

  /** Fuse triggers test missile centers, not their swept paths. Indexed missile
   * extents include their centers, so the same grid is a conservative superset.
   * Do not reuse interception's flare/impact/rocket eligibility shortcuts here. */
  public queryRadius(center: Vector2, radius: number, projectiles: Projectile[]): Projectile[] {
    if (projectiles.length < 64) return projectiles;
    const reach = Math.abs(radius);
    const pad = reach + 1e-7 * Math.max(1, reach, Math.abs(center.x), Math.abs(center.y));
    return this.queryCells(this.cells(center.x - pad, center.y - pad, center.x + pad, center.y + pad), projectiles);
  }

  private queryCells(cells: CellBounds | null, projectiles: Projectile[]): Projectile[] {
    // Huge/nonfinite custom geometry uses the exact original scan.
    if (!cells) return projectiles;
    if (this.source !== projectiles || this.sourceLength !== projectiles.length) this.rebuild(projectiles);
    if (this.linearOnly) return projectiles;
    const candidates = new Set(this.unbounded);
    const [x0, y0, x1, y1] = cells;
    for (let cy = y0; cy <= y1; cy++) {
      const row = this.rows.get(cy);
      if (!row) continue;
      for (let cx = x0; cx <= x1; cx++) {
        const bucket = row.get(cx);
        if (bucket) for (const entry of bucket) candidates.add(entry);
      }
    }
    return [...candidates].sort((a, b) => a.order - b.order).map(entry => entry.projectile);
  }
}
