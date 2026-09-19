import { WebGLShaderUtil } from './WebGLShaderUtil';

/** Render fewer scene pixels without changing canvas/HUD size, camera FOV or mouse coordinates.
 * A fullscreen triangle also works with multisampled default framebuffers (scaled blits do not).
 */
export class RenderResolutionTarget {
  private texture: WebGLTexture | null = null;
  private framebuffer: WebGLFramebuffer | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private width = 0;
  private height = 0;
  private active = false;
  private failed = false;
  constructor(private readonly gl: WebGL2RenderingContext) {}

  begin(width: number, height: number, scale: number): void {
    const gl = this.gl;
    this.active = false;
    if (scale === 1) this.dispose();
    if (scale < 1 && !this.failed) {
      try {
        if (!this.program) {
          this.program = WebGLShaderUtil.createProgram(gl, `#version 300 es
            out vec2 uv;
            void main() {
              vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
              uv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
            }`, `#version 300 es
            precision mediump float;
            in vec2 uv; uniform sampler2D image; out vec4 color;
            void main() { color = vec4(texture(image, uv).rgb, 1.0); }`);
          for (const shader of gl.getAttachedShaders(this.program) ?? []) { gl.detachShader(this.program, shader); gl.deleteShader(shader); }
          this.vao = gl.createVertexArray();
          this.texture = gl.createTexture();
          this.framebuffer = gl.createFramebuffer();
          if (!this.vao || !this.texture || !this.framebuffer) throw new Error('Render target allocation failed');
        }
        const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        if (w !== this.width || h !== this.height) {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
          if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete render target');
          this.width = w; this.height = h;
        } else gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        // Never leave the attachment bound to a sampler while drawing into it.
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.viewport(0, 0, w, h);
        this.active = true;
        return;
      } catch (error) {
        console.warn('[Graphics] Reduced resolution unavailable; using native resolution.', error);
        this.dispose(); this.failed = true;
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
  }

  present(width: number, height: number): void {
    if (!this.active) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(gl.getUniformLocation(this.program!, 'image'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindVertexArray(null);
    gl.useProgram(null);
    gl.enable(gl.BLEND);
  }

  get drawCalls(): number { return this.active ? 1 : 0; }

  dispose(): void {
    const gl = this.gl;
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.framebuffer) gl.deleteFramebuffer(this.framebuffer);
    if (this.program) gl.deleteProgram(this.program);
    if (this.vao) gl.deleteVertexArray(this.vao);
    this.texture = null; this.framebuffer = null; this.program = null; this.vao = null;
    this.width = 0; this.height = 0; this.active = false;
  }
}
