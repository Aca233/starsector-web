import { WebGLShaderUtil } from './WebGLShaderUtil';
import { Vector2 } from '../../math/Vector2';
import { Ship } from '../../simulation/Ship';

const SHIELD_VS = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_corner; // [-0.5, 0.5]

uniform mat3 u_viewProj;
uniform vec2 u_center;
uniform float u_radius;

out vec2 v_localPos;

void main() {
  float boxSize = u_radius * 2.35;
  v_localPos = a_corner * boxSize;
  vec2 worldPos = u_center + v_localPos;
  vec3 clip = u_viewProj * vec3(worldPos, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
}
`;

const SHIELD_FS = `#version 300 es
precision highp float;

in vec2 v_localPos;

uniform float u_radius;
uniform float u_centerAngle;
uniform float u_halfArc;
uniform float u_innerAngle1;
uniform float u_innerAngle2;
uniform float u_ringAngle;
uniform vec3 u_innerColor;
uniform vec3 u_ringColor;
uniform float u_fluxWobble;
uniform float u_time;
uniform float u_brightness;

// 4 组受击高光参数: x=angle, y=intensity, z=arcSpan, w=active(0/1)
uniform vec4 u_ripples[4];

uniform sampler2D u_texShield; // shields256.png

out vec4 fragColor;

void main() {
  float dist = length(v_localPos);
  float maxShieldR = u_radius * 1.07;
  if (dist > maxShieldR + 6.0 || dist < 1.0) {
    discard;
  }

  // 1. 扇区角度与边缘平滑收敛 (1:1 对齐 G.java: 10~15度角平滑柔和渐隐)
  float angle = atan(v_localPos.y, v_localPos.x);
  float diff = angle - u_centerAngle;
  diff = mod(diff + 3.14159265359, 6.28318530718) - 3.14159265359;
  float absDiff = abs(diff);

  if (u_halfArc < 3.10 && absDiff > u_halfArc) {
    discard;
  }

  // 10~15度平滑收尾渐隐 (0.22 rad)
  float taper = u_halfArc >= 3.10 ? 1.0 : smoothstep(0.0, 0.22, u_halfArc - absDiff);

  // 2. 径向环带与顶点 Alpha 梯度 (1:1 对齐 G.java:364-394)
  // 中心 (0, 0) 处 alpha 为 0，边缘 maxShieldR 处 alpha 为 spec.innerColor.alpha (75/255 = 0.294)
  float normDist = clamp(dist / maxShieldR, 0.0, 1.0);
  float vertexAlpha = normDist * 0.2941;

  // 3. 内部星云流动纹理采样 (1:1 对齐 G.java: 双层差速逆向旋转 ±0.3927 rad/s，采样 shields256.png 的 Alpha 通道)
  float c1 = cos(u_innerAngle1);
  float s1 = sin(u_innerAngle1);
  vec2 uv1 = vec2(c1 * v_localPos.x - s1 * v_localPos.y, s1 * v_localPos.x + c1 * v_localPos.y) / (maxShieldR * 2.0) + 0.5;
  float tex1Alpha = texture(u_texShield, uv1).a;

  float c2 = cos(u_innerAngle2);
  float s2 = sin(u_innerAngle2);
  vec2 uv2 = vec2(c2 * v_localPos.x - s2 * v_localPos.y, s2 * v_localPos.x + c2 * v_localPos.y) / (maxShieldR * 2.0) + 0.5;
  float tex2Alpha = texture(u_texShield, uv2).a;

  // 双层焦散叠加，经 vertexAlpha 与扇区端点 taper 调制 (极具通透感与层次感，彻底告别死板纯色方块)
  vec3 innerCol = u_innerColor * ((tex1Alpha + tex2Alpha) * 0.5 * vertexAlpha * taper * 2.2);

  // 4. 护盾边缘外环 (1:1 对齐 G.java:408-468: 5px line8x8.png 轮廓)
  float wobble = sin(angle * 10.0 + u_ringAngle * 10.0) * (0.35 + u_fluxWobble);
  float rimR = u_radius + wobble;
  float rimDist = abs(dist - rimR);
  float rimFactor = smoothstep(2.8, 0.0, rimDist) * taper;
  vec3 rimCol = u_ringColor * (rimFactor * 0.95);

  // 5. 受击瞬态高光闪烁 (Hit Ripple Glow)
  vec3 ripCol = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    if (u_ripples[i].w < 0.5) continue;
    float rAngle = u_ripples[i].x;
    float rIntensity = u_ripples[i].y;
    float rSpan = u_ripples[i].z;

    float rDiff = angle - rAngle;
    rDiff = mod(rDiff + 3.14159265359, 6.28318530718) - 3.14159265359;
    float absRDiff = abs(rDiff);
    if (absRDiff < rSpan) {
      float spanFade = 1.0 - absRDiff / rSpan;
      float rRim = smoothstep(6.0 * rIntensity, 0.0, abs(dist - u_radius));
      ripCol += (u_ringColor + vec3(0.2)) * (spanFade * rRim * rIntensity * 1.5);
    }
  }

  // 6. 最终加色合成
  vec3 finalRgb = (innerCol + rimCol + ripCol) * u_brightness;
  fragColor = vec4(finalRgb, 1.0);
}
`;

export class WebGLShieldShader {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private quadVbo: WebGLBuffer;
  private vao: WebGLVertexArrayObject;

  private uViewProj: WebGLUniformLocation;
  private uCenter: WebGLUniformLocation;
  private uRadius: WebGLUniformLocation;
  private uCenterAngle: WebGLUniformLocation;
  private uHalfArc: WebGLUniformLocation;
  private uInnerAngle1: WebGLUniformLocation;
  private uInnerAngle2: WebGLUniformLocation;
  private uRingAngle: WebGLUniformLocation;
  private uInnerColor: WebGLUniformLocation;
  private uRingColor: WebGLUniformLocation;
  private uFluxWobble: WebGLUniformLocation;
  private uTime: WebGLUniformLocation;
  private uBrightness: WebGLUniformLocation;
  private uRipplesLocs: WebGLUniformLocation[] = [];
  private uTexShield: WebGLUniformLocation;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = WebGLShaderUtil.createProgram(gl, SHIELD_VS, SHIELD_FS);

    this.uViewProj = gl.getUniformLocation(this.program, 'u_viewProj')!;
    this.uCenter = gl.getUniformLocation(this.program, 'u_center')!;
    this.uRadius = gl.getUniformLocation(this.program, 'u_radius')!;
    this.uCenterAngle = gl.getUniformLocation(this.program, 'u_centerAngle')!;
    this.uHalfArc = gl.getUniformLocation(this.program, 'u_halfArc')!;
    this.uInnerAngle1 = gl.getUniformLocation(this.program, 'u_innerAngle1')!;
    this.uInnerAngle2 = gl.getUniformLocation(this.program, 'u_innerAngle2')!;
    this.uRingAngle = gl.getUniformLocation(this.program, 'u_ringAngle')!;
    this.uInnerColor = gl.getUniformLocation(this.program, 'u_innerColor')!;
    this.uRingColor = gl.getUniformLocation(this.program, 'u_ringColor')!;
    this.uFluxWobble = gl.getUniformLocation(this.program, 'u_fluxWobble')!;
    this.uTime = gl.getUniformLocation(this.program, 'u_time')!;
    this.uBrightness = gl.getUniformLocation(this.program, 'u_brightness')!;
    this.uTexShield = gl.getUniformLocation(this.program, 'u_texShield')!;

    for (let i = 0; i < 4; i++) {
      this.uRipplesLocs.push(gl.getUniformLocation(this.program, `u_ripples[${i}]`)!);
    }

    // 初始化单位四边形 [-0.5, 0.5]
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);

    this.quadVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    const quadVertices = new Float32Array([
      -0.5, -0.5,
       0.5, -0.5,
      -0.5,  0.5,
       0.5,  0.5
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
  }

  public renderShield(
    viewProjMatrix: Float32Array,
    ship: Ship,
    shipWorldPos: Vector2,
    shipFacingRad: number,
    texShield: WebGLTexture,
    _texRingUnused: WebGLTexture,
    nowSec: number
  ) {
    const shield = ship.shield;
    if (!shield.isActive || shield.radius <= 0 || shield.type === 'PHASE' || shield.type === 'NONE') return;
    if (shield.currentArcDeg <= 2) return;

    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    // 启用 1:1 原版加色混合 (G.java:342 GL11.glBlendFunc(770, 1))
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    gl.uniformMatrix3fv(this.uViewProj, false, viewProjMatrix);
    gl.uniform2f(this.uCenter, shipWorldPos.x, shipWorldPos.y);
    gl.uniform1f(this.uRadius, shield.radius);

    // 确定护盾中心朝向弧度与半张角
    const centerAngle = shield.type === 'FRONT' ? shipFacingRad : shield.facingAngleRad;
    const halfArcRad = Math.min(Math.PI, (shield.currentArcDeg * Math.PI) / 360);
    gl.uniform1f(this.uCenterAngle, centerAngle);
    gl.uniform1f(this.uHalfArc, halfArcRad);

    // 官方精确旋转速率 (G.java:120-122)
    // 内层: 0.3926991 rad/s
    // 环层: sqrt(62.83185 / radius) rad/s
    const innerAngle1 = (nowSec * 0.3926991) % (Math.PI * 2);
    const innerAngle2 = (-nowSec * 0.3926991) % (Math.PI * 2);
    const ringRate = Math.sqrt(62.831853 / Math.max(1.0, shield.radius));
    const ringAngle = (nowSec * ringRate) % (Math.PI * 2);

    gl.uniform1f(this.uInnerAngle1, innerAngle1);
    gl.uniform1f(this.uInnerAngle2, innerAngle2);
    gl.uniform1f(this.uRingAngle, ringAngle);

    // 官方护盾色彩判定 (G.java / lowtech / hightech)
    const isFortress = ship.system.type === 'FORTRESS_SHIELD' && ship.system.isActive;
    let innerColor: [number, number, number];
    let ringColor: [number, number, number];

    if (isFortress) {
      // 堡垒护盾金白光芒
      innerColor = [1.0, 0.85, 0.45];
      ringColor = [1.0, 1.0, 0.95];
    } else if (ship.spec.id === 'onslaught') {
      // 1:1 hull_styles.json LOW_TECH: [255, 125, 125, 75] 柔和微暖半透光力场 + [255, 255, 255] 亮缘
      innerColor = [1.0, 0.49, 0.49];
      ringColor = [1.0, 1.0, 1.0];
    } else {
      // 1:1 hull_styles.json HIGH_TECH: [125, 125, 255, 75] 澄澈湛蓝半透光力场 + [255, 255, 255] 亮缘
      innerColor = [0.49, 0.49, 1.0];
      ringColor = [1.0, 1.0, 1.0];
    }

    gl.uniform3f(this.uInnerColor, innerColor[0], innerColor[1], innerColor[2]);
    gl.uniform3f(this.uRingColor, ringColor[0], ringColor[1], ringColor[2]);

    const fluxWobble = (ship.flux.totalFlux / ship.spec.maxFlux) * 1.8;
    gl.uniform1f(this.uFluxWobble, fluxWobble);
    gl.uniform1f(this.uTime, nowSec);
    gl.uniform1f(this.uBrightness, isFortress ? 1.5 : 1.0);

    // 受击涟漪参数 (最多 4 条)
    for (let i = 0; i < 4; i++) {
      if (i < shield.ripples.length) {
        const rip = shield.ripples[i];
        const span = 0.22 + (1.0 - rip.intensity) * 0.26;
        gl.uniform4f(this.uRipplesLocs[i], rip.angle, rip.intensity, span, 1.0);
      } else {
        gl.uniform4f(this.uRipplesLocs[i], 0, 0, 0, 0);
      }
    }

    // 绑定 shields256.png
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texShield);
    gl.uniform1i(this.uTexShield, 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindVertexArray(null);
  }
}
