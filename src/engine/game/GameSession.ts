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

  constructor(
    private readonly store: GameSaveStore | null,
    initialHullId = DEFAULT_PLAYER_HULL,
    private readonly ephemeral = false,
    opponentId?: string
  ) {
    // CombatSession initializes bundled content through the existing composition root.
    this.combat = new CombatSession(initialHullId, ephemeral && opponentId ? opponentId : defaultOpponent(initialHullId));
    const fresh = () => createGameState(crypto.randomUUID(), createFleetMember(this.combat.engine.playerShip.spec.id, 'flagship'));
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
    if (!ephemeral) this.handoff.deploy(this.combat);
    this.unsubscribeCombat = this.combat.subscribeBattleCompleted(() => {
      if (!this.activated || this.ephemeral || !this.state.pendingCombat) return;
      try {
        const settled = settleCombat(this.state, this.handoff.collect(this.combat));
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

  /** Called after mounting, so React construction never writes the save. */
  public activate(): void {
    this.activated = true;
    if (!this.ephemeral) this.store?.save(this.state);
    this.emit();
  }
  private commit(next: GameState): void {
    if (next === this.state) return;
    this.state = freezeGameState(decodeGameState(next));
    this.issue = null;
    if (this.activated && !this.ephemeral) this.store?.save(this.state);
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
    handoff.deploy(this.combat);
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
      this.handoff.deploy(this.combat);
      this.issue = null;
      this.emit();
      return;
    }
    this.startSandbox(this.combat.engine.playerShip.spec.id);
  }

  public startFleetCombat(memberIds: string[], enemyHullId = defaultOpponent(this.state.fleet[0].hullId)): void {
    if (this.ephemeral) throw new Error('视觉实验室不能启动持久舰队出击。');
    if (!memberIds.length || new Set(memberIds).size !== memberIds.length) throw new Error('请选择不重复的参战舰船。');
    const playerFleet = memberIds.map(id => {
      const member = this.state.fleet.find(ship => ship.id === id);
      if (!member || member.status !== 'ready') throw new Error('所选舰船不可出击。');
      return structuredClone(member);
    });
    this.launch({
      id: `${this.state.gameId}:${this.state.nextEncounter}`, kind: 'fleet', seed: this.state.nextEncounter >>> 0,
      playerFleet, enemyFleet: [createFleetMember(enemyHullId, 'encounter-enemy')]
    });
  }

  public exportSave(): string { return JSON.stringify(this.state, null, 2); }

  /** Explicit user-selected import; validate everything before replacing either state or storage. */
  public importSave(serialized: string): void {
    const decoded = decodeGameState(JSON.parse(serialized));
    for (const member of decoded.fleet) validateMemberContent(member);
    createFleetMember(decoded.sandboxHullId, 'sandbox-validation');
    const request = decoded.pendingCombat ?? this.sandboxRequest(decoded, decoded.sandboxHullId);
    const state = freezeGameState(decoded.pendingCombat ? decoded : beginCombat(decoded, request));
    const handoff = new CombatHandoff(request);
    handoff.deploy(this.combat);
    this.handoff = handoff;
    this.state = state;
    this.issue = null;
    if (!this.ephemeral) this.store?.replace(state);
    this.emit();
  }

  /** UI must explicitly confirm this destructive replacement. */
  public newGame(hullId: string): void {
    const next = createGameState(crypto.randomUUID(), createFleetMember(hullId, 'flagship'));
    const request = this.sandboxRequest(next, hullId);
    const state = freezeGameState(beginCombat(next, request));
    const handoff = new CombatHandoff(request);
    handoff.deploy(this.combat);
    this.handoff = handoff;
    this.state = state;
    this.issue = null;
    if (!this.ephemeral) this.store?.replace(state);
    this.emit();
  }

  public dispose(): void {
    this.unsubscribeCombat();
    this.listeners.clear();
    this.combat.dispose();
  }
}
