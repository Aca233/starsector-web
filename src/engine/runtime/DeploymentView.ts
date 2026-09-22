import type { CombatEngine } from '../simulation/CombatEngine';
import type { ShipSpec } from '../content/ShipSpec';
import type { DeploymentRow } from '../simulation/CombatDeployment';
import { immutableCopy, isImmutableMetadata } from '../extensions/Immutable';

/** Data only: never give deployment UI an authority Ship or callable simulation service. */
export interface DeploymentMemberView extends Readonly<DeploymentRow> {
  readonly spec: ShipSpec;
  readonly hullHp: number;
  readonly maxHullHp: number;
  readonly currentCR: number;
}
export interface DeploymentView {
  readonly generation: number;
  readonly playerShipId: string;
  readonly playerTeam: number;
  readonly available: boolean;
  readonly battleEnded: boolean;
  readonly fleetEnabled: boolean;
  readonly fleetLimit: number;
  readonly fleetUsage: Readonly<Record<string, number>>;
  readonly members: readonly DeploymentMemberView[];
  readonly simulation: boolean;
  readonly simulationLimit: number;
  readonly allyUsed: number;
  readonly enemyUsed: number;
}
export interface DeploymentViewSource { read(): DeploymentView }

/** Mutable encounter fits need change detection, not a new metadata ID on every tick.
 * Snapshot every plain child; skip known immutable branches, preserve Object.is semantics. */
class DefinitionSnapshots {
  private readonly cache = new WeakMap<object, { keys: string[]; children: unknown[]; length?: number; value: object }>();
  copy<T>(input: T, active = new Set<object>()): T {
    if (!input || typeof input !== 'object' || isImmutableMetadata(input)) return input;
    if (active.has(input)) throw new Error('Cyclic deployment definition');
    const array = Array.isArray(input), prototype = Object.getPrototypeOf(input);
    if (!array && prototype !== Object.prototype && prototype !== null) throw new Error('Invalid deployment definition prototype');
    active.add(input);
    const keys = Object.keys(input), record = input as Record<string, unknown>;
    const children = keys.map(key => this.copy(record[key], active));
    active.delete(input);
    const previous = this.cache.get(input), length = array ? input.length : undefined;
    if (previous && previous.length === length && previous.keys.length === keys.length
      && keys.every((key, i) => previous.keys[i] === key && Object.is(previous.children[i], children[i]))) return previous.value as T;
    const staged = array ? Object.assign(new Array(length), Object.fromEntries(keys.map((key, i) => [key, children[i]])))
      : Object.fromEntries(keys.map((key, i) => [key, children[i]]));
    const value = immutableCopy(staged);
    this.cache.set(input, { keys, children, length, value });
    return value as T;
  }
}

/** Retain only current rows; immutable definitions share the bridge metadata dictionary.
 * Unregistered mutable specs are sampled each capture, never frozen in their owner's world. */
