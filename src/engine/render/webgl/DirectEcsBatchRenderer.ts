import {
  PROJECTED_FLOATS_PER_BATCH_SLICE,
  PROJECTED_FLOATS_PER_SPRITE,
  type ProjectedFrameViews,
} from '../../runtime/rust/RustProjectionViews';
import type { SpriteBatcher } from './SpriteBatcher';

/** Sprite blend modes, mirroring SpriteBatcher's own string union. */
type BlendMode = 'NORMAL' | 'ADDITIVE';

export interface DirectRenderUploadStats {
  readonly uploadedSpriteCount: number;
  readonly drawCallCount: number;
  readonly uploadBytes: number;
}

/**
 * Zero-Object Direct WebGL2 Batch Uploader.
 * Consumes the contiguous 16-float Wasm linear memory view published by the
 * authority projection (RustProjectionViews) and streams it directly to WebGL2
 * VBOs (or SpriteBatcher) without creating intermediate JS objects or running
 * scene-graph diffing.
 */
export class DirectEcsBatchRenderer {
  private readonly gl: WebGL2RenderingContext | null;
  private readonly instanceVbo: WebGLBuffer | null;
  private maxSpritesCapacity: number;

  constructor(gl: WebGL2RenderingContext | null = null, maxSpritesCapacity = 32768) {
    this.gl = gl;
    this.maxSpritesCapacity = maxSpritesCapacity;
    if (gl) {
      this.instanceVbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        maxSpritesCapacity * PROJECTED_FLOATS_PER_SPRITE * Float32Array.BYTES_PER_ELEMENT,
        gl.STREAM_DRAW
      );
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    } else {
      this.instanceVbo = null;
    }
  }

  /**
   * Uploads the entire 16-float sprite buffer from Wasm linear memory to the GPU VBO
   * in a single gl.bufferSubData call, then executes instanced draw slices.
   */
  public uploadAndDrawDirect(
    views: ProjectedFrameViews,
    onDrawSlice?: (
      startInstance: number,
      instanceCount: number,
      textureSlot: number,
      blendMode: BlendMode
    ) => void
  ): DirectRenderUploadStats {
    const clampedCount = Math.min(views.spriteCount, this.maxSpritesCapacity);
    if (clampedCount <= 0) {
      return { uploadedSpriteCount: 0, drawCallCount: 0, uploadBytes: 0 };
    }

    const floatLength = clampedCount * PROJECTED_FLOATS_PER_SPRITE;
    const subView =
      views.spriteInstances.length > floatLength
        ? views.spriteInstances.subarray(0, floatLength)
        : views.spriteInstances;

    if (this.gl && this.instanceVbo) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.instanceVbo);
      this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, subView);
    }

    let drawCalls = 0;
    const slices = views.batchSlices;
    for (let i = 0; i < views.batchSliceCount; i++) {
      const base = i * PROJECTED_FLOATS_PER_BATCH_SLICE;
      const start = slices[base] | 0;
      const count = slices[base + 1] | 0;
      const texSlot = slices[base + 2] | 0;
      const blendRaw = slices[base + 3] | 0;
      if (count <= 0 || start >= clampedCount) continue;

      const safeCount = Math.min(count, clampedCount - start);
      const blendMode: BlendMode = blendRaw === 1 ? 'ADDITIVE' : 'NORMAL';

      if (this.gl) {
        if (blendMode === 'ADDITIVE') {
          this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE);
        } else {
          this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
        }
      }

      onDrawSlice?.(start, safeCount, texSlot, blendMode);
      drawCalls += 1;
    }

    return {
      uploadedSpriteCount: clampedCount,
      drawCallCount: drawCalls,
      uploadBytes: subView.byteLength,
    };
  }

  /**
   * Compatibility bridge to push slices into an existing SpriteBatcher instance
   * when sharing a legacy render pass.
   */
  public forwardToSpriteBatcher(
    views: ProjectedFrameViews,
    batcher: SpriteBatcher,
    resolveTexture: (slot: number) => WebGLTexture | null
  ): number {
    const sprites = views.spriteInstances;
    const slices = views.batchSlices;
    let drawn = 0;

    for (let s = 0; s < views.batchSliceCount; s++) {
      const sBase = s * PROJECTED_FLOATS_PER_BATCH_SLICE;
      const start = slices[sBase] | 0;
      const count = slices[sBase + 1] | 0;
      const texSlot = slices[sBase + 2] | 0;
      const blendRaw = slices[sBase + 3] | 0;
      const tex = resolveTexture(texSlot);
      if (!tex || count <= 0) continue;

      batcher.setBlendMode(blendRaw === 1 ? 'ADDITIVE' : 'NORMAL');
      for (let i = 0; i < count; i++) {
        const idx = (start + i) * PROJECTED_FLOATS_PER_SPRITE;
        batcher.drawSprite(
          tex,
          sprites[idx],
          sprites[idx + 1],
          sprites[idx + 2],
          sprites[idx + 3],
          sprites[idx + 4],
          sprites[idx + 5],
          sprites[idx + 6],
          sprites[idx + 11],
          sprites[idx + 12],
          sprites[idx + 13],
          sprites[idx + 14],
          sprites[idx + 7],
          sprites[idx + 8],
          sprites[idx + 9],
          sprites[idx + 10]
        );
        drawn += 1;
      }
    }
    return drawn;
  }

  public dispose(): void {
    if (this.gl && this.instanceVbo) {
      this.gl.deleteBuffer(this.instanceVbo);
    }
  }
}
