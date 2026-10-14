import type { CombatPresentationMode } from './CombatPresentationWire';
import type { DeploymentCommand } from '../DeploymentControl';
import type { CombatControlCommand } from '../CombatControl';
import type { CombatRequest } from '../../game/GameState';
import type { ShipSpec } from '../../content/ShipSpec';
import type { WeaponSpec } from '../../simulation/Weapon';
import type { ShipPack } from '../../modding/ShipPack';

/** Public configuration and commands; the Kernel implements this contract. */
export interface LocalCombatConfig {
  /** Explicit authority for deterministic replay. Default stays TS until final acceptance. */
  backend?: 'typescript' | 'rust-wasm';
  playerHull: string; enemyHull: string; seed: number;
  expectedContent?: string;
  content?: {ships: ShipSpec[]; weapons: WeaponSpec[]; packs?: ShipPack[]};
  multicore?: boolean;
  /** Display-only render graph, with the complete HUD read set alongside it. */
  presentation?: CombatPresentationMode;
  encounter?: CombatRequest;
  /** Empty simulator, with the same per-side budget as the design-trial entry. */
  simulationPointLimit?: number;
  additionalShips?: { hull: string; isPlayer: boolean; position: [number, number]; facing: number }[];
  /** Experimental: carry the flat one-way projection frame beside the presenter
   * packet. Off by default; the presenter path is untouched while this is on. */
  projectedPresentation?: boolean;
}
export type LocalCombatCommand = CombatControlCommand |
  { kind: 'deployment'; command: DeploymentCommand } |
  { kind: 'add-ship'; hull: string; isPlayer: boolean; position: [number, number]; facing: number };
