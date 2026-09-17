import { Vector2 } from '../../math/Vector2';
import { WebGLShaderUtil } from './WebGLShaderUtil';

const VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

// 静态四边形局部角点 [-0.5, 0.5]
layout(location = 0) in vec2 a_corner;

// 动态实例化属性
layout(location = 1) in vec2 a_worldPos;
layout(location = 2) in vec2 a_scale;
layout(location = 3) in float a_rotation;
layout(location = 4) in vec2 a_pivot;
layout(location = 5) in vec4 a_uvRect; // u0, v0, u1, v1
layout(location = 6) in vec4 a_color;  // r, g, b, a

uniform mat3 u_viewProj;

out vec2 v_uv;
out vec4 v_color;

void main() {
  // 1. 局部锚点变换
  vec2 local = (a_corner - a_pivot) * a_scale;

  // 2. 旋转
  float cosR = cos(a_rotation);
  float sinR = sin(a_rotation);
  vec2 rotated = vec2(
    local.x * cosR - local.y * sinR,
    local.x * sinR + local.y * cosR
  );

  // 3. 世界位置
  vec2 world = rotated + a_worldPos;

  // 4. 正交投影
  vec3 clip = u_viewProj * vec3(world, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);

  // 5. 纹理 UV 坐标映射
  vec2 uvNorm = a_corner + vec2(0.5, 0.5);
  v_uv = vec2(
    mix(a_uvRect.x, a_uvRect.z, uvNorm.x),
    mix(a_uvRect.y, a_uvRect.w, uvNorm.y)
  );
  v_color = a_color;
}
`;

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision mediump float;

in vec2 v_uv;
in vec4 v_color;

uniform sampler2D u_texture;

out vec4 fragColor;

void main() {
  vec4 texColor = texture(u_texture, v_uv);
  fragColor = texColor * v_color;
}
`;

/**
 * 极速 GPU 实例化精灵合批器 (SpriteBatcher)
 * 支持多达 4096 个精灵/粒子单次硬件 Draw Call 渲染
 */
export class SpriteBatcher {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private quadVBO: WebGLBuffer;
  private instanceVBO: WebGLBuffer;

  private uViewProjLoc: WebGLUniformLocation;
  private uTextureLoc: WebGLUniformLocation;

  private static readonly MAX_SPRITES = 4096;
  // 每个实例包含 16 个 float: worldX, worldY, scaleX, scaleY, rot, pivotX, pivotY, u0, v0, u1, v1, r, g, b, a, pad
  private static readonly FLOATS_PER_SPRITE = 16;
  private instanceData: Float32Array;
  private spriteCount = 0;

  private readonly batchTextures: WebGLTexture[] = [];
  private currentTextureSlot = 0;
  private readonly samplerUnits = new Int32Array([0, 1, 2, 3]);
  private currentTexture: WebGLTexture | null = null;
  private currentBlendMode: 'NORMAL' | 'ADDITIVE' = 'NORMAL';
  public currentViewProj: Float32Array = new Float32Array(9);
  public drawCalls = 0;

