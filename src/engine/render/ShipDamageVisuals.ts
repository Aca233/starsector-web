import { createRenderCanvas, renderContext2D, imageWidth, imageHeight, type RenderCanvas, type RenderContext2D, type RenderImage } from './RenderSurface';
import type { ShipSpec } from '../modding/ModManager';
import type { ShipRenderState } from '../render/ShipRenderState';
type Ship = Pick<ShipRenderState, 'spec'|'isDead'|'scorchMarks'|'scorchMarkVersion'|'armor'>;
import { textureCache } from './TextureCache';
import type { Vector2 } from '../math/Vector2';
import { clipShipPolygon } from './HulkSpriteMask';
import { armorCellTouchesHull } from '../visual/HulkGeometry';
import type { ScorchMark } from '../simulation/ShipDamageState';

export type DamageDecalLayer = 'base' | 'glow';

/**
 * Web ship-local coordinates use +X toward the bow and +Y toward starboard.
 * Ship sprites point upward in source art, and pivotY is already expressed in web/canvas pixels.
 */
export function shipLocalToSpritePixel(
  spec: Pick<ShipSpec, 'pivotX' | 'pivotY'>,
  local: { x: number; y: number }
): { x: number; y: number } {
  return {
    x: spec.pivotX + local.y,
    y: spec.pivotY - local.x
  };
}

export function damageDecalUrl(mark: Ship['scorchMarks'][number], layer: DamageDecalLayer): string {
  return `/game-assets/graphics/damage/damage_${mark.kind}48_${mark.variant}_${layer}.png`;
}

/** Native integer color channels, including heat-dependent green/blue rather than a fixed tint. */
function glowColor(mark: ScorchMark): [number, number, number] {
  const amount = Math.max(0, Math.min(255, mark.intensity * 255));
  return [Math.floor(amount * 0.65), Math.floor(amount * 0.25), Math.floor(amount)];
}

const pieceDecalCache = new WeakMap<readonly Vector2[], WeakMap<Ship, { count: number; marks: ScorchMark[] }>>();
/** Piece bounds and decal centers never move in source space; do the nine-point transfer only once. */
function damageMarks(ship: Ship, bounds?: readonly Vector2[]): readonly ScorchMark[] {
  if (!bounds) return ship.scorchMarks;
  let ships = pieceDecalCache.get(bounds);
  if (!ships) { ships = new WeakMap(); pieceDecalCache.set(bounds, ships); }
  let entry = ships.get(ship);
  if (!entry) { entry = { count: 0, marks: [] }; ships.set(ship, entry); }
  while (entry.count < ship.scorchMarks.length) {
    const mark = ship.scorchMarks[entry.count++];
    if (armorCellTouchesHull(mark.localPos, ship.armor.cellWidth, bounds)) entry.marks.push(mark);
  }
  return entry.marks;
}

export function getDamageGlowRevision(ship: Ship, bounds?: readonly Vector2[]): string {
  return ship.scorchMarkVersion + ':' + damageMarks(ship, bounds).map(mark => glowColor(mark).join(',')).join(';');
}

export function hasHotDamageGlow(ship: Ship, bounds?: readonly Vector2[]): boolean {
  if (ship.spec.hullSize === 'FIGHTER' && !ship.isDead) return false;
  return damageMarks(ship, bounds).some(mark => glowColor(mark)[2] > 0);
}

const glowPixels = new WeakMap<RenderImage, ImageData>();
const tintedGlowTiles = new WeakMap<RenderImage, Map<number, RenderCanvas>>();
/**
 * Cache the native integer green/blue channel pair, independent of per-draw alpha.
 * A tile has fewer than230 reachable pairs along the source heat curve, rather than
 * rebuilding its pixels for every hot cell, piece and frame. No managed WebGL texture is
 * allocated for these small CPU canvases; ordinary hull overlays remain batched.
 */
