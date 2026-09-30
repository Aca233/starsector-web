/** Compact aircraft plasma uses the native 0.98a PlasmaShot ray arrangement.
 * Stable ray sizes, counter-rotation and fade follow simulation time (not wall time).
 */
export const ARK_AIR_PLASMA_ID = 'web_ark_air_capacitor';
export const ARK_AIR_BEAM_ID = 'web_ark_air_prism';
export const ARK_AIR_PLASMA_TEXTURE = '/game-assets/graphics/fx/torpedoray32.png';
export function aircraftPlasmaRays(time: number, size: number, random: (index: number) => number) {
  return Array.from({ length: 11 }, (_, i) => {
    const outer = i < 6, index = outer ? i : i - 6, count = outer ? 6 : 5;
    return { angle: index * Math.PI * 2 / count + time * (outer ? 160 : -160) * Math.PI / 180,
      size: size * (.75 + .25 * random(i)) };
  });
}
