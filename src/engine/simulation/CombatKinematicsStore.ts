import { Ship, hasNumericMotionBoundary } from './Ship';
import { shipMotionStats } from './systems/ShipMotion';
import { advanceMotionRow, MOTION_WIDTH, MotionField as F, MotionFlag as Flag } from './systems/MotionKernel';

export interface PoseHandle { readonly slot: number; readonly generation: number }
/** A lease never follows a new capture, buffer growth or a recycled entity slot. */
export class KinematicsObservation {
  private active = true;
  constructor(private readonly store: CombatKinematicsStore, private readonly epoch: number) {}
  private check(): void { if (!this.active || !this.store.ownsObservation(this.epoch)) throw new Error('Expired kinematics observation'); }
  row(ship: Ship): number | undefined { this.check(); return this.store.offset(ship); }
  read(offset: number): number { this.check(); return this.store.read(offset); }
  readHandle(handle: PoseHandle, field: F): number {
    this.check();
    if (!Number.isInteger(field) || field < 0 || field >= MOTION_WIDTH) throw new Error('Invalid kinematics field');
    if (!this.store.hasHandle(handle)) throw new Error('Recycled kinematics slot');
    return this.store.read(handle.slot * MOTION_WIDTH + field);
  }
  close(): void {
    if (this.active) { this.active = false; this.store.closeObservation(this.epoch); }
  }
}

/** Resident slots, grown geometrically and reused across steps. The table owns
 * computed poses during motion. Object rules own pose after commit; the next
 * capture imports teleport/recoil/collision changes. Not a second world clock. */
export class CombatKinematicsStore {
  private values = new Float64Array(0);
  private generations: number[] = [];
  private readonly rows = new Map<Ship, number>();
  private readonly free: number[] = [];
  private readonly jobs: number[] = [];
  private readonly members = new Set<Ship>();
  private readonly occupants: (Ship | undefined)[] = [];
  private stage: 'idle' | 'motion-input' | 'motion-results' | 'observation' = 'idle';
  private epoch = 0;
  get capacity(): number { return this.values.length / MOTION_WIDTH; }
  get entityCount(): number { return this.rows.size; }
  get bufferBytes(): number { return this.values.byteLength; }
  get queuedCount(): number { return this.jobs.length; }
  offset(ship: Ship): number | undefined { const slot = this.rows.get(ship); return slot === undefined ? undefined : slot * MOTION_WIDTH; }
  handle(ship: Ship): PoseHandle | undefined { const slot = this.rows.get(ship); return slot === undefined ? undefined : { slot, generation: this.generations[slot] }; }
  hasHandle(handle: PoseHandle): boolean {
    return Number.isInteger(handle.slot) && handle.slot >= 0 && Number.isInteger(handle.generation)
      && this.occupants[handle.slot] !== undefined && this.generations[handle.slot] === handle.generation;
  }
  read(offset: number): number {
    if (!Number.isInteger(offset) || offset < 0 || this.occupants[Math.floor(offset / MOTION_WIDTH)] === undefined)
      throw new Error('Invalid kinematics offset');
    return this.values[offset];
  }
  ownsObservation(epoch: number): boolean { return this.stage === 'observation' && this.epoch === epoch; }
  closeObservation(epoch: number): void { if (this.ownsObservation(epoch)) this.stage = 'idle'; }

