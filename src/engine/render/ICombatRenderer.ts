import { CombatEngine } from '../simulation/CombatEngine';
import { Vector2 } from '../math/Vector2';
import type { RenderFrameContext } from './RenderFrameContext';

export interface ICombatRenderer {
  render(engine: CombatEngine, alpha: number, cameraPos: Vector2, zoom: number, frame: RenderFrameContext): void;
  dispose(): void;
}
