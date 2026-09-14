import { Vector2 } from '../../math/Vector2';
import { Ship } from '../Ship';
import { sound } from '../../audio/SoundManager';
import {
  getDirectionalHullCollisionExtent,
  getDirectionalShieldCollisionExtent,
  getShieldToShieldContact
} from '../collision/ShieldCollisionGeometry';

export interface CollisionFXCallbacks {
  addFloatingDamage: (pos: Vector2, amount: number, color: [number, number, number]) => void;
  spawnSparks: (pos: Vector2, count?: number, color?: [number, number, number]) => void;
  spawnDebris: (pos: Vector2, count?: number, color?: [number, number, number], baseSpeed?: number) => void;
  addCameraShake: (intensity: number, duration: number) => void;
  getPlayerPos: () => Vector2;
}

interface ShipPairCollisionContact {
  normal: Vector2;
  penetration: number;
  point: Vector2;
  s1Surface: 'HULL' | 'SHIELD';
  s2Surface: 'HULL' | 'SHIELD';
}

function findShipPairCollisionContact(s1: Ship, s2: Ship): ShipPairCollisionContact | null {
  const shieldContact = getShieldToShieldContact(s1, s2);
  if (shieldContact) {
    return {
      normal: shieldContact.normal,
      penetration: shieldContact.penetration,
      point: shieldContact.point,
      s1Surface: 'SHIELD',
      s2Surface: 'SHIELD'
    };
  }

  const delta = s2.pos.clone().sub(s1.pos);
  const dist = delta.length();
  if (dist <= 0.001) return null;
  const normal = delta.scale(1 / dist);

  const s1Hull = getDirectionalHullCollisionExtent(s1, normal);
  const s2Hull = getDirectionalHullCollisionExtent(s2, normal.clone().scale(-1));
  const s1Shield = getDirectionalShieldCollisionExtent(s1, normal);
  const s2Shield = getDirectionalShieldCollisionExtent(s2, normal.clone().scale(-1));
  const candidates = [
    [s1Hull, s2Hull] as const,
    ...(s1Shield ? [[s1Shield, s2Hull] as const] : []),
    ...(s2Shield ? [[s1Hull, s2Shield] as const] : [])
  ];

  let best: ShipPairCollisionContact | null = null;
  for (const [s1Extent, s2Extent] of candidates) {
    const penetration = s1Extent.distance + s2Extent.distance - dist;
    if (penetration <= 0 || (best && penetration <= best.penetration)) continue;
    best = {
      normal,
      penetration,
      point: s1Extent.point.clone().add(s2Extent.point).scale(0.5),
      s1Surface: s1Extent.surface,
      s2Surface: s2Extent.surface
    };
  }
  return best;
}

/**
 * 战舰刚体冲撞与物理弹性碰撞解算系统 (ShipCollisionSystem)
 * 严格对齐 Starsector 冲撞模型与攻势级冲刺推进撞击伤害机制。
 */
export class ShipCollisionSystem {
  public resolveShipToShipCollision(s1: Ship, s2: Ship, fx: CollisionFXCallbacks, _dt: number) {
    if (s1.isDead || s2.isDead || s1.isPhased || s2.isPhased) return;

    const contact = findShipPairCollisionContact(s1, s2);
    if (contact) {
      const { normal, penetration: overlap, point: contactPoint } = contact;
      const s1ShieldContact = contact.s1Surface === 'SHIELD';
      const s2ShieldContact = contact.s2Surface === 'SHIELD';

      s1.pos.addScaled(normal, -overlap * 0.5);
      s2.pos.addScaled(normal, overlap * 0.5);

      const relVel = s1.vel.clone().sub(s2.vel);
      const impactSpeed = relVel.dot(normal);

      if (impactSpeed > 20) {
        sound.playAtPos('ship_collision', s1.pos, fx.getPlayerPos(), 0.85);
        s1.vel.addScaled(normal, -impactSpeed * 0.4);
        s2.vel.addScaled(normal, impactSpeed * 0.4);

        const ramDmg = impactSpeed * 8;

        // 只有实际接触到已展开的护盾弧面时，撞击动能才转为硬幅能。
        if (s1ShieldContact) {
          s1.flux.increaseFlux(ramDmg * 0.8, true);
          const s1ShieldCenter = s1.getShieldCenter();
          s1.shield.ripples.push({
            angle: Math.atan2(contactPoint.y - s1ShieldCenter.y, contactPoint.x - s1ShieldCenter.x),
            intensity: Math.min(1.0, impactSpeed / 80),
            life: 0.6,
            color: [255, 200, 100]
          });
        } else {
          const contact1 = normal.clone().scale(s1.spec.collisionRadius * 0.75).rotate(-s1.facingRad);
          s1.armor.takeDamage(contact1, ramDmg, 'HIGH_EXPLOSIVE');
          s1.addScorchMark(contact1, ramDmg);
        }

        if (s2ShieldContact) {
          s2.flux.increaseFlux(ramDmg * 0.8, true);
          const s2ShieldCenter = s2.getShieldCenter();
          s2.shield.ripples.push({
            angle: Math.atan2(contactPoint.y - s2ShieldCenter.y, contactPoint.x - s2ShieldCenter.x),
            intensity: Math.min(1.0, impactSpeed / 80),
            life: 0.6,
            color: [255, 200, 100]
          });
        } else {
          const contact2 = normal.clone().scale(-s2.spec.collisionRadius * 0.75).rotate(-s2.facingRad);
          s2.armor.takeDamage(contact2, ramDmg, 'HIGH_EXPLOSIVE');
          s2.addScorchMark(contact2, ramDmg);
        }

        fx.addFloatingDamage(contactPoint.clone().add(new Vector2(-25, -25)), ramDmg, [255, 175, 40]);
        fx.addFloatingDamage(contactPoint.clone().add(new Vector2(25, 25)), ramDmg, [255, 175, 40]);

        fx.spawnSparks(contactPoint, 40, [255, 200, 100]);
        fx.spawnDebris(contactPoint, 16, [130, 115, 100], 120);
        fx.addCameraShake(Math.min(30, impactSpeed * 0.25), 0.35);
      }
    }
  }
}
