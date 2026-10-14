import { ECS_FLOATS_PER_PARTICLE_BURST } from '../../runtime/rust/RustEcsBridge';

/**
 * Each GPU particle instance occupies 8 floats in the ring buffer:
 * [originX, originY, velX, velY, spawnTime, lifetime, baseSize, colorPreset]
 * All per-frame position integration, drag, and alpha fade happen in the Vertex Shader!
 */
export const FLOATS_PER_GPU_PARTICLE = 8;

const GPU_PARTICLE_VS = `#version 300 es
layout(location = 0) in vec2 a_quadVertex;
layout(location = 1) in vec4 a_originVel;   // xy = origin, zw = velocity
layout(location = 2) in vec4 a_timeSizeCol; // x = spawnTime, y = lifetime, z = baseSize, w = colorPreset

uniform mat3 u_viewProjection;
uniform float u_currentTime;

out vec2 v_uv;
out vec4 v_color;

void main() {
  float age = u_currentTime - a_timeSizeCol.x;
  float life = max(a_timeSizeCol.y, 0.001);
  float t = clamp(age / life, 0.0, 1.0);

  if (age < 0.0 || age >= life) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    v_uv = vec2(0.0);
    v_color = vec4(0.0);
    return;
  }

  // Analytic damped kinematics evaluated purely on the GPU
  float dragFactor = (1.0 - exp(-2.4 * age)) / 2.4;
  vec2 worldPos = a_originVel.xy + a_originVel.zw * dragFactor;
  float scale = a_timeSizeCol.z * mix(1.0, 0.25, t * t);

  vec2 corner = worldPos + a_quadVertex * scale;
  vec3 clip = u_viewProjection * vec3(corner, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_uv = a_quadVertex * 2.0;

  // Color ramp based on preset (0.45 = cyan shield spark, 0.85 = orange armor slag, 1.0 = core plasma)
  vec3 hotColor = mix(vec3(0.35, 0.88, 1.0), vec3(1.0, 0.65, 0.2), step(0.6, a_timeSizeCol.w));
  vec3 coolColor = mix(vec3(0.1, 0.35, 0.85), vec3(0.75, 0.18, 0.05), step(0.6, a_timeSizeCol.w));
  float alpha = (1.0 - t) * (1.0 - t);
  v_color = vec4(mix(hotColor, coolColor, t), alpha);
}
`;

const GPU_PARTICLE_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
in vec4 v_color;
out vec4 fragColor;

void main() {
  float r2 = dot(v_uv, v_uv);
  if (r2 > 1.0) discard;
  float radialFalloff = (1.0 - r2) * (1.0 - r2);
  fragColor = vec4(v_color.rgb * (1.0 + 0.6 * radialFalloff), v_color.a * radialFalloff);
}
`;

export class GpuParticleRenderer {
  private readonly maxParticles: number;
  private readonly cpuRingStage: Float32Array;
  private writeCursor = 0;
  private activeSubmitted = 0;
  private gl: WebGL2RenderingContext | null;
  private instanceBuffer: WebGLBuffer | null = null;

  constructor(gl: WebGL2RenderingContext | null = null, maxParticles = 65536) {
    this.gl = gl;
    this.maxParticles = maxParticles;
    this.cpuRingStage = new Float32Array(maxParticles * FLOATS_PER_GPU_PARTICLE);
    if (gl) {
      this.instanceBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        this.cpuRingStage.byteLength,
        gl.DYNAMIC_DRAW
      );
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
  }

  public getShaderSources(): { vertexShader: string; fragmentShader: string } {
    return { vertexShader: GPU_PARTICLE_VS, fragmentShader: GPU_PARTICLE_FS };
  }

  /**
   * Expands compact burst records from RustEcsBridge (`particleBursts`) into
   * GPU ring-buffer particle seeds without creating any CPU entity objects.
   */
  public ingestEcsBursts(burstBuffer: Float32Array, burstCount: number, currentTime: number): number {
    let spawnedParticles = 0;
    for (let i = 0; i < burstCount; i++) {
      const base = i * ECS_FLOATS_PER_PARTICLE_BURST;
      const x = burstBuffer[base];
      const y = burstBuffer[base + 1];
      const baseVx = burstBuffer[base + 2];
      const baseVy = burstBuffer[base + 3];
      const colorPreset = burstBuffer[base + 4];
      const baseSize = burstBuffer[base + 5];
      const lifetime = burstBuffer[base + 6];
      const count = Math.min(Math.max(burstBuffer[base + 7] | 0, 1), 128);

      for (let p = 0; p < count; p++) {
        const angle = ((p * 2.3999632) + i * 0.71) % (Math.PI * 2);
        const speed = 35 + ((p * 17) % 140);
        const idx = this.writeCursor * FLOATS_PER_GPU_PARTICLE;
        this.cpuRingStage[idx] = x;
        this.cpuRingStage[idx + 1] = y;
        this.cpuRingStage[idx + 2] = baseVx + Math.cos(angle) * speed;
        this.cpuRingStage[idx + 3] = baseVy + Math.sin(angle) * speed;
        this.cpuRingStage[idx + 4] = currentTime;
        this.cpuRingStage[idx + 5] = lifetime * (0.75 + ((p % 5) * 0.1));
        this.cpuRingStage[idx + 6] = baseSize * (0.8 + ((p % 3) * 0.2));
        this.cpuRingStage[idx + 7] = colorPreset;

        this.writeCursor = (this.writeCursor + 1) % this.maxParticles;
        this.activeSubmitted = Math.min(this.activeSubmitted + 1, this.maxParticles);
        spawnedParticles += 1;
      }
    }

    if (spawnedParticles > 0 && this.gl && this.instanceBuffer) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.instanceBuffer);
      this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, this.cpuRingStage);
    }

    return spawnedParticles;
  }

  public getActiveCapacity(): number {
    return this.activeSubmitted;
  }

  public dispose(): void {
    if (this.gl && this.instanceBuffer) {
      this.gl.deleteBuffer(this.instanceBuffer);
      this.instanceBuffer = null;
    }
  }
}
