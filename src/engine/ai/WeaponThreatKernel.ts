import { signedAngle } from '../math/Angles';

// Numeric stage data only. These buffers never contain Ship objects or callbacks.
export const SOURCE_WIDTH = 11;
export const MOUNT_WIDTH = 16;
export const OBSERVER_WIDTH = 8;
export const enum SourceField { X, Y, VX, VY, Facing, Speed, TurnRate, Recovery, FirstMount, MountCount, Reach }
export const enum MountField { X, Y, Range, Speed, Readiness, Base, HalfArc, Angle, TurnRate, Damage, Dps, Beam, BeamDuration, FreeAim, Extent, Source }
export const enum ObserverField { X, Y, VX, VY, Radius, Team, Horizon, DefenseWindow }

export interface WeaponThreatPacket {
  sources: Float64Array;
  mounts: Float64Array;
  observers: Float64Array;
  /** Source-major visibility against each observer team, evaluated once at capture. */
  visible: Uint8Array;
  teamCount: number;
  /** Captured physical-family grouping, only a conservative candidate relation.
   * Workers/standalone packets may omit it and keep the complete exact kernel. */
  observerGroups?: Uint32Array;
}
export interface WeaponThreatCandidates {
  /** Source IDs and their mount spans in ORIGINAL iteration order. */
  sources: Uint32Array;
  offsets: Uint32Array;
  mounts: Uint32Array;
}
export const weaponThreatKernelWork = { fullCalls: 0, candidateCalls: 0, sourceVisits: 0, mountVisits: 0, angleEvaluations: 0 };
export type WeaponThreatRows = Array<[observer: number, rows: Float64Array]>;

/** Output pairs are (mount index, ETA). Damage/type/origin remain shared stage data.
 * Work is partitioned by observer; there are no shared writes or game-side effects. */
export function forecastWeaponThreats(packet: WeaponThreatPacket, observer: number, horizon?: number): Float64Array {
  weaponThreatKernelWork.fullCalls++;
  return forecastWeaponRows(packet, observer, horizon);
}
/** Internal producer contract: candidates must conservatively cover this captured
 * observer/horizon. Does not confer Ship/world read or mutation permissions. */
export function forecastPreparedWeaponThreats(packet: WeaponThreatPacket, observer: number, candidates: WeaponThreatCandidates, horizon?: number): Float64Array {
  weaponThreatKernelWork.candidateCalls++;
  return forecastWeaponRows(packet, observer, horizon, candidates);
}
function forecastWeaponRows(packet: WeaponThreatPacket, observer: number, horizon?: number, candidates?: WeaponThreatCandidates): Float64Array {
  const { sources, mounts, observers, visible, teamCount } = packet;
  const o = observer * OBSERVER_WIDTH;
  const x = observers[o + ObserverField.X], y = observers[o + ObserverField.Y];
  const vx = observers[o + ObserverField.VX], vy = observers[o + ObserverField.VY];
  const radius = observers[o + ObserverField.Radius], team = observers[o + ObserverField.Team];
  horizon ??= observers[o + ObserverField.Horizon];
  const rows: number[] = [];
  const sourceCount = candidates ? candidates.sources.length : sources.length / SOURCE_WIDTH;
  for (let sourceIndex = 0; sourceIndex < sourceCount; sourceIndex++) {
    const s = (candidates ? candidates.sources[sourceIndex] : sourceIndex) * SOURCE_WIDTH;
    weaponThreatKernelWork.sourceVisits++;
    if (!visible[s / SOURCE_WIDTH * teamCount + team]) continue;
    const recovery = sources[s + SourceField.Recovery];
    if (recovery > horizon) continue;
    const speed = sources[s + SourceField.Speed], dvx = sources[s + SourceField.VX] - vx, dvy = sources[s + SourceField.VY] - vy;
    const approachReach = radius + horizon * Math.max(1, speed + Math.abs(dvx) + Math.abs(dvy));
    const distanceFromOrigin = Math.max(Math.abs(x - sources[s + SourceField.X]), Math.abs(y - sources[s + SourceField.Y]));
    const reach = approachReach + sources[s + SourceField.Reach];
    if (Number.isFinite(reach) && distanceFromOrigin > reach + 1e-6 * Math.max(1, Math.abs(x), Math.abs(y), Math.abs(reach))) continue;
    const first = candidates ? candidates.offsets[sourceIndex] : sources[s + SourceField.FirstMount];
    const end = candidates ? candidates.offsets[sourceIndex + 1] : first + sources[s + SourceField.MountCount];
    for (let cursor = first; cursor < end; cursor++) {
      const index = candidates ? candidates.mounts[cursor] : cursor;
      weaponThreatKernelWork.mountVisits++;
      const m = index * MOUNT_WIDTH, range = mounts[m + MountField.Range];
      const mountReach = approachReach + range + mounts[m + MountField.Extent];
      if (Number.isFinite(mountReach) && distanceFromOrigin > mountReach + 1e-6 * Math.max(1, Math.abs(x), Math.abs(y), Math.abs(mountReach))) continue;
      const dx = x - mounts[m + MountField.X], dy = y - mounts[m + MountField.Y];
      const distance = Math.hypot(dx, dy);
      const unitX = distance > .00001 ? dx / distance : dx, unitY = distance > .00001 ? dy / distance : dy;
      const closing = Math.max(0, dvx * unitX + dvy * unitY);
      const approachTime = Math.max(0, distance - radius - range) / Math.max(1, speed + closing);
      const travel = mounts[m + MountField.Beam] ? 0 : Math.max(0, Math.min(range, distance - radius)) / Math.max(1, mounts[m + MountField.Speed]);
      const readiness = mounts[m + MountField.Readiness];
      if (Math.max(recovery, readiness, approachTime) + travel > horizon) continue;
      weaponThreatKernelWork.angleEvaluations++;
      const heading = Math.atan2(dy, dx), halfArc = mounts[m + MountField.HalfArc];
      const hullTurn = Math.max(0, Math.abs(signedAngle(heading - mounts[m + MountField.Base])) - halfArc
        - Math.asin(Math.min(1, radius / Math.max(1, distance)))) / Math.max(.001, sources[s + SourceField.TurnRate]);
      const turretTurn = halfArc > 0 ? Math.abs(signedAngle(heading - mounts[m + MountField.Angle])) / Math.max(.001, mounts[m + MountField.TurnRate]) : 0;
      const turn = mounts[m + MountField.FreeAim] ? 0 : Math.max(hullTurn, turretTurn);
      const eta = Math.max(recovery, readiness, turn, approachTime) + travel;
      if (eta >= 0 && eta <= horizon) rows.push(index, eta);
    }
  }
  return new Float64Array(rows);
}

export function forecastWeaponPartition(packet: WeaponThreatPacket, indices: readonly number[]): WeaponThreatRows {
  return indices.map(index => [index, forecastWeaponThreats(packet, index)]);
}
