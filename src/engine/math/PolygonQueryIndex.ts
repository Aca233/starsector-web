/** Read-only index for deeply frozen authored outlines. Mutable/extreme queries use the legacy path. */
type Point = { x: number; y: number };
type Polygon = [number, number][];
interface Node { minX: number; maxX: number; minY: number; maxY: number; end: number; edge: number }
interface Index { nodes: Node[]; scale: number }
const compiled = new WeakMap<Polygon, Index>();
function indexFor(polygon: Polygon): Index | undefined {
  const cached = compiled.get(polygon);
  if (cached) return cached;
  if (polygon.length < 16 || !Object.isFrozen(polygon)) return undefined;
  const edges: Array<Node & { order: number }> = [];
  let scale = 1;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    if (!Object.isFrozen(b) || b.length !== 2 || !b.every(Number.isFinite)) return undefined;
    scale = Math.max(scale, Math.abs(b[0]), Math.abs(b[1]));
    edges.push({ minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]), minY: Math.min(a[1], b[1]), maxY: Math.max(a[1], b[1]), edge: i, end: 0, order: i });
  }
  if (scale > 1e6) return undefined;
  const nodes: Node[] = [];
  function build(list: typeof edges): void {
    const first = nodes.length, node: Node = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, end: 0, edge: -1 };
    nodes.push(node);
    for (const e of list) { node.minX = Math.min(node.minX, e.minX); node.maxX = Math.max(node.maxX, e.maxX); node.minY = Math.min(node.minY, e.minY); node.maxY = Math.max(node.maxY, e.maxY); }
    if (list.length === 1) node.edge = list[0].edge;
    else {
      const axis = node.maxX - node.minX > node.maxY - node.minY ? 'X' : 'Y';
      list.sort((a, b) => axis === 'X' ? a.minX + a.maxX - b.minX - b.maxX : a.minY + a.maxY - b.minY - b.maxY);
      const mid = list.length >> 1; build(list.slice(0, mid)); build(list.slice(mid));
    }
    nodes[first].end = nodes.length;
  }
  build(edges);
  const result = { nodes, scale }; compiled.set(polygon, result); return result;
}
export function indexedPointContains(point: Point, polygon: Polygon): boolean | undefined {
  const index = indexFor(polygon), x = point.x, y = point.y;
  if (!index || !Number.isFinite(x) || !Number.isFinite(y) || Math.max(Math.abs(x), Math.abs(y)) > 1e6) return undefined;
  let inside = false;
  // Crossing parity is independent of visit order. Retain the exact original edge formula.
  for (let n = 0; n < index.nodes.length;) {
    const node = index.nodes[n];
    if (y < node.minY || y >= node.maxY) { n = node.end; continue; }
    n++;
    if (node.edge < 0) continue;
    const i = node.edge, j = (i + polygon.length - 1) % polygon.length;
    const xi = polygon[i][0], yi = polygon[i][1], xj = polygon[j][0], yj = polygon[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function indexedSegmentEdges(start: Point, end: Point, polygon: Polygon): number[] | undefined {
  const index = indexFor(polygon);
  if (!index) return undefined;
  const scale = Math.max(index.scale, Math.abs(start.x), Math.abs(start.y), Math.abs(end.x), Math.abs(end.y));
  if (!Number.isFinite(scale) || scale > 1e6) return undefined;
  const pad = 1e-7 * scale;
  const minX = Math.min(start.x, end.x) - pad, maxX = Math.max(start.x, end.x) + pad;
  const minY = Math.min(start.y, end.y) - pad, maxY = Math.max(start.y, end.y) + pad;
  const dx = end.x - start.x, dy = end.y - start.y;
  const result: number[] = [];
  for (let n = 0; n < index.nodes.length;) {
    const node = index.nodes[n];
    if (maxX < node.minX || minX > node.maxX || maxY < node.minY || minY > node.maxY) { n = node.end; continue; }
    let first = 0, last = 1;
    if (dx !== 0) { const a = (node.minX - pad - start.x) / dx, b = (node.maxX + pad - start.x) / dx; first = Math.max(first, Math.min(a, b)); last = Math.min(last, Math.max(a, b)); }
    if (dy !== 0) { const a = (node.minY - pad - start.y) / dy, b = (node.maxY + pad - start.y) / dy; first = Math.max(first, Math.min(a, b)); last = Math.min(last, Math.max(a, b)); }
    if (first > last) { n = node.end; continue; }
    n++; if (node.edge >= 0) result.push(node.edge);
  }
  // Preserve the original inclusive edge tie-break and contact-normal choice.
  return result.sort((a, b) => a - b);
}

export interface NearestBoundaryPoint { x: number; y: number; distance: number; edge: number }

/** Exact nearest authored edge with conservative branch-and-bound rejection.
 * The tree stores end-vertex indices; tie-breaking uses the caller's start-vertex
 * order (i -> i+1). Mutable or extreme geometry retains the ordered linear path. */
export function indexedNearestBoundary(point: Point, polygon: Polygon): NearestBoundaryPoint | undefined {
  const index = indexFor(polygon);
  if (!index) return undefined;
  const px = point.x, py = point.y;
  const scale = Math.max(index.scale, Math.abs(px), Math.abs(py));
  if (!Number.isFinite(scale) || scale > 1e6) return undefined;
  const pad = 1e-7 * scale;
  // Coordinates are bounded above, so squared lower bounds cannot overflow.
  // Only the conservative pruning/ranking uses squares; exact leaf distances
  // retain the original Math.hypot and tie-break arithmetic.
  const lowerSquared = (node: Node): number => {
    const dx = Math.max(0, node.minX - px, px - node.maxX);
    const dy = Math.max(0, node.minY - py, py - node.maxY);
    return dx * dx + dy * dy;
  };
  let best = Infinity, edge = Infinity, x = 0, y = 0;
  const pending = [0];
  while (pending.length) {
    const n = pending.pop()!, node = index.nodes[n];
    const limit = best + pad;
    if (lowerSquared(node) > limit * limit) continue;
    if (node.edge < 0) {
      const left = n + 1, right = index.nodes[left].end;
      // Near child first establishes a tight bound before visiting the far one.
      if (lowerSquared(index.nodes[left]) <= lowerSquared(index.nodes[right])) pending.push(right, left);
      else pending.push(left, right);
      continue;
    }
    const first = (node.edge + polygon.length - 1) % polygon.length;
    const a = polygon[first], b = polygon[node.edge];
    const dx = b[0] - a[0], dy = b[1] - a[1], length = dx * dx + dy * dy;
    const t = length > 0 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / length)) : 0;
    const cx = a[0] + dx * t, cy = a[1] + dy * t;
    const distance = Math.hypot(cx - px, cy - py);
    if (distance < best || distance === best && first < edge) {
      best = distance; edge = first; x = cx; y = cy;
    }
  }
  return Number.isFinite(best) ? { x, y, distance: best, edge } : undefined;
}
