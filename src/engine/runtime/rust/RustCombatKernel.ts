/** Complete resident native authority behind the existing Worker transaction. */
import type { LocalCombatConfig, LocalCombatCommand } from '../local/LocalCombatContracts';
import { copyControlSample, type CombatControlSample } from '../CombatControl';
import { flightKeys } from '../CombatCommands';
import type { CommandResult } from '../CombatCommands';
import type { DeploymentCommand } from '../DeploymentControl';
import { copyDeploymentCommand, prepareDeployment } from '../DeploymentControl';
import type { CombatOutcome } from '../../game/GameState';
import type { LocalCombatAIStatus, LocalCombatTelemetry } from '../../contracts/CombatTelemetry';
import { GRAVITY_HOLD_KEY, GRAVITY_PUSH_KEY } from '../../simulation/systems/GravityControlInput';
import { RustCombatCore } from './RustCombatCore';
import { loadRustCombatModule, type RustCombatModule } from './RustCombatModule';
import { compileRustCombatStartup, type RustCombatStartup } from './RustCombatStartup';
import { installRustCombat } from './RustCombatInstall';
import { encodeRustSceneControl, type RustSceneControl, type RustSceneUnit } from './RustSceneProtocol';
import { encodeRustSceneShipCommand } from './RustSceneShipCommandProtocol';
import type { RustScenePublication, RustSceneShipRead } from './RustScenePublication';
import type { RustCoreSnapshot } from './RustCoreProtocol';
import { rustCombatFacts, type RustPresentationLive } from './RustCombatFactsAdapter';
import { decodeRustOrdnanceFacts } from './RustOrdnanceFacts';
import { RustCombatPresentation, type RustCombatPresentationFrame } from './RustCombatPresentation';
import { captureRustCombatOutcome } from './RustCombatSettlement';
import { compileRustDynamicAdmission, encodeRustDynamicAdmission, type RustDynamicEntry } from './RustDynamicAdmission';
import { defaultShipFit } from '../../content/DefaultShipFit';
import type { ShipSpec } from '../../content/ShipSpec';
import type { ProjectedFrameViews } from './RustProjectionViews';
import { immutableCopy } from '../../extensions/Immutable';
import type { RustCompiledContent } from './RustContentCompiler';

