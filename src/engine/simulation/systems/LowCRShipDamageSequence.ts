import type { Ship } from '../Ship';
import type { SimulationRandom } from '../SimulationRandom';
import { canPermanentlyDisableWeapon } from './ComponentMalfunctions';
import type { ComponentMalfunctionTarget } from './ComponentMalfunctions';

/** CRPluginImpl's deployment-only damage plugin. This clock uses combat seconds,
 * not the ship's phase-time multiplier. Source picker(true) ignores all weights. */
export class LowCRShipDamageSequence {
  public elapsed = 0;
  public readonly beforeDamage: number;
  public interval: number;
  public intervalElapsed = 0;
  public intervalWasElapsed = false;
  public readonly initialAttempts: number;
  public remainingAttempts: number;
  public finished = false;
  private targets: ComponentMalfunctionTarget[] = [];

  constructor(private readonly ship: Ship, public readonly severity: number,
    private readonly random: SimulationRandom) {
    // Native field initializer draws the first IntervalUtil interval before the delay.
    this.interval = .25 + random.next() * .75;
    this.beforeDamage = 1 + random.next() * 2;
    // Native getUsableWeapons enumerates weapon groups, not all installed mounts.
    for (const group of ship.weaponGroups) for (const slotId of group.weaponSlotIds) {
      const mount = ship.weapons.find(weapon => weapon.slotId === slotId);
      if (mount) this.targets.push({ kind: 'weapon', mount });
    }
    ship.engineStatuses.forEach((engine, index) => {
      if (!engine.systemActivated) this.targets.push({ kind: 'engine', index });
    });
    this.initialAttempts = Math.max(1, Math.round((.25 + .75 * severity) * this.targets.length * .25))
      * (severity >= 1 ? 2 : 1);
    this.remainingAttempts = this.initialAttempts;
  }

  public advance(amount: number): void {
    if (!(amount > 0) || this.finished) return;
    if (this.ship.isDead || this.ship.hullHp <= 0) { this.finished = true; return; }
    this.elapsed += amount;
    if (this.elapsed <= this.beforeDamage) return;
    // IntervalUtil discards overshoot on its next advance; never catch up in a loop.
    if (this.intervalWasElapsed) {
      this.interval = .25 + this.random.next() * .75;
      this.intervalElapsed = 0;
      this.intervalWasElapsed = false;
    }
    this.intervalElapsed += amount;
    if (this.intervalElapsed >= this.interval) {
      this.intervalWasElapsed = true;
      this.disableNext();
    }
    if (this.ship.isDead || this.ship.hullHp <= 0 || this.remainingAttempts <= 0) this.finished = true;
  }

  private disableNext(): void {
    if (this.remainingAttempts <= 0) return;
    this.remainingAttempts--;
    // Pruned targets stay removed even if their eligibility changes later.
    this.targets = this.targets.filter(target => target.kind === 'weapon'
      ? canPermanentlyDisableWeapon(this.ship, target.mount)
      : this.ship.engineStatuses[target.index].contribution + this.ship.engineController.permanentlyDisabledFraction <= .66);
    if (this.targets.length === 0) return;
    const index = Math.floor(this.random.next() * this.targets.length);
    const [target] = this.targets.splice(index, 1);
    this.ship.applyCriticalMalfunction(target);
  }
}
