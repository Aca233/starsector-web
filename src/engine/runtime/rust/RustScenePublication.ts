/** Completed native scene data. Decoding never invokes a rule or a constructor. */
import { Vector2 } from '../../math/Vector2';
import type { RustBodyHandle } from './RustCoreProtocol';
import { decodeRustVisualFrame, type RustVisualFrame } from './RustVisualProtocol';
import type { FleetCombatStats, BattleResult } from '../../simulation/CombatStatistics';
import type { FloatingText, RadioMessage, TacticalOrder } from '../../simulation/CombatTypes';
import type { CombatAudioEvent } from '../../contracts/LocalCombatWire';
import { decodeRustSceneSystemPublication, type RustSceneSystemPublication } from './RustSceneSystemPublication';
import type { CommandResult } from '../CombatCommands';
export interface RustSceneShipRead {
  readonly id: number; readonly handle: RustBodyHandle; readonly stableId: string; readonly specKey: string; readonly team: number;
  readonly parent?: RustBodyHandle; readonly sourceCarrier?: RustBodyHandle;
  readonly previousPosition: readonly [number, number]; readonly previousFacing: number; readonly playerTarget?: RustBodyHandle;
  readonly visibilityMask: number; readonly visibilityOverflow: string; readonly isPhased: boolean; readonly shipName: string;
  readonly flightDeckWingId?: string; readonly isSystemDrone: boolean; readonly sightRadius: number;
  readonly isFiringMain: boolean; readonly fighterRecall: boolean; readonly combatWeaponRepairTimeMultiplier: number;
  readonly flameoutRatio: number; readonly significantEnemiesInRange: boolean; readonly phaseVisualAlpha: number;
  readonly camera: readonly [number, number]; readonly primarySystemId: number; readonly tacticalSystemIds: readonly number[]; readonly defenseSystemId: number;
}
export interface RustScenePublication {
  readonly tick: number; readonly time: number; readonly player: RustBodyHandle; readonly enemy: RustBodyHandle; readonly manualWeapon: RustBodyHandle; readonly target?: RustBodyHandle;
  readonly enabled: boolean; readonly limit: number; readonly simulation: boolean; readonly simulationLimit: number; readonly primaryEnemyDeployed: boolean;
  readonly multiTeam: boolean; readonly open: boolean; readonly commandPoints: number; readonly recovery: number; readonly map: boolean; readonly autopilot: boolean;
  readonly notificationTime: number; readonly resultReady: boolean; readonly selection: null | 'fleet' | RustBodyHandle; readonly winningTeam?: number;
  readonly rosters: { readonly ships: readonly RustBodyHandle[]; readonly capitalShips: readonly RustBodyHandle[]; readonly allCapitalShips: readonly RustBodyHandle[]; readonly fighters: readonly RustBodyHandle[]; readonly bombers: readonly RustBodyHandle[] };
  readonly ships: readonly RustSceneShipRead[];
  readonly mounts: readonly { readonly id: number; readonly componentId: number; readonly slotId: string; readonly range: number }[];
  readonly deployment: readonly { readonly handle: RustBodyHandle; readonly teamId: number; readonly cost: number; readonly status: 'reserve' | 'deployed' | 'retreating' | 'retreated' | 'destroyed' }[];
  readonly wings: readonly { readonly side: number; readonly carrier: RustBodyHandle; readonly wingId: string; readonly specId: string; readonly name: string; readonly maxCrafts: number; readonly crr: number }[];
  readonly orders: readonly { readonly unit: 'fleet' | RustBodyHandle; readonly order: Omit<TacticalOrder, 'targetShipId'>; readonly target?: RustBodyHandle }[];
  readonly result: BattleResult | null; readonly texts: readonly FloatingText[]; readonly radio: readonly RadioMessage[];
  readonly audio: { readonly sequence: number; readonly entries: readonly { readonly sequence: number; readonly event: CombatAudioEvent }[] };
  readonly visual: RustVisualFrame;
  readonly dynamic: RustSceneSystemPublication;
  readonly commandResults: readonly CommandResult[];
  readonly ordnance: Float64Array;
  readonly pendingCR: readonly { readonly handle: RustBodyHandle; readonly value: number }[];
  readonly simulationUsed: readonly [number,number];
  readonly network?:Float64Array;
}
class Reader {
  private at = 0;
  constructor(readonly values: Float64Array) {}
  number(): number { if (this.at >= this.values.length) throw Error('Truncated Rust scene fact'); const value = this.values[this.at++]; if (!Number.isFinite(value)) throw Error('Nonfinite Rust scene fact'); return value; }
  integer(max = Number.MAX_SAFE_INTEGER): number { const value = this.number(); if (!Number.isSafeInteger(value) || value < 0 || value > max) throw Error('Invalid Rust scene fact integer'); return value; }
  flag(): boolean { return this.integer(1) === 1; }
  handle(): RustBodyHandle { const slot = this.integer(0xffffffff), generation = this.integer(0xffffffff); if (!generation) throw Error('Invalid Rust scene handle'); return { slot, generation }; }
  optional(): RustBodyHandle | undefined { return this.flag() ? this.handle() : undefined; }
  point(): [number, number] { return [this.number(), this.number()]; }
  count(): number { const n = this.integer(); if (n > this.values.length - this.at) throw Error('Rust scene count exceeds data'); return n; }
  string(): string { const n = this.count(); let result = ''; for (let i = 0; i < n; i++) result += String.fromCharCode(this.integer(65535)); return result; }
  handles(): RustBodyHandle[] { return Array.from({ length: this.count() }, () => this.handle()); }
  record(): Float64Array { const n = this.count(), data = this.values.subarray(this.at, this.at + n); this.at += n; return data; }
  finish(): void { if (this.at !== this.values.length) throw Error('Trailing Rust scene facts'); }
}
const statNames = ['totalDamageDealt', 'kineticDamage', 'heDamage', 'energyDamage', 'fragDamage', 'shieldDamageAbsorbed', 'armorDamageSoaked', 'hullDamageDealt', 'hullDamageTaken', 'shotsFired', 'shotsHit', 'empDamageDealt', 'missilesIntercepted', 'fightersDestroyed', 'fightersLost', 'fightersRebuilt', 'overloadsInflicted', 'overloadsSuffered'] as const satisfies readonly (keyof FleetCombatStats)[];
const stats = (r: Reader): FleetCombatStats => Object.fromEntries(statNames.map(key => [key, r.number()])) as unknown as FleetCombatStats;
export function decodeRustScenePublication(data: Float64Array, detached=false): RustScenePublication {
  const block = new Reader(detached?data:data.slice()); if (block.integer() !== 1) throw Error('Rust scene fact version differs'); const count = block.count();
  let header: Omit<RustScenePublication, 'rosters' | 'ships' | 'mounts' | 'deployment' | 'wings' | 'orders' | 'result' | 'texts' | 'radio' | 'audio' | 'visual' | 'dynamic' | 'commandResults' | 'ordnance' | 'pendingCR' | 'simulationUsed' | 'network'> | undefined;
  let ordnance: Float64Array | undefined;
  let pendingCR: RustScenePublication['pendingCR'] | undefined;
  let simulationUsed: RustScenePublication['simulationUsed'] | undefined;
  let network:Float64Array | undefined;
  let dynamic: RustSceneSystemPublication | undefined, commandResults: CommandResult[] | undefined;
  let rosters: RustScenePublication['rosters'] | undefined, visual: RustVisualFrame | undefined, audio: RustScenePublication['audio'] | undefined, result: BattleResult | null = null;
  const ships: RustSceneShipRead[] = [], mounts: RustScenePublication['mounts'][number][] = [], deployment: RustScenePublication['deployment'][number][] = [], wings: RustScenePublication['wings'][number][] = [], orders: RustScenePublication['orders'][number][] = [], texts: FloatingText[] = [], radio: RadioMessage[] = [];
  for (let i = 0; i < count; i++) {
    const tag = block.integer(), values = block.record(), r = new Reader(values);
    switch (tag) {
      case 1: {
        if (header) throw Error('Duplicate Rust scene header'); const tick = r.integer(), time = r.number(), player = r.handle(), enemy = r.handle(), manualWeapon = r.handle(), target = r.optional();
        const enabled = r.flag(), limit = r.number(), simulation = r.flag(), simulationLimit = r.number(), primaryEnemyDeployed = r.flag(), multiTeam = r.flag(), open = r.flag(), commandPoints = r.number(), recovery = r.number(), map = r.flag(), autopilot = r.flag(), notificationTime = r.number(), resultReady = r.flag();
        const selected = r.integer(2), selection = selected === 0 ? null : selected === 1 ? 'fleet' as const : r.handle(), winningTeam = r.flag() ? r.integer(0xffffffff) : undefined;
        header = { tick, time, player, enemy, manualWeapon, target, enabled, limit, simulation, simulationLimit, primaryEnemyDeployed, multiTeam, open, commandPoints, recovery, map, autopilot, notificationTime, resultReady, selection, winningTeam }; break;
      }
      case 2: if (rosters) throw Error('Duplicate Rust scene roster'); else rosters = { ships: r.handles(), capitalShips: r.handles(), allCapitalShips: r.handles(), fighters: r.handles(), bombers: r.handles() }; break;
      case 3: {
        const id = r.integer(0xffffffff), handle = r.handle(), stableId = r.string(), specKey = r.string(), team = r.integer(0xffffffff), parent = r.optional(), sourceCarrier = r.optional(), previousPosition = r.point(), previousFacing = r.number(), playerTarget = r.optional();
        const visibilityMask = r.integer(0x7fffffff), visibilityOverflow = r.flag() ? '*' : '||', isPhased = r.flag(), shipName = r.string(), flightDeckWingId = r.flag() ? r.string() : undefined;
        const isSystemDrone = r.flag(), sightRadius = r.number(), isFiringMain = r.flag(), fighterRecall = r.flag(), combatWeaponRepairTimeMultiplier = r.number(), flameoutRatio = r.number(), significantEnemiesInRange = r.flag(), phaseVisualAlpha = r.number(), camera = r.point(), primarySystemId = r.integer(0xffffffff), tacticalSystemIds = Array.from({ length: r.count() }, () => r.integer(0xffffffff)), defenseSystemId = r.integer(0xffffffff);
        if (!id || !stableId || ships.some(s => s.id === id || s.stableId === stableId)) throw Error('Duplicate/invalid Rust scene ship');
        ships.push({ id, handle, stableId, specKey, team, parent, sourceCarrier, previousPosition, previousFacing, playerTarget, visibilityMask, visibilityOverflow, isPhased, shipName, flightDeckWingId, isSystemDrone, sightRadius, isFiringMain, fighterRecall, combatWeaponRepairTimeMultiplier, flameoutRatio, significantEnemiesInRange, phaseVisualAlpha, camera, primarySystemId, tacticalSystemIds, defenseSystemId }); break;
      }
      case 4: mounts.push({ id: r.integer(0xffffffff), componentId: r.integer(0xffffffff), slotId: r.string(), range: r.number() }); break;
      case 5: { const handle = r.handle(), teamId = r.integer(0xffffffff), cost = r.number(), status = (['reserve', 'deployed', 'retreating', 'retreated', 'destroyed'] as const)[r.integer(4)]; deployment.push({ handle, teamId, cost, status }); break; }
      case 6: wings.push({ side: r.integer(1), carrier: r.handle(), wingId: r.string(), specId: r.string(), name: r.string(), maxCrafts: r.integer(), crr: r.number() }); break;
      case 7: { const unit = r.flag() ? r.handle() : 'fleet' as const, id = r.string(), type = (['ASSAULT', 'ENGAGE', 'AVOID', 'DEFEND', 'ESCORT', 'WAYPOINT'] as const)[r.integer(5)], issuedTime = r.number(), target = r.optional(), targetPos = r.flag() ? new Vector2(...r.point()) : undefined; orders.push({ unit, order: { id, type, issuedTime, targetPos }, target }); break; }
      case 8: if (result) throw Error('Duplicate Rust battle result'); else { const isVictory = r.flag(), combatDuration = r.number(), playerShipSpecId = r.string(), enemyShipSpecId = r.string(), playerHullDamageRatio = r.number(), enemyHullDamageRatio = r.number(); result = { isVictory, combatDuration, playerShipSpecId, enemyShipSpecId, playerHullDamageRatio, enemyHullDamageRatio, playerStats: stats(r), enemyStats: stats(r) }; } break;
      case 9: { const id = r.number(), pos = new Vector2(...r.point()), text = r.string(), color: [number, number, number] = [r.integer(255), r.integer(255), r.integer(255)], size = r.number(), life = r.number(), maxLife = r.number(); texts.push({ id, pos, vel: new Vector2(0, -25), text, color, size, life, maxLife }); break; }
      case 10: { const id = r.number(), sender = r.string(), senderFaction = r.string(), text = r.string(), color: [number, number, number] = [r.integer(255), r.integer(255), r.integer(255)], time = r.number(); if (senderFaction !== 'PLAYER' && senderFaction !== 'ENEMY' && senderFaction !== 'HQ') throw Error('Invalid Rust radio faction'); radio.push({ id, sender, senderFaction, text, color, time }); break; }
      case 11: if (audio) throw Error('Duplicate Rust scene audio'); else { const sequence = r.integer(), entries = Array.from({ length: r.count() }, () => { const sequence = r.integer(), key = r.string(), volume = r.number(); return { sequence, event: { kind: 'play' as const, key, volume, rate: 1 } }; }); audio = { sequence, entries }; } break;
      case 12: if (visual) throw Error('Duplicate Rust native visuals'); else visual = decodeRustVisualFrame(values); continue;
      case 13: if (dynamic) throw Error('Duplicate Rust scene dynamic facts'); else dynamic = decodeRustSceneSystemPublication(values,true); continue;
      case 14: if (commandResults) throw Error('Duplicate Rust command receipts'); else commandResults = Array.from({ length: r.count() }, () => { const accepted = r.flag(), reason = r.flag() ? r.string() : undefined; return reason === undefined ? { accepted } : { accepted, reason }; }); break;
      case 15: if (ordnance) throw Error('Duplicate Rust ordnance facts'); else ordnance = values; continue;
      case 16: if (pendingCR) throw Error('Duplicate Rust settlement facts'); else {
        pendingCR = Array.from({ length:r.count() }, () => ({ handle:r.handle(), value:r.number() }));
        if (pendingCR.some(entry => entry.value < 0) || new Set(pendingCR.map(entry => entry.handle.slot + ':' + entry.handle.generation)).size !== pendingCR.length) throw Error('Invalid Rust settlement facts');
      } break;
      case 17: if (simulationUsed) throw Error('Duplicate Rust simulator usage'); else {
        simulationUsed=r.point(); if (simulationUsed.some(value => value < 0)) throw Error('Invalid Rust simulator usage');
      } break;
      case 18: if (network) throw Error('Duplicate Rust network facts'); else network=values; continue;
      default: throw Error('Unknown Rust scene fact tag ' + tag);
    }
    r.finish();
  }
  block.finish(); if (!header || !rosters || !visual || !audio || !dynamic || !commandResults || !ordnance || !pendingCR || !simulationUsed) throw Error('Incomplete Rust scene publication');
  const byHandle = new Set(ships.map(s => s.handle.slot + ':' + s.handle.generation));
  for (const list of Object.values(rosters)) { const ids = list.map(h => h.slot + ':' + h.generation); if (new Set(ids).size !== ids.length || ids.some(id => !byHandle.has(id))) throw Error('Invalid Rust scene membership'); }
  if (pendingCR.length !== ships.length || pendingCR.some(entry => !byHandle.has(entry.handle.slot + ':' + entry.handle.generation))) throw Error('Incomplete Rust settlement membership');
  return { ...header, rosters, ships, mounts, deployment, wings, orders, result, texts, radio, audio, visual, dynamic, commandResults, ordnance, pendingCR, simulationUsed, network };
}
