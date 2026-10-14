import { DirectEcsBatchRenderer, type DirectRenderUploadStats } from './DirectEcsBatchRenderer';
import {
  PROJECTED_FLOATS_PER_SPRITE,
  type ProjectedFrameViews,
} from '../../runtime/rust/RustProjectionViews';

/** Sprite blend modes, mirroring SpriteBatcher's own string union. */
type BlendMode = 'NORMAL' | 'ADDITIVE';

/** One texture batch inside a reordered projected frame. `start`/`count` index
 * the reordered sprite buffer; `textureKey` '' means untextured (projectiles). */
export interface ProjectedBatchGroup {
  readonly start: number;
  readonly count: number;
  readonly textureKey: string;
}

/** Result of grouping a projected frame by texture. Pure data: no GL, no
 * allocation beyond the reordered buffer, safe to assert on in tests. */
export interface ProjectedBatchPlan {
  /** Sprite rows reordered so every group is contiguous. */
  readonly ordered: Float32Array;
  /** Rows actually written into `ordered`. */
  readonly total: number;
  readonly groups: readonly ProjectedBatchGroup[];
}

/**
 * Groups the flat projection sprite buffer by texture for one draw call per
 * texture. Ships occupy the first `hudShipCount` rows and keep their identity
 * through `textureKeyOf`; live projectiles trail them as one untextured group.
 *
 * Ships whose texture is unbound, and textures beyond the batcher's resident
 * capacity (`maxSlots`), fall back to the untextured group rather than borrowing
 * another hull's texture or being dropped. A battle that needs more than
 * `maxSlots` resident hull textures must raise the batcher capacity instead.
 */
export function planProjectedBatches(
  views: ProjectedFrameViews,
  textureKeyOf: (spriteIndex: number) => string | null,
  maxSlots = 4,
): ProjectedBatchPlan {
  const total = views.spriteInstances.length / PROJECTED_FLOATS_PER_SPRITE;
  if (!Number.isInteger(total) || total < 0) throw new Error('Projected sprite buffer is not row-aligned');
  if (views.spriteCount !== total) throw new Error('Projected sprite count differs from buffer');
  const shipRows = Math.max(0, Math.min(views.hudShipCount, total));
  const stride = PROJECTED_FLOATS_PER_SPRITE;
  const ordered = new Float32Array(total * stride);
  const groups: ProjectedBatchGroup[] = [];
  const slotOf = new Map<string, number>();
  const rowsOf: number[][] = [];
  const push = (key: string, row: number): void => {
    let slot = slotOf.get(key);
    if (slot === undefined) {
      slot = groups.length;
      slotOf.set(key, slot);
      groups.push({ start: 0, count: 0, textureKey: key });
      rowsOf.push([]);
    }
    rowsOf[slot].push(row);
  };
  for (let row = 0; row < shipRows; row++) {
    const key = textureKeyOf(row);
    // Unbound or beyond-capacity textures fall back to the untextured batch.
    if (key === null || key === '' || (slotOf.has(key) === false && groups.length >= maxSlots)) push('', row);
    else push(key, row);
  }
  for (let row = shipRows; row < total; row++) push('', row); // projectiles: one untextured group
  let cursor = 0;
  const normalized: ProjectedBatchGroup[] = [];
  for (let g = 0; g < groups.length; g++) {
    const rows = rowsOf[g], start = cursor;
    for (const row of rows) {
      const from = row * stride, to = cursor * stride;
      for (let f = 0; f < stride; f++) ordered[to + f] = views.spriteInstances[from + f];
      cursor += 1;
    }
    normalized.push({ start, count: rows.length, textureKey: groups[g].textureKey });
  }
  if (cursor !== total) throw new Error('Projected batch planning lost rows');
  return { ordered, total: cursor, groups: normalized };
}

export interface ProjectedUploadResult {
  readonly stats: DirectRenderUploadStats;
  /** Draw calls the renderer emitted, in order, for headless verification. */
  readonly draws: ReadonlyArray<{ textureKey: string; start: number; count: number; blendMode: BlendMode }>;
  readonly groups: number;
}

/**
 * Uploads one projected frame through the direct batch renderer: plan the
 * texture batches, reorder, single `bufferSubData`, one draw call per group.
 * `bindTexture` resolves a group key to a live GL texture (null skips the
 * group); the projected frame itself stays plain data.
 */
export class ProjectedSpriteUploader {
  private readonly renderer: DirectEcsBatchRenderer;
  private readonly maxSlots: number;

  constructor(renderer: DirectEcsBatchRenderer, maxSlots: 1 | 4 = 4) {
    this.renderer = renderer;
    this.maxSlots = maxSlots;
  }

  public upload(
    views: ProjectedFrameViews,
    textureKeyOf: (spriteIndex: number) => string | null,
    bindTexture: (textureKey: string) => unknown,
  ): ProjectedUploadResult {
    const plan = planProjectedBatches(views, textureKeyOf, this.maxSlots);
    const slices = new Float32Array(plan.groups.length * 4);
    for (let g = 0; g < plan.groups.length; g++) {
      slices[g * 4] = plan.groups[g].start;
      slices[g * 4 + 1] = plan.groups[g].count;
      slices[g * 4 + 2] = g; // slot == group index; bindTexture maps it back
      slices[g * 4 + 3] = 0;
    }
    const reordered: ProjectedFrameViews = {
      spriteInstances: plan.total > 0 ? plan.ordered.subarray(0, plan.total * PROJECTED_FLOATS_PER_SPRITE) : plan.ordered.subarray(0, 0),
      spriteCount: plan.total,
      batchSlices: slices,
      batchSliceCount: plan.groups.length,
      ribbons: views.ribbons,       ribbonCount: views.ribbonCount,
      events: views.events, eventCount: views.eventCount,
      particleBursts: views.particleBursts, particleBurstCount: views.particleBurstCount,
      hudTelemetry: views.hudTelemetry, hudShipCount: views.hudShipCount,
    };
    const draws: { textureKey: string; start: number; count: number; blendMode: BlendMode }[] = [];
    const stats = this.renderer.uploadAndDrawDirect(reordered, (start, count, slot, blendMode) => {
      const group = plan.groups[slot];
      if (!group) return;
      const texture = bindTexture(group.textureKey);
      if (texture === null || texture === undefined) return;
      draws.push({ textureKey: group.textureKey, start, count, blendMode });
    });
    return { stats, draws, groups: plan.groups.length };
  }
}
