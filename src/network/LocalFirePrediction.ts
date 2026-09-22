import { weaponPresentationAngle } from '../engine/visual/WeaponPresentation';
import { Vector2 } from '../engine/math/Vector2';
import { signedAngle } from '../engine/math/Angles';
import type { CombatEngine } from '../engine/simulation/CombatEngine';
import type { Ship } from '../engine/simulation/Ship';
import type { Projectile, WeaponMount } from '../engine/simulation/Weapon';
import { combatProjectileSpeed, combatWeaponRange } from '../engine/simulation/WeaponRange';
import { advanceTurretAim, manualFireSlots } from '../engine/simulation/systems/weapon/WeaponAim';
import { initializeSourceProjectile, advanceSourceProjectile, hasSourceProjectileLifecycle } from '../engine/simulation/systems/weapon/SourceProjectileLifecycle';
import { projectileVisualLayer } from '../engine/render/ProjectileVisualLayer';
import { setPredictedProjectileLayer } from '../engine/render/PredictedProjectileLayer';
import type { PlayerInput } from './protocol';

export const FIRE_PREDICTION_LIMITS = Object.freeze({ pending: 32, lifetimeMs: 250, authorityAgeMs: 250, baselineIds: 512, correctionMs: 80, correctionDistance: 80 });
interface Pending { projectile: Projectile; sequence: number; tick: number; created: number; advanced: number; baseline: ReadonlySet<number>; trigger: number; cost: number; presented?: boolean }
interface RecoveryBaseline { tick: number; time: number; at: number; acknowledged: number; group: number; teleport: number; ids: ReadonlySet<number> }
interface Handoff { offset: Vector2; at: number; source: string; slot: string; spec: string }
const supported = (m: WeaponMount) => !m.spec.isBeam && !m.spec.isRocket && !m.spec.isGuided
  && !m.spec.everyFrameEffect && (!m.spec.autoCharge || (m.spec.burstSize ?? 1) === 1) && !m.spec.systemOnly
  && (m.spec.chargeTime ?? 0) === 0 && Number.isInteger(m.spec.burstSize ?? 1) && (m.spec.burstSize ?? 1) >= 1 && (m.spec.burstSize ?? 1) <= 32
  && ['BALLISTIC', 'BALLISTIC_AS_BEAM', 'PLASMA'].includes(m.spec.spawnType ?? '')
  && Number.isFinite(m.spec.refireDelay) && m.spec.refireDelay >= .05;
const mayFire = (ship: Ship) => !ship.isDead && !ship.isRetreated && !ship.isDocked && !ship.isPhased
  && ship.fireControlMode === 'MANUAL' && !ship.system.forcesAutofire && !ship.system.blocksWeapons
  && !ship.flux.isOverloaded && !ship.flux.isVenting;

/** Conservative first-round + confirmed single-round repeats, not a second combat simulation.
 * No fireWeapon/fixedUpdate, ammo/flux/health writes, audio or world RNG calls.
 * Full-state ACK resolves a prediction; absence of a surviving projectile is NOT
 * proof of rejection or a hit. Only an unambiguous visual match is smoothed.
 */
