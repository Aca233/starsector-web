import { renderContext2D, type RenderCanvas, type RenderContext2D } from './RenderSurface';
import type { ShipSpec } from '../content/ShipSpec';
import type { RenderHulk as HulkFragment } from '../render/ShipRenderState';
import type { Vector2 } from '../math/Vector2';
import { textureCache } from './TextureCache';

/** Source ship-local (+X bow) to top-left sprite pixels, shared by both masks. */
export function clipShipPolygon(ctx: RenderContext2D, spec: ShipSpec, polygon: readonly Vector2[]): void {
  ctx.beginPath();
  polygon.forEach((p, index) => {
    const x = spec.pivotX + p.y, y = spec.pivotY - p.x;
    if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.clip();
}

/** Each immutable piece gets one masked hull texture, not a new image per frame. */
export function renderHulkHullCanvas(canvas: RenderCanvas, hulk: HulkFragment): boolean {
  const spec = hulk.sourceShip.spec, image = textureCache.getCanvasImage(spec.spriteUrl);
  if (!image || !hulk.visualBounds) return false;
  canvas.width = Math.max(1, Math.round(spec.spriteWidth));
  canvas.height = Math.max(1, Math.round(spec.spriteHeight));
  const ctx = renderContext2D(canvas);
  if (!ctx) return false;
  ctx.save();
  clipShipPolygon(ctx, spec, hulk.visualBounds);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  ctx.restore();
  return true;
}
