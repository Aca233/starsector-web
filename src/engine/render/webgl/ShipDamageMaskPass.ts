import {
  DEFAULT_ARMOR_SECTOR_WEIGHTS,
  type ContinuousArmorSectorWeights,
} from '../../modding/ShipBlueprint';

export const DAMAGE_MASK_FS = `#version 300 es
precision mediump float;

in vec2 v_uv;
uniform sampler2D u_hullSprite;
uniform float u_sectorIntegrity[8]; // [0..1] integrity per 45-deg polar sector
uniform float u_scorchIntensity;
uniform float u_time;

out vec4 fragColor;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

void main() {
  vec4 baseTex = texture(u_hullSprite, v_uv);
  if (baseTex.a <= 0.01) {
    discard;
  }

  // Convert UV around center (0.5, 0.5) to polar angle in [0, 2*PI)
  vec2 rel = v_uv - vec2(0.5);
  float angle = atan(rel.y, rel.x);
  if (angle < 0.0) angle += 6.2831853;

  float sectorF = (angle / 6.2831853) * 8.0;
  int s0 = int(floor(sectorF)) & 7;
  int s1 = (s0 + 1) & 7;
  float frac = fract(sectorF);
  float integrity = mix(u_sectorIntegrity[s0], u_sectorIntegrity[s1], frac);
  float damage = clamp((1.0 - integrity) * u_scorchIntensity, 0.0, 1.0);

  if (damage <= 0.01) {
    fragColor = baseTex;
    return;
  }

  // Procedural scorched armor cratering + exposed hot molten ember glow
  float grain = hash21(floor(v_uv * 96.0));
  float scorchMask = smoothstep(0.25, 0.85, damage + (grain - 0.5) * 0.35);
  vec3 charred = baseTex.rgb * mix(1.0, 0.22, scorchMask);

  float emberPulse = 0.65 + 0.35 * sin(u_time * 5.0 + grain * 6.28);
  float breachEdge = smoothstep(0.55, 0.88, damage * grain);
  vec3 moltenGlow = vec3(1.0, 0.42, 0.08) * breachEdge * emberPulse * 1.35;

  fragColor = vec4(charred + moltenGlow, baseTex.a);
}
`;

export interface ContinuousArmorImpactResult {
  readonly effectiveArmor: number;
  readonly hullDamage: number;
  readonly armorAblated: number;
  readonly sectorIntegrityRatio: number;
}

/**
 * Continuous 8-Sector Armor Field A(theta) + GPU Dynamic Scorched Damage Mask State.
 * Replaces the legacy 15x30 discrete armor cell grid and 21-neighbor CPU iteration
 * with O(1) continuous trigonometric interpolation and GPU procedural burn masks.
 */
export class ContinuousArmorField {
  private readonly maxSectors: Float32Array;
  private readonly currentSectors: Float32Array;
  private readonly minResidualRatio: number;

  constructor(
    baseArmorRating: number,
    weights: ContinuousArmorSectorWeights = DEFAULT_ARMOR_SECTOR_WEIGHTS,
    minResidualRatio = 0.05
  ) {
    this.maxSectors = new Float32Array(8);
    this.currentSectors = new Float32Array(8);
    this.minResidualRatio = Math.max(0.01, Math.min(0.5, minResidualRatio));
    for (let i = 0; i < 8; i++) {
      const v = Math.max(1, baseArmorRating * weights[i]);
      this.maxSectors[i] = v;
      this.currentSectors[i] = v;
    }
  }

  /**
   * Evaluates continuous armor thickness A(theta) at local angle `thetaRad` in O(1).
   */
  public sampleArmorAtAngle(thetaRad: number): number {
    const tau = Math.PI * 2;
    const norm = ((thetaRad % tau) + tau) % tau;
    const sectorF = (norm / tau) * 8.0;
    const s0 = Math.floor(sectorF) & 7;
    const s1 = (s0 + 1) & 7;
    const frac = sectorF - Math.floor(sectorF);
    return this.currentSectors[s0] * (1 - frac) + this.currentSectors[s1] * frac;
  }

  /**
   * Applies an armor hit at `thetaRad` using a 3-tap angular Gaussian kernel in O(1)
   * and returns the resulting hull damage and updated integrity ratio.
   */
  public applyImpact(thetaRad: number, rawDamage: number): ContinuousArmorImpactResult {
    const tau = Math.PI * 2;
    const norm = ((thetaRad % tau) + tau) % tau;
    const sectorF = (norm / tau) * 8.0;
    const s0 = Math.floor(sectorF) & 7;
    const s1 = (s0 + 1) & 7;
    const prev = (s0 + 7) & 7;
    const frac = sectorF - Math.floor(sectorF);

    const effectiveArmor =
      this.currentSectors[s0] * (1 - frac) + this.currentSectors[s1] * frac;
    const damageMult = rawDamage / (rawDamage + Math.max(5, effectiveArmor));
    const hullDamage = rawDamage * damageMult;
    const armorAblated = rawDamage * (1 - damageMult * 0.5) * 0.35;

    this.currentSectors[s0] = Math.max(
      this.maxSectors[s0] * this.minResidualRatio,
      this.currentSectors[s0] - armorAblated * 0.6
    );
    this.currentSectors[s1] = Math.max(
      this.maxSectors[s1] * this.minResidualRatio,
      this.currentSectors[s1] - armorAblated * 0.25
    );
    this.currentSectors[prev] = Math.max(
      this.maxSectors[prev] * this.minResidualRatio,
      this.currentSectors[prev] - armorAblated * 0.15
    );

    return {
      effectiveArmor,
      hullDamage,
      armorAblated,
      sectorIntegrityRatio: this.currentSectors[s0] / this.maxSectors[s0],
    };
  }

  /**
   * Returns the normalized 8-sector integrity array `[0..1]^8` for uniform upload to `DAMAGE_MASK_FS`.
   */
  public getNormalizedIntegrityUniform(out = new Float32Array(8)): Float32Array {
    for (let i = 0; i < 8; i++) {
      out[i] = Math.max(0, Math.min(1, this.currentSectors[i] / this.maxSectors[i]));
    }
    return out;
  }
}
