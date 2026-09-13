import { Vector2 } from '../../math/Vector2';
import {
  Particle,
  ContrailParticle,
  ExplosionAnimation,
  EmpArc,
  EmpArcBranch,
  MuzzleFlash,
  MuzzleParticle,
  FloatingText,
  DebrisParticle,
  ShieldRipple,
  HulkFragment
} from '../CombatTypes';
import { MuzzleFlashSpec } from '../Weapon';
import { sound } from '../../audio/SoundManager';

function fastRemoveAt<T>(arr: T[], index: number) {
  const last = arr.pop();
  if (index < arr.length && last !== undefined) {
    arr[index] = last;
  }
}

const DEBRIS_TEXTURES = {
  small: [
    'graphics/debris/debris_sml0.png',
    'graphics/debris/debris_sml1.png',
    'graphics/debris/debris_sml2.png',
    'graphics/debris/debris_sml3.png'
  ],
  medium: [
    'graphics/debris/debris_med0.png',
    'graphics/debris/debris_med1.png'
  ],
  large: [
    'graphics/debris/debris_lrg0.png',
    'graphics/debris/debris_lrg1.png'
  ]
};

export class CombatFXSystem {
  public particles: Particle[] = [];
  public contrails: ContrailParticle[] = [];
  public explosions: ExplosionAnimation[] = [];
  public empArcs: EmpArc[] = [];
  public muzzleFlashes: MuzzleFlash[] = [];
  public muzzleParticles: MuzzleParticle[] = [];
  public floatingTexts: FloatingText[] = [];
  public debris: DebrisParticle[] = [];
  public shieldRipples: ShieldRipple[] = [];
  public hulkFragments: HulkFragment[] = [];

  constructor() {}

