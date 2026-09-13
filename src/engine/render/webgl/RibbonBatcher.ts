import { WebGLShaderUtil } from './WebGLShaderUtil';
import { Vector2 } from '../../math/Vector2';
import { ContrailPoint } from '../../simulation/ContrailEngine';

const RIBBON_VS = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec2 a_uv;
layout(location = 2) in vec4 a_color;

uniform mat3 u_viewProj;

out vec2 v_uv;
out vec4 v_color;

void main() {
  vec3 clip = u_viewProj * vec3(a_pos, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_uv = a_uv;
  v_color = a_color;
}
`;

const RIBBON_FS = `#version 300 es
precision mediump float;

in vec2 v_uv;
in vec4 v_color;

uniform sampler2D u_texture;

out vec4 fragColor;

void main() {
  vec4 tex = texture(u_texture, v_uv);
  // 对齐原版 Starsector OpenGL GL_ALPHA / GL_MODULATE 贴图着色管线:
  // 当贴图为纯 Alpha 烟雾遮罩时，RGB 完整由顶点色彩 (v_color.rgb) 驱动，Alpha 经过平滑增强
  vec3 rgb = (tex.r + tex.g + tex.b > 0.05) ? (tex.rgb * v_color.rgb) : v_color.rgb;
  float density = min(1.0, tex.a * 1.5);
  fragColor = vec4(rgb, density * v_color.a);
}
`;

/**
 * 连续多边形缎带批渲染器 (1:1 对齐原版 ContrailEngine.java GL_TRIANGLE_STRIP)
 * 解决单矩形分段拼接导致的台阶状断裂与重叠锯齿，生成完全平滑、宽度连续插值的导弹真实烟雾尾迹
 */
export class RibbonBatcher {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;

  private uViewProjLoc: WebGLUniformLocation;
  private uTextureLoc: WebGLUniformLocation;

  // 顶点格式: pos(2), uv(2), color(4) = 8 floats per vertex
  private static readonly FLOATS_PER_VERTEX = 8;
  private static readonly MAX_VERTICES = 16384;
  private vertexData = new Float32Array(RibbonBatcher.MAX_VERTICES * RibbonBatcher.FLOATS_PER_VERTEX);
  private vertexCount = 0;

  private currentTexture: WebGLTexture | null = null;
  private currentBlendMode: 'NORMAL' | 'ADDITIVE' = 'NORMAL';
  public drawCalls = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = WebGLShaderUtil.createProgram(gl, RIBBON_VS, RIBBON_FS);
    this.uViewProjLoc = gl.getUniformLocation(this.program, 'u_viewProj')!;
    this.uTextureLoc = gl.getUniformLocation(this.program, 'u_texture')!;

    const vao = gl.createVertexArray();
    if (!vao) throw new Error('Failed to create Ribbon VAO');
    this.vao = vao;
    gl.bindVertexArray(this.vao);

    const vbo = gl.createBuffer();
    if (!vbo) throw new Error('Failed to create Ribbon VBO');
    this.vbo = vbo;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertexData.byteLength, gl.DYNAMIC_DRAW);

    const stride = RibbonBatcher.FLOATS_PER_VERTEX * 4;
    // a_pos (vec2) -> 0
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);

    // a_uv (vec2) -> 1
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 2 * 4);

    // a_color (vec4) -> 2
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 4 * 4);

    gl.bindVertexArray(null);
  }

  public begin(viewProj: Float32Array) {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.uniformMatrix3fv(this.uViewProjLoc, false, viewProj);
    gl.uniform1i(this.uTextureLoc, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.currentBlendMode = 'NORMAL';
    this.vertexCount = 0;
    this.currentTexture = null;
    this.drawCalls = 0;
  }

  public setBlendMode(mode: 'NORMAL' | 'ADDITIVE') {
    if (this.currentBlendMode === mode) return;
    this.flush();
    this.currentBlendMode = mode;
    const gl = this.gl;
    if (mode === 'ADDITIVE') {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    } else {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
  }

  public drawStrip(
    texture: WebGLTexture,
    points: ContrailPoint[],
    color: [number, number, number, number],
    blendMode: 'NORMAL' | 'GLOW'
  ) {
    if (points.length < 2) return;

    this.setBlendMode(blendMode === 'GLOW' ? 'ADDITIVE' : 'NORMAL');
    if (this.currentTexture !== texture) {
      this.flush();
      this.currentTexture = texture;
    }

    const n = points.length;
    const cr = color[0] / 255;
    const cg = color[1] / 255;
    const cb = color[2] / 255;
    const maxAlpha = color[3] / 255;

    // 1. 计算每个采样点处经过平滑的法向量 (垂直于航迹中心线)
    const normals: Vector2[] = new Array(n);
    for (let i = 0; i < n; i++) {
      let dx = 0;
      let dy = 0;
      if (i === 0) {
        dx = points[1].pos.x - points[0].pos.x;
        dy = points[1].pos.y - points[0].pos.y;
      } else if (i === n - 1) {
        dx = points[n - 1].pos.x - points[n - 2].pos.x;
        dy = points[n - 1].pos.y - points[n - 2].pos.y;
      } else {
        dx = points[i + 1].pos.x - points[i - 1].pos.x;
        dy = points[i + 1].pos.y - points[i - 1].pos.y;
      }
      const len = Math.hypot(dx, dy);
      if (len < 0.001) {
        normals[i] = i > 0 ? normals[i - 1] : new Vector2(0, 1);
      } else {
        // 顺时针旋转 90 度求法线: (-dy, dx) 对齐 ContrailEngine.java:103 Utils.Ô00000
        normals[i] = new Vector2(-dy / len, dx / len);
      }
    }

    // 2. 依次生成三角形面片 (每两点构建 1 个四边形 = 2 个三角形 = 6 顶点)
    for (let i = 0; i < n - 1; i++) {
      if (this.vertexCount + 6 >= RibbonBatcher.MAX_VERTICES) {
        this.flush();
      }

      const pA = points[i];
      const pB = points[i + 1];

      const normA = normals[i];
      const normB = normals[i + 1];

      const halfWidA = pA.currentWidth * 0.5;
      const halfWidB = pB.currentWidth * 0.5;

      const alphaA = pA.alpha * maxAlpha;
      const alphaB = pB.alpha * maxAlpha;

      // 左侧和右侧顶点坐标 (1:1 ContrailEngine.java:202-204)
      const aLeftX = pA.pos.x - normA.x * halfWidA;
      const aLeftY = pA.pos.y - normA.y * halfWidA;
      const aRightX = pA.pos.x + normA.x * halfWidA;
      const aRightY = pA.pos.y + normA.y * halfWidA;

      const bLeftX = pB.pos.x - normB.x * halfWidB;
      const bLeftY = pB.pos.y - normB.y * halfWidB;
      const bRightX = pB.pos.x + normB.x * halfWidB;
      const bRightY = pB.pos.y + normB.y * halfWidB;

      // Triangle 1: aLeft, aRight, bLeft
      this.emitVertex(aLeftX, aLeftY, pA.u, 0.01, cr, cg, cb, alphaA);
      this.emitVertex(aRightX, aRightY, pA.u, 0.99, cr, cg, cb, alphaA);
      this.emitVertex(bLeftX, bLeftY, pB.u, 0.01, cr, cg, cb, alphaB);

      // Triangle 2: bLeft, aRight, bRight
      this.emitVertex(bLeftX, bLeftY, pB.u, 0.01, cr, cg, cb, alphaB);
      this.emitVertex(aRightX, aRightY, pA.u, 0.99, cr, cg, cb, alphaA);
      this.emitVertex(bRightX, bRightY, pB.u, 0.99, cr, cg, cb, alphaB);
    }
  }

  /**
   * 1:1 远行星号原版幅能排散放射状能量光晕环 (严格对齐 com/fs/starfarer/renderers/float.java: o00000)
   * 采用内外两层双环四边形条带 (Quad Strip)，外环与内环边界顶点 Alpha 恒为 0.0，
   * 紧密贴合舰体轮廓，绝无任何方块边界瑕疵。
   */
  public drawRadialHalo(
    texture: WebGLTexture,
    centerPos: Vector2,
    facingRad: number,
    colRad: number,
    color: [number, number, number],
    alphaMult: number,
    scrollV: number
  ) {
    if (alphaMult <= 0.005) return;
    this.setBlendMode('ADDITIVE');
    if (this.currentTexture !== texture) {
      this.flush();
      this.currentTexture = texture;
    }

    const segments = 36;
    const stepRad = (Math.PI * 2) / segments;
    const cr = color[0] / 255;
    const cg = color[1] / 255;
    const cb = color[2] / 255;

    const innerBand = colRad * 0.22;
    const outerBand = colRad * 0.42;

    for (let i = 0; i < segments; i++) {
      if (this.vertexCount + 12 >= RibbonBatcher.MAX_VERTICES) {
        this.flush();
      }

      const angA = i * stepRad;
      const angB = (i + 1) * stepRad;

      // 舰体椭圆长短半轴轮廓
      const rxA = colRad * (angA > Math.PI * 0.5 && angA < Math.PI * 1.5 ? 0.58 : 0.75);
      const ryA = colRad * 0.5;
      const rA = Math.hypot(Math.cos(angA) * rxA, Math.sin(angA) * ryA);

      const rxB = colRad * (angB > Math.PI * 0.5 && angB < Math.PI * 1.5 ? 0.58 : 0.75);
      const ryB = colRad * 0.5;
      const rB = Math.hypot(Math.cos(angB) * rxB, Math.sin(angB) * ryB);

      const worldAngA = facingRad + angA;
      const worldAngB = facingRad + angB;

      const cosA = Math.cos(worldAngA);
      const sinA = Math.sin(worldAngA);
      const cosB = Math.cos(worldAngB);
      const sinB = Math.sin(worldAngB);

      // 内环顶点 (Alpha = 0.0)
      const inAx = centerPos.x + cosA * (rA - innerBand);
      const inAy = centerPos.y + sinA * (rA - innerBand);
      const inBx = centerPos.x + cosB * (rB - innerBand);
      const inBy = centerPos.y + sinB * (rB - innerBand);

      // 中环核心顶点 (Alpha = alphaMult)
      const midAx = centerPos.x + cosA * rA;
      const midAy = centerPos.y + sinA * rA;
      const midBx = centerPos.x + cosB * rB;
      const midBy = centerPos.y + sinB * rB;

      // 外环顶点 (Alpha = 0.0)
      const outAx = centerPos.x + cosA * (rA + outerBand);
      const outAy = centerPos.y + sinA * (rA + outerBand);
      const outBx = centerPos.x + cosB * (rB + outerBand);
      const outBy = centerPos.y + sinB * (rB + outerBand);

      const uA = i / segments;
      const uB = (i + 1) / segments;

      // 条带 1: 内环 -> 中环
      this.emitVertex(inAx, inAy, uA, -0.2 - scrollV, cr, cg, cb, 0.0);
      this.emitVertex(inBx, inBy, uB, -0.2 - scrollV, cr, cg, cb, 0.0);
      this.emitVertex(midAx, midAy, uA, 0.0 - scrollV, cr, cg, cb, alphaMult);

      this.emitVertex(inBx, inBy, uB, -0.2 - scrollV, cr, cg, cb, 0.0);
      this.emitVertex(midBx, midBy, uB, 0.0 - scrollV, cr, cg, cb, alphaMult);
      this.emitVertex(midAx, midAy, uA, 0.0 - scrollV, cr, cg, cb, alphaMult);

      // 条带 2: 中环 -> 外环
      this.emitVertex(midAx, midAy, uA, 0.0 - scrollV, cr, cg, cb, alphaMult);
      this.emitVertex(midBx, midBy, uB, 0.0 - scrollV, cr, cg, cb, alphaMult);
      this.emitVertex(outAx, outAy, uA, 1.0 - scrollV, cr, cg, cb, 0.0);

      this.emitVertex(midBx, midBy, uB, 0.0 - scrollV, cr, cg, cb, alphaMult);
      this.emitVertex(outBx, outBy, uB, 1.0 - scrollV, cr, cg, cb, 0.0);
      this.emitVertex(outAx, outAy, uA, 1.0 - scrollV, cr, cg, cb, 0.0);
    }
  }

  private emitVertex(
    x: number,
    y: number,
    u: number,
    v: number,
    r: number,
    g: number,
    b: number,
    a: number
  ) {
    const idx = this.vertexCount * RibbonBatcher.FLOATS_PER_VERTEX;
    const data = this.vertexData;
    data[idx] = x;
    data[idx + 1] = y;
    data[idx + 2] = u;
    data[idx + 3] = v;
    data[idx + 4] = r;
    data[idx + 5] = g;
    data[idx + 6] = b;
    data[idx + 7] = a;
    this.vertexCount++;
  }

  public flush() {
    if (this.vertexCount === 0 || !this.currentTexture) return;

    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.currentTexture);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      0,
      this.vertexData.subarray(0, this.vertexCount * RibbonBatcher.FLOATS_PER_VERTEX)
    );

    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    this.drawCalls++;
    this.vertexCount = 0;
  }

  public end() {
    this.flush();
    const gl = this.gl;
    gl.bindVertexArray(null);
    gl.useProgram(null);
  }

  public dispose() {
    this.gl.deleteBuffer(this.vbo);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
  }
}
