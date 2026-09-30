import { FireTargetQualification } from './QualifiedFireTargets';
import { PreAimRangeIndex } from './PreAimRangeIndex';
import type { WeaponMount } from '../simulation/Weapon';
import { FireControlBlockerIndex } from './FireControlBlockerIndex';
import { Vector2 } from '../math/Vector2';
import { hasNativeFireControlReaders, OwnedFireControlReadGuard, nativeFireControlPrototypes, type Ship } from '../simulation/Ship';
import type { CombatEngine } from '../simulation/CombatEngine';
import { sameTeam } from '../simulation/CombatTeams';
import { InFlightFireBudget } from './InFlightFireBudget';
import type { FireControlWorld } from './AutofireController';

// Metadata qualification is not amortized in smaller battles; keep their original path.
export const FIRE_CONTROL_QUERY_MIN_SHIPS = 100;

/** Not a DTO permission bit: only the module-private production Worker registers
 * its own engine. Mutable/inline engines never acquire this ownership implicitly. */
const workerOwnedEngines = new WeakSet<CombatEngine>();

const budgetEstimate = InFlightFireBudget.prototype.estimate;
const budgetPenalty = InFlightFireBudget.prototype.penalty;

/** A transaction-local roster, NOT a fixed-step snapshot or a hit-result cache.
 * ShipWeaponControlSystem opens it after motion/shields/component repair and closes
 * it before emissions. Native aiming only changes mount/tracker state in between.
 * The broadphase shares this lifetime; narrow-phase geometry, weapon roles and
 * tie order retain the original reads and arithmetic. */
export class FireControlQueryBatch {
  private active = true;
  private targetList?: Ship[];
  private readonly targetStatus = new Map<Ship, boolean>();
  private blockerList?: Ship[];
  private flightQueries = 0;
  private flightBlockerList?: Ship[];
  private flightRoster?: readonly Ship[];
  private flightBlockerIndex?: FireControlBlockerIndex;
  private readonly zeroTravel = new Vector2();
  private blockerIndex?: FireControlBlockerIndex;
  private readonly length: number;
  private readonly targetQualification?: FireTargetQualification;
  private preAimQueries = 0;
  private preAimIndex?: PreAimRangeIndex;
  private constructor(private readonly shooter: Ship, private readonly ships: readonly Ship[], private readonly workerOwned = false) {
    this.length = ships.length;
    this.targetQualification = workerOwned ? new FireTargetQualification(shooter, ships) : undefined;
  }

  public static create(ship: Ship, world: FireControlWorld): FireControlQueryBatch | undefined {
    if (world.queryRoster?.matches(world.ships)) return world.queryRoster.begin(ship, world);
    return undefined;
  }

  /** Called only by an audited native roster, with a fresh per-ship lifetime. */
  public static fromRoster(ship: Ship, ships: readonly Ship[], workerOwned = false): FireControlQueryBatch {
    return new FireControlQueryBatch(ship, ships, workerOwned);
  }

  public forShip(ship: Ship, ships: readonly Ship[]): FireControlQueryBatch | undefined {
    return this.active && ship === this.shooter && ships === this.ships && ships.length === this.length ? this : undefined;
  }

  /** The fire ledger and aim world take separate arrays from engine.ships.
   * Audit their identities/order once within this native read-only transaction;
   * never require array identity, and never accept a genuinely different roster. */
  public forInFlightBudget(ship: Ship, ships: readonly Ship[]): FireControlQueryBatch | undefined {
    if (!this.active || ship !== this.shooter || ships.length !== this.length || this.ships.length !== this.length) return;
    if (ships === this.ships || ships === this.flightRoster) return this;
    for (let i = 0; i < ships.length; i++) if (ships[i] !== this.ships[i]) return;
    this.flightRoster = ships;
    return this;
  }

  public targets(): readonly Ship[] {
    if (!this.targetList) {
      this.targetList = [];
      for (const other of this.ships) {
        if (this.readTarget(other, true)) this.targetList.push(other);
      }
      this.targetQualification?.register(this.targetList);
    }
    return this.targetList;
  }

