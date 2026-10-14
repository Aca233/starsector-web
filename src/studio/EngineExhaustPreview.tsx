import React from 'react';
import type { AssemblyPart } from '../engine/content/ModuleGeometry';
import { Vector2 } from '../engine/math/Vector2';
import { ENGINE_EXHAUST_TEXTURES } from '../engine/visual/EngineExhaust';
import { textureCache } from '../engine/render/TextureCache';
import { SpriteBatcher } from '../engine/render/webgl/SpriteBatcher';
import { RibbonBatcher } from '../engine/render/webgl/RibbonBatcher';
import { WebGLTextureManager } from '../engine/render/webgl/WebGLTextureManager';
import { renderIdleShipEngines } from '../engine/render/webgl/ShipEngineRenderer';

interface Props { parts: AssemblyPart[]; minX: number; minY: number; width: number; height: number; animate: boolean }
interface SceneState extends Props { engineParts: AssemblyPart[]; pad: number }
/** One transparent canvas: the combat engine draw path masked by actual hull alpha. */
export function EngineExhaustPreview({ parts, minX, minY, width, height, animate }: Props) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const [generation, setGeneration] = React.useState(0);
  const engineParts = React.useMemo(() => parts.filter(part => part.spec.engineSlots.some(slot => slot.exhaust?.mode === 'NATIVE')), [parts]);
  const pad = Math.max(1, ...engineParts.flatMap(part => part.spec.engineSlots.filter(slot => slot.exhaust?.mode !== 'HIDDEN').map(slot => Math.max(slot.width * 2, slot.length * .2))));
  const hasEngines = engineParts.length > 0;
  const sceneRef = React.useRef<SceneState>({ parts, engineParts, minX, minY, width, height, animate, pad });
  const syncRef = React.useRef<(() => void) | null>(null);
  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true });
    if (!gl) { canvas.dataset.renderError = 'WebGL2 unavailable'; return; }
    let batcher: SpriteBatcher | undefined, ribbon: RibbonBatcher | undefined, textures: WebGLTextureManager | undefined;
    let disposed = false, ready = false, visible = true, raf = 0, last = 0, time = 0, loadToken = 0;
    const camera = new Vector2(0, 0);
    const partPos = new Vector2(0, 0);
    const draw = () => {
      if (!ready || disposed || gl.isContextLost() || !batcher || !ribbon || !textures) return;
      const { engineParts: curEngines, parts: curParts, minX: curMinX, minY: curMinY, width: curWidth, height: curHeight, pad: curPad } = sceneRef.current;
      if (!curEngines.length) return;
      const worldWidth = curWidth + 2 * curPad, worldHeight = curHeight + 2 * curPad;
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(2, window.devicePixelRatio || 1) * rect.width / worldWidth;
      if (!Number.isFinite(scale) || scale <= 0) return;
      const zoom = Math.min(scale, 1536 / Math.max(worldWidth, worldHeight));
      const pixelWidth = Math.max(1, Math.round(worldWidth * zoom)), pixelHeight = Math.max(1, Math.round(worldHeight * zoom));
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      camera.set(curMinX + curWidth / 2, curMinY + curHeight / 2);
      gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      batcher.begin(camera, zoom, canvas.width, canvas.height);
      const ctx = { batcher, ribbonBatcher: ribbon, textures, hitGlowTex: textures.getTexture(ENGINE_EXHAUST_TEXTURES[1]),
        alpha: 1, zoom, viewport: { left: curMinX - curPad, right: curMinX + curWidth + curPad, bottom: curMinY - curPad, top: curMinY + curHeight + curPad, width: worldWidth, height: worldHeight } };
      for (const part of curEngines) {
        partPos.set(part.y, -part.x);
        renderIdleShipEngines(part.spec, partPos, part.angle - Math.PI / 2, ctx, time);
      }
      // The same ordinary hull alpha occlusion as combat; no painted opening overlay.
      batcher.setBlendMode('NORMAL'); batcher.flush();
      gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
      for (const part of curParts) {
        const h = part.spec;
        batcher.drawSprite(textures.getTexture(h.spriteUrl), part.y, -part.x, h.spriteWidth, h.spriteHeight,
          part.angle, h.pivotX / h.spriteWidth - .5, h.pivotY / h.spriteHeight - .5);
      }
      batcher.flush(); batcher.setBlendMode('ADDITIVE');
      batcher.end();
    };
    const tick = (now: number) => {
      raf = 0;
      if (!visible || document.hidden || disposed || gl.isContextLost() || !sceneRef.current.engineParts.length) { last = 0; return; }
      if (!last || now - last >= 33) { time += last ? Math.min(.1, (now - last) / 1000) : 0; last = now; draw(); }
      if (sceneRef.current.animate) raf = requestAnimationFrame(tick);
    };
    const resume = () => { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; if (ready && visible && !document.hidden && sceneRef.current.engineParts.length) raf = requestAnimationFrame(tick); };
    const sync = () => {
      if (disposed || gl.isContextLost() || !textures) return;
      const token = ++loadToken;
      if (!sceneRef.current.engineParts.length) {
        ready = false;
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        last = 0;
        gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        return;
      }
      const urls = [...ENGINE_EXHAUST_TEXTURES, ...sceneRef.current.parts.map(part => part.spec.spriteUrl)];
      if (urls.every(url => Boolean(textureCache.getTextureImage(url)))) {
        for (const url of urls) textures.getTexture(url);
        ready = true;
        if (visible && !document.hidden) draw();
        if (!raf && sceneRef.current.animate && visible && !document.hidden) raf = requestAnimationFrame(tick);
        return;
      }
      ready = false;
      gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      void textures.preload(urls).then(() => {
        if (!disposed && token === loadToken) { ready = true; if (visible && !document.hidden) draw(); resume(); }
      }).catch(error => {
        if (!disposed) { canvas.dataset.renderError = String(error); console.error('Engine preview assets failed', error); }
      });
    };
    const observer = new IntersectionObserver(entries => { visible = entries.some(e => e.isIntersecting); resume(); });
    observer.observe(canvas);
    const resize = new ResizeObserver(() => { if (visible && !document.hidden) draw(); }); resize.observe(canvas);
    document.addEventListener('visibilitychange', resume);
    const lost = (e: Event) => { e.preventDefault(); if (raf) cancelAnimationFrame(raf); raf = 0; };
    const restored = () => setGeneration(g => g + 1);
    canvas.addEventListener('webglcontextlost', lost); canvas.addEventListener('webglcontextrestored', restored);
    try {
      batcher = new SpriteBatcher(gl); ribbon = new RibbonBatcher(gl); textures = new WebGLTextureManager(gl);
      syncRef.current = sync;
      sync();
    } catch (error) { canvas.dataset.renderError = String(error); console.error('Engine preview initialization failed', error); }
    return () => {
      syncRef.current = null;
      disposed = true; if (raf) cancelAnimationFrame(raf); observer.disconnect(); resize.disconnect();
      document.removeEventListener('visibilitychange', resume);
      canvas.removeEventListener('webglcontextlost', lost); canvas.removeEventListener('webglcontextrestored', restored);
      batcher?.dispose(); ribbon?.dispose(); textures?.dispose();
    };
  }, [generation]);
  React.useLayoutEffect(() => {
    sceneRef.current = { parts, engineParts, minX, minY, width, height, animate, pad };
    syncRef.current?.();
  }, [engineParts, parts, minX, minY, width, height, pad, animate]);
  return <canvas ref={ref} data-engine-preview={hasEngines ? "native-idle" : undefined} aria-hidden="true" style={{ position: 'absolute', pointerEvents: 'none', zIndex: 1,
    display: hasEngines ? undefined : 'none',
    left: -pad / width * 100 + '%', top: -pad / height * 100 + '%', width: (width + 2 * pad) / width * 100 + '%', height: (height + 2 * pad) / height * 100 + '%' }} />;
}

