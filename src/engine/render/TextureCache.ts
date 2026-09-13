/**
 * 贴图资源与着色管线缓存池 (TextureCache)
 * 100% 还原 Starsector 原版 OpenGL glColor4ub / GL_MODULATE 贴图着色管线
 * 将官方灰度 Alpha 贴图 (如 engineflame32, glow64, beam_rough2_fringe, explosion0) 动态调制为真实 RGB 颜色
 */
export class TextureCache {
  private static instance: TextureCache;
  private textureCache: Map<string, HTMLImageElement> = new Map();
  private tintedCache: Map<string, HTMLCanvasElement> = new Map();

  public static getInstance(): TextureCache {
    if (!TextureCache.instance) {
      TextureCache.instance = new TextureCache();
    }
    return TextureCache.instance;
  }

  public preloadEssentialTextures() {
    const essentialUrls = [
      '/api/asset?path=graphics/fx/shields256.png',
      '/api/asset?path=graphics/fx/shields256ringd.png',
      '/api/asset?path=graphics/fx/engineflame32.png',
      '/api/asset?path=graphics/fx/glow64.png',
      '/api/asset?path=graphics/fx/beam_rough2_fringe.png',
      '/api/asset?path=graphics/fx/beam_core_high.png',
      '/api/asset?path=graphics/fx/beam_core_soft.png',
      '/api/asset?path=graphics/fx/contrail64b.png',
      '/api/asset?path=graphics/fx/explosion0.png',
      '/api/asset?path=graphics/fx/explosion1.png',
      '/api/asset?path=graphics/fx/explosion2.png',
      '/api/asset?path=graphics/fx/explosion3.png',
      '/api/asset?path=graphics/fx/explosion4.png',
      '/api/asset?path=graphics/fx/explosion5.png',
      '/api/asset?path=graphics/fx/explosion6.png',
      '/api/asset?path=graphics/fx/emp_arc.png',
      '/api/asset?path=graphics/fx/reticle2.png',
      '/api/asset?path=graphics/hud/player_status_bg2.png',
      '/api/asset?path=graphics/hud/target_status_bg.png',
      '/api/asset?path=graphics/hud/weapon_status_bg.png',
      '/api/asset?path=graphics/hud/bar_armor.png',
      '/api/asset?path=graphics/hud/bar_energy.png',
      '/api/asset?path=graphics/hud/weapons_bar_cooldown.png',
      '/api/asset?path=graphics/ships/broadsword.png',
      '/api/asset?path=graphics/ships/dagger_trp.png',
      '/api/asset?path=graphics/missiles/missile_torpedo.png',
      '/api/asset?path=graphics/asteroids/asteroid1.png',
      '/api/asset?path=graphics/asteroids/asteroid2.png',
      '/api/asset?path=graphics/asteroids/asteroid3.png',
      '/api/asset?path=graphics/asteroids/asteroid_big00.png',
      '/api/asset?path=graphics/icons/fleet0.png',
      '/api/asset?path=graphics/icons/fleet1.png',
      '/api/asset?path=graphics/icons/fleet2.png',
      '/api/asset?path=graphics/icons/fleet3.png',
      '/api/asset?path=graphics/icons/fleet_triangle.png',
      '/api/asset?path=graphics/icons/radar_circle.png',
      '/api/asset?path=graphics/missiles/shell_small.png'
    ];
    for (const url of essentialUrls) {
      this.getImage(url);
    }
  }

  public getImage(url: string): HTMLImageElement {
    let img = this.textureCache.get(url);
    if (!img) {
      img = new Image();
      img.src = url;
      this.textureCache.set(url, img);
    }
    return img;
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
