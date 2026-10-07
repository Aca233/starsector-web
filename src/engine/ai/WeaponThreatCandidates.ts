import type { Ship } from '../simulation/Ship';
import { SOURCE_WIDTH as SW, MOUNT_WIDTH as MW, OBSERVER_WIDTH as OW,
  SourceField as S, MountField as M, ObserverField as O,
  type WeaponThreatPacket, type WeaponThreatCandidates } from './WeaponThreatKernel';

export const weaponThreatRelationWork = { frames: 0, groups: 0, observers: 0,
  preparedSources: 0, preparedMounts: 0, selectedSources: 0, selectedMounts: 0 };

/** Own data links only; no new caller getter/stat/phase reads. Grouping is only
 * a work-sharing hint: the numeric union below proves safety independently of
 * whether a root has rotation, movement, weapons, or a native AI callback. */
export function captureWeaponObserverGroups(ships: readonly Ship[], values: Float64Array): Uint32Array | undefined {
  const groups = new Map<Ship, Map<string, number>>(), result = new Uint32Array(ships.length);
  let count = 0;
  for (let i = 0; i < ships.length; i++) {
    const ship = ships[i], seen = new Set<Ship>();
    let root = ship;
    while (true) {
      if (seen.has(root)) { root = ship; break; }
      seen.add(root);
      const d = Object.getOwnPropertyDescriptor(root, 'parentShip');
      if (d && !('value' in d)) { root = ship; break; }
      if (!d?.value) break;
      if (typeof d.value !== 'object') { root = ship; break; }
      root = d.value as Ship;
    }
    // The mother hull's radius/vent horizon can dwarf its attached modules.
    // Never let that independent observer widen all sibling-module candidates.
    const cohort = values[i * OW + O.Team] + ':' + Number(root !== ship);
    let teams = groups.get(root); if (!teams) groups.set(root, teams = new Map());
    let group = teams.get(cohort); if (group === undefined) { group = count++; teams.set(cohort, group); }
    result[i] = group;
  }
  return count < ships.length ? result : undefined;
}

const rejectsReach = (gap: number, reach: number, scale: number, extent: number) => Number.isFinite(reach)
  && gap > reach + 4e-6 * Math.max(1, scale, Math.abs(reach), Math.abs(extent));

interface Bound {
  minX: number; maxX: number; minY: number; maxY: number;
  minVX: number; maxVX: number; minVY: number; maxVY: number;
  radius: number; horizon: number; team: number; scale: number; valid: boolean; members: number;
  candidates?: WeaponThreatCandidates;
}

/** One immutable numeric observation ONLY. Each physical family prepares a
 * conservative source/mount relation once; member observers still run every
 * original ETA/turn/approach formula with their own center/velocity/horizon.
 * Never caches live Ship state or a root's forecast for its attached modules. */
