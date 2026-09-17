export interface MovingRayVisualState {
  length: number;
  centerBackOffset: number;
  brightness: number;
}

export interface MovingRaySourceRenderState {
  halfWidth: number;
  capLength: number;
  texturePhase: number;
  mainAlpha: number;
  endpointAlpha: number;
}

/**
 * BALLISTIC_AS_BEAM uses com.fs.starfarer.renderers.N rather than the normal beam strip.
 * N.o starts its UV phase at 1 and advances phase -= dt * textureScrollSpeed (no /128);
 * repeat sampling makes the wrapped form visually equivalent while keeping numbers bounded.
 */
export function getMovingRaySourceRenderState(
  length: number,
  width: number,
  brightness: number,
  elapsedTime: number,
  textureScrollSpeed: number
): MovingRaySourceRenderState {
  const safeLength = Math.max(0, length);
  const halfWidth = Math.max(0, width) * 0.5;
  const b = Math.max(0, Math.min(1, brightness));
  const rawPhase = 1 - Math.max(0, elapsedTime) * textureScrollSpeed;
  const texturePhase = rawPhase - Math.floor(rawPhase);
  return {
    halfWidth,
    capLength: Math.max(halfWidth, safeLength * 0.2),
    texturePhase,
    mainAlpha: b * b,
    endpointAlpha: b * 0.5
  };
}

/**
 * Source-aligned BALLISTIC_AS_BEAM growth stage from MovingRay + entity L.
 * The projectile position is the advancing head; the tail remains at the muzzle
 * until the authored pulse length has been reached, then follows at that length.
 */
export function getMovingRayVisualState(
  authoredLength: number,
  elapsedTime: number,
  moveSpeed: number
): MovingRayVisualState {
  const maxLength = Math.max(0, authoredLength);
  if (maxLength <= 0) return { length: 0, centerBackOffset: 0, brightness: 0 };

  const traveled = Math.max(0, elapsedTime) * Math.max(0, moveSpeed);
  const length = Math.min(maxLength, traveled);
  const brightness = Math.min(1, length / maxLength);
  return {
    length,
    centerBackOffset: length * 0.5,
    brightness
  };
}
