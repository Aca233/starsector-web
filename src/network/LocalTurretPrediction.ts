import type { CombatDisplayReads } from '../engine/runtime/CombatDisplayReads';
import type { WeaponMount } from '../engine/simulation/Weapon';
import { signedAngle } from '../engine/math/Angles';
import { advanceTurretAim } from '../engine/simulation/systems/weapon/WeaponAim';
import { setWeaponPresentationAngle } from '../engine/visual/WeaponPresentation';
import { blankInput } from './protocol';
import type { PlayerInput } from './protocol';

interface Pose { raw: number; shown: number; offset: number }
interface Baseline { spec: string; relative: number }
/** Local manual aiming only. No mount writes, firing, cooldown, ammo, AI or RNG. */
export class LocalTurretPrediction {
  private samples: { input: PlayerInput; at: number }[] = [];
  private held = blankInput();
  private baseline = new Map<string, Baseline>();
  private poses = new Map<string, Pose>();
  private shown = new Set<WeaponMount>();
  private owner = '';
  private group = -1;
  private teleport = -1;
  private tick = -1;
  private at = -Infinity;
  private lastRender: number | null = null;
  private correct = false;
  private barrier = -1;
  private acknowledged = -1;
  private sequence = -1;
  private reason = 'reset';
  private counts = { renderedFrames: 0, reconciliations: 0, hardSnaps: 0 };
  stats() { return { active: this.reason === 'active', reason: this.reason, ...this.counts, mounts: this.shown.size, pendingInputs: this.samples.length }; }
  reset() {
    for (const mount of this.shown) setWeaponPresentationAngle(mount, null);
    this.shown.clear(); this.poses.clear(); this.baseline.clear(); this.samples = []; this.held = blankInput();
    this.owner = ''; this.group = -1; this.teleport = -1; this.tick = -1; this.at = -Infinity;
    this.lastRender = null; this.correct = false; this.reason = 'reset';
  }
  record(input: PlayerInput, now: number) {
    if (!Number.isSafeInteger(input.seq) || input.seq <= this.sequence || !Number.isFinite(now)) return;
    this.sequence = input.seq;
    if (input.actions.length) { this.barrier = input.seq; this.reset(); return; }
    this.samples.push({ input: { ...input, aim: [...input.aim], actions: [] }, at: now });
    this.samples = this.samples.filter(s => now - s.at < 1000).slice(-60);
  }
  /** Full applied weapon baseline only; a motion ACK cannot acknowledge aiming. */
  receive(engine: DisplaySource, tick: number, acknowledged: number, now: number) {
    if (!Number.isSafeInteger(tick) || tick < 0 || !Number.isFinite(now)) return;
    const ship = engine.playerShip;
    if (this.owner && (this.owner !== ship.id || this.group !== ship.selectedGroupIndex || this.teleport !== ship.teleportSequence)) this.reset();
    if (tick <= this.tick) return;
    if (Number.isSafeInteger(acknowledged) && acknowledged >= 0) {
      this.acknowledged = Math.max(this.acknowledged, acknowledged);
      for (const s of this.samples) if (s.input.seq <= this.acknowledged) this.held = s.input;
      this.samples = this.samples.filter(s => s.input.seq > this.acknowledged);
    }
    this.owner = ship.id; this.group = ship.selectedGroupIndex; this.teleport = ship.teleportSequence;
    this.tick = tick; this.at = now; this.correct = true; this.baseline.clear();
    for (const mount of ship.weapons) this.baseline.set(mount.slotId, { spec: mount.spec.id, relative: signedAngle(mount.currentAngleRad - ship.facingRad) });
  }
  render(engine: DisplaySource, live: PlayerInput, now: number, enabled: boolean) {
    const ship = engine.playerShip;
    const reason = !Number.isFinite(now) || !live.aim.every(Number.isFinite) ? 'unavailable' : !enabled || !live.pointerActive ? 'inactive' : now < this.at || now - this.at > 250 ? 'stale'
      : this.barrier > this.acknowledged ? 'command'
      : this.owner !== ship.id || this.group !== ship.selectedGroupIndex || this.teleport !== ship.teleportSequence
        || ship.isDead || ship.isRetreated || ship.isDocked || ship.isPhased || ship.fireControlMode !== 'MANUAL' || ship.system.forcesAutofire ? 'unavailable' : null;
    if (reason) {
      if (reason === 'inactive') {
        for (const mount of this.shown) setWeaponPresentationAngle(mount, null);
        this.shown.clear(); this.poses.clear(); this.samples = []; this.held = blankInput(); this.lastRender = null;
      } else this.reset();
      this.reason = reason; return;
    }
    for (const mount of this.shown) setWeaponPresentationAngle(mount, null);
    this.shown.clear();
    const group = ship.weaponGroups[ship.selectedGroupIndex];
    const gap = this.lastRender === null ? Math.min(1 / 60, Math.max(0, (now - this.at) / 1000)) : Math.max(0, (now - this.lastRender) / 1000), dt = Math.min(.05, gap);
    this.lastRender = now;
    const facing = ship.interpolatedFacing(1), pos = ship.interpolatedPos(1);
    const start = Math.max(now - 250, Math.min(this.at, this.samples[0]?.at ?? this.at));
    const liveSince = now - Math.min(1000 / 60, dt * 1000);
    const retained = new Set<string>();
    for (const mount of ship.weapons) {
      const baseline = this.baseline.get(mount.slotId), speed = (mount.spec.turnRateDegPerSec ?? 30) * Math.PI / 180;
      if (!group?.weaponSlotIds.includes(mount.slotId) || !baseline || baseline.spec !== mount.spec.id || mount.mountType !== 'TURRET'
        || mount.isDisabled || mount.isPermanentlyDisabled || ![speed, mount.arcDeg, baseline.relative].every(Number.isFinite) || speed <= 0) continue;
      const pivot = mount.relativePos.clone().rotate(facing).add(pos), base = facing + mount.baseAngleDeg * Math.PI / 180;
      const step = (relative: number, input: PlayerInput, seconds: number) => input.pointerActive
        ? signedAngle(advanceTurretAim(facing + relative, base, Math.atan2(input.aim[1] - pivot.y, input.aim[0] - pivot.x),
          mount.arcDeg, speed, ship.angularVelRad, seconds * Math.min(4, ship.subjectiveTimeMultiplier)) - facing) : relative;
      let raw = baseline.relative, input = this.held, index = 0;
      for (let t = start; t < now;) {
        while (index < this.samples.length && this.samples[index].at <= t) input = this.samples[index++].input;
        if (t >= liveSince) input = live;
        const edge = Math.min(this.samples[index]?.at ?? now, t < liveSince ? liveSince : now);
        const ms = Math.min(1000 / 60, now - t, edge - t); raw = step(raw, input, ms / 1000); t += ms;
      }
      const old = this.poses.get(mount.slotId); let offset = old?.offset ?? 0;
      if (this.correct && old && gap <= .05) {
        const continued = step(old.raw, live, dt), expected = old.shown + signedAngle(continued - old.raw);
        const error = mount.arcDeg >= 360 ? signedAngle(expected - raw) : expected - raw;
        offset = Math.abs(error) < Math.PI / 4 ? error : 0;
        this.counts.reconciliations++; if (offset === 0 && Math.abs(error) >= Math.PI / 4) this.counts.hardSnaps++;
      } else if (gap > .05) offset = 0;
      offset *= Math.exp(-dt / .06);
      // Clamp the corrected display too; smoothing must not cross a forbidden arc.
      const shown = signedAngle(advanceTurretAim(facing + raw + offset, base, facing + raw, mount.arcDeg, speed, ship.angularVelRad, 0) - facing);
      this.poses.set(mount.slotId, { raw, shown, offset }); retained.add(mount.slotId);
      setWeaponPresentationAngle(mount, shown); this.shown.add(mount);
    }
    for (const slot of this.poses.keys()) if (!retained.has(slot)) this.poses.delete(slot);
    this.correct = false; this.reason = this.shown.size ? 'active' : 'unavailable';
    if (this.shown.size) this.counts.renderedFrames++;
  }
}

/** Minimal display capabilities; never an authority-world requirement. */
type DisplaySource = Pick<CombatDisplayReads, 'playerShip'>;
