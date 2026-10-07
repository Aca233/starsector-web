import { Ship, hasNativeMotionBoundary, hasNumericMotionBoundary, hasNativeStateCoreReaders, nativeFireControlPrototypes } from './Ship';
import type { WeaponMount } from './Weapon';
import { OwnedCombatNumbers, type NumberBinding } from './OwnedCombatNumbers';
import { advanceMotionRow, MotionField as F, MotionFlag as Flag } from './systems/MotionKernel';
import { shipMotionStats } from './systems/ShipMotion';

// The first 22 fields are the kernel layout; the rest remain owned between ticks.
export enum CoreField {
  PrevX = 22, PrevY, PrevFacing, HullHp, Dead, Retreated, SoftFlux, HardFlux,
  Overloaded, OverloadTimer, OverloadDuration, Venting, VentProgress, ZeroFluxTimer,
  EngineBoost, TimeSinceFluxIncrease
}
const WIDTH = CoreField.TimeSinceFluxIncrease + 1;
const shipFields: readonly NumberBinding[] = [['facingRad',F.Facing],['angularVelRad',F.AngularVelocity],
  ['prevFacingRad',CoreField.PrevFacing],['hullHp',CoreField.HullHp],['isDead',CoreField.Dead,true],['isRetreated',CoreField.Retreated,true]];
const fluxFields: readonly NumberBinding[] = [['softFlux',CoreField.SoftFlux],['hardFlux',CoreField.HardFlux],
  ['isOverloaded',CoreField.Overloaded,true],['overloadTimer',CoreField.OverloadTimer],['overloadDuration',CoreField.OverloadDuration],
  ['isVenting',CoreField.Venting,true],['ventProgress',CoreField.VentProgress],['zeroFluxTimer',CoreField.ZeroFluxTimer],
  ['isEngineBoostActive',CoreField.EngineBoost,true],['timeSinceFluxIncrease',CoreField.TimeSinceFluxIncrease]];
const positionFields: readonly NumberBinding[] = [['x',F.X],['y',F.Y]];
const velocityFields: readonly NumberBinding[] = [['x',F.VelocityX],['y',F.VelocityY]];
const previousFields: readonly NumberBinding[] = [['x',CoreField.PrevX],['y',CoreField.PrevY]];
const weaponKeys = ['currentAngleRad','cooldownTimer','burstRemaining','burstTimer','firingStateTimer',
  'firingCycleId','ammo','ammoRechargeProgress','recoil','glowAlpha','barrelIndex','currentSpreadDeg',
  'health','maxHealth','disabledTimer','disabledDuration'] as const;
const weaponFields: readonly NumberBinding[] = weaponKeys.map((key, field) => [key,field]);
export interface CoreHandle { readonly slot: number; readonly generation: number }
interface Entity {
  slot: number; pos: Ship['pos']; vel: Ship['vel']; previous: Ship['prevPos']; flux: Ship['flux'];
  weapons: { weapon: WeaponMount; slot: number }[];
}
/** Sole owner of admitted numerical state. Existing rule/effect methods are
 * adapters writing these same arrays; there is no capture/commit pose copy. */
