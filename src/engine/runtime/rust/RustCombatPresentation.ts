import type { RustCoreSnapshot } from './RustCoreProtocol';
import type { RustCompiledContent } from './RustContentCompiler';
import type { RustPresentationFacts } from './RustCombatPresentationFacts';
import { copyRustPresentationData as copy, rustHandleKey } from './RustCombatPresentationData';
import { rustPresentationShip, type RustPresentationShipRecords } from './RustCombatPresentationShip';
import { rustPresentationOrdnance } from './RustCombatPresentationOrdnance';
import { rustPresentationTerrain, rustPresentationFloating } from './RustCombatPresentationTerrain';
import { rustHullPortrait, rustDeployment, rustTacticalMap } from './RustCombatPresentationViews';
import { RenderWeaponDictionary } from '../local/RenderWeaponDictionary';
import type { DetachedCombatPresentation } from '../local/CombatPresentationWire';
import type { CombatHudView } from '../CombatHudView';
import type { CombatAudioEvent } from '../../audio/CombatAudioEvents';
import type { CombatRenderView } from '../../render/CombatRenderView';
import { validateRustPresentationFacts } from './RustCombatPresentationValidation';

export interface RustCombatPresentationFrame {
  readonly epoch: number; readonly revision: number; readonly tick: number;
  readonly presentation: DetachedCombatPresentation;
  /** Completed data for same-frame LAN projection; never simulation authority. */
  readonly shipRecords: ReadonlyMap<number, RustPresentationShipRecords>;
  /** Consume only after successful publication. Ordered native events, once. */
  readonly audio: readonly CombatAudioEvent[];
  readonly audioSequence: number;
}
/** A display-only adapter. No simulator, rules callback, input authority or RNG. */
export class RustCombatPresentation {
  private readonly dictionary = new RenderWeaponDictionary();
  private readonly records = new Map<string, RustPresentationShipRecords>();
  private revision = -1;
  private lastAudio = 0;
  private generation = 0;
  private flagship = '';
  private failed = false;
  constructor(public content: RustCompiledContent, readonly epoch: number) {
    if (!Number.isSafeInteger(epoch) || epoch <= 0 || content.version !== 1 || !Object.isFrozen(content)) throw Error('Invalid Rust presentation content/epoch');
  }
  replaceContent(content:RustCompiledContent):void {
    if (content.version !== 1 || !Object.isFrozen(content) || content.contentRevision !== this.content.contentRevision) throw Error('Invalid native dictionary extension');
    const previous = new Map(this.content.entities.map(entity => [rustHandleKey(entity.handle),entity]));
    const oldRoot = this.content.entities.find(entity => entity.stableId === 'enemy_ship');
    for (const entity of content.entities) {
      const key = rustHandleKey(entity.handle), old = previous.get(key);
      if (old && old.stableId !== entity.stableId) {
        const retired = oldRoot && 'rust-retired-sentinel:'+oldRoot.handle.slot+':'+oldRoot.handle.generation;
        if (!retired || old.specKey !== entity.specKey || old.id !== entity.id
          || !(old.stableId === 'enemy_ship' || old.stableId.startsWith('enemy_ship:module:'))
          || entity.stableId !== retired+old.stableId.slice('enemy_ship'.length)) throw Error('Invalid retained sentinel identity');
        this.records.delete(key);
      }
    }
    this.content=content;
  }
  capture(snapshot: RustCoreSnapshot, sourceFacts: RustPresentationFacts): RustCombatPresentationFrame {
    if (this.failed) throw Error('Rust presentation failed; a new epoch is required');
    try { return this.project(snapshot, sourceFacts); } catch (error) { this.failed = true; throw error; }
  }
  /** Recovery suppresses already replayed sounds while retaining native ordering. */
  discardAudioThrough(sequence: number): void {
    if (!Number.isSafeInteger(sequence) || sequence < this.lastAudio) throw Error('Invalid discarded audio prefix');
    this.lastAudio = sequence;
  }
  private project(snapshot: RustCoreSnapshot, sourceFacts: RustPresentationFacts): RustCombatPresentationFrame {
    const facts = copy(sourceFacts);
    validateRustPresentationFacts(facts);
    if (!snapshot.world || facts.version !== 1 || facts.epoch !== this.epoch || facts.tick !== snapshot.tick
      || !Number.isSafeInteger(facts.revision) || facts.revision <= this.revision) throw Error('Rust presentation publication epoch/tick/revision differs');
    if (!Number.isSafeInteger(facts.audio.sequence) || facts.audio.sequence < this.lastAudio || facts.audio.sequence < 0
      || facts.audio.events.length > facts.audio.sequence || facts.audio.sequence - facts.audio.events.length > this.lastAudio) throw Error('Invalid Rust presentation audio sequence');
    const shipSpecs = new Map([...this.content.dictionary.ships, ...this.content.dictionary.templates].map(entry => [entry.key, entry.spec]));
    const weaponSpecs = new Map(this.content.dictionary.weapons.map(entry => [entry.key, entry.spec]));
    const weapon = (key: string) => { const w = weaponSpecs.get(key); if (!w) throw Error('Unknown Rust presentation weapon key: ' + key); return w; };
    const bodyByHandle = new Map(snapshot.bodies.map(body => [rustHandleKey(body.handle), body]));
    if (bodyByHandle.size !== snapshot.bodies.length) throw Error('Duplicate Rust snapshot body handle');
    const byId = new Map<string, RustPresentationShipRecords>(), byNumeric = new Map<number, RustPresentationShipRecords>();
    const next = new Map<string, RustPresentationShipRecords>();
    this.dictionary.begin();
    for (const fact of facts.ships) {
      const key = rustHandleKey(fact.handle), spec = shipSpecs.get(fact.specKey);
      const body = bodyByHandle.get(key) ?? fact.reserveInitial;
      if (!spec || !body || body.id !== fact.id || rustHandleKey(body.handle) !== key || byId.has(fact.stableId) || byNumeric.has(fact.id) || next.has(key))
        throw Error('Rust presentation ship identity/content binding differs: ' + fact.stableId);
      if (!bodyByHandle.has(key) && !facts.deployment.rows.some(row => row.id === fact.stableId && row.status === 'reserve'))
        throw Error('A nonreserve Rust display ship lacks its authority body');
      const old = this.records.get(key);
      if (old && (old.fact.stableId !== fact.stableId || old.fact.specKey !== fact.specKey)) throw Error('Rust generation identity was rebound');
      const record = rustPresentationShip(body, fact, spec, weapon, this.dictionary, old,true);
      next.set(key, record); byId.set(fact.stableId, record); byNumeric.set(fact.id, record);
    }
    for (const body of snapshot.bodies) if (body.ship && !next.has(rustHandleKey(body.handle))) throw Error('A Rust authority ship has no presentation identity');
    const requireShip = (id: string) => { const r = byId.get(id); if (!r) throw Error('Missing Rust semantic roster identity: ' + id); return r; };
    const requireHandle = (handle: { readonly slot: number; readonly generation: number }) => { const r = next.get(rustHandleKey(handle)); if (!r) throw Error('Missing Rust carrier/parent identity'); return r; };
    for (const record of next.values()) {
      record.render.sourceCarrier = record.fact.sourceCarrier ? requireHandle(record.fact.sourceCarrier).render : undefined;
      if (record.fact.parent) requireHandle(record.fact.parent);
    }
    const player = requireShip(facts.playerId), enemy = requireShip(facts.enemyId), manual = requireShip(facts.manualWeaponId);
    const target = facts.targetId === null ? null : requireShip(facts.targetId);
    const ships = facts.rosters.ships.map(requireShip);
    for (const id of new Set([facts.playerId, facts.manualWeaponId, ...(facts.targetId === null ? [] : [facts.targetId])])) {
      const record = requireShip(id), visible = new Map(ships.filter(r => r.render.isVisibleTo(player.render.teamId)).map(r => [r.render.id, r]));
      Object.assign(record.hud, { hullPortrait: rustHullPortrait(record, visible) });
    }
    const terrain = rustPresentationTerrain(snapshot.world, (id, generation) => { const r = byNumeric.get(id);
      if (!r || r.fact.handle.generation !== generation) throw Error('Unknown Rust hulk source identity'); return r.render; }, facts.asteroidSprites);
    const ordnance = rustPresentationOrdnance(snapshot, facts, weapon, (id, generation) => { const r = byNumeric.get(id);
      if (!r || generation !== undefined && r.fact.handle.generation !== generation) throw Error('Unknown Rust ordnance source identity'); return r.render.id; }, handle => requireHandle(handle).render.id);
    const empArcs = facts.visuals.empArcs.map(arc => ({ ...arc, native: arc.native ? { ...arc.native, anchor: requireHandle(arc.native.anchor).render } : undefined }));
    const view: CombatRenderView & { readonly kind: 'detached-combat-render-view' } = { kind: 'detached-combat-render-view',
      ships: ships.map(r => r.render), allCapitalShips: facts.rosters.allCapitalShips.map(id => requireShip(id).render), playerShip: player.render, enemyShip: enemy.render,
      playerWings: facts.playerWings.map(wing => ({ specId: wing.specId })), enemyWings: facts.enemyWings.map(wing => ({ specId: wing.specId })),
      combatTime: snapshot.combatTime, cameraShakeIntensity: facts.cameraShakeIntensity, environment: facts.environment, ...terrain, ...ordnance,
      ...facts.visuals, empArcs, trailStrips: facts.visuals.trailStrips.values() };
    if (this.flagship !== player.render.id) { this.flagship = player.render.id; this.generation++; }
    const deployment = rustDeployment(facts, byId, player, this.generation);
    const detailed = new Set([player, manual, ...(target ? [target] : [])]);
    const contact = (record: RustPresentationShipRecords) => detailed.has(record) ? record.hud : record.contact;
    const loops = new Set<string>();
    for (const r of ships) if (!r.hud.isDead && !r.hud.isPhased && !r.hud.flux.isVenting && !r.hud.flux.isOverloaded)
      for (const w of r.hud.weapons) if (w.spec.soundLoopKey && !w.isDisabled && (w.firingState === 'ACTIVE' || w.firingState === 'CHARGING')) loops.add(w.spec.soundLoopKey);
    const read: CombatHudView = { playerShip: player.hud, weaponShip: manual.hud, targetShip: target?.hud ?? null,
      ships: ships.map(contact), capitalShips: facts.rosters.capitalShips.map(id => contact(requireShip(id))),
      fighters: facts.rosters.fighters.map(id => contact(requireShip(id))), bombers: facts.rosters.bombers.map(id => contact(requireShip(id))),
      playerWings: facts.playerWings.map(({ carrierId, wingId, name, maxCrafts, crr }) => ({ carrierId, wingId, name, maxCrafts, crr })),
      enemyWings: facts.enemyWings.map(({ carrierId, wingId, name, maxCrafts, crr }) => ({ carrierId, wingId, name, maxCrafts, crr })),
      reserveIds: facts.rosters.allCapitalShips.filter(id => facts.deployment.rows.some(row => row.id === id && row.status === 'reserve')),
      weaponAudioLoops: [...loops], isTacticalMap: facts.tactical.isTacticalMap, isSimulation: deployment.simulation, deploymentEnabled: deployment.fleetEnabled,
      openBattlefield: facts.openBattlefield, multiTeamBattle: facts.multiTeamBattle, battleResult: facts.battleResult, isBattleResultReady: facts.isBattleResultReady,
      combatTime: snapshot.combatTime, shipLossNotifications: facts.shipLossNotifications, notificationTime: facts.notificationTime };
    const presentation: DetachedCombatPresentation = { view, hud: { read, deployment,
      map: rustTacticalMap(facts, byId, player, view, deployment, this.generation), tactical: facts.tactical,
      battleResult: facts.battleResult, isBattleResultReady: facts.isBattleResultReady, floatingTexts: [...rustPresentationFloating(snapshot.world), ...facts.sceneTexts], radio: [...facts.radio],
      shipLossNotifications: facts.shipLossNotifications, notificationTime: facts.notificationTime } };
    const audio = facts.audio.events.slice(this.lastAudio - (facts.audio.sequence - facts.audio.events.length));
    this.revision = facts.revision; this.lastAudio = facts.audio.sequence; this.records.clear(); for (const [key, record] of next) this.records.set(key, record);
    this.dictionary.finish();
    return { epoch: this.epoch, revision: facts.revision, tick: snapshot.tick, presentation, shipRecords: byNumeric, audio, audioSequence: facts.audio.sequence };
  }
}
