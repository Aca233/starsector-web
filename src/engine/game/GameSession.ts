import { CombatCheckpointStore, type SavedCombatCheckpoint } from './CombatCheckpointStore';
import { COMBAT_REPLAY_BUILD, copyReplayCheckpoint } from '../runtime/local/CombatReplayCheckpoint';
import { LOCAL_COMBAT_PROTOCOL } from '../runtime/local/LocalCombatProtocol';
import { readBattleSize } from '../runtime/BattleSizeSettings';
import { battleTeamLimit } from '../../shared/battle-size.mjs';
import { randomId } from "../../shared/RandomId";
import { DEFAULT_PLAYER_HULL, defaultOpponent } from '../data/SandboxDefaults';
import { CombatSession } from '../runtime/CombatSession';
import { CombatHandoff, createFleetMember, validateMemberContent } from './CombatHandoff';
import { beginCombat, createGameState, freezeGameState, settleCombat, type CombatRequest, type GameState } from './GameState';
import { decodeGameState } from './GameStateCodec';
import { GameSaveStore, type SaveStatus } from './GameSaveStore';


/** Game-level owner. Campaign data flows down as DTOs; settled results flow back up once. */
export class GameSession {
  public readonly combat: CombatSession;
  private state: GameState;
  private handoff: CombatHandoff;
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribeCombat: () => void;
  private issue: string | null = null;
  private activated = false;
  private disposed = false;
  private readonly checkpointStore: CombatCheckpointStore | null;
  private checkpointReady?: Promise<void>;
  private checkpointRecord: SavedCombatCheckpoint | null = null;
  private checkpointGeneration = 0;
  private checkpointBusy = false;
  private checkpointState: {state:'loading'|'empty'|'available'|'saved'|'saving'|'restoring'|'blocked'|'unavailable';message:string;tick?:number} = {state:'loading',message:'正在检查中场保存点。'};
  public get combatCheckpointStatus() { return this.checkpointState; }
  public get canSaveCombatCheckpoint(): boolean { return !!this.checkpointStore && !!this.state.pendingCombat && this.combat.supportsCheckpoints && !this.checkpointBusy; }
  public get canResumeCombatCheckpoint(): boolean { return !!this.checkpointRecord && !this.checkpointBusy && !!this.state.pendingCombat && this.combat.supportsCheckpoints; }

  constructor(
    private readonly store: GameSaveStore | null,
    initialHullId = DEFAULT_PLAYER_HULL,
    private readonly ephemeral = false,
    opponentId?: string
  ) {
    this.checkpointStore = store && !ephemeral ? new CombatCheckpointStore(store.storageKey) : null;
    // CombatSession initializes bundled content through the existing composition root.
    this.combat = new CombatSession(initialHullId, ephemeral && opponentId ? opponentId : defaultOpponent(initialHullId));
    const fresh = () => createGameState(randomId(), createFleetMember(this.combat.read.playerShip.spec.id, 'flagship'));
    const loaded = ephemeral ? null : store?.load();
    let state = loaded ?? fresh();
    try {
      for (const member of state.fleet) validateMemberContent(member);
      createFleetMember(state.sandboxHullId, 'sandbox-validation');
      if (state.pendingCombat) new CombatHandoff(state.pendingCombat);
    } catch (error) {
      store?.protect(error);
      state = fresh();
    }
    // A completed encounter is never relaunched as another fleet sortie on page reload.
    const request = state.pendingCombat ?? this.sandboxRequest(state, state.sandboxHullId);
    this.state = freezeGameState(state.pendingCombat ? state : beginCombat(state, request));
    this.handoff = new CombatHandoff(request);
    if (!ephemeral) this.combat.loadEncounter(this.handoff.request, this.handoff);
    this.unsubscribeCombat = this.combat.subscribeBattleCompleted(() => {
      if (!this.activated || this.ephemeral || !this.state.pendingCombat) return;
      try {
        const settled = settleCombat(this.state, this.combat.collectOutcome(this.handoff));
        this.combat.pause(); // No post-settlement simulation may diverge from the saved fleet.
        this.commit(settled);
      }
      catch (error) { this.issue = error instanceof Error ? error.message : String(error); this.emit(); }
    });
  }

  public getSnapshot(): GameState { return this.state; }
  public get mode(): CombatRequest['kind'] { return this.handoff.request.kind; }
  public get error(): string | null { return this.issue; }
  public get saveStatus(): SaveStatus {
    return this.ephemeral ? { state: 'memory-only', message: '视觉实验室不读写游戏存档。' }
      : this.store?.status ?? { state: 'memory-only', message: '本次进度仅在内存中。' };
  }
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private emit(): void { for (const listener of this.listeners) listener(); }

