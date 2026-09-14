import { Vector2 } from '../../math/Vector2';
import { SpatialMine } from '../CombatTypes';
import { Ship } from '../Ship';
import { sound } from '../../audio/SoundManager';
import { SimulationRandom } from '../SimulationRandom';

export interface MineFXCallbacks {
  spawnShieldRipple: (pos: Vector2, maxRadius: number, color: [number, number, number]) => void;
  spawnSparks: (pos: Vector2, count: number, color: [number, number, number]) => void;
  spawnAuthenticExplosion: (pos: Vector2, radius: number, color: [number, number, number], hasShockwave?: boolean) => void;
  spawnDebris: (pos: Vector2, count: number, color: [number, number, number], speed: number) => void;
  spawnExplosion: (pos: Vector2, count: number) => void;
  spawnEmpArc: (from: Vector2, to: Vector2) => void;
  addFloatingDamage: (pos: Vector2, amount: number, color: [number, number, number]) => void;
  addCameraShake: (intensity: number, duration: number) => void;
  getPlayerPos: () => Vector2;
}

export class MineSystem {
  public mines: SpatialMine[] = [];

  constructor(
    private readonly random = new SimulationRandom(),
    private readonly visualRandom = new SimulationRandom(0x4d494e45)
  ) {}

  public clear() {
    this.mines = [];
  }

  public deployMine(targetPos: Vector2, sourceShip: Ship, fx: MineFXCallbacks) {
    const playerPos = fx.getPlayerPos();
    sound.playAtPos('mine_teleport', targetPos, playerPos, 0.9);
    // 空间折跃能量环
    fx.spawnShieldRipple(targetPos, 80, [150, 100, 255]);
    fx.spawnSparks(targetPos, 25, [180, 120, 255]);

    this.mines.push({
      id: this.random.next(),
      pos: targetPos.clone(),
      vel: new Vector2(),
      sourceShipId: sourceShip.id,
      armedTimer: 1.2,
      isArmed: false,
      detonatingTimer: 0.6,
      isDetonating: false,
      triggerRadius: 220,
      explosionRadius: 380,
      damage: 1000,
      life: 12.0,
      pingTimer: 0.5,
      rotation: this.visualRandom.next() * Math.PI * 2
    });
  }

  public update(dt: number, ships: Ship[], fx: MineFXCallbacks) {
    const playerPos = fx.getPlayerPos();

    for (let i = this.mines.length - 1; i >= 0; i--) {
      const mine = this.mines[i];
      mine.life -= dt;
      mine.rotation += dt * 0.5;

      if (mine.life <= 0) {
        this.mines.splice(i, 1);
        continue;
      }

      // 1. 激活武装计时
      if (!mine.isArmed) {
        mine.armedTimer -= dt;
        if (mine.armedTimer <= 0) {
          mine.isArmed = true;
        }
      }

      // 2. 周期性雷达警示音与光环
      mine.pingTimer -= dt;
      if (mine.pingTimer <= 0) {
        mine.pingTimer = 0.7;
        sound.playAtPos('mine_ping', mine.pos, playerPos, 0.5);
        fx.spawnShieldRipple(mine.pos, mine.isDetonating ? 120 : 60, [255, 60, 60]);
      }

      // 3. 引信侦测与引爆倒计时
      if (mine.isArmed && !mine.isDetonating) {
        for (const ship of ships) {
          if (ship.id === mine.sourceShipId || ship.isDead || ship.isPhased) continue;
          const dist = mine.pos.distanceTo(ship.pos);
          if (dist <= mine.triggerRadius + ship.spec.collisionRadius * 0.5) {
            mine.isDetonating = true;
            sound.playAtPos('mine_windup', mine.pos, playerPos, 0.9);
            break;
          }
        }
      }

      // 4. 引爆阶段
      if (mine.isDetonating) {
        mine.detonatingTimer -= dt;
        // 临近爆炸火花激涌
        if (this.visualRandom.next() < 0.5) {
          fx.spawnSparks(mine.pos, 4, [255, 80, 50]);
        }

        if (mine.detonatingTimer <= 0) {
          // 产生巨型爆轰！
          sound.playAtPos('mine_explosion', mine.pos, playerPos, 1.0);
          fx.spawnAuthenticExplosion(mine.pos, 120, [255, 90, 40], true);
          fx.spawnSparks(mine.pos, 45, [255, 180, 60]);
          fx.spawnDebris(mine.pos, 12, [140, 110, 90], 180);
          fx.addCameraShake(18, 0.4);

          // 空间范围伤害判定
          for (const target of ships) {
            if (target.isDead || target.isPhased) continue;
            const dist = mine.pos.distanceTo(target.pos);
            if (dist <= mine.explosionRadius) {
              const damageFalloff = 1.0 - (dist / mine.explosionRadius) * 0.4;
              const dmg = mine.damage * damageFalloff;

              // 护盾阻挡判定
              if (target.isShieldPointBlocked(mine.pos)) {
                const shieldMult = target.system.getShieldDamageMultiplier();
                const absorbedDmg = dmg * shieldMult * 0.5; // HE 对盾 50%
                const hitAngle = mine.pos.clone().sub(target.getShieldCenter()).heading();
                const fluxGain = target.shield.absorbDamage(absorbedDmg, 'HIGH_EXPLOSIVE', hitAngle);
                target.flux.increaseFlux(fluxGain, true);
                fx.addFloatingDamage(mine.pos, absorbedDmg, [80, 200, 255]);
                fx.spawnShieldRipple(mine.pos, 90, [255, 120, 50]);
              } else {
                // 装甲与船体毁灭破坏
                const localImpact = mine.pos.clone().sub(target.pos).rotate(-target.facingRad);
                const res = target.armor.takeDamage(localImpact, dmg, 'HIGH_EXPLOSIVE', dmg, false);
                target.hullHp = Math.max(0, target.hullHp - res.hullDamage);
                target.addScorchMark(localImpact, res.armorDamage || res.hullDamage);
                if (res.armorDamage > 0) {
                  fx.addFloatingDamage(mine.pos, res.armorDamage, [255, 175, 40]);
                }
                if (res.hullDamage > 0) {
                  fx.addFloatingDamage(mine.pos, res.hullDamage, [255, 55, 45]);
                }
                // EMP 电击船体
                for (let k = 0; k < 4; k++) {
                  const empTarget = target.pos.clone().add(
                    new Vector2((this.visualRandom.next() - 0.5) * 100, (this.visualRandom.next() - 0.5) * 100)
                  );
                  fx.spawnEmpArc(mine.pos, empTarget);
                }
                fx.addFloatingDamage(mine.pos.clone().add(new Vector2(15, -15)), 600, [130, 220, 255]);

                if (target.hullHp <= 0) {
                  target.isDead = true;
                  sound.playAtPos('explosion', target.pos, playerPos, 0.95);
                  fx.spawnExplosion(target.pos, 120);
                }
              }
            }
          }

          this.mines.splice(i, 1);
        }
      }
    }
  }
}