  /** Broader than every valid old preAim candidate; final role/range/arc/trace
   * checks and original roster ordering are still performed by the controller. */
  public preAimTargets(query: { origin: Vector2; range: number; speed: number; delay: number }, mount: WeaponMount): readonly Ship[] {
    if (!this.active) return this.ships;
    const targets = this.targets();
    if (!this.workerOwned || targets.length < 16 || ++this.preAimQueries <= 1) return targets;
    this.preAimIndex ??= new PreAimRangeIndex(targets);
    const targetsInRange = this.preAimIndex.query(query.origin, this.shooter.vel, query.range, query.speed, query.delay, !!mount.spec.isBeam);
    this.targetQualification?.register(targetsInRange);
    return targetsInRange;
  }

  public canTarget(ship: Ship): boolean {
    return this.readTarget(ship, false);
  }

  private readTarget(ship: Ship, knownPresent: boolean): boolean {
    const cached = this.targetStatus.get(ship);
    if (cached !== undefined) return cached;
    const allowed = (knownPresent || this.ships.includes(ship)) && !sameTeam(ship, this.shooter)
      && !ship.hasVastBulk && !ship.isDead && ship.isVisibleTo(this.shooter.teamId) && !ship.isCollisionless;
    this.targetStatus.set(ship, allowed);
    return allowed;
  }

  public blockers(): readonly Ship[] {
    if (!this.blockerList) {
      this.blockerList = [];
      for (const other of this.ships) {
        if (other === this.shooter || !sameTeam(other, this.shooter) || other.isDead || other.isPhased) continue;
        if (other.assemblyRoot === this.shooter.assemblyRoot && !other.spec.sourceHullTraits?.includes('do_not_fire_through')) continue;
        this.blockerList.push(other);
      }
    }
    return this.blockerList;
  }

  public queryBlockers(origin: Vector2, travel: Vector2, delay: number, time: number): readonly Ship[] {
    const blockers = this.blockers();
    if (blockers.length < 8) return blockers;
    this.blockerIndex ??= new FireControlBlockerIndex(blockers);
    return this.blockerIndex.query(origin, travel, this.shooter.vel, delay, time);
  }

  /** Existing rounds can hit ANY visible collidable hull, not just friendlies. */
  public queryFlightBlockers(origin: Vector2, velocity: Vector2, time: number): readonly Ship[] | undefined {
    // A few short-circuit scans cost less than building an index for this batch.
    if (!this.active || ++this.flightQueries <= 8) return;
    if (!this.flightBlockerList) {
      this.flightBlockerList = this.ships.filter(other => !other.isCollisionless && other.isVisibleTo(this.shooter.teamId));
    }
    if (this.flightBlockerList.length < 8) return this.flightBlockerList;
    this.flightBlockerIndex ??= new FireControlBlockerIndex(this.flightBlockerList);
    return this.flightBlockerIndex.query(origin, this.zeroTravel, velocity, 0, time);
  }

  public close(): void {
    this.active = false;
    this.targetQualification?.close();
    this.targetList = undefined;
    this.targetStatus.clear();
    this.blockerList = undefined;
    this.blockerIndex = undefined;
    this.flightBlockerList = undefined;
    this.flightRoster = undefined;
    this.flightBlockerIndex = undefined;
    this.preAimIndex = undefined;
  }
}

/** Identity/purity audit only: no team, visibility, phase or geometry is retained.
 * Owned by CombatEngine's native ship-update phase, never supplied to extension
 * callbacks or retained on an engine. The actual availability batch starts AFTER
 * each ship's motion/shield/component update and ends BEFORE its emissions. */
