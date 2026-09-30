/** A layout sample, not a DOM adapter. CSS coordinates and backing pixels are
 * intentionally separate. Transfer values explicitly; no HTMLCanvas capability. */
export interface CombatViewport {
  readonly rect: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
  readonly width: number;
  readonly height: number;
}
export type CombatCanvas = Pick<HTMLCanvasElement, 'width' | 'height' | 'getBoundingClientRect'>;
/** Capture after any backing resize. A caller may reuse a rectangle it just read
 * in this synchronous frame; never reuse it for a later input/send event. */
export function readCombatViewport(canvas: CombatCanvas, rect = canvas.getBoundingClientRect()): CombatViewport {
  return { rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, width: canvas.width, height: canvas.height };
}
