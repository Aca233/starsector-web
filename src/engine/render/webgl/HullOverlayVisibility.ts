import type { ViewportBounds } from './WebGLPassContext';

/** Conservative bounds of the EXACT sprite quad submitted by SpriteBatcher.
 * Damage/overload overlays are hull-alpha clipped, including wreck pieces; this
 * must NOT be used to cull engines, turrets, exhaust or other out-of-hull effects.
 * Exceptional/modded parameters fail open. No gameplay or visibility mutation. */
export function hullOverlayInViewport(
  x: number, y: number, facing: number,
  spec: { spriteWidth: number; spriteHeight: number; pivotX: number; pivotY: number },
  viewport: ViewportBounds, zoom: number,
): boolean {
  const { spriteWidth: w, spriteHeight: h, pivotX: px, pivotY: py } = spec;
  if (![x,y,facing,w,h,px,py,zoom,viewport.left,viewport.right,viewport.bottom,viewport.top].every(Number.isFinite)
    || w<=0 || h<=0 || zoom<=0 || viewport.left>viewport.right || viewport.bottom>viewport.top) return true;
  // The instance buffer stores float32; include its actual pivot/angle rounding.
  const angle=Math.fround(facing+Math.PI/2),c=Math.cos(angle),s=Math.sin(angle);
  const width=Math.fround(w),height=Math.fround(h);
  const ox=-Math.fround(px/w-.5)*width,oy=-Math.fround(py/h-.5)*height;
  const cx=Math.fround(x)+ox*c-oy*s,cy=Math.fround(y)+ox*s+oy*c;
  const ex=(Math.abs(c)*width+Math.abs(s)*height)/2,ey=(Math.abs(s)*width+Math.abs(c)*height)/2;
  const padding=2/zoom+1e-6*Math.max(1,Math.abs(x),Math.abs(y),Math.abs(ox),Math.abs(oy),ex,ey);
  if (![cx,cy,ex,ey,padding].every(Number.isFinite)) return true;
  return !(cx+ex+padding<viewport.left || cx-ex-padding>viewport.right
    || cy+ey+padding<viewport.bottom || cy-ey-padding>viewport.top);
}