export class FireControlQueryRoster {
  private active = true;
  private readonly rows;
  private readonly ownedRows: OwnedFireControlReadGuard[];
  private readonly length: number;
  private constructor(private readonly ships: readonly Ship[], private readonly workerOwned = false) {
    this.length = ships.length;
    this.ownedRows = workerOwned ? ships.map(ship => new OwnedFireControlReadGuard(ship)) : [];
    this.rows = workerOwned ? [] : ships.map(ship => ({ ship, spec: ship.spec, shield: ship.shield, flux: ship.flux,
      system: ship.system, defense: ship.defenseSystem, armor: ship.armor,
      control: ship.weaponControl, damage: ship.armor.damageTakenModifiers, effective: ship.armor.dynamicEffectiveArmorMultiplier,
      cell: ship.armor.onCellDamage, overload: ship.flux.onOverloadStarted }));
  }
  /** Internal ownership contract, not a sandbox against same-realm monkeypatches.
   * Call ONLY where structured-clone commands are the sole input and no mutable
   * engine/ship/component references escape. Revisit before adding Worker plugins. */
  public static ownForWorker(engine: CombatEngine): void { workerOwnedEngines.add(engine); }
  /** Same closed Worker boundary may admit other native phase-local read indexes. */
  public static isWorkerOwned(engine: CombatEngine): boolean { return workerOwnedEngines.has(engine); }

  public static create(ships: readonly Ship[], engine?: CombatEngine): FireControlQueryRoster | undefined {
    if (ships.length < FIRE_CONTROL_QUERY_MIN_SHIPS) return;
    if (engine && workerOwnedEngines.has(engine)) return new FireControlQueryRoster(ships, true);
    if (!nativeFireControlPrototypes() || !ships.every(hasNativeFireControlReaders)) return;
    return new FireControlQueryRoster(ships);
  }
  public matches(ships: readonly Ship[]): boolean {
    return this.active && ships === this.ships && ships.length === this.length;
  }
  public begin(ship: Ship, world: FireControlWorld): FireControlQueryBatch | undefined {
    // Native updates can install external effects or replace a component/definition.
    // These cheap live invalidators never turn a previous rejection into permission.
    if (!this.matches(world.ships) || !this.ships.includes(ship)) return;
    const budget = world.fireBudget;
    if (budget && (Object.getPrototypeOf(budget) !== InFlightFireBudget.prototype
      || budget.estimate !== budgetEstimate || budget.penalty !== budgetPenalty)) return;
    if (this.workerOwned) {
      // Refresh AFTER this ship's motion/systems/repairs, not at tick start.
      // Native fields/specs have no caller getters in the private Worker. Live
      // extension/effect gates still run; no dynamic target state survives close.
      for (let i = 0; i < this.ships.length; i++) {
        let guard = this.ownedRows[i];
        // Same-length roster replacement/reordering must not reuse another ship's
        // constructor callbacks. All dynamic invalidators remain live on the row.
        if (guard.ship !== this.ships[i]) this.ownedRows[i] = guard = new OwnedFireControlReadGuard(this.ships[i]);
        if (!guard.allows()) return;
      }
      return FireControlQueryBatch.fromRoster(ship, this.ships, true);
    }
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i], s = this.ships[i];
      if (s !== row.ship || s.spec !== row.spec || s.shield !== row.shield || s.flux !== row.flux
        || s.weaponControl !== row.control || s.system !== row.system || s.defenseSystem !== row.defense || s.armor !== row.armor
        || s.armor.damageTakenModifiers !== row.damage || s.armor.dynamicEffectiveArmorMultiplier !== row.effective
        || s.armor.onCellDamage !== row.cell || s.flux.onOverloadStarted !== row.overload
        || s.system.auxiliary !== s.defenseSystem || s.defenseSystem.auxiliary || s.hullDamageInterceptors.size > 0
        || !s.hasNativeThreatPhaseHooks || !s.runtimeModifiers.empty || s.parentShip || s.sourceCarrier || s.systems.length > 1) return;
    }
    return FireControlQueryBatch.fromRoster(ship, this.ships);
  }
  public close(): void { this.active = false; }
}
