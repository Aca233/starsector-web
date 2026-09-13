import { WebGLTextureManager } from './WebGLTextureManager';
import { SpriteBatcher } from './SpriteBatcher';
import { RibbonBatcher } from './RibbonBatcher';
import { WebGLShieldShader } from './WebGLShieldShader';
import { Vector2 } from '../../math/Vector2';

export interface ViewportBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

/**
 * 共享 WebGL 渲染通道上下文 (WebGLPassContext)
 * 封装各独立渲染 Pass 所需的 GPU 批渲染器、贴图缓存、视口范围及插值参数。
 */
export interface WebGLPassContext {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  textures: WebGLTextureManager;
  batcher: SpriteBatcher;
  ribbonBatcher: RibbonBatcher;
  shieldShader: WebGLShieldShader;
  cameraPos: Vector2;
  zoom: number;
  alpha: number;
  viewport: ViewportBounds;
  whiteTex: WebGLTexture;
  hitGlowTex: WebGLTexture;
  glowTex: WebGLTexture;
}
