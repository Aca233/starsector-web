/** Transport DTO only. Authority capture and legacy diagnostics live separately. */
import type { FixedDisplayTable } from "./display/FixedDisplayRecords";
import type { CombatComponentEventBatch } from "./CombatComponentEvents";
import type { Seat } from "./protocol";
type Wire = any;
export interface CombatSound {
  id: number;
  key: string;
  volume: number;
  rate: number;
  pos?: [number, number];
}
export interface CombatSnapshot {
  displayVersion?: 1;
  controlled?: Record<number, string>;
  displayWings?: {player: unknown[]; enemy: unknown[]};
  displayWorld?: any;
  fixedDisplay?: FixedDisplayTable;
  /** Self-contained scalar templates; independent of mutation-journal mode. */
  recordDefinitions?: unknown;
  /** Self-contained cosmetic spawn window; not a resumable physics checkpoint. */
  muzzleEvents?: import('./muzzle-events.mjs').MuzzleEventBatch;
  particleEvents?: import('./particle-events.mjs').ParticleEventBatch;
  sounds?: CombatSound[];
  deployment?: import("../engine/simulation/CombatDeployment").DeploymentState;
  tick: number;
  acknowledged: Record<Seat, number>;
  componentMode?: 1;
  combatEvents?:CombatComponentEventBatch;
  componentDefinitions?:Record<string,Wire>;
  ships: Array<{ id: string; spec?:number; generation?:number; state: Wire }>;
  crafts: Array<{ id: string; generation?:number; kind: "fighter" | "bomber" | "drone" | "detached"; spec: number; state: Wire }>;
  craftSpecs: Wire[];
  /** Lossless, self-contained field dictionary for nested presentation records. */
  layouts?: string[][];
  world: Wire;
  simulationMs: number;
  snapshotHz?: number;
  /** Negotiated separate visual authority; world.projectiles must be empty. */
  projectileVisuals?: 1;
  captureMs?: number;
  encodeMs?: number;
  /** Authority clock progress over wall time, including serialization/recovery. */
  realtimeRatio?: number;
  combatRate?: number;
}
