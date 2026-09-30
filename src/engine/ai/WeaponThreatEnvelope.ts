import { Vector2 } from '../math/Vector2';
import type { WeaponMount } from '../simulation/Weapon';
import type { Ship } from '../simulation/Ship';
import { weaponMuzzleExtent } from './FireControlGeometry';
import { weaponDps, weaponRange } from './ShipCombatProfile';

interface Envelope {
  maxRangeAndMuzzle: number;
  maxSpeed: number;
  motion: ReturnType<Ship['getMotionStats']> | undefined;
  mounts: WeaponMount[];
  ranges: number[];
  dps: number[];
  muzzleExtents: number[];
  /** Lazy per-mount muzzle coordinates, valid only for this native AI phase. */
  muzzleX: number[];
  muzzleY: number[];
}

const nativeVectorSet = Vector2.prototype.set;

/** Shared only inside an audited native AI phase. A ship's AI may activate a
 * range/speed system or change phase/vent state: invalidate that ship immediately
 * after its update, and close the entire cache before any simulation advances.
 * Native AI does not advance motion, mount angles or barrels here; activation
 * effects (including teleports) are dispatched after this cache is closed.
 * The separate owned-interleaved factory also certifies every writer; it requires
 * dependency-group invalidation after BOTH AI and ship.update, and closes before
 * fighter/status/collision phases. It never certifies projectile or beam indexes. */
export class WeaponThreatEnvelope {
  private active = true;
  private readonly envelopes = new Map<Ship, Envelope>();

  private exactRoster?: ReadonlySet<Ship>;
  private orderedShips?: readonly Ship[];
  private families?: ReadonlyMap<Ship, ReadonlySet<Ship>>;

  /** Caller must own a synchronous, audited AI-only phase (no ship.update,
   * extension dispatch or await). Qualify the entire live roster before reuse. */
  public static forExactPhase(ships: readonly Ship[]): WeaponThreatEnvelope | undefined {
    if (!ships.length || ships.some(ship => !ship.hasExactThreatPhaseHooks)) return;
    const groups = new Map<Ship, Set<Ship>>(ships.map(ship => [ship, new Set([ship])]));
    for (const ship of ships) for (const dependency of [ship.parentShip, ship.sourceCarrier]) {
      if (!dependency) continue;
      const a = groups.get(ship)!, b = groups.get(dependency);
      if (!b) return; // An unobserved parent/carrier cannot certify the read domain.
      if (a === b) continue;
      for (const member of b) { a.add(member); groups.set(member, a); }
    }
    const result = new WeaponThreatEnvelope();
    result.exactRoster = new Set(ships); result.families = groups; result.orderedShips = ships;
    return result;
  }

  /** Requires private Worker ownership at the caller, not merely exact AI readers.
   * Unknown writers close the whole phase before executing; no re-opening mid-step. */
  public static forOwnedInterleavedPhase(ships: readonly Ship[]): WeaponThreatEnvelope | undefined {
    if (ships.some(ship => !ship.hasOwnedLocalThreatUpdate)) return;
    return WeaponThreatEnvelope.forExactPhase(ships);
  }

  /** Membership only, for the same audited synchronous caller as the factory.
   * Does not certify hostility, availability, positions or any other value.
   * Interleaved callers must stop using it before retreat/unknown writers. */
  public phaseShips(): readonly Ship[] | undefined {
    return this.active ? this.orderedShips : undefined;
  }

  public permitsExactObserver(ship: Ship): boolean {
    return this.active && !!this.exactRoster?.has(ship) && ship.hasExactThreatPhaseHooks;
  }

  public get(ship: Ship): Envelope | undefined {
    if (!this.active || Vector2.prototype.set !== nativeVectorSet
      || (this.exactRoster ? !this.permitsExactObserver(ship) : !ship.hasNativeThreatPhaseHooks)) return undefined;
    const cached = this.envelopes.get(ship);
    if (cached) return cached;
    let maxRangeAndMuzzle = -Infinity;
    // Parallel arrays avoid an allocated record per mount. These are phase-local
    // snapshots, not cross-frame caches of mutable weapon metadata.
    const mounts: WeaponMount[] = [], ranges: number[] = [], dps: number[] = [], muzzleExtents: number[] = [];
    for (const mount of ship.weapons) {
      if (mount.isDisabled || mount.ammo < 1) continue;
      const damagePerSecond = weaponDps(mount);
      if (damagePerSecond <= 0) continue;
      // NaN/Infinity propagate: an exceptional range must not certify exclusion.
      const range = weaponRange(ship, mount), extent = weaponMuzzleExtent(mount);
      mounts.push(mount); ranges.push(range); dps.push(damagePerSecond); muzzleExtents.push(extent);
      maxRangeAndMuzzle = Math.max(maxRangeAndMuzzle, range + extent);
    }
    const motion = maxRangeAndMuzzle === -Infinity ? undefined : ship.getMotionStats();
    const envelope = { maxRangeAndMuzzle, maxSpeed: motion?.maxSpeed ?? 0,
      motion, mounts, ranges, dps, muzzleExtents, muzzleX: [] as number[], muzzleY: [] as number[] };
    this.envelopes.set(ship, envelope);
    return envelope;
  }

  public invalidate(ship: Ship): void {
    const family = this.families?.get(ship);
    if (family) for (const member of family) this.envelopes.delete(member);
    else this.envelopes.delete(ship);
  }
  public close(): void {
    this.active = false; this.envelopes.clear(); this.exactRoster = undefined; this.families = undefined; this.orderedShips = undefined;
  }
}
