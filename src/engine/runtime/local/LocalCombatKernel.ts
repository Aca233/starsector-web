import { copyDeploymentCommand, prepareDeployment, applyPreparedDeployment, type DeploymentCommand } from '../DeploymentControl';
import { contentRegistry } from '../../content/ContentRegistry';
import { deploymentCost } from '../../simulation/CombatDeployment';
import { localCombatContentSignature } from './LocalCombatContent';
import { CombatEngine } from '../../simulation/CombatEngine';
import { CapitalShipAI } from '../../ai/CapitalShipAI';
import { Vector2 } from '../../math/Vector2';
import { CombatMulticore } from '../../ai/multicore/CombatMulticore';
import { CombatTickHost } from '../CombatTickHost';
import { CombatAuthority } from '../CombatAuthority';
import { applyCombatControlCommand, applyCombatControlSample, copyControlSample, type CombatControlCommand, type CombatControlSample } from '../CombatControl';
import { CombatHandoff } from '../../game/CombatHandoff';
import type { CombatRequest, CombatOutcome } from '../../game/GameState';
import type { ShipSpec } from '../../content/ShipSpec';
import type { CommandResult } from '../CombatCommands';

export interface LocalCombatConfig {
  playerHull: string; enemyHull: string; seed: number;
  expectedContent?: string;
  content?: {ships: ShipSpec[]; weapons: import('../../simulation/Weapon').WeaponSpec[]};
  multicore?: boolean;
  /** Display-only render graph, with the complete HUD read set alongside it. */
  presentation?: 'compatibility' | 'render';
  encounter?: CombatRequest;
  /** Empty simulator, with the same per-side budget as the design-trial entry. */
  simulationPointLimit?: number;
  additionalShips?: { hull: string; isPlayer: boolean; position: [number, number]; facing: number }[];
}
export type LocalCombatCommand = CombatControlCommand |
  { kind: 'deployment'; command: DeploymentCommand } |
  { kind: 'add-ship'; hull: string; isPlayer: boolean; position: [number, number]; facing: number };
const point = (p: readonly number[]) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);

/** Complete authoritative simulation, shared by inline verification and the module Worker.
 * No DOM, wall-clock pacing, rendering or network-snapshot approximation. */
