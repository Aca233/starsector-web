import type { CombatEngine } from '../engine/simulation/CombatEngine';
import { enableExplosionPuffRecipes } from '../engine/visual/ExplosionPuffRecipe';
import { HostMuzzleEvents } from './HostMuzzleEvents';
import { captureCombat } from './CombatSnapshot';
import type { Seat } from './protocol';

/** Shared by the actual host Worker and offline verification. Keep cosmetic
 * setup/capture together so recordings cannot silently bypass muzzle events. */
export function configureHostCosmetics(engine: CombatEngine, compactPuffs = true): HostMuzzleEvents {
  engine.contrailEngine.setEnabled(false);
  if (compactPuffs) enableExplosionPuffRecipes(engine.visualRandom);
  return new HostMuzzleEvents(engine.fxSystem, () => engine.combatTime);
}
export function captureHostCombat(engine: CombatEngine, tick: number, acknowledged: Record<Seat, number>, simulationMs: number,
  muzzleEvents: HostMuzzleEvents | null, compactPuffs = true, compactProjectiles = true) {
  const frame = captureCombat(engine, tick, acknowledged, simulationMs, true, compactPuffs, compactProjectiles);
  if (muzzleEvents) frame.muzzleEvents = muzzleEvents.snapshot();
  return frame;
}
