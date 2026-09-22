import { ArmorReadCache } from './ArmorReadView';
import type { CombatEngine } from '../simulation/CombatEngine';
import type { Ship } from '../simulation/Ship';
import type { ShipSpec } from '../content/ShipSpec';
import type { TacticalOrder } from '../simulation/CombatTypes';
import { combatObservers, contactVisible } from '../simulation/systems/CombatVisibility';

export interface MapPoint { readonly x: number; readonly y: number }
export interface MapContact {
  readonly id: string; readonly teamId: number; readonly pos: MapPoint; readonly facingRad: number;
  readonly hullHp: number; readonly maxHullHp: number; readonly retreating: boolean;
  readonly flux: { readonly fluxPercent: number };
  readonly spec: Readonly<Pick<ShipSpec, 'nameKey' | 'designationKey' | 'spriteUrl' | 'spriteWidth' | 'spriteHeight' | 'pivotX' | 'pivotY' | 'hullSize'>>;
}
export interface MapFlagship extends MapContact {
  readonly currentCR: number;
  readonly flux: { readonly fluxPercent: number; readonly hardFlux: number; readonly maxFlux: number; readonly totalFlux: number };
  readonly armor: { readonly cols: number; readonly rows: number; readonly cellWidth: number; readonly cellHeight: number;
    readonly minX: number; readonly minY: number; readonly maxCellArmor: number; readonly cells: readonly number[] };
}
export interface MapOrder {
  readonly id: string; readonly type: TacticalOrder['type']; readonly issuedTime: number;
  readonly targetShipId?: string; readonly targetPos?: MapPoint;
}
export interface TacticalMapView {
  readonly playerShip: MapFlagship;
  /** Already filtered by the authority's observing-team visibility policy. */
  readonly capitalShips: readonly MapContact[];
  readonly fighters: readonly { readonly id: string; readonly teamId: number; readonly pos: MapPoint; readonly facingRad: number }[];
  readonly observers: readonly { readonly pos: MapPoint; readonly sightRadius: number }[];
  readonly orders: Readonly<Record<string, MapOrder>>;
  readonly targetPositions: Readonly<Record<string, MapPoint>>;
  readonly selectedUnitId: string | null; readonly commandPoints: number;
  readonly battleEnded: boolean; readonly openBattlefield: boolean; readonly multiTeamBattle: boolean;
  readonly isSimulation: boolean; readonly deploymentEnabled: boolean; readonly deployedCount: number;
  readonly environment: { readonly backgroundUrl: string };
  readonly nebulae: readonly { readonly pos: MapPoint; readonly spriteUrl: string; readonly thickness: number; readonly atlasColumn: number; readonly atlasRow: number }[];
  readonly asteroids: readonly { readonly pos: MapPoint; readonly radius: number }[];
  readonly hulkFragments: readonly { readonly pos: MapPoint }[];
}
export interface TacticalMapSnapshot { readonly generation: number; readonly available: boolean; readonly map: TacticalMapView | null }
export interface TacticalMapSource { read(): TacticalMapSnapshot }
const point = (value: MapPoint): MapPoint => ({ x: value.x, y: value.y });
function contact(ship: Ship): MapContact {
  const spec = ship.spec;
  return { id: ship.id, teamId: ship.teamId, pos: point(ship.pos), facingRad: ship.facingRad, hullHp: ship.hullHp,
    maxHullHp: ship.maxHullHp, retreating: ship.retreating, flux: { fluxPercent: ship.flux.fluxPercent },
    spec: { nameKey: spec.nameKey, designationKey: spec.designationKey, spriteUrl: spec.spriteUrl, spriteWidth: spec.spriteWidth,
      spriteHeight: spec.spriteHeight, pivotX: spec.pivotX, pivotY: spec.pivotY, hullSize: spec.hullSize } };
}
/** Own every dynamic value, with no simulation prototypes, functions or mutable world aliases.
 * Do not mark these as definition metadata: the bridge must delta dynamic numeric fields. */
function retainData<T>(value: T, previous?: T): T {
  if (Object.is(value, previous) || !value || typeof value !== 'object') return value;
  const array = Array.isArray(value), keys = Object.keys(value);
  const before = previous && typeof previous === 'object' && Array.isArray(previous) === array ? previous : undefined;
  const source = value as Record<string, unknown>, old = before as Record<string, unknown> | undefined;
  const entries = keys.map(key => [key, retainData(source[key], old?.[key])] as const);
  if (before && Object.keys(before).length === keys.length && entries.every(([key, child]) => Object.hasOwn(before, key) && Object.is(child, old![key]))) return before;
  return Object.freeze(array ? entries.map(([, child]) => child) : Object.fromEntries(entries)) as T;
}
export function copyTacticalMapSnapshot(value: TacticalMapSnapshot, previous?: TacticalMapSnapshot): TacticalMapSnapshot {
  return retainData(value, previous);
}