export class CombatStateCore {
  private readonly numbers = new OwnedCombatNumbers(WIDTH);
  private readonly mounts = new OwnedCombatNumbers(weaponKeys.length);
  private readonly entities = new Map<Ship, Entity>();
  private observation = false;
  private disposed = false;
  private revision = 0;
  readonly counters = { admissions: 0, detachments: 0, motionSteps: 0, fallbacks: 0, collisionPairs: 0, collisionCandidates: 0, collisionResponses: 0 };
  get entityCount(): number { return this.entities.size; }
  get capacity(): number { return this.numbers.capacity; }
  get byteLength(): number { return this.numbers.values.byteLength + this.mounts.values.byteLength; }
  handle(ship: Ship): CoreHandle | undefined {
    const e = this.entities.get(ship);
    return e ? {slot:e.slot,generation:this.numbers.generation(e.slot)} : undefined;
  }
  read(handle: CoreHandle, field: F | CoreField): number {
    if (this.disposed || !Number.isInteger(handle.slot) || !Number.isInteger(field) || field < 0 || field >= WIDTH
      || ![...this.entities.values()].some(e => e.slot === handle.slot)
      || this.numbers.generation(handle.slot) !== handle.generation) throw new Error('Expired combat core handle');
    return this.numbers.values[handle.slot * WIDTH + field];
  }
  private intact(ship: Ship, e: Entity): boolean {
    return ship.pos === e.pos && ship.vel === e.vel && ship.prevPos === e.previous && ship.flux === e.flux
      && this.numbers.intact(e.slot) && ship.weapons.length === e.weapons.length
      && e.weapons.every((m,i) => ship.weapons[i] === m.weapon && this.mounts.intact(m.slot));
  }
  private detach(ship: Ship, e: Entity): void {
    this.numbers.release(e.slot);
    for (const m of e.weapons) this.mounts.release(m.slot);
    this.entities.delete(ship); this.counters.detachments++;
  }
  /** Reconcile identities/descriptors, NOT import values. Unknown whole updates
   * can write another entity, so one unsafe entity returns the whole roster to
   * its ordered object contract before movement. */
  reconcile(ships: readonly Ship[]): boolean {
    if (this.disposed || this.observation) throw new Error('Combat core reconciliation outside write boundary');
    const members = new Set(ships);
    if (members.size !== ships.length) throw new Error('Duplicate combat core entity');
    const safeReaders = nativeFireControlPrototypes() && ships.every(hasNativeStateCoreReaders);
    if (!safeReaders) {
      this.clear(); this.counters.fallbacks++; this.revision++; return false;
    }
    for (const [ship,e] of this.entities) if (!members.has(ship) || !this.intact(ship,e)) this.detach(ship,e);
    const safe = ships.every(ship => hasNativeMotionBoundary(ship) && ship.update === Ship.prototype.update);
    if (!safe) {
      for (const [ship,e] of this.entities) this.detach(ship,e);
      this.counters.fallbacks++; this.revision++; return false;
    }
    // Atomic admission: nothing is attached unless every new row is safe.
    const incoming = ships.filter(ship => !this.entities.has(ship));
    const weaponObjects = new Set<object>();
    const vectors = new Set<object>();
    const fluxObjects = new Set<object>();
    for (const ship of ships) {
      if (fluxObjects.has(ship.flux)) { this.clear(); this.counters.fallbacks++; return false; }
      fluxObjects.add(ship.flux);
      for (const object of [ship.pos,ship.vel,ship.prevPos]) {
        if (vectors.has(object)) { this.clear(); this.counters.fallbacks++; return false; }
        vectors.add(object);
      }
      for (const weapon of ship.weapons) {
        if (weaponObjects.has(weapon)) { this.clear(); this.counters.fallbacks++; return false; }
        weaponObjects.add(weapon);
      }
    }
    if (incoming.some(ship => !this.numbers.canAttach(ship,shipFields) || !this.numbers.canAttach(ship.flux,fluxFields)
      || !this.numbers.canAttach(ship.pos,positionFields) || !this.numbers.canAttach(ship.vel,velocityFields)
      || !this.numbers.canAttach(ship.prevPos,previousFields) || ship.weapons.some(w => !this.mounts.canAttach(w,weaponFields)))) {
      this.clear(); this.counters.fallbacks++; return false;
    }
    for (const ship of incoming) {
      const slot = this.numbers.allocate();
      this.numbers.attach(slot,ship,shipFields); this.numbers.attach(slot,ship.flux,fluxFields);
      this.numbers.attach(slot,ship.pos,positionFields); this.numbers.attach(slot,ship.vel,velocityFields);
      this.numbers.attach(slot,ship.prevPos,previousFields);
      const weapons = ship.weapons.map(weapon => {
        const weaponSlot = this.mounts.allocate(); this.mounts.attach(weaponSlot,weapon,weaponFields);
        return {weapon,slot:weaponSlot};
      });
      this.entities.set(ship,{slot,pos:ship.pos,vel:ship.vel,previous:ship.prevPos,flux:ship.flux,weapons});
      this.counters.admissions++;
    }
    this.revision++; return true;
  }
  move(ship: Ship, dt: number): { accelerating: boolean; spreading: boolean } | undefined {
    if (this.observation) throw new Error('Motion during combat core observation');
    const e = this.entities.get(ship);
    if (!e || !hasNumericMotionBoundary(ship) || !(dt > 0)) return;
    const a = this.numbers.values, row = e.slot * WIDTH;
    let flags = 0;
    if (ship.engineController.isFlamedOut) flags |= Flag.FlamedOut;
    else {
      const s = shipMotionStats(ship);
      a[row+F.Acceleration]=s.acceleration; a[row+F.Deceleration]=s.deceleration;
      a[row+F.MaxSpeed]=s.maxSpeed; a[row+F.TurnAcceleration]=s.turnAcceleration;
      a[row+F.MaxTurnRate]=s.maxTurnRate; a[row+F.DriftAcceleration]=s.driftAcceleration;
      a[row+F.StrafeMultiplier]=s.strafeMultiplier;
      if (ship.system.forcesForward) flags |= Flag.ForceForward;
      if (ship.system.locksTurning || ship.flux.isOverloaded) flags |= Flag.LockedTurning;
      if (ship.hullStats.forcedRightTurn > 0) flags |= Flag.ForcedRightTurn;
      if (ship.system.forcesBraking) flags |= Flag.ForceBraking;
      if (ship.system.blocksAcceleration) flags |= Flag.BlockAcceleration;
      if (ship.system.blocksStrafing) flags |= Flag.BlockStrafing;
      if (ship.spec.hullSize === 'FIGHTER') flags |= Flag.Fighter;
    }
    a[row+F.Dt]=dt; a[row+F.Turn]=ship.turnInput; a[row+F.Brake]=Number(ship.brakeInput);
    a[row+F.Throttle]=ship.throttle; a[row+F.Strafe]=ship.strafeInput; a[row+F.Flags]=flags;
    advanceMotionRow(a,row); this.counters.motionSteps++;
    return {accelerating:!!a[row+F.Accelerating],spreading:!!a[row+F.Spreading]};
  }
  /** Coordinates for the live spatial index / wire encoder, no object pose reads. */
  pose(ship: Ship): readonly number[] | undefined {
    const e = this.entities.get(ship);
    if (!e || ship.pos !== e.pos || ship.vel !== e.vel || !this.numbers.intact(e.slot)) return;
    const a=this.numbers.values, row=e.slot*WIDTH;
    return [a[row+F.X],a[row+F.Y],a[row+F.VelocityX],a[row+F.VelocityY],a[row+F.Facing],a[row+F.AngularVelocity],
      a[row+CoreField.Dead],a[row+CoreField.Retreated]];
  }
  observe(ships: readonly Ship[]): { row(ship: Ship): number | undefined; read(offset: number): number; close(): void } | undefined {
    if (this.observation) throw new Error('Overlapping combat core observations');
    if (!ships.every(ship => this.entities.has(ship))) return;
    this.observation=true; this.numbers.poseReadOnly=true;
    const members=new Set(ships), slots=new Set(ships.map(ship=>this.entities.get(ship)!.slot)), revision=this.revision;
    let active=true;
    const check=()=> { if (!active || this.disposed || revision!==this.revision) throw new Error('Closed combat core observation'); };
    return {
      row: ship => {check();const e=this.entities.get(ship);return members.has(ship) && e ? e.slot*WIDTH : undefined;},
      read: offset => {check();if (!Number.isInteger(offset) || offset<0 || offset>=this.numbers.values.length || !slots.has(Math.floor(offset/WIDTH)) || offset%WIDTH>=6) throw new Error('Invalid combat core offset');return this.numbers.values[offset];},
      close:()=> {if (active) {active=false;this.observation=false;this.numbers.poseReadOnly=false;}}
    };
  }
  recordCollisions(counts: {possiblePairs:number;candidates:number;responses:number}): void {
    this.counters.collisionPairs+=counts.possiblePairs;
    this.counters.collisionCandidates+=counts.candidates;
    this.counters.collisionResponses+=counts.responses;
  }
  private clear(): void { for (const [ship,e] of this.entities) this.detach(ship,e); }
  dispose(): void {
    if (this.observation) throw new Error('Cannot dispose observed combat core');
    this.clear(); this.disposed=true; this.revision++;
  }
}
const worlds = new WeakMap<object, CombatStateCore>();
export function stateCoreForWorld(owner: object): CombatStateCore {
  let core=worlds.get(owner);
  if (!core) {core=new CombatStateCore();worlds.set(owner,core);}
  return core;
}
export function existingStateCore(owner: object): CombatStateCore | undefined { return worlds.get(owner); }
export function disposeStateCore(owner: object): void { worlds.get(owner)?.dispose();worlds.delete(owner); }