export class LocalFirePrediction {
  private pending = new Map<string, Pending>();
  private handoffs = new Map<number, Handoff>();
  private usedTicks = new Map<string, number>();
  private tick = -1;
  private authorityAt = -Infinity;
  private owner = '';
  private held = false;
  private trigger = 0;
  private cycles = new Map<string, { spec: string; nextAt: number; credit: boolean; trigger: number }>();
  private seenIds = new Set<number>();
  private sequence = -1;
  private serial = 0;
  private commandBarrier = -1;
  private acknowledged = -1;
  private counts = { predicted: 0, repeated: 0, observedCycles: 0, recoveredCycles: 0, matched: 0, resolvedWithoutProjectile: 0, expired: 0, cancelled: 0, suppressed: 0 };
  private lastResponseMs: number | null = null;
  private acceptedAt = -Infinity;
  private recoveryIntent: { sequence: number; owner: string; at: number } | null = null;
  private recoveryBaseline: RecoveryBaseline | null = null;
  stats() { return { ...this.counts, pending: this.pending.size, lastResponseMs: this.lastResponseMs }; }
  reset(engine: CombatEngine): void {
    // A focus/sync reset may erase a ghost, not proof that its input was consumed.
    for (const shot of this.pending.values()) this.commandBarrier = Math.max(this.commandBarrier, shot.sequence);
    this.counts.cancelled += this.pending.size;
    setPredictedProjectileLayer(engine); this.pending.clear(); this.handoffs.clear(); this.usedTicks.clear();
    this.tick = -1; this.authorityAt = -Infinity; this.owner = ''; this.held = false; this.cycles.clear(); this.seenIds.clear();
    this.recoveryIntent = null; this.recoveryBaseline = null;
  }
  /** Call only AFTER the corresponding complete world was applied, never from a
   * motion-only ACK or socket receipt (those do not confirm weapon execution). */
  receive(engine: CombatEngine, tick: number, acknowledged: number, now: number, confirmedLeadMs = 0): void {
    if (!Number.isSafeInteger(tick) || tick < 0 || !Number.isFinite(now)) return;
    if (this.owner && this.owner !== engine.playerShip.id) this.reset(engine);
    if (tick <= this.tick) return;
    this.usedTicks.clear();
    this.tick = tick; this.authorityAt = now; this.owner = engine.playerShip.id;
    if (!Number.isSafeInteger(acknowledged) || acknowledged < 0) return;
    this.acknowledged = Math.max(this.acknowledged, acknowledged);
    // Only progress already proven by NEWER COMPLETE worlds, supplied by the
    // playback buffer. Never estimate RTT or turn a motion ACK into fire credit.
    const cadenceAt = now - (Number.isFinite(confirmedLeadMs) && confirmedLeadMs >= 0
      && confirmedLeadMs <= FIRE_PREDICTION_LIMITS.authorityAgeMs ? confirmedLeadMs : 0);
    const recoveryMounts = this.recoveryMounts(engine, acknowledged, now);
    if (!this.cycles.size && !this.pending.size && !recoveryMounts) { this.seenIds.clear(); return; }
    // Collect once per applied world, not once for every pending mount. Inputs
    // with no due shot still never touch the battlefield projectile list.
    const owned = engine.projectiles.filter(p => p.sourceShipId === this.owner);
    const seen = new Set(owned.slice(0, FIRE_PREDICTION_LIMITS.baselineIds).map(p => p.id));
    // A real round arriving with no pending prediction already owns the screen.
    // Rebase its NEXT cycle, never paint a duplicate of that observed round.
    for (const p of owned) {
      const cycle = this.cycles.get(p.slotId ?? '');
      if (p.sourceShipId !== this.owner || this.seenIds.has(p.id) || !cycle?.credit || this.pending.has(p.slotId ?? '')) continue;
      const mount = engine.playerShip.weapons.find(m => m.slotId === p.slotId && m.spec.id === p.specId);
      if (mount) { cycle.nextAt = Math.max(cycle.nextAt, cadenceAt + Math.max(0, mount.cooldownTimer) * 1000); this.counts.observedCycles++; }
    }
    if (recoveryMounts) this.observeRecovery(engine, recoveryMounts, owned, seen, tick, acknowledged, now, cadenceAt);
    this.seenIds = seen;
    for (const [slot, shot] of this.pending) {
      if (now - shot.created > FIRE_PREDICTION_LIMITS.lifetimeMs) { this.pending.delete(slot); this.counts.expired++; continue; }
      if (tick <= shot.tick || acknowledged < shot.sequence) continue;
      this.pending.delete(slot);
      const p = shot.projectile;
      const matches = owned.filter(q => q.sourceShipId === p.sourceShipId && q.slotId === p.slotId
        && q.specId === p.specId && !shot.baseline.has(q.id));
      if (matches.length !== 1) { this.counts.resolvedWithoutProjectile++; continue; }
      this.counts.matched++;
      const cycle = this.cycles.get(slot);
      if (cycle && this.held && shot.trigger === this.trigger && cycle.trigger === this.trigger) cycle.credit = true;
      const q = matches[0], offset = p.pos.clone().sub(q.pos);
      if (now - shot.created <= FIRE_PREDICTION_LIMITS.lifetimeMs && offset.length() <= FIRE_PREDICTION_LIMITS.correctionDistance
        && Math.abs(signedAngle(p.vel.heading() - q.vel.heading())) < .2)
        this.handoffs.set(q.id, { offset, at: now, source: q.sourceShipId, slot, spec: q.specId });
    }
  }
  private recoveryMounts(engine: CombatEngine, acknowledged: number, now: number): WeaponMount[] | null {
    const intent = this.recoveryIntent, ship = engine.playerShip;
    // An older RAF timestamp can precede a just-accepted input. Skip this
    // observation without treating that legitimate ordering as a new intent.
    if (intent && (now < intent.at || now < this.acceptedAt)) return null;
    if (!intent || !this.held || intent.owner !== ship.id || acknowledged < intent.sequence
      || acknowledged < this.commandBarrier || acknowledged > this.sequence
      || now - this.acceptedAt > FIRE_PREDICTION_LIMITS.authorityAgeMs
      || !mayFire(ship) || !ship.isFiringMain || projectileVisualLayer(engine)
      || !Number.isFinite(engine.combatTime) || ship.subjectiveTimeMultiplier !== 1) {
      this.recoveryBaseline = null; return null;
    }
    const group = ship.weaponGroups[ship.selectedGroupIndex];
    const mounts = group ? ship.weapons.filter(m => group.weaponSlotIds.includes(m.slotId)) : [];
    if (!group || group.mode !== 'LINKED' || !mounts.length || mounts.length > FIRE_PREDICTION_LIMITS.pending
      || mounts.some(m => !supported(m))) { this.recoveryBaseline = null; return null; }
    return mounts;
  }
  private observeRecovery(engine: CombatEngine, mounts: WeaponMount[], owned: Projectile[], ids: ReadonlySet<number>, tick: number, acknowledged: number, now: number, cadenceAt: number): void {
    if (owned.length > FIRE_PREDICTION_LIMITS.baselineIds || ids.size !== owned.length
      || owned.some(p => !Number.isFinite(p.id) || p.id < 0)) { this.recoveryBaseline = null; return; }
    const ship = engine.playerShip, previous = this.recoveryBaseline;
    const current = { tick, time: engine.combatTime, at: now, acknowledged, group: ship.selectedGroupIndex, teleport: ship.teleportSequence, ids };
    this.recoveryBaseline = current;
    // First full ACK only establishes a baseline. A motion ACK, old surviving
    // round, or the very frame acknowledging the command cannot mint credit.
    if (previous && (current.group !== previous.group || current.teleport !== previous.teleport)) {
      this.recoveryIntent = null; this.recoveryBaseline = null; return;
    }
    if (!previous || tick <= previous.tick || acknowledged < previous.acknowledged
      || now < previous.at || now - previous.at > FIRE_PREDICTION_LIMITS.authorityAgeMs
      || !(current.time > previous.time)) return;
    const newRounds = new Map<string, Projectile | null>();
    for (const p of owned) {
      if (!p.slotId || previous.ids.has(p.id)) continue;
      newRounds.set(p.slotId, newRounds.has(p.slotId) ? null : p);
    }
    for (const mount of mounts) {
      const p = newRounds.get(mount.slotId), cycle = this.cycles.get(mount.slotId);
      if (!p || p.specId !== mount.spec.id || this.pending.has(mount.slotId)
        || cycle?.credit && cycle.trigger === this.trigger && cycle.spec === mount.spec.id
        || !Number.isFinite(p.elapsedTime) || p.elapsedTime < 0 || p.elapsedTime > current.time - previous.time + 1e-9
        || (mount.spec.burstSize ?? 1) !== 1 || ship.system.getWeaponRateOfFireMultiplier(mount.spec.weaponType) !== 1
        || !Number.isFinite(mount.cooldownTimer) || mount.cooldownTimer < 0 || mount.cooldownTimer > mount.spec.refireDelay + 1e-9
        || mount.isDisabled || mount.isPermanentlyDisabled || mount.firingState !== 'IDLE' || mount.burstRemaining > 0) continue;
      this.cycles.set(mount.slotId, { spec: mount.spec.id, nextAt: Math.max(now, cadenceAt + mount.cooldownTimer * 1000), credit: true, trigger: this.trigger });
      this.counts.recoveredCycles++;
    }
  }
  /** Only accepted local inputs are recorded; unsent/backpressured commands must
   * never paint phantom fire. A matched round grants at most one bounded repeat. */
  record(engine: CombatEngine, input: PlayerInput, now: number, enabled: boolean): void {
    if (!Number.isSafeInteger(input.seq) || input.seq <= this.sequence || !Number.isFinite(now)) return;
    this.sequence = input.seq; this.acceptedAt = now;
    const pressed = input.firing && input.pointerActive;
    const rising = pressed && !this.held;
    if (rising) { this.trigger++; this.cycles.clear(); }
    if (!pressed) this.cycles.clear();
    this.held = pressed;
    if (!pressed || !enabled) { this.recoveryIntent = null; this.recoveryBaseline = null; }
    else if (rising || input.actions.length) {
      this.recoveryIntent = { sequence: input.seq, owner: engine.playerShip.id, at: now };
      this.recoveryBaseline = null;
    }
    if (input.actions.length) { this.cycles.clear(); this.commandBarrier = input.seq; this.counts.cancelled += this.pending.size; this.pending.clear(); this.handoffs.clear(); setPredictedProjectileLayer(engine); }
    if (!pressed) return;
    const ship = engine.playerShip;
    if (!enabled || this.owner !== ship.id || now < this.authorityAt || now - this.authorityAt > FIRE_PREDICTION_LIMITS.authorityAgeMs
      || input.actions.length || this.commandBarrier > this.acknowledged || !mayFire(ship) || projectileVisualLayer(engine)) { this.counts.suppressed++; return; }
    // Most held-input ticks have no repeat credit or are before the cadence.
    // Do not scan/copy the battlefield projectile array on those 60Hz inputs.
    let due = rising;
    if (!due) for (const cycle of this.cycles.values()) if (cycle.credit && cycle.trigger === this.trigger && now >= cycle.nextAt) { due = true; break; }
    if (!due) return;
    const group = ship.weaponGroups[ship.selectedGroupIndex];
    const mounts = group ? ship.weapons.filter(m => group.weaponSlotIds.includes(m.slotId)) : [];
    // All-or-nothing support avoids guessing flux consumed by an unsupported
    // earlier mount in this same authored group. Disabled supported mounts skip.
    if (!group || group.mode !== 'LINKED' || !mounts.length || mounts.length > FIRE_PREDICTION_LIMITS.pending || mounts.some(m => !supported(m))) { this.counts.suppressed++; return; }
    const localAim = Object.create(ship) as Ship;
    Object.defineProperty(localAim, 'aimTargetWorld', { value: new Vector2(...input.aim) });
    const slots = manualFireSlots(localAim, mounts, new Set(group.weaponSlotIds));
    let baseline: ReadonlySet<number> | undefined;
    let flux = ship.flux.maxFlux - ship.flux.totalFlux, produced = 0;
    for (const shot of this.pending.values()) flux -= shot.cost;
    for (const mount of mounts) {
      const cycle = this.cycles.get(mount.slotId);
      // Limited repeat: one confirmed predecessor, one ordinary round, no burst,
      // time dilation or RoF modifiers whose remaining cycle we cannot know.
      const repeat = !rising && cycle?.credit && cycle.trigger === this.trigger && cycle.spec === mount.spec.id
        && now >= cycle.nextAt && (mount.spec.burstSize ?? 1) === 1 && ship.subjectiveTimeMultiplier === 1
        && ship.system.getWeaponRateOfFireMultiplier(mount.spec.weaponType) === 1;
      if (!rising && !repeat) continue;
      if (!slots.has(mount.slotId) || this.pending.has(mount.slotId) || this.usedTicks.get(mount.slotId) === this.tick
        || this.pending.size >= FIRE_PREDICTION_LIMITS.pending || mount.isDisabled || mount.isPermanentlyDisabled
        || mount.firingState !== 'IDLE' || mount.burstRemaining > 0 || (repeat ? mount.cooldownTimer > mount.spec.refireDelay + 1e-9 : mount.cooldownTimer > 0) || (mount.reloadDelayRemaining ?? 0) > 0
        || !(mount.ammo === Infinity || Number.isFinite(mount.ammo) && mount.ammo >= 1) || !ship.system.canFireWeapon(mount)) continue;
      const cost = mount.spec.fluxPerShot * ship.system.getWeaponFluxCostMultiplier(mount.spec.weaponType) * (mount.spec.interruptibleBurst ? 1 : (mount.spec.burstSize ?? 1));
      if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(flux) || cost > flux) continue;
      // Lazily collect IDs only after a mount can really produce a ghost. Empty
      // ammo, insufficient flux and blocked systems must not scan all bullets.
      if (!baseline) {
        const rows = engine.projectiles.filter(p => p.sourceShipId === ship.id);
        if (rows.length > FIRE_PREDICTION_LIMITS.baselineIds) { this.counts.suppressed++; return; }
        baseline = new Set(rows.map(p => p.id));
      }
      const projectile = this.create(ship, mount, input.aim);
      if (!projectile) continue;
      flux -= cost; produced++;
      this.pending.set(mount.slotId, { projectile, sequence: input.seq, tick: this.tick, created: now, advanced: now, baseline, trigger: this.trigger, cost });
      this.usedTicks.set(mount.slotId, this.tick); this.counts.predicted++;
      if (repeat) this.counts.repeated++;
      this.cycles.set(mount.slotId, { spec: mount.spec.id, nextAt: now + mount.spec.refireDelay * 1000, credit: false, trigger: this.trigger });
    }
    if (!produced) this.counts.suppressed++;
  }
  private create(ship: Ship, mount: WeaponMount, aim: [number, number]): Projectile | null {
    const spec = mount.spec, speed = combatProjectileSpeed(ship, spec), range = combatWeaponRange(ship, spec);
    if (![speed, range, ...aim, mount.currentAngleRad].every(Number.isFinite) || speed <= 0 || range <= 0) return null;
    const facing = ship.interpolatedFacing(1), position = ship.interpolatedPos(1).clone();
    const mountPos = mount.relativePos.clone().rotate(facing).add(position), base = facing + mount.baseAngleDeg * Math.PI / 180;
    const angle = mount.mountType === 'HARDPOINT' ? base : weaponPresentationAngle(mount, facing) ?? advanceTurretAim(mount.currentAngleRad + signedAngle(facing - ship.facingRad), base,
      Math.atan2(aim[1] - mountPos.y, aim[0] - mountPos.x), mount.arcDeg, (spec.turnRateDegPerSec ?? 0) * Math.PI / 180, ship.angularVelRad, 1 / 60);
    const offsets = mount.mountType === 'HARDPOINT' ? (spec.hardpointOffsets?.length ? spec.hardpointOffsets : spec.turretOffsets)
      : (spec.turretOffsets?.length ? spec.turretOffsets : spec.hardpointOffsets);
    if (offsets && offsets.length >= 2) {
      const barrel = mount.barrelIndex % Math.floor(offsets.length / 2);
      mountPos.add(new Vector2(offsets[barrel * 2], offsets[barrel * 2 + 1]).rotate(angle));
    }
    // Center-line estimate only: authoritative random spread will correct it.
    const p: Projectile = { id: --this.serial, sourceShipId: ship.id, slotId: mount.slotId, specId: spec.id,
      isPlayer: ship.isPlayer, teamId: ship.teamId, pos: mountPos, prevPos: mountPos.clone(),
      vel: Vector2.fromAngle(angle, speed).add(ship.vel), facingRad: angle,
      damage: 0, empDamage: 0, damageType: spec.type, radius: spec.projRadius, rangeRemaining: range, totalRange: range, elapsedTime: 0,
      color: spec.color, spawnType: spec.spawnType, visualSpawnType: spec.visualSpawnType,
      textureType: spec.textureType, textureScrollSpeed: spec.textureScrollSpeed, pixelsPerTexel: spec.pixelsPerTexel,
      fadeTime: spec.fadeTime, fringeColor: spec.fringeColor, coreColor: spec.coreColor, glowColor: spec.glowColor,
      hitGlowRadius: spec.hitGlowRadius, glowRadius: spec.glowRadius, coreWidthMult: spec.coreWidthMult,
      projSpriteUrl: spec.projSpriteUrl, projLength: spec.projLength, projWidth: spec.projWidth };
    initializeSourceProjectile(p, speed, ship.vel); return p;
  }
  render(engine: CombatEngine, now: number, enabled: boolean): void {
    if (!enabled || !Number.isFinite(now) || this.owner !== engine.playerShip.id || !mayFire(engine.playerShip)
      || projectileVisualLayer(engine)) { this.reset(engine); return; }
    if (!this.pending.size && !this.handoffs.size) { setPredictedProjectileLayer(engine); return; }
    const projectiles: Projectile[] = [], corrections = new Map<number, Projectile>();
    for (const [slot, shot] of this.pending) {
      // RAF timestamps belong to the start of the frame batch. An input timer
      // using performance.now() may have run slightly later before this callback.
      // Wait for the next frame instead of expiring a brand-new prediction.
      if (now < shot.created) continue;
      if (now - shot.created > FIRE_PREDICTION_LIMITS.lifetimeMs) { this.pending.delete(slot); this.counts.expired++; continue; }
      const p = shot.projectile;
      let remaining = Math.max(0, now - shot.advanced) / 1000, ended = false;
      while (remaining > 1e-9) {
        const dt = Math.min(1 / 60, remaining); p.prevPos.copy(p.pos); p.elapsedTime += dt;
        if (hasSourceProjectileLifecycle(p)) ended = advanceSourceProjectile(p, dt);
        else { p.pos.addScaled(p.vel, dt); p.rangeRemaining -= p.vel.length() * dt; ended = p.rangeRemaining <= 0; }
        remaining -= dt; if (ended) break;
      }
      shot.advanced = now; p.prevPos.copy(p.pos); p.prevBallisticTail?.copy(p.ballisticTail!);
      if (ended) { this.pending.delete(slot); this.counts.expired++; continue; }
      if (p.elapsedTime <= 0) continue;
      if (!shot.presented) { this.lastResponseMs = now - shot.created; shot.presented = true; }
      projectiles.push(p);
    }
    for (const [id, h] of this.handoffs) {
      const age = now - h.at, q = engine.projectiles.find(p => p.id === id && p.sourceShipId === h.source && p.slotId === h.slot && p.specId === h.spec);
      if (!q || age < 0 || age >= FIRE_PREDICTION_LIMITS.correctionMs) { this.handoffs.delete(id); continue; }
      const offset = h.offset.clone().scale(Math.exp(-age / 20) * (1 - age / FIRE_PREDICTION_LIMITS.correctionMs));
      corrections.set(id, { ...q, pos: q.pos.clone().add(offset), prevPos: q.prevPos.clone().add(offset),
        ballisticTail: q.ballisticTail?.clone().add(offset), prevBallisticTail: q.prevBallisticTail?.clone().add(offset) });
    }
    setPredictedProjectileLayer(engine, projectiles.length || corrections.size ? { projectiles, corrections } : undefined);
  }
}
