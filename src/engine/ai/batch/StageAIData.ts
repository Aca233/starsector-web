import type { FleetTask } from '../FleetTask';

/** Producer-owned scalar supplement. Query consumers receive AIStageReadData. */
export interface AIStageData {
  ids: string[];
  currentTargetId: (string | undefined)[];
  previousTask: (FleetTask | undefined)[];
  systemMode: (string | undefined)[];
  engineState: string[];
  /** JSON of [parentShip?.id,moduleMount?.slotId,x,y,angleDeg]; not only root ID.
   * Reattachment/reposition edges must invalidate primitive multirate intent. */
  attachmentKey: string[];
  strafeMultiplier: Float64Array;
  specSpeed: Float64Array;
  specArmor: Float64Array;
  /** Raw shield.isActive (contact shieldActive also requires unfolded arc >5). */
  rawShieldActive: Float64Array;
  /** maxArcDeg * PI / 360, not (maxArcDeg * PI / 180) / 2. */
  shieldThreatHalfArc: Float64Array;
  wingPower: Float64Array;
  carrierRange: Float64Array;
  vastBulk: Float64Array;
  systemDrone: Float64Array;
  player: Float64Array;
  retreating: Float64Array;
  doNotBackOff: Float64Array;
  systemActive: Float64Array;
  systemLocksTurning: Float64Array;
  forcesAutofire: Float64Array;
  shieldPhased: Float64Array;
  /** ship.system.isPhased, matching existing fleet kernel; not allSystems.some. */
  systemPhased: Float64Array;
  tacticalPresent: Float64Array;
  /** Preserve compact forecast admission; exact authored AI stays full horizon. */
  nativeForecast: Float64Array;
  attachedMotion: Float64Array;
  /** Existing training override; -1 means use the bundled numeric policy. */
  trainingAction: Float64Array;
  blockedLaneTarget: Float64Array;
  slotIds: string[];
  /** Aim/profile delay differs from speculative weapon readiness charge delay. */
  profileDelay: Float64Array;
  /** Original positioning uses missing turnRate=0, forecasting uses =30. */
  positionTurnRate: Float64Array;
  /** Capture original expressions, never reconstruct via (facing+base)-facing
   * or arc/2; those reorderings change physics/state differential ties. */
  localBaseAngle: Float64Array;
  authoredHalfArc: Float64Array;
  fixedMount: Float64Array;
  projectileFuse: Float64Array;
  projectileTurnRate: Float64Array;
  projectileMaxSpeed: Float64Array;
  projectileDidDamage: Float64Array;
  projectileSourceId: string[];
  /** Asteroids followed by gravityManaged/gravityFixed hulk fragments. */
  obstacleCount: number;
  asteroidCount: number;
  obstacleX: Float64Array;
  obstacleY: Float64Array;
  obstacleVx: Float64Array;
  obstacleVy: Float64Array;
  obstacleRadius: Float64Array;
}

export type AIStageReadData = {
  readonly [K in keyof AIStageData]: AIStageData[K] extends Float64Array
    ? Readonly<ArrayLike<number>> : AIStageData[K] extends (infer Item)[]
      ? readonly Item[] : AIStageData[K]
};