  private initializeCheckpoint(): Promise<void> {
    return this.checkpointReady ??= (async () => {
      if (!this.checkpointStore) { this.checkpointState = {state:'unavailable',message:'本次战斗不使用持久中场存档。'}; return; }
      const generation = this.checkpointGeneration, state = this.state;
      try {
        const record = await this.checkpointStore.load();
        if (this.disposed || generation !== this.checkpointGeneration || state !== this.state) return;
        const binding = this.store!.checkpointBinding(state);
        if (!record || record.binding !== binding || !state.pendingCombat) {
          this.checkpointState = {state:'empty',message:'没有适用于当前遭遇的中场保存点。'};
        } else {
          if (record.format !== 1 || !Number.isFinite(record.savedAt)) throw new Error('中场保存点格式不兼容。');
          const replay = copyReplayCheckpoint(record.replay, LOCAL_COMBAT_PROTOCOL);
          if (JSON.stringify(replay.config.encounter) !== JSON.stringify(state.pendingCombat)) throw new Error('中场点与出击名单不符。');
          this.checkpointRecord = {...record,replay};
          this.checkpointState = {state:'available',message:`发现第 ${replay.tick} tick 的中场保存点，可手动继续。`,tick:replay.tick};
        }
      } catch (error) {
        if (this.disposed || generation !== this.checkpointGeneration) return;
        this.checkpointState = {state:'blocked',message:`中场点未恢复，原记录未覆盖：${String(error)}`};
      } finally { if (!this.disposed && generation === this.checkpointGeneration) this.emit(); }
    })();
  }
  private invalidateCheckpoint(): void {
    const generation = ++this.checkpointGeneration;
    this.checkpointRecord = null;
    this.checkpointState = {state:'empty',message:'本次战斗已变化，旧中场点不再可用。'};
    if (!this.checkpointStore) return;
    void this.checkpointStore.write(null, () => {
      if (this.disposed || generation !== this.checkpointGeneration) return false;
      this.store!.checkpointBinding(this.state); return true;
    }).catch(error => {
      if (this.disposed || generation !== this.checkpointGeneration) return;
      this.checkpointState = {state:'blocked',message:`旧中场点清理未完成（仍受遭遇绑定隔离）：${String(error)}`}; this.emit();
    });
  }
  public async saveCombatCheckpoint(): Promise<void> {
    if (!this.canSaveCombatCheckpoint) throw new Error('当前不能保存中场点。');
    const state = this.state, generation = this.checkpointGeneration, epoch = this.combat.controlEpoch;
    const valid = () => !this.disposed && generation === this.checkpointGeneration && this.state === state && this.combat.controlEpoch === epoch;
    this.checkpointBusy = true;
    try {
      await this.initializeCheckpoint();
      if (!valid()) throw new Error('战斗已变化，保存取消。');
      if (COMBAT_REPLAY_BUILD === 'in-memory-only') throw new Error('缺少代码构建标识，不能保存可跨页面恢复的日志。');
      const binding = this.store!.checkpointBinding(state);
      this.checkpointState = {state:'saving',message:'正在保存已确认中场进度，请等待完成后再关闭页面。'}; this.emit();
      const replay = await this.combat.captureCheckpoint();
      if (JSON.stringify(replay.config.encounter) !== JSON.stringify(state.pendingCombat)) throw new Error('中场点的遭遇不匹配。');
      const record: SavedCombatCheckpoint = {format:1,binding,savedAt:Date.now(),replay};
      await this.checkpointStore!.write(record, () => valid() && this.store!.checkpointBinding(state) === binding);
      if (!valid() || this.store!.checkpointBinding(state) !== binding) throw new Error('保存期间战斗已变化。');
      this.checkpointRecord = record;
      this.checkpointState = {state:'saved',message:`中场点已保存到此浏览器：第 ${replay.tick} tick。刷新后可手动继续。`,tick:replay.tick};
    } catch (error) {
      if (valid()) this.checkpointState = {state:'blocked',message:`保存失败，未确认覆盖中场点：${String(error)}`};
      throw error;
    } finally { this.checkpointBusy = false; if (!this.disposed) this.emit(); }
  }
  public async resumeCombatCheckpoint(): Promise<void> {
    if (!this.canResumeCombatCheckpoint) throw new Error('当前没有可继续的中场保存点。');
    const record = this.checkpointRecord!, state = this.state, generation = this.checkpointGeneration;
    this.checkpointBusy = true;
    try {
      await this.checkpointStore!.verify();
      if (this.disposed || generation !== this.checkpointGeneration || this.store!.checkpointBinding(state) !== record.binding)
        throw new Error('存档已改变，拒绝恢复旧遭遇。');
      this.checkpointState = {state:'restoring',message:'正在重建中场进度，完成后保持暂停。',tick:record.replay.tick}; this.emit();
      const result = await this.combat.restoreCheckpoint(record.replay, () => this.store!.checkpointBinding(state) === record.binding);
      if (!result.accepted) throw new Error(result.reason);
      if (!this.disposed && generation === this.checkpointGeneration)
        this.checkpointState = {state:'saved',message:`已恢复第 ${record.replay.tick} tick，当前暂停。`,tick:record.replay.tick};
    } catch (error) {
      if (!this.disposed && generation === this.checkpointGeneration) this.checkpointState = {state:'blocked',message:`中场恢复失败：${String(error)}`};
      throw error;
    } finally { this.checkpointBusy = false; if (!this.disposed) this.emit(); }
  }

