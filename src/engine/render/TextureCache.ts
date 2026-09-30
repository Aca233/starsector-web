import { ENGINE_EXHAUST_TEXTURES } from '../visual/EngineExhaust';
/**
 * 贴图资源与着色管线缓存池 (TextureCache)
 * 100% 还原 Starsector 原版 OpenGL glColor4ub / GL_MODULATE 贴图着色管线
 * 将官方灰度 Alpha 贴图 (如 engineflame32, glow64, beam_rough2_fringe, explosion0) 动态调制为真实 RGB 颜色
 */
import { createRenderCanvas, renderContext2D, imageWidth, imageHeight, type RenderCanvas, type RenderImage } from './RenderSurface';
import { assetResolver } from '../assets/AssetResolver';

export const ESSENTIAL_TEXTURE_URLS = [
  ...ENGINE_EXHAUST_TEXTURES,
  '/game-assets/graphics/fx/beamfringeb.png',
  '/game-assets/graphics/fx/beamcoreb.png',
  '/game-assets/graphics/hud/line8x8.png',
  '/game-assets/graphics/hud/holo_target.png',
  '/game-assets/graphics/fx/beam_laser_fringe.png',
  '/game-assets/graphics/fx/particlealpha32sq.png',
  '/game-assets/graphics/fx/muzzleflash32.1.png',
  '/game-assets/graphics/fx/beamfringe.png',
  '/game-assets/graphics/fx/beamcore.png',
  '/game-assets/graphics/fx/projtrail.png',
  '/game-assets/graphics/fx/projbody.png',
  '/game-assets/graphics/fx/explosion_ring0.png',
  '/game-assets/graphics/missiles/missile_harpoon.png',
  '/game-assets/graphics/fx/hit_glow.png',
  '/game-assets/graphics/backgrounds/background4.jpg',
  '/game-assets/graphics/terrain/nebula.png',
  '/game-assets/graphics/fx/shields256.png',
  '/game-assets/graphics/fx/shields128c.png',
  '/game-assets/graphics/fx/shields64.png',
  '/game-assets/graphics/fx/engineflame32.png',
  '/game-assets/graphics/fx/engineglow32.png',
  '/game-assets/graphics/fx/starburst_glow1.png',
  '/game-assets/graphics/fx/glow64.png',
  '/game-assets/graphics/fx/beam_rough2_fringe.png',
  '/game-assets/graphics/fx/beam_rough2_core.png',
  '/game-assets/graphics/fx/beam_laser_core.png',
  '/game-assets/graphics/fx/contrail64b.png',
  '/game-assets/graphics/fx/nebula_colorless.png',
  '/game-assets/graphics/fx/radial_fx.png',
  '/game-assets/graphics/fx/explosion0.png',
  '/game-assets/graphics/fx/explosion1.png',
  '/game-assets/graphics/fx/explosion2.png',
  '/game-assets/graphics/fx/explosion3.png',
  '/game-assets/graphics/fx/explosion4.png',
  '/game-assets/graphics/fx/explosion5.png',
  '/game-assets/graphics/fx/explosion6.png',
  '/game-assets/graphics/fx/emp_arcs.png',
  '/game-assets/graphics/damage/damage_cracks48_0_base.png',
  '/game-assets/graphics/damage/damage_cracks48_0_glow.png',
  '/game-assets/graphics/damage/damage_cracks48_1_base.png',
  '/game-assets/graphics/damage/damage_cracks48_1_glow.png',
  '/game-assets/graphics/damage/damage_burns48_0_base.png',
  '/game-assets/graphics/damage/damage_burns48_0_glow.png',
  '/game-assets/graphics/damage/damage_burns48_1_base.png',
  '/game-assets/graphics/damage/damage_burns48_1_glow.png',
  '/game-assets/graphics/damage/damage_holes48_0_base.png',
  '/game-assets/graphics/damage/damage_holes48_0_glow.png',
  '/game-assets/graphics/damage/damage_holes48_1_base.png',
  '/game-assets/graphics/damage/damage_holes48_1_glow.png',
  '/game-assets/graphics/hud/player_status_bg2.png',
  '/game-assets/graphics/hud/target_status_bg2.png',
  '/game-assets/graphics/hud/weapon_status_bg.png',
  '/game-assets/graphics/hud/bar_armor.png',
  '/game-assets/graphics/hud/bar_energy.png',
  '/game-assets/graphics/hud/weapons_bar_cooldown.png',
  '/game-assets/graphics/missiles/missile_torpedo.png',
  '/game-assets/graphics/asteroids/asteroid1.png',
  '/game-assets/graphics/asteroids/asteroid2.png',
  '/game-assets/graphics/asteroids/asteroid3.png',
  '/game-assets/graphics/asteroids/asteroid_big00.png',
  '/game-assets/graphics/icons/fleet0.png',
  '/game-assets/graphics/icons/fleet1.png',
  '/game-assets/graphics/icons/fleet2.png',
  '/game-assets/graphics/icons/fleet3.png',
  '/game-assets/graphics/icons/fleet_triangle.png',
  '/game-assets/graphics/icons/radar_circle.png',
  '/game-assets/graphics/missiles/shell_small.png'
] as const;

