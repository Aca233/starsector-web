import art from './ark-native-field-art.json';
import type { RenderEngineStatus } from '../render/ShipRenderState';

export const arkNativeFieldArt = art;
export const arkNativeFieldLayers = new Set(art.afterLayers);
// Subregions of the SAME native light texture, not invented streaks. Power rises
// first in the aft crystal housing, then along its existing lower conductors.
export const arkFieldBands = [
  { top:720, bottom:832, onset:0 },
  { top:832, bottom:915, onset:.2 },
  { top:915, bottom:1001, onset:.45 },
] as const;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Original hull light is the idle state. Only real thrust adds emission.
 * No wall-clock pulse, speed-driven fake thrust or additional engine geometry.
 * Keep failed channels in the denominator so one disabled channel dims the field.
 */
export function arkFieldIntensity(statuses: readonly RenderEngineStatus[], alpha: number, onset = 0): number {
  if (!statuses.length || !Number.isFinite(alpha)) return 0;
  const t = clamp(alpha);
  return .95 * statuses.reduce((sum, status) => {
    const level = status.prevThrust + (status.currentThrust - status.prevThrust) * t;
    if (!Number.isFinite(level)) return sum;
    const demand = clamp(((level - .4) / .6 - onset) / (1 - onset));
    return sum + demand * demand * (3 - 2 * demand);
  }, 0) / statuses.length;
}
