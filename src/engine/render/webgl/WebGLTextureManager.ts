import { textureCache } from '../TextureCache';
import { assetManager, type AssetManifestEntry } from '../../assets/AssetResolver';

export interface TextureManagerStats {
  residentTextures: number;
  pendingUploads: number;
  uploads: number;
  invalidations: number;
}

/** WebGL texture lifecycle with explicit pending/uploaded/invalidated states. */
export class WebGLTextureManager {
  private gl: WebGL2RenderingContext;
  private textures: Map<string, WebGLTexture> = new Map();
  private pending = new Map<string, { img: HTMLImageElement; onLoad: () => void; onError: () => void }>();
  private whiteTexture: WebGLTexture;
  private transparentTexture: WebGLTexture;
  private uploads = 0;
  private invalidations = 0;
  private generation = 0;
  private disposed = false;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.whiteTexture = this.createSolidTexture(255, 255, 255, 255);
    this.transparentTexture = this.createSolidTexture(0, 0, 0, 0);
  }

  public getWhiteTexture(): WebGLTexture { return this.whiteTexture; }

  public async preload(urls: readonly string[]): Promise<void> {
    const generation = this.generation;
    await Promise.all(urls.map((url) => textureCache.waitForImage(url)));
    if (this.disposed || generation !== this.generation) return;
    for (const url of urls) this.getTexture(url);
  }

  private samplerFor(url: string, forceRepeat: boolean): Required<NonNullable<AssetManifestEntry['sampler']>> {
    const sampler = assetManager.getByPath(url)?.sampler;
    return {
      wrap: forceRepeat ? 'repeat' : (sampler?.wrap ?? 'clamp'),
      minFilter: sampler?.minFilter ?? 'linear',
      magFilter: sampler?.magFilter ?? 'linear',
      mipmap: sampler?.mipmap ?? false
    };
  }

  private textureKey(url: string, sampler: Required<NonNullable<AssetManifestEntry['sampler']>>, tint?: [number, number, number]): string {
    return `${url}|wrap=${sampler.wrap}|min=${sampler.minFilter}|mag=${sampler.magFilter}|mipmap=${sampler.mipmap ? 1 : 0}${tint ? `|tint=${tint.join(',')}` : ''}`;
  }

  public getTexture(url: string, forceRepeat = false): WebGLTexture {
    if (this.disposed) return this.transparentTexture;
    const sampler = this.samplerFor(url, forceRepeat);
    const key = this.textureKey(url, sampler);
    const existing = this.textures.get(key);
    if (existing) return existing;

    const img = textureCache.getImage(url);
    if (img.complete && img.naturalWidth > 0) {
      const uploaded = this.uploadImage(img, sampler);
      this.textures.set(key, uploaded);
      return uploaded;
    }

    if (!this.pending.has(key)) {
      const generation = this.generation;
      const finish = () => {
        this.removePending(key);
        if (this.disposed || generation !== this.generation || !img.complete || img.naturalWidth <= 0 || this.textures.has(key)) return;
        const uploaded = this.uploadImage(img, sampler);
        this.textures.set(key, uploaded);
      };
      const fail = () => this.removePending(key);
      this.pending.set(key, { img, onLoad: finish, onError: fail });
      img.addEventListener('load', finish, { once: true });
      img.addEventListener('error', fail, { once: true });
    }
    return this.transparentTexture;
  }

  public getTextureInfo(url: string, forceRepeat = false): { texture: WebGLTexture; width: number; height: number } {
    const texture = this.getTexture(url, forceRepeat);
    const img = textureCache.getImage(url);
    return {
      texture,
      width: img.complete && img.naturalWidth > 0 ? img.naturalWidth : 0,
      height: img.complete && img.naturalHeight > 0 ? img.naturalHeight : 0
    };
  }

  public getTintedTexture(url: string, r: number, g: number, b: number, forceRepeat = false): WebGLTexture {
    const ri = Math.min(255, Math.max(0, Math.round(r)));
    const gi = Math.min(255, Math.max(0, Math.round(g)));
    const bi = Math.min(255, Math.max(0, Math.round(b)));
    if (this.disposed) return this.transparentTexture;
    const sampler = this.samplerFor(url, forceRepeat);
    const key = this.textureKey(url, sampler, [ri, gi, bi]);
    const existing = this.textures.get(key);
    if (existing) return existing;

    const tinted = textureCache.getTintedImage(url, ri, gi, bi);
    if (tinted) {
      const uploaded = this.uploadCanvas(tinted, sampler);
      this.textures.set(key, uploaded);
      return uploaded;
    }
    return this.getTexture(url, forceRepeat);
  }

  private uploadCanvas(canvas: HTMLCanvasElement, sampler: Required<NonNullable<AssetManifestEntry['sampler']>>): WebGLTexture {
    const tex = this.gl.createTexture();
    if (!tex) throw new Error('Failed to create WebGL texture');
    this.bindAndConfigure(tex, sampler, () => this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, canvas));
    this.uploads++;
    return tex;
  }

  private uploadImage(img: HTMLImageElement, sampler: Required<NonNullable<AssetManifestEntry['sampler']>>): WebGLTexture {
    const tex = this.gl.createTexture();
    if (!tex) throw new Error('Failed to create WebGL texture');
    this.bindAndConfigure(tex, sampler, () => this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, img));
    this.uploads++;
    return tex;
  }

  private bindAndConfigure(tex: WebGLTexture, sampler: Required<NonNullable<AssetManifestEntry['sampler']>>, upload: () => void): void {
    const gl = this.gl;
    const wrap = sampler.wrap === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    const minFilter = sampler.minFilter === 'nearest' ? gl.NEAREST : gl.LINEAR;
    const magFilter = sampler.magFilter === 'nearest' ? gl.NEAREST : gl.LINEAR;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    upload();
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);
    if (sampler.mipmap) gl.generateMipmap(gl.TEXTURE_2D);
  }

  private removePending(key: string): void {
    const pending = this.pending.get(key);
    if (!pending) return;
    pending.img.removeEventListener('load', pending.onLoad);
    pending.img.removeEventListener('error', pending.onError);
    this.pending.delete(key);
  }

  private cancelPending(): void {
    for (const key of [...this.pending.keys()]) this.removePending(key);
  }

  private createSolidTexture(r: number, g: number, b: number, a: number): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture();
    if (!tex) throw new Error('Failed to create solid texture');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([r, g, b, a]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return tex;
  }

  /** Called on context loss: GPU objects are already invalid, so do not delete them. */
  public invalidateGPU(): void {
    this.generation++;
    this.cancelPending();
    this.textures.clear();
    this.invalidations++;
  }

  public getStats(): TextureManagerStats {
    return { residentTextures: this.textures.size, pendingUploads: this.pending.size, uploads: this.uploads, invalidations: this.invalidations };
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    this.cancelPending();
    for (const texture of this.textures.values()) this.gl.deleteTexture(texture);
    this.textures.clear();
    this.gl.deleteTexture(this.whiteTexture);
    this.gl.deleteTexture(this.transparentTexture);
  }
}
