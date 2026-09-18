import type { ContrailPoint } from '../../simulation/ContrailEngine';
import type { ViewportBounds } from './WebGLPassContext';

/** Conservative clip-plane rejection of an entire ribbon, never individual points.
 * drawStrip's normals have unit length (or its repeated-point fallback), so every
 * vertex lies within abs(width)/2 of its point. Segments between offscreen points
 * can still cross the view: reject only when ALL endpoints share an outside plane.
 * No persistent bounds: snapshots and local simulation can both mutate points.
 */
export function contrailMayBeVisible(points: readonly ContrailPoint[], view: ViewportBounds, zoom: number): boolean {
  if (!(zoom > 0) || !Number.isFinite(zoom) || !Number.isFinite(view.left) || !Number.isFinite(view.right)
    || !Number.isFinite(view.bottom) || !Number.isFinite(view.top) || view.left > view.right || view.bottom > view.top) return true;
  let outside = 15;
  const pixelPadding = 2 / zoom;
  for (const point of points) {
    const x = point.pos.x, y = point.pos.y, halfWidth = Math.abs(point.currentWidth) * .5;
    // Keep edge fragments after Float32 upload, camera transforms and pixel coverage.
    // Unknown/nonfinite geometry fails open, as in the other effect-culling paths.
    const extent = halfWidth + pixelPadding + 1e-6 * Math.max(1, Math.abs(x), Math.abs(y), halfWidth);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(extent)) return true;
    outside &= (x + extent < view.left ? 1 : 0) | (x - extent > view.right ? 2 : 0)
      | (y + extent < view.bottom ? 4 : 0) | (y - extent > view.top ? 8 : 0);
    if (outside === 0) return true;
  }
  return outside === 0;
}
