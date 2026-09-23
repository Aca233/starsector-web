import type { OriginalCampaignPlanet } from './OriginalCampaignPlanet.mjs';

export const ORIGINAL_MINING_PLASMA_TEXTURE: 'graphics/planets/dynamo.png';
/** Math.fround(0.15), matching Java float 0.15f. */
export const ORIGINAL_MINING_PLASMA_THICKNESS: number;

export interface OriginalMiningPlanetVisualOptions {
  /** Optional real settings override; must return a nonempty path synchronously. */
  getSpriteName?(category: 'industry', key: 'plasma_net_texture'): string;
}
export interface OriginalMiningPlanetVisualServiceOptions extends OriginalMiningPlanetVisualOptions {
  /** Required: resolve the CURRENT market's shared world planet, never a snapshot. */
  readPlanet(): OriginalCampaignPlanet | null;
}
export interface OriginalMiningPlanetVisualServices {
  readPlanet(): OriginalCampaignPlanet | null;
  /** object matches ResourceLifecycle's boundary; validated as a native planet at runtime.
   * row is accepted for compatibility but never read or modified here. */
  setMiningPlasmaVisuals(planet: object, enabled: boolean, row?: unknown): void;
}
/** Actual spec mutation + synchronous native model applySpecChanges. Does not load
 * UI textures or set the industry's historical shownPlasmaNetVisuals flag. */
export function setOriginalMiningPlasmaVisuals(
  planet: OriginalCampaignPlanet,
  enabled: boolean,
  options?: OriginalMiningPlanetVisualOptions,
): OriginalCampaignPlanet;
export function setOriginalMiningPlasmaVisuals(
  planet: null,
  enabled: boolean,
  options?: OriginalMiningPlanetVisualOptions,
): null;
export function setOriginalMiningPlasmaVisuals(
  planet: OriginalCampaignPlanet | null,
  enabled: boolean,
  options?: OriginalMiningPlanetVisualOptions,
): OriginalCampaignPlanet | null;
export function createOriginalMiningPlanetVisualServices(
  options: OriginalMiningPlanetVisualServiceOptions,
): OriginalMiningPlanetVisualServices;
