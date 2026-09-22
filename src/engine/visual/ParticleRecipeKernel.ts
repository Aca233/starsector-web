// Frozen v1 snapshot replay kernel for current Web spark/explosion cosmetics.
// No density selection or source RNG changes. Regeneration is validated against
// real authority fields before encoding; unsupported edits remain ordinary data.
import { Vector2 } from '../math/Vector2';
import type { SimulationRandom } from '../simulation/SimulationRandom';
import type { Particle } from '../simulation/CombatTypes';
function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}
function smoothstep01(value: number): number {
    const t = clamp01(value);
    return t * t * (3 - 2 * t);
}
function smoothstepRange(edge0: number, edge1: number, value: number): number {
    if (edge1 <= edge0)
        return value >= edge1 ? 1 : 0;
    return smoothstep01((value - edge0) / (edge1 - edge0));
}
function particleEnvelope(progress: number, rampUpFraction: number, fadeOutFraction: number): number {
    const t = clamp01(progress);
    const ramp = rampUpFraction <= 0 ? 1 : smoothstepRange(0, rampUpFraction, t);
    const fade = fadeOutFraction <= 0 ? 1 : 1 - smoothstepRange(1 - fadeOutFraction, 1, t);
    return clamp01(ramp * fade);
}
function mixRgb(from: [
    number,
    number,
    number
], to: [
    number,
    number,
    number
], amount: number): [
    number,
    number,
    number
] {
    const t = clamp01(amount);
    return [
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
        from[2] + (to[2] - from[2]) * t
    ];
}
export function generateParticleBurst(kind: number, random: SimulationRandom, pos: Vector2, actualCount: number, color: [
    number,
    number,
    number
], fromAngle = Vector2.fromAngle): Particle[] {
    const out: Particle[] = [];
    if (kind === 2) {
        for (let i = 0; i < actualCount; i++) {
            const angle = random.next() * Math.PI * 2;
            const speed = 70 + random.next() * 230;
            const life = 0.22 + random.next() * 0.34;
            const size = 1.5 + random.next() * 2.8;
            out.push({
                pos: pos.clone(),
                vel: fromAngle(angle, speed),
                life,
                maxLife: life,
                size,
                startSize: size,
                endSize: size * (0.35 + random.next() * 0.25),
                color: mixRgb(color, [255, 255, 255], 0.12 + random.next() * 0.28),
                alpha: 1,
                peakAlpha: 0.72 + random.next() * 0.28,
                rampUpFraction: 0.015,
                fadeOutFraction: 0.74,
                drag: 0.8 + random.next() * 1.5,
                material: 'SPARK',
                rotation: angle,
                stretch: 1.4 + random.next() * 1.8
            });
        }
    }
    else {
        for (let i = 0; i < actualCount; i++) {
            const ratio = actualCount > 1 ? i / (actualCount - 1) : 0;
            const angle = random.next() * Math.PI * 2;
            if (ratio < 0.62) {
                const speed = 110 + random.next() * 320;
                const life = 0.32 + random.next() * 0.48;
                const size = 1.8 + random.next() * 3.4;
                out.push({
                    pos: pos.clone(), vel: fromAngle(angle, speed), life, maxLife: life,
                    size, startSize: size, endSize: size * 0.38,
                    color: [255, 150 + random.next() * 80, 45 + random.next() * 45],
                    alpha: 1, peakAlpha: 0.9, rampUpFraction: 0.01, fadeOutFraction: 0.68,
                    drag: 0.7 + random.next() * 1.2, material: 'SPARK', rotation: angle,
                    stretch: 1.8 + random.next() * 2.5
                });
            }
            else if (ratio < 0.82) {
                const speed = 20 + random.next() * 90;
                const life = 0.38 + random.next() * 0.42;
                const size = 7 + random.next() * 9;
                out.push({
                    pos: pos.clone(), vel: fromAngle(angle, speed), life, maxLife: life,
                    size, startSize: size, endSize: size * (2 + random.next() * 0.8),
                    color: [255, 100 + random.next() * 90, 25], alpha: 0,
                    peakAlpha: 0.56 + random.next() * 0.26, rampUpFraction: 0.06, fadeOutFraction: 0.82,
                    drag: 1.5 + random.next(), material: 'GLOW', rotation: angle
                });
            }
            else {
                const speed = 8 + random.next() * 38;
                const life = 0.9 + random.next() * 0.9;
                const size = 12 + random.next() * 14;
                out.push({
                    pos: pos.clone(), vel: fromAngle(angle, speed), life, maxLife: life,
                    size, startSize: size, endSize: size * (1.8 + random.next() * 0.7),
                    color: [42 + random.next() * 20, 35 + random.next() * 16, 32 + random.next() * 14],
                    alpha: 0, peakAlpha: 0.28 + random.next() * 0.18, rampUpFraction: 0.12, fadeOutFraction: 0.72,
                    drag: 1.4 + random.next() * 0.8, material: 'SMOKE', rotation: angle,
                    angularVel: (random.next() - 0.5) * 1.1
                });
            }
        }
    }
    return out;
}
export function advanceRecipeParticle(p: Particle, integrateMotion = true, exp = Math.exp) {
    const dt = 1 / 60;
    p.life -= dt;
    if (integrateMotion) p.pos.addScaled(p.vel, dt);
    if (p.material === 'SOURCE_SMOOTH') {
        // BaseParticle's default cutoff=1: constant size/velocity and linear one-second brightness.
        p.alpha = Math.max(0, p.life / p.maxLife);
    }
    else if (p.material) {
        if (integrateMotion && p.drag && p.drag > 0)
            p.vel.scale(exp(-p.drag * dt));
        if (p.angularVel)
            p.rotation = (p.rotation ?? 0) + p.angularVel * dt;
        const progress = clamp01(1 - p.life / Math.max(0.0001, p.maxLife));
        const startSize = p.startSize ?? p.size;
        const endSize = p.endSize ?? startSize;
        p.size = startSize + (endSize - startSize) * smoothstep01(progress);
        p.alpha = (p.peakAlpha ?? 1) * particleEnvelope(progress, p.rampUpFraction ?? 0, p.fadeOutFraction ?? 0.7);
    }
    else {
        // Backward-compatible path for existing bespoke visual systems.
        p.alpha = Math.max(0, p.life / p.maxLife);
    }
}
