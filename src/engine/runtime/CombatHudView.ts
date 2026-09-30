import type { CombatDisplayReads, CombatDisplayShip } from './CombatDisplayReads';
import type { CombatEngine } from '../simulation/CombatEngine';
import type { Ship } from '../simulation/Ship';
import type { ShipSystem } from '../simulation/ShipSystem';
import type { WeaponMount } from '../simulation/Weapon';
import { manualWeaponShip } from './ModuleFireControl';
import { HullPortraitProjector, type HullPortraitPart } from './HullPortraitView';
import { lockedCombatTarget } from './CombatTargeting';
import { Vector2 } from '../math/Vector2';

/** HUD projection reads, shared by the authority and display-owned legacy Ship graphs.
 * The deployment replica needs no deploy/retreat or other authority capabilities. */
export type CombatHudSource = Readonly<Pick<CombatDisplayReads,
  'playerShip' | 'ships' | 'capitalShips' | 'fighters' | 'bombers' | 'allCapitalShips'
  | 'playerWings' | 'enemyWings' | 'findHostile' | 'isTacticalMap' | 'isSimulation'
  | 'openBattlefield' | 'multiTeamBattle' | 'battleResult' | 'isBattleResultReady'
  | 'combatTime' | 'shipLossNotifications' | 'notificationTime'
>> & {
  readonly deployment: Readonly<Pick<CombatEngine['deployment'], 'enabled' | 'isReserve'>>;
};

/** Display capabilities only. No damage, AI, controls, RNG or simulation services. */
export type HudContact = Readonly<Pick<Ship, 'id'|'spec'|'pos'|'prevPos'|'vel'|'facingRad'|'prevFacingRad'|'teamId'|'playerTargetId'|'hullHp'|'maxHullHp'|'currentCR'|'isDead'|'isDocked'|'isRetreated'|'isPhased'|'retreating'|'visibilityMask'|'visibilityOverflow'|'flightDeckWingId'|'interpolatedPos'|'isVisibleTo'>> & {
  readonly flux: Readonly<Pick<Ship['flux'], 'fluxPercent'|'totalFlux'|'maxFlux'|'hardFlux'|'isVenting'|'isOverloaded'|'overloadTimer'|'isEngineBoostActive'>>;
};
export type HudSystem = Readonly<Pick<ShipSystem, 'name'|'type'|'description'|'state'|'available'|'disabled'|'isActive'|'isCoolingDown'|'cooldownTimer'|'activationFailureReason'|'charges'|'maxCharges'|'statusText'|'passiveStatusText'>> & {
  readonly definition: Pick<ShipSystem['definition'], 'charges'|'audio'>;
};
export type HudWeapon = Readonly<Pick<WeaponMount, 'slotId'|'isDisabled'|'ammo'|'firingState'|'cooldownTimer'|'disabledTimer'|'isPermanentlyDisabled'|'gravityTractor'>> & {
  readonly spec: Readonly<Pick<WeaponMount['spec'], 'id'|'nameKey'|'maxAmmo'|'type'|'soundLoopKey'|'turretSpriteUrl'|'hardpointSpriteUrl'|'displayIconUrl'|'mountSize'|'gravityTractor'>>;
};
export type HudShip = HudContact & Readonly<Pick<Ship, 'fireControlMode'|'isFiringMain'|'throttle'|'brakeInput'|'strafeInput'|'turnInput'|'shipName'|'selectedGroupIndex'|'weaponGroups'|'peakPerformanceRemaining'|'combatWeaponRepairTimeMultiplier'|'fighterRecall'|'teleportCameraOffset'|'scorchMarks'|'scorchMarkVersion'>> & {
  readonly hullPortrait: readonly HullPortraitPart[];
  readonly armor: Readonly<Pick<Ship['armor'], 'cols'|'rows'|'minX'|'minY'|'cellWidth'|'cellHeight'|'maxCellArmor'|'cells'|'dirtyVersion'>>;
  readonly shield: Readonly<Pick<Ship['shield'], 'type'|'isActive'|'isPhaseEngaged'|'isRaiseRequested'|'voidShield'>>;
  readonly systems: readonly HudSystem[]; readonly allSystems: readonly HudSystem[];
  readonly system: HudSystem; readonly defenseSystem: HudSystem | undefined;
  readonly weapons: readonly HudWeapon[];
  readonly phaseSpeedMultiplier: number; readonly significantEnemiesInRange: boolean;
  readonly flameoutRatio: number; readonly timeToVent: number;
};
export interface CombatHudView {
  readonly playerShip: HudShip; readonly weaponShip: HudShip; readonly targetShip: HudShip | null;
  readonly ships: readonly HudContact[]; readonly capitalShips: readonly HudContact[];
  readonly fighters: readonly HudContact[]; readonly bombers: readonly HudContact[];
  readonly playerWings: readonly Pick<CombatEngine['playerWings'][number], 'carrierId'|'wingId'|'name'|'maxCrafts'|'crr'>[];
  readonly enemyWings: CombatHudView['playerWings'];
  readonly reserveIds: readonly string[]; readonly weaponAudioLoops: readonly string[];
  readonly isTacticalMap: boolean; readonly isSimulation: boolean; readonly deploymentEnabled: boolean;
  readonly openBattlefield: boolean; readonly multiTeamBattle: boolean;
  readonly battleResult: CombatEngine['battleResult']; readonly isBattleResultReady: boolean;
  readonly combatTime: number; readonly shipLossNotifications: CombatEngine['shipLossNotifications'];
  readonly notificationTime: number;
}
/** Pure presentation math, never inherits the Ship simulation prototype. */
export class HudContactRecord {
  declare pos: Vector2; declare prevPos: Vector2; declare teamId: number;
  declare visibilityMask: number; declare visibilityOverflow: string;
  interpolatedPos(alpha: number): Vector2 { return Vector2.lerp(this.prevPos, this.pos, alpha); }
  isVisibleTo(side: number | boolean): boolean {
    const team = typeof side === 'boolean' ? (side ? 0 : 1) : side;
    return this.teamId === team || (team < 31 ? !!(this.visibilityMask & (1 << team)) : this.visibilityOverflow === '*' || this.visibilityOverflow.includes('|' + team + '|'));
  }
}
const contactKeys = ['id','spec','pos','prevPos','vel','facingRad','prevFacingRad','teamId','playerTargetId','hullHp','maxHullHp','currentCR','isDead','isDocked','isRetreated','isPhased','retreating','visibilityMask','visibilityOverflow','flightDeckWingId'] as const;
const fluxKeys = ['fluxPercent','totalFlux','maxFlux','hardFlux','isVenting','isOverloaded','overloadTimer','isEngineBoostActive'] as const;
const richKeys = ['fireControlMode','isFiringMain','throttle','brakeInput','strafeInput','turnInput','shipName','selectedGroupIndex','weaponGroups','peakPerformanceRemaining','combatWeaponRepairTimeMultiplier','fighterRecall','teleportCameraOffset','scorchMarks','scorchMarkVersion'] as const;
const systemKeys = ['name','type','description','state','available','disabled','isActive','isCoolingDown','cooldownTimer','activationFailureReason','charges','maxCharges','statusText','passiveStatusText'] as const;
/** Records retain identity for delta encoding and RAF readers. Only the flagship and
 * locked target carry armor/weapon detail; ordinary contacts never walk those graphs. */
