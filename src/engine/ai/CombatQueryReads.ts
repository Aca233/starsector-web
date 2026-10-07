import { nativeGetMotionStats, type Ship } from '../simulation/Ship';
import { nativeReadModifierTable } from '../simulation/ShipSystem';
import { motionReaders, shipMotionStats } from '../simulation/systems/ShipMotion';
import type { SystemModifiers } from '../extensions/ship-systems/Types';

const readers = [...motionReaders, 'getWeaponRangePercent', 'getProjectileSpeedPercent'] as const;
type MotionStats = ReturnType<typeof shipMotionStats>;

/** A native plan or private read-only root/module span, never a tick cache. Only authored composed
 * values and motion limits are reused; targets, poses, geometry and decisions
 * remain live. Closing before effects prevents borrowing old resource state.
 * Not a sandbox for arbitrary same-realm property interception. */
export class CombatQueryReads {
  private open = true;
  private readonly modifiers = new Map<Ship, Readonly<SystemModifiers>>();
  private readonly motions = new Map<Ship, MotionStats>();
  get active(): boolean { return this.open; }
  sourceModifiers(ship: Ship): Readonly<SystemModifiers> | undefined {
    if (!this.open) throw new Error('Closed combat query reads');
    if (import.meta.env?.VITE_COMBAT_STAT_TABLE === 'false'
      || ship.system.readModifierTable !== nativeReadModifierTable) return;
    const cached = this.modifiers.get(ship);
    if (cached) return cached;
    if (!ship.system.hasNativeStats) return;
    const table = ship.system.readModifierTable(readers);
    if (table) this.modifiers.set(ship, table);
    return table;
  }
  motion(ship: Ship): MotionStats {
    if (!this.open) throw new Error('Closed combat query reads');
    // Replaced readers retain every invocation, including dependency callbacks.
    if (ship.getMotionStats !== nativeGetMotionStats) return ship.getMotionStats();
    const cached = this.motions.get(ship);
    if (cached) return cached;
    const table = this.sourceModifiers(ship);
    if (!table) return ship.getMotionStats();
    const motion = shipMotionStats(ship, 0, table);
    this.motions.set(ship, motion);
    return motion;
  }
  close(): void { this.open = false; this.modifiers.clear(); this.motions.clear(); }
}
/** Effects/standalone navigation intentionally fall back to current live reads. */
export function queryMotionStats(ship: Ship, reads?: CombatQueryReads): MotionStats {
  return reads?.active ? reads.motion(ship) : ship.getMotionStats();
}
export function querySourceModifiers(ship: Ship, reads?: CombatQueryReads): Readonly<SystemModifiers> | undefined {
  return reads?.active ? reads.sourceModifiers(ship) : undefined;
}
