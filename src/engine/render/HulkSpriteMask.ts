import type { ShipSpec } from '../content/ShipSpec';
import type { HulkFragment } from '../simulation/CombatTypes';
import type { Vector2 } from '../math/Vector2';
import { textureCache } from './TextureCache';

/** Source ship-local (+X bow) to top-left sprite pixels, shared by both masks. */
export function clipShipPolygon(ctx: CanvasRenderingContext2D, spec: ShipSpec, polygon: readonly Vector2[]): void {
  ctx.beginPath();
  polygon.forEach((p, index) => {
    const x = spec.pivotX + p.y, y = spec.pivotY - p.x;
    if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.clip();
}

/** Each immutable piece gets one masked hull texture, not a new image per frame. */
export function renderHulkHullCanvas(canvas: HTMLCanvasElement, hulk: HulkFragment): boolean {
  const spec = hulk.sourceShip.spec, image = textureCache.getImage(spec.spriteUrl);
  if (!image.complete || image.naturalWidth <= 0 || !hulk.visualBounds) return false;
  canvas.width = Math.max(1, Math.round(spec.spriteWidth));
  canvas.height = Math.max(1, Math.round(spec.spriteHeight));
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.save();
  clipShipPolygon(ctx, spec, hulk.visualBounds);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  ctx.restore();
  return true;
}
