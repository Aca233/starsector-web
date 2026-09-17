import { sameTeam } from "../CombatTeams";
import { Vector2 } from '../../math/Vector2';
import { sound } from '../../audio/SoundManager';
import { signedAngle } from '../../math/Angles';
import { nativeVariantSpec } from '../../content/NativeVariantSpec';
import type { ShipSpec, WeaponMountSlotConfig } from '../../content/ShipSpec';
import { droneDeployment, droneLauncherData, type DroneLauncherData } from '../../extensions/ship-systems/DroneLaunchers';
import { Ship } from '../Ship';
import type { ShipSystem } from '../ShipSystem';
import { SimulationRandom } from '../SimulationRandom';
import type { Beam, Projectile } from '../Weapon';
import type { FireControlWorld } from '../../ai/AutofireController';
import { combatWeaponRange } from '../WeaponRange';

/** Explicit source variant; no shared content is mutated. */
export function droneVariantSpec(native: DroneLauncherData): ShipSpec { return nativeVariantSpec(native.variant); }
const clamp = (v: number) => Math.max(-1, Math.min(1, v));

export class DroneSystem {
  public readonly drones: Ship[] = [];
  private readonly launchers = new Map<ShipSystem, Ship>();
  private readonly launchSlots = new WeakMap<Ship, WeaponMountSlotConfig>();
  constructor(private readonly random = new SimulationRandom(), private readonly visualRandom = new SimulationRandom(0xd20ae)) {}

  public clear(): void {
    this.drones.length = 0;
    this.launchers.clear();
  }

  public advanceLauncher(carrier: Ship, system: ShipSystem, dt: number): void {
    const native = droneLauncherData(system);
    if (!native || (carrier.isDead || carrier.isRetreated) || !Number.isFinite(dt) || dt <= 0) return;
    this.launchers.set(system, carrier);
    const state = droneDeployment(system);
    state.drones = state.drones.filter(c => !c.isDead && !c.isDocked && c.hullHp > 0);
    const capacity = Math.max(0, system.maxCharges - state.drones.length);
    system.charges = Math.min(capacity, system.charges);
    if (system.charges < capacity) {
      state.regen += dt * Number(native.row.regen || 0) * carrier.hullStats.systemRegenMultiplier;
      const add = Math.min(capacity - system.charges, Math.floor(state.regen));
      system.charges += add; state.regen -= add;
    } else state.regen = 0;
    // One physical launcher activation per interval; idle time never accumulates a burst.
    state.elapsed += dt;
    if (state.order === 'RECALL' || !system.charges || state.drones.length >= native.spec.maxDrones
      || system.disabled || carrier.flux.isOverloaded || carrier.flux.isVenting || carrier.isPhased || state.elapsed < native.spec.launchDelay) return;
    const slots = carrier.spec.systemWeaponSlots;
    if (!slots?.length) return;
    const slot = slots[state.slot % slots.length];
    const spec = droneVariantSpec(native);
    const angle = carrier.facingRad + slot.baseAngleDeg * Math.PI / 180;
    const pos = carrier.pos.clone().add(new Vector2(slot.x, slot.y).rotate(carrier.facingRad));
    const craft = new Ship(this.random.nextId(carrier.id + '_drone'), spec, carrier.isPlayer, pos, angle, this.random, this.visualRandom);
    craft.teamId = carrier.teamId;
    craft.isSystemDrone = true;
    craft.currentCR = carrier.currentCR;
    craft.vel.copy(carrier.vel).add(Vector2.fromAngle(angle, native.spec.launchSpeed));
    craft.fireControlMode = 'AI';
    this.launchSlots.set(craft, slot);
    state.drones.push(craft); this.drones.push(craft);
    system.charges--; state.slot++; state.elapsed = 0;
    sound.playAtPos('drone_launch',pos,carrier.pos,1);
  }

