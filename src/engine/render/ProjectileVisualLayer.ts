import type { CombatEngine } from '../simulation/CombatEngine';
export interface ProjectileVisualLayer {
  readonly projectiles: CombatEngine['projectiles'];
  readonly time: number;
  readonly tick: number;
  readonly stale?: boolean;
}
// Network presentation owns this layer, never CombatEngine.projectiles (a
// delegated setter into the weapon system). Single-player has no layer.
const layers = new WeakMap<object, ProjectileVisualLayer>();
export const projectileVisualLayer = (engine: object): ProjectileVisualLayer | undefined => layers.get(engine);
export function setProjectileVisualLayer(engine: object, layer: ProjectileVisualLayer | null): void {
  if (layer) layers.set(engine, layer); else layers.delete(engine);
}