export class TacticalMapViewProjector {
  private readonly armorCache = new ArmorReadCache();
  private engine?: CombatEngine;
  private flagship?: Ship;
  private epoch = -1;
  private generation = 0;
  private previous?: TacticalMapSnapshot;
  capture(engine: CombatEngine, epoch = 0, available = true): TacticalMapSnapshot {
    if (this.engine !== engine || this.flagship !== engine.playerShip || this.epoch !== epoch) {
      this.engine = engine; this.flagship = engine.playerShip; this.epoch = epoch; this.generation++; this.previous = undefined;
    }
    const envelope = { generation: this.generation, available };
    if (!available || !engine.isTacticalMap) return this.previous = copyTacticalMapSnapshot({ ...envelope, map: null }, this.previous);
    const ships = engine.ships, team = engine.playerShip.teamId;
    const observers = combatObservers(ships, team), visibility = new Map<Ship, boolean>();
    const visible = (ship: Ship) => {
      let result = visibility.get(ship);
      if (result === undefined) { result = contactVisible(ship, observers, team, engine.openBattlefield); visibility.set(ship, result); }
      return result;
    };
    const living = engine.capitalShips.filter(visible), byId = new Map(ships.map(ship => [ship.id, ship]));
    const orders = Object.fromEntries([...engine.orders].map(([id, order]) => [id, {
      id: order.id, type: order.type, issuedTime: order.issuedTime, targetShipId: order.targetShipId,
      targetPos: order.targetPos ? point(order.targetPos) : undefined,
    }]));
    const targetPositions: Record<string, MapPoint> = {};
    for (const order of engine.orders.values()) if (order.targetShipId && ['ENGAGE', 'ESCORT', 'AVOID'].includes(order.type)) {
      const target = byId.get(order.targetShipId);
      if (target && visible(target)) Object.defineProperty(targetPositions, target.id, { value: point(target.pos), enumerable: true, configurable: true });
    }
    const ship = engine.playerShip, armor = this.armorCache.read(ship.armor);
    const playerShip: MapFlagship = { ...contact(ship), currentCR: ship.currentCR,
      flux: { fluxPercent: ship.flux.fluxPercent, hardFlux: ship.flux.hardFlux, maxFlux: ship.flux.maxFlux, totalFlux: ship.flux.totalFlux },
      armor: { cols: armor.cols, rows: armor.rows, cellWidth: armor.cellWidth, cellHeight: armor.cellHeight,
        minX: armor.minX, minY: armor.minY, maxCellArmor: armor.maxCellArmor, cells: Array.from(armor.cells) } };
    return this.previous = copyTacticalMapSnapshot({ ...envelope, map: {
      playerShip, capitalShips: living.map(contact), fighters: [...engine.fighters, ...engine.bombers].filter(visible)
        .map(ship => ({ id: ship.id, teamId: ship.teamId, pos: point(ship.pos), facingRad: ship.facingRad })),
      observers: observers.map(ship => ({ pos: point(ship.pos), sightRadius: ship.sightRadius })),
      orders, targetPositions, selectedUnitId: engine.selectedUnitId, commandPoints: engine.commandPoints,
      battleEnded: !!engine.battleResult, openBattlefield: engine.openBattlefield, multiTeamBattle: engine.multiTeamBattle,
      isSimulation: engine.isSimulation, deploymentEnabled: engine.deployment.enabled,
      deployedCount: engine.isSimulation ? engine.simulationDeployedPoints(true) : engine.deployment.enabled ? engine.deployment.used(team) : living.filter(ship => ship.teamId === team).length,
      environment: { backgroundUrl: engine.environment.backgroundUrl },
      nebulae: engine.nebulae.map(cloud => ({ pos: point(cloud.pos), spriteUrl: cloud.spriteUrl, thickness: cloud.thickness, atlasColumn: cloud.atlasColumn, atlasRow: cloud.atlasRow })),
      asteroids: engine.asteroids.map(asteroid => ({ pos: point(asteroid.pos), radius: asteroid.radius })),
      hulkFragments: engine.hulkFragments.map(hulk => ({ pos: point(hulk.pos) })),
    } }, this.previous);
  }
}
/** LAN compatibility boundary. React and the painter receive only the read source. */
export function engineTacticalMapSource(engine: CombatEngine): TacticalMapSource {
  const projector = new TacticalMapViewProjector();
  return { read: () => projector.capture(engine) };
}
