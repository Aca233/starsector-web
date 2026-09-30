/** Plain authority state: no callbacks, object references or WeakMap-only history.
 * Kept on the owning ShipSystem so snapshots preserve wave hit deduplication. */
export interface GravityFieldState {
  serial?: number;
  environmentHits?: string[];
  environmentBudgetRemaining?: number;
  releaseTargets?: import('./GravityTractorState').GravityTarget[];
  kind: 'WELL' | 'REPULSOR' | 'COLLAPSE';
  collapseApplied?: boolean;
  x: number;
  y: number;
  age: number;
  duration?: number;
  radius: number;
  shipBudgetRemaining: number;
  projectileBudgetRemaining: number;
  shipHits: string[];
  projectileHits: number[];
}
export interface GravityFieldSpec {
  kind: 'WELL' | 'REPULSOR';
  radius: number;
  /** WELL deployment and maintenance tether, not a cursor-following field. */
  placementRange: number;
  duration: number;
  /** WELL acceleration, REPULSOR one-shot delta-v, before mass/falloff. */
  shipStrength: number;
  projectileStrength: number;
  /** Total delta-v allocation across an emitter's recipients (per second for WELL). */
  shipBudget: number;
  projectileBudget: number;
  maxShips: number;
  maxProjectiles: number;
}
export interface GravityCollapseSpec { radius: number; damage: number; edgeDamage: number; maxShips: number }
export function validateGravityCollapse(spec?: GravityCollapseSpec): void {
  if (!spec) return;
  for (const key of ['radius','damage','edgeDamage'] as const) {
    if (!Number.isFinite(spec[key]) || spec[key] <= 0) throw Error('Invalid gravity collapse ' + key);
  }
  if (spec.edgeDamage > spec.damage || !Number.isInteger(spec.maxShips) || spec.maxShips < 1 || spec.maxShips > 64) throw Error('Invalid gravity collapse damage/recipient limit');
}
export function validateGravityField(spec?: GravityFieldSpec): void {
  if (!spec) return;
  if (spec.kind !== 'WELL' && spec.kind !== 'REPULSOR') throw Error('Invalid gravity field kind');
  for (const key of ['radius','placementRange','duration','shipStrength','projectileStrength','shipBudget','projectileBudget','maxShips','maxProjectiles'] as const) {
    if (!Number.isFinite(spec[key]) || spec[key] <= 0) throw Error('Invalid gravity field ' + key);
  }
  if (!Number.isInteger(spec.maxShips) || spec.maxShips > 64 || !Number.isInteger(spec.maxProjectiles) || spec.maxProjectiles > 256) throw Error('Invalid gravity recipient limit');
}
