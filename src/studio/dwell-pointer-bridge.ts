export type PointerPoint = { x: number; y: number };
type Rect = { left: number; top: number; right: number; bottom: number };
const distance = (point: PointerPoint, rect: Rect) => Math.hypot(
  Math.max(rect.left - point.x, 0, point.x - rect.right),
  Math.max(rect.top - point.y, 0, point.y - rect.bottom));
const cross = (a: PointerPoint, b: PointerPoint, p: PointerPoint) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
function corridor(origin: PointerPoint, point: PointerPoint, rect: Rect) {
  const padding = 12;
  if (Math.hypot(point.x - origin.x, point.y - origin.y) <= 8) return true;
  const dx = Math.max(rect.left - origin.x, 0, origin.x - rect.right);
  const dy = Math.max(rect.top - origin.y, 0, origin.y - rect.bottom);
  let a: PointerPoint, b: PointerPoint;
  if (dx >= dy) {
    const x = origin.x < rect.left ? rect.left : rect.right;
    a = { x, y: rect.top - padding }; b = { x, y: rect.bottom + padding };
  } else {
    const y = origin.y < rect.top ? rect.top : rect.bottom;
    a = { x: rect.left - padding, y }; b = { x: rect.right + padding, y };
  }
  const signs = [cross(origin, a, point), cross(a, b, point), cross(b, origin, point)];
  return !signs.some(value => value < 0) || !signs.some(value => value > 0);
}

/** A directional, time-bounded corridor, not an invisible pointer-catching overlay.
 * Only real progress toward a reader extends the crossing; stopping or turning away expires it. */
export function createDwellPointerBridge() {
  let origin: PointerPoint | null = null;
  let started = 0, expires = 0, best = Infinity;
  const reset = () => { origin = null; started = 0; expires = 0; best = Infinity; };
  return {
    reset,
    inside(point: PointerPoint) { reset(); origin = point; },
    alive(now = performance.now()) { return expires > now; },
    travel(point: PointerPoint, targets: Rect[], now = performance.now()) {
      if (!origin) return false;
      const candidates = targets.filter(rect => distance(origin!, rect) > 0 && corridor(origin!, point, rect)
        && distance(point, rect) < distance(origin!, rect));
      if (!candidates.length || (started && (now > expires || now - started > 2400))) { reset(); return false; }
      const remaining = Math.min(...candidates.map(rect => distance(point, rect)));
      if (remaining > best + 4) { reset(); return false; }
      if (!started) started = now;
      if (remaining < best - .5) { best = remaining; expires = Math.min(now + 450, started + 2400); }
      return expires > now;
    },
  };
}
