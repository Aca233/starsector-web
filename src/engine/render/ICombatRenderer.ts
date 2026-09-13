import { CombatEngine } from '../simulation/CombatEngine';
import { Vector2 } from '../math/Vector2';
import type { RenderFrameContext } from './RenderFrameContext';

export interface ICombatRenderer {
  prepareAssets(): Promise<void>;
  updateVisual(engine: CombatEngine, dt: number, frame: RenderFrameContext): void;
  render(engine: CombatEngine, alpha: number, cameraPos: Vector2, zoom: number, frame: RenderFrameContext): void;
  resetVisualState(): void;
  dispose(): void;
}
