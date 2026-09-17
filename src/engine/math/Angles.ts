/** Signed shortest angular displacement in radians. */
export function signedAngle(angle: number): number { return Math.atan2(Math.sin(angle), Math.cos(angle)); }
