import { arkExhaustArt, sampleArkExhaust, type ArkExhaustShape } from '../../visual/ArkExhaust';
import type { WebGLPassContext } from './WebGLPassContext';
/** Pure emissive bitmap, black-backed atlas by design; no procedural plume/glow substitutes. */
export function renderArkExhaust(ctx: WebGLPassContext, x: number, y: number, angle: number, shape: ArkExhaustShape, time: number): void {
  if (shape.opacity <= 0 || shape.width <= 0 || shape.height <= 0) return;
  ctx.batcher.setBlendMode('ADDITIVE');
  for (const frame of sampleArkExhaust(time)) {
    const info = ctx.textures.getTextureInfo(frame.url);
    if (!info.texture || info.width <= 0 || info.height <= 0) throw new Error('Ark exhaust not preloaded: ' + frame.url);
    ctx.batcher.drawSprite(info.texture, x, y, shape.width, shape.height, angle-Math.PI/2,
      arkExhaustArt.pivotX-.5, arkExhaustArt.pivotY-.5, 1, 1, 1, shape.opacity*frame.weight);
  }
  ctx.batcher.setBlendMode('NORMAL');
}
