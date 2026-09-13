import { textureCache } from '../TextureCache';

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
  private pending = new Set<string>();
  private whiteTexture: WebGLTexture;
  private transparentTexture: WebGLTexture;
  private uploads = 0;
  private invalidations = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.whiteTexture = this.createSolidTexture(255, 255, 255, 255);
    this.transparentTexture = this.createSolidTexture(0, 0, 0, 0);
  }

  public getWhiteTexture(): WebGLTexture { return this.whiteTexture; }

  public async preload(urls: readonly string[]): Promise<void> {
    await Promise.all(urls.map((url) => textureCache.waitForImage(url)));
    for (const url of urls) this.getTexture(url);
  }

  private textureKey(url: string, repeat: boolean, tint?: [number, number, number]): string {
    return `${url}|wrap=${repeat ? 'repeat' : 'clamp'}|filter=linear|mipmap=0${tint ? `|tint=${tint.join(',')}` : ''}`;
  }

  private shouldRepeat(url: string, forceRepeat: boolean): boolean {
    return forceRepeat || url.includes('beam') || url.includes('shields') || url.includes('contrail');
  }

  public getTexture(url: string, forceRepeat = false): WebGLTexture {
    const repeat = this.shouldRepeat(url, forceRepeat);
    const key = this.textureKey(url, repeat);
    const existing = this.textures.get(key);
    if (existing) return existing;

    const img = textureCache.getImage(url);
    if (img.complete && img.naturalWidth > 0) {
      const uploaded = this.uploadImage(img, repeat);
      this.textures.set(key, uploaded);
      return uploaded;
    }

    if (!this.pending.has(key)) {
      this.pending.add(key);
      const finish = () => {
        this.pending.delete(key);
        if (!img.complete || img.naturalWidth <= 0 || this.textures.has(key)) return;
        const uploaded = this.uploadImage(img, repeat);
        this.textures.set(key, uploaded);
      };
      img.addEventListener('load', finish, { once: true });
      img.addEventListener('error', () => this.pending.delete(key), { once: true });
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
    const repeat = this.shouldRepeat(url, forceRepeat);
    const key = this.textureKey(url, repeat, [ri, gi, bi]);
    const existing = this.textures.get(key);
    if (existing) return existing;

    const tinted = textureCache.getTintedImage(url, ri, gi, bi);
    if (tinted) {
      const uploaded = this.uploadCanvas(tinted, repeat);
      this.textures.set(key, uploaded);
      return uploaded;
    }
    return this.getTexture(url, forceRepeat);
  }

  public uploadCanvas(canvas: HTMLCanvasElement, repeat = false): WebGLTexture {
    const tex = this.gl.createTexture();
    if (!tex) throw new Error('Failed to create WebGL texture');
    this.bindAndConfigure(tex, repeat, () => this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, canvas));
    this.uploads++;
    return tex;
  }

  public uploadImage(img: HTMLImageElement, repeat = false): WebGLTexture {
    const tex = this.gl.createTexture();
    if (!tex) throw new Error('Failed to create WebGL texture');
    this.bindAndConfigure(tex, repeat, () => this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, img));
    this.uploads++;
    return tex;
  }

  private bindAndConfigure(tex: WebGLTexture, repeat: boolean, upload: () => void): void {
    const gl = this.gl;
    const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    upload();
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
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
    this.textures.clear();
    this.pending.clear();
    this.invalidations++;
  }

  public getStats(): TextureManagerStats {
    return { residentTextures: this.textures.size, pendingUploads: this.pending.size, uploads: this.uploads, invalidations: this.invalidations };
  }

  public dispose(): void {
    for (const texture of this.textures.values()) this.gl.deleteTexture(texture);
    this.textures.clear();
    this.pending.clear();
    this.gl.deleteTexture(this.whiteTexture);
    this.gl.deleteTexture(this.transparentTexture);
  }
}
