import { Vector2 } from '../../math/Vector2';
import { Ship } from '../Ship';
import { sound } from '../../audio/SoundManager';

export interface CollisionFXCallbacks {
  addFloatingDamage: (pos: Vector2, amount: number, color: [number, number, number]) => void;
  spawnSparks: (pos: Vector2, count?: number, color?: [number, number, number]) => void;
  spawnDebris: (pos: Vector2, count?: number, color?: [number, number, number], baseSpeed?: number) => void;
  addCameraShake: (intensity: number, duration: number) => void;
  getPlayerPos: () => Vector2;
}

/**
 * 战舰刚体冲撞与物理弹性碰撞解算系统 (ShipCollisionSystem)
 * 严格对齐 Starsector 冲撞模型与攻势级冲刺推进撞击伤害机制。
 */
export class ShipCollisionSystem {
  public resolveShipToShipCollision(s1: Ship, s2: Ship, fx: CollisionFXCallbacks, _dt: number) {
    if (s1.isDead || s2.isDead || s1.isPhased || s2.isPhased) return;

    const delta = s2.pos.clone().sub(s1.pos);
    const dist = delta.length();
    const s1ShieldActive = s1.shield.isActive && s1.shield.currentArcDeg > 45 && s1.shield.type !== 'NONE' && s1.shield.type !== 'PHASE';
    const s2ShieldActive = s2.shield.isActive && s2.shield.currentArcDeg > 45 && s2.shield.type !== 'NONE' && s2.shield.type !== 'PHASE';

    const r1 = s1ShieldActive ? s1.shield.radius * 0.92 : s1.spec.collisionRadius;
    const r2 = s2ShieldActive ? s2.shield.radius * 0.92 : s2.spec.collisionRadius;
    const minDist = r1 + r2;

    if (dist < minDist && dist > 0.001) {
      const overlap = minDist - dist;
      const normal = delta.clone().normalize();

      s1.pos.addScaled(normal, -overlap * 0.5);
      s2.pos.addScaled(normal, overlap * 0.5);

      const relVel = s1.vel.clone().sub(s2.vel);
      const impactSpeed = relVel.dot(normal);

      if (impactSpeed > 20) {
        sound.playAtPos('ship_collision', s1.pos, fx.getPlayerPos(), 0.85);
        s1.vel.addScaled(normal, -impactSpeed * 0.4);
        s2.vel.addScaled(normal, impactSpeed * 0.4);

        const ramDmg = impactSpeed * 8;
        const midPoint = s1.pos.clone().add(s2.pos).scale(0.5);

        // 若护盾开启，撞击动能被偏振护盾吸收并转为硬幅能
        if (s1ShieldActive) {
          s1.flux.increaseFlux(ramDmg * 0.8, true);
          s1.shield.ripples.push({
            angle: Math.atan2(midPoint.y - s1.pos.y, midPoint.x - s1.pos.x),
            intensity: Math.min(1.0, impactSpeed / 80),
            life: 0.6,
            color: [255, 200, 100]
          });
        } else {
          const contact1 = normal.clone().scale(s1.spec.collisionRadius * 0.75).rotate(-s1.facingRad);
          s1.armor.takeDamage(contact1, ramDmg, 'HIGH_EXPLOSIVE');
          s1.addScorchMark(contact1, ramDmg);
        }

        if (s2ShieldActive) {
          s2.flux.increaseFlux(ramDmg * 0.8, true);
          s2.shield.ripples.push({
            angle: Math.atan2(midPoint.y - s2.pos.y, midPoint.x - s2.pos.x),
            intensity: Math.min(1.0, impactSpeed / 80),
            life: 0.6,
            color: [255, 200, 100]
          });
        } else {
          const contact2 = normal.clone().scale(-s2.spec.collisionRadius * 0.75).rotate(-s2.facingRad);
          s2.armor.takeDamage(contact2, ramDmg, 'HIGH_EXPLOSIVE');
          s2.addScorchMark(contact2, ramDmg);
        }

        fx.addFloatingDamage(midPoint.clone().add(new Vector2(-25, -25)), ramDmg, [255, 175, 40]);
        fx.addFloatingDamage(midPoint.clone().add(new Vector2(25, 25)), ramDmg, [255, 175, 40]);

        fx.spawnSparks(midPoint, 40, [255, 200, 100]);
        fx.spawnDebris(midPoint, 16, [130, 115, 100], 120);
        fx.addCameraShake(Math.min(30, impactSpeed * 0.25), 0.35);
      }
    }
  }
}
