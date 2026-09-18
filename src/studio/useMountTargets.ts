import { useLayoutEffect, type RefObject } from 'react';
type Point = { x: number; y: number };
/** Intersect a hit rectangle with the nearest-centre cell, without changing the glyph. */
function clipNearest(polygon: Point[], dx: number, dy: number) {
  const limit = (dx * dx + dy * dy) / 2;
  if (limit < .001) return polygon;
  const result: Point[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const da = a.x * dx + a.y * dy - limit, db = b.x * dx + b.y * dy - limit;
    if (da <= 0) result.push(a);
    if ((da <= 0) !== (db <= 0)) {
      const t = da / (da - db); result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return result;
}

/** Minimum 28 screen-pixel targets, partitioned so DOM order cannot steal a neighbour. */
export function useMountTargets(ref: RefObject<HTMLDivElement | null>, revision: unknown, path: string, zoom: number) {
  useLayoutEffect(() => {
    const stage = ref.current;
    if (!stage) return;
    const update = () => {
      const scale = stage.getBoundingClientRect().width / stage.offsetWidth;
      if (!Number.isFinite(scale) || scale <= 0) return;
      const targets = Array.from(stage.querySelectorAll<HTMLButtonElement>('.studio-mount')).map(element => {
        const r = element.getBoundingClientRect();
        const visualSize = parseFloat(getComputedStyle(element).getPropertyValue('--mount-visual-size')) || 19;
        return { element, x: r.x + r.width / 2, y: r.y + r.height / 2, size: Math.max(28, visualSize * scale + 6) };
      });
      for (const target of targets) {
        const half = target.size / 2;
        let polygon: Point[] = [{ x: -half, y: -half }, { x: half, y: -half }, { x: half, y: half }, { x: -half, y: half }];
        for (const other of targets) {
          if (other === target) continue;
          polygon = clipNearest(polygon, other.x - target.x, other.y - target.y);
        }
        target.element.style.width = target.element.style.height = `${target.size / scale}px`;
        target.element.style.clipPath = `polygon(${polygon.map(p => `${(p.x + half) / target.size * 100}% ${(p.y + half) / target.size * 100}%`).join(',')})`;
      }
    };
    update(); const observer = new ResizeObserver(update); observer.observe(stage);
    return () => observer.disconnect();
  }, [ref, revision, path, zoom]);
}
