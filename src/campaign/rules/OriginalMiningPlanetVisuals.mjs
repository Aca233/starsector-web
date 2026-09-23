/** Mining.applyVisuals/unapplyVisuals (0.98a-RC8), on the actual shared planet.
 * Source: docs/campaign-mining-planet-visuals-source-notes-2026-09-22.md.
 * Applies renderer MODEL state; this does not claim a texture was loaded by the UI. */
import { requireThat } from '../core/Values.mjs';
import {
  validateOriginalCampaignPlanet,
  getOriginalCampaignPlanetSpec,
  applyOriginalCampaignPlanetSpec,
} from './OriginalCampaignPlanet.mjs';

const check = (value, message) => requireThat(value, 'UNSUPPORTED_NATIVE_MINING_PLANET_VISUALS', message);
export const ORIGINAL_MINING_PLASMA_TEXTURE = 'graphics/planets/dynamo.png';
export const ORIGINAL_MINING_PLASMA_THICKNESS = Math.fround(0.15);

function validateOptions(options) {
  check(options !== null && typeof options === 'object' && !Array.isArray(options) && !options.then,
    'Actual synchronous Mining visual options required');
  check(options.getSpriteName === undefined || typeof options.getSpriteName === 'function',
    'Mining getSpriteName must be a synchronous settings reader when supplied');
}

/** Mutates the actual working PlanetSpec, then invokes the existing native model
 * applySpecChanges path. Do not replace this with a record, cloned planet or noop.
 * OriginalCampaignPlanet deliberately moves the working spec into graphics and
 * clones the next working spec; planet/entity/graphics themselves retain identity.
 * There is no pre-install shield2 snapshot: native uninstall clears that layer.
 * A null planet is the native early return and does not read settings. */
export function setOriginalMiningPlasmaVisuals(planet, enabled, options = {}) {
  check(typeof enabled === 'boolean', 'Explicit Mining plasma visual boolean required');
  if (planet === null) return null;
  check(planet !== undefined && typeof planet === 'object' && !Array.isArray(planet) && !planet.then,
    'Actual shared CampaignPlanet or explicit null required');
  validateOriginalCampaignPlanet(planet);
  validateOptions(options);
  const texture = enabled
    ? options.getSpriteName === undefined
      ? ORIGINAL_MINING_PLASMA_TEXTURE
      : options.getSpriteName('industry', 'plasma_net_texture')
    : null;
  check(!enabled || typeof texture === 'string' && texture.trim().length > 0,
    'Actual synchronous industry/plasma_net_texture path required');
  const spec = getOriginalCampaignPlanetSpec(planet);
  spec.shieldTexture2 = texture;
  spec.shieldThickness2 = enabled ? ORIGINAL_MINING_PLASMA_THICKNESS : 0;
  spec.shieldColor2 = enabled ? [255, 255, 255, 255] : null;
  // This real model service refreshes graphics.spec AND its cached texture paths.
  // No early-out on an unchanged value: native repeat installation reapplies spec.
  return applyOriginalCampaignPlanetSpec(planet);
}

/** ResourceLifecycle service adapter. The injected reader must resolve the actual
 * CURRENT market planet from the shared world graph on every call. It is required;
 * absence never silently means "no planet". The lifecycle owns the historical
 * shownPlasmaNetVisuals flag and supplies row as an ignored third setter argument.
 * No alternate applySpecChanges hook: the real synchronous model path exists. */
export function createOriginalMiningPlanetVisualServices(options) {
  validateOptions(options);
  check(typeof options.readPlanet === 'function', 'Actual synchronous market readPlanet service required');
  return {
    readPlanet() {
      const planet = options.readPlanet();
      check(planet === null || typeof planet === 'object' && !Array.isArray(planet) && !planet.then,
        'readPlanet must return the actual shared CampaignPlanet or explicit null, never a Promise');
      if (planet !== null) validateOriginalCampaignPlanet(planet);
      return planet;
    },
    setMiningPlasmaVisuals(planet, enabled) {
      setOriginalMiningPlasmaVisuals(planet, enabled, options);
    },
  };
}
