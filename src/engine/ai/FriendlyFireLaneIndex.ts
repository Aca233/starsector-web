import type { Ship } from '../simulation/Ship';
import type { WeaponMount } from '../simulation/Weapon';

/** Only populated inside CombatEngine's audited native, synchronous AI phase.
 * Native AI changes phase/shield/system state, but fire-control decisions are
 * written later by the weapon phase. Keep only membership/order here; target,
 * position, phase and obstruction geometry must still be read live by the query. */
export class FriendlyFireLaneIndex {
  private active = true;
  private rows: Array<{ ally: Ship; mounts: WeaponMount[] }> | undefined;
  private targets: Map<string, Ship[]> | undefined;
  constructor(private readonly ships: readonly Ship[]) {}

  public get(ships: readonly Ship[]): readonly { ally: Ship; mounts: readonly WeaponMount[] }[] | undefined {
    if (!this.active || ships !== this.ships) return undefined;
    if (!this.rows) {
      this.rows = [];
      for (const ally of ships) {
        const mounts = ally.weapons.filter(mount => mount.fireControl?.reason === 'FRIENDLY_BLOCKED' && mount.fireControl.targetKind === 'SHIP');
        if (mounts.length) this.rows.push({ ally, mounts });
      }
    }
    return this.rows;
  }
  public findTarget(id: string | undefined): Ship | undefined {
    if (!this.active || id === undefined) return undefined;
    if (!this.targets) {
      this.targets = new Map();
      for (const ship of this.ships) {
        const matches = this.targets.get(ship.id);
        if (matches) matches.push(ship);
        else this.targets.set(ship.id, [ship]);
      }
    }
    // Phase/death state can change during native AI. Duplicate IDs retain the
    // original find() order, rather than silently selecting the last match.
    return this.targets.get(id)?.find(ship => !ship.isDead && !ship.isPhased);
  }
  public close(): void { this.active = false; this.rows = undefined; this.targets = undefined; }
}
