import { ADUN_ARK_ART, arkOwner } from '../content/AdunArkIds';
import { arkArt, type ArkDraw } from '../visual/AdunArkArt';
import { drawShipDamageDecals, type DamageDecalLayer } from './ShipDamageVisuals';
import { createRenderCanvas, renderContext2D, type RenderCanvas } from './RenderSurface';
import type { ShipRenderState } from './ShipRenderState';
import { textureCache } from './TextureCache';

/** Damage stays in module-local world units; only its clip and depth follow the
 * current baked pose. Never use the static spec.spriteUrl as an animated mask. */
export function renderArkDamageOverlayCanvas(
  canvas: RenderCanvas, ship: ShipRenderState, draw: ArkDraw, layer: DamageDecalLayer,
  maskCanvas: RenderCanvas = createRenderCanvas()
): boolean {
  const owner = arkOwner(ship.spec.sourceHullId ?? ship.spec.id);
  if (!owner || owner !== draw.owner) return false;
  const mask = textureCache.getCanvasImage(ADUN_ARK_ART + draw.file);
  if (!mask) return false;
  const worldWidth = draw.size[0] * arkArt.scale;
  const worldHeight = draw.size[1] * arkArt.scale;
  const width = Math.max(1, Math.round(worldWidth));
  const height = Math.max(1, Math.round(worldHeight));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = renderContext2D(canvas);
  if (!ctx) return false;
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  // A tiny crop may round to one pixel; compensate equally for decals and mask.
  ctx.scale(width / worldWidth, height / worldHeight);
  const anchor = arkArt.parts[owner].anchor;
  ctx.translate((anchor[0] - draw.box[0]) * arkArt.scale - ship.spec.pivotX,
    (anchor[1] - draw.box[1]) * arkArt.scale - ship.spec.pivotY);
  const ready = drawShipDamageDecals(ctx, ship, layer);
  ctx.restore();
  // Resolve the resampled mask to 8-bit alpha once before compositing. Direct
  // GPU image resampling during destination-in can retain tiny alpha fringes
  // where the CPU-decoded current silhouette is fully transparent.
  if (maskCanvas.width !== width) maskCanvas.width = width;
  if (maskCanvas.height !== height) maskCanvas.height = height;
  const maskCtx = renderContext2D(maskCanvas, { willReadFrequently: true });
  if (!maskCtx) return false;
  maskCtx.clearRect(0, 0, width, height);
  maskCtx.drawImage(mask, 0, 0, width, height);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.globalAlpha = 1;
  ctx.drawImage(maskCanvas, 0, 0);
  ctx.restore();
  return ready;
}
