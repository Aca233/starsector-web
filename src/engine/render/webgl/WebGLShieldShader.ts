import { WebGLShaderUtil } from './WebGLShaderUtil';
import type { Vector2 } from '../../math/Vector2';
import type { Ship } from '../../simulation/Ship';
import { SHIELD_VISUAL_PROFILES, getShipVisualProfile } from '../../visual/VisualProfiles';

const SHIELD_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_uv;
layout(location = 2) in float a_alpha;
uniform mat3 u_viewProj;
out vec2 v_uv;
out float v_alpha;
void main() {
  vec3 clip = u_viewProj * vec3(a_position, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_uv = a_uv;
  v_alpha = a_alpha;
}
`;

const SHIELD_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
in float v_alpha;
uniform sampler2D u_texture;
uniform vec4 u_color;
out vec4 fragColor;
void main() {
  vec4 texel = texture(u_texture, v_uv);
  fragColor = vec4(texel.rgb * u_color.rgb, texel.a * u_color.a * v_alpha);
}
`;

/**
 * Common shield path from combat/systems/G.java: two additive triangle fans,
 * then an inward textured rim strip. Segment brightness lives on Shield, so
 * drawing/pausing/renderer recreation never advances or discards hit recovery.
 */
export class WebGLShieldShader {
  private readonly program: WebGLProgram;
  private readonly vbo: WebGLBuffer;
  private readonly vao: WebGLVertexArrayObject;
  private readonly uViewProj: WebGLUniformLocation | null;
  private readonly uTexture: WebGLUniformLocation | null;
  private readonly uColor: WebGLUniformLocation | null;
  private vertices = new Float32Array(0);
  public drawCalls = 0;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.program = WebGLShaderUtil.createProgram(gl, SHIELD_VS, SHIELD_FS);
    const vbo = gl.createBuffer();
    const vao = gl.createVertexArray();
    if (!vbo || !vao) {
      if (vbo) gl.deleteBuffer(vbo);
      if (vao) gl.deleteVertexArray(vao);
      gl.deleteProgram(this.program);
      throw new Error('Failed to allocate shield geometry');
    }
    this.vbo = vbo;
    this.vao = vao;
    this.uViewProj = gl.getUniformLocation(this.program, 'u_viewProj');
    this.uTexture = gl.getUniformLocation(this.program, 'u_texture');
    this.uColor = gl.getUniformLocation(this.program, 'u_color');
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 20, 16);
    gl.bindVertexArray(null);
  }

  public renderShield(
    viewProjMatrix: Float32Array,
    ship: Ship,
    shipWorldPos: Vector2,
    shipFacingRad: number,
    texShield: WebGLTexture,
    nowSec: number,
    texRim: WebGLTexture
  ): void {
    const shield = ship.shield;
    if (!shield.isVisuallyDeployed || shield.radius <= 0) return;
    const levels = shield.hitSegmentLevels;
    const count = levels.length;
    const arc = shield.renderArcRad;
    const facing = shield.type === 'FRONT' ? shipFacingRad : shield.facingAngleRad;
    const start = facing - arc / 2;
    const step = arc / (count - 1);
    const visual = getShipVisualProfile(ship.spec);
    const base = SHIELD_VISUAL_PROFILES[visual.shieldProfile];
    const fortress = SHIELD_VISUAL_PROFILES[visual.fortressShieldProfile ?? 'fortress'];
    const system = Math.max(0, Math.min(1, ship.system.fortressVisualLevel));
    const mix = (a: number, b: number) => a + (b - a) * system;
    const brightness = mix(base.brightness, fortress.brightness);
    const innerRotation = nowSec * mix(base.textureRotationSpeed, fortress.textureRotationSpeed);
    const ringRotation = nowSec * Math.sqrt(62.831853 / Math.max(1, shield.radius)) * mix(base.ringSpeedScale, fortress.ringSpeedScale);
    const rimScale = ship.spec.hullSize === 'FIGHTER' ? 3 / 5 : ship.spec.hullSize === 'FRIGATE' ? 4 / 5 : 1;
    const rimWidth = mix(base.rimWidth, fortress.rimWidth) * rimScale;
    const wobble = Math.min(1, 0.25 + 0.75 * shield.radius / 256);
    const fanRadius = shield.radius * 1.07;
    const fanVertices = count + 1;
    const totalFloats = (fanVertices * 2 + count * 2) * 5;
    if (this.vertices.length < totalFloats) this.vertices = new Float32Array(2 ** Math.ceil(Math.log2(totalFloats)));
    let cursor = 0;
    const vertex = (x: number, y: number, u: number, v: number, alpha: number) => {
      this.vertices[cursor++] = x;
      this.vertices[cursor++] = y;
      this.vertices[cursor++] = u;
      this.vertices[cursor++] = v;
      this.vertices[cursor++] = alpha;
    };
    const segmentAlpha = (i: number) => {
      const theta = i * step;
      const taper = Math.max(0, Math.min(1, Math.min(theta, arc - theta) / (Math.PI / 18)));
      return shield.visualAlpha * (1 - 0.45 * levels[i] / 100) * taper;
    };

    for (let layer = 0; layer < 2; layer++) {
      vertex(shipWorldPos.x, shipWorldPos.y, 0.5, 0.5, 0);
      const textureAngle = (layer === 0 ? innerRotation : -innerRotation) - arc / 2;
      for (let i = 0; i < count; i++) {
        const theta = i * step;
        const angle = start + theta;
        vertex(shipWorldPos.x + Math.cos(angle) * fanRadius, shipWorldPos.y + Math.sin(angle) * fanRadius,
          0.5 + Math.cos(theta + textureAngle) / 2, 0.5 + Math.sin(theta + textureAngle) / 2,
          Math.floor(segmentAlpha(i) * 75) / 255);
      }
    }
    for (let i = 0; i < count; i++) {
      const theta = i * step;
      const angle = start + theta;
      const radius = shield.radius + wobble * Math.sin(ringRotation * 10 + theta * 10);
      const alpha = Math.floor(segmentAlpha(i) * 255) / 255;
      const x = Math.cos(angle);
      const y = Math.sin(angle);
      vertex(shipWorldPos.x + x * radius, shipWorldPos.y + y * radius, 0, 0, alpha);
      vertex(shipWorldPos.x + x * (radius - rimWidth), shipWorldPos.y + y * (radius - rimWidth), 0, 1, alpha);
    }

    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertices.subarray(0, totalFloats), gl.DYNAMIC_DRAW);
    gl.uniformMatrix3fv(this.uViewProj, false, viewProjMatrix);
    gl.uniform1i(this.uTexture, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texShield);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.uniform4f(this.uColor,
      mix(base.innerColor[0], fortress.innerColor[0]) / 255 * brightness,
      mix(base.innerColor[1], fortress.innerColor[1]) / 255 * brightness,
      mix(base.innerColor[2], fortress.innerColor[2]) / 255 * brightness,
      mix(base.opacity, fortress.opacity));
    gl.drawArrays(gl.TRIANGLE_FAN, 0, fanVertices);
    gl.drawArrays(gl.TRIANGLE_FAN, fanVertices, fanVertices);
    gl.bindTexture(gl.TEXTURE_2D, texRim);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform4f(this.uColor,
      mix(base.outerColor[0], fortress.outerColor[0]) / 255 * brightness,
      mix(base.outerColor[1], fortress.outerColor[1]) / 255 * brightness,
      mix(base.outerColor[2], fortress.outerColor[2]) / 255 * brightness, 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, fanVertices * 2, count * 2);
    this.drawCalls += 3;
    gl.bindVertexArray(null);
  }

  public dispose(): void {
    this.gl.deleteBuffer(this.vbo);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
  }
}
