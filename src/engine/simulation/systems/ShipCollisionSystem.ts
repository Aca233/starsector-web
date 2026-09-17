import { applyComponentDamage } from './weapon/ComponentDamage';
import { isImmutableMetadata } from '../../extensions/Immutable';
import { Vector2 } from '../../math/Vector2';
import { Ship } from '../Ship';
import { sound } from '../../audio/SoundManager';
import {
  isShieldCollisionActive,
  shieldCenterOffset,
  getDirectionalHullCollisionExtent,
  getDirectionalShieldCollisionExtent,
  getShieldToShieldContact
} from '../collision/ShieldCollisionGeometry';

export interface CollisionFXCallbacks {
  addFloatingDamage: (pos: Vector2, amount: number, color: [number, number, number]) => void;
  spawnArmorDamageSparks: (ship: Ship, localImpact: Vector2, armorDamage: number) => void;
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

const immutableHullRadii = new WeakMap<object, number>();

/** Enclosing radius only, never a substitute for the authored contact surface. */
function contactBroadphaseRadius(ship: Ship): number {
  const bounds = ship.spec.bounds;
  let hullRadius = 0;
  if (bounds && bounds.length >= 3) {
    const cached = immutableHullRadii.get(bounds);
    if (cached !== undefined) hullRadius = cached;
    else {
      for (const [x, y] of bounds) hullRadius = Math.max(hullRadius, Math.hypot(x, y));
      // Only recursively copied metadata is immutable; mutable/refit polygons stay live.
      if (isImmutableMetadata(bounds)) immutableHullRadii.set(bounds, hullRadius);
    }
  }
  let radius = Math.max(hullRadius, Math.max(0, ship.spec.collisionRadius));
  if (isShieldCollisionActive(ship)) {
    radius = Math.max(radius, shieldCenterOffset(ship) + ship.shield.radius);
  }
  return radius;
}

function findShipPairCollisionContact(s1: Ship, s2: Ship): ShipPairCollisionContact | null {
  const radius = contactBroadphaseRadius(s1) + contactBroadphaseRadius(s2);
  // Inclusive, outward-padded axis rejection. Near/touching pairs still use the
  // original narrow phase, including offset/partial shields and response ordering.
  // Nonfinite inputs make these comparisons false and fall through conservatively.
  const pad = 1e-7 * Math.max(1, radius, Math.abs(s1.pos.x), Math.abs(s1.pos.y), Math.abs(s2.pos.x), Math.abs(s2.pos.y));
  if (Math.abs(s2.pos.x-s1.pos.x)>radius+pad || Math.abs(s2.pos.y-s1.pos.y)>radius+pad) return null;
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
  // Spawn/teleport overlap has no geometric direction. Stable IDs make the
  // fallback deterministic and symmetric when the pair order is reversed.
  const normal = dist > 1e-12 ? delta.scale(1 / dist) : new Vector2(s1.id < s2.id ? 1 : -1, 0);

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
 * Web 质量加权碰撞适配；冲量和撞伤系数尚未完成原版逐项核验。
 */
export class ShipCollisionSystem {
  public resolveShipToShipCollision(s1: Ship, s2: Ship, fx: CollisionFXCallbacks, _dt: number) {
    if (s1.isDead || s2.isDead || s1.isCollisionless || s2.isCollisionless) return;

    const contact = findShipPairCollisionContact(s1, s2);
    if (contact) {
      const { normal, penetration: overlap, point: contactPoint } = contact;
      const s1ShieldContact = contact.s1Surface === 'SHIELD';
      const s2ShieldContact = contact.s2Surface === 'SHIELD';

      // Starsector 的碰撞结算会考虑实体质量：较重的一方更难被推开，也应承受更少的反冲损伤。
      // 用对方质量占总质量的比例分配位置/速度响应；同质量时仍保持原来的 50/50 与 0.4v 行为。
      const s1Mass = Math.max(1, s1.spec.mass);
      const s2Mass = Math.max(1, s2.spec.mass);
      const totalMass = s1Mass + s2Mass;
      const s1ResponseShare = s2Mass / totalMass;
      const s2ResponseShare = s1Mass / totalMass;

      s1.pos.addScaled(normal, -overlap * s1ResponseShare);
      s2.pos.addScaled(normal, overlap * s2ResponseShare);

      const relVel = s1.vel.clone().sub(s2.vel);
      const impactSpeed = relVel.dot(normal);

      if (impactSpeed > 20) {
        sound.playAtPos('ship_collision', s1.pos, fx.getPlayerPos(), 0.85);
        // 保留原实现 80% 的法向相对速度消解量，但按质量分配冲量。
        s1.vel.addScaled(normal, -impactSpeed * 0.8 * s1ResponseShare);
        s2.vel.addScaled(normal, impactSpeed * 0.8 * s2ResponseShare);

        const baseRamDmg = impactSpeed * 8;
        // 同质量时双方仍各吃 baseRamDmg；质量差越大，重舰承伤越低、轻舰承伤越高。
        const s1RamDmg = baseRamDmg * 2 * s1ResponseShare;
        const s2RamDmg = baseRamDmg * 2 * s2ResponseShare;
        let s1ShieldDmg = 0;
        let s2ShieldDmg = 0;
        let s1ArmorDmg = 0;
        let s1HullDmg = 0;
        let s2ArmorDmg = 0;
        let s2HullDmg = 0;

        // 原版碰撞属于 KINETIC。护盾接触必须走统一 Shield.absorbDamage()，
        // 这样动能对盾 2x、shield efficiency、Fortress Shield 与 CR 承伤倍率都会各应用一次。
        if (s1ShieldContact) {
          const s1ShieldCenter = s1.getShieldCenter();
          const hitAngle = Math.atan2(contactPoint.y - s1ShieldCenter.y, contactPoint.x - s1ShieldCenter.x);
          s1ShieldDmg = s1RamDmg * s1.system.getShieldDamageMultiplier() * s1.crDamageTakenMultiplier;
          const fluxGain = s1.shield.absorbDamage(s1ShieldDmg, 'KINETIC', hitAngle);
          s1ShieldDmg *= s1.shield.damageTakenMultiplier;
          s1.flux.increaseShieldFlux(fluxGain, true);
        } else {
          const contact1 = contactPoint.clone().sub(s1.pos).rotate(-s1.facingRad);
          // CR 只修正实际承伤，hitStrength 保持碰撞原始强度，避免装甲减伤被二次放大。
          const takenDamage = s1RamDmg * s1.crDamageTakenMultiplier;
          const result1 = s1.armor.takeDamage(contact1, takenDamage, 'KINETIC', s1RamDmg, false);
          applyComponentDamage(s1, contact1, result1, 0, s2);
          fx.spawnArmorDamageSparks(s1, contact1, result1.armorDamage);
          // 装甲网格被击穿后溢出的伤害必须结入船体 HP，否则冲撞永远无法击沉目标。
          s1.applyHullDamage(result1.hullDamage);
          s1ArmorDmg = result1.armorDamage;
          s1HullDmg = result1.hullDamage;
        }

        if (s2ShieldContact) {
          const s2ShieldCenter = s2.getShieldCenter();
          const hitAngle = Math.atan2(contactPoint.y - s2ShieldCenter.y, contactPoint.x - s2ShieldCenter.x);
          s2ShieldDmg = s2RamDmg * s2.system.getShieldDamageMultiplier() * s2.crDamageTakenMultiplier;
          const fluxGain = s2.shield.absorbDamage(s2ShieldDmg, 'KINETIC', hitAngle);
          s2ShieldDmg *= s2.shield.damageTakenMultiplier;
          s2.flux.increaseShieldFlux(fluxGain, true);
        } else {
          const contact2 = contactPoint.clone().sub(s2.pos).rotate(-s2.facingRad);
          const takenDamage = s2RamDmg * s2.crDamageTakenMultiplier;
          const result2 = s2.armor.takeDamage(contact2, takenDamage, 'KINETIC', s2RamDmg, false);
          applyComponentDamage(s2, contact2, result2, 0, s1);
          fx.spawnArmorDamageSparks(s2, contact2, result2.armorDamage);
          s2.applyHullDamage(result2.hullDamage);
          s2ArmorDmg = result2.armorDamage;
          s2HullDmg = result2.hullDamage;
        }

        // 浮伤数字按实际结算路径分色：护盾蓝、装甲橙、船体红。
        if (s1ShieldContact || s1ArmorDmg > 0) {
          fx.addFloatingDamage(
            contactPoint.clone().add(new Vector2(-25, -25)),
            s1ShieldContact ? s1ShieldDmg : s1ArmorDmg,
            s1ShieldContact ? [80, 200, 255] : [255, 175, 40]
          );
        }
        if (!s1ShieldContact && s1HullDmg > 0) {
          fx.addFloatingDamage(contactPoint.clone().add(new Vector2(-25, -25)), s1HullDmg, [255, 55, 45]);
        }
        if (s2ShieldContact || s2ArmorDmg > 0) {
          fx.addFloatingDamage(
            contactPoint.clone().add(new Vector2(25, 25)),
            s2ShieldContact ? s2ShieldDmg : s2ArmorDmg,
            s2ShieldContact ? [80, 200, 255] : [255, 175, 40]
          );
        }
        if (!s2ShieldContact && s2HullDmg > 0) {
          fx.addFloatingDamage(contactPoint.clone().add(new Vector2(25, 25)), s2HullDmg, [255, 55, 45]);
        }

        fx.spawnDebris(contactPoint, 16, [130, 115, 100], 120);
        fx.addCameraShake(Math.min(30, impactSpeed * 0.25), 0.35);
      }
    }
  }
}
