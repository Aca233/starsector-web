import { VisualRandom } from '../runtime/VisualRandom';

export interface RenderFrameContext {
  visualTime: number;
  random: VisualRandom;
  layers: ReadonlySet<string>;
  damageEnabled: boolean;
}
