/** Native campaign coordinates use +Y up; browser canvas/SVG use +Y down. */
export const mapPosition = ([x, y]) => [x, -y];
export const worldPosition = ([x, y]) => [x, -y];
export function screenPosition(position, center, width, height, zoom) {
  return [width / 2 + (position[0] - center[0]) * zoom, height / 2 - (position[1] - center[1]) * zoom];
}
const radians = d => d * Math.PI / 180;
const multiply = (a, b) => Array.from({ length: 9 }, (_, i) => {
  const row = i % 3, col = Math.floor(i / 3);
  return a[row] * b[col * 3] + a[row + 3] * b[col * 3 + 1] + a[row + 6] * b[col * 3 + 2];
});
const rx = a => [1, 0, 0, 0, Math.cos(a), Math.sin(a), 0, -Math.sin(a), Math.cos(a)];
const ry = a => [Math.cos(a), 0, -Math.sin(a), 0, 1, 0, Math.sin(a), 0, Math.cos(a)];
const rz = a => [Math.cos(a), Math.sin(a), 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 1];
/** Planet.render3d OpenGL postmultiply order, column-major. */
export function planetRotationMatrix(tilt, pitch, angle) {
  return multiply(multiply(multiply(rz(radians(tilt)), rx(radians(pitch))), ry(radians(angle))), rx(-Math.PI / 2));
}
/** LWJGL GLU Sphere.draw textureFlag=true, outward normals. Triangles replace native strips. */
export function nativePlanetMesh(detail = 32) {
  if (!Number.isInteger(detail) || detail < 4 || detail > 128) throw new RangeError('Invalid planet mesh detail');
  const vertex = (i, j) => {
    const rho = i * Math.PI / detail, theta = j === detail ? 0 : j * Math.PI * 2 / detail;
    return [-Math.sin(theta) * Math.sin(rho), Math.cos(theta) * Math.sin(rho), Math.cos(rho), j / detail, 1 - i / detail];
  };
  const result = [];
  for (let i = 0; i < detail; i++) for (let j = 0; j < detail; j++) {
    const a = vertex(i, j), b = vertex(i + 1, j), c = vertex(i, j + 1), d = vertex(i + 1, j + 1);
    result.push(...a, ...b, ...c, ...c, ...b, ...d);
  }
  return new Float32Array(result);
}
/** CampaignPlanet.render, ordinary single star without light-height/ambient override. */
export function planetLightPosition(position, radius, lightPosition, source) {
  if (!source) return lightPosition.map(v => v * radius);
  const x = source[0] - position[0], y = source[1] - position[1];
  return [x, y, Math.hypot(x, y) * .75];
}
/** Renderer phase is cosmetic. Saved explicit phase + authority time; never orbital/gameplay state. */
export function bodySurfaceAngle(phase, rotation, gameSeconds) {
  return ((phase + rotation * gameSeconds) % 360 + 360) % 360;
}