  public clear() {
    this.particles = [];
    this.contrails = [];
    this.explosions = [];
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
      p.alpha = Math.max(0, p.life / p.maxLife);
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
      exp.frame = Math.min(6, Math.floor(progress * 7));
      exp.radius = exp.maxRadius * (0.3 + 0.7 * Math.sin(progress * Math.PI * 0.5));
      if (exp.hasShockwaveRing) {
        exp.shockwaveRadius += dt * (exp.maxShockwaveRadius / (exp.maxLife * 0.45));
      }
      if (exp.life <= 0) {
        fastRemoveAt(this.explosions, i);
      }
    }
  }

  public updateEmpArcs(dt: number) {
    for (let i = this.empArcs.length - 1; i >= 0; i--) {
      this.empArcs[i].life -= dt;
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
      const pSize = spec.particleSizeRange * Math.random() + spec.particleSizeMin;
      const pAngle = Math.random() * spreadRad + baseAngle;
      const pDist = Math.random() * spec.length;
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
    for (let i = this.hulkFragments.length - 1; i >= 0; i--) {
      const frag = this.hulkFragments[i];
      frag.life -= dt;
      if (frag.life <= 0) {
        this.hulkFragments.splice(i, 1);
        continue;
      }

      frag.pos.addScaled(frag.vel, dt);
      frag.facingRad += frag.angularVel * dt;
      frag.vel.scale(Math.pow(0.85, dt));
      frag.angularVel *= Math.pow(0.9, dt);

      // 浓密黑烟与裂口火星
      if (Math.random() < dt * 6) {
        const off = new Vector2(
          (Math.random() - 0.5) * frag.collisionRadius * 1.1,
          (Math.random() - 0.5) * frag.collisionRadius * 1.1
        ).rotate(frag.facingRad);
        const smokePos = frag.pos.clone().add(off);

        this.contrails.push({
          pos: smokePos,
          vel: Vector2.fromAngle(frag.facingRad + Math.PI + (Math.random() - 0.5) * 1.5, 15).addScaled(frag.vel, 0.2),
          life: 1.2 + Math.random() * 0.8,
          maxLife: 2.0,
          size: 12 + Math.random() * 10,
          maxSize: 36 + Math.random() * 16,
          alpha: 0.65,
          rotation: Math.random() * Math.PI * 2,
          color: [30, 30, 35]
        });

        if (Math.random() < 0.4) {
          this.particles.push({
            pos: smokePos,
            vel: Vector2.fromAngle(Math.random() * Math.PI * 2, 30).addScaled(frag.vel, 0.3),
            life: 0.2 + Math.random() * 0.2,
            maxLife: 0.4,
            size: 3 + Math.random() * 3,
            color: [255, 130 + Math.random() * 80, 20],
            alpha: 0.9
          });
        }
      }
    }
  }

  public spawnSparks(pos: Vector2, count = 15, color: [number, number, number] = [255, 200, 100]) {
    if (this.particles.length >= 450) return;
    const actualCount = Math.min(count, 450 - this.particles.length);
    for (let i = 0; i < actualCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 200;
      this.particles.push({
        pos: pos.clone(),
        vel: Vector2.fromAngle(angle, speed),
        life: 0.2 + Math.random() * 0.3,
        maxLife: 0.5,
        size: 2 + Math.random() * 3,
        color,
        alpha: 1.0
      });
    }
  }

  public spawnExplosion(pos: Vector2, count = 60) {
    if (this.particles.length >= 450) return;
    const actualCount = Math.min(count, 450 - this.particles.length);
    for (let i = 0; i < actualCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 350;
      this.particles.push({
        pos: pos.clone(),
        vel: Vector2.fromAngle(angle, speed),
        life: 0.6 + Math.random() * 0.8,
        maxLife: 1.4,
        size: 4 + Math.random() * 12,
        color: [255, 120 + Math.random() * 80, 30],
        alpha: 1.0
      });
    }
  }

  public spawnAuthenticExplosion(
    pos: Vector2,
    radius = 50,
    color: [number, number, number] = [255, 160, 50],
    hasShockwave = true,
    visualKind: 'impact' | 'missile' | 'ship' = 'impact',
    sourceShipId?: string
  ) {
    this.explosions.push({
      id: Math.random(),
      visualKind,
      sourceShipId,
      pos: pos.clone(),
      radius: radius * 0.4,
      maxRadius: radius,
      life: 0.35,
      maxLife: 0.35,
      frame: 0,
      rotation: Math.random() * Math.PI * 2,
      color,
      hasShockwaveRing: hasShockwave,
      shockwaveRadius: 6,
      maxShockwaveRadius: radius * 1.6
    });
    this.spawnSparks(pos, Math.floor(radius * 0.35), color);
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
      const lateral = (Math.random() - 0.5) * 2 * maxOffset * envelope;
      const axial = (Math.random() - 0.5) * 12;
      const pt = basePoint.clone().add(perp.clone().scale(lateral)).add(dir.clone().scale(axial));
      segments.push(pt);

      const maxBranches = options?.branchCount ?? 3;
      if (Math.random() < 0.4 && branches.length < maxBranches) {
        const branchSegs: Vector2[] = [pt.clone()];
        const branchAngle = dir.heading() + (Math.random() > 0.5 ? 1 : -1) * (0.5 + Math.random() * 0.5);
        let branchCur = pt.clone();
        const branchLen = 25 + Math.random() * 55;
        const bSteps = 3;
        for (let b = 1; b <= bSteps; b++) {
          const stepDist = branchLen / bSteps;
          branchCur = branchCur.clone().add(Vector2.fromAngle(
            branchAngle + (Math.random() - 0.5) * 0.4,
            stepDist
          ));
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

    if (dist > 25) {
      sound.playThrottled('emp_impact', 0.08, 0.4);
    }
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
      id: Math.random(),
      pos: pos.clone().add(new Vector2((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16)),
      text: String(Math.round(amount)),
      color,
      size: Math.min(18, Math.max(12, 11 + Math.sqrt(amount) * 0.35)),
      life,
      maxLife: life,
      vel: new Vector2((Math.random() - 0.5) * 12, -32 - Math.random() * 14)
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
      id: Math.random(),
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
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.35 + Math.random() * 0.65) * baseSpeed;
      const size = baseSize * (0.8 + Math.random() * 0.4);
      const isGlowing = Math.random() > 0.35; // 67% 原版灼热熔融火花红光
      const shardTex = texList[Math.floor(Math.random() * texList.length)];
      const shardColor: [number, number, number] = isGlowing
        ? [255, Math.floor(160 + Math.random() * 85), 80]
        : color;

      const life = maxLife * (0.7 + Math.random() * 0.4);
      this.debris.push({
        pos: pos.clone(),
        vel: Vector2.fromAngle(angle, speed),
        rotation: Math.random() * Math.PI * 2,
        angularVel: (Math.random() - 0.5) * 8.0,
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
