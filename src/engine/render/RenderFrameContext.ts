import type { JumpTargetPreview } from '../runtime/JumpTargeting';
import { VisualRandom } from '../runtime/VisualRandom';

export interface RenderFrameContext {
  jumpTarget?: JumpTargetPreview;
  visualTime: number;
  random: VisualRandom;
  layers: ReadonlySet<string>;
  damageEnabled: boolean;
}
