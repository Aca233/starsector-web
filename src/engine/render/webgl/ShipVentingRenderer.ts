import type { VisualRandom } from '../../runtime/VisualRandom';
import { Vector2 } from '../../math/Vector2';
import type { Ship } from '../../simulation/Ship';
import type { SpriteBatcher } from './SpriteBatcher';
import type { RibbonBatcher } from './RibbonBatcher';
import type { WebGLTextureManager } from './WebGLTextureManager';
import { getShipVisualProfile } from '../../visual/VisualProfiles';
import { getVentExtent, getVentTargetingRadius } from '../../visual/VentingVisuals';

interface VentParticle {
  pos: Vector2;
  vel: Vector2;
  brakeDirection: Vector2;
  brakeBudget: number;
  initialBrakeBudget: number;
  life: number;
  maxLife: number;
  sizeScale: number;
  age: number;
  rotation: number;
  spin: number;
  column: number;
  row: number;
}

interface VentEmitter {
  angle: number;
  localPos: Vector2;
  interval: number;
  elapsed: number;
  spawnIndex: number;
}

export interface VentVisualState {
  particleCount: number;
  emitterCount: number;
  faderIn: number;
  faderSize: number;
  radialTime: number;
}

/**
 * Source-backed standard vent path: renderers/ventingAnimation, float.java and
 * hull_styles.json. Seeded visual randomness replaces Java's global randomness;
 * matched original captures are still needed for final appearance acceptance.
 */
export class ShipVentingRenderer {
  private particles: VentParticle[] = [];
  private emitters: VentEmitter[] = [];
  private faderIn = 0;
  private faderSize = 0;
  private radialTime = 0;
  private wasVenting = false;
  private initializedForShipId: string | null = null;

  public static readonly NEBULA_TEX = '/game-assets/graphics/fx/nebula_colorless.png';
  public static readonly RADIAL_TEX = '/game-assets/graphics/fx/radial_fx.png';

  private initEmittersIfNeeded(ship: Ship, random: VisualRandom) {
    if (this.initializedForShipId === ship.id) return;
    this.initializedForShipId = ship.id;
    const count = ship.flux.hullSize === 'CAPITAL_SHIP' ? 18 : ship.flux.hullSize === 'FIGHTER' ? 4 : 12;
    const inset = Math.max(0, Math.min(50, (ship.spec.collisionRadius - 50) * 0.33));
    this.emitters = Array.from({ length: count }, (_, i) => {
      const angle = i * Math.PI * 2 / count;
      const radius = getVentTargetingRadius(ship.spec, angle);
      return {
        angle, localPos: Vector2.fromAngle(angle, radius - Math.min(radius * 0.2, inset)),
        interval: 0.1 + random.sample(ship.id + ':vent-interval:' + i, 0) * 0.1,
        elapsed: 0, spawnIndex: 0
      };
    });
  }

  public reset() {
    this.particles = [];
    this.emitters = [];
    this.initializedForShipId = null;
    this.faderIn = this.faderSize = this.radialTime = 0;
    this.wasVenting = false;
  }

  public getVisualState(): VentVisualState {
    return {
      particleCount: this.particles.length, emitterCount: this.emitters.length,
      faderIn: this.faderIn, faderSize: this.faderSize, radialTime: this.radialTime
    };
  }

