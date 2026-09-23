// Frozen pre-incremental-cell reference (2026-09-22). Test oracle, not production.
// Source SHA-256: a7f66953a993a5f70c31dfadfec29166fb6830b841d2bcfca771704c7138241e
class ProjectileInterceptionIndex {
  rows = /* @__PURE__ */ new Map();
  entries = /* @__PURE__ */ new Map();
  unbounded = /* @__PURE__ */ new Set();
  source = null;
  sourceLength = -1;
  linearOnly = false;
  generation = 0;
  cellSize = 256;
  invalidate() {
    this.sourceLength = -1;
  }
  cells(minX, minY, maxX, maxY) {
    const x0 = Math.floor(minX / this.cellSize), y0 = Math.floor(minY / this.cellSize);
    const x1 = Math.floor(maxX / this.cellSize), y1 = Math.floor(maxY / this.cellSize);
    if (!Number.isSafeInteger(x0) || !Number.isSafeInteger(y0) || !Number.isSafeInteger(x1) || !Number.isSafeInteger(y1) || (x1 - x0 + 1) * (y1 - y0 + 1) > 4096) return null;
    return [x0, y0, x1, y1];
  }
  missileCells(projectile) {
    const { x, y } = projectile.pos, radius = Math.abs(projectile.radius);
    const pad = 1e-7 * Math.max(1, Math.abs(x), Math.abs(y), radius);
    return this.cells(x - radius - pad, y - radius - pad, x + radius + pad, y + radius + pad);
  }
  insert(entry) {
    if (!entry.cells) {
      this.unbounded.add(entry);
      return;
    }
    const [x0, y0, x1, y1] = entry.cells;
    for (let cy = y0; cy <= y1; cy++) {
      let row = this.rows.get(cy);
      if (!row) {
        row = /* @__PURE__ */ new Map();
        this.rows.set(cy, row);
      }
      for (let cx = x0; cx <= x1; cx++) {
        let bucket = row.get(cx);
        if (!bucket) {
          bucket = /* @__PURE__ */ new Set();
          row.set(cx, bucket);
        }
        bucket.add(entry);
      }
    }
  }
  unlink(entry) {
    if (!entry.cells) {
      this.unbounded.delete(entry);
      return;
    }
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
  remove(projectile) {
    if (this.sourceLength < 0) return;
    this.sourceLength--;
    const entry = this.entries.get(projectile);
    if (entry) {
      this.unlink(entry);
      this.entries.delete(projectile);
    }
  }
  /** Refresh a surviving missile after its motion/contact. Never resurrect a
   * removed entry; unannounced additions are detected by the array length. */
  update(projectile) {
    if (this.sourceLength < 0 || this.linearOnly) return;
    const entry = this.entries.get(projectile);
    if (!entry) return;
    if (!projectile.isRocket) {
      this.unlink(entry);
      this.entries.delete(projectile);
      return;
    }
    const cells = this.missileCells(projectile), old = entry.cells;
    if (cells === null && old === null) return;
    if (cells && old && cells[0] === old[0] && cells[1] === old[1] && cells[2] === old[2] && cells[3] === old[3]) return;
    this.unlink(entry);
    entry.cells = cells;
    this.insert(entry);
  }
  rebuild(projectiles) {
    const generation = ++this.generation;
    this.source = projectiles;
    this.sourceLength = projectiles.length;
    this.linearOnly = false;
    for (let order = 0; order < projectiles.length; order++) {
      const projectile = projectiles[order];
      if (!projectile.isRocket) continue;
      const entry = this.entries.get(projectile);
      if (entry?.generation === generation) {
        this.linearOnly = true;
        continue;
      }
      if (entry) {
        entry.order = order;
        entry.generation = generation;
        this.update(projectile);
      } else {
        const added = { projectile, order, cells: this.missileCells(projectile), generation };
        this.entries.set(projectile, added);
        this.insert(added);
      }
    }
    for (const [projectile, entry] of this.entries) {
      if (entry.generation === generation) continue;
      this.unlink(entry);
      this.entries.delete(projectile);
    }
  }
  query(projectile, projectiles) {
    if (projectiles.length < 64) return projectiles;
    if (projectile.isFlare || projectile.didDamage || projectile.isRocket && projectile.targetProjectileId === void 0) return [];
    const start = projectile.prevPos, end = projectile.pos;
    const radius = projectile.spawnType === "BALLISTIC_AS_BEAM" ? 0 : Math.abs(projectile.radius);
    const pad = radius + 1e-7 * Math.max(1, radius, Math.abs(start.x), Math.abs(start.y), Math.abs(end.x), Math.abs(end.y));
    const cells = this.cells(
      Math.min(start.x, end.x) - pad,
      Math.min(start.y, end.y) - pad,
      Math.max(start.x, end.x) + pad,
      Math.max(start.y, end.y) + pad
    );
    return this.queryCells(cells, projectiles);
  }
  /** Fuse triggers test missile centers, not their swept paths. Indexed missile
   * extents include their centers, so the same grid is a conservative superset.
   * Do not reuse interception's flare/impact/rocket eligibility shortcuts here. */
  queryRadius(center, radius, projectiles) {
    if (projectiles.length < 64) return projectiles;
    const reach = Math.abs(radius);
    const pad = reach + 1e-7 * Math.max(1, reach, Math.abs(center.x), Math.abs(center.y));
    return this.queryCells(this.cells(center.x - pad, center.y - pad, center.x + pad, center.y + pad), projectiles);
  }
  queryCells(cells, projectiles) {
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
    return [...candidates].sort((a, b) => a.order - b.order).map((entry) => entry.projectile);
  }
}
export {
  ProjectileInterceptionIndex
};
