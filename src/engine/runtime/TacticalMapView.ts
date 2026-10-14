import type { CombatDisplayReads, CombatDisplayShip } from './CombatDisplayReads';
import { HullPortraitProjector, HullSpritesProjector, captureHullSprites, type HullSpritePart, type HullPortraitPart } from './HullPortraitView';
import { ArmorReadCache } from './ArmorReadView';
import type { CombatEngine } from '../simulation/CombatEngine';
import type { ShipSpec } from '../content/ShipSpec';
import type { TacticalOrder } from '../simulation/CombatTypes';
import { combatObservers, contactVisible } from '../simulation/systems/CombatVisibility';
import { knownProjectionKeys } from './local/RenderShipProjection';

/** World reads needed for map projection, distinct from the published TacticalMapSource.
 * Legacy Ship records are retained, but no engine or deployment authority is required. */
export type TacticalMapViewSource = Readonly<Pick<CombatDisplayReads,
  'playerShip' | 'ships' | 'capitalShips' | 'fighters' | 'bombers' | 'orders'
  | 'isTacticalMap' | 'selectedUnitId' | 'commandPoints' | 'battleResult'
  | 'openBattlefield' | 'multiTeamBattle' | 'isSimulation' | 'simulationDeployedPoints'
  | 'environment' | 'nebulae' | 'asteroids' | 'hulkFragments'
>> & {
  readonly deployment: Readonly<Pick<CombatEngine['deployment'], 'enabled' | 'used'>>;
};