export class TextureCache {
  private static instance: TextureCache;
  private textureCache: Map<string, HTMLImageElement> = new Map();
  private tintedCache: Map<string, RenderCanvas> = new Map();
  private imageStates: Map<string, 'loading' | 'decoded' | 'failed'> = new Map();
  private readiness = new Map<string, Promise<HTMLImageElement>>();
  private bitmapImages = new Map<string, ImageBitmap>();
  private canvasBitmapImages = new Map<string, ImageBitmap>();
  private bitmapReadiness = new Map<string, Promise<ImageBitmap>>();
  private bitmapLoads = new Map<string, AbortController>();
  private bitmapGeneration = 0;

  public static getInstance(): TextureCache {
    if (!TextureCache.instance) {
      TextureCache.instance = new TextureCache();
    }
    return TextureCache.instance;
  }

  public async preloadEssentialTextures(): Promise<void> {
    await Promise.all(ESSENTIAL_TEXTURE_URLS.map((url) => this.waitForTextureImage(url)));
  }

  public waitForImage(url: string): Promise<HTMLImageElement> {
    const img = this.getImage(url);
    const state = this.getImageState(url);
    if (state === 'decoded' || (img.complete && img.naturalWidth > 0)) return Promise.resolve(img);
    if (state === 'failed') return Promise.reject(new Error(`Texture failed to load: ${url}`));
    const existing = this.readiness.get(url);
    if (existing) return existing;

    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      img.addEventListener('load', () => resolve(img), { once: true });
      img.addEventListener('error', () => reject(new Error(`Texture failed to load: ${url}`)), { once: true });
    });
    this.readiness.set(url, promise);
    return promise;
  }

  public getImage(url: string): HTMLImageElement {
    let img = this.textureCache.get(url);
    if (!img) {
      img = new Image();
      this.imageStates.set(url, 'loading');
      img.addEventListener('load', () => this.imageStates.set(url, 'decoded'), { once: true });
      img.addEventListener('error', () => this.imageStates.set(url, 'failed'), { once: true });
      img.src = assetResolver.url(url);
      this.textureCache.set(url, img);
    }
    return img;
  }

  /** Legacy DOM callers retain the HTMLImageElement API. Renderer code uses this
   * source API so no Image/document shim is needed in a dedicated worker. */
  public getTextureImage(url: string): RenderImage | null {
    if (typeof Image !== 'undefined') {
      const image = this.getImage(url);
      return image.complete && image.naturalWidth > 0 ? image : null;
    }
    void this.requestBitmap(url);
    return this.bitmapImages.get(url) ?? null;
  }

  /** Canvas2D samples premultiplied source pixels, unlike straight-alpha WebGL
   * uploads. Keeping distinct native decodes preserves edge filtering/masks. */
  public getCanvasImage(url: string): RenderImage | null {
    if (typeof Image !== 'undefined') return this.getTextureImage(url);
    void this.requestBitmap(url);
    return this.canvasBitmapImages.get(url) ?? null;
  }

  public waitForTextureImage(url: string): Promise<RenderImage> {
    return typeof Image !== 'undefined' ? this.waitForImage(url) : this.requestBitmap(url);
  }

  /** Preserve synchronous load-event callbacks on the existing DOM path.
   * Unsubscription also suppresses already queued bitmap promise callbacks. */
  public onImageReady(url: string, loaded: () => void, failed: () => void): () => void {
    let active = true;
    let removeListeners = () => {};
    const notify = (callback: () => void) => {
      if (!active) return;
      active = false; removeListeners(); callback();
    };
    const onLoad = () => notify(loaded);
    const onError = () => notify(failed);
    if (typeof Image !== 'undefined') {
      const image = this.getImage(url);
      image.addEventListener('load', onLoad, { once: true });
      image.addEventListener('error', onError, { once: true });
      removeListeners = () => { image.removeEventListener('load', onLoad); image.removeEventListener('error', onError); };
      if (image.complete && image.naturalWidth > 0) queueMicrotask(onLoad);
      else if (this.getImageState(url) === 'failed') queueMicrotask(onError);
      return () => { active = false; removeListeners(); };
    }
    void this.requestBitmap(url).then(onLoad, onError);
    return () => { active = false; };
  }

  private requestBitmap(url: string): Promise<ImageBitmap> {
    const existing = this.bitmapReadiness.get(url);
    if (existing) return existing;
    const generation = this.bitmapGeneration, abort = new AbortController();
    this.bitmapLoads.set(url, abort);
    this.imageStates.set(url, 'loading');
    const promise = (async () => {
      const response = await fetch(assetResolver.url(url), { signal: abort.signal });
      if (!response.ok) throw new Error('Texture failed to load: ' + url);
      // ImageBitmap uploads ignore WebGL UNPACK conversion flags. Decode straight
      // alpha with the source orientation, matching ordinary HTML image uploads.
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none', imageOrientation: 'none' });
      let canvasBitmap: ImageBitmap;
      try { canvasBitmap = await createImageBitmap(blob, { premultiplyAlpha: 'premultiply', imageOrientation: 'none' }); }
      catch (error) { bitmap.close(); throw error; }
      if (generation !== this.bitmapGeneration) {
        bitmap.close(); canvasBitmap.close(); throw new Error('Texture load disposed: ' + url);
      }
      this.canvasBitmapImages.set(url, canvasBitmap);
      this.bitmapImages.set(url, bitmap);
      this.imageStates.set(url, 'decoded');
      return bitmap;
    })().catch(error => {
      if (generation === this.bitmapGeneration) this.imageStates.set(url, 'failed');
      throw error;
    }).finally(() => {
      if (this.bitmapLoads.get(url) === abort) this.bitmapLoads.delete(url);
    });
    this.bitmapReadiness.set(url, promise);
    // A draw may initiate a load without awaiting it, just as DOM Image does.
    // Keep rejection observable to explicit waiters without an unhandled load.
    void promise.catch(() => {});
    return promise;
  }

  /** Worker shutdown only; do not invalidate the persistent DOM image cache. */
  public disposeBitmapImages(): void {
    this.bitmapGeneration++;
    for (const abort of this.bitmapLoads.values()) abort.abort();
    for (const bitmap of this.bitmapImages.values()) bitmap.close();
    for (const bitmap of this.canvasBitmapImages.values()) bitmap.close();
    for (const url of this.bitmapReadiness.keys()) this.imageStates.delete(url);
    this.bitmapLoads.clear(); this.bitmapImages.clear(); this.canvasBitmapImages.clear(); this.bitmapReadiness.clear();
    if (typeof Image === 'undefined') this.tintedCache.clear();
  }

  public getImageState(url: string): 'unrequested' | 'loading' | 'decoded' | 'failed' {
    return this.imageStates.get(url) ?? 'unrequested';
  }

  public clearTintedCache(): void {
    this.tintedCache.clear();
  }

  public getTintedImage(url: string, r: number, g: number, b: number): RenderCanvas | null {
    const baseImg = this.getCanvasImage(url);
    if (!baseImg) return null;

    const ri = Math.min(255, Math.max(0, Math.round(r)));
    const gi = Math.min(255, Math.max(0, Math.round(g)));
    const bi = Math.min(255, Math.max(0, Math.round(b)));

    const key = `${url}_${ri}_${gi}_${bi}`;
    const cached = this.tintedCache.get(key);
    if (cached) return cached;

    const w = imageWidth(baseImg);
    const h = imageHeight(baseImg);
    const canvas = createRenderCanvas();
    canvas.width = w;
    canvas.height = h;
    const ctx = renderContext2D(canvas, { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(baseImg, 0, 0);
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const rf = ri / 255;
    const gf = gi / 255;
    const bf = bi / 255;

    for (let i = 0; i < data.length; i += 4) {
      data[i] = (data[i] * rf) | 0;
      data[i + 1] = (data[i + 1] * gf) | 0;
      data[i + 2] = (data[i + 2] * bf) | 0;
    }
    ctx.putImageData(imgData, 0, 0);
    this.tintedCache.set(key, canvas);
    return canvas;
  }
}

export const textureCache = TextureCache.getInstance();
