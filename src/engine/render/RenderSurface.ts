/** Environment-neutral native drawing surfaces. The DOM path keeps its original
 * Canvas/Image objects; workers use actual OffscreenCanvas/ImageBitmap objects. */
export type RenderCanvas = HTMLCanvasElement | OffscreenCanvas;
export type RenderContext2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type RenderImage = HTMLImageElement | ImageBitmap;

export function createRenderCanvas(): RenderCanvas {
  if (typeof document !== 'undefined') return document.createElement('canvas');
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(300, 150);
  throw new Error('No native rendering surface available');
}
function isOffscreen(canvas: RenderCanvas): canvas is OffscreenCanvas {
  return typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas;
}
export function renderContext2D(canvas: RenderCanvas, options?: CanvasRenderingContext2DSettings): RenderContext2D | null {
  return isOffscreen(canvas) ? canvas.getContext('2d', options) : canvas.getContext('2d', options);
}
export function renderContextWebGL2(canvas: RenderCanvas, options?: WebGLContextAttributes): WebGL2RenderingContext | null {
  return isOffscreen(canvas) ? canvas.getContext('webgl2', options) : canvas.getContext('webgl2', options);
}
export function imageWidth(image: RenderImage): number {
  return 'naturalWidth' in image ? image.naturalWidth : image.width;
}
export function imageHeight(image: RenderImage): number {
  return 'naturalHeight' in image ? image.naturalHeight : image.height;
}
