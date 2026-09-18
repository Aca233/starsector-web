import { segmentCircleEntry } from '../math/Geometry';
import { combatTeam } from '../simulation/CombatTeams';
import type { Ship } from '../simulation/Ship';
import type { Projectile } from '../simulation/Weapon';
import type { Asteroid } from '../simulation/CombatTypes';
import { shipSegmentEntry } from './FireControlGeometry';

/** A per-step advisory ledger, NOT a kill oracle or permission to cease fire.
 * Index only launched projectiles with a known intended hull. Guidance/spread,
 * shields and damage can change after this estimate. Never reserve future DPS. */
export class InFlightFireBudget {
  private readonly byTarget = new Map<string, Projectile[]>();
  private readonly sources: Map<string, Ship>;
  constructor(private readonly ships: readonly Ship[], projectiles: readonly Projectile[],
    private readonly asteroids: readonly Asteroid[] = []) {
    this.sources = new Map(ships.map(s => [s.id, s]));
    for (const p of projectiles) this.add(p);
  }
  /** Call from authoritative emission too: later mounts/ships see this step's real launches. */
  add(p: Projectile): void {
    if (!p.targetShipId || !this.eligible(p)) return;
    const list = this.byTarget.get(p.targetShipId);
    if (list) list.push(p); else this.byTarget.set(p.targetShipId, [p]);
  }
  private eligible(p: Projectile): boolean {
    return Number.isFinite(p.damage) && p.damage > 0 && Number.isFinite(p.rangeRemaining) && p.rangeRemaining > 0
      && !p.didDamage && !p.isDisarmed && !p.collisionDisabled && !p.isFlare && !p.isFighterDecoy && !p.isMine
      && !p.isHullExplosion && p.targetProjectileId === undefined && !p.mirv && p.spawnType !== 'BALLISTIC_AS_BEAM'
      && (p.hitpoints === undefined || p.hitpoints > 0) && (p.flightTimeRemaining === undefined || p.flightTimeRemaining > 0);
  }
  estimate(ship: Ship, target: Ship, beforeSeconds: number): number {
    const shots = this.byTarget.get(target.id);
    const horizon = Math.min(3, beforeSeconds);
    if (!shots || !Number.isFinite(horizon) || horizon <= 0 || target.isDead || target.isCollisionless
      || target.teamId === ship.teamId || !target.isVisibleTo(ship.teamId) || target.shield.type === 'PHASE'
      || !target.hasNativeThreatPhaseHooks || target.shield.isActive) return 0;
    let damage = 0;
    for (const p of shots) {
      if (!this.eligible(p) || p.targetShipId !== target.id || p.damagedTargetIds?.includes(target.id)
        || (p.teamId ?? this.sources.get(p.sourceShipId)?.teamId ?? combatTeam(p)) !== ship.teamId) continue;
      const speed = p.sourceMoveSpeed ?? p.vel.length();
      if (!(speed > 0)) continue;
      const lifetime = Math.min(horizon, p.rangeRemaining / speed, p.flightTimeRemaining ?? Infinity);
      const relative = p.vel.clone().sub(target.vel);
      const entry = shipSegmentEntry(target, p.pos, p.pos.clone().addScaled(relative, lifetime));
      if (entry === null) continue; // Turning seekers/near misses are not promised hits.
      const eta = entry * lifetime;
      if ((p.armingTimeRemaining ?? 0) > eta) continue;
      // Another hull/rock may intercept first. Work in each blocker's moving frame.
      const blocked = this.ships.some(other => other !== target && other.id !== p.sourceShipId
        && !other.isCollisionless && other.isVisibleTo(ship.teamId)
        && shipSegmentEntry(other, p.pos, p.pos.clone().addScaled(p.vel.clone().sub(other.vel), eta)) !== null)
        || this.asteroids.some(a => a.hp > 0 && segmentCircleEntry(p.pos,
          p.pos.clone().addScaled(p.vel.clone().sub(a.vel), eta), a.pos, a.radius + p.radius) !== null);
      if (blocked) continue;
      const hit = p.pos.clone().addScaled(relative, eta).sub(target.pos).rotate(-target.facingRad);
      const armor = target.armor, { c, r } = armor.localToGrid(hit);
      const multipliers = armor.damageTakenModifiers?.(p.damageType);
      const typeMult = p.damageType === 'HIGH_EXPLOSIVE' ? 2 : p.damageType === 'KINETIC' ? .5 : p.damageType === 'FRAGMENTATION' ? .25 : 1;
      const armorMult = typeMult * (multipliers?.armor ?? 1), hullMult = multipliers?.hull ?? 1;
      if (!(armorMult > 0 && hullMult > 0)) continue;
      const strength = p.damage * armorMult;
      const reduced = strength * Math.max(1 - armor.maxDamageReduction, strength / (strength + armor.getEffectiveArmor(c, r)));
      // Conservatively charge the entire local 21-cell pool again for EACH round.
      // We do not assume earlier shots removed armor, or credit splash/EMP effects.
      let absorption = 0;
      for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++)
        if (Math.abs(x) !== 2 || Math.abs(y) !== 2) absorption += armor.getCell(c + x, r + y);
      let confidence = p.isGuided ? .55 : .8;
      if (target.shield.type !== 'NONE' && !(target.flux.isOverloaded && target.flux.overloadTimer > eta)
        && !(target.flux.isVenting && target.flux.getTimeToVent() > eta)) confidence *= .35;
      const expected = Math.max(0, reduced - absorption) * hullMult / armorMult * confidence;
      if (Number.isFinite(expected)) damage += expected;
    }
    return damage;
  }
  /** Only diverts toward a legal clear alternative; a sole target is never withheld. */
  penalty(ship: Ship, target: Ship, beforeSeconds: number): number {
    const coverage = this.estimate(ship, target, beforeSeconds) / Math.max(1, target.hullHp);
    return 2.5 * Math.max(0, Math.min(1, (coverage - .6) / .8));
  }
}