export interface MapPoint { readonly x: number; readonly y: number }
export interface MapContact {
  readonly hullSprites: readonly HullSpritePart[];
  readonly id: string; readonly teamId: number; readonly pos: MapPoint; readonly facingRad: number;
  readonly hullHp: number; readonly maxHullHp: number; readonly retreating: boolean;
  readonly flux: { readonly fluxPercent: number };
  readonly spec: Readonly<Pick<ShipSpec, 'nameKey' | 'designationKey' | 'spriteUrl' | 'spriteWidth' | 'spriteHeight' | 'pivotX' | 'pivotY' | 'hullSize'>>;
}
export interface MapFlagship extends MapContact {
  readonly hullPortrait: readonly HullPortraitPart[];
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

const mapSnapshotKeys = ['generation', 'available', 'map'];
const mapViewKeys = [
  'playerShip', 'capitalShips', 'fighters', 'observers', 'orders', 'targetPositions',
  'selectedUnitId', 'commandPoints', 'battleEnded', 'openBattlefield', 'multiTeamBattle',
  'isSimulation', 'deploymentEnabled', 'deployedCount', 'environment', 'nebulae', 'asteroids', 'hulkFragments',
];
const mapPointKeys = ['x', 'y'];
const mapFluxKeys = ['fluxPercent'];
const mapFlagshipFluxKeys = ['fluxPercent', 'hardFlux', 'maxFlux', 'totalFlux'];
const mapSpecKeys = ['nameKey', 'designationKey', 'spriteUrl', 'spriteWidth', 'spriteHeight', 'pivotX', 'pivotY', 'hullSize'];
const mapContactKeys = ['hullSprites', 'id', 'teamId', 'pos', 'facingRad', 'hullHp', 'maxHullHp', 'retreating', 'flux', 'spec'];
const mapFlagshipKeys = ['hullSprites', 'id', 'teamId', 'pos', 'facingRad', 'hullHp', 'maxHullHp', 'retreating', 'flux', 'spec', 'currentCR', 'hullPortrait', 'armor'];
const mapArmorKeys = ['cols', 'rows', 'cellWidth', 'cellHeight', 'minX', 'minY', 'maxCellArmor', 'cells'];
const mapFighterKeys = ['id', 'teamId', 'pos', 'facingRad'];
const mapObserverKeys = ['pos', 'sightRadius'];
const mapEnvironmentKeys = ['backgroundUrl'];
const mapNebulaKeys = ['pos', 'spriteUrl', 'thickness', 'atlasColumn', 'atlasRow'];
const mapAsteroidKeys = ['pos', 'radius'];
const mapHulkKeys = ['pos'];

const point = (value: MapPoint): MapPoint => ({ x: value.x, y: value.y });
const readonlyPoint = (target: { x: number; y: number } | undefined, source: MapPoint): { x: number; y: number } => {
  if (!target) {
    const p = { x: source.x, y: source.y };
    knownProjectionKeys.set(p, mapPointKeys);
    return p;
  }
  target.x = source.x;
  target.y = source.y;
  return target;
};
function contact(ship: CombatDisplayShip, byId: ReadonlyMap<string, CombatDisplayShip>): MapContact {
  const spec = ship.spec;
  return { hullSprites: captureHullSprites(ship, byId), id: ship.id, teamId: ship.teamId, pos: point(ship.pos), facingRad: ship.facingRad, hullHp: ship.hullHp,
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
  private readonly portrait = new HullPortraitProjector();
  private readonly hullSprites = new HullSpritesProjector();
  private readonly armorCache = new ArmorReadCache();
  private readonly byId = new Map<string, CombatDisplayShip>();
  private readonly visibleById = new Map<string, CombatDisplayShip>();
  private readonly visibility = new Map<CombatDisplayShip, boolean>();
  private readonly readonlySnapshot: { generation: number; available: boolean; map: TacticalMapView | null } = { generation: 0, available: true, map: null };
  private readonly readonlyMap: Record<string, unknown> = {};
  private readonly readonlyFlagship: Record<string, unknown> = {};
  private readonly readonlyFlagshipFlux = { fluxPercent: 0, hardFlux: 0, maxFlux: 0, totalFlux: 0 };
  private readonly readonlyFlagshipArmor = { cols: 0, rows: 0, cellWidth: 0, cellHeight: 0, minX: 0, minY: 0, maxCellArmor: 0, cells: [] as number[] };
  private flagshipArmorSource?: CombatDisplayShip['armor'];
  private flagshipArmorRevision: number | null = -1;
  private flagshipArmorDirtyVersion = -1;
  private readonly readonlyContacts = new WeakMap<CombatDisplayShip, Record<string, unknown>>();
  private readonly readonlyFighters = new WeakMap<CombatDisplayShip, Record<string, unknown>>();
  private readonly readonlyObservers = new WeakMap<CombatDisplayShip, Record<string, unknown>>();
  private readonly readonlyNebulae = new WeakMap<object, Record<string, unknown>>();
  private readonly readonlyAsteroids = new WeakMap<object, Record<string, unknown>>();
  private readonly readonlyHulks = new WeakMap<object, Record<string, unknown>>();
  private readonly readonlyCapitalShipsArray: MapContact[] = [];
  private readonly readonlyFightersArray: unknown[] = [];
  private readonly readonlyObserversArray: unknown[] = [];
  private readonly readonlyNebulaeArray: unknown[] = [];
  private readonly readonlyAsteroidsArray: unknown[] = [];
  private readonly readonlyHulksArray: unknown[] = [];
  private readonly readonlyOrders: Record<string, Record<string, unknown>> = {};
  private readonly readonlyTargetPositions: Record<string, { x: number; y: number }> = {};
  private readonly readonlyEnvironment = { backgroundUrl: '' };
  private engine?: TacticalMapViewSource;
  private flagship?: CombatDisplayShip;
  private epoch = -1;
  private generation = 0;
  private previous?: TacticalMapSnapshot;
  constructor() {
    knownProjectionKeys.set(this.readonlySnapshot, mapSnapshotKeys);
    knownProjectionKeys.set(this.readonlyMap, mapViewKeys);
    knownProjectionKeys.set(this.readonlyFlagship, mapFlagshipKeys);
    knownProjectionKeys.set(this.readonlyFlagshipFlux, mapFlagshipFluxKeys);
    knownProjectionKeys.set(this.readonlyFlagshipArmor, mapArmorKeys);
    knownProjectionKeys.set(this.readonlyEnvironment, mapEnvironmentKeys);
  }
  private updateContactReadonly(target: Record<string, unknown>, ship: CombatDisplayShip, byId: ReadonlyMap<string, CombatDisplayShip>): void {
    target.hullSprites = this.hullSprites.captureReadonly(ship, byId);
    target.id = ship.id;
    target.teamId = ship.teamId;
    target.pos = readonlyPoint(target.pos as { x: number; y: number } | undefined, ship.pos);
    target.facingRad = ship.facingRad;
    target.hullHp = ship.hullHp;
    target.maxHullHp = ship.maxHullHp;
    target.retreating = ship.retreating;
    let specRec = target.spec as Record<string, unknown> | undefined;
    const spec = ship.spec;
    if (!specRec) {
      specRec = {
        nameKey: spec.nameKey, designationKey: spec.designationKey, spriteUrl: spec.spriteUrl,
        spriteWidth: spec.spriteWidth, spriteHeight: spec.spriteHeight, pivotX: spec.pivotX, pivotY: spec.pivotY, hullSize: spec.hullSize,
      };
      knownProjectionKeys.set(specRec, mapSpecKeys);
      target.spec = specRec;
    } else {
      specRec.nameKey = spec.nameKey; specRec.designationKey = spec.designationKey; specRec.spriteUrl = spec.spriteUrl;
      specRec.spriteWidth = spec.spriteWidth; specRec.spriteHeight = spec.spriteHeight;
      specRec.pivotX = spec.pivotX; specRec.pivotY = spec.pivotY; specRec.hullSize = spec.hullSize;
    }
  }
  captureReadonly(engine: TacticalMapViewSource, epoch = 0, available = true): TacticalMapSnapshot {
    if (this.engine !== engine || this.flagship !== engine.playerShip || this.epoch !== epoch) {
      this.engine = engine; this.flagship = engine.playerShip; this.epoch = epoch; this.generation++; this.previous = undefined;
    }
    this.readonlySnapshot.generation = this.generation;
    this.readonlySnapshot.available = available;
    if (!available || !engine.isTacticalMap) {
      this.readonlySnapshot.map = null;
      return this.readonlySnapshot;
    }
    const ships = engine.ships, team = engine.playerShip.teamId;
    const observers = combatObservers(ships, team);
    const visibility = this.visibility;
    visibility.clear();
    const visible = (ship: CombatDisplayShip) => {
      let result = visibility.get(ship);
      if (result === undefined) { result = contactVisible(ship, observers, team, engine.openBattlefield); visibility.set(ship, result); }
      return result;
    };
    const byId = this.byId;
    const visibleById = this.visibleById;
    byId.clear();
    visibleById.clear();
    for (let i = 0; i < ships.length; i++) {
      const s = ships[i];
      byId.set(s.id, s);
      if (visible(s)) visibleById.set(s.id, s);
    }
    const ship = engine.playerShip;
    this.updateContactReadonly(this.readonlyFlagship, ship, byId);
    this.readonlyFlagship.currentCR = ship.currentCR;
    this.readonlyFlagship.hullPortrait = this.portrait.capture(ship, ships, true);
    this.readonlyFlagshipFlux.fluxPercent = ship.flux.fluxPercent;
    this.readonlyFlagshipFlux.hardFlux = ship.flux.hardFlux;
    this.readonlyFlagshipFlux.maxFlux = ship.flux.maxFlux;
    this.readonlyFlagshipFlux.totalFlux = ship.flux.totalFlux;
    this.readonlyFlagship.flux = this.readonlyFlagshipFlux;
    const armorSource = ship.armor;
    const armorRev = armorSource.cellMutationRevision;
    const armor = this.armorCache.readReadonly(armorSource);
    const fa = this.readonlyFlagshipArmor;
    fa.cols = armor.cols; fa.rows = armor.rows; fa.cellWidth = armor.cellWidth; fa.cellHeight = armor.cellHeight;
    fa.minX = armor.minX; fa.minY = armor.minY; fa.maxCellArmor = armor.maxCellArmor;
    if (this.flagshipArmorSource !== armorSource || armorRev === null || this.flagshipArmorRevision !== armorRev || this.flagshipArmorDirtyVersion !== armor.dirtyVersion) {
      this.flagshipArmorSource = armorSource;
      this.flagshipArmorRevision = armorRev;
      this.flagshipArmorDirtyVersion = armor.dirtyVersion;
      const srcCells = armor.cells;
      const dstCells = fa.cells;
      dstCells.length = srcCells.length;
      for (let i = 0; i < srcCells.length; i++) dstCells[i] = srcCells[i];
    }
    this.readonlyFlagship.armor = fa;

    const capitals = engine.capitalShips;
    const capArr = this.readonlyCapitalShipsArray;
    let capWrite = 0;
    let teamLivingCount = 0;
    for (let i = 0; i < capitals.length; i++) {
      const cap = capitals[i];
      if (!visible(cap)) continue;
      if (cap.teamId === team) teamLivingCount++;
      let rec = this.readonlyContacts.get(cap);
      if (!rec) {
        rec = {};
        const fluxRec = { fluxPercent: cap.flux.fluxPercent };
        knownProjectionKeys.set(fluxRec, mapFluxKeys);
        rec.flux = fluxRec;
        knownProjectionKeys.set(rec, mapContactKeys);
        this.readonlyContacts.set(cap, rec);
      } else {
        (rec.flux as { fluxPercent: number }).fluxPercent = cap.flux.fluxPercent;
      }
      this.updateContactReadonly(rec, cap, visibleById);
      capArr[capWrite++] = rec as unknown as MapContact;
    }
    capArr.length = capWrite;

    const fighterArr = this.readonlyFightersArray;
    let fighterWrite = 0;
    const projectFighter = (f: CombatDisplayShip) => {
      if (!visible(f)) return;
      let rec = this.readonlyFighters.get(f);
      if (!rec) {
        rec = { id: f.id, teamId: f.teamId, pos: readonlyPoint(undefined, f.pos), facingRad: f.facingRad };
        knownProjectionKeys.set(rec, mapFighterKeys);
        this.readonlyFighters.set(f, rec);
      } else {
        rec.id = f.id; rec.teamId = f.teamId;
        readonlyPoint(rec.pos as { x: number; y: number }, f.pos);
        rec.facingRad = f.facingRad;
      }
      fighterArr[fighterWrite++] = rec;
    };
    const fighters = engine.fighters, bombers = engine.bombers;
    for (let i = 0; i < fighters.length; i++) projectFighter(fighters[i]);
    for (let i = 0; i < bombers.length; i++) projectFighter(bombers[i]);
    fighterArr.length = fighterWrite;

    const obsArr = this.readonlyObserversArray;
    obsArr.length = observers.length;
    for (let i = 0; i < observers.length; i++) {
      const obs = observers[i];
      let rec = this.readonlyObservers.get(obs);
      if (!rec) {
        rec = { pos: readonlyPoint(undefined, obs.pos), sightRadius: obs.sightRadius };
        knownProjectionKeys.set(rec, mapObserverKeys);
        this.readonlyObservers.set(obs, rec);
      } else {
        readonlyPoint(rec.pos as { x: number; y: number }, obs.pos);
        rec.sightRadius = obs.sightRadius;
      }
      obsArr[i] = rec;
    }

    const ordersObj = this.readonlyOrders;
    for (const key in ordersObj) {
      if (!engine.orders.has(key)) delete ordersObj[key];
    }
    const targetPositionsObj = this.readonlyTargetPositions;
    for (const key in targetPositionsObj) delete targetPositionsObj[key];
    for (const [id, order] of engine.orders) {
      let rec = ordersObj[id];
      if (!rec) {
        rec = {
          id: order.id, type: order.type, issuedTime: order.issuedTime, targetShipId: order.targetShipId,
          targetPos: order.targetPos ? readonlyPoint(undefined, order.targetPos) : undefined,
        };
        ordersObj[id] = rec;
      } else {
        rec.id = order.id; rec.type = order.type; rec.issuedTime = order.issuedTime; rec.targetShipId = order.targetShipId;
        rec.targetPos = order.targetPos ? readonlyPoint(rec.targetPos as { x: number; y: number } | undefined, order.targetPos) : undefined;
      }
      if (order.targetShipId && (order.type === 'ENGAGE' || order.type === 'ESCORT' || order.type === 'AVOID')) {
        const target = byId.get(order.targetShipId);
        if (target && visible(target)) {
          Object.defineProperty(targetPositionsObj, target.id, { value: point(target.pos), enumerable: true, configurable: true, writable: true });
        }
      }
    }

    this.readonlyEnvironment.backgroundUrl = engine.environment.backgroundUrl;

    const nebulae = engine.nebulae;
    const nebArr = this.readonlyNebulaeArray;
    nebArr.length = nebulae.length;
    for (let i = 0; i < nebulae.length; i++) {
      const cloud = nebulae[i];
      let rec = this.readonlyNebulae.get(cloud);
      if (!rec) {
        rec = { pos: readonlyPoint(undefined, cloud.pos), spriteUrl: cloud.spriteUrl, thickness: cloud.thickness, atlasColumn: cloud.atlasColumn, atlasRow: cloud.atlasRow };
        knownProjectionKeys.set(rec, mapNebulaKeys);
        this.readonlyNebulae.set(cloud, rec);
      } else {
        readonlyPoint(rec.pos as { x: number; y: number }, cloud.pos);
        rec.spriteUrl = cloud.spriteUrl; rec.thickness = cloud.thickness; rec.atlasColumn = cloud.atlasColumn; rec.atlasRow = cloud.atlasRow;
      }
      nebArr[i] = rec;
    }

    const asteroids = engine.asteroids;
    const astArr = this.readonlyAsteroidsArray;
    astArr.length = asteroids.length;
    for (let i = 0; i < asteroids.length; i++) {
      const ast = asteroids[i];
      let rec = this.readonlyAsteroids.get(ast);
      if (!rec) {
        rec = { pos: readonlyPoint(undefined, ast.pos), radius: ast.radius };
        knownProjectionKeys.set(rec, mapAsteroidKeys);
        this.readonlyAsteroids.set(ast, rec);
      } else {
        readonlyPoint(rec.pos as { x: number; y: number }, ast.pos);
        rec.radius = ast.radius;
      }
      astArr[i] = rec;
    }

    const hulks = engine.hulkFragments;
    const hulkArr = this.readonlyHulksArray;
    hulkArr.length = hulks.length;
    for (let i = 0; i < hulks.length; i++) {
      const hulk = hulks[i];
      let rec = this.readonlyHulks.get(hulk);
      if (!rec) {
        rec = { pos: readonlyPoint(undefined, hulk.pos) };
        knownProjectionKeys.set(rec, mapHulkKeys);
        this.readonlyHulks.set(hulk, rec);
      } else {
        readonlyPoint(rec.pos as { x: number; y: number }, hulk.pos);
      }
      hulkArr[i] = rec;
    }

    const mapView = this.readonlyMap;
    mapView.playerShip = this.readonlyFlagship;
    mapView.capitalShips = capArr;
    mapView.fighters = fighterArr;
    mapView.observers = obsArr;
    mapView.orders = ordersObj;
    mapView.targetPositions = targetPositionsObj;
    mapView.selectedUnitId = engine.selectedUnitId;
    mapView.commandPoints = engine.commandPoints;
    mapView.battleEnded = !!engine.battleResult;
    mapView.openBattlefield = engine.openBattlefield;
    mapView.multiTeamBattle = engine.multiTeamBattle;
    mapView.isSimulation = engine.isSimulation;
    mapView.deploymentEnabled = engine.deployment.enabled;
    mapView.deployedCount = engine.isSimulation ? engine.simulationDeployedPoints(true) : engine.deployment.enabled ? engine.deployment.used(team) : teamLivingCount;
    mapView.environment = this.readonlyEnvironment;
    mapView.nebulae = nebArr;
    mapView.asteroids = astArr;
    mapView.hulkFragments = hulkArr;

    this.readonlySnapshot.map = mapView as unknown as TacticalMapView;
    return this.readonlySnapshot;
  }
  capture(engine: TacticalMapViewSource, epoch = 0, available = true): TacticalMapSnapshot {
    if (this.engine !== engine || this.flagship !== engine.playerShip || this.epoch !== epoch) {
      this.engine = engine; this.flagship = engine.playerShip; this.epoch = epoch; this.generation++; this.previous = undefined;
    }
    const envelope = { generation: this.generation, available };
    if (!available || !engine.isTacticalMap) return this.previous = copyTacticalMapSnapshot({ ...envelope, map: null }, this.previous);
    const ships = engine.ships, team = engine.playerShip.teamId;
    const observers = combatObservers(ships, team), visibility = new Map<CombatDisplayShip, boolean>();
    const visible = (ship: CombatDisplayShip) => {
      let result = visibility.get(ship);
      if (result === undefined) { result = contactVisible(ship, observers, team, engine.openBattlefield); visibility.set(ship, result); }
      return result;
    };
    const living = engine.capitalShips.filter(visible), byId = new Map(ships.map(ship => [ship.id, ship]));
    const visibleById = new Map(ships.filter(visible).map(ship => [ship.id, ship]));
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
    const playerShip: MapFlagship = { ...contact(ship, byId), currentCR: ship.currentCR, hullPortrait: this.portrait.capture(ship, ships),
      flux: { fluxPercent: ship.flux.fluxPercent, hardFlux: ship.flux.hardFlux, maxFlux: ship.flux.maxFlux, totalFlux: ship.flux.totalFlux },
      armor: { cols: armor.cols, rows: armor.rows, cellWidth: armor.cellWidth, cellHeight: armor.cellHeight,
        minX: armor.minX, minY: armor.minY, maxCellArmor: armor.maxCellArmor, cells: Array.from(armor.cells) } };
    return this.previous = copyTacticalMapSnapshot({ ...envelope, map: {
      playerShip, capitalShips: living.map(ship => contact(ship, visibleById)), fighters: [...engine.fighters, ...engine.bombers].filter(visible)
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
export function engineTacticalMapSource(engine: TacticalMapViewSource): TacticalMapSource {
  const projector = new TacticalMapViewProjector();
  return { read: () => projector.capture(engine) };
}
