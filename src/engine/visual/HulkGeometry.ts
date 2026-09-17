import { Vector2 } from '../math/Vector2';
import type { SimulationRandom } from '../simulation/SimulationRandom';
import type { HullSize } from '../simulation/FluxTracker';

const EPS = 0.1; // Tesselator's point-match tolerance, in ship-local world units.
export interface HullCut {
  bounds: Vector2[];
  visualBounds: Vector2[];
  seam: Vector2[];
}
const near = (a: Vector2, b: Vector2) => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;
const cross = (a: Vector2, b: Vector2) => a.x * b.y - a.y * b.x;

export function polygonArea(points: readonly Vector2[]): number {
  return points.reduce((sum, p, i) => sum + cross(p, points[(i + 1) % points.length]), 0) / 2;
}

/** Native Tesselator.Oo uses a vertex mean, not an area centroid. */
export function hullBounds(points: readonly Vector2[]) {
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
  const center = points.reduce((sum, p) => sum.add(p), points[0].clone()).scale(1 / (points.length + 1));
  const width = maxX - minX, height = maxY - minY;
  return { minX, maxX, minY, maxY, width, height, center,
    radius: Math.hypot(Math.max(center.x - minX, maxX - center.x), Math.max(center.y - minY, maxY - center.y)) + 20 };
}

export function distanceToSegment(point: Vector2, a: Vector2, b: Vector2): { distance: number; t: number } {
  const ab = b.clone().sub(a);
  const t = Math.max(0, Math.min(1, point.clone().sub(a).dot(ab) / (ab.lengthSq() || 1)));
  return { distance: point.distanceTo(a.clone().addScaled(ab, t)), t };
}

const boundaryCache = new WeakMap<readonly Vector2[], readonly [Vector2, Vector2][]>();

/** Doubled hole bridges are bookkeeping, not physical hull edges. Polygons are immutable. */
function boundaryEdges(polygon: readonly Vector2[]): readonly [Vector2, Vector2][] {
  const cached = boundaryCache.get(polygon);
  if (cached) return cached;
  const edges: [Vector2, Vector2][] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    if (near(a, b)) continue;
    if (polygon.some((c, j) => j !== i && near(b, c) && near(a, polygon[(j + 1) % polygon.length]))) continue;
    edges.push([a, b]);
  }
  boundaryCache.set(polygon, edges);
  return edges;
}

