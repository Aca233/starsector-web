import aircraftArt from './adun-ark-aircraft-art.json';
export { aircraftArt };
export type ArkAircraftArt = (typeof aircraftArt)[keyof typeof aircraftArt];
/** Sprite faces image-up; runtime ship +X is forward and +Y is starboard. */
export function aircraftSocket(art: ArkAircraftArt, pixel: readonly number[]) {
  return { x: (art.pivot[1] - pixel[1]) * art.worldHeight / art.height,
    y: (pixel[0] - art.pivot[0]) * art.worldWidth / art.width };
}
