import { createNativeEmpArc, advanceNativeEmpArc } from '../../visual/EmpArcVisuals';
import { DEBRIS_TEXTURES } from '../../assets/CombatFXAssets';
import { Vector2 } from '../../math/Vector2';
import { updateHulkBreakups } from '../../visual/HulkVisuals';
import { createArmorDamageParticles } from '../../visual/ArmorImpactVisuals';
import type { Ship } from '../Ship';
import {
  Particle,
  ContrailParticle,
  ExplosionAnimation,
  HitGlowAnimation,
  MovingRayFade,
  EmpArc,
  EmpArcBranch,
  MuzzleFlash,
  MuzzleParticle,
  FloatingText,
  DebrisParticle,
  ShieldRipple,
  HulkFragment
} from '../CombatTypes';
import { LauncherSmokeSpec, MissileExplosionVisualSpec, MuzzleFlashSpec, Projectile } from '../Weapon';
import { createProjectileHitGlows, type HitGlowDamageResult } from '../../visual/HitGlowVisuals';
import { SimulationRandom } from '../SimulationRandom';
import { createExplosionPuffs, hitParticleDuration } from '../../visual/ExplosionVisuals';

function fastRemoveAt<T>(arr: T[], index: number) {
  const last = arr.pop();
  if (index < arr.length && last !== undefined) {
    arr[index] = last;
  }
}

type ParticlePriority = 'LOW' | 'NORMAL' | 'HIGH';

const PARTICLE_HARD_CAP = 720;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep01(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function smoothstepRange(edge0: number, edge1: number, value: number): number {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0;
  return smoothstep01((value - edge0) / (edge1 - edge0));
}

function particleEnvelope(progress: number, rampUpFraction: number, fadeOutFraction: number): number {
  const t = clamp01(progress);
  const ramp = rampUpFraction <= 0 ? 1 : smoothstepRange(0, rampUpFraction, t);
  const fade = fadeOutFraction <= 0 ? 1 : 1 - smoothstepRange(1 - fadeOutFraction, 1, t);
  return clamp01(ramp * fade);
}

function mixRgb(
  from: [number, number, number],
  to: [number, number, number],
  amount: number
): [number, number, number] {
  const t = clamp01(amount);
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t
  ];
}



export class CombatFXSystem {
  public particles: Particle[] = [];
  public contrails: ContrailParticle[] = [];
  public explosions: ExplosionAnimation[] = [];
  public hitGlows: HitGlowAnimation[] = [];
  public movingRayFades: MovingRayFade[] = [];
  public empArcs: EmpArc[] = [];
  public muzzleFlashes: MuzzleFlash[] = [];
  public muzzleParticles: MuzzleParticle[] = [];
  public floatingTexts: FloatingText[] = [];
  public debris: DebrisParticle[] = [];
  public shieldRipples: ShieldRipple[] = [];
  public hulkFragments: HulkFragment[] = [];

  constructor(private readonly random = new SimulationRandom()) {}

  public clear() {
    this.particles = [];
    this.contrails = [];
    this.explosions = [];
    this.hitGlows = [];
    this.movingRayFades = [];
    this.empArcs = [];
    this.muzzleFlashes = [];
    this.muzzleParticles = [];
    this.floatingTexts = [];
    this.debris = [];
    this.shieldRipples = [];
    this.hulkFragments = [];
  }

  public update(dt: number) {
    this.updateParticles(dt);
    this.updateContrails(dt);
    this.updateExplosions(dt);
    this.updateHitGlows(dt);
    this.updateMovingRayFades(dt);
    this.updateEmpArcs(dt);
    this.updateMuzzleFlashes(dt);
    this.updateMuzzleParticles(dt);
    this.updateFloatingTexts(dt);
    this.updateDebris(dt);
    this.updateShieldRipples(dt);
    this.updateHulkFragments(dt);
  }

  public updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.pos.addScaled(p.vel, dt);

