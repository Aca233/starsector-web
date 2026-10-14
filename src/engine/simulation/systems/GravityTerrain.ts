import { Vector2 } from '../../math/Vector2';
import { distanceToSegment, polygonArea } from '../../visual/HulkGeometry';
import { getHullCircleContact, type HullCircleContact, type HullCollisionSurface } from '../collision/HullGeometry';
import { getShieldCircleContact } from '../collision/ShieldCollisionGeometry';
import { applyComponentDamage } from './weapon/ComponentDamage';
import type { Ship } from '../Ship';
import type { HulkFragment } from '../CombatTypes';
import type { AsteroidFXCallbacks } from './AsteroidSystem';

function intersection(a: Vector2, b: Vector2, c: Vector2, d: Vector2): Vector2 | undefined {
  if (
    Math.max(a.x, b.x) < Math.min(c.x, d.x) ||
    Math.min(a.x, b.x) > Math.max(c.x, d.x) ||
    Math.max(a.y, b.y) < Math.min(c.y, d.y) ||
    Math.min(a.y, b.y) > Math.max(c.y, d.y)
  ) {
    return;
  }
  const abx = b.x - a.x,
    aby = b.y - a.y,
    cdx = d.x - c.x,
    cdy = d.y - c.y,
    cross = abx * cdy - aby * cdx;
  if (Math.abs(cross) < 1e-9) return;
  const acx = c.x - a.x,
    acy = c.y - a.y,
    t = (acx * cdy - acy * cdx) / cross,
    u = (acx * aby - acy * abx) / cross;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return new Vector2(a.x + abx * t, a.y + aby * t);
}