  constructor(gl: WebGL2RenderingContext, private readonly textureSlots: 1 | 4 = 1) {
    this.gl = gl;
    // Four-sampler mode is confined to the FX pass; other passes retain the
    // original single-texture shader and ordering. Slot uses existing padding.
    const vertexSource = textureSlots === 1 ? VERTEX_SHADER_SOURCE : VERTEX_SHADER_SOURCE
      .replace('out vec2 v_uv;', 'layout(location = 7) in float a_textureSlot;\nflat out int v_textureSlot;\nout vec2 v_uv;')
      .replace('  v_color = a_color;', '  v_color = a_color;\n  v_textureSlot = int(a_textureSlot);');
    const fragmentSource = textureSlots === 1 ? FRAGMENT_SHADER_SOURCE : FRAGMENT_SHADER_SOURCE
      .replace('uniform sampler2D u_texture;', 'uniform sampler2D u_textures[4];\nflat in int v_textureSlot;')
      .replace('  vec4 texColor = texture(u_texture, v_uv);',
        '  vec2 dx = dFdx(v_uv), dy = dFdy(v_uv);\n' +
        '  vec4 texColor;\n' +
        '  if (v_textureSlot == 0) texColor = textureGrad(u_textures[0], v_uv, dx, dy);\n' +
        '  else if (v_textureSlot == 1) texColor = textureGrad(u_textures[1], v_uv, dx, dy);\n' +
        '  else if (v_textureSlot == 2) texColor = textureGrad(u_textures[2], v_uv, dx, dy);\n' +
        '  else texColor = textureGrad(u_textures[3], v_uv, dx, dy);');
    this.program = WebGLShaderUtil.createProgram(gl, vertexSource, fragmentSource);

    this.uViewProjLoc = gl.getUniformLocation(this.program, 'u_viewProj')!;
    this.uTextureLoc = gl.getUniformLocation(this.program, textureSlots === 1 ? 'u_texture' : 'u_textures[0]')!;

    this.instanceData = new Float32Array(SpriteBatcher.MAX_SPRITES * SpriteBatcher.FLOATS_PER_SPRITE);

    // 1. 初始化 VAO
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('Failed to create VAO');
    this.vao = vao;
    gl.bindVertexArray(this.vao);

    // 2. 静态四边形角点 VBO (2 个三角形 6 个顶点)
    const quadCorners = new Float32Array([
      -0.5, -0.5,
       0.5, -0.5,
      -0.5,  0.5,
      -0.5,  0.5,
       0.5, -0.5,
       0.5,  0.5
    ]);
    const quadVBO = gl.createBuffer();
    if (!quadVBO) throw new Error('Failed to create quad VBO');
    this.quadVBO = quadVBO;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
    gl.bufferData(gl.ARRAY_BUFFER, quadCorners, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // 3. 动态实例化 VBO
    const instVBO = gl.createBuffer();
    if (!instVBO) throw new Error('Failed to create instance VBO');
    this.instanceVBO = instVBO;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);
    gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW);

    const stride = SpriteBatcher.FLOATS_PER_SPRITE * 4;
    // a_worldPos (vec2) -> loc 1
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(1, 1);

