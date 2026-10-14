import type { GravityTarget } from './GravityTractorState';
export interface GravityPushSpec { range: number; shipStrength: number; projectileStrength: number; fluxPerSecond: number }
/** One real recipient and world-space force direction; no cursor-only fake lock. */
export interface GravityPushState { target?: GravityTarget; x: number; y: number; radius: number; dx: number; dy: number; age: number; status: string }
export function validateGravityPush(spec?: GravityPushSpec): void {
  if (!spec) return;
  for (const key of ['range','shipStrength','projectileStrength','fluxPerSecond'] as const)
    if (!Number.isFinite(spec[key]) || spec[key]<=0 || spec[key]>10000) throw Error('Invalid directional gravity '+key);
}
