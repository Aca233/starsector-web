import { runtimeAssetUrl } from '../../engine/runtime/RuntimePaths';
import { useEffect, useRef, useState } from 'react';
import { screenPosition } from './BodyGeometry.mjs';
import type { FleetView, PointView } from './Protocol';
import { advanceJumpVisual, initialJumpVisual, jumpVisualParameters, wantsJumpPointOpen } from './JumpPointVisual.mjs';
import type { JumpVisualState } from './JumpPointVisual.mjs';

const assetRoot = '/game-assets/graphics/';
const sources = { ring: 'fx/wormhole_ring_bright3.png', ring2: 'fx/wormhole_ring_bright2.png', corona: 'fx/wormhole_corona.png',
  glow: 'fx/hit_glow.png', bands: 'fx/portal_textures_small.png', mask: 'fx/circle64.png', hyper: 'backgrounds/wormhole_dest_hyper.jpg', stars: 'backgrounds/wormhole_dest_stars2.jpg' };
type Textures = Record<keyof typeof sources, HTMLImageElement>;
let textureRequest: Promise<Textures> | undefined;
function loadTextures() {
  return textureRequest ??= Promise.all(Object.entries(sources).map(async ([key, path]) => {
    const image = new Image(); image.src = runtimeAssetUrl(assetRoot + path); await image.decode(); return [key, image] as const;
  })).then(entries => Object.fromEntries(entries) as Textures).catch(error => { textureRequest = undefined; throw error; });
}
function seed(id: string) { let value = 2166136261; for (const ch of id) value = Math.imul(value ^ ch.charCodeAt(0), 16777619); return () => { value ^= value << 13; value ^= value >>> 17; value ^= value << 5; return (value >>> 0) / 4294967296; }; }
function maskedDestination(images: Textures, space: 'hyper' | 'stars') {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!; ctx.drawImage(images.mask, 0, 0, 128, 128); ctx.globalCompositeOperation = 'source-in'; ctx.drawImage(images[space], 0, 0, 128, 128); return canvas;
}
function sprite(ctx: CanvasRenderingContext2D, image: CanvasImageSource, x: number, y: number, w: number, h: number, angle: number, alpha = 1) {
  if (alpha <= 0 || w <= 0 || h <= 0) return;
  ctx.save(); ctx.globalAlpha = Math.min(1, alpha); ctx.translate(x, y); ctx.rotate(angle); ctx.drawImage(image, -w / 2, -h / 2, w, h); ctx.restore();
}
type Vertex = [number, number, number, number];
/** Affine textured triangle. The source pattern repeats along the portal strip's V axis. */
function triangle(ctx: CanvasRenderingContext2D, pattern: CanvasPattern, p: Vertex, q: Vertex, r: Vertex) {
  const [x0, y0, u0, v0] = p, [x1, y1, u1, v1] = q, [x2, y2, u2, v2] = r;
  const du1 = u1 - u0, dv1 = v1 - v0, du2 = u2 - u0, dv2 = v2 - v0, determinant = du1 * dv2 - du2 * dv1;
  if (Math.abs(determinant) < 1e-8) return;
  const a = ((x1 - x0) * dv2 - (x2 - x0) * dv1) / determinant, b = ((y1 - y0) * dv2 - (y2 - y0) * dv1) / determinant;
  const c = ((x2 - x0) * du1 - (x1 - x0) * du2) / determinant, d = ((y2 - y0) * du1 - (y1 - y0) * du2) / determinant;
  ctx.save(); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.closePath(); ctx.clip();
  ctx.transform(a, b, c, d, x0 - a * u0 - c * v0, y0 - b * u0 - d * v0); ctx.fillStyle = pattern;
  const u = Math.min(u0, u1, u2), v = Math.min(v0, v1, v2); ctx.fillRect(u - 1, v - 1, Math.max(u0, u1, u2) - u + 2, Math.max(v0, v1, v2) - v + 2); ctx.restore();
}
class Portal {
  state: JumpVisualState;
  private random: () => number;
  private rings: { angle: number; elapsed: number; speed: number; rot: number }[];
  private coronas: { angle: number; elapsed: number; rot: number; degrees: number }[];
  private bands: { angle: number; wave: number; offsets: { value: number; rate: number; sign: number }[]; fluctuation: number }[];
  constructor(id: string, open: boolean) {
    this.state = initialJumpVisual(open); this.random = seed(id);
    const signed = () => this.random() < .5 ? -1 : 1;
    this.rings = Array.from({ length: 25 }, () => ({ angle: this.random() * 360, elapsed: this.random() * 1000, speed: (200 + this.random() * 100) * signed(), rot: (100 + this.random() * 100) * signed() }));
    this.coronas = Array.from({ length: 6 }, () => ({ angle: this.random() * 360, elapsed: this.random() * 1000, rot: (100 + this.random() * 100) * signed(), degrees: 200 + this.random() * 200 }));
    this.bands = Array.from({ length: 2 }, () => ({ angle: this.random() * 360, wave: this.random() * 360, offsets: [], fluctuation: -1 }));
  }
  draw(ctx: CanvasRenderingContext2D, images: Textures, pattern: CanvasPattern, radius: number, dt: number) {
    const p = jumpVisualParameters(radius, this.state.brightness), rad = Math.PI / 180, days = dt / 10;
    ctx.save(); ctx.scale(p.scale, p.scale);
    // Native GL SRC_ALPHA,ONE: Canvas 'lighter', not CSS screen/blur replacements.
    ctx.globalCompositeOperation = 'lighter';
    for (const c of this.coronas) {
      c.angle += c.rot * days * .5; c.elapsed += days * 2;
      const s = p.coronaSize * .8 * (1 + Math.sin(c.elapsed * c.degrees * rad) * .1);
      sprite(ctx, images.corona, Math.cos(c.elapsed * c.rot * rad) * 6, Math.sin(c.elapsed * c.rot * rad) * 6, s, s, c.angle * rad);
    }
    this.bands.forEach((band, index) => {
      band.angle += (index ? -5 : 5) * dt; band.wave += 100 * dt;
      const count = Math.max(3, Math.round(Math.PI * 2 * p.bandInnerRadius / p.pixelsPerSegment));
      if (band.fluctuation !== p.bandFluctuation) { band.offsets = []; band.fluctuation = p.bandFluctuation; }
      while (band.offsets.length < count) band.offsets.push({ value: 0, rate: p.bandFluctuation * (1 + this.random()), sign: this.random() < .5 ? -1 : 1 });
      band.offsets.length = count;
      for (const offset of band.offsets) { offset.value += dt * offset.rate * offset.sign; if (offset.value > p.bandFluctuation) offset.sign = -1; else if (offset.value < -p.bandFluctuation) offset.sign = 1; }
      if (p.bandAlpha <= 0) return;
      const repeats = Math.max(1, Math.round(p.pixelsPerSegment * 64 / 128 / p.bandWidth * count));
      const vertices = Array.from({ length: count + 1 }, (_, i) => {
        const angle = Math.PI * 2 * i / count, offset = band.offsets[i % count].value * Math.sin(angle * 10 + band.wave * rad);
        const inner = p.bandInnerRadius + offset, outer = inner + p.bandWidth, v = i / count * repeats * 128;
        return [[Math.cos(angle) * inner, Math.sin(angle) * inner, 0, v], [Math.cos(angle) * outer, Math.sin(angle) * outer, 64, v]] as [Vertex, Vertex];
      });
      ctx.save(); ctx.rotate(band.angle * rad); ctx.globalAlpha = p.bandAlpha;
      for (let i = 0; i < count; i++) { triangle(ctx, pattern, vertices[i][0], vertices[i][1], vertices[i + 1][0]); triangle(ctx, pattern, vertices[i + 1][0], vertices[i][1], vertices[i + 1][1]); }
      ctx.restore();
    });
    this.rings.forEach((ring, i) => {
      ring.elapsed += days; ring.angle += ring.rot * days;
      const s = Math.sin(ring.elapsed * ring.speed * rad), c = Math.cos(ring.elapsed * ring.speed * rad), size = (p.ringSize - p.ringStep * i) * .61;
      sprite(ctx, i % 2 ? images.ring : images.ring2, c * 2, s * 2, size * (1 + s * .25), size * (1 - s * .25), ring.angle * rad, p.open);
    });
    ctx.restore();
    // Closed white core is deliberately outside the shrinking portal transform.
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 2; i++) sprite(ctx, images.glow, 0, 0, p.glowSize, p.glowSize, this.rings[0].angle * rad, p.glowAlpha);
    ctx.restore();
  }
}
interface Props { center?: [number, number]; worldId: string; points: PointView[]; fleets: FleetView[]; fleet?: FleetView; zoom: number; hyperspace: boolean; gameSeconds: number; running: boolean }
export function JumpPointCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null), destinationRef = useRef<HTMLCanvasElement>(null), current = useRef(props);
  const [error, setError] = useState(false);
  useEffect(() => { current.current = props; }, [props]);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'), destinationCanvas = destinationRef.current, destinationContext = destinationCanvas?.getContext('2d'); if (!ctx || !destinationCanvas || !destinationContext) { setError(true); return; }
    let cancelled = false, raf = 0, lastTime: number | undefined, world = '', location = '', lastTickTime = -1, sampleAt = performance.now();
    const portals = new Map<string, Portal>();
    void loadTextures().then(images => {
      if (cancelled) return; canvas.dataset.ready = 'true';
      const strip = document.createElement('canvas'); strip.width = 64; strip.height = 128; strip.getContext('2d')!.drawImage(images.bands, 128, 0, 64, 128, 0, 0, 64, 128);
      const pattern = ctx.createPattern(strip, 'repeat')!;
      const hyper = maskedDestination(images, 'hyper'), stars = maskedDestination(images, 'stars');
      const frame = () => {
        if (cancelled) return;
        const p = current.current;
        if (world !== p.worldId || location !== (p.fleet?.locationId ?? '')) { portals.clear(); lastTime = undefined; lastTickTime = -1; world = p.worldId; location = p.fleet?.locationId ?? ''; }
        if (lastTickTime !== p.gameSeconds) { sampleAt = performance.now(); lastTickTime = p.gameSeconds; }
        // Bounded extrapolation smooths the 350ms projection cadence. Lost polling cannot advance forever.
        const time = p.gameSeconds + (p.running ? Math.min(.35, (performance.now() - sampleAt) / 1000) : 0);
        const dt = lastTime === undefined ? 0 : Math.max(0, time - lastTime); lastTime = Math.max(lastTime ?? time, time);
        const width = canvas.clientWidth, height = canvas.clientHeight, ratio = Math.min(2, window.devicePixelRatio || 1);
        if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) { canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); }
        if (destinationCanvas.width !== canvas.width || destinationCanvas.height !== canvas.height) { destinationCanvas.width = canvas.width; destinationCanvas.height = canvas.height; }
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
        destinationContext.setTransform(ratio, 0, 0, ratio, 0, 0); destinationContext.clearRect(0, 0, width, height);
        const ids = new Set(p.points.map(point => point.id)); for (const id of portals.keys()) if (!ids.has(id)) portals.delete(id);
        for (const point of p.points) {
          if (point.radius <= 0 || point.tags.includes('wormhole')) continue;
          const active = wantsJumpPointOpen(point, p.fleets, p.hyperspace);
          let portal = portals.get(point.id); if (!portal) { portal = new Portal(point.id, p.hyperspace || active); portals.set(point.id, portal); }
          portal.state = advanceJumpVisual(portal.state, active, dt);
          const [x, y] = screenPosition(point.position, p.center ?? p.fleet?.position ?? [0, 0], width, height, p.zoom);
          const extent = Math.max((point.radius + 70) * .5, point.radius * 4) * p.zoom;
          if (x < -extent || y < -extent || x > width + extent || y > height + extent) continue;
          const scale = jumpVisualParameters(point.radius, portal.state.brightness).scale;
          destinationContext.save(); destinationContext.translate(x, y); destinationContext.scale(p.zoom * scale, p.zoom * scale);
          sprite(destinationContext, p.hyperspace ? stars : hyper, 0, 0, point.radius * 1.2, point.radius * 1.2, 0); destinationContext.restore();
          ctx.save(); ctx.translate(x, y); ctx.scale(p.zoom, p.zoom); portal.draw(ctx, images, pattern, point.radius, Math.min(dt, .1)); ctx.restore();
        }
        canvas.dataset.openPoints = [...portals].filter(([, portal]) => portal.state.brightness > .99).map(([id]) => id).join(',');
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, []);
  return <><canvas className="campaign-jump-destinations" ref={destinationRef} aria-hidden="true" /><canvas className="campaign-jump-effects" ref={canvasRef} aria-hidden="true" />{error && <span className="campaign-effects-error" role="alert">跳跃点原版贴图加载失败，请刷新重试。</span>}</>;
}