interface WorldBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function worldBoundsBox(surface: HullCollisionSurface, points: readonly Vector2[]): WorldBox {
  if (points.length < 3) {
    const r = Math.max(0, surface.spec.collisionRadius);
    return {
      minX: surface.pos.x - r,
      maxX: surface.pos.x + r,
      minY: surface.pos.y - r,
      maxY: surface.pos.y + r,
    };
  }
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

function pointInsideSurface(surface: HullCollisionSurface, worldPoint: Vector2): boolean {
  const bounds = surface.spec.bounds;
  if (!bounds || bounds.length < 3) return true;
  const dx = worldPoint.x - surface.pos.x,
    dy = worldPoint.y - surface.pos.y;
  const cos = Math.cos(-surface.facingRad),
    sin = Math.sin(-surface.facingRad);
  const lx = dx * cos - dy * sin,
    ly = dx * sin + dy * cos;
  let inside = false;
  for (let i = 0; i < bounds.length; i++) {
    const [ax, ay] = bounds[i],
      [bx, by] = bounds[(i + 1) % bounds.length];
    if (ay > ly !== by > ly && lx < ax + ((ly - ay) * (bx - ax)) / (by - ay)) inside = !inside;
  }
  return inside;
}

function maxHullRadius(ship: Ship): number {
  let max = ship.spec.collisionRadius;
  const bounds = ship.spec.bounds;
  for (let i = 0; i < bounds.length; i++) {
    const r = Math.hypot(bounds[i][0], bounds[i][1]);
    if (r > max) max = r;
  }
  return max;
}

function polygonContact(ship: Ship, surface: HullCollisionSurface, points: Vector2[]): HullCircleContact | undefined {
  const shipPoints = ship.spec.bounds.map(([x, y]) => new Vector2(x, y).rotate(ship.facingRad).add(ship.pos));
  const boxH = worldBoundsBox(surface, points);
  const boxS = worldBoundsBox(ship, shipPoints);
  const pad = 1e-6;
  const oMinX = Math.max(boxH.minX, boxS.minX) - pad,
    oMaxX = Math.min(boxH.maxX, boxS.maxX) + pad;
  const oMinY = Math.max(boxH.minY, boxS.minY) - pad,
    oMaxY = Math.min(boxH.maxY, boxS.maxY) + pad;
  if (oMinX > oMaxX || oMinY > oMaxY) return undefined;

  let best: HullCircleContact | undefined;
  const add = (next: HullCircleContact | null, reverse = false) => {
    if (next && (!best || next.penetration > best.penetration))
      best = { ...next, normal: next.normal.clone().scale(reverse ? -1 : 1) };
  };
  for (const p of points) {
    if (p.x < oMinX || p.x > oMaxX || p.y < oMinY || p.y > oMaxY) continue;
    if (pointInsideSurface(ship, p)) add(getHullCircleContact(ship, p, 0));
  }
  for (const p of shipPoints) {
    if (p.x < oMinX || p.x > oMaxX || p.y < oMinY || p.y > oMaxY) continue;
    if (pointInsideSurface(surface, p)) add(getHullCircleContact(surface, p, 0), true);
  }
  if (best) return best;
  // Crossing thin polygons can overlap without containing either set of vertices.
  const crossings: Vector2[] = [];
  for (let i = 0; i < points.length; i++) {
    const a0 = points[i],
      a1 = points[(i + 1) % points.length];
    if (
      Math.max(a0.x, a1.x) < oMinX ||
      Math.min(a0.x, a1.x) > oMaxX ||
      Math.max(a0.y, a1.y) < oMinY ||
      Math.min(a0.y, a1.y) > oMaxY
    ) {
      continue;
    }
    for (let j = 0; j < shipPoints.length; j++) {
      const p = intersection(a0, a1, shipPoints[j], shipPoints[(j + 1) % shipPoints.length]);
      if (p) crossings.push(p);
    }
  }
  if (crossings.length >= 2) {
    const center = crossings.reduce((p, q) => p.add(q), new Vector2()).scale(1 / crossings.length);
    add(getHullCircleContact(ship, center, 0));
    add(getHullCircleContact(surface, center, 0), true);
  }
  return best;
}
/** Only gravity-managed wrecks gain this extension. Their real polygon, motion,
 * projectile blocker and AI obstacle share the same owner and live position. */
export function advanceGravityTerrain(dt: number, ships: readonly Ship[], hulks: readonly HulkFragment[], fx: AsteroidFXCallbacks): void {
  for (const h of hulks) {
    if (!h.gravityManaged && !h.gravityFixed) continue;
    if (!h.gravityFixed) {
      h.pos.addScaled(h.vel, dt);
      h.facingRad += h.angularVel * dt;
    }
    const bounds = h.bounds.map(p => [p.x - h.localOffset.x, p.y - h.localOffset.y] as [number, number]);
    const surface: HullCollisionSurface = { pos: h.pos, facingRad: h.facingRad, spec: { bounds, collisionRadius: h.collisionRadius } };
    const hMass = Math.max(50, (h.sourceShip.spec.mass * Math.abs(polygonArea(h.bounds))) / Math.max(1, Math.abs(tupleBoundsArea(h.sourceShip.spec.bounds))));
    let points: Vector2[] | undefined;
    for (const ship of ships) {
      if (ship.isDead || ship.isCollisionless || ship.isRetreated || ship.isDocked) continue;
      const hullRadius = maxHullRadius(ship);
      const shieldRadius = ship.shield.isActive ? ship.shield.radius + ship.getShieldCenter().distanceTo(ship.pos) : 0;
      if (ship.pos.distanceTo(h.pos) > Math.max(hullRadius, shieldRadius) + h.collisionRadius) continue;
      points ??= bounds.map(([x, y]) => new Vector2(x, y).rotate(h.facingRad).add(h.pos));
      const shieldPoints = [...points];
      if (ship.shield.isActive) {
        const center = ship.getShieldCenter();
        for (let i = 0; i < points.length; i++) {
          const a = points[i],
            b = points[(i + 1) % points.length],
            t = distanceToSegment(center, a, b).t;
          shieldPoints.push(a.clone().addScaled(b.clone().sub(a), t));
        }
      }
      const shield = shieldPoints
        .map(p => getShieldCircleContact(ship, p, 0))
        .filter(c => !!c)
        .sort((a, b) => b.penetration - a.penetration)[0];
      const contact = shield ?? polygonContact(ship, surface, points);
      if (!contact) continue;
      const root = ship.assemblyRoot,
        invShip = root.isStation ? 0 : 1 / Math.max(1, root.assemblyShips.reduce((n, s) => n + s.spec.mass, 0)),
        invH = h.gravityFixed ? 0 : 1 / hMass;
      if (invShip + invH <= 0) continue;
      const share = invShip / (invShip + invH),
        normal = contact.normal,
        closing = ship.vel.clone().sub(h.vel).dot(normal);
      const hShift = contact.penetration * (1 - share);
      root.pos.subScaled(normal, contact.penetration * share);
      h.pos.addScaled(normal, hShift);
      for (const p of points) p.addScaled(normal, hShift);
      root.syncModuleTree();
      if (closing <= 0) continue;
      root.vel.subScaled(normal, closing * 0.8 * share);
      if (!h.gravityFixed) h.vel.addScaled(normal, closing * 0.8 * (1 - share));
      if (closing <= 20) continue;
      let raw = Math.min(600, closing * 8 * share);
      if (shield) {
        const angle = contact.point.clone().sub(ship.getShieldCenter()).heading(),
          impact = ship.shield.absorbImpact(raw * ship.crDamageTakenMultiplier, 'KINETIC', angle);
        ship.flux.increaseShieldFlux(impact.flux, true);
        raw *= impact.remainingFraction;
        fx.spawnShieldRipple(contact.point, 30, [90, 190, 230]);
      }
      if (raw > 0) {
        const local = contact.point.clone().sub(ship.pos).rotate(-ship.facingRad),
          damage = ship.armor.takeDamage(local, raw * ship.crDamageTakenMultiplier, 'KINETIC', raw, false);
        applyComponentDamage(ship, local, damage, 0);
        ship.applyHullDamage(damage.hullDamage);
        fx.spawnArmorDamageSparks(ship, local, damage.armorDamage);
        if (damage.hullDamage > 0) fx.addFloatingDamage(contact.point, damage.hullDamage, [255, 90, 70]);
      }
    }
  }
}

function surfacePairContact(
  surfaceA: HullCollisionSurface,
  pointsA: Vector2[],
  surfaceB: HullCollisionSurface,
  pointsB: Vector2[],
): HullCircleContact | undefined {
  const boxA = worldBoundsBox(surfaceA, pointsA);
  const boxB = worldBoundsBox(surfaceB, pointsB);
  const pad = 1e-6;
  const oMinX = Math.max(boxA.minX, boxB.minX) - pad,
    oMaxX = Math.min(boxA.maxX, boxB.maxX) + pad;
  const oMinY = Math.max(boxA.minY, boxB.minY) - pad,
    oMaxY = Math.min(boxA.maxY, boxB.maxY) + pad;
  if (oMinX > oMaxX || oMinY > oMaxY) return undefined;

  const ab = surfaceB.pos.clone().sub(surfaceA.pos);
  let best: HullCircleContact | undefined;
  const add = (next: HullCircleContact | null, reverse = false) => {
    if (!next) return;
    const normal = next.normal.clone().scale(reverse ? -1 : 1);
    if (ab.lengthSq() > 1e-6 && normal.dot(ab) < 0) return;
    if (!best || next.penetration > best.penetration) {
      best = { ...next, normal };
    }
  };
  for (const p of pointsB) {
    if (p.x < oMinX || p.x > oMaxX || p.y < oMinY || p.y > oMaxY) continue;
    if (pointInsideSurface(surfaceA, p)) add(getHullCircleContact(surfaceA, p, 0));
  }
  for (const p of pointsA) {
    if (p.x < oMinX || p.x > oMaxX || p.y < oMinY || p.y > oMaxY) continue;
    if (pointInsideSurface(surfaceB, p)) add(getHullCircleContact(surfaceB, p, 0), true);
  }
  if (best) return best;
  const crossings: Vector2[] = [];
  for (let i = 0; i < pointsB.length; i++) {
    const b0 = pointsB[i],
      b1 = pointsB[(i + 1) % pointsB.length];
    if (
      Math.max(b0.x, b1.x) < oMinX ||
      Math.min(b0.x, b1.x) > oMaxX ||
      Math.max(b0.y, b1.y) < oMinY ||
      Math.min(b0.y, b1.y) > oMaxY
    ) {
      continue;
    }
    for (let j = 0; j < pointsA.length; j++) {
      const p = intersection(
        b0,
        b1,
        pointsA[j],
        pointsA[(j + 1) % pointsA.length],
      );
      if (p) crossings.push(p);
    }
  }
  if (crossings.length >= 1) {
    const center = crossings.reduce((p, q) => p.add(q), new Vector2()).scale(1 / crossings.length);
    add(getHullCircleContact(surfaceA, center, 0));
    add(getHullCircleContact(surfaceB, center, 0), true);
    if (!best) {
      const dist = ab.length();
      const normal = dist > 1e-6 ? ab.clone().scale(1 / dist) : new Vector2(1, 0);
      const overlap = Math.max(1, (surfaceA.spec.collisionRadius + surfaceB.spec.collisionRadius - dist) * 0.25);
      best = { point: center, normal, penetration: overlap };
    }
  }
  return best;
}

function tupleBoundsArea(bounds: readonly [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < bounds.length; i++) {
    const a = bounds[i],
      b = bounds[(i + 1) % bounds.length];
    sum += a[0] * b[1] - a[1] * b[0];
  }
  return sum / 2;
}

/**
 * Resolves physical polygon collisions for battlefield wrecks:
 * 1. Normal (non-gravity-managed) wrecks vs live non-fighter ships
 * 2. Wreck vs wreck (including newly split hulk pieces and colliding hulks)
 */
export function resolveHulkCollisions(
  dt: number,
  ships: readonly Ship[],
  hulks: readonly HulkFragment[],
  fx: AsteroidFXCallbacks,
): void {
  if (hulks.length === 0) return;
  const entries = hulks
    .filter(h => h.bounds.length >= 3 && h.sourceShip.spec.hullSize !== 'FIGHTER')
    .map(h => {
      const bounds = h.bounds.map(p => [p.x - h.localOffset.x, p.y - h.localOffset.y] as [number, number]);
      const points = bounds.map(([x, y]) => new Vector2(x, y).rotate(h.facingRad).add(h.pos));
      const surface: HullCollisionSurface = {
        pos: h.pos,
        facingRad: h.facingRad,
        spec: { bounds, collisionRadius: h.collisionRadius },
      };
      const sourceArea = Math.max(1, Math.abs(tupleBoundsArea(h.sourceShip.spec.bounds)));
      const mass = Math.max(50, (h.sourceShip.spec.mass * Math.abs(polygonArea(h.bounds))) / sourceArea);
      const inertia = Math.max(1, 0.25 * mass * Math.max(20, h.collisionRadius) ** 2);
      return { h, bounds, points, surface, mass, inertia };
    });
  if (entries.length === 0) return;

  // 1. Normal wrecks vs live ships (gravityManaged/gravityFixed wrecks are already handled in advanceGravityTerrain)
  for (const entry of entries) {
    const { h, points, surface, mass: hMass, inertia: hInertia } = entry;
    if (h.gravityManaged || h.gravityFixed) continue;
    for (const ship of ships) {
      if (
        ship === h.sourceShip ||
        ship.isDead ||
        ship.isCollisionless ||
        ship.isRetreated ||
        ship.isDocked ||
        ship.hullSize === 'FIGHTER'
      ) {
        continue;
      }
      const hullRadius = maxHullRadius(ship);
      const shieldRadius = ship.shield.isActive ? ship.shield.radius + ship.getShieldCenter().distanceTo(ship.pos) : 0;
      if (ship.pos.distanceTo(h.pos) > Math.max(hullRadius, shieldRadius) + h.collisionRadius) continue;
      const shieldPoints = [...points];
      if (ship.shield.isActive) {
        const center = ship.getShieldCenter();
        for (let i = 0; i < points.length; i++) {
          const a = points[i],
            b = points[(i + 1) % points.length],
            t = distanceToSegment(center, a, b).t;
          shieldPoints.push(a.clone().addScaled(b.clone().sub(a), t));
        }
      }
      const shield = shieldPoints
        .map(p => getShieldCircleContact(ship, p, 0))
        .filter(c => !!c)
        .sort((a, b) => b.penetration - a.penetration)[0];
      const contact = shield ?? polygonContact(ship, surface, points);
      if (!contact) continue;
      const root = ship.assemblyRoot;
      const invShip = root.isStation ? 0 : 1 / Math.max(1, root.assemblyShips.reduce((n, s) => n + s.spec.mass, 0));
      const invH = 1 / hMass;
      if (invShip + invH <= 0) continue;
      const share = invShip / (invShip + invH);
      const normal =
        !shield && contact.normal.dot(h.pos.clone().sub(ship.pos)) < 0
          ? contact.normal.clone().scale(-1)
          : contact.normal;
      const hShift = contact.penetration * (1 - share);
      root.pos.subScaled(normal, contact.penetration * share);
      h.pos.addScaled(normal, hShift);
      for (const p of points) p.addScaled(normal, hShift);
      root.syncModuleTree();

      const rH = contact.point.clone().sub(h.pos);
      const vHAtContact = new Vector2(h.vel.x - h.angularVel * rH.y, h.vel.y + h.angularVel * rH.x);
      const closing = ship.vel.clone().sub(vHAtContact).dot(normal);
      if (closing > 0) {
        root.vel.subScaled(normal, closing * 0.8 * share);
        h.vel.addScaled(normal, closing * 0.8 * (1 - share));
        const rHCrossN = rH.x * normal.y - rH.y * normal.x;
        const deltaOmega = (closing * 0.8 * (1 - share) * hMass * rHCrossN) / hInertia;
        h.angularVel = Math.max(-2.5, Math.min(2.5, h.angularVel + deltaOmega));
      }
      const sepSpeed = h.vel.clone().sub(root.vel).dot(normal);
      if (sepSpeed < 28 && dt > 0) {
        const push = Math.min(28 - sepSpeed, 450 * dt);
        root.vel.subScaled(normal, push * share);
        h.vel.addScaled(normal, push * (1 - share));
      }
      if (closing <= 20) continue;
      let raw = Math.min(600, closing * 8 * share);
      if (shield) {
        const angle = contact.point.clone().sub(ship.getShieldCenter()).heading();
        const impact = ship.shield.absorbImpact(raw * ship.crDamageTakenMultiplier, 'KINETIC', angle);
        ship.flux.increaseShieldFlux(impact.flux, true);
        raw *= impact.remainingFraction;
        fx.spawnShieldRipple(contact.point, 30, [90, 190, 230]);
      }
      if (raw > 0) {
        const local = contact.point.clone().sub(ship.pos).rotate(-ship.facingRad);
        const damage = ship.armor.takeDamage(local, raw * ship.crDamageTakenMultiplier, 'KINETIC', raw, false);
        applyComponentDamage(ship, local, damage, 0);
        ship.applyHullDamage(damage.hullDamage);
        fx.spawnArmorDamageSparks(ship, local, damage.armorDamage);
        if (damage.hullDamage > 0) fx.addFloatingDamage(contact.point, damage.hullDamage, [255, 90, 70]);
      }
    }
  }

  // 2. Wreck vs wreck (HulkFragment vs HulkFragment)
  for (let i = 0; i < entries.length; i++) {
    const a = entries[i];
    const h1 = a.h;
    for (let j = i + 1; j < entries.length; j++) {
      const b = entries[j];
      const h2 = b.h;
      if (h1.gravityFixed && h2.gravityFixed) continue;
      if (h1.pos.distanceTo(h2.pos) > h1.collisionRadius + h2.collisionRadius) continue;
      const contact = surfacePairContact(a.surface, a.points, b.surface, b.points);
      if (!contact) continue;

      const inv1 = h1.gravityFixed ? 0 : 1 / a.mass;
      const inv2 = h2.gravityFixed ? 0 : 1 / b.mass;
      if (inv1 + inv2 <= 0) continue;
      const share1 = inv1 / (inv1 + inv2);
      const share2 = 1 - share1;
      const normal = contact.normal;

      if (!h1.gravityFixed) {
        const shift1 = -contact.penetration * share1;
        h1.pos.addScaled(normal, shift1);
        for (const p of a.points) p.addScaled(normal, shift1);
      }
      if (!h2.gravityFixed) {
        const shift2 = contact.penetration * share2;
        h2.pos.addScaled(normal, shift2);
        for (const p of b.points) p.addScaled(normal, shift2);
      }

      const r1 = contact.point.clone().sub(h1.pos);
      const r2 = contact.point.clone().sub(h2.pos);
      const v1 = new Vector2(h1.vel.x - h1.angularVel * r1.y, h1.vel.y + h1.angularVel * r1.x);
      const v2 = new Vector2(h2.vel.x - h2.angularVel * r2.y, h2.vel.y + h2.angularVel * r2.x);
      const closing = v1.sub(v2).dot(normal);

      const r1CrossN = r1.x * normal.y - r1.y * normal.x;
      const r2CrossN = r2.x * normal.y - r2.y * normal.x;
      const invI1 = h1.gravityFixed ? 0 : 1 / a.inertia;
      const invI2 = h2.gravityFixed ? 0 : 1 / b.inertia;

      if (closing > 0) {
        const sameSource = h1.sourceShip === h2.sourceShip;
        const restitution = sameSource ? 0.15 : 0.45;
        const denom = inv1 + inv2 + r1CrossN * r1CrossN * invI1 + r2CrossN * r2CrossN * invI2;
        const jImpulse = denom > 1e-9 ? ((1 + restitution) * closing) / denom : 0;
        if (!h1.gravityFixed) {
          h1.vel.subScaled(normal, jImpulse * inv1);
          h1.angularVel = Math.max(-2.5, Math.min(2.5, h1.angularVel - jImpulse * r1CrossN * invI1));
        }
        if (!h2.gravityFixed) {
          h2.vel.addScaled(normal, jImpulse * inv2);
          h2.angularVel = Math.max(-2.5, Math.min(2.5, h2.angularVel + jImpulse * r2CrossN * invI2));
        }
      }

      // Continuous overlap separation push (vanilla ooOO.java:89-106)
      const centerDelta = h2.pos.clone().sub(h1.pos);
      const centerDist = centerDelta.length();
      const sepDir = centerDist > 1e-6 ? centerDelta.scale(1 / centerDist) : normal;
      const sepSpeed = h2.vel.clone().sub(h1.vel).dot(sepDir);
      if (sepSpeed < 28 && dt > 0) {
        const push = Math.min(28 - sepSpeed, 450 * dt);
        if (!h1.gravityFixed) h1.vel.subScaled(sepDir, push * share1);
        if (!h2.gravityFixed) h2.vel.addScaled(sepDir, push * share2);
      }
    }
  }
}

