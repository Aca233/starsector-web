import { isRocinanteCompensating } from '../../content/RocinanteHullMods';
/** Rocinante tactical rules; the pack owns hull/art and registration. */
import type { ShipSystemDefinition, SystemAIContext } from './Types';
import type { Ship } from '../../simulation/Ship';
import type { ShipSystem } from '../../simulation/ShipSystem';
import type { WeaponMount } from '../../simulation/Weapon';
import { sameTeam } from '../../simulation/CombatTeams';
import { isPointDefense, predictWeaponIntercept, reachableFireTarget, type FireControlWorld } from '../../ai/AutofireController';
import { weaponMuzzle } from '../../ai/FireControlGeometry';
import { signedAngle } from '../../math/Angles';
import { segmentCircleEntry } from '../../math/Geometry';

export const ROCINANTE_ATTITUDE = 'WEB_ROCINANTE_ATTITUDE';
export const ROCINANTE_FIRE_CONTROL = 'WEB_ROCINANTE_FIRE_CONTROL';
const living = (ship: Ship) => !ship.isDead && ship.hullHp > 0 && !ship.isRetreated && !ship.isDocked;
function roleMount(ship: Ship, mount: WeaponMount, role: 'POINT_DEFENSE' | 'AXIAL'): boolean {
  const slot = ship.spec.weaponSlots.find(s => s.slotId === mount.slotId);
  if (slot?.controlRole !== role || !slot.builtIn || slot.defaultWeaponId !== mount.spec.id) return false;
  if (mount.spec.weaponType !== 'BALLISTIC' || mount.spec.spawnType !== 'BALLISTIC' || mount.spec.isBeam || mount.spec.isRocket) return false;
  return role === 'AXIAL' ? mount.mountType === 'HARDPOINT' : isPointDefense(mount) && !mount.spec.aiHints?.includes('PD_ONLY');
}
function availableMount(ship: Ship, mount: WeaponMount): boolean {
  return !mount.isDisabled && mount.ammo >= 1 && ship.system.canFireWeapon(mount);
}
/** Check actual inertial drift over the whole maneuver, not just a forward cone. */
function driftClear(context: SystemAIContext): boolean {
  const { ship, world } = context;
  if (!world) return false;
  const horizon = 1.5, radius = ship.spec.collisionRadius + 12;
  for (const other of world.ships) {
    if (other === ship || other.assemblyRoot === ship.assemblyRoot || !living(other) || other.isCollisionless) continue;
    const end = ship.pos.clone().addScaled(ship.vel.clone().sub(other.vel), horizon);
    if (segmentCircleEntry(ship.pos, end, other.pos, radius + other.spec.collisionRadius) !== null) return false;
  }
  const end = ship.pos.clone().addScaled(ship.vel, horizon);
  for (const rock of world.asteroids) {
    if (rock.hp <= 0) continue;
    if (segmentCircleEntry(ship.pos, end, rock.pos, radius + rock.radius) !== null) return false;
  }
  return true;
}
function attitudeAI(context: SystemAIContext): void {
  const { ship, target, tactical } = context, system = context.system ?? ship.system;
  if (system.isActive) {
    if (tactical?.withdrawing || tactical?.waypoint || tactical?.avoidingCollision) system.deactivate();
    return;
  }
  if (!tactical || tactical.allowOffensiveManeuver !== true || tactical.withdrawing || tactical.waypoint || tactical.avoidingCollision
    || tactical.threat.actualDamage > 0 || tactical.threat.imminentDamage > ship.maxHullHp * .05
    || system.activationFailureReason || !living(target) || sameTeam(ship, target) || !target.isVisibleTo(ship.teamId) || !driftClear(context)) return;
  const canAlign = ship.weapons.some(mount => {
    if (!roleMount(ship, mount, 'AXIAL') || !availableMount(ship, mount) || mount.cooldownTimer > 1.3) return false;
    const solution = predictWeaponIntercept(ship, mount, { kind: 'SHIP', entity: target });
    if (!solution) return false;
    const origin = weaponMuzzle(ship, mount), distance = origin.distanceTo(solution.point);
    if (distance > solution.range + target.spec.collisionRadius) return false;
    const error = Math.abs(signedAngle(solution.point.clone().sub(origin).heading() - ship.facingRad - mount.baseAngleDeg * Math.PI / 180));
    return error > 25 * Math.PI / 180 && error < 145 * Math.PI / 180;
  });
  if (canAlign) system.activate();
}
function localFireControlAI({ ship, system, world, tactical }: SystemAIContext): void {
  if (!system || !world || !living(ship) || ship.fireControlMode !== 'AI' || system.state === 'IN' || system.state === 'OUT') return;
  const mounts = ship.weapons.filter(m => roleMount(ship, m, 'POINT_DEFENSE') && availableMount(ship, m));
  const fireWorld: FireControlWorld = { ships: world.ships, asteroids: world.asteroids,
    missiles: world.projectiles.filter(p => (p.isRocket || p.spawnType === 'MISSILE' || p.isMine) && !p.isFlare && !p.didDamage && !p.isDisarmed) };
  const intercept = mounts.some(m => fireWorld.missiles.some(p => reachableFireTarget(ship, m, { kind: 'MISSILE', entity: p }, fireWorld))
    || world.ships.some(s => s.spec.hullSize === 'FIGHTER' && reachableFireTarget(ship, m, { kind: 'SHIP', entity: s }, fireWorld)));
  const target = ship.currentTargetShip;
  // Hysteresis avoids rapid toggles at the heat threshold. Incoming threats still win.
  const heat = ship.flux.totalFlux / Math.max(1, ship.flux.maxFlux);
  const heatReady = heat < (system.state === 'ACTIVE' ? .72 : .45);
  const suppress = heatReady && !intercept && !tactical?.withdrawing && (tactical?.quietFor ?? 0) >= .6 && target && target.spec.hullSize !== 'FIGHTER'
    && mounts.some(m => reachableFireTarget(ship, m, { kind: 'SHIP', entity: target }, fireWorld));
  if (suppress && system.state === 'IDLE') system.activate();
  else if (!suppress && system.state === 'ACTIVE') system.activate();
}
function fireControlStatus(system: ShipSystem): string {
  if (system.owner && !living(system.owner)) return '局部火控离线';
  if (system.state === 'IN') return `护航 → 压制 · 重分配 ${system.activeTimer.toFixed(2)}s`;
  if (system.state === 'OUT') return `压制 → 护航 · 重分配 ${system.activeTimer.toFixed(2)}s`;
  return system.state === 'ACTIVE' ? '压制 · 近防20发/s / 轴炮3s · 弹速+25% / 耗散减半' : '护航 · 近防拦截优先 / 正常耗散';
}
export const rocinanteSystems: readonly ShipSystemDefinition[] = [
  {
    id: ROCINANTE_ATTITUDE, sourceIds: [], name: '姿态急转',
    iconUrl: '/game-assets/graphics/icons/hullsys/maneuvering_jets.png',
    resources: {textures:['/game-assets/graphics/icons/hullsys/maneuvering_jets.png']},
    description: '消耗150软载荷，1.2秒内转速+80%、角加速度+120%。保留惯性与转向输入，暂时停用主推／侧推；刹车或撤退优先取消。冷却8秒。',
    implementationDetails: '罗西南特Web规则；没有平移加速、无敌或自动瞄准。RCS按实际运动变化驱动宿主推进纹理，非贴纸光环。',
    chargeUp: .1, active: 1.2, chargeDown: .2, cooldown: 8, fluxPerUseFlat: 150,
    controls: { blockAcceleration: true, blockStrafing: true, releaseOnOut: true, cancelOnFlameout: true, cancelOnBrake: true, cancelOnRetreat: true, cancelOnDeath: true },
    installReason: spec => spec.weaponSlots.some(s => s.controlRole === 'AXIAL' && s.builtIn && s.mountType === 'HARDPOINT') ? undefined : '需要明确标记的内置轴炮位',
    activationReason: ship => isRocinanteCompensating(ship) ? '反冲补偿正在占用姿态喷口' : ship.brakeInput ? '刹车输入优先' : ship.getFlameoutRatio() >= 1 || ship.engineController.isFlamedOut ? '推进系统停机' : undefined,
    modifiers: (system, _capacity, owner) => system.state === 'ACTIVE' && (!owner || living(owner)) ? { turnRatePercent: 80, turnAccelerationPercent: 120 } : {},
    statusText: system => system.state === 'ACTIVE' ? `惯性急转 · ${system.activeTimer.toFixed(2)}s` : undefined,
    advanceAI: attitudeAI,
  },
  {
    id: ROCINANTE_FIRE_CONTROL, sourceIds: [], name: '局部火控网络',
    iconUrl: '/game-assets/graphics/icons/hullsys/drone_sensor.png',
    resources: {textures:['/game-assets/graphics/icons/hullsys/drone_sensor.png']},
    description: '右键切换护航／压制。护航优先拦截；压制时基础PDC由15提升至20发/秒、轴炮周期4.5→3秒，弹速+25%，每发载荷+35%，本舰耗散减半，鱼雷不增益。自动PDC优先选中敌舰，目标不可达时回落拦截。切换暂停自动PDC射击0.3秒；手动组仍由玩家控制，也受火控增益与代价影响。弹匣不补满、供弹不加速；排散/过载自动退出压制。',
    implementationDetails: 'Web改编的双态火控，不是原著性能数值。默认护航；压制用1.5倍实弹时钟（PDC受宿主0.05秒最小间隔限制），不改共享武器规格，也不强化导弹。优先级不绕过射程、射界和遮挡；AI低于45%载荷择机压制，达到72%或遭遇可拦截威胁回到护航。',
    chargeUp: .3, active: Infinity, chargeDown: .3, cooldown: 0, toggle: true,
    controls: { cancelOnDeath: true },
    installReason: spec => spec.weaponSlots.some(s => s.controlRole === 'POINT_DEFENSE' && s.builtIn) ? undefined : '需要明确标记的内置PDC挂点',
    deactivationReason: (_ship, system) => system.state === 'IN' ? '火控正在重分配' : undefined,
    autofirePolicy: (system, mount) => system.owner && living(system.owner) && roleMount(system.owner, mount, 'POINT_DEFENSE')
      ? { priority: system.state === 'ACTIVE' ? 'SUPPRESS' : 'ESCORT', suspended: system.state === 'IN' || system.state === 'OUT' } : undefined,
    modifiers: (system, _capacity, owner) => !system.disabled && system.state === 'ACTIVE'
      && owner && living(owner) && !owner.flux.isVenting && !owner.flux.isOverloaded
      ? { dissipationMultiplier: .5, weapons: { BALLISTIC: {
        rateOfFireMultiplier: 1.5, projectileSpeedPercent: 25, fluxCostMultiplier: 1.35,
      } } } : {},
    onAdvance: (ship, _dt, _world, system) => {
      if ((ship.flux.isVenting || ship.flux.isOverloaded) && (system.state === 'IN' || system.state === 'ACTIVE')) system.deactivate();
    },
    statusText: fireControlStatus,
    passiveStatusText: fireControlStatus,
    advanceAI: localFireControlAI,
  },
];