  public update(dt: number, world: FireControlWorld, spawnProj: (p: Projectile) => void, spawnBeam: (b: Beam) => void,
    spawnFlash: (pos: Vector2, facing: number, size: number, color: [number, number, number]) => void): void {
    for (const [system, carrier] of this.launchers) {
      const native = droneLauncherData(system)!;
      const state = droneDeployment(system);
      if ((carrier.isDead || carrier.isRetreated) || carrier.hullHp <= 0 || !world.ships.includes(carrier)) {
        // Native DroneAI retires orphaned drones; they cannot become immortal free ships.
        for (const craft of state.drones) { craft.hullHp = 0; craft.clearInput(); craft.shield.setActive(false); }
        this.launchers.delete(system);
        continue;
      }
      state.drones = state.drones.filter(c => !c.isDead && !c.isDocked && c.hullHp > 0);
      native.spec.droneBehavior.forEach((ring, i) => {
        const radius = Math.max(1, carrier.shield.radius + ring.orbitRadius);
        state.ringAngles[i] += ring.orbitDir * ring.orbitSpeed / radius * dt;
      });
      state.drones.forEach((craft, index) => {
        const ringIndex = Math.max(0, native.spec.droneBehavior.findIndex(r => r.droneIndex.includes(index)));
        const ring = native.spec.droneBehavior[ringIndex];
        const members = state.drones.filter((_c, i) => ring.droneIndex.includes(i));
        const angle = carrier.facingRad + state.ringAngles[ringIndex] + members.indexOf(craft) / Math.max(1, members.length) * Math.PI * 2 * ring.orbitDir;
        const radius = Math.max(1, carrier.shield.radius + ring.orbitRadius);
        const orbital = carrier.getShieldCenter().add(Vector2.fromAngle(angle, radius));
        const orbitVelocity = carrier.vel.clone().add(Vector2.fromAngle(angle + Math.PI / 2, ring.orbitSpeed * ring.orbitDir));
        let goal = orbital.clone(), desiredVelocity = orbitVelocity;
        let facing = ring.defaultFacing === 'AWAY_FROM_SHIP' ? craft.pos.clone().sub(carrier.pos).heading()
          : ring.defaultFacing === 'MATCH_DRONE_HEADING' && craft.vel.length() > 5 ? craft.vel.heading() : carrier.facingRad;
        const range = Math.max(0, ...craft.weapons.map(w => combatWeaponRange(craft, w.spec)));
        const roam = state.order === 'ATTACK' ? ring.freeRoamRange : ring.holdRoamRange;
        const eligible = world.ships.filter(s => !s.isDead && s.isVisibleTo(craft.teamId) && s.hullHp > 0 && !s.isPhased && !sameTeam(s, craft)
          && s.pos.distanceTo(orbital) <= range + roam + s.spec.collisionRadius);
        let target: Ship | Projectile | undefined;
        for (const priority of ring.targetPriority) {
          const candidates = priority === 'MISSILE'
            ? world.missiles.filter(p => p.isRocket && p.isPlayer !== undefined && !sameTeam(p, craft) && !p.isFlare
              && (p.hitpoints ?? 1) > 0 && !p.isDisarmed && (p.flightTimeRemaining ?? p.rangeRemaining) > 0 && p.pos.distanceTo(orbital) <= range + roam + p.radius)
            : eligible.filter(s => priority === 'FIGHTER' ? s.spec.hullSize === 'FIGHTER' : s.spec.hullSize !== 'FIGHTER');
          target = candidates.reduce<Ship | Projectile | undefined>((best, next) => !best || next.pos.distanceTo(craft.pos) < best.pos.distanceTo(craft.pos) ? next : best, undefined);
          if (target) break;
        }
        craft.currentTargetShip = target instanceof Ship ? target : null;
        if (state.order === 'RECALL') {
          const slot = this.launchSlots.get(craft)!;
          goal = carrier.pos.clone().add(new Vector2(slot.x, slot.y).rotate(carrier.facingRad));
          desiredVelocity = carrier.vel.clone();
          if (craft.pos.distanceTo(goal) < 35) {
            craft.isDocked = true; craft.clearInput();
            system.charges = Math.min(system.maxCharges, system.charges + 1);
            return;
          }
        } else if (target) {
          if (ring.faceEnemy) facing = target.pos.clone().sub(craft.pos).heading();
          if (roam > 0) {
            const approach = target.pos.clone().sub(orbital);
            const length = approach.length();
            if (length > 0) goal.addScaled(approach, Math.min(roam, Math.max(0, length - range * .8)) / length);
          }
        }
        const delta = goal.sub(craft.pos);
        const desired = desiredVelocity.add(delta.clone().scale(2));
        const correction = desired.sub(craft.vel).rotate(-craft.facingRad);
        craft.throttle = clamp(correction.x / Math.max(1, craft.spec.acceleration * .5));
        craft.strafeInput = clamp(correction.y / Math.max(1, craft.spec.acceleration * .5));
        craft.turnInput = clamp(signedAngle(facing - craft.facingRad) * 3 - craft.angularVelRad);
        craft.brakeInput = false;
        craft.aimTargetWorld = target?.pos.clone() ?? craft.pos.clone().add(Vector2.fromAngle(facing, 1000));
        craft.isFiringMain = false;
        craft.fireControlMode = state.order === 'RECALL' ? 'MANUAL' : 'AI';
        for (const group of craft.weaponGroups) group.isAutofire = state.order !== 'RECALL';
        if (target && craft.canUseShields() && !craft.shield.isActive) craft.shield.setActive(true);
        craft.update(dt, craft.currentTargetShip, spawnProj, spawnBeam, spawnFlash, world);
      });
      state.drones = state.drones.filter(c => !c.isDocked);
    }
    for (let i = this.drones.length - 1; i >= 0; i--) if (this.drones[i].isDead || this.drones[i].isDocked) this.drones.splice(i, 1);
  }
}
