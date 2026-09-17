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
}

/** Shared only inside an audited native AI phase. A ship's AI may activate a
 * range/speed system or change phase/vent state: invalidate that ship immediately
 * after its update, and close the entire cache before any simulation advances. */
export class WeaponThreatEnvelope {
  private active = true;
  private readonly envelopes = new Map<Ship, Envelope>();

  public get(ship: Ship): Envelope | undefined {
    if (!this.active || !ship.hasNativeThreatPhaseHooks) return undefined;
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
      motion, mounts, ranges, dps, muzzleExtents };
    this.envelopes.set(ship, envelope);
    return envelope;
  }

  public invalidate(ship: Ship): void { this.envelopes.delete(ship); }
  public close(): void { this.active = false; this.envelopes.clear(); }
}