  /** Called after mounting, so React construction never writes the save. */
  public activate(): void {
    this.activated = true;
    if (!this.ephemeral) this.store?.save(this.state);
    void this.initializeCheckpoint();
    this.emit();
  }
  private commit(next: GameState): void {
    if (next === this.state) return;
    this.state = freezeGameState(decodeGameState(next));
    this.issue = null;
    if (this.activated && !this.ephemeral) this.store?.save(this.state);
    this.invalidateCheckpoint();
    this.emit();
  }
  private sandboxRequest(state: GameState, hullId: string): CombatRequest {
    return {
      id: `${state.gameId}:${state.nextEncounter}`, kind: 'sandbox', seed: 0x51f15e,
      playerFleet: [createFleetMember(hullId, 'sandbox-player')],
      enemyFleet: [createFleetMember(defaultOpponent(hullId), 'sandbox-enemy')]
    };
  }
  private launch(request: CombatRequest): void {
    const handoff = new CombatHandoff(request); // Fail before changing the current game or battle.
    const next = decodeGameState(beginCombat(this.state, request));
    this.combat.loadEncounter(handoff.request, handoff);
    this.handoff = handoff;
    this.commit(next);
  }

  public startSandbox(hullId = this.state.sandboxHullId): void {
    if (this.ephemeral) { this.combat.switchPlayerShip(hullId); return; }
    this.launch(this.sandboxRequest(this.state, hullId));
  }

  public restartCombat(): void {
    if (this.ephemeral) { this.combat.restart(); return; }
    if (this.mode === 'fleet') {
      if (!this.state.pendingCombat) throw new Error('舰队战果已写回。请从“舰队 / 存档”再次出击，或切换到沙盒。');
      // Explicit retry uses the exact pre-battle condition and ID, never a repaired hull.
      const next = decodeGameState({...this.state, revision:this.state.revision+1});
      this.combat.loadEncounter(this.handoff.request, this.handoff);
      this.commit(next);
      return;
    }
    this.startSandbox(this.combat.read.playerShip.spec.id);
  }

  public startFleetCombat(memberIds: string[], enemyHullId = defaultOpponent(this.state.fleet[0].hullId), initialPlayerIds: string[] = memberIds.slice(0,1), deploymentPointLimit = battleTeamLimit(readBattleSize())): void {
    if (this.ephemeral) throw new Error('视觉实验室不能启动持久舰队出击。');
    if (!memberIds.length || new Set(memberIds).size !== memberIds.length) throw new Error('请选择不重复的参战舰船。');
    const playerFleet = memberIds.map(id => {
      const member = this.state.fleet.find(ship => ship.id === id);
      if (!member || member.status !== 'ready') throw new Error('所选舰船不可出击。');
      return structuredClone(member);
    });
    this.launch({
      id: `${this.state.gameId}:${this.state.nextEncounter}`, kind: 'fleet', seed: this.state.nextEncounter >>> 0,
      playerFleet, enemyFleet: [createFleetMember(enemyHullId, 'encounter-enemy')], initialPlayerIds, deploymentPointLimit
    });
  }

  public exportSave(): string { return JSON.stringify(this.state, null, 2); }

  /** Explicit user-selected import; validate everything before replacing either state or storage. */
  public importSave(serialized: string): void {
    const imported = decodeGameState(JSON.parse(serialized));
    const decoded = decodeGameState({...imported, revision:Math.max(imported.revision, imported.gameId === this.state.gameId ? this.state.revision : 0)+1});
    for (const member of decoded.fleet) validateMemberContent(member);
    createFleetMember(decoded.sandboxHullId, 'sandbox-validation');
    const request = decoded.pendingCombat ?? this.sandboxRequest(decoded, decoded.sandboxHullId);
    const state = freezeGameState(decoded.pendingCombat ? decoded : beginCombat(decoded, request));
    const handoff = new CombatHandoff(request);
    this.combat.loadEncounter(handoff.request, handoff);
    this.handoff = handoff;
    this.state = state;
    this.issue = null;
    if (!this.ephemeral) this.store?.replace(state);
    this.invalidateCheckpoint();
    this.emit();
  }

  /** UI must explicitly confirm this destructive replacement. */
  public newGame(hullId: string): void {
    const next = createGameState(randomId(), createFleetMember(hullId, 'flagship'));
    const request = this.sandboxRequest(next, hullId);
    const state = freezeGameState(beginCombat(next, request));
    const handoff = new CombatHandoff(request);
    this.combat.loadEncounter(handoff.request, handoff);
    this.handoff = handoff;
    this.state = state;
    this.issue = null;
    if (!this.ephemeral) this.store?.replace(state);
    this.invalidateCheckpoint();
    this.emit();
  }

  public dispose(): void {
    this.disposed = true; this.checkpointGeneration++; this.checkpointStore?.dispose();
    this.unsubscribeCombat();
    this.listeners.clear();
    this.combat.dispose();
  }
}
