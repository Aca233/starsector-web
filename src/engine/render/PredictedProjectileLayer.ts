import type { CombatEngine } from '../simulation/CombatEngine';
import type { Projectile } from '../simulation/Weapon';
/** Render-only. Never read by target selection, collision, capture or authority. */
export interface PredictedProjectileLayer {
  readonly projectiles: readonly Projectile[];
  readonly corrections: ReadonlyMap<number, Projectile>;
}
const layers = new WeakMap<CombatEngine, PredictedProjectileLayer>();
export const predictedProjectileLayer = (engine: CombatEngine): PredictedProjectileLayer | undefined => layers.get(engine);
export function setPredictedProjectileLayer(engine: CombatEngine, layer?: PredictedProjectileLayer): void {
  if (layer) layers.set(engine, layer); else layers.delete(engine);
}
