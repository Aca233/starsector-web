import type { CombatDisplayReads, CombatDisplayShip } from './CombatDisplayReads';
import type { CombatEngine } from '../simulation/CombatEngine';
import type { Ship } from '../simulation/Ship';
import type { ShipSystem } from '../simulation/ShipSystem';
import type { WeaponMount } from '../simulation/Weapon';
import { manualWeaponShip } from './ModuleFireControl';
import { HullPortraitProjector, type HullPortraitPart } from './HullPortraitView';
import { lockedCombatTarget } from './CombatTargeting';
import { Vector2 } from '../math/Vector2';
import { knownProjectionKeys } from './local/RenderShipProjection';

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
export type HudSystem = Readonly<Pick<ShipSystem, 'gravityField' | 'activeTimer' | 'gravityPush' | 'gravityPolarity'|'gravityControlHeld'|'name'|'type'|'description'|'state'|'available'|'disabled'|'isActive'|'isCoolingDown'|'cooldownTimer'|'activationFailureReason'|'charges'|'maxCharges'|'statusText'|'passiveStatusText'>> & {
  readonly definition: Pick<ShipSystem['definition'], 'gravityField'|'gravityCollapse'|'charges'|'audio'>;
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
const systemKeys = ['gravityField','activeTimer','gravityPush','gravityPolarity','gravityControlHeld','name','type','description','state','available','disabled','isActive','isCoolingDown','cooldownTimer','activationFailureReason','charges','maxCharges','statusText','passiveStatusText'] as const;
const hudContactAllKeys = [...contactKeys, 'flux'] as const;
const hudDetailAllKeys = [...contactKeys, 'flux', ...richKeys, 'hullPortrait', 'armor', 'shield', 'systems', 'allSystems', 'system', 'defenseSystem', 'weapons', 'phaseSpeedMultiplier', 'significantEnemiesInRange', 'flameoutRatio', 'timeToVent'] as const;
const sysDefKeys = ['gravityField','gravityCollapse','charges','audio'] as const;
const hudSystemAllKeys = [...systemKeys, 'definition'] as const;
const armorSelectKeys = ['cols','rows','minX','minY','cellWidth','cellHeight','maxCellArmor'] as const;
const hudArmorAllKeys = [...armorSelectKeys, 'cells', 'dirtyVersion'] as const;
const shieldSelectKeys = ['type','isActive','isPhaseEngaged','isRaiseRequested','voidShield'] as const;
const weaponSelectKeys = ['slotId','isDisabled','ammo','firingState','cooldownTimer','disabledTimer','isPermanentlyDisabled','gravityTractor'] as const;
const weaponSpecSelectKeys = ['id','nameKey','maxAmmo','type','soundLoopKey','turretSpriteUrl','hardpointSpriteUrl','displayIconUrl','mountSize','gravityTractor'] as const;
const hudWeaponAllKeys = [...weaponSelectKeys, 'spec'] as const;
const wingSelectKeys = ['carrierId','wingId','name','maxCrafts','crr'] as const;
const hudViewKeys = ['playerShip', 'weaponShip', 'targetShip', 'ships', 'capitalShips', 'fighters', 'bombers', 'playerWings', 'enemyWings', 'reserveIds', 'weaponAudioLoops', 'isTacticalMap', 'isSimulation', 'deploymentEnabled', 'openBattlefield', 'multiTeamBattle', 'battleResult', 'isBattleResultReady', 'combatTime', 'shipLossNotifications', 'notificationTime'] as const;
/** Records retain identity for delta encoding and RAF readers. Only the flagship and
 * locked target carry armor/weapon detail; ordinary contacts never walk those graphs. */
export class CombatHudProjector {
  private readonly portrait = new HullPortraitProjector();
  private readonly contacts = new WeakMap<CombatDisplayShip, HudContact>();
  private readonly detailed = new WeakMap<CombatDisplayShip, HudShip>();
  private readonly parts = new WeakMap<object, object>();
  private readonly readonlyViews = new WeakMap<CombatHudSource, CombatHudView>();
  private select<T extends object, K extends keyof T>(source: T, keys: readonly K[], allKeys?: readonly string[]): Pick<T, K> {
    let result = this.parts.get(source) as Pick<T,K> | undefined;
    if (!result) {
      result = {} as Pick<T,K>;
      this.parts.set(source, result);
      knownProjectionKeys.set(result, allKeys ?? (keys as unknown as readonly string[]));
    }
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      result[key] = source[key];
    }
    return result;
  }
  private fillArray<S, T>(target: T[] | undefined, source: readonly S[], project: (item: S) => T, reuse: boolean): T[] {
    if (!reuse || !target) return source.map(project);
    target.length = source.length;
    for (let i = 0; i < source.length; i++) target[i] = project(source[i]);
    return target;
  }
  private flux(source: CombatDisplayShip['flux']): Pick<CombatDisplayShip['flux'], typeof fluxKeys[number]> {
    let result = this.parts.get(source) as Pick<CombatDisplayShip['flux'], typeof fluxKeys[number]> | undefined;
    if (!result) {
      result = {
        fluxPercent: source.fluxPercent,
        totalFlux: source.totalFlux,
        maxFlux: source.maxFlux,
        hardFlux: source.hardFlux,
        isVenting: source.isVenting,
        isOverloaded: source.isOverloaded,
        overloadTimer: source.overloadTimer,
        isEngineBoostActive: source.isEngineBoostActive,
      };
      this.parts.set(source, result);
      knownProjectionKeys.set(result, fluxKeys);
    } else {
      result.fluxPercent = source.fluxPercent;
      (result as { totalFlux: number }).totalFlux = source.totalFlux;
      result.maxFlux = source.maxFlux;
      result.hardFlux = source.hardFlux;
      result.isVenting = source.isVenting;
      result.isOverloaded = source.isOverloaded;
      result.overloadTimer = source.overloadTimer;
      result.isEngineBoostActive = source.isEngineBoostActive;
    }
    return result;
  }
  private contact(ship: CombatDisplayShip, detail: boolean, engine: CombatHudSource, readonlyCapture = false, visibleShips?: readonly CombatDisplayShip[]): HudContact {
    const cache = detail ? this.detailed : this.contacts;
    let result = cache.get(ship);
    if (!result) {
      result = new HudContactRecord() as HudShip;
      knownProjectionKeys.set(result, detail ? hudDetailAllKeys : hudContactAllKeys);
      cache.set(ship, result as HudShip);
    }
    const targetRecord = result as unknown as Record<string, unknown>;
    if (readonlyCapture) {
      targetRecord.id = ship.id;
      targetRecord.spec = ship.spec;
      targetRecord.pos = ship.pos;
      targetRecord.prevPos = ship.prevPos;
      targetRecord.vel = ship.vel;
      targetRecord.facingRad = ship.facingRad;
      targetRecord.prevFacingRad = ship.prevFacingRad;
      targetRecord.teamId = ship.teamId;
      targetRecord.playerTargetId = ship.playerTargetId;
      targetRecord.hullHp = ship.hullHp;
      targetRecord.maxHullHp = ship.maxHullHp;
      targetRecord.currentCR = ship.currentCR;
      targetRecord.isDead = ship.isDead;
      targetRecord.isDocked = ship.isDocked;
      targetRecord.isRetreated = ship.isRetreated;
      targetRecord.isPhased = ship.isPhased;
      targetRecord.retreating = ship.retreating;
      targetRecord.visibilityMask = ship.visibilityMask;
      targetRecord.visibilityOverflow = ship.visibilityOverflow;
      targetRecord.flightDeckWingId = ship.flightDeckWingId;
      targetRecord.flux = this.flux(ship.flux);
    } else {
      for (let i = 0; i < contactKeys.length; i++) {
        const key = contactKeys[i];
        targetRecord[key] = ship[key];
      }
      targetRecord.flux = this.select(ship.flux, fluxKeys);
    }
    if (detail) {
      const system = (value: HudSystem) => {
        const sysRec = this.select(value, systemKeys, hudSystemAllKeys) as Record<string, unknown>;
        sysRec.definition = this.select(value.definition, sysDefKeys);
        return sysRec as unknown as HudSystem;
      };
      for (let i = 0; i < richKeys.length; i++) {
        const key = richKeys[i];
        targetRecord[key] = ship[key];
      }
      const visible = visibleShips ?? engine.ships.filter(part => part.isVisibleTo(engine.playerShip.teamId));
      targetRecord.hullPortrait = this.portrait.capture(ship, visible, readonlyCapture);
      // Display records own their array; reading the public mutable view would
      // disable mutation-tracked replication on the live simulation grid.
      const armorRec = this.select(ship.armor, armorSelectKeys, hudArmorAllKeys) as Record<string, unknown>;
      if (!readonlyCapture || !armorRec.cells || armorRec.dirtyVersion !== ship.armor.dirtyVersion) {
        const copyInto = (ship.armor as { copyCellsInto?: (target?: Float32Array) => Float32Array }).copyCellsInto;
        armorRec.cells = readonlyCapture && copyInto
          ? copyInto.call(ship.armor, armorRec.cells as Float32Array | undefined)
          : ship.armor.copyCells();
        armorRec.dirtyVersion = ship.armor.dirtyVersion;
      }
      targetRecord.armor = armorRec;
      targetRecord.shield = this.select(ship.shield, shieldSelectKeys);
      targetRecord.systems = this.fillArray(targetRecord.systems as HudSystem[] | undefined, ship.systems, system, readonlyCapture);
      targetRecord.allSystems = this.fillArray(targetRecord.allSystems as HudSystem[] | undefined, ship.allSystems, system, readonlyCapture);
      targetRecord.system = system(ship.system);
      targetRecord.defenseSystem = ship.defenseSystem ? system(ship.defenseSystem) : undefined;
      targetRecord.weapons = this.fillArray(
        targetRecord.weapons as HudWeapon[] | undefined,
        ship.weapons,
        mount => {
          const weaponRec = this.select(mount, weaponSelectKeys, hudWeaponAllKeys) as Record<string, unknown>;
          weaponRec.spec = this.select(mount.spec, weaponSpecSelectKeys);
          return weaponRec as unknown as HudWeapon;
        },
        readonlyCapture,
      );
      targetRecord.phaseSpeedMultiplier = ship.shield.getPhaseSpeedMultiplier(ship.flux.maxFlux > 0 ? ship.flux.hardFlux / ship.flux.maxFlux : 0);
      targetRecord.significantEnemiesInRange = ship.areSignificantEnemiesInRange(2500, engine.findHostile(ship));
      targetRecord.flameoutRatio = ship.getFlameoutRatio();
      targetRecord.timeToVent = ship.flux.getTimeToVent();
    }
    return result;
  }
  capture(engine: CombatHudSource): CombatHudView { return this.captureView(engine, false); }
  /** Only an owner with synchronous, side-effect-free display readers may opt in.
   * General authority/extension callers retain every original read via capture(). */
  captureReadonly(engine: CombatHudSource): CombatHudView { return this.captureView(engine, true); }
  private captureView(engine: CombatHudSource, readonlyCapture: boolean): CombatHudView {
    const player = engine.playerShip;
    const ships = engine.ships;
    const target = lockedCombatTarget(ships, player);
    const weaponShip = manualWeaponShip(player, ships);
    let visibleShips: CombatDisplayShip[] | undefined;
    const getVisibleShips = () => {
      if (!visibleShips) visibleShips = ships.filter(part => part.isVisibleTo(player.teamId));
      return visibleShips;
    };
    // One record may appear in player/target and several roster arrays. Keep all
    // those slots and aliases, but do not rebuild its armor/weapons/systems for
    // each occurrence. The index is call-local: reentrancy cannot overwrite it.
    const captured = readonlyCapture ? new Map<CombatDisplayShip, HudContact>() : undefined;
    const map = captured ? (ship: CombatDisplayShip) => {
      const previous = captured.get(ship);
      if (previous) return previous;
      const isDetail = ship === player || ship === target || ship === weaponShip;
      const contact = this.contact(ship, isDetail, engine, readonlyCapture, isDetail ? getVisibleShips() : undefined);
      captured.set(ship, contact);
      return contact;
    } : (ship: CombatDisplayShip) => {
      const isDetail = ship === player || ship === target || ship === weaponShip;
      return this.contact(ship, isDetail, engine, false, isDetail ? getVisibleShips() : undefined);
    };
    const loops = new Set<string>();
    for (let i = 0; i < ships.length; i++) {
      const ship = ships[i];
      if (!ship.isDead && !ship.flux.isVenting && !ship.flux.isOverloaded) {
        const weapons = ship.weapons;
        let phasedChecked = false;
        let phased = false;
        for (let j = 0; j < weapons.length; j++) {
          const mount = weapons[j];
          if (mount.spec.soundLoopKey && !mount.isDisabled && (mount.firingState === 'ACTIVE' || mount.firingState === 'CHARGING')) {
            if (!phasedChecked) { phasedChecked = true; phased = ship.isPhased; }
            if (!phased) loops.add(mount.spec.soundLoopKey);
          }
        }
      }
    }
    const wing = (value: CombatEngine['playerWings'][number]) => this.select(value, wingSelectKeys);
    if (!readonlyCapture) {
      return {playerShip: map(player) as HudShip, weaponShip: map(weaponShip) as HudShip, targetShip: target ? map(target) as HudShip : null,
        ships: ships.map(map), capitalShips: engine.capitalShips.map(map), fighters: engine.fighters.map(map), bombers: engine.bombers.map(map),
        playerWings: engine.playerWings.map(wing), enemyWings: engine.enemyWings.map(wing),
        reserveIds: engine.allCapitalShips.filter(ship => engine.deployment.isReserve(ship.id)).map(ship => ship.id), weaponAudioLoops: [...loops],
        isTacticalMap: engine.isTacticalMap, isSimulation: engine.isSimulation, deploymentEnabled: engine.deployment.enabled,
        openBattlefield: engine.openBattlefield, multiTeamBattle: engine.multiTeamBattle, battleResult: engine.battleResult,
        isBattleResultReady: engine.isBattleResultReady, combatTime: engine.combatTime, shipLossNotifications: engine.shipLossNotifications, notificationTime: engine.notificationTime};
    }
    let view = this.readonlyViews.get(engine) as unknown as Record<string, unknown> | undefined;
    if (!view) {
      view = {};
      knownProjectionKeys.set(view, hudViewKeys);
      this.readonlyViews.set(engine, view as unknown as CombatHudView);
    }
    view.playerShip = map(player) as HudShip;
    view.weaponShip = map(weaponShip) as HudShip;
    view.targetShip = target ? map(target) as HudShip : null;
    view.ships = this.fillArray(view.ships as HudContact[] | undefined, ships, map, true);
    view.capitalShips = this.fillArray(view.capitalShips as HudContact[] | undefined, engine.capitalShips, map, true);
    view.fighters = this.fillArray(view.fighters as HudContact[] | undefined, engine.fighters, map, true);
    view.bombers = this.fillArray(view.bombers as HudContact[] | undefined, engine.bombers, map, true);
    view.playerWings = this.fillArray(view.playerWings as ReturnType<typeof wing>[] | undefined, engine.playerWings, wing, true);
    view.enemyWings = this.fillArray(view.enemyWings as ReturnType<typeof wing>[] | undefined, engine.enemyWings, wing, true);
    const reserveIds = (view.reserveIds as string[] | undefined) ?? [];
    reserveIds.length = 0;
    const allCapitals = engine.allCapitalShips;
    for (let i = 0; i < allCapitals.length; i++) {
      if (engine.deployment.isReserve(allCapitals[i].id)) reserveIds.push(allCapitals[i].id);
    }
    view.reserveIds = reserveIds;
    const audioLoops = (view.weaponAudioLoops as string[] | undefined) ?? [];
    audioLoops.length = 0;
    for (const key of loops) audioLoops.push(key);
    view.weaponAudioLoops = audioLoops;
    view.isTacticalMap = engine.isTacticalMap;
    view.isSimulation = engine.isSimulation;
    view.deploymentEnabled = engine.deployment.enabled;
    view.openBattlefield = engine.openBattlefield;
    view.multiTeamBattle = engine.multiTeamBattle;
    view.battleResult = engine.battleResult;
    view.isBattleResultReady = engine.isBattleResultReady;
    view.combatTime = engine.combatTime;
    view.shipLossNotifications = engine.shipLossNotifications;
    view.notificationTime = engine.notificationTime;
    return view as unknown as CombatHudView;
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
