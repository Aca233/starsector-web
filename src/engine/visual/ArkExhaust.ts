import art from './ark-exhaust-art.json';
export const arkExhaustArt = art;
export const arkExhaustTextures = art.frames.map(frame => '/game-assets/graphics/fx/web_adun_ark_exhaust_v08/' + frame.file);
const clamp = (value: number) => Math.max(0, Math.min(1, value));
export interface ArkExhaustShape {width: number; height: number; opacity: number; extent: number}
/** Source controller rests at .4. Mouth width comes from physical collar calibration;
 * throttling changes stream reach and emission, never detaches or widens the mouth. */
export function arkExhaustShape(nozzleWidth: number, slotLength: number, thrust: number, opacity: number, fighter: boolean): ArkExhaustShape {
  if (![nozzleWidth, slotLength, thrust, opacity].every(Number.isFinite) || nozzleWidth <= 0 || slotLength <= 0) return {width:0,height:0,opacity:0,extent:0};
  const live = clamp(thrust / .4), demand = clamp((thrust - .4) / .6);
  const power = demand * demand * (3 - 2 * demand);
  const scale = Math.min(slotLength / art.height, nozzleWidth / art.throatWidth);
  const width = art.width * scale, height = art.height * scale * (.26 + .74 * power) * live;
  return {width, height, opacity:clamp(opacity) * live * (.10 + (fighter ? .30 : .42) * power), extent:height + width / 2};
}
/** Adjacent painted poses crossfade without doubling emission; no wall clock or jitter. */
export function sampleArkExhaust(time: number): {url: string; weight: number}[] {
  if (!Number.isFinite(time) || time < 0) return [];
  const phase = time * art.fps % arkExhaustTextures.length, index = Math.floor(phase), mix = phase - index;
  const current = {url:arkExhaustTextures[index], weight:1-mix};
  return mix <= 1e-6 ? [current] : [current, {url:arkExhaustTextures[(index+1)%arkExhaustTextures.length],weight:mix}];
}
