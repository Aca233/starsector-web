/** Ordinary JumpPoint.advance/getScale/render, 0.98a reference. This is cosmetic state,
 * separate from jump fees/physics. Only already-disclosed fleets may affect the view. */
export const JUMP_OPEN_RANGE = 600;
export function wantsJumpPointOpen(point, fleets, hyperspace) {
  if (hyperspace) return true;
  return fleets.some(f => f.locationId === point.locationId &&
    (f.navigation?.interaction?.targetId === point.id || f.navigation?.jumpSourceId === point.id) &&
    Math.hypot(f.position[0] - point.position[0], f.position[1] - point.position[1]) < JUMP_OPEN_RANGE);
}
export function initialJumpVisual(open = false) { return { brightness: open ? 1 : 0, opening: open, hold: open ? 5 : 0 }; }
export function advanceJumpVisual(previous, active, seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) throw Error('Invalid visual delta');
  const state = { ...previous }; let remaining = seconds;
  if (active) { state.opening = true; state.hold = 5; state.brightness = Math.min(1, state.brightness + seconds); return state; }
  if (state.opening && state.brightness < 1) {
    const amount = Math.min(remaining, 1 - state.brightness); state.brightness += amount; remaining -= amount;
  }
  if (state.opening) { const amount = Math.min(remaining, state.hold); state.hold -= amount; remaining -= amount; if (state.hold <= 1e-10) state.opening = false; }
  if (!state.opening) state.brightness = Math.max(0, state.brightness - remaining);
  return state;
}
export function jumpVisualParameters(radius, brightness) {
  if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(brightness) || brightness < 0 || brightness > 1) throw Error('Invalid jump visual');
  const open = brightness * brightness, scale = .1 + .9 * open, bandBase = radius * 1.25;
  const coronaSize = radius * 2 * 1.55 * 2.3;
  return { open, scale, coronaSize, ringSize: radius * 2 * 1.55, ringStep: .28320312 * coronaSize / 75,
    glowSize: (radius + 70) * .5, glowAlpha: .67 * Math.pow(1 - open, 3),
    bandWidth: bandBase * .3 + 20 + .6 * bandBase / scale + 20 * (1 - open) / scale,
    bandInnerRadius: radius * .7 - bandBase * .05, bandAlpha: (1 - open) * .75,
    bandFluctuation: open === 0 ? 35 : Math.min(.5, radius * .01),
    pixelsPerSegment: Math.max(3, Math.min(10, radius * Math.PI * 2 * scale / 50)) };
}
