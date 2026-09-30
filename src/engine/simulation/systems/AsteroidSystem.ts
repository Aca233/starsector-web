import { applyComponentDamage } from './weapon/ComponentDamage';
import { Vector2 } from '../../math/Vector2';
import { Asteroid } from '../CombatTypes';
import { Ship } from '../Ship';
import { Projectile } from '../Weapon';
import { combatAudio as sound } from '../../audio/CombatAudioEvents';
import { VisualRandom } from '../../runtime/VisualRandom';
import { SimulationRandom } from '../SimulationRandom';
import { getShieldCircleContact } from '../collision/ShieldCollisionGeometry';
import { getHullCircleContact } from '../collision/HullGeometry';

export interface AsteroidFXCallbacks {
  spawnShieldRipple: (pos: Vector2, maxRadius: number, color: [number, number, number]) => void;
  addFloatingDamage: (pos: Vector2, amount: number, color: [number, number, number]) => void;
  addFloatingText: (pos: Vector2, text: string, color: [number, number, number], size: number, duration: number) => void;
  spawnArmorDamageSparks: (ship: Ship, localImpact: Vector2, armorDamage: number) => void;
  spawnSparks: (pos: Vector2, count: number, color: [number, number, number]) => void;
  spawnDebris: (pos: Vector2, count: number, color: [number, number, number], speed: number) => void;
  spawnAuthenticExplosion: (pos: Vector2, radius: number, color: [number, number, number], hasShockwave?: boolean) => void;
  getPlayerPos: () => Vector2;
  detachContrail: (projectileId: number) => void;
}

interface SegmentCircleImpact {
  /** 归一化弹道参数 t ∈ [0, 1]，与 RuntimeCollisionHit.t 可直接比较。 */
  t: number;
  point: Vector2;
}

function segmentCircleImpact(start: Vector2, end: Vector2, center: Vector2, radius: number): SegmentCircleImpact | null {
  const d = end.clone().sub(start);
  const f = start.clone().sub(center);
  const a = d.dot(d);
  if (a <= 1e-12) return start.distanceTo(center) <= radius ? { t: 0, point: start.clone() } : null;
  const b = 2 * f.dot(d);
  const c = f.dot(f) - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const sqrt = Math.sqrt(discriminant);
  const t1 = (-b - sqrt) / (2 * a);
  const t2 = (-b + sqrt) / (2 * a);
  const t = t1 >= 0 && t1 <= 1 ? t1 : t2 >= 0 && t2 <= 1 ? t2 : null;
  return t === null ? null : { t, point: start.clone().addScaled(d, t) };
}

/** 弹丸本帧与最近小行星的扫掠交点 (供武器仿真在舰船碰撞前做优先级比较)。 */
export interface AsteroidProjectileImpact {
  asteroidIndex: number;
  t: number;
  point: Vector2;
}

export class AsteroidSystem {
  public asteroids: Asteroid[] = [];

  constructor(
    private readonly random = new SimulationRandom(),
    private readonly visualRandom = new SimulationRandom(0xa57e01d)
  ) {}

  public init() {
    this.asteroids = [];
    const random = new VisualRandom(0xa57e01d);
    const asteroidSprites = [
      '/game-assets/graphics/asteroids/asteroid1.png',
      '/game-assets/graphics/asteroids/asteroid1.png',
      '/game-assets/graphics/asteroids/asteroid2.png',
      '/game-assets/graphics/asteroids/asteroid3.png',
      '/game-assets/graphics/asteroids/asteroid_big00.png'
    ];

    const count = 18;
    for (let i = 0; i < count; i++) {
      let x = (random.sample('asteroid-x', i) - 0.5) * 3200;
      let y = (random.sample('asteroid-y', i) - 0.5) * 2200;
      if (Math.abs(x) < 400 && Math.abs(y) < 300) {
        x += (x >= 0 ? 450 : -450);
      }

      const isBig = i % 5 === 0;
      const isMedium = i % 2 === 0 && !isBig;
      const radiusSample = random.sample('asteroid-radius', i);
      const radius = isBig ? (50 + radiusSample * 22) : isMedium ? (30 + radiusSample * 14) : (18 + radiusSample * 10);
      const spriteUrl = isBig
        ? '/game-assets/graphics/asteroids/asteroid_big00.png'
        : asteroidSprites[i % (asteroidSprites.length - 1)];

      const hp = isBig ? 1600 : isMedium ? 750 : 350;
      const speed = 15 + random.sample('asteroid-speed', i) * 28;
      const driftAngle = random.sample('asteroid-drift-angle', i) * Math.PI * 2;

      this.asteroids.push({
        id: i + 1,
        pos: new Vector2(x, y),
        vel: new Vector2(Math.cos(driftAngle) * speed, Math.sin(driftAngle) * speed),
        facingRad: random.sample('asteroid-facing', i) * Math.PI * 2,
        angularVel: random.signed('asteroid-angular-velocity', i) * 0.175,
        radius,
        mass: radius * radius * 0.75,
        hp,
        maxHp: hp,
        spriteUrl
      });
    }
  }

