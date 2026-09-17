import { Vector2 } from '../../math/Vector2';
import type { SpatialMine } from '../CombatTypes';
import type { Ship } from '../Ship';
import type { Projectile, ProjectileExplosionSpec } from '../Weapon';
import type { WeaponSimContext } from './weapon/WeaponSimContext';
import { ProjectileExplosionSystem } from './weapon/ProjectileExplosionSystem';
import { getShipExplosionContact } from '../collision/ExplosionContact';
import { sound } from '../../audio/SoundManager';
import { SimulationRandom } from '../SimulationRandom';
import spec from '../../data/generated/mine-spec.json';

const fuse = spec.behaviorSpec;
const explosionSpec: ProjectileExplosionSpec = {
  ...fuse.explosionSpec, minDamageFraction: 0.5,
  particleColor: [...fuse.explosionSpec.particleColor] as [number, number, number, number],
  explosionColor: [...fuse.explosionSpec.explosionColor] as [number, number, number, number],
};

/** MineStrikeStats + GuidedProximityFuseAI timing/data. Steering is a Web adapter,
 * not the complete native MissileAI; damage uses the shared explosion contact path. */
export class MineSystem {
  public mines: SpatialMine[] = [];
  private explosions = new ProjectileExplosionSystem();

  constructor(private readonly random = new SimulationRandom(),
    private readonly visualRandom = new SimulationRandom(0x4d494e45)) {}

  public clear(): void { this.mines = []; this.explosions.active = []; }

  public deployMine(target: Vector2, source: Ship, ctx: WeaponSimContext, range = 1000): void {
    const delta = target.clone().sub(source.pos), maxRange = Math.max(0, range) + source.spec.collisionRadius;
    let center = delta.length() > maxRange ? source.pos.clone().add(delta.normalize().scale(maxRange)) : target.clone();
    const clear = (pos: Vector2) => !(ctx.ships ?? []).some(s => s.spec.hullSize !== 'FIGHTER'
      && pos.distanceTo(s.getShieldCenter()) < s.shield.radius + (s.spec.hullSize === 'FRIGATE' ? 110 : 75))
      && !(ctx.asteroids ?? []).some(a => pos.distanceTo(a.pos) < a.radius + 75);
    if (!clear(center)) {
      const tried: Vector2[] = [];
      let found: Vector2 | undefined;
      for (let ring = 1; ring <= 32 && !found; ring *= 2) {
        const start = this.random.next() * Math.PI * 2;
        for (let i = 0; i < 6; i++) {
          const p = center.clone().add(Vector2.fromAngle(start + i * Math.PI / 3, 50 * ring));
          tried.push(p);
          if (clear(p)) { found = p; break; }
        }
      }
      center = found ?? tried[Math.floor(this.random.next() * tried.length)] ?? center;
    }
    const offset = () => center.clone().add(Vector2.fromAngle(this.random.next() * Math.PI * 2, 30 + this.random.next() * 30));
    let pos = offset();
    const start = this.random.next() * Math.PI * 2;
    for (let i = 0; i <= 12; i++) {
      if (i > 0) pos = center.clone().add(Vector2.fromAngle(start + i * Math.PI / 6, 50 + this.random.next() * 30));
      if (!this.mines.some(m => m.pos.distanceTo(pos) < spec.collisionRadius + 40)) break;
      if (i === 12) pos = offset();
    }
    this.mines.push({ id: this.random.next(), pos, vel: new Vector2(), sourceShipId: source.id,
      sourceIsPlayer: source.isPlayer, age: 0, windupPlayed: false,
      detonatingTimer: fuse.delay, isDetonating: false, triggerRadius: fuse.range,
      explosionRadius: explosionSpec.radius, damage: spec.damage * source.crDamageDealtMultiplier,
      life: 5, rotation: this.visualRandom.next() * Math.PI * 2 });
    const m = this.mines[this.mines.length - 1];
    ctx.projectiles?.push({ id: m.id, sourceShipId: m.sourceShipId, isPlayer: m.sourceIsPlayer,
      specId: spec.id, pos: m.pos, prevPos: m.pos.clone(), vel: m.vel,
      damage: m.damage, damageType: 'HIGH_EXPLOSIVE', radius: spec.collisionRadius,
      rangeRemaining: Infinity, totalRange: Infinity, elapsedTime: 0, color: [148, 70, 211],
      renderTargetIndicator: (spec as { renderTargetIndicator?: boolean }).renderTargetIndicator,
      isRocket: true, isMine: true, hitpoints: spec.hitpoints, maxHitpoints: spec.hitpoints,
      missileExplosionVisualSpec: { radius: spec.explosionRadius, color: [148, 0, 211, 255] } });
    sound.playAtPos('mine_teleport', pos, ctx.playerShip.pos, 0.9);
  }