  public update(dt: number, ship: Ship, random: VisualRandom) {
    this.initEmittersIfNeeded(ship, random);
    const venting = ship.flux.isVenting && !ship.isDead;
    if (!venting) {
      // Ship.java neither advances nor draws the animation after venting stops.
      // Discard invisible particles early; a new vent clears them in the source.
      this.particles = [];
      this.wasVenting = false;
      return;
    }
    if (!this.wasVenting) {
      this.particles = [];
      this.faderIn = this.faderSize = 0;
    }
    this.wasVenting = true;
    const amount = Math.max(0, dt) * 1.24;
    this.faderIn = Math.min(1, this.faderIn + amount / 0.3);
    this.faderSize = Math.min(1, this.faderSize + amount / 0.6);
    this.radialTime += amount;
    const extent = getVentExtent(ship.spec);
    const speed = extent * 0.75;
    const fluxLevel = ship.flux.fluxPercent;

    for (let i = 0; i < this.emitters.length; i++) {
      const emitter = this.emitters[i];
      emitter.elapsed += amount;
      if (emitter.elapsed < emitter.interval) continue;
      const sample = (channel: string) => random.sample(ship.id + ':vent-' + channel + ':' + i, emitter.spawnIndex);
      const offset = emitter.localPos.clone().rotate(ship.facingRad);
      const angle = emitter.angle + ship.facingRad;
      const radialVelocity = Vector2.fromAngle(angle, speed);
      const turnSpeed = Math.min(offset.length() * Math.abs(ship.angularVelRad), Math.min(Math.max(speed, 50), 100)) * 3;
      const tangent = Vector2.fromAngle(angle + Math.sign(ship.angularVelRad) * Math.PI / 2, turnSpeed);
      const outwardVelocity = radialVelocity.clone().add(tangent);
      const brakeBudget = outwardVelocity.length();
      const life = (1.5 + sample('life')) * Math.max(0.5, Math.min(extent / 250, 1))
        * 0.5 * (0.5 + 0.5 * fluxLevel);
      this.particles.push({
        pos: ship.pos.clone().add(offset), vel: outwardVelocity.clone().add(ship.vel),
        brakeDirection: outwardVelocity.clone().scale(-1 / Math.max(0.001, brakeBudget)),
        brakeBudget, initialBrakeBudget: brakeBudget,
        life, maxLife: life, age: 0, sizeScale: 0.7 + 0.6 * sample('size'),
        rotation: sample('rotation') * Math.PI * 2,
        spin: Math.sign(sample('spin-sign') - 0.5) * Math.PI / 6 * sample('spin'),
        column: Math.floor(sample('column') * 4), row: Math.floor(sample('row') * 4)
      });
      emitter.spawnIndex++;
      // IntervalUtil rerolls and discards overshoot after each event; no burst catch-up.
      emitter.elapsed = 0;
      emitter.interval = 0.1 + random.sample(ship.id + ':vent-interval:' + i, emitter.spawnIndex) * 0.1;
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.sizeScale += 3 / p.maxLife * amount;
      p.pos.x += p.vel.x * amount;
      p.pos.y += p.vel.y * amount;
      if (p.brakeBudget > 0) {
        const decrement = Math.min(p.brakeBudget, p.initialBrakeBudget * amount / p.maxLife) * 0.5;
        p.vel.x += p.brakeDirection.x * decrement;
        p.vel.y += p.brakeDirection.y * decrement;
        p.brakeBudget -= decrement;
      }
      p.rotation += p.spin * amount;
      p.age += amount;
      p.life -= amount;
      if (p.life <= -0.1) this.particles.splice(i, 1);
    }
  }

  public renderRadialHalo(
    batcher: SpriteBatcher, ribbonBatcher: RibbonBatcher, textures: WebGLTextureManager,
    ship: Ship, shipPos: Vector2, shipFacing: number, alphaMult = 1
  ) {
    if (!ship.flux.isVenting || ship.isDead || ship.flux.hullSize === 'FIGHTER' || this.faderIn <= 0) return;
    const profile = getShipVisualProfile(ship.spec).vent;
    const color = profile.fringeColor.map((c, i) => Math.floor(c * 0.4 + profile.coreColor[i] * 0.6)) as [number, number, number];
    const extent = getVentExtent(ship.spec);
    batcher.flush();
    ribbonBatcher.begin(batcher.currentViewProj);
    ribbonBatcher.drawRadialHalo(textures.getTexture(ShipVentingRenderer.RADIAL_TEX, true),
      shipPos, shipFacing, ship.spec, extent * 0.25, extent * (0.25 + 0.75 * this.faderSize),
      color, alphaMult * this.faderIn * 0.6, this.radialTime);
    ribbonBatcher.end();
    batcher.resumeProgram();
  }

  public renderVentPlumes(batcher: SpriteBatcher, textures: WebGLTextureManager, ship: Ship, alphaMult = 1) {
    if (!ship.flux.isVenting || ship.isDead || this.particles.length === 0) return;
    const texture = textures.getTexture(ShipVentingRenderer.NEBULA_TEX);
    const profile = getShipVisualProfile(ship.spec).vent;
    const fluxLevel = ship.flux.fluxPercent;
    const baseSize = Math.max(25, getVentExtent(ship.spec) * 0.25 * (0.25 + 0.75 * this.faderIn));
    const shipAlpha = alphaMult * (ship.flux.hullSize === 'FIGHTER' ? 1 : 0.9);
    batcher.setBlendMode('ADDITIVE');
    for (const p of this.particles) {
      const fadeOutDuration = Math.min(1.5, p.maxLife * 0.75);
      const opacity = shipAlpha * Math.min(1, p.age / 0.2) * Math.max(0, Math.min(1, p.life / fadeOutDuration));
      if (opacity <= 0) continue;
      const size = baseSize * p.sizeScale;
      const u = p.column / 4;
      const v = p.row / 4;
      const draw = (color: [number, number, number], alpha: number) => batcher.drawSprite(
        texture, p.pos.x, p.pos.y, size, size, p.rotation, 0, 0,
        color[0] / 255, color[1] / 255, color[2] / 255, alpha, u, v, u + 0.25, v + 0.25);
      draw(profile.fringeColor, opacity * (0.35 + fluxLevel * 0.2));
      draw(profile.coreColor, opacity * (0.15 + fluxLevel * 0.1));
    }
  }

  public render(
    batcher: SpriteBatcher, ribbonBatcher: RibbonBatcher, textures: WebGLTextureManager,
    ship: Ship, shipPos: Vector2, shipFacing: number, alphaMult = 1
  ) {
    this.renderRadialHalo(batcher, ribbonBatcher, textures, ship, shipPos, shipFacing, alphaMult);
    this.renderVentPlumes(batcher, textures, ship, alphaMult);
  }
}
