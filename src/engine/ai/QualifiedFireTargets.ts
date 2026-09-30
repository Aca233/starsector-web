import type { Ship } from '../simulation/Ship';

// Identity of a list built by an owned native batch, not a flag on world/Ship.
// The WeakMap never owns a list. Closed leases also release the full roster.
const lists = new WeakMap<readonly Ship[], FireTargetQualification>();

/** Internal closed-Worker read-phase proof. Native consumers only borrow these
 * readonly lists; changing membership behind the batch violates that ownership.
 * No position, team, visibility or firing result is carried across phases. */
export class FireTargetQualification {
  private shooter: Ship | undefined;
  private ships: readonly Ship[] | undefined;
  private readonly length: number;
  constructor(shooter: Ship, ships: readonly Ship[]) {
    this.shooter = shooter; this.ships = ships; this.length = ships.length;
  }
  get active(): boolean { return this.ships !== undefined && this.ships.length === this.length; }
  forShip(shooter: Ship, ships: readonly Ship[]): FireTargetQualification | undefined {
    return this.active && shooter === this.shooter && ships === this.ships ? this : undefined;
  }
  register(targets: readonly Ship[]): void {
    if (this.active) lists.set(targets, this);
  }
  close(): void { this.shooter = undefined; this.ships = undefined; }
}

/** A copied/foreign list and a generic batch have no proof, even if contents match. */
export function qualifiedFireTargets(targets: readonly Ship[]): FireTargetQualification | undefined {
  const qualification = lists.get(targets);
  return qualification?.active ? qualification : undefined;
}
