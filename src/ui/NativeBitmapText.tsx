import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getLoadedNativeFont, loadNativeFont } from "./native-fonts";
import type { BitmapFont, NativeFont, Glyph } from "./native-fonts";

/** Draw the original Chinese/Latin glyph atlas, not a system-font approximation.
 * DOM text stays available to assistive technology and as a load-error fallback. */
export function NativeBitmapText({ children: text, font = "action", color = "#aadeff" }: {
  children: string; font?: NativeFont; color?: string;
}) {
  const [asset, setAsset] = useState<BitmapFont | undefined>(() => getLoadedNativeFont(font));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    void loadNativeFont(font).then((value) => { if (!cancelled) setAsset(value); }).catch(() => {});
    return () => { cancelled = true; };
  }, [font]);
  const { placements, width, available } = useMemo(() => {
    const characters = Array.from(text);
    const available = !!asset && characters.every((c) => asset.glyphs.has(c.codePointAt(0)!));
    let width = 0;
    const placements: { glyph: Glyph; x: number }[] = [];
    let previous: number | undefined;
    if (available && asset) for (const character of characters) {
      const code = character.codePointAt(0)!;
      const glyph = asset.glyphs.get(code)!;
      if (previous !== undefined) width += asset.kernings.get(previous + ":" + code) ?? 0;
      placements.push({ glyph, x: width });
      width += glyph.xadvance;
      previous = code;
    }
    return { placements, width, available };
  }, [asset, text]);
  const height = asset?.lineHeight ?? ({ action: 24, button: 20, caption: 16, body: 17 })[font];
  const paintedRef = useRef<{
    canvas: HTMLCanvasElement; asset: BitmapFont; placements: typeof placements; color: string;
  } | null>(null);
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !asset || !available) return;
    // currentColor can change through a parent's disabled/selected state even
    // when this component's props are unchanged. Resolve it after every commit,
    // but only repaint when the glyphs or their resolved color actually change.
    const resolvedColor = color === "currentColor" ? getComputedStyle(canvas).color : color;
    const painted = paintedRef.current;
    if (painted?.canvas === canvas && painted.asset === asset &&
        painted.placements === placements && painted.color === resolvedColor) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    for (const { glyph: g, x } of placements) {
      ctx.drawImage(asset.image, g.x, g.y, g.width, g.height, x + g.xoffset, g.yoffset, g.width, g.height);
    }
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = resolvedColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";
    canvas.style.translate = "none";
    const rect = canvas.getBoundingClientRect();
    canvas.style.translate = `${Math.round(rect.x) - rect.x}px ${Math.round(rect.y) - rect.y}px`;
    paintedRef.current = { canvas, asset, placements, color: resolvedColor };
  });
  return <span className="native-bitmap-text" data-font={font} data-bitmap-ready={available} style={{ height, color }}>
    <span className={available ? "native-bitmap-accessible" : "native-bitmap-fallback"}>{text}</span>
    {available && <canvas ref={canvasRef} aria-hidden="true" width={Math.max(1, Math.ceil(width))} height={height} style={{ width: Math.max(1, Math.ceil(width)), height }} />}
  </span>;
}
