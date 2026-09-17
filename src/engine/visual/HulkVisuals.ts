import type { Ship } from '../simulation/Ship';
import type { HulkFragment } from '../simulation/CombatTypes';
import type { SimulationRandom } from '../simulation/SimulationRandom';
import { Vector2 } from '../math/Vector2';
import { fractureHull, hullBounds, pointInHull, armorCellTouchesHull } from './HulkGeometry';

/** StarSystemGenerator.getNormalRandom: clamp(gaussian * .2 + .5) across source limits. */
export function chooseHulkPieceCount(min: number, max: number, random: SimulationRandom): number {
  const gaussian = Math.sqrt(-2 * Math.log(Math.max(1e-12, 1 - random.next()))) * Math.cos(2 * Math.PI * random.next());
  const unit = Math.max(0, Math.min(1, gaussian * 0.2 + 0.5));
  return Math.max(1, Math.round(min + unit * (max - min)));
}

/** Ship.java retains all normal hulls and half of fighters; H schedules breakup. */
export function createShipHulk(ship: Ship, random: SimulationRandom): HulkFragment | null {
  if (ship.spec.hullSize === 'FIGHTER' && random.next() >= 0.5) return null;
  const breaks = random.next() < ship.hullStats.breakProbability;
  const remainingSplits = breaks ? chooseHulkPieceCount(ship.spec.minPieces ?? 2, ship.spec.maxPieces ?? 2, random) - 1 : 0;
  const interval = remainingSplits > 0 ? 0.33 / remainingSplits : 0;
  if (remainingSplits > 0) {
    const bounds = ship.spec.bounds.map(([x, y]) => new Vector2(x, y));
    for (let c = 0; c < ship.armor.cols; c++) for (let r = 0; r < ship.armor.rows; r++) {
      if (armorCellTouchesHull(ship.armor.getCellCenterLocal(c, r), ship.armor.cellWidth, bounds)) ship.armor.setCell(c, r, 0);
    }
    ship.syncWithArmorGridState();
  }
  return {
    id: random.nextNumericId(), sourceShip: ship, age: 0,
    pos: ship.pos.clone(), vel: ship.vel.clone(), facingRad: ship.facingRad,
    angularVel: ship.angularVelRad, localOffset: new Vector2(),
    breakup: remainingSplits > 0 ? { remainingSplits, interval, elapsed: 0, nextInterval: interval * (0.5 + 0.5 * random.next()) } : null,
    bounds: ship.spec.bounds.map(([x, y]) => new Vector2(x, y)), visualBounds: null,
    mountSlotIds: ship.weapons.map(mount => mount.slotId), collisionRadius: ship.spec.collisionRadius
  };
}

/**
 * Ship.applyDamageInner's newly disabled hull: one central 2000 HE hit and ten
 * randomDamage hits for destroyers and larger. This ports source armor/heat and
 * armor-hit particles, not native component damage, debris, or overkill physics.
 */
export function applyHulkDisableDamage(ship: Ship, random: SimulationRandom,
  emitArmorDamage: (ship: Ship, local: Vector2, armorDamage: number) => void): void {
  if (!ship.isDead || ship.damageDecals.suppressed) return;
  const ordinal = { FIGHTER: 1, FRIGATE: 2, DESTROYER: 3, CRUISER: 4, CAPITAL_SHIP: 5 }[ship.spec.hullSize ?? 'FRIGATE'];
  if (ordinal <= 2) return;
  const apply = (local: Vector2, rawDamage: number) => {
    const result = ship.armor.takeDamage(local, rawDamage * ship.crDamageTakenMultiplier, 'HIGH_EXPLOSIVE', rawDamage, false);
    // Already dead: no live hull/flux/combat-stat mutation or recursive destruction dispatch.
    emitArmorDamage(ship, local, result.armorDamage);
  };
  apply(new Vector2(), 2000);
  for (let i = 0; i < 10; i++) {
    const damage = ordinal * 500 * (0.5 + 0.5 * random.next());
    // Native randomDamage offsets are world-axis aligned, even on a rotated ship.
    const local = new Vector2(ship.spec.collisionRadius * (random.next() - 0.5),
      ship.spec.collisionRadius * (random.next() - 0.5)).rotate(-ship.facingRad);
    apply(local, damage);
  }
}