  public update(dt: number) {
    for (let i = this.asteroids.length - 1; i >= 0; i--) {
      const ast = this.asteroids[i];
      if (ast.gravityFixed) continue;
      ast.pos.addScaled(ast.vel, dt);
      ast.facingRad += ast.angularVel * dt;

      // 边界循环漂移
      const boundX = 2200;
      const boundY = 1600;
      if (ast.pos.x > boundX) ast.pos.x = -boundX;
      else if (ast.pos.x < -boundX) ast.pos.x = boundX;
      if (ast.pos.y > boundY) ast.pos.y = -boundY;
      else if (ast.pos.y < -boundY) ast.pos.y = boundY;
    }
  }

  public resolveShipCollisions(allShips: Ship[], fx: AsteroidFXCallbacks) {
    const playerPos = fx.getPlayerPos();

    // 1. 小行星与舰船碰撞
    for (let i = 0; i < this.asteroids.length; i++) {
      const ast = this.asteroids[i];
      if (ast.hp <= 0) continue;

      for (const ship of allShips) {
        if (ship.isDead || ship.isCollisionless) continue;
        const shieldContact = getShieldCircleContact(ship, ast.pos, ast.radius);
        if (shieldContact) {
          const relVel = ast.vel.clone().sub(ship.vel);
          const impulse = Math.max(80, relVel.length() * (ast.mass / (ast.mass + ship.spec.mass * 20)));
          const fluxGain = impulse * 2.2;
          ship.shield.recordDamageContact(fluxGain);
          ship.flux.increaseShieldFlux(fluxGain, true);
          fx.spawnShieldRipple(shieldContact.point, 40 + ast.radius, [100, 200, 255]);
          fx.addFloatingDamage(shieldContact.point, fluxGain, [80, 200, 255]);
          sound.playAtPos('collision_asteroid_ship', shieldContact.point, playerPos, 0.6);

          // 护盾作为真实物理表面：沿护盾法线把小行星推出可见弧面。
          if (ast.gravityFixed) ship.assemblyRoot.pos.subScaled(shieldContact.normal, shieldContact.penetration);
          else { ast.vel.addScaled(shieldContact.normal, (impulse / ast.mass) * 80); ast.pos.addScaled(shieldContact.normal, shieldContact.penetration); }
          continue;
        }

        const hullContact = getHullCircleContact(ship, ast.pos, ast.radius);
        if (hullContact) {
          const { point, normal, penetration } = hullContact;

          // 装甲撞击金属与岩石碎屑
          const impactDmg = Math.min(600, 80 + ast.mass * 0.15);
          const localHit = point.clone().sub(ship.pos).rotate(-ship.facingRad);
          const res = ship.armor.takeDamage(localHit, impactDmg, 'KINETIC', impactDmg, false);
          applyComponentDamage(ship, localHit, res, 0);
          fx.spawnArmorDamageSparks(ship, localHit, res.armorDamage);
          ship.applyHullDamage(res.hullDamage);

          if (res.armorDamage > 0) fx.addFloatingDamage(point, res.armorDamage, [255, 180, 50]);
          if (res.hullDamage > 0) fx.addFloatingDamage(point, res.hullDamage, [255, 60, 60]);

          fx.spawnDebris(point, 6, [140, 120, 100], 80);
          sound.playAtPos('collision_asteroid_ship', point, playerPos, 0.7);

          // 物理反冲
          if (ast.gravityFixed) ship.assemblyRoot.pos.subScaled(normal, penetration);
          else { ast.vel.addScaled(normal, 60); ast.pos.addScaled(normal, penetration); }
          ast.hp -= impactDmg * 0.5;
          if (ast.hp <= 0) {
            this.shatter(i, fx);
            break;
          }
        }
      }
    }

    // 2. 小行星与小行星互相碰撞
    for (let i = 0; i < this.asteroids.length; i++) {
      const a1 = this.asteroids[i];
      for (let j = i + 1; j < this.asteroids.length; j++) {
        const a2 = this.asteroids[j];
        if (a1.gravityFixed && a2.gravityFixed) continue;
        const diff = a2.pos.clone().sub(a1.pos);
        const dist = diff.length();
        const minR = a1.radius + a2.radius;
        if (dist < minR) {
          // Array pair order is stable; do not consume gameplay RNG for overlap.
          const n = dist > 1e-12 ? diff.scale(1 / dist) : new Vector2(1, 0);
          const inv1=a1.gravityFixed?0:1/a1.mass,inv2=a2.gravityFixed?0:1/a2.mass;
          const relative=a1.vel.clone().sub(a2.vel).dot(n);
          const kick=Math.max(0,2*relative/(inv1+inv2));
          if (!a1.gravityFixed) {a1.vel.subScaled(n,kick*inv1);a1.pos.subScaled(n,(minR-dist)*inv1/(inv1+inv2));}
          if (!a2.gravityFixed) {a2.vel.addScaled(n,kick*inv2);a2.pos.addScaled(n,(minR-dist)*inv2/(inv1+inv2));}

          if (this.visualRandom.next() < 0.25) {
            sound.playAtPos('collision_asteroid_asteroid', a1.pos, playerPos, 0.35);
          }
        }
      }
    }
  }

