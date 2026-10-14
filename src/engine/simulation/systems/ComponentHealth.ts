import type { SimulationRandom } from '../SimulationRandom';

export interface ComponentHealthTracker {
  repairDuration: number;
  hitAgo: number;
  interval: number;
  elapsed: number;
  intervalElapsed: boolean;
}

export interface ComponentHealthState {
  health: number;
  maxHealth: number;
  isDisabled: boolean;
  isPermanentlyDisabled?: boolean;
}

export function createComponentHealthTracker(repairDuration: number, random: SimulationRandom): ComponentHealthTracker {
  return { repairDuration, hitAgo: 0, interval: .5 + random.next(), elapsed: 0, intervalElapsed: false };
}

export interface ComponentMalfunctionPolicy {
  chance: number;
  criticalChance: number;
  canPermanentlyDisable: () => boolean;
  disable: (critical: boolean, permanent: boolean) => boolean;
}

const noComponentHealthEvent = Object.freeze({ disabled: false, repaired: false });

/** Shared ship/super health advance and conditional per-component CR sampling.
 * The owner performs disable side effects/vetoes; interval overshoot is discarded. */
export function advanceComponentHealth(state: ComponentHealthState, tracker: ComponentHealthTracker,
  amount: number, random: SimulationRandom, options: {
    canRepair: boolean;
    repairTimeMultiplier: number;
    canRepairUnderFire: boolean;
    flamingOut?: boolean;
    malfunction?: ComponentMalfunctionPolicy;
    disable: () => boolean;
  }): { disabled: boolean; repaired: boolean } {
  if (state.isPermanentlyDisabled) return noComponentHealthEvent;
  let disabled = false;
  if (tracker.intervalElapsed) {
    tracker.interval = .5 + random.next();
    tracker.elapsed = 0;
    tracker.intervalElapsed = false;
  }
  tracker.elapsed += amount * (options.flamingOut ? 2.5 : 1);
  if (tracker.elapsed >= tracker.interval) {
    tracker.intervalElapsed = true;
    if (state.health <= 0 || options.flamingOut) disabled = options.disable();
    else if (options.malfunction && options.malfunction.chance > 0 && random.next() < options.malfunction.chance) {
      // The critical roll is conditional on THIS component failing, never a
      // separate ship-wide lottery. Source consumes it even at zero critical chance.
      const critical = random.next() < options.malfunction.criticalChance;
      const permanent = critical && options.malfunction.canPermanentlyDisable();
      disabled = options.malfunction.disable(critical, permanent);
    }
  }
  tracker.hitAgo += amount;
  const wasDisabled = state.isDisabled;
  if (state.health < state.maxHealth && options.canRepair &&
    (state.isDisabled || tracker.hitAgo > 5 || (options.canRepairUnderFire && state.health > 0))) {
    const repair = amount / Math.max(.000001, options.repairTimeMultiplier) * state.maxHealth / tracker.repairDuration;
    state.health = Math.min(state.maxHealth, state.health + repair);
    if (state.isDisabled && state.health >= state.maxHealth) state.isDisabled = false;
  }
  const repaired = wasDisabled && !state.isDisabled;
  return disabled || repaired ? { disabled, repaired } : noComponentHealthEvent;
}

