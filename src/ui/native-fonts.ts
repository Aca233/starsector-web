/** Compatibility names for callers; fonts now come exclusively from the OS.
 * Widths are measured lazily for every Unicode codepoint, including Chinese.
 * No original bitmap atlas or TTF is fetched or redistributed.
 */
export type NativeFont = 'action' | 'button' | 'caption' | 'body' | 'tiny' | 'credits' | 'burn';
export type Glyph = { x: number; y: number; width: number; height: number; xoffset: number; yoffset: number; xadvance: number };
export type BitmapFont = { lineHeight: number; glyphs: Map<number, Glyph>; kernings: Map<string, number> };
const sizes: Record<NativeFont, number> = { action: 20, button: 16, caption: 14, body: 15, tiny: 10, credits: 18, burn: 20 };
const heights: Record<NativeFont, number> = { action: 26, button: 22, caption: 18, body: 20, tiny: 14, credits: 24, burn: 26 };
const loaded = new Map<NativeFont, BitmapFont>();
class SystemGlyphs extends Map<number, Glyph> {
  constructor(private context: CanvasRenderingContext2D | null, private fontSize: number, private height: number) { super(); }
  override get(code: number): Glyph {
    const existing = super.get(code);
    if (existing) return existing;
    const width = this.context?.measureText(String.fromCodePoint(code)).width ?? (code > 255 ? this.fontSize : this.fontSize * .6);
    const glyph = { x: 0, y: 0, width, height: this.height, xoffset: 0, yoffset: 0, xadvance: width };
    this.set(code, glyph);
    return glyph;
  }
}
export function loadNativeFont(font: NativeFont): Promise<BitmapFont> {
  const cached = loaded.get(font);
  if (cached) return Promise.resolve(cached);
  const context = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  if (context) context.font = `${sizes[font]}px "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif`;
  const result = { lineHeight: heights[font], glyphs: new SystemGlyphs(context, sizes[font], heights[font]), kernings: new Map<string, number>() };
  loaded.set(font, result);
  return Promise.resolve(result);
}
export function preloadNativeUIFonts(): void { void loadNativeFont('button'); void loadNativeFont('caption'); }
export function preloadNativeMenuFonts(): void { void loadNativeFont('action'); void loadNativeFont('caption'); }
export function getLoadedNativeFont(font: NativeFont): BitmapFont | undefined { return loaded.get(font); }
