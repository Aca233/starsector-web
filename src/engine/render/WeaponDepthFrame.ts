import type { CombatRenderView } from './CombatRenderView';
import type { ShipRenderState } from './ShipRenderState';
import type { Projectile } from '../simulation/Weapon';
import type { MuzzleFlash, MuzzleParticle } from '../simulation/CombatTypes';
import { Vector2 } from '../math/Vector2';
import { projectileDisplayPose } from './ProjectileFlightLayer';
import { getWeaponVisualProfile } from '../visual/VisualProfiles';

type LaunchGroup = { projectiles: Projectile[]; muzzleParticles: MuzzleParticle[]; muzzleFlashes: MuzzleFlash[] };
export interface WeaponDepthFrame {
  above: CombatRenderView;
  below: ReadonlyMap<string, CombatRenderView>;
}
const emptyGroup = (): LaunchGroup => ({ projectiles: [], muzzleParticles: [], muzzleFlashes: [] });
/** Preserve borrowed/non-enumerable view accessors; never copy or mutate authority objects. */
function layerView(source: CombatRenderView, group: LaunchGroup, below: boolean): CombatRenderView {
  const values = { ...group, projectileVisuals: undefined, projectileFlight: undefined,
    projectilePrediction: undefined, localMuzzles: [], movingRayFades: below ? [] : source.movingRayFades };
  return Object.create(source, Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value, enumerable: true }])));
}

/** True composition: launch art is drawn just before its own hull, using that hull's
 * alpha, not a collision circle or a shader painted over the finished ship. The
 * conservative circle below only decides when the COMPLETE tracer can be promoted.
 * It never changes a projectile position, range, lifetime or collision rule. */
export class WeaponDepthComposer {
  private released = new Set<string>();
  private time = -1;
  reset(): void { this.released.clear(); this.time = -1; }

  partition(source: CombatRenderView, alpha: number,
    spriteLength: (p: Projectile) => number = () => 0): WeaponDepthFrame {
    if (source.combatTime < this.time) this.reset();
    this.time = source.combatTime;
    const owners = new Map<string, { ship: ShipRenderState; slots: Set<string>; pos: Vector2; radius: number }>();
    for (const ship of source.ships) {
      if (ship.isDead || !ship.isVisibleTo(source.playerShip.teamId)) continue;
      const slots = new Set(ship.spec.weaponSlots.filter(slot => slot.renderLayer === 'BELOW_HULL').map(slot => slot.slotId));
      if (!slots.size) continue;
      const spec = ship.spec;
      // Full sprite extent, including asymmetric pivots; not the collision radius.
      const radius = Math.hypot(Math.max(Math.abs(spec.pivotX), Math.abs(spec.spriteWidth - spec.pivotX)),
        Math.max(Math.abs(spec.pivotY), Math.abs(spec.spriteHeight - spec.pivotY)));
      owners.set(ship.id, { ship, slots, pos: ship.interpolatedPos(alpha), radius });
    }
    // Legacy content retains the original view/sidecars and submission order.
    if (!owners.size) { this.released.clear(); return { above: source, below: new Map() }; }
    const above = emptyGroup(), groups = new Map<string, LaunchGroup>(), active = new Set<string>();
    const groupFor = (id: string): LaunchGroup => {
      let group = groups.get(id);
      if (!group) { group = emptyGroup(); groups.set(id, group); }
      return group;
    };
    for (const list of [source.projectileVisuals?.projectiles ?? source.projectiles, source.projectilePrediction?.projectiles ?? []]) {
      for (const original of list) {
        const p = projectileDisplayPose(original, source.projectileFlight, source.projectilePrediction?.corrections);
        const owner = owners.get(p.sourceShipId);
        if (!owner || !p.slotId || !owner.slots.has(p.slotId)) { above.projectiles.push(p); continue; }
        const key = JSON.stringify([p.sourceShipId, p.id]); active.add(key);
        if (!this.released.has(key) && this.clearOfHull(p, owner.pos, owner.radius, alpha, spriteLength(p))) this.released.add(key);
        (this.released.has(key) ? above : groupFor(p.sourceShipId)).projectiles.push(p);
      }
    }
    for (const key of this.released) if (!active.has(key)) this.released.delete(key);
    for (const list of [source.muzzleParticles, source.localMuzzles]) for (const p of list) {
      (p.underHullShipId && owners.has(p.underHullShipId) ? groupFor(p.underHullShipId) : above).muzzleParticles.push(p);
    }
    for (const flash of source.muzzleFlashes) {
      (flash.underHullShipId && owners.has(flash.underHullShipId) ? groupFor(flash.underHullShipId) : above).muzzleFlashes.push(flash);
    }
    return { above: layerView(source, above, false),
      below: new Map([...groups].map(([id, group]) => [id, layerView(source, group, true)])) };
  }

  private clearOfHull(p: Projectile, center: Vector2, radius: number, alpha: number, spriteLength: number): boolean {
    const pos = Vector2.lerp(p.prevPos, p.pos, alpha);
    const tail = p.ballisticTail ? Vector2.lerp(p.prevBallisticTail ?? p.ballisticTail, p.ballisticTail, alpha) : pos.clone();
    const length = p.projLength ?? 40;
    const tailDistance = tail.distanceTo(pos);
    // Match the ordinary ballistic renderer's tail clamp, without touching its vectors.
    if (length > 0 && tailDistance > length) tail.sub(pos).scale(length / tailDistance).add(pos);
    const visual = getWeaponVisualProfile(p.specId, p.visualSpawnType ?? p.spawnType, !!p.isRocket, false);
    const margin = Math.max(length * 1.5 * visual.trailScale, (p.projWidth ?? 8) * 4 * Math.max(visual.glowScale, Math.abs(p.coreWidthMult ?? 1)),
      (p.radius ?? 0) * 4 * Math.max(visual.glowScale, visual.coreScale),
      spriteLength, (p.glowRadius ?? 0) * 2, 24);
    const dx = tail.x - pos.x, dy = tail.y - pos.y, distanceSq = dx * dx + dy * dy;
    const t = distanceSq > 0 ? Math.max(0, Math.min(1, ((center.x - pos.x) * dx + (center.y - pos.y) * dy) / distanceSq)) : 0;
    return Math.hypot(pos.x + dx * t - center.x, pos.y + dy * t - center.y) > radius + margin;
  }
}