  public update(dt: number, ctx: WeaponSimContext): void {
    if (dt <= 0) return;
    this.explosions.update(dt, ctx);
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      const projectile = ctx.projectiles?.find(p => p.id === m.id && p.isMine);
      if (ctx.projectiles && !projectile) { this.mines.splice(i, 1); continue; }
      projectile?.prevPos.copy(m.pos);
      m.age += dt;
      if (m.isDetonating) {
        // The native three seconds start at priming, not at deployment.
        m.detonatingTimer -= dt;
        if (!m.windupPlayed && m.detonatingTimer < fuse.windupDelay) {
          m.windupPlayed = true;
          sound.playAtPos(fuse.windupSound, m.pos, ctx.playerShip.pos, 1);
        }
        if (m.detonatingTimer <= 1e-9) {
          this.detonate(m, ctx);
          this.mines.splice(i, 1);
        }
        continue;
      }
      m.life -= dt;
      const targets = (ctx.ships ?? []).filter(s => !s.isDead && !s.isPhased && s.isPlayer !== m.sourceIsPlayer);
      const nearest = targets.reduce<Ship | undefined>((a, b) => !a || b.pos.distanceTo(m.pos) < a.pos.distanceTo(m.pos) ? b : a, undefined);
      // Source max speed/acceleration; native target-choice/turning remains a port boundary.
      if (nearest) {
        const desired = nearest.pos.clone().sub(m.pos).normalize().scale(spec.speed);
        const change = desired.sub(m.vel);
        const amount = Math.min(change.length(), spec.engineSpec.acc * dt);
        m.vel.addScaled(change.normalize(), amount);
        m.pos.addScaled(m.vel, dt);
      }
      const closeShip = targets.some(s => getShipExplosionContact(s, m.pos).distance < m.triggerRadius);
      const closeMissile = (ctx.projectiles ?? []).some(p => p.isRocket && !p.didDamage && !p.isFlare
        && p.isPlayer !== m.sourceIsPlayer && m.pos.distanceTo(p.pos) < m.triggerRadius + p.radius);
      if (m.life <= 1e-9 || closeShip || closeMissile) {
        m.isDetonating = true;
        m.vel.scale(0);
        sound.playAtPos(fuse.pingSound, m.pos, ctx.playerShip.pos, 1);
        // No idle ping loop, fake EMP arcs or decorative damage values.
      }
    }
  }

  private detonate(m: SpatialMine, ctx: WeaponSimContext): void {
    const payload: Projectile = {
      id: m.id, sourceShipId: m.sourceShipId, isPlayer: m.sourceIsPlayer,
      specId: spec.id, pos: m.pos.clone(), prevPos: m.pos.clone(), vel: new Vector2(),
      damage: m.damage, baseDamage: spec.damage, damageType: 'HIGH_EXPLOSIVE', empDamage: 0,
      radius: spec.collisionRadius, rangeRemaining: 0, totalRange: 0, elapsedTime: 0,
      color: [148, 70, 211], projectileExplosionSpec: explosionSpec,
    };
    sound.playAtPos('mine_explosion', m.pos, ctx.playerShip.pos, 1);
    ctx.fx.spawnAuthenticExplosion(m.pos, spec.explosionRadius, [148, 70, 211], false);
    const index = ctx.projectiles?.findIndex(p => p.id === m.id && p.isMine) ?? -1;
    if (index >= 0) ctx.projectiles!.splice(index, 1);
    this.explosions.spawn(payload, m.pos, ctx);
  }
}
