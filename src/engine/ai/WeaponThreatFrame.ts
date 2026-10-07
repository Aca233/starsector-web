import { WeaponThreatCandidateFrame, captureWeaponObserverGroups } from './WeaponThreatCandidates';
import type { DamageType } from '../simulation/ArmorGrid';
import type { Ship } from '../simulation/Ship';
import { Vector2 } from '../math/Vector2';
import { tacticalPolicy } from './TacticalWorld';
import { weaponMuzzle, weaponMuzzleExtent } from './FireControlGeometry';
import { weaponDps, weaponRange } from './ShipCombatProfile';
import { forecastWeaponThreats, forecastPreparedWeaponThreats, MOUNT_WIDTH, OBSERVER_WIDTH,
  MountField as M, ObserverField as O, type WeaponThreatPacket, type WeaponThreatRows } from './WeaponThreatKernel';

/** One AI-stage observation, including authored systems and module ships. Capture
 * invokes real readers once. Consumers never revalidate/re-read each source.
 * This deliberately changes intra-step observation timing, not damage or firing. */
export class WeaponThreatFrame {
  readonly packet: WeaponThreatPacket;
  readonly sourceIds: string[] = [];
  readonly slotIds: string[] = [];
  readonly damageTypes: DamageType[] = [];
  private readonly indices = new Map<Ship, number>();
  private readonly results = new Map<number, Float64Array>();
  private candidates?: WeaponThreatCandidateFrame;
  private candidatesPrepared = false;
  get observerCount(): number { return this.indices.size; }
  get mountCount(): number { return this.slotIds.length; }
  constructor(ships: readonly Ship[], observers: readonly Ship[]) {
    const teams = [...new Set(observers.map(ship => ship.teamId))];
    const sourceValues: number[] = [], mountValues: number[] = [], visibility: number[] = [];
    const muzzle = new Vector2();
    for (const ship of ships) {
      if (ship.isDead || ship.isRetreated || ship.isDocked) continue;
      const first = this.slotIds.length, source = this.sourceIds.length;
      let reach = -Infinity;
      const modifiers = ship.weapons.length && import.meta.env?.VITE_COMBAT_STAT_TABLE !== 'false'
        ? ship.system.readModifierTable?.(['getWeaponRangePercent']) : undefined;
      for (const mount of ship.weapons) {
        if (mount.isDisabled || mount.ammo < 1) continue;
        const dps = weaponDps(mount);
        if (!(dps > 0)) continue;
        const range = weaponRange(ship, mount, modifiers || undefined), extent = weaponMuzzleExtent(mount);
        weaponMuzzle(ship, mount, muzzle);
        const charge = mount.firingState === 'CHARGING' ? mount.firingStateTimer
          : mount.spec.isBeam ? mount.spec.beamSourceChargeupTime ?? 0 : mount.spec.chargeTime ?? 0;
        const readiness = mount.burstRemaining > 0 ? mount.burstTimer : Math.max(0, mount.cooldownTimer) + charge;
        const halfArc = mount.mountType === 'HARDPOINT' || (mount.spec.turnRateDegPerSec ?? 1) <= 0 ? 0 : mount.arcDeg * Math.PI / 360;
        mountValues.push(muzzle.x, muzzle.y, range, mount.spec.maxSpeed ?? mount.spec.projSpeed, readiness,
          ship.facingRad + mount.baseAngleDeg * Math.PI / 180, halfArc, mount.currentAngleRad,
          (mount.spec.turnRateDegPerSec ?? 30) * Math.PI / 180,
          mount.spec.damagePerShot * Math.min(mount.ammo, Math.max(1, mount.spec.burstSize ?? 1)), dps,
          Number(!!mount.spec.isBeam), mount.spec.beamDuration ?? Infinity,
          Number(!!mount.spec.isGuided && !!mount.spec.alwaysFire), extent, source);
        this.slotIds.push(mount.slotId); this.damageTypes.push(mount.spec.type);
        reach = Math.max(reach, range + extent);
      }
      if (first === this.slotIds.length) continue;
      const motion = ship.getMotionStats();
      const recovery = Math.max(ship.flux.isOverloaded ? ship.flux.overloadTimer : 0,
        ship.flux.isVenting ? ship.flux.getTimeToVent() : 0,
        ship.isPhased ? ship.shield.phaseChargeDownDuration : 0,
        ship.system.blocksWeapons ? ship.system.chargeDownDuration : 0);
      sourceValues.push(ship.pos.x, ship.pos.y, ship.vel.x, ship.vel.y, ship.facingRad, motion.maxSpeed,
        motion.maxTurnRate, recovery, first, this.slotIds.length - first, reach);
      this.sourceIds.push(ship.id);
      for (const team of teams) visibility.push(Number(ship.teamId !== team && ship.isVisibleTo(team)));
    }
    const observerValues = new Float64Array(observers.length * OBSERVER_WIDTH);
    for (let index = 0; index < observers.length; index++) {
      const ship = observers[index], center = ship.getShieldCenter(), phase = ship.shield.type === 'PHASE';
      const defenseWindow = tacticalPolicy.imminentWindow + (phase ? ship.shield.phaseChargeUpDuration : 0);
      const recovery = 2 + (phase ? ship.shield.phaseChargeDownDuration + ship.shield.phaseCooldownDuration : ship.shield.unfoldDuration);
      observerValues.set([center.x, center.y, ship.vel.x, ship.vel.y,
        Math.max(ship.spec.collisionRadius, ship.shield.type !== 'NONE' && !phase ? ship.shield.radius : 0),
        teams.indexOf(ship.teamId), Math.max(defenseWindow, ship.flux.getTimeToVent() + recovery), defenseWindow], index * OBSERVER_WIDTH);
      this.indices.set(ship, index);
    }
    this.packet = { sources: new Float64Array(sourceValues), mounts: new Float64Array(mountValues),
      observers: observerValues, visible: new Uint8Array(visibility), teamCount: teams.length };
    if (import.meta.env?.VITE_COMBAT_THREAT_RELATIONS !== 'false' && observers.length >= 8
      && this.sourceIds.length >= 16 && this.slotIds.length >= 128) {
      this.packet.observerGroups = captureWeaponObserverGroups(observers, observerValues);
    }
  }
  /** Install an entire verified partition after all workers complete. */
  install(rows: WeaponThreatRows): void {
    const next = new Map<number, Float64Array>();
    for (const [index, values] of rows) {
      if (!Number.isInteger(index) || index < 0 || index >= this.observerCount || next.has(index)
        || !(values instanceof Float64Array) || values.length % 2) throw new Error('Invalid weapon forecast partition');
      let previous = -1;
      for (let i = 0; i < values.length; i += 2) {
        if (!Number.isInteger(values[i]) || values[i] <= previous || values[i] >= this.mountCount
          || !(values[i + 1] >= 0 && values[i + 1] <= this.packet.observers[index * OBSERVER_WIDTH + O.Horizon])) throw new Error('Invalid weapon forecast row');
        previous = values[i];
      }
      next.set(index, values);
    }
    if (next.size !== this.observerCount) throw new Error('Incomplete weapon forecast stage');
    this.results.clear(); for (const [index, values] of next) this.results.set(index, values);
  }
  /** Null means the observer belongs to another stage; ordinary standalone callers stay live. */
  forShip(ship: Ship, horizon: number): Float64Array | null {
    const index = this.indices.get(ship);
    if (index === undefined || !Number.isFinite(horizon) || horizon < 0) return null;
    const capturedHorizon = this.packet.observers[index * OBSERVER_WIDTH + O.Horizon];
    if (horizon > capturedHorizon) return forecastWeaponThreats(this.packet, index, horizon);
    let rows = this.results.get(index);
    if (!rows) {
      if (!this.candidatesPrepared) {
        this.candidatesPrepared = true;
        this.candidates = WeaponThreatCandidateFrame.create(this.packet);
      }
      const candidates = this.candidates?.forObserver(index, capturedHorizon);
      rows = candidates ? forecastPreparedWeaponThreats(this.packet, index, candidates) : forecastWeaponThreats(this.packet, index);
      this.results.set(index, rows);
    }
    return rows;
  }
  sourceId(mount: number): string { return this.sourceIds[this.packet.mounts[mount * MOUNT_WIDTH + M.Source]]; }
  origin(mount: number, out: Vector2): Vector2 { return out.set(this.packet.mounts[mount * MOUNT_WIDTH + M.X], this.packet.mounts[mount * MOUNT_WIDTH + M.Y]); }
  damage(mount: number, defenseWindow: number): number {
    const m = mount * MOUNT_WIDTH, values = this.packet.mounts;
    return values[m + M.Beam] ? values[m + M.Dps] * Math.min(defenseWindow, values[m + M.BeamDuration]) : values[m + M.Damage];
  }
}