  /**
   * 找出弹丸本帧扫掠路径上最先接触的小行星 (取最小 t，而非数组顺序)。
   * 原版弹道阻挡按距离排序，弹丸必须先命中更靠前的小行星。
   */
  public queryProjectileImpact(p: Projectile): AsteroidProjectileImpact | null {
    let best: AsteroidProjectileImpact | null = null;
    for (let j = 0; j < this.asteroids.length; j++) {
      const ast = this.asteroids[j];
      if (ast.hp <= 0 || p.damagedTargetIds?.includes('terrain:asteroid:' + ast.id)) continue;
      const impact = segmentCircleImpact(p.prevPos, p.pos, ast.pos, ast.radius + p.radius);
      if (!impact) continue;
      if (!best || impact.t < best.t) {
        best = { asteroidIndex: j, t: impact.t, point: impact.point };
      }
    }
    return best;
  }

  /** 结算弹丸命中：扣小行星 HP、播放特效，并在 HP 归零时碎裂。 */
  public commitProjectileImpact(
    p: Projectile,
    impact: AsteroidProjectileImpact,
    fx: AsteroidFXCallbacks,
    playerPos: Vector2 = fx.getPlayerPos(),
    projectileFeedbackHandled = false
  ): void {
    const ast = this.asteroids[impact.asteroidIndex];
    if (!ast || ast.hp <= 0) return;

    ast.hp -= p.damage;
    fx.addFloatingDamage(impact.point, p.damage, [200, 180, 140]);
    fx.spawnSparks(impact.point, 12, [255, 180, 80]);
    fx.spawnDebris(impact.point, 4, [130, 110, 90], 60);

    if (p.isRocket && !projectileFeedbackHandled) {
      fx.detachContrail(p.id);
      fx.spawnAuthenticExplosion(impact.point, 60, [255, 120, 40], true);
      sound.playAtPos('explosion', impact.point, playerPos, 0.5);
    }

    if (ast.hp <= 0) {
      this.shatter(impact.asteroidIndex, fx);
    }
  }

  public resolveProjectileCollisions(projectiles: Projectile[], fx: AsteroidFXCallbacks) {
    const playerPos = fx.getPlayerPos();

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      const impact = this.queryProjectileImpact(p);
      if (!impact) continue;

      this.commitProjectileImpact(p, impact, fx, playerPos);
      // 命中即引爆：弹丸不会继续飞向后方的小行星或舰船。
      projectiles.splice(i, 1);
    }
  }

  public shatter(index: number, fx: AsteroidFXCallbacks) {
    const ast = this.asteroids[index];
    if (!ast) return;
    const playerPos = fx.getPlayerPos();
    sound.playAtPos('collision_asteroid_asteroid', ast.pos, playerPos, 0.75);
    fx.spawnAuthenticExplosion(ast.pos, ast.radius * 1.5, [255, 160, 60], true);
    fx.spawnDebris(ast.pos, 16, [140, 120, 95], 140);
    fx.addFloatingText(ast.pos, 'ASTEROID SHATTERED', [210, 180, 120], 13, 1.4);

    // 大中型小行星分裂为 2 枚小石块
    if (ast.radius > 32) {
      const newR = ast.radius * 0.55;
      for (let k = 0; k < 2; k++) {
        const angle = this.random.next() * Math.PI * 2;
        this.asteroids.push({
          id: this.random.next(),
          pos: ast.pos.clone().add(Vector2.fromAngle(angle, newR)),
          vel: ast.vel.clone().add(Vector2.fromAngle(angle, 40 + this.random.next() * 30)),
          facingRad: this.random.next() * Math.PI * 2,
          angularVel: (this.random.next() - 0.5) * 0.8,
          radius: newR,
          mass: newR * newR * 0.75,
          hp: 250,
          maxHp: 250,
          spriteUrl: '/game-assets/graphics/asteroids/asteroid3.png'
        });
      }
    }

    this.asteroids.splice(index, 1);
  }
}
