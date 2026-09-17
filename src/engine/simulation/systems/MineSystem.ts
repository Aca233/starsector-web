import { combatTeam } from "../CombatTeams";
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
import { nativeMineSpec, type NativeMineWeapon } from '../../extensions/NativeMines';
import { effectiveHullModWeaponSpec } from '../../extensions/HullMods';
import { contentRegistry } from '../../content/ContentRegistry';
import { bindProjectileSource, projectileSource } from './weapon/OutgoingDamage';

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
    this.spawnMine(pos, source, ctx, 'minelayer2', { life: 5, fadeIn: .5, sound: 'mine_teleport', stationary: true });
  }

  /** Shared real missile/fuse lifecycle; placement belongs to the source ability. */
  public spawnMine(position: Vector2, source: Ship, ctx: WeaponSimContext, weaponId: NativeMineWeapon,
    options: { life?: number; fadeIn?: number; sound?: string; stationary?: boolean; facing?: number } = {}): SpatialMine {
    const spec = nativeMineSpec(weaponId), fuse = spec.behaviorSpec;
    const base = contentRegistry.getWeapon(weaponId);
    if (!base) throw Error('Missing native mine weapon ' + weaponId);
    const weapon = effectiveHullModWeaponSpec(source.spec, base);
    const mult = source.crDamageDealtMultiplier * source.getWeaponDamageMultiplier('MISSILE');
    const m: SpatialMine = { id: this.random.next(), weaponId, pos: position.clone(),
      vel: options.stationary ? new Vector2() : Vector2.fromAngle(options.facing ?? 0, weapon.launchSpeed ?? spec.speed), sourceShipId: source.id,
      sourceIsPlayer: source.isPlayer, teamId: source.teamId, age: 0, fadeInSeconds: options.fadeIn ?? 1, windupPlayed: false,
      detonatingTimer: fuse.delay, isDetonating: false, triggerRadius: fuse.range,
      explosionRadius: fuse.explosionSpec.radius, damage: weapon.damagePerShot * mult, sourceDamageMultiplier: weapon.damagePerShot / spec.damage * mult,
      life: options.life ?? Math.max(0, (weapon.flightTime ?? 20) - this.random.next()), rotation: this.visualRandom.next() * Math.PI * 2 };
    this.mines.push(m);
    const hp = weapon.missileHp ?? spec.hitpoints;
    ctx.projectiles?.push(bindProjectileSource({ id: m.id, sourceShipId: m.sourceShipId, isPlayer: m.sourceIsPlayer, teamId: m.teamId,
      specId: spec.id, sourceWeaponType: 'MISSILE', spawnLocation: m.pos.clone(), pos: m.pos, prevPos: m.pos.clone(), vel: m.vel,
      damage: m.damage, baseDamage: spec.damage, damageType: 'HIGH_EXPLOSIVE', radius: spec.collisionRadius,
      rangeRemaining: Infinity, totalRange: Infinity, elapsedTime: 0, color: spec.glowColor.slice(0,3) as [number,number,number],
      renderTargetIndicator: (spec as { renderTargetIndicator?: boolean }).renderTargetIndicator,
      isRocket: true, isMine: true, hitpoints: hp, maxHitpoints: hp,
      missileExplosionVisualSpec: { radius: spec.explosionRadius, color: spec.explosionColor as [number,number,number,number] } }, source));
    sound.playAtPos(options.sound ?? 'mine_spawn', m.pos, ctx.playerShip.pos, .9);
    return m;
  }

  public update(dt: number, ctx: WeaponSimContext): void {
    if (dt <= 0) return;
    this.explosions.update(dt, ctx);
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      const spec = nativeMineSpec(m.weaponId), fuse = spec.behaviorSpec;
      const projectile = ctx.projectiles?.find(p => p.id === m.id && p.isMine);
      if (ctx.projectiles && !projectile) { this.mines.splice(i, 1); continue; }
      projectile?.prevPos.copy(m.pos);
      m.age += dt;
      if (projectile?.isDisarmed) {
        m.isDetonating = false; m.life -= dt; m.pos.addScaled(m.vel, dt);
        if (m.life <= 0) { const index = ctx.projectiles!.indexOf(projectile); if (index >= 0) ctx.projectiles!.splice(index, 1); this.mines.splice(i, 1); }
        continue;
      }
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
      const targets = (ctx.ships ?? []).filter(s => !s.isDead && !s.isPhased && s.teamId !== m.teamId);
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
        && combatTeam(p) !== m.teamId && m.pos.distanceTo(p.pos) < m.triggerRadius + p.radius);
      if (m.life <= 1e-9 || closeShip || closeMissile) {
        m.isDetonating = true;
        m.vel.scale(0);
        sound.playAtPos(fuse.pingSound, m.pos, ctx.playerShip.pos, 1);
        // No idle ping loop, fake EMP arcs or decorative damage values.
      }
    }
  }

  private detonate(m: SpatialMine, ctx: WeaponSimContext): void {
    const spec = nativeMineSpec(m.weaponId);
    const explosionSpec: ProjectileExplosionSpec = { ...spec.behaviorSpec.explosionSpec, minDamageFraction: .5, particleColor: spec.behaviorSpec.explosionSpec.particleColor as [number,number,number,number], explosionColor: spec.behaviorSpec.explosionSpec.explosionColor as [number,number,number,number] };
    const missile = ctx.projectiles?.find(p => p.id === m.id && p.isMine);
    const payload: Projectile = {
      id: m.id, sourceShipId: m.sourceShipId, isPlayer: m.sourceIsPlayer, teamId: m.teamId,
      specId: spec.id, sourceWeaponType: 'MISSILE', sourceDamageMultiplier: m.sourceDamageMultiplier, spawnLocation: missile?.spawnLocation, pos: m.pos.clone(), prevPos: m.pos.clone(), vel: new Vector2(),
      damage: m.damage, baseDamage: spec.damage, damageType: 'HIGH_EXPLOSIVE', empDamage: 0,
      radius: spec.collisionRadius, rangeRemaining: 0, totalRange: 0, elapsedTime: 0,
      color: spec.glowColor.slice(0,3) as [number,number,number], projectileExplosionSpec: explosionSpec,
    };
    sound.playAtPos('mine_explosion', m.pos, ctx.playerShip.pos, 1);
    ctx.fx.spawnAuthenticExplosion(m.pos, spec.explosionRadius, spec.explosionColor.slice(0,3) as [number,number,number], false);
    const index = ctx.projectiles?.findIndex(p => p.id === m.id && p.isMine) ?? -1;
    if (index >= 0) ctx.projectiles!.splice(index, 1);
    if (missile) bindProjectileSource(payload, projectileSource(missile, ctx));
    this.explosions.spawn(payload, m.pos, ctx);
  }
}
