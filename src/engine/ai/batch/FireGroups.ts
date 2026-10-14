import type { WeaponGroup } from '../../simulation/Weapon';
import { signedAngle } from '../../math/Angles';
import { WeaponFlag as W, type StageReadView } from './StageProtocol';
import type { FireReadInputs } from './FireProtocol';

interface GroupInput {
  rows: number[]; linked: boolean; automatic: boolean; index: number;
  elapsed: number; wasFiring: boolean; switched: boolean;
}
let sharedActive = new Uint8Array(512);
let sharedAutomatic = new Uint8Array(512);
let sharedManual = new Uint8Array(512);
const sharedGroupPool: GroupInput[] = [];
/** One group publication, numeric scheduling, one group writeback. No .find()
 * on live mounts in group selection or per-request scheduling. */
export class FireGroups {
  readonly active: Uint8Array;
  readonly automatic: Uint8Array;
  readonly manual: Uint8Array;
  readonly starts = new Map<number, number>();
  private readonly groups: GroupInput[] = [];
  private alternating = -1;
  constructor(private readonly v: StageReadView, private readonly f: FireReadInputs,
    groups: readonly WeaponGroup[], readonly selected: number,
    slots: ReadonlyMap<string, number>, private readonly own: number, private readonly dt: number,
    private readonly manualControl: boolean, private readonly canFire: boolean,
    ownMountRows?: readonly number[]) {
    const wc = v.weaponCount;
    if (sharedActive.length < wc) {
      const cap = Math.max(wc, sharedActive.length * 2, 512);
      sharedActive = new Uint8Array(cap);
      sharedAutomatic = new Uint8Array(cap);
      sharedManual = new Uint8Array(cap);
    } else if (ownMountRows) {
      for (let i = 0; i < ownMountRows.length; i++) {
        const r = ownMountRows[i];
        sharedActive[r] = 0;
        sharedAutomatic[r] = 0;
        if (manualControl) sharedManual[r] = 0;
      }
    } else {
      sharedActive.fill(0, 0, wc);
      sharedAutomatic.fill(0, 0, wc);
      if (manualControl) sharedManual.fill(0, 0, wc);
    }
    this.active = sharedActive;
    this.automatic = sharedAutomatic;
    this.manual = sharedManual;
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      let gi = sharedGroupPool[i];
      if (!gi) {
        gi = { rows: [], linked: false, automatic: false, index: 0, elapsed: 0, wasFiring: false, switched: false };
        sharedGroupPool[i] = gi;
      }
      const rows = gi.rows;
      const slotIds = g.weaponSlotIds;
      rows.length = slotIds.length;
      for (let j = 0; j < slotIds.length; j++) {
        const row = slots.get(slotIds[j]) ?? -1;
        rows[j] = row;
        if (row >= 0) {
          if (i === selected) this.active[row] = 1;
          if (g.isAutofire) this.automatic[row] = 1;
        }
      }
      gi.linked = g.mode === 'LINKED';
      gi.automatic = g.isAutofire;
      gi.index = g.alternatingIndex;
      gi.elapsed = g.alternatingElapsed ?? 0;
      gi.wasFiring = !!g.alternatingWasFiring;
      gi.switched = !!g.alternatingJustSwitched;
      this.groups.push(gi);
    }
    if (manualControl) this.prepareManual();
  }
  private index(g: GroupInput): number {
    return g.rows.length ? ((g.index % g.rows.length) + g.rows.length) % g.rows.length : -1;
  }
  private usable(row: number): boolean {
    return row >= 0 && !this.v.weapons.disabled[row] && (!Number.isFinite(this.v.weapons.ammo[row]) || this.v.weapons.ammo[row] >= 1);
  }
  private next(g: GroupInput, index: number): number {
    for (let offset = 1; offset <= g.rows.length; offset++) {
      const n = (index + offset) % g.rows.length;
      if (this.usable(g.rows[n])) return n;
    }
    return -1;
  }
  private slice(row: number, count: number): number {
    const c = this.f.weapons[row];
    return Math.max(1 / 240, c.cycle / Math.max(1, count));
  }
  private advance(g: GroupInput): void {
    if (!g.rows.length) return;
    const w = this.v.weapons, start = this.index(g);
    let index = start, row = g.rows[index], rotated = false;
    const finishing = row >= 0 && !w.disabled[row] && w.ammo[row] < 1 && g.wasFiring
      && (w.cooldown[row] > 0 || w.burstRemaining[row] > 0 || w.firingState[row] !== 0);
    if (!this.usable(row) && !finishing) {
      const next = this.next(g, start);
      if (next < 0) { g.wasFiring = true; g.switched = false; return; }
      index = next; row = g.rows[index]; g.elapsed = 0; rotated = true;
    }
    if (w.flags[row] & W.BEAM && !this.f.weapons[row].beamBurst) {
      g.index = index; g.elapsed = 0; g.wasFiring = true; g.switched = false; return;
    }
    const elapsed = g.elapsed + this.dt;
    if (elapsed > this.slice(row, g.rows.length)) {
      const next = this.next(g, index);
      if (next >= 0 && next !== index) index = next;
      g.elapsed = 0; rotated = true;
    } else g.elapsed = elapsed;
    g.index = index; g.wasFiring = true; g.switched = rotated;
  }
  private prepareManual(): void {
    const g = this.groups[this.selected], w = this.v.weapons, f = this.f, b = this.v.bodies;
    if (!this.manualControl || !g) return;
    if (!g.linked) {
      if (f.mainTrigger[this.own] && this.canFire) this.advance(g);
      else {
        if (g.wasFiring && !g.switched) { const n = this.next(g, this.index(g)); if (n >= 0) g.index = n; }
        g.elapsed = 0; g.wasFiring = g.switched = false;
      }
      this.alternating = g.rows[this.index(g)] ?? -1;
      if (this.alternating >= 0) this.manual[this.alternating] = 1;
      return;
    }
    let closest = -1, closestDistance = Infinity, found = false;
    const cos = Math.cos(b.facing[this.own]), sin = Math.sin(b.facing[this.own]);
    for (const row of g.rows) if (row >= 0) {
      const c = f.weapons[row];
      const x = c.relativeX * cos - c.relativeY * sin + b.x[this.own];
      const y = c.relativeX * sin + c.relativeY * cos + b.y[this.own];
      const target = Math.atan2(f.aimY[this.own] - y, f.aimX[this.own] - x);
      const distance = Math.max(0, Math.abs(signedAngle(target - w.baseAngle[row])) - w.arc[row] / 2);
      if (distance <= 1e-9 || w.flags[row] & W.HARDPOINT || c.arc <= 10 || w.flags[row] & W.ALWAYS_FIRE) {
        this.manual[row] = 1; found = true;
      }
      if (distance < closestDistance) { closest = row; closestDistance = distance; }
    }
    if (!found && closest >= 0) this.manual[closest] = 1;
  }
  manualRequest(row: number): boolean {
    const w = this.v.weapons, g = this.groups[this.selected];
    if (!g || !this.f.mainTrigger[this.own] || !this.canFire || w.cooldown[row] > 0) return false;
    return (!(w.flags[row] & W.BEAM) && (w.firingState[row] === 1 || w.burstRemaining[row] > 0))
      || !!this.manual[row] && (g.linked || row === this.alternating);
  }
  scheduleAutomatic(requests: Uint8Array): void {
    const w = this.v.weapons;
    for (let gi = 0; gi < this.groups.length; gi++) {
      const g = this.groups[gi];
      if (g.linked || this.manualControl && (gi === this.selected || !g.automatic)) continue;
      const index = this.index(g), active = g.rows[index];
      let usable = 0;
      for (const row of g.rows) if (row >= 0 && !w.disabled[row] && (w.ammo[row] >= 1
        || w.cooldown[row] > 0 || w.burstRemaining[row] > 0 || w.firingState[row] !== 0)) usable++;
      let chosen = -1, waiting = false;
      if (g.wasFiring) {
        g.elapsed += this.dt;
        if (active >= 0 && w.flags[active] & W.BEAM && !this.f.weapons[active].beamBurst) {
          if (requests[active] && w.firingState[active] !== 0) chosen = active;
        } else if (active >= 0 && g.elapsed + 1e-9 < this.slice(active, usable)) waiting = true;
      }
      if (chosen < 0 && !waiting) for (let offset = g.wasFiring ? 1 : 0;
        offset < g.rows.length + (g.wasFiring ? 1 : 0); offset++) {
        const row = g.rows[(index + offset) % g.rows.length];
        if (row >= 0 && requests[row] && !w.disabled[row] && w.ammo[row] >= 1 && w.firingState[row] === 0
          && w.burstRemaining[row] <= 0 && w.cooldown[row] <= 0 && !(this.f.weapons[row].reload > 0)) { chosen = row; break; }
      }
      if (chosen >= 0) this.starts.set(chosen, gi);
      for (const row of g.rows) if (row >= 0) {
        const committed = w.burstRemaining[row] > 0 || w.firingState[row] === 1
          || w.flags[row] & W.BEAM && this.f.weapons[row].beamBurst && w.firingState[row] === 2;
        if (row !== chosen && !committed) requests[row] = 0;
      }
    }
  }
  writeback(groups: readonly WeaponGroup[]): void {
    for (let i = 0; i < this.groups.length; i++) {
      const g = this.groups[i], out = groups[i];
      // Linked/unused manual groups never received the old scheduler's writes.
      if (g.linked || this.manualControl && i !== this.selected && !g.automatic) continue;
      out.alternatingIndex = g.index; out.alternatingElapsed = g.elapsed;
      out.alternatingWasFiring = g.wasFiring; out.alternatingJustSwitched = g.switched;
    }
  }
  /** Original manual alternation writes precede all per-mount policy callbacks. */
  writebackManual(groups: readonly WeaponGroup[]): void {
    const g = this.groups[this.selected], out = groups[this.selected];
    if (!this.manualControl || !g || g.linked) return;
    out.alternatingIndex = g.index; out.alternatingElapsed = g.elapsed;
    out.alternatingWasFiring = g.wasFiring; out.alternatingJustSwitched = g.switched;
  }
}