    // a_scale (vec2) -> loc 2
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 2 * 4);
    gl.vertexAttribDivisor(2, 1);

    // a_rotation (float) -> loc 3
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 4 * 4);
    gl.vertexAttribDivisor(3, 1);

    // a_pivot (vec2) -> loc 4
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 2, gl.FLOAT, false, stride, 5 * 4);
    gl.vertexAttribDivisor(4, 1);

    // a_uvRect (vec4) -> loc 5
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 4, gl.FLOAT, false, stride, 7 * 4);
    gl.vertexAttribDivisor(5, 1);

    // a_color (vec4) -> loc 6
    gl.enableVertexAttribArray(6);
    gl.vertexAttribPointer(6, 4, gl.FLOAT, false, stride, 11 * 4);
    gl.vertexAttribDivisor(6, 1);
    if (textureSlots === 4) {
      gl.enableVertexAttribArray(7);
      gl.vertexAttribPointer(7, 1, gl.FLOAT, false, stride, 15 * 4);
      gl.vertexAttribDivisor(7, 1);
    }

    gl.bindVertexArray(null);
  }

  public begin(cameraPos: Vector2, zoom: number, canvasWidth: number, canvasHeight: number) {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    // 构建正交投影矩阵 (World -> Clip Space)
    const sx = (2 * zoom) / canvasWidth;
    const sy = (-2 * zoom) / canvasHeight;
    const tx = -cameraPos.x * sx;
    const ty = -cameraPos.y * sy;
    this.currentViewProj = new Float32Array([
      sx,  0,   0,
      0,   sy,  0,
      tx,  ty,  1
    ]);
    gl.uniformMatrix3fv(this.uViewProjLoc, false, this.currentViewProj);
    if (this.textureSlots === 1) gl.uniform1i(this.uTextureLoc, 0);
    else gl.uniform1iv(this.uTextureLoc, this.samplerUnits);

    gl.enable(gl.BLEND);
    // A new/restored context (or another batcher) need not share our cached mode.
    // begin owns the GL blend state even when no logical mode transition occurs.
    if (this.currentBlendMode === 'NORMAL') {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    } else {
      this.setBlendMode('NORMAL');
    }
    this.spriteCount = 0;
    this.currentTexture = null;
    this.batchTextures.length = 0;
    this.currentTextureSlot = 0;
    this.drawCalls = 0;
  }

  public resumeProgram() {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.uniformMatrix3fv(this.uViewProjLoc, false, this.currentViewProj);
    if (this.textureSlots === 1) gl.uniform1i(this.uTextureLoc, 0);
    else gl.uniform1iv(this.uTextureLoc, this.samplerUnits);
    gl.enable(gl.BLEND);
    if (this.currentBlendMode === 'ADDITIVE') {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    } else {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
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

  public drawSprite(
    texture: WebGLTexture,
    worldX: number,
    worldY: number,
    scaleX: number,
    scaleY: number,
    rotation = 0,
    pivotX = 0,
    pivotY = 0,
    r = 1.0,
    g = 1.0,
    b = 1.0,
    a = 1.0,
    u0 = 0.0,
    v0 = 0.0,
    u1 = 1.0,
    v1 = 1.0
  ) {
    if (this.textureSlots === 1) {
      if (this.currentTexture !== texture || this.spriteCount >= SpriteBatcher.MAX_SPRITES) {
        this.flush();
        this.currentTexture = texture;
      }
    } else {
      if (this.spriteCount >= SpriteBatcher.MAX_SPRITES) this.flush();
      if (this.currentTexture !== texture) {
        let slot = this.batchTextures.indexOf(texture);
        if (slot < 0) {
          if (this.batchTextures.length === this.textureSlots) {
            this.flush();
            this.batchTextures.length = 0;
          }
          slot = this.batchTextures.length;
          this.batchTextures.push(texture);
        }
        this.currentTexture = texture;
        this.currentTextureSlot = slot;
      }
    }

    const offset = this.spriteCount * SpriteBatcher.FLOATS_PER_SPRITE;
    const data = this.instanceData;
    data[offset] = worldX;
    data[offset + 1] = worldY;
    data[offset + 2] = scaleX;
    data[offset + 3] = scaleY;
    data[offset + 4] = rotation;
    data[offset + 5] = pivotX;
    data[offset + 6] = pivotY;
    data[offset + 7] = u0;
    data[offset + 8] = v0;
    data[offset + 9] = u1;
    data[offset + 10] = v1;
    data[offset + 11] = r;
    data[offset + 12] = g;
    data[offset + 13] = b;
    data[offset + 14] = a;
    data[offset + 15] = this.currentTextureSlot; // padding in single-texture mode

    this.spriteCount++;
  }

  public flush() {
    if (this.spriteCount === 0 || !this.currentTexture) return;

    const gl = this.gl;
    if (this.textureSlots === 1) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.currentTexture);
    } else {
      for (let slot = 0; slot < this.textureSlots; slot++) {
        gl.activeTexture(gl.TEXTURE0 + slot);
        gl.bindTexture(gl.TEXTURE_2D, this.batchTextures[slot] ?? this.batchTextures[0]);
      }
      // Texture managers and other passes upload/bind on unit zero.
      gl.activeTexture(gl.TEXTURE0);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);
    // WebGL2 accepts a source range without allocating a typed-array view per flush.
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData, 0, this.spriteCount * SpriteBatcher.FLOATS_PER_SPRITE);

    // 核心调用：单次 GPU 实例化绘制所有精灵
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.spriteCount);
    this.drawCalls++;
    this.spriteCount = 0;
  }

  public end() {
    this.flush();
    const gl = this.gl;
    gl.bindVertexArray(null);
    gl.useProgram(null);
  }

  public dispose() {
    this.gl.deleteBuffer(this.quadVBO);
    this.gl.deleteBuffer(this.instanceVBO);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
  }
}