/** Ship.splitShip: retained modules/pose, native grid-aligned centers and clone impulse. */
export function splitHulk(hulk: HulkFragment, random: SimulationRandom): HulkFragment[] | null {
  const cuts = fractureHull(hulk.bounds, hulk.visualBounds, hulk.sourceShip.spec.hullSize, random);
  if (!cuts) return null;
  const ship = hulk.sourceShip;
  if (hulk.visualBounds === null) {
    // Ship.splitShip clears the first source grid before copying its established decals.
    for (let c = 0; c < ship.armor.cols; c++) for (let r = 0; r < ship.armor.rows; r++) ship.armor.setCell(c, r, 0);
  }
  for (const point of cuts[0].seam) {
    const { c, r } = ship.armor.localToGrid(point);
    ship.armor.setCell(c, r, 0);
  }
  // Native seam heat boost is disabled (bl2=false); preserve existing heat, never add a hot stripe.
  ship.syncWithArmorGridState();
  if (cuts[0].bounds.length < cuts[1].bounds.length) cuts.reverse();
  const sourceOrigin = hulk.pos.clone().sub(hulk.localOffset.clone().rotate(hulk.facingRad));
  const grid = Math.min(30, Math.max(15, hulk.sourceShip.spec.spriteHeight / 10));
  const slots: [string[], string[]] = [[], []];
  for (const mount of hulk.sourceShip.weapons) {
    if (!hulk.mountSlotIds.includes(mount.slotId)) continue;
    if (pointInHull(mount.relativePos, cuts[0].bounds)) slots[0].push(mount.slotId);
    else if (pointInHull(mount.relativePos, cuts[1].bounds)) slots[1].push(mount.slotId);
  }
  return cuts.map((cut, index) => {
    const box = hullBounds(cut.bounds), relative = box.center.clone().sub(hulk.localOffset);
    relative.set(Math.round(relative.x / grid) * grid, Math.round(relative.y / grid) * grid);
    const localOffset = hulk.localOffset.clone().add(relative);
    const vel = hulk.vel.clone();
    if (index === 1) vel.add(relative.clone().rotate(hulk.facingRad).normalize().scale(0.5));
    return { ...hulk, id: random.nextNumericId(), pos: sourceOrigin.clone().add(localOffset.clone().rotate(hulk.facingRad)), vel,
      bounds: cut.bounds, visualBounds: cut.visualBounds, mountSlotIds: slots[index], localOffset, collisionRadius: box.radius };
  });
}

/** H advances one shared sequence and cuts the largest bounding-area piece each interval. */
export function updateHulkBreakups(hulks: HulkFragment[], dt: number, random: SimulationRandom): void {
  const sequences = new Set(hulks.map(hulk => hulk.breakup).filter(sequence => sequence !== null));
  for (const sequence of sequences) {
    sequence.elapsed += dt;
    if (sequence.elapsed < sequence.nextInterval) continue;
    sequence.elapsed = 0;
    const pieces = hulks.filter(hulk => hulk.breakup === sequence);
    const largest = pieces.reduce<HulkFragment | null>((best, next) => {
      const box = hullBounds(next.bounds), previous = best ? hullBounds(best.bounds) : null;
      return !previous || box.width * box.height > previous.width * previous.height ? next : best;
    }, null);
    if (largest) {
      const split = splitHulk(largest, random);
      if (split) hulks.splice(hulks.indexOf(largest), 1, ...split);
    }
    sequence.remainingSplits--;
    sequence.nextInterval = sequence.interval * (0.5 + 0.5 * random.next());
    if (sequence.remainingSplits <= 0) for (const hulk of hulks) if (hulk.breakup === sequence) hulk.breakup = null;
  }
}

export function getHulkAppearance(hulk: HulkFragment): { tint: number; alpha: number } {
  const tint = hulk.visualBounds === null ? 1 + (120 / 255 - 1) * Math.min(1, hulk.age / 0.5) : 120 / 255;
  const alpha = hulk.sourceShip.spec.hullSize === 'FIGHTER'
    ? Math.min(1, Math.max(0, (10.5 - hulk.age) / 0.5)) : 1;
  return { tint, alpha };
}
