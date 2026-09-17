import { runtimeAssetUrl } from "../engine/runtime/RuntimePaths";

export type NativeFont = "action" | "button" | "caption" | "body";
type MenuFont = NativeFont;
export type Glyph = { x: number; y: number; width: number; height: number; xoffset: number; yoffset: number; xadvance: number };
export type BitmapFont = { image: HTMLImageElement; lineHeight: number; glyphs: Map<number, Glyph>; kernings: Map<string, number> };
const faces: Record<MenuFont, string> = { action: "orbitron24aabold", button: "orbitron20aa", caption: "orbitron12condensed", body: "insignia15LTaa" };
const cached = new Map<MenuFont, Promise<BitmapFont>>();
const loaded = new Map<MenuFont, BitmapFont>();

export function loadNativeFont(font: MenuFont): Promise<BitmapFont> {
  const existing = cached.get(font);
  if (existing) return existing;
  const request = (async () => {
    const base = "graphics/fonts/native-menu/";
    const response = await fetch(runtimeAssetUrl(base + faces[font] + ".fnt"));
    if (!response.ok) throw new Error("Native menu font unavailable");
    const source = await response.text();
    const numberFields = (line: string) => Object.fromEntries([...line.matchAll(/(\w+)=(-?\d+)/g)].map((m) => [m[1], Number(m[2])]));
    const glyphs = new Map<number, Glyph>();
    const kernings = new Map<string, number>();
    let lineHeight = ({ action: 24, button: 20, caption: 16, body: 17 })[font];
    for (const line of source.split(/\r?\n/)) {
      const fields = numberFields(line);
      if (line.startsWith("common ")) lineHeight = fields.lineHeight;
      if (line.startsWith("char ")) glyphs.set(fields.id, fields as Glyph);
      if (line.startsWith("kerning ")) kernings.set(fields.first + ":" + fields.second, fields.amount);
    }
    const image = new Image();
    image.src = runtimeAssetUrl(base + faces[font] + "_0.png");
    await image.decode();
    const result = { image, lineHeight, glyphs, kernings };
    loaded.set(font, result);
    return result;
  })();
  cached.set(font, request);
  void request.catch(() => cached.delete(font));
  return request;
}

export function preloadNativeUIFonts(): void {
  void Promise.all((["button", "caption"] as NativeFont[]).map(loadNativeFont)).catch(() => {});
}
export function preloadNativeMenuFonts(): void {
  void Promise.all((["action", "caption"] as NativeFont[]).map(loadNativeFont)).catch(() => {});
}


export function getLoadedNativeFont(font: NativeFont): BitmapFont | undefined { return loaded.get(font); }