export class LocalCombatKernel {
  readonly authority: CombatAuthority;
  playerAI: CapitalShipAI;
  private handoff?: CombatHandoff;
  private readonly multicore = new CombatMulticore();
  private readonly tickHost = new CombatTickHost();
  private disposed = false;
  private deploymentPending = false;
  /** Cheap transaction witness; NOT a serialized world or a complete-state hash. */
  replayWitness(): number[] {
    const e = this.engine, p = e.playerShip, enemy = e.enemyShip;
    return [this.tick, ...e.random.checkpointWitness(), ...e.visualRandom.checkpointWitness(),
      e.combatTime, p.pos.x, p.pos.y, p.vel.x, p.vel.y, p.facingRad, p.hullHp,
      p.flux.softFlux, p.flux.hardFlux, enemy.pos.x, enemy.pos.y, enemy.hullHp,
      e.reinforcements.length, e.projectiles.length, e.beams.length];
  }
  get aiStatus() { return this.multicore.status; }
  get engine(): CombatEngine { return this.authority.engine; }
  get tick(): number { return this.authority.tick; }
  constructor(config: LocalCombatConfig) {
    if (!config || (config.presentation !== undefined && config.presentation !== 'compatibility' && config.presentation !== 'render') || typeof config.playerHull !== 'string' || typeof config.enemyHull !== 'string'
      || !Number.isSafeInteger(config.seed) || (config.multicore !== undefined && typeof config.multicore !== 'boolean') || (config.additionalShips?.length ?? 0) > 4096)
      throw new Error('Invalid local combat configuration');
    if (config.simulationPointLimit !== undefined && (!Number.isInteger(config.simulationPointLimit) || config.simulationPointLimit <= 0 || config.simulationPointLimit > 20000 || config.encounter || config.additionalShips?.length))
      throw new Error('Invalid simulator configuration');
    if (config.content) contentRegistry.installSnapshot(config.content.ships, config.content.weapons);
    if (config.expectedContent !== undefined && config.expectedContent !== localCombatContentSignature())
      throw new Error('Local worker content differs from the display; live mod migration is not supported');
    this.authority = new CombatAuthority(new CombatEngine(config.playerHull, config.enemyHull, config.seed));
    this.playerAI = new CapitalShipAI(this.engine.playerShip, this.engine.enemyShip);
    this.multicore.enabled = config.multicore !== false;
    if (config.simulationPointLimit !== undefined) this.engine.beginSimulationDeployment(deploymentCost(this.engine.playerShip.spec), config.simulationPointLimit);
    if (config.encounter) {
      if (config.additionalShips?.length) throw new Error('Encounter roster must be owned by CombatHandoff');
      this.handoff = new CombatHandoff(config.encounter);
      this.handoff.deploy(this);
    }
    for (const ship of config.additionalShips ?? []) this.command({ kind: 'add-ship', ...ship });
  }
  beginEncounter(player: string | ShipSpec, enemy: string | ShipSpec, seed: number): void {
    if (this.disposed || this.deploymentPending || this.tickHost.hasPendingTick) throw new Error('Cannot replace a closed or advancing combat kernel');
    this.multicore.reset(); this.tickHost.discard();
    this.engine.setSeed(seed); this.authority.beginEpoch(); this.engine.switchPlayerShip(player, enemy);
    this.playerAI = new CapitalShipAI(this.engine.playerShip, this.engine.enemyShip);
  }
  refreshPresentationAssets(): void { /* The display owns asset preparation. */ }
  command(command: Exclude<LocalCombatCommand, { kind: 'deployment' }>): CommandResult {
    if (this.disposed || this.deploymentPending || this.tickHost.hasPendingTick) throw new Error('Cannot command a closed or advancing combat kernel');
    if (command.kind === 'add-ship') {
      if (this.handoff) return { accepted: false, reason: 'Encounter roster is owned by CombatHandoff' };
      if (typeof command.hull !== 'string' || typeof command.isPlayer !== 'boolean' || !point(command.position) || !Number.isFinite(command.facing))
        throw new Error('Invalid roster command');
      this.engine.addShip(command.hull, command.isPlayer, new Vector2(...command.position), command.facing);
      return { accepted: true };
    }
    return applyCombatControlCommand(this.engine, command);
  }
  async dispatchDeployment(command: DeploymentCommand): Promise<CommandResult> {
    if (this.disposed || this.deploymentPending || this.tickHost.hasPendingTick) return { accepted: false, reason: '战斗正忙或已关闭。' };
    const epoch = this.authority.epoch, revision = contentRegistry.revision;
    this.deploymentPending = true;
    try {
      const prepared = await prepareDeployment(copyDeploymentCommand(command));
      if (this.disposed || this.authority.epoch !== epoch || contentRegistry.revision !== revision) return { accepted: false, reason: '战斗或内容已改变，未部署舰船。' };
      return applyPreparedDeployment(this.engine, prepared);
    } catch (error) { return { accepted: false, reason: error instanceof Error ? error.message : String(error) }; }
    finally { this.deploymentPending = false; }
  }
  step(sample: CombatControlSample): void {
    if (this.disposed || this.deploymentPending || this.tickHost.hasPendingTick) throw new Error('Cannot advance a closed or advancing combat kernel');
    const accepted = copyControlSample(sample);
    applyCombatControlSample(this.engine, this.playerAI, 1 / 60, accepted);
    this.authority.advance(1 / 60);
  }
  /** Worker production path retains the existing audited AI pool, serial barriers,
   * native startup deadline and cost guard. The synchronous step is the reference. */
  stepScheduled(sample: CombatControlSample): void | false | Promise<void | false> {
    if (this.disposed) return false;
    if (this.deploymentPending || this.tickHost.hasPendingTick) throw new Error('A combat transaction is already pending');
    const accepted = copyControlSample(sample), start = performance.now();
    return this.tickHost.run({
      prepare: () => {
        applyCombatControlSample(this.engine, this.playerAI, 1 / 60, accepted);
        return this.multicore.prepare(this.engine, this.playerAI, 1 / 60);
      },
      commit: batch => {
        try { this.authority.advance(1 / 60, true, batch); }
        finally { batch?.finish(); }
        this.multicore.record(performance.now() - start, !!batch);
      },
      discard: () => {},
      failed: () => this.multicore.reset(),
    });
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.multicore.reset(); this.tickHost.dispose();
  }
  /** Settlement is captured by the authoritative owner, never reconstructed from RenderFrame. */
  outcome(): CombatOutcome | null {
    return this.handoff && this.engine.isBattleResultReady ? this.handoff.collect(this) : null;
  }
}
