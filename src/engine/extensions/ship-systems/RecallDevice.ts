import type { Ship } from '../../simulation/Ship';
import type { ShipSystem } from '../../simulation/ShipSystem';
import type { SystemWorld } from './Types';
import { nativeSystem } from './NativeSystemFactory';

const recalled = new WeakMap<ShipSystem, Ship[]>();
function capture(carrier: Ship, world: SystemWorld, system: ShipSystem): Ship[] {
  let targets = recalled.get(system);
  if (!targets) {
    targets = world.ships.filter(c => c.sourceCarrier === carrier && !!c.flightDeckWingId && !c.isDead && !c.isDocked);
    recalled.set(system, targets);
    const serial = system.activationSerial;
    for (const craft of targets) craft.externalPhaseEffects.set(system, () =>
      !carrier.isDead && carrier.hullHp > 0 && !craft.isDead && system.isActive && system.activationSerial === serial
        ? 1 - .5 * system.effectLevel : undefined);
  }
  return targets;
}
function clear(system: ShipSystem): void {
  for (const craft of recalled.get(system) ?? []) craft.externalPhaseEffects.delete(system);
  recalled.delete(system);
}

export const recallDevice = nativeSystem('recalldevice', {
  description: '将本次选中的所属机翼战机相位化并回收至甲板，快速重新出击。不会复活被摧毁的战机。',
  implementationDetails: 'RecallDeviceStats固定目标名单、0.5秒预热/退出、50%基础容量使用消耗。甲板按原版快速间隔0.3–0.6秒逐架重新出击；省略入坞动画。',
  canActivate: ship => (ship.spec.fighterBays ?? 0) > 0 && !!ship.spec.fighterWings?.length,
  onActivate: (ship, world, system) => { clear(system); if (world.recoverWingCraft) capture(ship, world, system); },
  onActive: (ship, world, system) => {
    if (!world.recoverWingCraft) return;
    for (const craft of capture(ship, world, system)) {
      if (!craft.isDead && craft.hullHp > 0) world.recoverWingCraft(ship, craft);
    }
  },
  onAdvance: (_ship, _dt, _world, system) => { if (!system.isActive) clear(system); },
  advanceAI: ({ ship, system = ship.system, tactical }) => {
    if (tactical?.withdrawing || (ship.flux.totalFlux / ship.flux.maxFlux) > .75) return;
    // No fabricated global fighter target: combat populates the owner's real roster.
    if ([...ship.deployedWingCraft].some(c => !c.isDead && !c.isDocked && c.pos.distanceTo(ship.pos) > 400
      && c.weapons.some(w => w.spec.weaponType === 'MISSILE' && w.ammo === 0))) system.activate();
  },
});
