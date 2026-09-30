import type { ShipSpec } from '../../content/ShipSpec';
import { Vector2 } from '../../math/Vector2';
import { modManager } from '../../modding/ModManager';
import { isPointDefense } from '../../ai/AutofireController';
import type { Ship } from '../Ship';
import { combatWeaponRange } from '../WeaponRange';

/** Rotation-safe sprite footprint, including asymmetric pivots, not just collision radius. */
export function flightFootprint(spec: ShipSpec): number {
  return Math.max(spec.collisionRadius, Math.hypot(
    Math.max(Math.abs(spec.pivotY), Math.abs(spec.spriteHeight - spec.pivotY)),
    Math.max(Math.abs(spec.pivotX), Math.abs(spec.spriteWidth - spec.pivotX))));
}

/** The whole rigid assembly in a chosen heading's frame, including visual hull overhang. */
function assemblyEnvelope(root: Ship, heading: number) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const part of root.assemblyShips) {
    const spec = part.spec, origin = part.pos.clone().sub(root.pos).rotate(-heading);
    const angle = part.facingRad - heading, c = Math.cos(angle), s = Math.sin(angle);
    const include = (x: number, y: number) => {
      const px = origin.x + x * c - y * s, py = origin.y + x * s + y * c;
      minX = Math.min(minX, px); maxX = Math.max(maxX, px);
      minY = Math.min(minY, py); maxY = Math.max(maxY, py);
    };
    for (const [x, y] of spec.bounds) include(x, y);
    if (spec.spriteWidth > 0 && spec.spriteHeight > 0) {
      for (const x of [spec.pivotY - spec.spriteHeight, spec.pivotY])
        for (const y of [-spec.pivotX, spec.spriteWidth - spec.pivotX]) include(x, y);
    } else if (!spec.bounds.length) {
      const r = spec.collisionRadius;
      include(-r, -r); include(r, -r); include(-r, r); include(r, r);
    }
  }
  return { minX, maxX, minY, maxY };
}

/** Slots belong to craft, not per-frame fighter/bomber counters. Docking keeps a slot. */
export class FlightFormation {
  private slots = new WeakMap<Ship, { root: Ship; index: number }>();
  private footprints = new WeakMap<Ship, number>();

  public reset(): void {
    this.slots = new WeakMap(); this.footprints = new WeakMap();
  }

  private indexFor(craft: Ship, carrier: Ship): number {
    const root = carrier.assemblyRoot, saved = this.slots.get(craft);
    if (saved?.root === root) return saved.index;
    const occupied = new Set<number>();
    for (const part of root.assemblyShips) for (const peer of part.deployedWingCraft) {
      if (peer.isDead || peer.isRetreated || peer.hullHp <= 0) continue;
      const slot = this.slots.get(peer);
      if (slot?.root === root) occupied.add(slot.index);
    }
    const side = carrier.pos.clone().sub(root.pos).rotate(-root.facingRad).y;
    const lateral = carrier !== root && Math.abs(side) > 1;
    let index = lateral && side > 0 ? 1 : 0;
    while (occupied.has(index)) index += lateral ? 2 : 1;
    this.slots.set(craft, { root, index });
    return index;
  }

  public station(craft: Ship, carrier: Ship, aft = false, enemy?: Ship): Vector2 {
    const root = carrier.assemblyRoot, index = this.indexFor(craft, carrier);
    let radius = this.footprints.get(root);
    if (radius === undefined) {
      radius = 0;
      // Size the formation before the first launch, even with different-sized wings.
      for (const part of root.assemblyShips) for (const wing of part.spec.fighterWings ?? []) {
        const spec = modManager.getShip(wing.specId);
        if (spec) radius = Math.max(radius, flightFootprint(spec));
      }
    }
    radius = Math.max(radius, flightFootprint(craft.spec));
    this.footprints.set(root, radius);
    const pitch = radius * 2 + 80, clearance = radius + 100;
    const heading = enemy ? enemy.pos.clone().sub(root.pos).heading() : root.facingRad;
    const box = assemblyEnvelope(root, heading);
    let x: number, y: number;
    if (root.childModules.length || enemy) {
      const side = index % 2 ? 1 : -1, rank = Math.floor(index / 2);
      const row = rank % 4, column = Math.floor(rank / 4), middle = (box.minX + box.maxX) / 2;
      x = middle + (1.5 - row - column * .5) * pitch;
      y = (side < 0 ? box.minY : box.maxY) + side * (clearance + column * pitch);
      if (enemy) {
        // An interceptor screen, not a suicide run at the capital. Keep PD stand-off.
        const pdRange = enemy.weapons.filter(w => !w.isDisabled && !w.isPermanentlyDisabled && isPointDefense(w))
          .reduce((max, w) => Math.max(max, combatWeaponRange(enemy, w.spec)), 0);
        const safeRange = Math.max(600, pdRange + radius + 100);
        const front = Math.max(middle, Math.min(box.maxX + 800,
          root.pos.distanceTo(enemy.pos) - enemy.spec.collisionRadius - safeRange));
        x = front - (row + column * .5) * pitch;
      }
    } else {
      const row = Math.floor(index / 3);
      x = aft ? box.minX - clearance - row * pitch : box.maxX + clearance + row * pitch;
      y = (index % 3 - 1) * pitch;
    }
    return new Vector2(x, y).rotate(heading).add(root.pos).addScaled(root.vel, .35);
  }
}