      if (p.material === 'SOURCE_SMOOTH') {
        // BaseParticle's default cutoff=1: constant size/velocity and linear one-second brightness.
        p.alpha = Math.max(0, p.life / p.maxLife);
      } else if (p.material) {
        if (p.drag && p.drag > 0) p.vel.scale(Math.exp(-p.drag * dt));
        if (p.angularVel) p.rotation = (p.rotation ?? 0) + p.angularVel * dt;

        const progress = clamp01(1 - p.life / Math.max(0.0001, p.maxLife));
        const startSize = p.startSize ?? p.size;
        const endSize = p.endSize ?? startSize;
        p.size = startSize + (endSize - startSize) * smoothstep01(progress);
        p.alpha = (p.peakAlpha ?? 1) * particleEnvelope(
          progress,
          p.rampUpFraction ?? 0,
          p.fadeOutFraction ?? 0.7
        );
      } else {
        // Backward-compatible path for existing bespoke visual systems.
        p.alpha = Math.max(0, p.life / p.maxLife);
      }

      if (p.life <= 0) {
        fastRemoveAt(this.particles, i);
      }
    }
  }

  public updateContrails(dt: number) {
    for (let i = this.contrails.length - 1; i >= 0; i--) {
      const c = this.contrails[i];
      c.life -= dt;
      c.pos.addScaled(c.vel, dt);
      c.vel.scale(Math.max(0, 1 - dt * 2.0));
      const progress = Math.max(0, Math.min(1.0, 1.0 - c.life / c.maxLife));
      c.size = c.maxSize * (0.3 + 0.7 * progress);
      c.alpha = 0.65 * (1.0 - progress);
      if (c.life <= 0) {
        fastRemoveAt(this.contrails, i);
      }
    }
  }

  public updateExplosions(dt: number) {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const exp = this.explosions[i];
      exp.life -= dt;
      const progress = Math.max(0, Math.min(1.0, 1.0 - exp.life / exp.maxLife));
      if (!exp.puffs && !exp.sourceAuthored) exp.frame = Math.min(6, Math.floor(progress * 7));
      exp.radius = exp.maxRadius * (0.3 + 0.7 * Math.sin(progress * Math.PI * 0.5));
      if (exp.hasShockwaveRing) {
        exp.shockwaveRadius += dt * (exp.maxShockwaveRadius / (exp.maxLife * 0.45));
      }
      if (exp.life <= 0) {
        fastRemoveAt(this.explosions, i);
      }
    }
  }

  public updateHitGlows(dt: number) {
    for (let i = this.hitGlows.length - 1; i >= 0; i--) {
      const glow = this.hitGlows[i];
      glow.life -= dt;
      glow.pos.addScaled(glow.vel, dt);
      if (glow.life <= 0) fastRemoveAt(this.hitGlows, i);
    }
  }

  public updateMovingRayFades(dt: number) {
    for (let i = this.movingRayFades.length - 1; i >= 0; i--) {
      const fade = this.movingRayFades[i];
      fade.life -= dt;
      fade.elapsedTime += dt;
      const remaining = fade.headPos.distanceTo(fade.tailPos);
      const advance = Math.min(remaining, fade.moveSpeed * dt);
      fade.tailPos.addScaled(fade.direction, advance);
      if (fade.life <= 0 || fade.headPos.distanceTo(fade.tailPos) <= 0.1) {
        fastRemoveAt(this.movingRayFades, i);
      }
    }
  }

  /** MovingRay impact: freeze the head at contact while the tail catches up and fades. */
  public spawnMovingRayImpactFade(projectile: Projectile, impactPos: Vector2) {
    if (projectile.spawnType !== 'BALLISTIC_AS_BEAM' || projectile.sourceMoveSpeed !== undefined) return;
    const fadeTime = projectile.fadeTime ?? 0;
    const authoredLength = projectile.projLength ?? 0;
    const moveSpeed = projectile.movingRayMoveSpeed ?? projectile.vel.length();
    if (fadeTime <= 0 || authoredLength <= 0 || moveSpeed <= 0) return;

    const currentLength = Math.min(authoredLength, Math.max(0, projectile.elapsedTime) * moveSpeed);
    if (currentLength <= 0.1) return;
    const angle = projectile.facingRad ?? projectile.vel.heading();
    const direction = Vector2.fromAngle(angle);
    const headPos = impactPos.clone();
    const tailPos = headPos.clone().addScaled(direction, -currentLength);
    this.movingRayFades.push({
      id: this.random.next(),
      headPos,
      tailPos,
      direction,
      moveSpeed,
      life: fadeTime,
      maxLife: fadeTime,
      elapsedTime: projectile.elapsedTime,
      maxPulseLength: authoredLength,
      width: projectile.projWidth ?? projectile.radius * 2,
      textureType: projectile.textureType ?? 'SMOOTH',
      textureScrollSpeed: projectile.textureScrollSpeed ?? -256,
      pixelsPerTexel: projectile.pixelsPerTexel ?? 1,
      fringeColor: projectile.fringeColor ?? [...projectile.color, 255],
      coreColor: projectile.coreColor ?? [255, 255, 255, 255]
    });
  }

  public updateEmpArcs(dt: number) {
    for (let i = this.empArcs.length - 1; i >= 0; i--) {
      if (this.empArcs[i].native) advanceNativeEmpArc(this.empArcs[i], dt, this.random);
      else this.empArcs[i].life -= dt;
      if (this.empArcs[i].life <= 0) {
        fastRemoveAt(this.empArcs, i);
      }
    }
  }

  public updateMuzzleFlashes(dt: number) {
    for (let i = this.muzzleFlashes.length - 1; i >= 0; i--) {
      this.muzzleFlashes[i].life -= dt;
      if (this.muzzleFlashes[i].life <= 0) {
        fastRemoveAt(this.muzzleFlashes, i);
      }
    }
  }

  public updateMuzzleParticles(dt: number) {
    for (let i = this.muzzleParticles.length - 1; i >= 0; i--) {
      const p = this.muzzleParticles[i];
      p.life -= dt;
      p.pos.addScaled(p.vel, dt);
      if (p.life <= 0) {
        fastRemoveAt(this.muzzleParticles, i);
      }
    }
  }

  /**
   * 1:1 原版枪口爆炸风粒子生成 (com.fs.starfarer.combat.entities.ship.A.class.java:29-54 & SmoothParticle.java)
   */
  public spawnAuthenticMuzzleFlash(
    spec: MuzzleFlashSpec,
    muzzlePos: Vector2,
    angleRad: number,
    shipVel: Vector2
  ) {
    if (!spec || spec.particleCount <= 0) return;
    const spreadRad = (spec.spread * Math.PI) / 180;
    const baseAngle = angleRad - spreadRad / 2;
    for (let i = 0; i < spec.particleCount; i++) {
      const pSize = spec.particleSizeRange * this.random.next() + spec.particleSizeMin;
      const pAngle = this.random.next() * spreadRad + baseAngle;
      const pDist = this.random.next() * spec.length;
      const f10 = Math.cos(pAngle) * pDist;
      const f11 = Math.sin(pAngle) * pDist;
      this.muzzleParticles.push({
        pos: new Vector2(muzzlePos.x + f10, muzzlePos.y + f11),
        vel: new Vector2(f10 + shipVel.x, f11 + shipVel.y),
        size: pSize,
        life: spec.particleDuration,
        maxLife: spec.particleDuration,
        color: [...spec.particleColor]
      });
    }
  }

  public spawnLauncherSmoke(
    spec: LauncherSmokeSpec,
    muzzlePos: Vector2,
    angleRad: number,
    shipVel: Vector2
  ) {
    const [r, g, b, a] = spec.particleColor;
    for (let i = 0; i < spec.cloudParticleCount; i++) {
      const theta = this.random.next() * Math.PI * 2;
      const radius = Math.sqrt(this.random.next()) * spec.cloudRadius;
      const outward = 4 + this.random.next() * 10;
      this.muzzleParticles.push({
        pos: muzzlePos.clone().add(Vector2.fromAngle(theta, radius)),
        vel: shipVel.clone().add(Vector2.fromAngle(theta, outward)),
        size: spec.particleSizeMin + this.random.next() * spec.particleSizeRange,
        life: spec.cloudDuration,
        maxLife: spec.cloudDuration,
        color: [r, g, b, a],
        blendMode: 'NORMAL'
      });
    }

    const spreadRad = (spec.blowbackSpread * Math.PI) / 180;
    const rearAngle = angleRad + Math.PI;
    for (let i = 0; i < spec.blowbackParticleCount; i++) {
      const theta = rearAngle + (this.random.next() - 0.5) * spreadRad;
      const dist = this.random.next() * spec.blowbackLength;
      const offset = Vector2.fromAngle(theta, dist);
      this.muzzleParticles.push({
        pos: muzzlePos.clone().add(offset),
        vel: shipVel.clone().add(offset),
        size: spec.particleSizeMin + this.random.next() * spec.particleSizeRange,
        life: spec.blowbackDuration,
        maxLife: spec.blowbackDuration,
        color: [r, g, b, a],
        blendMode: 'NORMAL'
      });
    }
  }

  public updateFloatingTexts(dt: number) {
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= dt;
      ft.pos.addScaled(ft.vel, dt);
      ft.vel.scale(Math.max(0, 1 - dt * 1.1));
      if (ft.life <= 0) {
        fastRemoveAt(this.floatingTexts, i);
      }
    }
  }

  public updateDebris(dt: number) {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      d.pos.addScaled(d.vel, dt);
      d.vel.scale(Math.max(0, 1 - dt * 0.4)); // 太空摩擦阻力
      d.rotation += d.angularVel * dt;
      if (d.life <= 0) {
        fastRemoveAt(this.debris, i);
      }
    }
  }

  public updateShieldRipples(dt: number) {
    for (let i = this.shieldRipples.length - 1; i >= 0; i--) {
      const r = this.shieldRipples[i];
      r.life -= dt;
      const progress = 1.0 - Math.max(0, r.life / r.maxLife);
      r.radius = 8 + (r.maxRadius - 8) * Math.sin(progress * Math.PI * 0.5);
      if (r.life <= 0) {
        fastRemoveAt(this.shieldRipples, i);
      }
    }
  }

  public updateHulkFragments(dt: number) {
    const cooledShips = new Set<Ship>();
    for (let i = this.hulkFragments.length - 1; i >= 0; i--) {
      const frag = this.hulkFragments[i];
      frag.age += dt;
      if (frag.sourceShip.spec.hullSize === 'FIGHTER' && frag.age >= 10.5) {
        this.hulkFragments.splice(i, 1);
        continue;
      }
      frag.pos.addScaled(frag.vel, dt);
      frag.facingRad += frag.angularVel * dt;
      if (!cooledShips.has(frag.sourceShip)) {
        cooledShips.add(frag.sourceShip);
        frag.sourceShip.updateScorchMarks(dt);
        frag.sourceShip.shield.update(dt, frag.facingRad, frag.facingRad);
        frag.sourceShip.system.update(dt);
      }
    }
    updateHulkBreakups(this.hulkFragments, dt, this.random);
    // Non-fighter wrecks do not fade just because time passes. Native offscreen/FOW
    // reclamation is still open. Continuous random hulk smoke is not a source-backed effect.
  }

  private reserveParticleSlots(requested: number, priority: ParticlePriority = 'NORMAL'): number {
    if (requested <= 0) return 0;
    const available = Math.max(0, PARTICLE_HARD_CAP - this.particles.length);
    if (available <= 0) return 0;

    // Soft degradation keeps large fleet fights readable and bounded without abruptly
    // disabling high-value hit flashes. No camera dependency is required, so simulation
    // determinism is preserved across render rates.
    const load = this.particles.length / PARTICLE_HARD_CAP;
    let density = load < 0.55 ? 1 : load < 0.75 ? 0.78 : load < 0.9 ? 0.5 : 0.25;
    if (priority === 'HIGH') density = Math.min(1, density * 1.2);
    if (priority === 'LOW') density *= 0.7;

    const minimumVisible = priority === 'HIGH' ? Math.min(requested, 2) : priority === 'NORMAL' ? 1 : 0;
    const scaled = Math.max(minimumVisible, Math.floor(requested * density));
    return Math.min(requested, available, scaled);
  }

  public spawnArmorDamageSparks(ship: Ship, localImpact: Vector2, armorDamage: number): void {
    if (ship.damageDecals.suppressed) return;
    const pos = ship.pos.clone().add(localImpact.clone().rotate(ship.facingRad));
    // Do not apply the modern burst's minimum count or load-based soft density to source particles.
    this.particles.push(...createArmorDamageParticles(pos, armorDamage, this.random));
  }

  public spawnSparks(pos: Vector2, count = 15, color: [number, number, number] = [255, 200, 100]) {
    const actualCount = this.reserveParticleSlots(count, 'NORMAL');
    for (let i = 0; i < actualCount; i++) {
      const angle = this.random.next() * Math.PI * 2;
      const speed = 70 + this.random.next() * 230;
      const life = 0.22 + this.random.next() * 0.34;
      const size = 1.5 + this.random.next() * 2.8;
      this.particles.push({
        pos: pos.clone(),
        vel: Vector2.fromAngle(angle, speed),
        life,
        maxLife: life,
        size,
        startSize: size,
        endSize: size * (0.35 + this.random.next() * 0.25),
        color: mixRgb(color, [255, 255, 255], 0.12 + this.random.next() * 0.28),
        alpha: 1,
        peakAlpha: 0.72 + this.random.next() * 0.28,
        rampUpFraction: 0.015,
        fadeOutFraction: 0.74,
        drag: 0.8 + this.random.next() * 1.5,
        material: 'SPARK',
        rotation: angle,
        stretch: 1.4 + this.random.next() * 1.8
      });
    }
  }

  public spawnExplosion(pos: Vector2, count = 60) {
    const actualCount = this.reserveParticleSlots(count, 'HIGH');
    for (let i = 0; i < actualCount; i++) {
      const ratio = actualCount > 1 ? i / (actualCount - 1) : 0;
      const angle = this.random.next() * Math.PI * 2;

      if (ratio < 0.62) {
        const speed = 110 + this.random.next() * 320;
        const life = 0.32 + this.random.next() * 0.48;
        const size = 1.8 + this.random.next() * 3.4;
        this.particles.push({
          pos: pos.clone(), vel: Vector2.fromAngle(angle, speed), life, maxLife: life,
          size, startSize: size, endSize: size * 0.38,
          color: [255, 150 + this.random.next() * 80, 45 + this.random.next() * 45],
          alpha: 1, peakAlpha: 0.9, rampUpFraction: 0.01, fadeOutFraction: 0.68,
          drag: 0.7 + this.random.next() * 1.2, material: 'SPARK', rotation: angle,
          stretch: 1.8 + this.random.next() * 2.5
        });
      } else if (ratio < 0.82) {
        const speed = 20 + this.random.next() * 90;
        const life = 0.38 + this.random.next() * 0.42;
        const size = 7 + this.random.next() * 9;
        this.particles.push({
          pos: pos.clone(), vel: Vector2.fromAngle(angle, speed), life, maxLife: life,
          size, startSize: size, endSize: size * (2 + this.random.next() * 0.8),
          color: [255, 100 + this.random.next() * 90, 25], alpha: 0,
          peakAlpha: 0.56 + this.random.next() * 0.26, rampUpFraction: 0.06, fadeOutFraction: 0.82,
          drag: 1.5 + this.random.next(), material: 'GLOW', rotation: angle
        });
      } else {
        const speed = 8 + this.random.next() * 38;
        const life = 0.9 + this.random.next() * 0.9;
        const size = 12 + this.random.next() * 14;
        this.particles.push({
          pos: pos.clone(), vel: Vector2.fromAngle(angle, speed), life, maxLife: life,
          size, startSize: size, endSize: size * (1.8 + this.random.next() * 0.7),
          color: [42 + this.random.next() * 20, 35 + this.random.next() * 16, 32 + this.random.next() * 14],
          alpha: 0, peakAlpha: 0.28 + this.random.next() * 0.18, rampUpFraction: 0.12, fadeOutFraction: 0.72,
          drag: 1.4 + this.random.next() * 0.8, material: 'SMOKE', rotation: angle,
          angularVel: (this.random.next() - 0.5) * 1.1
        });
      }
    }
  }

  public spawnProjectileHitGlows(projectile: Projectile, pos: Vector2, target: Ship, result: HitGlowDamageResult) {
    this.hitGlows.push(...createProjectileHitGlows(projectile, pos, target.vel, result, this.random));
  }

  public spawnSourceMissileExplosion(pos: Vector2, spec: MissileExplosionVisualSpec) {
    if (spec.radius <= 0) return;
    const [r, g, b] = spec.color;
    const duration = hitParticleDuration(spec.radius * 2);
    this.explosions.push({
      id: this.random.next(),
      visualKind: 'missile',
      sourceAuthored: true,
      pos: pos.clone(),
      radius: spec.radius * 0.4,
      maxRadius: spec.radius,
      life: duration,
      maxLife: duration,
      frame: 0,
      rotation: this.random.next() * Math.PI * 2,
      color: [r, g, b],
      hasShockwaveRing: false,
      shockwaveRadius: 0,
      maxShockwaveRadius: 0
    });
  }

  public spawnAuthenticExplosion(
    pos: Vector2,
    radius = 50,
    color: [number, number, number] = [255, 160, 50],
    hasShockwave = true,
    visualKind: 'impact' | 'missile' | 'ship' = 'impact',
    sourceShipId?: string,
    duration = 2,
    velocity = new Vector2()
  ) {
    if (radius <= 0 || duration <= 0) return;
    this.explosions.push({
      id: this.random.next(),
      visualKind,
      sourceShipId,
      pos: pos.clone(),
      radius: radius * 0.4,
      maxRadius: radius,
      life: duration,
      maxLife: duration,
      frame: 0,
      rotation: this.random.next() * Math.PI * 2,
      color,
      hasShockwaveRing: hasShockwave,
      shockwaveRadius: 6,
      maxShockwaveRadius: radius * 1.6,
      puffs: createExplosionPuffs(radius * 2, this.random, hasShockwave, velocity)
    });
  }

  public spawnNativeEmpArc(from: Vector2, to: Vector2, target: Ship, width: number,
    fringe: [number, number, number, number], core: [number, number, number, number]): void {
    this.empArcs.push(createNativeEmpArc(from, to, target, width, fringe, core, this.random));
  }

  public spawnEmpArc(
    from: Vector2,
    to: Vector2,
    options?: {
      coreColor?: [number, number, number];
      glowColor?: [number, number, number];
      thickness?: number;
      life?: number;
      branchCount?: number;
      constrainPoint?: (point: Vector2) => Vector2;
    }
  ) {
    const life = options?.life ?? 0.22;
    const thickness = options?.thickness ?? 2.2;
    const coreColor: [number, number, number] = options?.coreColor ?? [255, 255, 255];
    const glowColor: [number, number, number] = options?.glowColor ?? [0, 225, 255];

    const dist = from.distanceTo(to);
    const totalSegs = Math.max(5, Math.min(14, Math.floor(dist / 35)));
    const segments: Vector2[] = [from.clone()];
    const branches: EmpArcBranch[] = [];

    const dir = to.clone().sub(from).normalize();
    const perp = new Vector2(-dir.y, dir.x);
    const maxOffset = Math.min(50, Math.max(12, dist * 0.18));

    for (let i = 1; i < totalSegs; i++) {
      const t = i / totalSegs;
      const basePoint = Vector2.lerp(from, to, t);
      const envelope = Math.sin(t * Math.PI);
      const lateral = (this.random.next() - 0.5) * 2 * maxOffset * envelope;
      const axial = (this.random.next() - 0.5) * 12;
      const rawPoint = basePoint.clone().add(perp.clone().scale(lateral)).add(dir.clone().scale(axial));
      const pt = options?.constrainPoint ? options.constrainPoint(rawPoint) : rawPoint;
      segments.push(pt);

      const maxBranches = options?.branchCount ?? 3;
      if (this.random.next() < 0.4 && branches.length < maxBranches) {
        const branchSegs: Vector2[] = [pt.clone()];
        const branchAngle = dir.heading() + (this.random.next() > 0.5 ? 1 : -1) * (0.5 + this.random.next() * 0.5);
        let branchCur = pt.clone();
        const branchLen = 25 + this.random.next() * 55;
        const bSteps = 3;
        for (let b = 1; b <= bSteps; b++) {
          const stepDist = branchLen / bSteps;
          const rawBranchPoint = branchCur.clone().add(Vector2.fromAngle(
            branchAngle + (this.random.next() - 0.5) * 0.4,
            stepDist
          ));
          branchCur = options?.constrainPoint ? options.constrainPoint(rawBranchPoint) : rawBranchPoint;
          branchSegs.push(branchCur);
        }
        branches.push({
          segments: branchSegs,
          thickness: thickness * 0.6
        });
      }
    }
    segments.push(to.clone());

    this.empArcs.push({
      startPos: from.clone(),
      endPos: to.clone(),
      life,
      maxLife: life,
      segments,
      branches,
      coreColor,
      glowColor,
      thickness
    });

  }

  public addFloatingDamage(pos: Vector2, amount: number, color: [number, number, number]) {
    if (amount < 1) return;

    for (const ft of this.floatingTexts) {
      if (
        ft.life > 0.15 &&
        ft.color[0] === color[0] &&
        ft.color[1] === color[1] &&
        ft.color[2] === color[2]
      ) {
        const dist = ft.pos.distanceTo(pos);
        if (dist < 75) {
          const prevVal = parseFloat(ft.text) || 0;
          const total = prevVal + amount;
          ft.text = String(Math.round(total));
          ft.life = Math.min(ft.maxLife, ft.life + 0.3);
          ft.size = Math.min(22, 11 + Math.sqrt(total) * 0.35);
          return;
        }
      }
    }

    const life = 1.35;
    this.floatingTexts.push({
      id: this.random.next(),
      pos: pos.clone().add(new Vector2((this.random.next() - 0.5) * 16, (this.random.next() - 0.5) * 16)),
      text: String(Math.round(amount)),
      color,
      size: Math.min(18, Math.max(12, 11 + Math.sqrt(amount) * 0.35)),
      life,
      maxLife: life,
      vel: new Vector2((this.random.next() - 0.5) * 12, -32 - this.random.next() * 14)
    });
  }

  public addFloatingText(
    pos: Vector2,
    text: string,
    color: [number, number, number],
    size = 14,
    maxLife = 1.5
  ) {
    this.floatingTexts.push({
      id: this.random.next(),
      pos: pos.clone(),
      text,
      color,
      size,
      life: maxLife,
      maxLife,
      vel: new Vector2(0, -25)
    });
  }

  /**
   * 1:1 移植官方原版装甲/残骸碎片生成算法 (com.fs.starfarer.renderers.damage.DebrisParticleSystem.java)
   */
  public spawnDebris(
    pos: Vector2,
    count = 3,
    color: [number, number, number] = [120, 110, 100],
    baseSpeed = 90,
    sizeCategory: 'small' | 'medium' | 'large' = 'small'
  ) {
    const texList = DEBRIS_TEXTURES[sizeCategory] || DEBRIS_TEXTURES.small;
    const baseSize = sizeCategory === 'large' ? 16 : sizeCategory === 'medium' ? 12 : 8;
    const maxLife = sizeCategory === 'large' ? 3.0 : sizeCategory === 'medium' ? 2.2 : 1.4;

    for (let i = 0; i < count; i++) {
      const angle = this.random.next() * Math.PI * 2;
      const speed = (0.35 + this.random.next() * 0.65) * baseSpeed;
      const size = baseSize * (0.8 + this.random.next() * 0.4);
      const isGlowing = this.random.next() > 0.35; // 67% 原版灼热熔融火花红光
      const shardTex = texList[Math.floor(this.random.next() * texList.length)];
      const shardColor: [number, number, number] = isGlowing
        ? [255, Math.floor(160 + this.random.next() * 85), 80]
        : color;

      const life = maxLife * (0.7 + this.random.next() * 0.4);
      this.debris.push({
        pos: pos.clone(),
        vel: Vector2.fromAngle(angle, speed),
        rotation: this.random.next() * Math.PI * 2,
        angularVel: (this.random.next() - 0.5) * 8.0,
        size,
        life,
        maxLife: life,
        color: shardColor,
        points: [],
        spriteUrl: shardTex,
        isGlowing
      });
    }
  }

  public spawnShieldRipple(pos: Vector2, maxRadius = 55, color: [number, number, number] = [100, 210, 255]) {
    this.shieldRipples.push({
      pos: pos.clone(),
      radius: 8,
      maxRadius,
      life: 0.28,
      maxLife: 0.28,
      color
    });
  }
}
