export interface CanvasStripSegment {
  sourceX: number;
  sourceWidth: number;
  destX: number;
  destWidth: number;
}

function positiveModulo(value: number, modulus: number): number {
  const result = value % modulus;
  return result < 0 ? result + modulus : result;
}

/**
 * Converts the same normalized horizontal UV interval used by WebGL into
 * source/destination slices for Canvas2D. pixelsPerTexel is a world-units per
 * source-texel scale: a 128px texture at 5 pixelsPerTexel spans 640 world units.
 * uStart may be signed and unbounded so source texture scrolling can wrap in
 * either direction without stretching the whole texture over the strip.
 */
export function computeCanvasStripSegments(
  textureWidth: number,
  worldLength: number,
  pixelsPerTexel: number,
  uStart: number
): CanvasStripSegment[] {
  if (!Number.isFinite(textureWidth) || textureWidth <= 0) return [];
  if (!Number.isFinite(worldLength) || worldLength <= 0) return [];
  if (!Number.isFinite(pixelsPerTexel) || pixelsPerTexel <= 0) return [];
  if (!Number.isFinite(uStart)) return [];

  const segments: CanvasStripSegment[] = [];
  let sourceX = positiveModulo(uStart * textureWidth, textureWidth);
  let remaining = worldLength;
  let destX = 0;
  const epsilon = 1e-9;

  while (remaining > epsilon) {
    const availableSourceWidth = textureWidth - sourceX;
    const availableWorldWidth = availableSourceWidth * pixelsPerTexel;
    const destWidth = Math.min(remaining, availableWorldWidth);
    const sourceWidth = destWidth / pixelsPerTexel;

    segments.push({ sourceX, sourceWidth, destX, destWidth });
    remaining -= destWidth;
    destX += destWidth;
    sourceX = 0;
  }

  return segments;
}
