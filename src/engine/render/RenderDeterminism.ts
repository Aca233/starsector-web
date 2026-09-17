import type { RenderFrameContext } from './RenderFrameContext';
import { VisualRandom } from '../runtime/VisualRandom';

const fallbackRandom = new VisualRandom(0x51f15e);
let currentFrame: RenderFrameContext | null = null;

export function beginRenderFrame(frame: RenderFrameContext): void {
  currentFrame = frame;
}

export function endRenderFrame(): void {
  currentFrame = null;
}

export function visualTimeSeconds(): number {
  return currentFrame?.visualTime ?? 0;
}

export function visualNowMs(): number {
  return visualTimeSeconds() * 1000;
}

/** Stable value for one named visual sample in the current 60 Hz visual frame. */
export function visualRandom(channel: string): number {
  const time = currentFrame?.visualTime ?? 0;
  const random = currentFrame?.random ?? fallbackRandom;
  return random.frame(channel, time, 60);
}

/** Random properties of an existing effect must not change with frame time. */
export function visualObjectRandom(channel: string): number {
  return (currentFrame?.random ?? fallbackRandom).sample(channel, 0);
}
