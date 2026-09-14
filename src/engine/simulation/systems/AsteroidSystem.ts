import { Vector2 } from '../../math/Vector2';
import { Asteroid } from '../CombatTypes';
import { Ship } from '../Ship';
import { Projectile } from '../Weapon';
import { sound } from '../../audio/SoundManager';
import { VisualRandom } from '../../runtime/VisualRandom';
import { SimulationRandom } from '../SimulationRandom';
import { getShieldCircleContact } from '../collision/ShieldCollisionGeometry';

export interface AsteroidFXCallbacks {
  spawnShieldRipple: (pos: Vector2, maxRadius: number, color: [number, number, number]) => void;
  addFloatingDamage: (pos: Vector2, amount: number, color: [number, number, number]) => void;
  addFloatingText: (pos: Vector2, text: string, color: [number, number, number], size: number, duration: number) => void;
  spawnSparks: (pos: Vector2, count: number, color: [number, number, number]) => void;
  spawnDebris: (pos: Vector2, count: number, color: [number, number, number], speed: number) => void;
  spawnAuthenticExplosion: (pos: Vector2, radius: number, color: [number, number, number], hasShockwave?: boolean) => void;
  getPlayerPos: () => Vector2;
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
        if (ship.isDead || ship.isPhased) continue;
        const shieldContact = getShieldCircleContact(ship, ast.pos, ast.radius);
        if (shieldContact) {
          const relVel = ast.vel.clone().sub(ship.vel);
          const impulse = Math.max(80, relVel.length() * (ast.mass / (ast.mass + ship.spec.mass * 20)));
          const fluxGain = impulse * 2.2;
          ship.flux.increaseFlux(fluxGain, true);
          fx.spawnShieldRipple(shieldContact.point, 40 + ast.radius, [100, 200, 255]);
          fx.addFloatingDamage(shieldContact.point, fluxGain, [80, 200, 255]);
          sound.playAtPos('collision_asteroid_ship', shieldContact.point, playerPos, 0.6);

          // 护盾作为真实物理表面：沿护盾法线把小行星推出可见弧面。
          ast.vel.addScaled(shieldContact.normal, (impulse / ast.mass) * 80);
          ast.pos.addScaled(shieldContact.normal, shieldContact.penetration);
          continue;
        }

        const toShip = ship.pos.clone().sub(ast.pos);
        const dist = toShip.length();
        const combinedR = ast.radius + ship.spec.collisionRadius;
        if (dist < combinedR && dist > 0.001) {
          const normal = toShip.clone().normalize();
          const overlap = combinedR - dist;

          // 装甲撞击金属与岩石碎屑
          const impactDmg = Math.min(600, 80 + ast.mass * 0.15);
          const localHit = ast.pos.clone().sub(ship.pos).rotate(-ship.facingRad);
          const res = ship.armor.takeDamage(localHit, impactDmg, 'KINETIC', impactDmg, false);
          ship.hullHp = Math.max(0, ship.hullHp - res.hullDamage);
          ship.addScorchMark(localHit, res.armorDamage || res.hullDamage);

          if (res.armorDamage > 0) fx.addFloatingDamage(ast.pos, res.armorDamage, [255, 180, 50]);
          if (res.hullDamage > 0) fx.addFloatingDamage(ast.pos, res.hullDamage, [255, 60, 60]);

          fx.spawnSparks(ast.pos, 15, [255, 170, 70]);
          fx.spawnDebris(ast.pos, 6, [140, 120, 100], 80);
          sound.playAtPos('collision_asteroid_ship', ast.pos, playerPos, 0.7);

          // 物理反冲
          ast.vel.subScaled(normal, 60);
          ast.pos.subScaled(normal, overlap);
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
        const diff = a2.pos.clone().sub(a1.pos);
        const dist = diff.length();
        const minR = a1.radius + a2.radius;
        if (dist < minR && dist > 0.001) {
          const n = diff.normalize();
          const p = (2 * (a1.vel.x * n.x + a1.vel.y * n.y - a2.vel.x * n.x - a2.vel.y * n.y)) / (a1.mass + a2.mass);
          a1.vel.subScaled(n, p * a2.mass);
          a2.vel.addScaled(n, p * a1.mass);

          const overlap = 0.5 * (minR - dist);
          a1.pos.subScaled(n, overlap);
          a2.pos.addScaled(n, overlap);

          if (this.visualRandom.next() < 0.25) {
            sound.playAtPos('collision_asteroid_asteroid', a1.pos, playerPos, 0.35);
          }
        }
      }
    }
  }

  public resolveProjectileCollisions(projectiles: Projectile[], fx: AsteroidFXCallbacks) {
    const playerPos = fx.getPlayerPos();

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      for (let j = this.asteroids.length - 1; j >= 0; j--) {
        const ast = this.asteroids[j];
        if (ast.hp <= 0) continue;

        if (p.pos.distanceTo(ast.pos) < ast.radius + p.radius) {
          // 击中小行星！弹丸引爆
          ast.hp -= p.damage;
          fx.addFloatingDamage(p.pos, p.damage, [200, 180, 140]);
          fx.spawnSparks(p.pos, 12, [255, 180, 80]);
          fx.spawnDebris(p.pos, 4, [130, 110, 90], 60);

          if (p.isRocket) {
            fx.spawnAuthenticExplosion(p.pos, 60, [255, 120, 40], true);
            sound.playAtPos('explosion', p.pos, playerPos, 0.5);
          }

          projectiles.splice(i, 1);

          if (ast.hp <= 0) {
            this.shatter(j, fx);
          }
          break;
        }
      }
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
