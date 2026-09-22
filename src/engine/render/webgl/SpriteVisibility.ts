/** Conservative clip-space rejection BEFORE a sprite changes texture batches.
 * L1 radius includes pivot and all rotations. Keep edge/invalid quads; shaders
 * still decide their pixels. Matrix layout is the actual column-major mat3. */
export function spriteInClip(m: Float32Array, x: number, y: number, sx: number, sy: number, px: number, py: number): boolean {
  x=Math.fround(x);y=Math.fround(y);sx=Math.fround(sx);sy=Math.fround(sy);px=Math.fround(px);py=Math.fround(py);
  const radius=Math.abs(sx)*(.5+Math.abs(px))+Math.abs(sy)*(.5+Math.abs(py));
  const cx=m[0]*x+m[3]*y+m[6],cy=m[1]*x+m[4]*y+m[7];
  const ex=radius*(Math.abs(m[0])+Math.abs(m[3])),ey=radius*(Math.abs(m[1])+Math.abs(m[4]));
  const pad=1e-5*(1+Math.abs(m[0]*x)+Math.abs(m[3]*y)+Math.abs(m[6])+Math.abs(m[1]*x)+Math.abs(m[4]*y)+Math.abs(m[7])+ex+ey);
  if (!Number.isFinite(cx+cy+ex+ey+pad)) return true;
  return !(cx+ex+pad < -1 || cx-ex-pad > 1 || cy+ey+pad < -1 || cy-ey-pad > 1);
}