export class CombatHudProjector {
  private readonly portrait = new HullPortraitProjector();
  private readonly contacts = new WeakMap<CombatDisplayShip, HudContact>();
  private readonly detailed = new WeakMap<CombatDisplayShip, HudShip>();
  private readonly parts = new WeakMap<object, object>();
  private select<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Pick<T, K> {
    let result = this.parts.get(source) as Pick<T,K> | undefined;
    if (!result) { result = {} as Pick<T,K>; this.parts.set(source, result); }
    for (const key of keys) result[key] = source[key];
    return result;
  }
  private contact(ship: CombatDisplayShip, detail: boolean, engine: CombatHudSource): HudContact {
    const cache = detail ? this.detailed : this.contacts;
    let result = cache.get(ship);
    if (!result) { result = new HudContactRecord() as HudShip; cache.set(ship, result as HudShip); }
    Object.assign(result, Object.fromEntries(contactKeys.map(key => [key, ship[key]])), {flux: this.select(ship.flux, fluxKeys)});
    if (detail) {
      const system = (value: HudSystem) => Object.assign(this.select(value, systemKeys), {definition: this.select(value.definition, ['charges','audio'])});
      Object.assign(result, Object.fromEntries(richKeys.map(key => [key, ship[key]])), {
        hullPortrait: this.portrait.capture(ship, engine.ships.filter(part => part.isVisibleTo(engine.playerShip.teamId))),
        // Display records own their array; reading the public mutable view would
        // disable mutation-tracked replication on the live simulation grid.
        armor: Object.assign(this.select(ship.armor, ['cols','rows','minX','minY','cellWidth','cellHeight','maxCellArmor']),
          {cells: ship.armor.copyCells(), dirtyVersion: ship.armor.dirtyVersion}),
        shield: this.select(ship.shield, ['type','isActive','isPhaseEngaged','isRaiseRequested','voidShield']),
        systems: ship.systems.map(system), allSystems: ship.allSystems.map(system), system: system(ship.system), defenseSystem: ship.defenseSystem ? system(ship.defenseSystem) : undefined,
        weapons: ship.weapons.map(mount => Object.assign(this.select(mount, ['slotId','isDisabled','ammo','firingState','cooldownTimer','disabledTimer','isPermanentlyDisabled','gravityTractor']), {spec: this.select(mount.spec, ['id','nameKey','maxAmmo','type','soundLoopKey','turretSpriteUrl','hardpointSpriteUrl','displayIconUrl','mountSize','gravityTractor'])})),
        phaseSpeedMultiplier: ship.shield.getPhaseSpeedMultiplier(ship.flux.maxFlux > 0 ? ship.flux.hardFlux / ship.flux.maxFlux : 0),
        significantEnemiesInRange: ship.areSignificantEnemiesInRange(2500, engine.findHostile(ship)), flameoutRatio: ship.getFlameoutRatio(), timeToVent: ship.flux.getTimeToVent(),
      });
    }
    return result;
  }
  capture(engine: CombatHudSource): CombatHudView { return this.captureView(engine, false); }
  /** Only an owner with synchronous, side-effect-free display readers may opt in.
   * General authority/extension callers retain every original read via capture(). */
  captureReadonly(engine: CombatHudSource): CombatHudView { return this.captureView(engine, true); }
  private captureView(engine: CombatHudSource, readonlyCapture: boolean): CombatHudView {
    const player = engine.playerShip;
    const target = lockedCombatTarget(engine.ships, player);
    const weaponShip = manualWeaponShip(player, engine.ships);
    // One record may appear in player/target and several roster arrays. Keep all
    // those slots and aliases, but do not rebuild its armor/weapons/systems for
    // each occurrence. The index is call-local: reentrancy cannot overwrite it.
    const captured = readonlyCapture ? new Map<CombatDisplayShip, HudContact>() : undefined;
    const map = captured ? (ship: CombatDisplayShip) => {
      const previous = captured.get(ship);
      if (previous) return previous;
      const contact = this.contact(ship, ship === player || ship === target || ship === weaponShip, engine);
      captured.set(ship, contact);
      return contact;
    } : (ship: CombatDisplayShip) => this.contact(ship, ship === player || ship === target || ship === weaponShip, engine);
    const loops = new Set<string>();
    for (const ship of engine.ships) if (!ship.isDead && !ship.isPhased && !ship.flux.isVenting && !ship.flux.isOverloaded)
      for (const mount of ship.weapons) if (mount.spec.soundLoopKey && !mount.isDisabled && (mount.firingState === 'ACTIVE' || mount.firingState === 'CHARGING')) loops.add(mount.spec.soundLoopKey);
    const wing = (value: CombatEngine['playerWings'][number]) => this.select(value, ['carrierId','wingId','name','maxCrafts','crr']);
    return {playerShip: map(player) as HudShip, weaponShip: map(weaponShip) as HudShip, targetShip: target ? map(target) as HudShip : null,
      ships: engine.ships.map(map), capitalShips: engine.capitalShips.map(map), fighters: engine.fighters.map(map), bombers: engine.bombers.map(map),
      playerWings: engine.playerWings.map(wing), enemyWings: engine.enemyWings.map(wing),
      reserveIds: engine.allCapitalShips.filter(ship => engine.deployment.isReserve(ship.id)).map(ship => ship.id), weaponAudioLoops: [...loops],
      isTacticalMap: engine.isTacticalMap, isSimulation: engine.isSimulation, deploymentEnabled: engine.deployment.enabled,
      openBattlefield: engine.openBattlefield, multiTeamBattle: engine.multiTeamBattle, battleResult: engine.battleResult,
      isBattleResultReady: engine.isBattleResultReady, combatTime: engine.combatTime, shipLossNotifications: engine.shipLossNotifications, notificationTime: engine.notificationTime};
  }
}
/** Stable accessor facade lets RAF consumers observe newly published frames. */
export function liveCombatHudView(read: () => CombatHudView): CombatHudView {
  return new Proxy({} as CombatHudView, {get: (_target, key) => read()[key as keyof CombatHudView]});
}
const adapters = new WeakMap<CombatHudSource, CombatHudView>();
export function combatHudView(engine: CombatHudSource): CombatHudView {
  let view = adapters.get(engine);
  if (!view) { const projector = new CombatHudProjector(); let snapshot: CombatHudView | undefined;
    view = liveCombatHudView(() => { if (!snapshot) { snapshot = projector.capture(engine); queueMicrotask(() => { snapshot = undefined; }); } return snapshot; }); adapters.set(engine, view); }
  return view;
}
