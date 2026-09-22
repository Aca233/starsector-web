import { captureWeaponPresentation, applyWeaponPresentation } from './WeaponPresentationReplica';
import type { CombatEngine } from '../engine/simulation/CombatEngine';
import type { Ship } from '../engine/simulation/Ship';
import { COMBAT_FLAGS, COMBAT_NUMBERS, COMBAT_PHASES, COMBAT_STATE_MAX_SHIPS, encodeCombatState } from './CriticalCombatState.mjs';
import type { CriticalCombatFrame, CombatStateRow } from './CriticalCombatState.mjs';
// Only these fixed own-data paths may cross the component boundary. This does
// not invoke setters/toggles, simulate damage, publish sounds or create entities.
const paths = [...COMBAT_FLAGS, ...COMBAT_NUMBERS].map(path => path.split('.'));
function get(ship: Ship, path: string[]): unknown {
  let value: unknown = ship;
  for (const key of path) value = (value as Record<string, unknown>)[key];
  return value;
}
function put(ship: Ship, path: string[], value: number | boolean) {
  const owner = path.length === 1 ? ship : (ship as unknown as Record<string, object>)[path[0]!];
  (owner as unknown as Record<string, unknown>)[path.at(-1)!] = value;
}
export function captureCriticalCombat(engine: CombatEngine, tick: number, includeWeapons = false): Uint8Array | null {
  const ships = engine.allCapitalShips.filter(ship => !engine.deployment.isReserve(ship.id));
  if (ships.length > COMBAT_STATE_MAX_SHIPS) return null;
  try {
    const rows = ships.map(ship => {
      let flags = 0;
      for (let i = 0; i < COMBAT_FLAGS.length; i++) {
        const value = get(ship, paths[i]!); if (typeof value !== 'boolean') throw Error('Invalid component boolean');
        if (value) flags |= 1 << i;
      }
      return [ship.id, flags, COMBAT_PHASES.indexOf(ship.shield.phaseState),
        ...paths.slice(COMBAT_FLAGS.length).map(path => get(ship, path))] as CombatStateRow;
    });
    const frame = { tick, time: engine.combatTime, ships: rows };
    if (includeWeapons) {
      try { return encodeCombatState({ ...frame, weapons: captureWeaponPresentation(ships) }); }
      catch { /* Unsupported/oversized weapons must NOT suppress core HP/flux. */ }
    }
    return encodeCombatState(frame);
  } catch { return null; } // Never partial state; the whole-world path remains intact.
}
/** One retained, validated authority component. Applies only to guest replicas.
 * A stale full restore cannot resurrect a ship or roll its HP/flux back. Retain
 * the clock even if packets stop; freshness never licenses an older overwrite. */
export class CriticalCombatReplica {
  private frame: CriticalCombatFrame | null = null;
  private weapons: CriticalCombatFrame | null = null;
  private appliedWeapons: { engine: CombatEngine; frame: CriticalCombatFrame; worldTick: number } | null = null;
  private weaponReceivedAt: number | null = null;
  get weaponTick() { return this.weapons?.tick ?? -1; }
  weaponAge(now: number) { return this.weaponReceivedAt === null ? null : Math.max(0, now - this.weaponReceivedAt); }
  private receivedAt: number | null = null;
  get tick() { return this.frame?.tick ?? -1; }
  age(now: number) { return this.receivedAt === null ? null : Math.max(0, now - this.receivedAt); }
  clear() { this.frame = null; this.weapons = null; this.appliedWeapons = null; this.weaponReceivedAt = null; this.receivedAt = null; }
  receive(frame: CriticalCombatFrame, now: number, worldTick: number): boolean {
    if (!Number.isFinite(now) || frame.tick <= this.tick || frame.tick <= worldTick) return false;
    this.frame = frame; if (frame.weapons) { this.weapons = frame; this.weaponReceivedAt = now; } this.receivedAt = now; return true;
  }
  apply(engine: CombatEngine, worldTick: number, allowCachedWeapons = false) {
    if (!this.frame || this.frame.tick <= worldTick) return;
    const known = new Map(engine.allCapitalShips.map(ship => [ship.id, ship]));
    for (const row of this.frame.ships) {
      const ship = known.get(row[0]); if (!ship) continue;
      for (let i = 0; i < COMBAT_FLAGS.length; i++) put(ship, paths[i]!, !!(row[1] & (1 << i)));
      ship.shield.phaseState = COMBAT_PHASES[row[2]]!;
      for (let i = 0; i < COMBAT_NUMBERS.length; i++) put(ship, paths[COMBAT_FLAGS.length + i]!, row[3 + i] as number);
    }
    if (this.weapons?.weapons && this.weapons.tick > worldTick) {
      const applied = this.appliedWeapons;
      if (!allowCachedWeapons || !applied || applied.engine !== engine || applied.frame !== this.weapons || applied.worldTick !== worldTick) {
        applyWeaponPresentation(known, this.weapons.weapons);
        this.appliedWeapons = { engine, frame: this.weapons, worldTick };
      }
    }
  }
}