function tintGlowTile(image: RenderImage, green: number, blue: number): RenderCanvas {
  let variants = tintedGlowTiles.get(image);
  if (!variants) { variants = new Map(); tintedGlowTiles.set(image, variants); }
  const key = green * 256 + blue;
  const cached = variants.get(key);
  if (cached) return cached;
  const tile = createRenderCanvas();
  tile.width = imageWidth(image);
  tile.height = imageHeight(image);
  const ctx = renderContext2D(tile)!;
  let source = glowPixels.get(image);
  if (!source) {
    // Preserve the draw-source tile's original initialization. Read each source
    // once on a CPU-oriented scratch canvas instead of synchronizing this canvas.
    ctx.drawImage(image, 0, 0);
    const reader = createRenderCanvas();
    reader.width = tile.width;
    reader.height = tile.height;
    const readContext = renderContext2D(reader, { willReadFrequently: true })!;
    readContext.drawImage(image, 0, 0);
    source = readContext.getImageData(0, 0, tile.width, tile.height);
    glowPixels.set(image, source);
  }
  const pixels = ctx.createImageData(source.width, source.height);
  for (let i = 0; i < source.data.length; i += 4) {
    pixels.data[i] = source.data[i];
    pixels.data[i + 1] = source.data[i + 1] * green / 255;
    pixels.data[i + 2] = source.data[i + 2] * blue / 255;
    pixels.data[i + 3] = source.data[i + 3];
  }
  ctx.putImageData(pixels, 0, 0);
  variants.set(key, tile);
  return tile;
}

/**
 * Draws the official 48px damage tiles in source-sprite space. The caller can then use
 * source-atop/destination-in with the hull sprite alpha, matching the original rule that
 * transparent parts of a ship sprite never receive a decal.
 */
export function drawShipDamageDecals(
  ctx: RenderContext2D,
  ship: Ship,
  layer: DamageDecalLayer,
  scaleX = 1,
  scaleY = scaleX,
  pieceBounds?: readonly Vector2[]
): boolean {
  let allReady = true;
  for (const mark of damageMarks(ship, pieceBounds)) {
    const [green, blue, glowAlpha] = glowColor(mark);
    if (layer === 'glow' && (glowAlpha === 0 || (ship.spec.hullSize === 'FIGHTER' && !ship.isDead))) continue;
    if (layer === 'base' && mark.opacity <= 0) continue;
    const img = textureCache.getCanvasImage(damageDecalUrl(mark, layer));
    if (!img) {
      allReady = false;
      continue;
    }

    const pixel = shipLocalToSpritePixel(ship.spec, mark.localPos);
    const alpha = layer === 'glow' ? glowAlpha / 255 : mark.opacity;
    const image = layer === 'glow' ? tintGlowTile(img, green, blue) : img;

    ctx.save();
    ctx.translate(pixel.x * scaleX, pixel.y * scaleY);
    // The hull source image is rendered at shipFacing + PI/2 in world space. Counter that
    // source-space quarter turn so the stored random world-relative decal angle stays intact.
    ctx.rotate(mark.rotationRad - Math.PI / 2);
    ctx.globalAlpha = alpha;
    if (layer === 'glow') ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(
      image,
      -mark.size * scaleX * 0.5,
      -mark.size * scaleY * 0.5,
      mark.size * scaleX,
      mark.size * scaleY
    );
    ctx.restore();
  }
  return allReady;
}

/**
 * Builds a transparent, hull-alpha-clipped damage-only sprite at native ship texture size.
 * It intentionally contains no hull color so it can be layered over the normally rendered ship.
 */
export function renderShipDamageOverlayCanvas(
  canvas: RenderCanvas,
  ship: Ship,
  layer: DamageDecalLayer,
  clipPolygon?: readonly Vector2[]
): boolean {
  const width = Math.max(1, Math.round(ship.spec.spriteWidth));
  const height = Math.max(1, Math.round(ship.spec.spriteHeight));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  const ctx = renderContext2D(canvas);
  if (!ctx) return false;
  ctx.clearRect(0, 0, width, height);

  const hull = textureCache.getCanvasImage(ship.spec.spriteUrl);
  if (!hull) return false;

  ctx.save();
  if (clipPolygon) clipShipPolygon(ctx, ship.spec, clipPolygon);
  const decalsReady = drawShipDamageDecals(ctx, ship, layer, 1, 1, clipPolygon);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.globalAlpha = 1;
  ctx.drawImage(hull, 0, 0, width, height);
  ctx.restore();
  ctx.restore();
  return decalsReady;
}