  private capture(ships: readonly Ship[]): void {
    if (this.stage !== 'idle') throw new Error('Kinematics stage overlap');
    this.members.clear();
    for (const ship of ships) {
      if (this.members.has(ship)) { this.members.clear(); throw new Error('Duplicate kinematics entity'); }
      this.members.add(ship);
    }
    for (const [ship, slot] of this.rows) if (!this.members.has(ship)) {
      this.rows.delete(ship);
      this.free.push(slot);
      this.generations[slot]++;
      this.occupants[slot] = undefined;
    }
    this.members.clear();
    for (const ship of ships) {
      let slot = this.rows.get(ship);
      if (slot === undefined) {
        slot = this.free.pop() ?? this.generations.length;
        if (slot === this.generations.length) this.generations.push(1);
        if (slot >= this.capacity) {
          const next = new Float64Array(Math.max(32, this.capacity * 2, slot + 1) * MOTION_WIDTH);
          next.set(this.values);
          this.values = next;
        }
        this.rows.set(ship, slot);
        this.occupants[slot] = ship;
      }
      const row = slot * MOTION_WIDTH;
      this.values[row + F.X] = ship.pos.x;
      this.values[row + F.Y] = ship.pos.y;
      this.values[row + F.VelocityX] = ship.vel.x;
      this.values[row + F.VelocityY] = ship.vel.y;
      this.values[row + F.Facing] = ship.facingRad;
      this.values[row + F.AngularVelocity] = ship.angularVelRad;
    }
    this.epoch++;
  }
  observe(ships: readonly Ship[]): KinematicsObservation {
    this.capture(ships);
    this.stage = 'observation';
    return new KinematicsObservation(this, this.epoch);
  }
  beginMotion(ships: readonly Ship[]): void {
    this.capture(ships);
    this.stage = 'motion-input';
    this.jobs.length = 0;
    for (const ship of ships) this.values[this.offset(ship)! + F.CommitState] = 0;
  }
  queue(ship: Ship, dt: number): boolean {
    if (this.stage !== 'motion-input') throw new Error('Motion capture outside input stage');
    if (!hasNumericMotionBoundary(ship) || !(dt > 0)) return false;
    const offset = this.offset(ship);
    if (offset === undefined || this.values[offset + F.CommitState] !== 0) throw new Error('Missing or duplicate numeric motion');
    let flags = 0;
    if (ship.engineController.isFlamedOut) flags |= Flag.FlamedOut;
    else {
      const stats = shipMotionStats(ship);
      this.values[offset + F.Acceleration] = stats.acceleration;
      this.values[offset + F.Deceleration] = stats.deceleration;
      this.values[offset + F.MaxSpeed] = stats.maxSpeed;
      this.values[offset + F.TurnAcceleration] = stats.turnAcceleration;
      this.values[offset + F.MaxTurnRate] = stats.maxTurnRate;
      this.values[offset + F.DriftAcceleration] = stats.driftAcceleration;
      this.values[offset + F.StrafeMultiplier] = stats.strafeMultiplier;
      if (ship.system.forcesForward) flags |= Flag.ForceForward;
      if (ship.system.locksTurning || ship.flux.isOverloaded) flags |= Flag.LockedTurning;
      if (ship.hullStats.forcedRightTurn > 0) flags |= Flag.ForcedRightTurn;
      if (ship.system.forcesBraking) flags |= Flag.ForceBraking;
      if (ship.system.blocksAcceleration) flags |= Flag.BlockAcceleration;
      if (ship.system.blocksStrafing) flags |= Flag.BlockStrafing;
      if (ship.spec.hullSize === 'FIGHTER') flags |= Flag.Fighter;
    }
    this.values[offset + F.Dt] = dt;
    this.values[offset + F.Turn] = ship.turnInput;
    this.values[offset + F.Brake] = Number(ship.brakeInput);
    this.values[offset + F.Throttle] = ship.throttle;
    this.values[offset + F.Strafe] = ship.strafeInput;
    this.values[offset + F.Flags] = flags;
    this.values[offset + F.CommitState] = 1;
    this.jobs.push(offset);
    return true;
  }
  solve(): void {
    if (this.stage !== 'motion-input') throw new Error('Motion solver outside input stage');
    for (const offset of this.jobs) advanceMotionRow(this.values, offset);
    this.stage = 'motion-results';
  }
  commit(ship: Ship): { accelerating: boolean; spreading: boolean } | undefined {
    if (this.stage !== 'motion-results') throw new Error('Motion commit before solve');
    const offset = this.offset(ship);
    if (offset === undefined || this.values[offset + F.CommitState] === 0) return;
    if (this.values[offset + F.CommitState] === 2) throw new Error('Numeric motion already committed');
    this.values[offset + F.CommitState] = 2;
    ship.pos.set(this.values[offset + F.X], this.values[offset + F.Y]);
    ship.vel.set(this.values[offset + F.VelocityX], this.values[offset + F.VelocityY]);
    ship.facingRad = this.values[offset + F.Facing];
    ship.angularVelRad = this.values[offset + F.AngularVelocity];
    return { accelerating: !!this.values[offset + F.Accelerating], spreading: !!this.values[offset + F.Spreading] };
  }
  closeMotion(): void {
    if (this.stage === 'motion-input' || this.stage === 'motion-results') {
      this.stage = 'idle';
      this.jobs.length = 0;
    }
  }
}
const worldStores = new WeakMap<object, CombatKinematicsStore>();
export function kinematicsForWorld(owner: object): CombatKinematicsStore {
  let store = worldStores.get(owner);
  if (!store) { store = new CombatKinematicsStore(); worldStores.set(owner, store); }
  return store;
}
