/** Continuous aim/held controls follow the 60 Hz simulation. Button edges do not
 * wait for this timer, but share a small bounded budget with the periodic input. */
export const LAN_INPUT_INTERVAL_MS = 1000 / 60;

export class InputSendBudget {
  private credits = 4;
  private lastAt: number | null = null;

  take(now: number): boolean {
    if (this.lastAt !== null) this.credits = Math.min(4, this.credits + Math.max(0, now - this.lastAt) * .075);
    this.lastAt = now;
    // At most 79 input packets in a second, leaving room for the host's 60
    // snapshots and control messages under the relay's 160-message limit.
    // If exhausted, the next periodic send carries the latest state AND actions.
    if (this.credits < 1) return false;
    this.credits--;
    return true;
  }
}
