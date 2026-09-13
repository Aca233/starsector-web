import { textureCache } from '../TextureCache';

/**
 * WebGL 贴图显存池与上传管理器
 */
export class WebGLTextureManager {
  private gl: WebGL2RenderingContext;
  private textures: Map<string, WebGLTexture> = new Map();
  private whiteTexture: WebGLTexture;
  private transparentTexture: WebGLTexture;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.whiteTexture = this.createSolidTexture(255, 255, 255, 255);
    this.transparentTexture = this.createSolidTexture(0, 0, 0, 0);
  }

  public getWhiteTexture(): WebGLTexture {
    return this.whiteTexture;
  }

  public getTexture(url: string, forceRepeat: boolean = false): WebGLTexture {
    let tex = this.textures.get(url);
    if (tex) return tex;

    const isRepeat = forceRepeat || url.includes('beam') || url.includes('shields') || url.includes('contrail');
    const img = textureCache.getImage(url);
    if (img.complete && img.naturalWidth > 0) {
      tex = this.uploadImage(img, isRepeat);
      this.textures.set(url, tex);
      return tex;
    }

    // 若图片仍在异步网络加载中，先返回 1x1 全透明占位贴图，并挂载 onload 自动同步至显存，防止白块闪烁
    const placeholder = this.transparentTexture;
    const origOnload = img.onload;
    img.onload = (ev) => {
      if (origOnload) (origOnload as any).call(img, ev);
      const uploaded = this.uploadImage(img, isRepeat);
      this.textures.set(url, uploaded);
    };
    return placeholder;
  }

  public getTextureInfo(url: string, forceRepeat: boolean = false): { texture: WebGLTexture; width: number; height: number } {
    const texture = this.getTexture(url, forceRepeat);
    const img = textureCache.getImage(url);
    const width = (img && img.complete && img.naturalWidth > 0) ? img.naturalWidth : 0;
    const height = (img && img.complete && img.naturalHeight > 0) ? img.naturalHeight : 0;
    return { texture, width, height };
  }

  public getTintedTexture(url: string, r: number, g: number, b: number, forceRepeat: boolean = false): WebGLTexture {
    const ri = Math.min(255, Math.max(0, Math.round(r)));
    const gi = Math.min(255, Math.max(0, Math.round(g)));
    const bi = Math.min(255, Math.max(0, Math.round(b)));
    const key = `${url}_${ri}_${gi}_${bi}`;

    let tex = this.textures.get(key);
    if (tex) return tex;

    const isRepeat = forceRepeat || url.includes('beam') || url.includes('shields') || url.includes('contrail');
    const tintedCanvas = textureCache.getTintedImage(url, ri, gi, bi);
    if (tintedCanvas) {
      tex = this.uploadCanvas(tintedCanvas, isRepeat);
      this.textures.set(key, tex);
      return tex;
    }

    return this.getTexture(url, forceRepeat);
  }

  public uploadCanvas(canvas: HTMLCanvasElement, repeat: boolean = false): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture();
    if (!tex) throw new Error('Failed to create WebGL texture');

    const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  public uploadImage(img: HTMLImageElement, repeat: boolean = false): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture();
    if (!tex) throw new Error('Failed to create WebGL texture');

    const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  private createSolidTexture(r: number, g: number, b: number, a: number): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture();
    if (!tex) throw new Error('Failed to create solid texture');

    gl.bindTexture(gl.TEXTURE_2D, tex);
    const pixel = new Uint8Array([r, g, b, a]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return tex;
  }
}
