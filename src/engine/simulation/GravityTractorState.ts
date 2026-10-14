export type GravityTarget = { kind: 'SHIP'; id: string } | { kind: 'PROJECTILE' | 'ASTEROID' | 'HULK'; id: number };
export interface GravityTractorSpec {
  captureTime: number;
  projectileCaptureTime: number;
  holdTime: number;
  recovery: number;
  anchorSpeed: number;
  strength: number;
  damping: number;
  fluxPerSecond: number;
  /** Explicit manual-only self propulsion; never selected by autofire/AI. */
  selfTow?: boolean;
  /** Hostility-only tidal damage; no projectile is emitted by this controller. */
  tidalDamagePerSecond?: number;
  tidalFluxPerSecond?: number;
}
/** Data only, owned by a real mount; IDs are resolved against the current roster. */
export interface GravityTractorState {
  phase: 'IDLE' | 'CAPTURE' | 'HOLD';
  polarity?: 1 | -1;
  target?: GravityTarget;
  capture: number;
  age: number;
  anchorX: number;
  anchorY: number;
  contactX: number;
  contactY: number;
  targetRadius?: number;
  waitRelease: boolean;
  status: string;
  damageClock?: number;
}
export interface GravityDeflectorSpec { impulse: number; budgetPerSecond: number; fluxPerUse: number; interval: number }
