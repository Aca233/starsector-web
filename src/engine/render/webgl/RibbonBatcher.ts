import type { EmpArc } from '../../simulation/CombatTypes';
import type { Beam } from '../../simulation/Weapon';
import { beamStripAlpha } from '../../visual/BeamVisuals';
import { WebGLShaderUtil } from './WebGLShaderUtil';
import { Vector2 } from '../../math/Vector2';
import { ContrailPoint } from '../../simulation/ContrailEngine';
import type { ShipSpec } from '../../content/ShipSpec';
import { getVentTargetingRadius } from '../../visual/VentingVisuals';

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
uniform float u_alphaDensityScale;

out vec4 fragColor;

void main() {
  vec4 tex = texture(u_texture, v_uv);
  // GL_MODULATE multiplies the sampled RGB; dark texels are not replaced by white.
  vec3 rgb = tex.rgb * v_color.rgb;
  float density = min(1.0, tex.a * u_alphaDensityScale);
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
  private ebo: WebGLBuffer;

  private uViewProjLoc: WebGLUniformLocation;
  private uTextureLoc: WebGLUniformLocation;
  private uAlphaDensityScaleLoc: WebGLUniformLocation;

  // 顶点格式: pos(2), uv(2), color(4) = 8 floats per vertex
  private static readonly FLOATS_PER_VERTEX = 8;
  private static readonly MAX_VERTICES = 16384;
  private vertexData = new Float32Array(RibbonBatcher.MAX_VERTICES * RibbonBatcher.FLOATS_PER_VERTEX);
  private vertexCount = 0;
  // Two shared vertices per contrail point; fixed restart separates independent strips.
  // MAX_VERTICES remains below the Uint16 restart index (0xffff).
  private indexData = new Uint16Array(RibbonBatcher.MAX_VERTICES * 2);
  private indexCount = 0;
  private indexedStrip = false;

  private currentTexture: WebGLTexture | null = null;
  private currentBlendMode: 'NORMAL' | 'ADDITIVE' = 'NORMAL';
  private currentAlphaDensityScale = 1;
  public drawCalls = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = WebGLShaderUtil.createProgram(gl, RIBBON_VS, RIBBON_FS);
    this.uViewProjLoc = gl.getUniformLocation(this.program, 'u_viewProj')!;
    this.uTextureLoc = gl.getUniformLocation(this.program, 'u_texture')!;
    this.uAlphaDensityScaleLoc = gl.getUniformLocation(this.program, 'u_alphaDensityScale')!;

    const vao = gl.createVertexArray();
    if (!vao) throw new Error('Failed to create Ribbon VAO');
    this.vao = vao;
    gl.bindVertexArray(this.vao);

    const vbo = gl.createBuffer();
    if (!vbo) throw new Error('Failed to create Ribbon VBO');
    this.vbo = vbo;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertexData.byteLength, gl.DYNAMIC_DRAW);

    const ebo = gl.createBuffer();
    if (!ebo) throw new Error('Failed to create Ribbon EBO');
    this.ebo = ebo;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indexData.byteLength, gl.DYNAMIC_DRAW);

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
    this.currentAlphaDensityScale = 1;
    gl.uniform1f(this.uAlphaDensityScaleLoc, this.currentAlphaDensityScale);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.currentBlendMode = 'NORMAL';
    this.vertexCount = 0;
    this.indexCount = 0;
    this.indexedStrip = false;
    this.currentTexture = null;
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

  public setAlphaDensityScale(scale: number) {
    const next = Math.max(0, scale);
    if (Math.abs(this.currentAlphaDensityScale - next) < 1e-6) return;
    this.flush();
    this.currentAlphaDensityScale = next;
    this.gl.uniform1f(this.uAlphaDensityScaleLoc, next);
  }

  /** D$oo default EMP mesh: parallel cross-sections, not per-segment rectangles.
   * Core is fixed 15 units; source glow disks are rendered by the FX pass. */
  public drawNativeEmpArc(fringeTexture: WebGLTexture, coreTexture: WebGLTexture, arc: EmpArc): void {
    const state = arc.native;
    if (!state || state.brightness <= 0) return;
    const dx = arc.endPos.x - arc.startPos.x, dy = arc.endPos.y - arc.startPos.y;
    const distance = Math.hypot(dx, dy), angle = Math.atan2(dy, dx);
    const c = Math.cos(angle), sn = Math.sin(angle), scale = distance / Math.max(1, state.length);
    this.setBlendMode('ADDITIVE');
    this.setAlphaDensityScale(1);
    const layer = (texture: WebGLTexture, color: [number, number, number, number], width: number, core: boolean) => {
      if (this.currentTexture !== texture) { this.flush(); this.currentTexture = texture; }
      const alpha = Math.trunc(color[3] * state.brightness) / 255;
      const emit = (index: number, side: number) => {
        const point = state.points[index], x = point.x * scale, y = point.y + side * width / 2;
        const last = index === state.points.length - 1 && state.points.length > 10;
        // D$oo retains the fringe's last point when starting the core UV accumulator.
        const u = (point.x - (core ? state.length : 0)) / 128;
        this.emitVertex(arc.startPos.x + c * x - sn * y, arc.startPos.y + sn * x + c * y,
          u, side < 0 ? 0 : 1, color[0] / 255, color[1] / 255, color[2] / 255, last ? 0 : alpha);
      };
      for (let i = 1; i < state.points.length; i++) {
        if (this.vertexCount + 6 > RibbonBatcher.MAX_VERTICES) this.flush();
        emit(i - 1, -1); emit(i - 1, 1); emit(i, -1);
        emit(i, -1); emit(i - 1, 1); emit(i, 1);
      }
    };
    layer(fringeTexture, state.fringe, arc.thickness, false);
    layer(coreTexture, state.core, 15, true);
  }

  /** BeamWeaponRay -> renderers/L: asymmetric ends, pointed fringe muzzle,
   * separate core width, source UVs and byte-quantized intensity-squared alpha.
   * This is NOT the N.java MovingRay mesh used for ballistic-as-beam shots.
   */
  public drawBeam(fringeTexture: WebGLTexture, coreTexture: WebGLTexture,
    from: Vector2, to: Vector2, beam: Beam): void {
    const dx = to.x - from.x, dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    const brightness = beam.brightness ?? 1;
    const width = beam.width * brightness;
    if (length <= 0 || width <= 0 || brightness <= 0) return;
    const dirX = dx / length, dirY = dy / length;
    const cap = width * (beam.darkCore ? 0.75 : 1 / 3);
    const span = 128 * Math.max(0.001, beam.pixelsPerTexel ?? 1);
    const repeat = (length - cap * 2) / span;
    const bodyEnd = length - cap / 2;
    const rawPhase = -beam.elapsedTime * (beam.textureScrollSpeed ?? 64) / 128;
    const wrap = (value: number) => value - Math.floor(value);
    this.setAlphaDensityScale(1);
    const drawLayer = (texture: WebGLTexture, color: [number, number, number, number],
      core: boolean, phase: number, iterations: number) => {
      this.setBlendMode(core && beam.darkCore ? 'NORMAL' : 'ADDITIVE');
      if (this.currentTexture !== texture) { this.flush(); this.currentTexture = texture; }
      const hw = width * (core ? (beam.coreWidthMult ?? 1) : 1) / 2;
      const a = beamStripAlpha(brightness, color[3]);
      const emit = (along: number, side: number, u: number, v: number, alpha: number) => {
        this.emitVertex(from.x + dirX * along - dirY * side * hw,
          from.y + dirY * along + dirX * side * hw,
          u, v, color[0] / 255, color[1] / 255, color[2] / 255, alpha);
      };
      const quad = (start: number, end: number, u0: number, u1: number, a0: number, a1: number) => {
        emit(start, -1, u0, 0, a0); emit(start, 1, u0, 1, a0); emit(end, -1, u1, 0, a1);
        emit(end, -1, u1, 0, a1); emit(start, 1, u0, 1, a0); emit(end, 1, u1, 1, a1);
      };
      for (let i = 0; i < iterations; i++) {
        if (this.vertexCount + 18 >= RibbonBatcher.MAX_VERTICES) this.flush();
        const tipLength = core ? cap : width - cap / 2;
        const tipUvLength = (core ? cap : width) / span;
        quad(bodyEnd, bodyEnd + tipLength, phase + repeat, phase + repeat + tipUvLength, a, 0);
        quad(cap, bodyEnd, phase, phase + repeat, a, a);
        if (core) quad(cap, 0, phase, phase - cap / span, a, 0);
        else {
          // L's two full-alpha triangles converge behind the muzzle; no extra glow sprite.
          emit(cap, -1, phase, 0, a); emit(cap, 0, phase, 0.5, a); emit(-cap, 0, phase - 2 * cap / span, 0, a);
          emit(cap, 1, phase, 1, a); emit(cap, 0, phase, 0.5, a); emit(-cap, 0, phase - 2 * cap / span, 1, a);
        }
      }
    };
    drawLayer(fringeTexture, beam.fringeColor ?? [...beam.color, 255], false,
      wrap(rawPhase * (beam.fringeScrollSpeedMult ?? 1)), beam.darkCore ? (beam.darkFringeIter ?? 1) : 1);
    drawLayer(coreTexture, beam.coreColor ?? [255, 255, 255, 255], true,
      wrap(rawPhase), beam.darkCore ? (beam.darkCoreIter ?? 1) : 1);
  }

  /**
   * Source-faithful no-bullet-sprite path from com.fs.starfarer.renderers.N.o00000().
   * BALLISTIC_AS_BEAM is a pair of tapered triangle fans, not a rectangular beam:
   * the fringe fades to half-width transparent tips and the hot core is drawn twice.
   */
  public drawMovingRayPulse(
    fringeTexture: WebGLTexture,
    coreTexture: WebGLTexture,
    head: Vector2,
    tail: Vector2,
    width: number,
    fringeColor: [number, number, number, number],
    coreColor: [number, number, number, number],
    brightness: number,
    texturePhase: number
  ) {
    const dx = tail.x - head.x;
    const dy = tail.y - head.y;
    const length = Math.hypot(dx, dy);
    if (length <= 0.1 || width <= 0 || brightness <= 0) return;

    const dirX = dx / length;
    const dirY = dy / length;
    const halfWidth = width * 0.5;
    const offX = -dirY * halfWidth;
    const offY = dirX * halfWidth;
    const capLength = Math.max(halfWidth, length * 0.2);
    const uHead = texturePhase;
    const uTail = uHead + length / 128.0;
    const uFront = uHead - capLength / 128.0;
    const b = Math.max(0, Math.min(1, brightness));
    const mainAlpha = b * b;

    const fringeMain = [fringeColor[0] / 255, fringeColor[1] / 255, fringeColor[2] / 255, (fringeColor[3] / 255) * mainAlpha] as const;
    const fringeHalf = [fringeMain[0], fringeMain[1], fringeMain[2], (fringeColor[3] / 255) * b * 0.5] as const;
    const fringeClear = [fringeMain[0], fringeMain[1], fringeMain[2], 0] as const;
    const coreMain = [coreColor[0] / 255, coreColor[1] / 255, coreColor[2] / 255, (coreColor[3] / 255) * mainAlpha] as const;
    const coreHalf = [coreMain[0], coreMain[1], coreMain[2], (coreColor[3] / 255) * b * 0.5] as const;
    const clear = [0, 0, 0, 0] as const;

    type V = readonly [number, number, number, number, number, number, number, number];
    const vertex = (x: number, y: number, u: number, v: number, color: readonly [number, number, number, number]): V =>
      [x, y, u, v, color[0], color[1], color[2], color[3]];
    const emitFan = (texture: WebGLTexture, center: V, rim: readonly V[]) => {
      if (this.currentTexture !== texture) {
        this.flush();
        this.currentTexture = texture;
      }
      for (let i = 0; i < rim.length - 1; i++) {
        if (this.vertexCount + 3 >= RibbonBatcher.MAX_VERTICES) this.flush();
        const a = rim[i];
        const c = rim[i + 1];
        this.emitVertex(center[0], center[1], center[2], center[3], center[4], center[5], center[6], center[7]);
        this.emitVertex(a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7]);
        this.emitVertex(c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7]);
      }
    };

    const headLeftX = head.x - offX;
    const headLeftY = head.y - offY;
    const headRightX = head.x + offX;
    const headRightY = head.y + offY;
    const tailLeftX = tail.x - offX * 0.5;
    const tailLeftY = tail.y - offY * 0.5;
    const tailRightX = tail.x + offX * 0.5;
    const tailRightY = tail.y + offY * 0.5;
    const frontX = head.x - dirX * capLength;
    const frontY = head.y - dirY * capLength;
    const frontLeftX = frontX - offX * 0.5;
    const frontLeftY = frontY - offY * 0.5;
    const frontRightX = frontX + offX * 0.5;
    const frontRightY = frontY + offY * 0.5;
    const bodyCenterX = (head.x + tail.x) * 0.5;
    const bodyCenterY = (head.y + tail.y) * 0.5;
    const frontCenterX = (frontX + head.x) * 0.5;
    const frontCenterY = (frontY + head.y) * 0.5;

    this.setBlendMode('ADDITIVE');
    // Contrail rendering intentionally boosts mask density; source projectile rendering does not.
    this.setAlphaDensityScale(1.0);

    const drawPair = (
      texture: WebGLTexture,
      main: readonly [number, number, number, number],
      half: readonly [number, number, number, number],
      transparent: readonly [number, number, number, number]
    ) => {
      emitFan(
        texture,
        vertex(bodyCenterX, bodyCenterY, (uTail + uHead) * 0.5, 0.5, half),
        [
          vertex(headLeftX, headLeftY, uHead, 0, main),
          vertex(headRightX, headRightY, uHead, 1, main),
          vertex(tailRightX, tailRightY, uTail, 1, transparent),
          vertex(tailLeftX, tailLeftY, uTail, 0, transparent),
          vertex(headLeftX, headLeftY, uHead, 0, main)
        ]
      );
      emitFan(
        texture,
        vertex(frontCenterX, frontCenterY, (uFront + uHead) * 0.5, 0.5, half),
        [
          vertex(frontLeftX, frontLeftY, uFront, 0, transparent),
          vertex(frontRightX, frontRightY, uFront, 1, transparent),
          vertex(headRightX, headRightY, uHead, 1, main),
          vertex(headLeftX, headLeftY, uHead, 0, main),
          vertex(frontLeftX, frontLeftY, uFront, 0, transparent)
        ]
      );
    };

    drawPair(fringeTexture, fringeMain, fringeHalf, fringeClear);
    // Original N.java intentionally draws the projectile body/core twice.
    drawPair(coreTexture, coreMain, coreHalf, clear);
    drawPair(coreTexture, coreMain, coreHalf, clear);
  }

  /** N.java's textured-bullet branch: additive aspect-correct nose and a
   * transparent-tip/head/transparent-tail fringe. No second body texture. */
  public drawBallisticProjectile(bulletTexture: WebGLTexture, fringeTexture: WebGLTexture,
    head: Vector2, tail: Vector2, width: number, noseLength: number, coreWidth: number,
    fringe: readonly number[], core: readonly number[], brightness: number, phase: number): void {
    const dx = tail.x - head.x, dy = tail.y - head.y, length = Math.hypot(dx, dy);
    if (length <= .1 || width <= 0 || brightness <= 0) return;
    const backX = dx / length, backY = dy / length;
    const ox = -backY * width / 2, oy = backX * width / 2;
    const tip = new Vector2(head.x - backX * noseLength, head.y - backY * noseLength);
    const alpha = Math.floor(255 * Math.pow(Math.floor(Math.min(1, brightness) * 255) / 255, 2)) / 255;
    type Vertex = readonly [number, number, number, number, number, number, number, number];
    const v = (p: Vector2, side: number, u: number, t: number, color: readonly number[], a: number): Vertex =>
      [p.x + ox * side, p.y + oy * side, u, t, color[0] / 255, color[1] / 255, color[2] / 255, (color[3] ?? 255) / 255 * a];
    const strip = (texture: WebGLTexture, vertices: Vertex[]) => {
      if (this.currentTexture !== texture) { this.flush(); this.currentTexture = texture; }
      for (let i = 0; i < vertices.length - 2; i++) {
        if (this.vertexCount + 3 >= RibbonBatcher.MAX_VERTICES) this.flush();
        for (const vertex of [vertices[i], vertices[i + 1], vertices[i + 2]]) this.emitVertex(...vertex);
      }
    };
    this.setBlendMode('ADDITIVE');
    strip(bulletTexture, [v(tip, -coreWidth, 0, 1, core, alpha), v(tip, coreWidth, 1, 1, core, alpha),
      v(head, -coreWidth, 0, 0, core, alpha), v(head, coreWidth, 1, 0, core, alpha)]);
    strip(fringeTexture, [v(tip, -1, phase - noseLength / 128, 0, fringe, 0), v(tip, 1, phase - noseLength / 128, 1, fringe, 0),
      v(head, -1, phase, 0, fringe, alpha), v(head, 1, phase, 1, fringe, alpha),
      v(tail, -1, phase + length / 128, 0, fringe, 0), v(tail, 1, phase + length / 128, 1, fringe, 0)]);
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

    if (!this.indexedStrip) {
      this.flush();
      this.indexedStrip = true;
    }
    // Leave room for at least one complete segment plus a restart separator.
    if (this.vertexCount + 4 > RibbonBatcher.MAX_VERTICES || this.indexCount + 5 > this.indexData.length) {
      this.flush();
    }
    if (this.indexCount > 0) this.indexData[this.indexCount++] = 0xffff;

    let normalX = 0;
    let normalY = 1;
    for (let i = 0; i < n; i++) {
      const before = points[i === 0 ? 0 : i - 1];
      const after = points[i === n - 1 ? n - 1 : i + 1];
      const dx = after.pos.x - before.pos.x;
      const dy = after.pos.y - before.pos.y;
      const len = Math.hypot(dx, dy);
      // Keep the previous normal for repeated points, including the original (0, 1) fallback.
      if (!(len < 0.001)) {
        normalX = -dy / len;
        normalY = dx / len;
      }

      if (this.vertexCount + 2 > RibbonBatcher.MAX_VERTICES || this.indexCount + 2 > this.indexData.length) {
        // Carry the previous endpoint across a full buffer. It starts, rather than
        // repeats, the next segment; restarting at an even vertex preserves winding.
        const previousPair = (this.vertexCount - 2) * RibbonBatcher.FLOATS_PER_VERTEX;
        this.flush();
        this.vertexData.copyWithin(0, previousPair, previousPair + 16);
        this.vertexCount = 2;
        this.indexData[0] = 0;
        this.indexData[1] = 1;
        this.indexCount = 2;
      }

      const p = points[i];
      const halfWidth = p.currentWidth * 0.5;
      const alpha = p.alpha * maxAlpha;
      const vertex = this.vertexCount;
      const offset = vertex * RibbonBatcher.FLOATS_PER_VERTEX;
      const data = this.vertexData;
      data[offset] = p.pos.x - normalX * halfWidth;
      data[offset + 1] = p.pos.y - normalY * halfWidth;
      data[offset + 2] = p.u;
      data[offset + 3] = 0.01;
      data[offset + 4] = cr;
      data[offset + 5] = cg;
      data[offset + 6] = cb;
      data[offset + 7] = alpha;
      data[offset + 8] = p.pos.x + normalX * halfWidth;
      data[offset + 9] = p.pos.y + normalY * halfWidth;
      data[offset + 10] = p.u;
      data[offset + 11] = 0.99;
      data[offset + 12] = cr;
      data[offset + 13] = cg;
      data[offset + 14] = cb;
      data[offset + 15] = alpha;
      this.indexData[this.indexCount++] = vertex;
      this.indexData[this.indexCount++] = vertex + 1;
      this.vertexCount += 2;
    }
  }

  /** Three cross-sections from G.java: dim nozzle, bright throat, transparent tip. */
  public drawEnginePlume(
    texture: WebGLTexture, x: number, y: number, angle: number,
    length: number, width: number, throat: number, phase: number, uvLength: number,
    color: readonly [number, number, number], nozzleAlpha: number, throatAlpha: number
  ): void {
    if (length <= 0 || width <= 0) return;
    this.setBlendMode('ADDITIVE');
    this.setAlphaDensityScale(1);
    if (this.currentTexture !== texture) {
      this.flush();
      this.currentTexture = texture;
    }
    if (this.vertexCount + 12 >= RibbonBatcher.MAX_VERTICES) this.flush();
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const emit = (along: number, side: number, u: number, alpha: number) => {
      const across = side * width / 2;
      this.emitVertex(x + c * along - s * across, y + s * along + c * across,
        u, side < 0 ? 0.01 : 0.99, color[0], color[1], color[2], alpha);
    };
    const positions = [0, throat, length];
    const u = [phase, phase + throat / length, phase + uvLength];
    const opacity = [nozzleAlpha, throatAlpha, 0];
    for (let i = 0; i < 2; i++) {
      emit(positions[i], -1, u[i], opacity[i]);
      emit(positions[i], 1, u[i], opacity[i]);
      emit(positions[i + 1], -1, u[i + 1], opacity[i + 1]);
      emit(positions[i + 1], -1, u[i + 1], opacity[i + 1]);
      emit(positions[i], 1, u[i], opacity[i]);
      emit(positions[i + 1], 1, u[i + 1], opacity[i + 1]);
    }
  }

  /** renderers/float.java: one additive band around the source targeting ellipse. */
  public drawRadialHalo(
    texture: WebGLTexture, centerPos: Vector2, facingRad: number, spec: ShipSpec,
    innerExtent: number, outerExtent: number, color: [number, number, number],
    alphaMult: number, scrollV: number
  ) {
    const outerBand = outerExtent - innerExtent;
    if (alphaMult <= 0 || outerBand <= 0) return;
    this.setBlendMode('ADDITIVE');
    this.setAlphaDensityScale(1);
    if (this.currentTexture !== texture) {
      this.flush();
      this.currentTexture = texture;
    }
    const segments = Math.max(1, Math.round(Math.PI * 2 * outerExtent / 50));
    const stepRad = Math.PI * 2 / segments;
    const repeats = Math.max(1, Math.round(segments / (Math.PI * 2)));
    const innerBand = innerExtent * 0.5;
    const innerV = -innerBand / outerBand - scrollV;
    const cr = color[0] / 255;
    const cg = color[1] / 255;
    const cb = color[2] / 255;
    const opacity = Math.floor(255 * Math.max(0, Math.min(1, alphaMult))) / 255;
    for (let i = 0; i < segments; i++) {
      if (this.vertexCount + 12 > RibbonBatcher.MAX_VERTICES) this.flush();
      const angle = i * stepRad;
      // The source reuses this radius for both angles in a wedge.
      const radius = getVentTargetingRadius(spec, angle);
      const inset = Math.min(innerBand, radius * 0.5);
      const cosA = Math.cos(facingRad + angle);
      const sinA = Math.sin(facingRad + angle);
      const cosB = Math.cos(facingRad + angle + stepRad);
      const sinB = Math.sin(facingRad + angle + stepRad);
      const uA = i * repeats / segments;
      const uB = (i + 1) * repeats / segments;
      const emit = (side: 'a' | 'b', r: number, v: number, alpha: number) => {
        this.emitVertex(centerPos.x + (side === 'a' ? cosA : cosB) * r,
          centerPos.y + (side === 'a' ? sinA : sinB) * r,
          side === 'a' ? uA : uB, v, cr, cg, cb, alpha);
      };
      emit('a', radius - inset, innerV, 0);
      emit('b', radius - inset, innerV, 0);
      emit('a', radius, -scrollV, opacity);
      emit('b', radius - inset, innerV, 0);
      emit('b', radius, -scrollV, opacity);
      emit('a', radius, -scrollV, opacity);
      emit('a', radius, -scrollV, opacity);
      emit('b', radius, -scrollV, opacity);
      emit('a', radius + outerBand, 1 - scrollV, 0);
      emit('b', radius, -scrollV, opacity);
      emit('b', radius + outerBand, 1 - scrollV, 0);
      emit('a', radius + outerBand, 1 - scrollV, 0);
    }
  }

  /** Untextured mitered diamond band from renderers/OOoO, expanded into triangles. */
  public drawIdentificationDiamond(texture: WebGLTexture, x: number, y: number, radius: number,
    thickness: number, color: readonly [number, number, number], opacity: number): void {
    if (radius <= 0 || thickness <= 0 || opacity <= 0) return;
    this.setBlendMode('NORMAL');
    this.setAlphaDensityScale(1);
    if (this.currentTexture !== texture) { this.flush(); this.currentTexture = texture; }
    if (this.vertexCount + 24 > RibbonBatcher.MAX_VERTICES) this.flush();
    const outer = radius * 1.3;
    const inner = Math.max(0, outer - thickness * 1.414);
    const corners = [[-1, 0], [0, 1], [1, 0], [0, -1]];
    const emit = (corner: number, extent: number) => this.emitVertex(
      x + corners[corner][0] * extent, y + corners[corner][1] * extent,
      0.5, 0.5, color[0] / 255, color[1] / 255, color[2] / 255, opacity);
    for (let a = 0; a < 4; a++) {
      const b = (a + 1) % 4;
      emit(a, outer); emit(a, inner); emit(b, outer);
      emit(b, outer); emit(a, inner); emit(b, inner);
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
    if (this.indexedStrip) {
      this.flush();
      this.indexedStrip = false;
    }
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

    if (this.indexedStrip) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ebo);
      gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, this.indexData.subarray(0, this.indexCount));
      // WebGL2 always enables fixed-index primitive restart for indexed draws.
      gl.drawElements(gl.TRIANGLE_STRIP, this.indexCount, gl.UNSIGNED_SHORT, 0);
    } else {
      gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    }
    this.drawCalls++;
    this.vertexCount = 0;
    this.indexCount = 0;
  }

  public end() {
    this.flush();
    const gl = this.gl;
    gl.bindVertexArray(null);
    gl.useProgram(null);
  }

  public dispose() {
    this.gl.deleteBuffer(this.vbo);
    this.gl.deleteBuffer(this.ebo);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
  }
}
