import { FireControlBlockerIndex } from './FireControlBlockerIndex';
import { Vector2 } from '../math/Vector2';
import { hasNativeFireControlReaders, nativeFireControlPrototypes, type Ship } from '../simulation/Ship';
import { sameTeam } from '../simulation/CombatTeams';
import { InFlightFireBudget } from './InFlightFireBudget';
import type { FireControlWorld } from './AutofireController';

// Metadata qualification is not amortized in smaller battles; keep their original path.
export const FIRE_CONTROL_QUERY_MIN_SHIPS = 100;

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
  private constructor(private readonly shooter: Ship, private readonly ships: readonly Ship[]) {
    this.length = ships.length;
  }

  public static create(ship: Ship, world: FireControlWorld): FireControlQueryBatch | undefined {
    if (world.queryRoster?.matches(world.ships)) return world.queryRoster.begin(ship, world);
    return undefined;
  }

  /** Called only by an audited native roster, with a fresh per-ship lifetime. */
  public static fromRoster(ship: Ship, ships: readonly Ship[]): FireControlQueryBatch {
    return new FireControlQueryBatch(ship, ships);
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

    }
    return this.targetList;
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
    this.targetList = undefined;
    this.targetStatus.clear();
    this.blockerList = undefined;
    this.blockerIndex = undefined;
    this.flightBlockerList = undefined;
    this.flightRoster = undefined;
    this.flightBlockerIndex = undefined;
  }
}

/** Identity/purity audit only: no team, visibility, phase or geometry is retained.
 * Owned by CombatEngine's native ship-update phase, never supplied to extension
 * callbacks or retained on an engine. The actual availability batch starts AFTER
 * each ship's motion/shield/component update and ends BEFORE its emissions. */
export class FireControlQueryRoster {
  private active = true;
  private readonly rows;
  private constructor(private readonly ships: readonly Ship[]) {
    this.rows = ships.map(ship => ({ ship, spec: ship.spec, shield: ship.shield, flux: ship.flux,
      system: ship.system, defense: ship.defenseSystem, armor: ship.armor,
      control: ship.weaponControl, damage: ship.armor.damageTakenModifiers, effective: ship.armor.dynamicEffectiveArmorMultiplier,
      cell: ship.armor.onCellDamage, overload: ship.flux.onOverloadStarted }));
  }
  public static create(ships: readonly Ship[]): FireControlQueryRoster | undefined {
    if (ships.length < FIRE_CONTROL_QUERY_MIN_SHIPS || !nativeFireControlPrototypes() || !ships.every(hasNativeFireControlReaders)) return;
    return new FireControlQueryRoster(ships);
  }
  public matches(ships: readonly Ship[]): boolean {
    return this.active && ships === this.ships && ships.length === this.rows.length;
  }
  public begin(ship: Ship, world: FireControlWorld): FireControlQueryBatch | undefined {
    // Native updates can install external effects or replace a component/definition.
    // These cheap live invalidators never turn a previous rejection into permission.
    if (!this.matches(world.ships) || !this.ships.includes(ship)) return;
    const budget = world.fireBudget;
    if (budget && (Object.getPrototypeOf(budget) !== InFlightFireBudget.prototype
      || budget.estimate !== budgetEstimate || budget.penalty !== budgetPenalty)) return;
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