export class DeploymentViewProjector {
  private readonly definitions = new DefinitionSnapshots();
  private engine?: CombatEngine;
  private flagship?: CombatEngine['playerShip'];
  private epoch = -1;
  private generation = 0;
  private previous?: DeploymentView;
  capture(engine: CombatEngine, epoch = 0, available = true): DeploymentView {
    if (this.engine !== engine || this.flagship !== engine.playerShip || this.epoch !== epoch) {
      this.engine = engine; this.flagship = engine.playerShip; this.epoch = epoch;
      this.generation++; this.previous = undefined;
    }
    const snapshot = engine.deployment.snapshot();
    const ships = new Map(snapshot.rows.length ? engine.allCapitalShips.map(ship => [ship.id, ship]) : []);
    const prior = new Map(this.previous?.members.map(member => [member.id, member]));
    const copies = new Map<ShipSpec, ShipSpec>();
    const members: DeploymentMemberView[] = [];
    for (const row of snapshot.rows) {
      const ship = ships.get(row.id);
      if (!ship) continue; // A missing network instance must never be replaced by a catalog preset.
      let spec = ship.spec;
      if (!isImmutableMetadata(spec)) {
        let copied = copies.get(spec);
        if (!copied) { copied = this.definitions.copy(spec); copies.set(spec, copied); }
        spec = copied;
      }
      const old = prior.get(row.id);
      members.push(old && old.spec === spec && old.teamId === row.teamId && old.cost === row.cost && old.status === row.status
        && Object.is(old.hullHp, ship.hullHp) && Object.is(old.maxHullHp, ship.maxHullHp) && Object.is(old.currentCR, ship.currentCR)
        ? old : Object.freeze({ ...row, spec, hullHp: ship.hullHp, maxHullHp: ship.maxHullHp, currentCR: ship.currentCR }));
    }
    // Totals include missing display instances too: do not grant apparent free DP.
    const usage: Record<string, number> = {};
    for (const row of snapshot.rows) if (row.status === 'deployed' || row.status === 'retreating') usage[row.teamId] = (usage[row.teamId] ?? 0) + row.cost;
    const sameRows = this.previous?.members.length === members.length && members.every((row, i) => row === this.previous!.members[i]);
    const next: DeploymentView = {
      generation: this.generation, playerShipId: engine.playerShip.id, playerTeam: engine.playerShip.teamId,
      available, battleEnded: !!engine.battleResult, fleetEnabled: engine.deployment.enabled, fleetLimit: snapshot.limit,
      fleetUsage: freezeUsage(usage, this.previous?.fleetUsage),
      members: sameRows ? this.previous!.members : Object.freeze(members),
      simulation: engine.isSimulation, simulationLimit: engine.simulationPointLimit,
      allyUsed: engine.isSimulation ? engine.simulationDeployedPoints(true) : 0, enemyUsed: engine.isSimulation ? engine.simulationDeployedPoints(false) : 0,
    };
    if (this.previous && (Object.keys(next) as (keyof DeploymentView)[]).every(key => Object.is(next[key], this.previous![key]))) return this.previous;
    return this.previous = Object.freeze(next);
  }
}

/** Compatibility boundary for network display engines, not a UI-owned engine fallback. */
export function engineDeploymentView(engine: CombatEngine): DeploymentViewSource {
  const projector = new DeploymentViewProjector();
  return { read: () => projector.capture(engine) };
}
export function deploymentViewUsed(view: DeploymentView, team: number): number {
  return view.fleetUsage[team] ?? 0;
}
/** Advisory only. The authority repeats its own live validation on submission. */
export function deploymentViewReason(view: DeploymentView, ids: readonly string[], team: number): string | undefined {
  if (!view.available || !view.fleetEnabled || view.battleEnded) return '本场战斗不能继续部署。';
  if (!ids.length || new Set(ids).size !== ids.length) return '请选择不重复的待命舰船。';
  const members = new Map(view.members.map(row => [row.id, row]));
  let cost = 0;
  for (const id of ids) {
    const row = members.get(id);
    if (!row || row.teamId !== team) return '只能部署本队战前编成中的舰船。';
    if (row.status !== 'reserve') return '所选舰船已部署、撤退或损失，请更新选择。';
    cost += row.cost;
  }
  if (deploymentViewUsed(view, team) + cost > view.fleetLimit) return '超出本队可用部署点。';
}

/** Decoded graph nodes are updated in place. Publish stable frozen UI snapshots instead. */
export function copyDeploymentView(view: DeploymentView, previous?: DeploymentView): DeploymentView {
  const prior = new Map(previous?.members.map(row => [row.id, row]));
  const members = view.members.map(row => {
    const old = prior.get(row.id);
    if (old && (Object.keys(row) as (keyof DeploymentMemberView)[]).every(key => Object.is(row[key], old[key]))) return old;
    return Object.freeze({ ...row, spec: isImmutableMetadata(row.spec) ? row.spec : immutableCopy(row.spec) });
  });
  const next = { ...view, fleetUsage: freezeUsage(view.fleetUsage, previous?.fleetUsage), members: previous?.members.length === members.length && members.every((row, i) => row === previous.members[i])
    ? previous.members : Object.freeze(members) };
  return previous && (Object.keys(next) as (keyof DeploymentView)[]).every(key => Object.is(next[key], previous[key])) ? previous : Object.freeze(next);
}

function freezeUsage(usage: Readonly<Record<string, number>>, previous?: Readonly<Record<string, number>>) {
  const keys = Object.keys(usage);
  return previous && Object.keys(previous).length === keys.length && keys.every(key => Object.is(usage[key], previous[key])) ? previous : Object.freeze({ ...usage });
}
