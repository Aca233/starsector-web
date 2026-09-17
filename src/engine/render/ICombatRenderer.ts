import { CombatEngine } from '../simulation/CombatEngine';
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
  prepareAssets(engine?: CombatEngine): Promise<void>;
  updateVisual(engine: CombatEngine, dt: number, frame: RenderFrameContext): void;
  render(engine: CombatEngine, alpha: number, cameraPos: Vector2, zoom: number, frame: RenderFrameContext): void;
  getResourceStats(): RendererResourceStats;
  resetVisualState(): void;
  dispose(): void;
}