export class RustCombatKernel {
  readonly backend = 'rust-wasm' as const;
  private snapshot: RustCoreSnapshot;
  private scene: RustScenePublication;
  private readonly presenter: RustCombatPresentation;
  private revision = 0;
  private disposed = false;
  private completedOutcome?: CombatOutcome;
  private dynamicSerial = 0;
  private templateSpecBase = 2_000_000;
  private content: RustCompiledContent;
  static async create(config: LocalCombatConfig, epoch: number, artifact?: RustCombatModule): Promise<RustCombatKernel> {
    const startup = compileRustCombatStartup(config), loaded = artifact ?? await loadRustCombatModule();
    const core = await RustCombatCore.create(loaded.module, config.encounter?.seed ?? config.seed);
    try {
      installRustCombat(core, startup.content, { playerId: startup.playerId, enemyId: startup.enemyId, asteroids: true,
        scene: startup.scene, startupRadio: startup.radio, startupAudio: startup.audio });
      return new RustCombatKernel(core, startup, config, epoch, loaded.sha256);
    } catch (error) { core.dispose(); throw error; }
  }
  private constructor(private readonly core: RustCombatCore, private readonly startup: RustCombatStartup,
    private readonly config: LocalCombatConfig, private readonly epoch: number, readonly wasmSha256: string) {
    this.snapshot = core.snapshot(); this.scene = core.scenePublication(); this.content = startup.content;
    this.presenter = new RustCombatPresentation(startup.content, epoch);
  }
  get tick(): number { return this.snapshot.tick; }
  private refresh(): void { this.snapshot = this.core.snapshot(); this.scene = this.core.scenePublication(); }
  private player(): RustSceneShipRead { return this.scene.ships.find(s => s.handle.slot === this.scene.player.slot && s.handle.generation === this.scene.player.generation)!; }
  private ship(id: string): RustSceneShipRead { const ship = this.scene.ships.find(s => s.stableId === id); if (!ship) throw Error('Unknown Rust command ship identity: ' + id); return ship; }
  private unit(id: string): RustSceneUnit { return id === 'fleet' ? { fleet: true } : { handle: this.ship(id).handle }; }
  private apply(control: RustSceneControl): CommandResult {
    const player = this.player(); this.core.applyPacked(Float64Array.from(encodeRustSceneControl(control, player.id, player.handle).flat()));
    this.refresh(); return this.scene.commandResults.at(-1) ?? { accepted: true };
  }
  stepScheduled(input: CombatControlSample): void {
    this.requireOpen(); const sample = copyControlSample(input);
    const player = this.player();
    this.core.applyPacked(Float64Array.from(encodeRustSceneControl({ kind: 'sample', autopilot: sample.autopilot, blocked: sample.blocked,
      keys: flightKeys.reduce((mask, key, i) => mask | (+!!sample.keys[key] << i), 0), aim: sample.aim,
      firing: sample.firing, mouse: sample.mouseSteering, pointer: sample.pointerActive,
      field: !!sample.keys[GRAVITY_HOLD_KEY], push: !!sample.keys[GRAVITY_PUSH_KEY] }, player.id, player.handle).flat()));
    this.core.step(1 / 60); this.refresh();
  }
  command(command: Exclude<LocalCombatCommand, { kind: 'deployment' }>): CommandResult {
    this.requireOpen(); const c = structuredClone(command);
    switch (c.kind) {
      case 'clear-input': case 'stop-firing': case 'toggle-map': return this.apply(c);
      case 'pilot': return this.apply(c);
      case 'ship': {
        const player = this.player(); this.core.applyPacked(Float64Array.from(encodeRustSceneShipCommand(c, player.id, player.handle).flat()));
        this.refresh(); const result = this.scene.commandResults.at(-1); if (!result) throw Error('Missing Rust ship command receipt'); return result;
      }
      case 'tactical': {
        const t = c.command;
        switch (t.action) {
          case 'close': return this.apply({ kind: 'close-map' });
          case 'select': return this.apply({ kind: 'select', unit: t.unitId === null ? null : this.unit(t.unitId) });
          case 'target': case 'cancel-target': return this.apply({ kind: t.action, target: this.ship(t.targetId).handle });
          case 'cancel': return this.apply({ kind: 'cancel', unit: this.unit(t.unitId) });
          case 'order': return this.apply({ kind: 'order', unit: this.unit(t.unitId), type: t.order.type,
            target: t.order.targetShipId ? this.ship(t.order.targetShipId).handle : undefined, position: t.order.position });
          case 'escort': return this.apply({ kind: 'escort', ships: t.unitIds.map(id => this.ship(id).handle), team: this.player().team, target: this.ship(t.targetId).handle });
          case 'retreat': return this.apply({ kind: 'retreat', ships: t.unitIds.map(id => this.ship(id).handle), team: this.player().team, withdraw: t.full });
        } break;
      }
      case 'add-ship': return this.addShip(c);
    }
    throw Error('Unknown Rust combat command');
  }
  private addShip(command: Extract<LocalCombatCommand, { kind: 'add-ship' }>): CommandResult {
    if (this.config.encounter) return {accepted:false,reason:'Encounter roster is owned by CombatHandoff'};
    if (typeof command.hull !== 'string' || typeof command.isPlayer !== 'boolean' || !Array.isArray(command.position)
      || command.position.length !== 2 || !command.position.every(Number.isFinite) || !Number.isFinite(command.facing)) throw Error('Invalid roster command');
    return this.admit('add-ship',[{spec:defaultShipFit(command.hull),isPlayer:command.isPlayer,position:command.position,facing:command.facing}]);
  }
  private admit(kind:'add-ship'|'simulation-wave',entries:readonly RustDynamicEntry[]):CommandResult {
    const draft = compileRustDynamicAdmission(this.content,this.scene,this.snapshot,kind,entries,++this.dynamicSerial,this.templateSpecBase);
    const player = this.player(), oldEnemy = this.scene.enemy;
    this.core.applyPacked(encodeRustDynamicAdmission(draft.json,player.id,player.handle)); this.refresh();
    const result = this.scene.commandResults.at(-1); if (!result) throw Error('Missing native dynamic admission receipt');
    if (result.accepted) {
      const retired = this.scene.ships.find(ship => ship.handle.slot === oldEnemy.slot && ship.handle.generation === oldEnemy.generation);
      const retiring = retired?.stableId === 'rust-retired-sentinel:'+oldEnemy.slot+':'+oldEnemy.generation;
      const content: RustCompiledContent = immutableCopy({...draft.content,entities:draft.content.entities.map(entity => retiring && (entity.stableId === 'enemy_ship' || entity.stableId.startsWith('enemy_ship:module:'))
        ? {...entity,stableId:retired.stableId+entity.stableId.slice('enemy_ship'.length)} : entity)});
      this.presenter.replaceContent(content); this.content=content; this.templateSpecBase=draft.nextSpecBase;
    }
    return result;
  }
  async dispatchDeployment(command: DeploymentCommand): Promise<CommandResult> {
    this.requireOpen();
    try {
      const prepared = await prepareDeployment(copyDeploymentCommand(command));
      if (prepared.kind === 'fleet') return this.apply({ kind: 'deploy', ships: prepared.ids.map(id => this.ship(id).handle), team: this.player().team });
      if (prepared.kind === 'simulation-limit') return this.apply(prepared);
      return this.admit('simulation-wave',prepared.entries.map(entry => ({spec:entry.specId,isPlayer:entry.isPlayer})));
    } catch (error) { return { accepted:false, reason:error instanceof Error ? error.message : String(error) }; }
  }
  capturePresentation(): RustCombatPresentationFrame {
    this.requireOpen();
    const reads = new Map(this.scene.ships.map(ship => [ship.id, ship]));
    const handle = (id: number) => { const ship = reads.get(id); if (!ship) throw Error('Unknown Rust live fact owner'); return ship.handle; };
    const ordnance = decodeRustOrdnanceFacts(this.scene.ordnance, this.content, this.snapshot, this.scene.ships);
    const live: RustPresentationLive = { ...ordnance, audio: this.scene.visual.audio,
      systems: this.scene.dynamic.systems.map(system => ({ ...system, handle: handle(system.id) })),
      mounts: this.scene.dynamic.mounts.map(mount => ({ ...mount, handle: handle(mount.id) })),
      poses: this.scene.dynamic.ships.map(ship => ({ ...ship, handle: handle(ship.id) })) };
    return this.presenter.capture(this.snapshot, rustCombatFacts(this.content, this.snapshot, this.scene, live, this.epoch, ++this.revision));
  }
  projectedWitness(): number[] { return Array.from(this.core.projectedWitness()); }
  /** Live Wasm witness view for wire transfer; copy before any growing call. */
  projectedWitnessView(): Float64Array { return this.core.projectedWitness(); }
  /** Zero-copy projected frame for the direct batch renderer; read-only over the
   * authority and additive to the existing presentation path. */
  captureProjected(): ProjectedFrameViews { return this.core.projectionFrameViews(); }
  /** Hull sprite dimensions per projected ship id, bound from content.
   * Sprite size is presentation data the authority does not carry (D-A ②), so
   * the host supplies it per entity instead of growing the wasm spec row. */
  projectionSpriteSizes(): Map<number, { width: number; height: number }> {
    // The compiled content dictionary is the single hull binding the presenter
    // uses too, so the projected sizes cannot drift from the rendered ships.
    const specs = new Map<string, ShipSpec>();
    for (const entry of this.content.dictionary.ships) if (!specs.has(entry.key)) specs.set(entry.key, entry.spec);
    for (const entry of this.content.dictionary.templates) if (!specs.has(entry.key)) specs.set(entry.key, entry.spec);
    const key = (handle: { slot: number; generation: number }) => handle.slot + '/' + handle.generation;
    // The scene publication leaves specKey empty once a birth is bound; the
    // compiled content entities carry the authoritative hull binding per handle.
    const specOfHandle = new Map<string, string>();
    for (const entity of this.content.entities) specOfHandle.set(key(entity.handle), entity.specKey);
    const sizes = new Map<number, { width: number; height: number }>();
    for (const ship of this.scene.ships) {
      const spec = specs.get(specOfHandle.get(key(ship.handle)) ?? ship.specKey);
      if (!spec || !Number.isFinite(spec.spriteWidth) || !Number.isFinite(spec.spriteHeight)) continue;
      sizes.set(ship.id, { width: Math.max(1, spec.spriteWidth), height: Math.max(1, spec.spriteHeight) });
    }
    return sizes;
  }
  acknowledgePublication(): void { this.core.acknowledgeEvents(this.snapshot.lastEventSequence); this.core.acknowledgeAudio(this.scene.visual.audio.sequence); }
  discardReplayOutputs(): void { this.acknowledgePublication(); this.presenter.discardAudioThrough(this.scene.visual.audio.sequence); }
  replayWitness(): number[] {
    const p = this.snapshot.bodies.find(b => b.id === this.player().id)!;
    const e = this.snapshot.bodies.find(b => b.handle.slot === this.scene.enemy.slot && b.handle.generation === this.scene.enemy.generation)!;
    return [this.tick, ...this.snapshot.random, ...this.snapshot.visualRandom, this.snapshot.combatTime,
      p.motion[0], p.motion[1], p.motion[2], p.motion[3], p.motion[4], p.ship!.armor!.values[14], p.ship!.flux[8], p.ship!.flux[9],
      e.motion[0], e.motion[1], e.ship!.armor!.values[14], this.scene.rosters.allCapitalShips.length - 1 - Number(this.scene.primaryEnemyDeployed), this.snapshot.projectiles.length, this.snapshot.beams.length];
  }
  get telemetry(): LocalCombatTelemetry {
    const strips = this.scene.visual.visuals.trailStrips;
    return { collision: { backendState: 'ready', typescriptBatches: 0, wasmBatches: 0, wasmFallbacks: 0,
      projectileCount: this.snapshot.projectiles.length, candidatePairs: 0, maxCandidatesPerProjectile: 0, kernelMs: 0 },
      trails: { stripCount: strips.length, pointCount: strips.reduce((sum, strip) => sum + strip.points.length, 0) } };
  }
  get aiStatus(): LocalCombatAIStatus {
    return { mode: 'serial', reason: 'Rust/Wasm 常驻战斗权威', metrics: null, workers: 0, tier: 'audited',
      budget: { reason: 'Rust/Wasm', serialMs: 0, parallelMs: 0, lastRejectedParallelMs: 0, serialSamples: 0,
        parallelSamples: 0, serialProbeSamples: 0, lastRejectedSerialMs: 0, lastRejectedShips: 0 } };
  }
  outcome(): CombatOutcome | null { return this.captureOutcome(); }
  private captureOutcome(): CombatOutcome | null {
    if (!this.config.encounter || !this.scene.resultReady) return null;
    return structuredClone(this.completedOutcome ??= captureRustCombatOutcome(this.config.encounter, {...this.startup,content:this.content}, this.snapshot, this.scene));
  }
  dispose(): void { if (!this.disposed) { this.disposed = true; this.core.dispose(); } }
  private requireOpen(): void { if (this.disposed) throw Error('Rust combat kernel is closed'); }
}
