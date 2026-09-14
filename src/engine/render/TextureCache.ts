/**
 * 贴图资源与着色管线缓存池 (TextureCache)
 * 100% 还原 Starsector 原版 OpenGL glColor4ub / GL_MODULATE 贴图着色管线
 * 将官方灰度 Alpha 贴图 (如 engineflame32, glow64, beam_rough2_fringe, explosion0) 动态调制为真实 RGB 颜色
 */
import { assetResolver } from '../assets/AssetResolver';

export const ESSENTIAL_TEXTURE_URLS = [
  '/game-assets/graphics/backgrounds/background1.jpg',
  '/game-assets/graphics/terrain/nebula_amber.png',
  '/game-assets/graphics/terrain/nebula512_blue.png',
  '/game-assets/graphics/fx/shields256.png',
  '/game-assets/graphics/fx/shields256ringd.png',
  '/game-assets/graphics/fx/engineflame32.png',
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
  '/game-assets/graphics/hud/player_status_bg2.png',
  '/game-assets/graphics/hud/target_status_bg2.png',
  '/game-assets/graphics/hud/weapon_status_bg.png',
  '/game-assets/graphics/hud/bar_armor.png',
  '/game-assets/graphics/hud/bar_energy.png',
  '/game-assets/graphics/hud/weapons_bar_cooldown.png',
  '/game-assets/graphics/ships/broadsword.png',
  '/game-assets/graphics/ships/dagger_trp.png',
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
  private tintedCache: Map<string, HTMLCanvasElement> = new Map();
  private imageStates: Map<string, 'loading' | 'decoded' | 'failed'> = new Map();
  private readiness = new Map<string, Promise<HTMLImageElement>>();

  public static getInstance(): TextureCache {
    if (!TextureCache.instance) {
      TextureCache.instance = new TextureCache();
    }
    return TextureCache.instance;
  }

  public async preloadEssentialTextures(): Promise<void> {
    await Promise.all(ESSENTIAL_TEXTURE_URLS.map((url) => this.waitForImage(url)));
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

  public getImageState(url: string): 'unrequested' | 'loading' | 'decoded' | 'failed' {
    return this.imageStates.get(url) ?? 'unrequested';
  }

  public clearTintedCache(): void {
    this.tintedCache.clear();
  }

  public getTintedImage(url: string, r: number, g: number, b: number): HTMLCanvasElement | null {
    const baseImg = this.getImage(url);
    if (!baseImg.complete || baseImg.naturalWidth === 0) return null;

    const ri = Math.min(255, Math.max(0, Math.round(r)));
    const gi = Math.min(255, Math.max(0, Math.round(g)));
    const bi = Math.min(255, Math.max(0, Math.round(b)));

    const key = `${url}_${ri}_${gi}_${bi}`;
    const cached = this.tintedCache.get(key);
    if (cached) return cached;

    const w = baseImg.naturalWidth;
    const h = baseImg.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
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