export function pointInHull(point: Vector2, polygon: readonly Vector2[]): boolean {
  let inside = false;
  for (const [a, b] of boundaryEdges(polygon)) {
    if (distanceToSegment(point, a, b).distance < 0.00001) return true;
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function segmentIntersection(a: Vector2, b: Vector2, c: Vector2, d: Vector2): number | null {
  const ab = b.clone().sub(a), cd = d.clone().sub(c), ca = c.clone().sub(a);
  const denominator = cross(ab, cd);
  if (Math.abs(denominator) < 1e-8) return null;
  const t = cross(ca, cd) / denominator, u = cross(ca, ab) / denominator;
  return t >= -1e-7 && t <= 1 + 1e-7 && u >= -1e-7 && u <= 1 + 1e-7 ? Math.max(0, Math.min(1, t)) : null;
}

export function segmentHullHit(a: Vector2, b: Vector2, polygon: readonly Vector2[]): number | null {
  if (pointInHull(a, polygon)) return 0;
  let first = Infinity;
  for (const [c, d] of boundaryEdges(polygon)) {
    const t = segmentIntersection(a, b, c, d);
    if (t !== null) first = Math.min(first, t);
  }
  return Number.isFinite(first) ? first : pointInHull(b, polygon) ? 1 : null;
}

export function isValidHullPolygon(polygon: readonly Vector2[]): boolean {
  if (polygon.length < 3 || Math.abs(polygonArea(polygon)) < 0.01) return false;
  for (let i = 0; i < polygon.length; i++) for (let j = i + 1; j < polygon.length; j++) {
    if (j === i + 1 || (i === 0 && j === polygon.length - 1)) continue;
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], c = polygon[j], d = polygon[(j + 1) % polygon.length];
    // Paragon encodes its interior hole with a doubled bridge. These shared endpoints
    // are intentional weakly-simple geometry, not crossing edges to discard.
    if ([a, b].some(p => near(p, c) || near(p, d))) continue;
    if (segmentIntersection(a, b, c, d) !== null) return false;
  }
  return true;
}

function subdivide(polygon: readonly Vector2[], spacing: number): Vector2[] {
  const points: Vector2[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const count = Math.max(1, Math.ceil(a.distanceTo(b) / spacing));
    for (let j = 0; j < count; j++) points.push(a.clone().addScaled(b.clone().sub(a), j / count));
  }
  return points;
}

/** Tesselator: midpoint-displacement noise, persistence .7, normalized to [0,1]. */
function fractureNoise(count: number, random: SimulationRandom): number[] {
  let n = 2;
  while (n < count) n *= 2;
  const values = new Array<number>(n).fill(-1);
  values[0] = values[n - 1] = 1;
  const fill = (a: number, b: number, depth: number): void => {
    if (a + 1 >= b) return;
    const mid = Math.floor((a + b) / 2);
    values[mid] = (values[a] + values[b]) / 2 + Math.pow(0.7, depth) * (random.next() - 0.5);
    fill(a, mid, depth + 1); fill(mid, b, depth + 1);
  };
  fill(0, n - 1, 1);
  const min = Math.min(...values), max = Math.max(...values);
  return max > min ? values.map(v => (v - min) / (max - min)) : values;
}

function visualOutline(polygon: Vector2[], seam: readonly Vector2[], oldBounds: readonly Vector2[],
  oldVisual: readonly Vector2[] | null, random: SimulationRandom): Vector2[] {
  const ccw = polygonArea(polygon) > 0;
  const onSeam = (p: Vector2) => seam.some(s => near(s, p));
  return polygon.map((p, i) => {
    if (onSeam(p)) return p.clone();
    if (oldVisual) {
      const index = oldBounds.findIndex(old => near(old, p));
      return index >= 0 ? oldVisual[index].clone() : p.clone();
    }
    const previous = polygon[(i + polygon.length - 1) % polygon.length], next = polygon[(i + 1) % polygon.length];
    if (onSeam(previous) || onSeam(next)) return p.clone();
    const incoming = p.clone().sub(previous).normalize(), outgoing = next.clone().sub(p).normalize();
    const normal = new Vector2(incoming.y + outgoing.y, -incoming.x - outgoing.x).normalize().scale(ccw ? 1 : -1);
    return p.clone().addScaled(normal, random.next() * 10);
  });
}

/** Port of the source cut search, subdivision and shared noisy seam; no rectangular fallback. */
export function fractureHull(input: readonly Vector2[], visual: readonly Vector2[] | null,
  hullSize: HullSize | undefined, random: SimulationRandom): [HullCut, HullCut] | null {
  const clean = input.filter((p, i) => i === 0 || !near(p, input[i - 1])).map(p => p.clone());
  if (clean.length > 1 && near(clean[0], clean[clean.length - 1])) clean.pop();
  if (!isValidHullPolygon(clean)) return null;
  const polygon = subdivide(clean, 20), box = hullBounds(polygon), n = polygon.length;
  const scale = Math.min(1, Math.max(5, Math.min(box.width, box.height) / 15) / 10);
  const randomAttempts = hullSize === 'CAPITAL_SHIP' || hullSize === 'CRUISER' ? 8 : 12;
  const fallbacks = [90, 180, 45, 135];
  const crowded = polygon.map((p, i) => polygon.some((q, j) => i !== j && p.distanceTo(q) <= 2));
  for (let attempt = 0; attempt < randomAttempts + 4; attempt++) {
    const minFraction = Math.max(0.2 * 0.33, 0.2 * Math.pow(0.9, attempt));
    let angle = random.next() * Math.PI * 2;
    const center = box.center.clone().add(new Vector2((0.5 - random.next()) * box.width * 0.75,
      (0.5 - random.next()) * box.height * 0.75));
    if (attempt >= randomAttempts) {
      center.copy(box.center);
      angle = (fallbacks.splice(Math.floor(random.next() * fallbacks.length), 1)[0] + 15 - 30 * random.next()) * Math.PI / 180;
    }
    const direction = Vector2.fromAngle(angle, Math.max(box.width, box.height) * 2);
    const from = center.clone().add(direction), to = center.clone().sub(direction);
    const crossings: { index: number; t: number }[] = [];
    let invalid = false;
    for (let i = 0; i < n; i++) {
      const a = polygon[i], b = polygon[(i + 1) % n];
      const t = segmentIntersection(from, to, a, b);
      if (t === null) continue;
      const p = from.clone().addScaled(to.clone().sub(from), t);
      if (near(p, a)) continue;
      const index = p.distanceTo(a) > p.distanceTo(b) && !crowded[(i + 1) % n] ? (i + 1) % n : i;
      if (crowded[index]) { invalid = true; break; }
      crossings.push({ index, t });
    }
    if (invalid || crossings.length < 2 || crossings.length % 2) continue;
    crossings.sort((a, b) => a.t - b.t);
    // The native caller consumes the first two returned perimeter crossings.
    let ai = crossings[0].index, bi = crossings[1].index;
    if (ai > bi) [ai, bi] = [bi, ai];
    const span = bi - ai, fraction = Math.min(span, n - span) / (n + 1);
    if (span < 3 || n - span < 3 || fraction < minFraction || fraction > 0.5) continue;
    const a = polygon[ai], b = polygon[bi], chord = b.clone().sub(a), length = chord.length();
    if (length < 1 || !pointInHull(a.clone().addScaled(chord, 1 / length), polygon)) continue;
    // Keep the noisy seam in a 20-unit interior corridor, tapering at its endpoints.
    for (let i = 0; i < n; i++) {
      const c = polygon[i], d = polygon[(i + 1) % n];
      if ([c, d].some(p => near(p, a) || near(p, b))) continue;
      if (segmentIntersection(a, b, c, d) !== null) { invalid = true; break; }
      for (const p of [c, d]) {
        const { distance, t } = distanceToSegment(p, a, b);
        if (distance < 20 * Math.sqrt(1 - Math.abs(0.5 - t) * 2)) { invalid = true; break; }
      }
      if (invalid) break;
    }
    if (invalid) continue;
    const steps = Math.max(7, Math.ceil(length / (10 * scale)));
    const seam = Array.from({ length: steps + 1 }, (_, i) => a.clone().addScaled(chord, i / steps));
    const noise = fractureNoise(seam.length, random), normal = new Vector2(-chord.y, chord.x).normalize();
    for (let i = 1; i < seam.length - 1; i++) {
      const noiseIndex = Math.min(noise.length - 1, Math.floor(i * noise.length / seam.length));
      const offset = Math.min(((1 - noise[noiseIndex]) * 20 - 10) * scale, seam[i].distanceTo(seam[i - 1]));
      seam[i].addScaled(normal, offset);
    }
    const left = [...polygon.slice(ai, bi + 1), ...seam.slice(1, -1).reverse()];
    const right = [...polygon.slice(bi), ...polygon.slice(0, ai + 1), ...seam.slice(1, -1)];
    if (!isValidHullPolygon(left) || !isValidHullPolygon(right)) continue;
    return [left, right].map(bounds => ({ bounds, seam: seam.map(p => p.clone()),
      visualBounds: visualOutline(bounds, seam, input, visual, random) })) as [HullCut, HullCut];
  }
  return null;
}

/** Native H/decal transfer samples the cell center and eight offsets at 0.6 grid units. */
export function armorCellTouchesHull(center: Vector2, grid: number, bounds: readonly Vector2[]): boolean {
  for (const dx of [-0.6, 0, 0.6]) for (const dy of [-0.6, 0, 0.6]) {
    if (pointInHull(new Vector2(center.x + dx * grid, center.y + dy * grid), bounds)) return true;
  }
  return false;
}