export class WeaponThreatCandidateFrame {
  private readonly bounds = new Map<number, Bound>();
  private readonly groups: Uint32Array;
  private readonly sources: Float64Array;
  private readonly mounts: Float64Array;
  private readonly observers: Float64Array;
  private readonly visible: Uint8Array;
  private readonly teamCount: number;
  private constructor(private readonly packet: WeaponThreatPacket) {
    this.groups = packet.observerGroups!; this.sources = packet.sources; this.mounts = packet.mounts;
    this.observers = packet.observers; this.visible = packet.visible; this.teamCount = packet.teamCount;
    for (let i = 0; i < this.groups.length; i++) {
      const o = i * OW, a = this.observers, x = a[o + O.X], y = a[o + O.Y], vx = a[o + O.VX], vy = a[o + O.VY];
      const radius = a[o + O.Radius], horizon = a[o + O.Horizon], team = a[o + O.Team];
      let bound = this.bounds.get(this.groups[i]);
      if (!bound) {
        bound = { minX: x, maxX: x, minY: y, maxY: y, minVX: vx, maxVX: vx, minVY: vy, maxVY: vy,
          radius, horizon, team, scale: 1, valid: true, members: 0 };
        this.bounds.set(this.groups[i], bound);
      }
      bound.members++;
      bound.valid &&= [x, y, vx, vy, radius, horizon, team].every(Number.isFinite)
        && horizon >= 0 && Number.isInteger(team) && team >= 0 && team < this.teamCount && team === bound.team;
      bound.minX = Math.min(bound.minX, x); bound.maxX = Math.max(bound.maxX, x);
      bound.minY = Math.min(bound.minY, y); bound.maxY = Math.max(bound.maxY, y);
      bound.minVX = Math.min(bound.minVX, vx); bound.maxVX = Math.max(bound.maxVX, vx);
      bound.minVY = Math.min(bound.minVY, vy); bound.maxVY = Math.max(bound.maxVY, vy);
      bound.radius = Math.max(bound.radius, radius); bound.horizon = Math.max(bound.horizon, horizon);
      bound.scale = Math.max(bound.scale, Math.abs(x), Math.abs(y));
    }
    weaponThreatRelationWork.frames++;
  }
  static create(packet: WeaponThreatPacket): WeaponThreatCandidateFrame | undefined {
    if (!packet.observerGroups || packet.observerGroups.length * OW !== packet.observers.length
      || packet.sources.length % SW || packet.mounts.length % MW
      || !Number.isInteger(packet.teamCount) || packet.teamCount < 1
      || packet.visible.length !== packet.sources.length / SW * packet.teamCount) return;
    // Candidate spans must not normalize malformed/overlapping caller packets.
    // The production frame captures contiguous source-major mounts.
    let next = 0;
    for (let s = 0; s < packet.sources.length; s += SW) {
      const first = packet.sources[s + S.FirstMount], count = packet.sources[s + S.MountCount];
      if (first !== next || !Number.isInteger(count) || count < 0) return;
      next += count;
    }
    if (next * MW !== packet.mounts.length) return;
    return new WeaponThreatCandidateFrame(packet);
  }
  forObserver(observer: number, horizon: number): WeaponThreatCandidates | undefined {
    if (!Number.isInteger(observer) || observer < 0 || observer >= this.groups.length
      || !Number.isFinite(horizon) || horizon < 0
      || this.packet.sources !== this.sources || this.packet.mounts !== this.mounts
      || this.packet.observers !== this.observers || this.packet.visible !== this.visible
      || this.packet.observerGroups !== this.groups || this.packet.teamCount !== this.teamCount) return;
    const bound = this.bounds.get(this.groups[observer]);
    if (!bound?.valid || bound.members < 2 || horizon > bound.horizon) return;
    const candidates = bound.candidates ??= this.prepare(bound);
    weaponThreatRelationWork.observers++;
    return candidates;
  }
  private prepare(b: Bound): WeaponThreatCandidates {
    const a = this.sources, m = this.mounts, selectedSources: number[] = [], selectedMounts: number[] = [], offsets = [0];
    weaponThreatRelationWork.groups++;
    for (let source = 0; source < a.length / SW; source++) {
      weaponThreatRelationWork.preparedSources++;
      const s = source * SW;
      if (!this.visible[source * this.teamCount + b.team] || a[s + S.Recovery] > b.horizon) continue;
      const x = a[s + S.X], y = a[s + S.Y];
      const relativeX = Math.max(Math.abs(a[s + S.VX] - b.minVX), Math.abs(a[s + S.VX] - b.maxVX));
      const relativeY = Math.max(Math.abs(a[s + S.VY] - b.minVY), Math.abs(a[s + S.VY] - b.maxVY));
      const approach = b.radius + b.horizon * Math.max(1, a[s + S.Speed] + relativeX + relativeY);
      const gap = Math.max(0, b.minX - x, x - b.maxX, b.minY - y, y - b.maxY);
      const scale = Math.max(b.scale, Math.abs(x), Math.abs(y), Math.abs(approach));
      if (rejectsReach(gap, approach + a[s + S.Reach], scale, a[s + S.Reach])) continue;
      const first = a[s + S.FirstMount], end = first + a[s + S.MountCount], before = selectedMounts.length;
      for (let index = first; index < end; index++) {
        weaponThreatRelationWork.preparedMounts++;
        const row = index * MW, range = m[row + M.Range], extent = m[row + M.Extent];
        // Exact ETA cannot be <= any member horizon: travel is nonnegative;
        // NaN in another ETA term also never emits a row in the original kernel.
        if (m[row + M.Readiness] > b.horizon) continue;
        if (rejectsReach(gap, approach + range + extent, scale, Math.max(Math.abs(range), Math.abs(extent)))) continue;
        selectedMounts.push(index);
      }
      if (selectedMounts.length > before) { selectedSources.push(source); offsets.push(selectedMounts.length); }
    }
    weaponThreatRelationWork.selectedSources += selectedSources.length;
    weaponThreatRelationWork.selectedMounts += selectedMounts.length;
    return { sources: new Uint32Array(selectedSources), offsets: new Uint32Array(offsets), mounts: new Uint32Array(selectedMounts) };
  }
}
