import type { CombatRenderView } from './CombatRenderView';
import { Vector2 } from '../math/Vector2';
import type { RenderFrameContext } from './RenderFrameContext';

export interface RendererResourceStats {
  residentTextures: number;
  pendingUploads: number;
  uploads: number;
  invalidations: number;
  resourceRecreations: number;
  drawCalls: number;
  gpuTimerAvailable: boolean;
  gpuTimeMs: number | null;
}

export interface ICombatRenderer {
  prepareAssets(engine?: CombatRenderView): Promise<void>;
  updateVisual(engine: CombatRenderView, dt: number, frame: RenderFrameContext): void;
  render(engine: CombatRenderView, alpha: number, cameraPos: Vector2, zoom: number, frame: RenderFrameContext): boolean;
  getResourceStats(): RendererResourceStats;
  resetVisualState(): void;
  dispose(): void;
}
