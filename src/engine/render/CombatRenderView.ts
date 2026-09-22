import type { ShipRenderState, RenderHulk } from './ShipRenderState';
import type { CombatEngine } from '../simulation/CombatEngine';
import { projectileFlightLayer } from './ProjectileFlightLayer';
import { projectileVisualLayer } from './ProjectileVisualLayer';
import { predictedProjectileLayer } from './PredictedProjectileLayer';
import { localMuzzleLayer } from './LocalMuzzleLayer';
import { localParticleLayer } from './LocalParticleLayer';

const fields = [
  'ships', 'allCapitalShips', 'playerShip', 'enemyShip', 'playerWings', 'enemyWings',
  'combatTime', 'cameraShakeIntensity', 'environment', 'nebulae', 'asteroids',
  'projectiles', 'beams', 'particles', 'contrails', 'debris', 'explosions', 'hitGlows',
  'empArcs', 'mines', 'muzzleFlashes', 'muzzleParticles', 'shieldRipples', 'hulkFragments',
] as const satisfies readonly (keyof CombatEngine)[];
type Borrowed<T> = T extends Array<infer Item> ? readonly Item[] : T;
type VisualFields = { readonly [K in Exclude<typeof fields[number], 'ships' | 'allCapitalShips' | 'playerShip' | 'enemyShip' | 'hulkFragments' | 'playerWings' | 'enemyWings'>]: Borrowed<CombatEngine[K]> } & {
 readonly ships: readonly ShipRenderState[]; readonly allCapitalShips: readonly ShipRenderState[];
 readonly playerWings: readonly Pick<CombatEngine['playerWings'][number], 'specId'>[];
 readonly enemyWings: readonly Pick<CombatEngine['enemyWings'][number], 'specId'>[]; readonly playerShip: ShipRenderState; readonly enemyShip: ShipRenderState;
 readonly hulkFragments: readonly RenderHulk[];
};

/** Common legacy renderer capabilities, NOT a ReplayCheckpoint.
 * combatRenderView() returns a synchronous borrowed view; the local worker decoder
 * implements the same reads with a detached, display-owned replica.
 * Top-level engine/AI/RNG/weapon/FX orchestration capabilities are omitted.
 * Ship reads use a restricted contract; inline nested vectors/content remain borrowed, not deep readonly.
 * They must not be mutated/retained
 * as a historical snapshot. The opt-in local render projection supplies display-only ship records.
 */
export type CombatRenderView = VisualFields & {
  readonly kind: 'borrowed-combat-render-view' | 'detached-combat-render-view';
  readonly movingRayFades: Readonly<CombatEngine['fxSystem']['movingRayFades']>;
  readonly trailStrips: ReturnType<CombatEngine['contrailEngine']['getStrips']>;
  readonly projectileVisuals: ReturnType<typeof projectileVisualLayer>;
  readonly projectileFlight?: ReturnType<typeof projectileFlightLayer>;
  readonly projectilePrediction: ReturnType<typeof predictedProjectileLayer>;
  readonly localMuzzles: ReturnType<typeof localMuzzleLayer>;
  readonly localParticles: ReturnType<typeof localParticleLayer>;
};
const views = new WeakMap<CombatEngine, CombatRenderView>();
/** Stable view identity; all visual layers are looked up at draw time, including LAN sidecars. */
export function combatRenderView(engine: CombatEngine): CombatRenderView {
  let view = views.get(engine);
  if (view) return view;
  const descriptors: PropertyDescriptorMap = {};
  for (const key of fields) descriptors[key] = { enumerable: true, get: () => engine[key] };
  descriptors.kind = { enumerable: true, value: 'borrowed-combat-render-view' };
  descriptors.movingRayFades = { get: () => engine.fxSystem.movingRayFades };
  descriptors.trailStrips = { get: () => engine.contrailEngine.getStrips() };
  descriptors.projectileVisuals = { get: () => projectileVisualLayer(engine) };
  descriptors.projectileFlight = { get: () => projectileFlightLayer(engine) };
  descriptors.projectilePrediction = { get: () => predictedProjectileLayer(engine) };
  descriptors.localMuzzles = { get: () => localMuzzleLayer(engine.fxSystem) };
  descriptors.localParticles = { get: () => localParticleLayer(engine.fxSystem) };
  view = Object.freeze(Object.create(null, descriptors)) as CombatRenderView;
  views.set(engine, view);
  return view;
}
