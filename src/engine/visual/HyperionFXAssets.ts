/** Retained installed-game media, not generated stand-ins or SC2 artwork.
 * Shared by the renderer and extension preload contract (including future shots). */
export const HYPERION_FX = {
  plasma: '/game-assets/graphics/fx/explosion4.png',
  cloud: '/game-assets/graphics/fx/explosion1.png',
  flare: '/game-assets/graphics/fx/starburst_glow1.png',
  trail: '/game-assets/graphics/fx/projtrail.png',
  energy: '/game-assets/graphics/fx/beam_rough2_fringe.png',
  ring: '/game-assets/graphics/fx/explosion_ring0.png',
  corona: '/game-assets/graphics/fx/wormhole_corona.png',
  aperture: '/game-assets/graphics/fx/wormhole_ring_bright3.png',
} as const;
export const hyperionFXTextures = Object.values(HYPERION_FX);
