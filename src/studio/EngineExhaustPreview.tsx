import React from 'react';
import type { AssemblyPart } from '../engine/content/ModuleGeometry';
import { Vector2 } from '../engine/math/Vector2';
import { ENGINE_EXHAUST_TEXTURES } from '../engine/visual/EngineExhaust';
import { SpriteBatcher } from '../engine/render/webgl/SpriteBatcher';
import { RibbonBatcher } from '../engine/render/webgl/RibbonBatcher';
import { WebGLTextureManager } from '../engine/render/webgl/WebGLTextureManager';
import { renderIdleShipEngines } from '../engine/render/webgl/ShipEngineRenderer';

interface Props { parts: AssemblyPart[]; minX: number; minY: number; width: number; height: number; animate: boolean }
/** One transparent canvas: the combat engine draw path masked by actual hull alpha. */
export function EngineExhaustPreview({ parts, minX, minY, width, height, animate }: Props) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const [generation, setGeneration] = React.useState(0);
  const engineParts = React.useMemo(() => parts.filter(part => part.spec.engineSlots.some(slot => slot.exhaust?.mode === 'NATIVE')), [parts]);
  const pad = Math.max(1, ...engineParts.flatMap(part => part.spec.engineSlots.filter(slot => slot.exhaust?.mode !== 'HIDDEN').map(slot => Math.max(slot.width * 2, slot.length * .2))));
  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !engineParts.length) return;
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true });
    if (!gl) { canvas.dataset.renderError = 'WebGL2 unavailable'; return; }
    let batcher: SpriteBatcher | undefined, ribbon: RibbonBatcher | undefined, textures: WebGLTextureManager | undefined;
    let disposed = false, ready = false, visible = true, raf = 0, last = 0, time = 0;
    const worldWidth = width + 2 * pad, worldHeight = height + 2 * pad;
    const camera = new Vector2(minX + width / 2, minY + height / 2);
    const draw = () => {
      if (!ready || disposed || gl.isContextLost() || !batcher || !ribbon || !textures) return;
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(2, window.devicePixelRatio || 1) * rect.width / worldWidth;
      if (!Number.isFinite(scale) || scale <= 0) return;
      const zoom = Math.min(scale, 1536 / Math.max(worldWidth, worldHeight));
      const pixelWidth = Math.max(1, Math.round(worldWidth * zoom)), pixelHeight = Math.max(1, Math.round(worldHeight * zoom));
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      batcher.begin(camera, zoom, canvas.width, canvas.height);
      const ctx = { batcher, ribbonBatcher: ribbon, textures, hitGlowTex: textures.getTexture(ENGINE_EXHAUST_TEXTURES[1]),
        alpha: 1, zoom, viewport: { left: minX - pad, right: minX + width + pad, bottom: minY - pad, top: minY + height + pad, width: worldWidth, height: worldHeight } };
      for (const part of engineParts) renderIdleShipEngines(part.spec, new Vector2(part.y, -part.x), part.angle - Math.PI / 2, ctx, time);
      // The same ordinary hull alpha occlusion as combat; no painted opening overlay.
      batcher.setBlendMode('NORMAL'); batcher.flush();
      gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
      for (const part of parts) {
        const h = part.spec;
        batcher.drawSprite(textures.getTexture(h.spriteUrl), part.y, -part.x, h.spriteWidth, h.spriteHeight,
          part.angle, h.pivotX / h.spriteWidth - .5, h.pivotY / h.spriteHeight - .5);
      }
      batcher.flush(); batcher.setBlendMode('ADDITIVE');
      batcher.end();
    };
    const tick = (now: number) => {
      raf = 0;
      if (!visible || document.hidden || disposed || gl.isContextLost()) { last = 0; return; }
      if (!last || now - last >= 33) { time += last ? Math.min(.1, (now - last) / 1000) : 0; last = now; draw(); }
      if (animate) raf = requestAnimationFrame(tick);
    };
    const resume = () => { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; if (ready && visible && !document.hidden) raf = requestAnimationFrame(tick); };
    const observer = new IntersectionObserver(entries => { visible = entries.some(e => e.isIntersecting); resume(); });
    observer.observe(canvas);
    const resize = new ResizeObserver(() => { if (visible && !document.hidden) draw(); }); resize.observe(canvas);
    document.addEventListener('visibilitychange', resume);
    const lost = (e: Event) => { e.preventDefault(); if (raf) cancelAnimationFrame(raf); raf = 0; };
    const restored = () => setGeneration(g => g + 1);
    canvas.addEventListener('webglcontextlost', lost); canvas.addEventListener('webglcontextrestored', restored);
    try {
      batcher = new SpriteBatcher(gl); ribbon = new RibbonBatcher(gl); textures = new WebGLTextureManager(gl);
      void textures.preload([...ENGINE_EXHAUST_TEXTURES, ...parts.map(part => part.spec.spriteUrl)]).then(() => { if (!disposed) { ready = true; resume(); } }).catch(error => {
        if (!disposed) { canvas.dataset.renderError = String(error); console.error('Engine preview assets failed', error); }
      });
    } catch (error) { canvas.dataset.renderError = String(error); console.error('Engine preview initialization failed', error); }
    return () => {
      disposed = true; if (raf) cancelAnimationFrame(raf); observer.disconnect(); resize.disconnect();
      document.removeEventListener('visibilitychange', resume);
      canvas.removeEventListener('webglcontextlost', lost); canvas.removeEventListener('webglcontextrestored', restored);
      batcher?.dispose(); ribbon?.dispose(); textures?.dispose();
    };
  }, [engineParts, parts, minX, minY, width, height, pad, animate, generation]);
  if (!engineParts.length) return null;
  return <canvas ref={ref} data-engine-preview="native-idle" aria-hidden="true" style={{ position: 'absolute', pointerEvents: 'none', zIndex: 1,
    left: -pad / width * 100 + '%', top: -pad / height * 100 + '%', width: (width + 2 * pad) / width * 100 + '%', height: (height + 2 * pad) / height * 100 + '%' }} />;
}
