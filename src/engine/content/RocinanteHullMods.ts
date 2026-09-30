import type { HullModDefinition } from '../extensions/HullMods';
import type { Ship } from '../simulation/Ship';
import type { ShipSpec } from './ShipSpec';
import { ROCINANTE_HULL_ID, ROCINANTE_MODS as M } from './RocinanteIds';
import { ROCINANTE_WEAPONS } from './RocinanteArmory';

// A compensation budget comes ONLY from the successful recoil callback. World
// direction is captured once: turning cannot convert it into free forward thrust.
type Compensation = { x: number; y: number; remaining: number };
const compensation = new WeakMap<Ship, Compensation>();
export const isRocinanteCompensating = (ship: Ship) => (compensation.get(ship)?.remaining ?? 0) > 0;
const canCompensate = (ship: Ship) => !ship.isDead && !ship.isRetreated && ship.hullHp > 0
  && !ship.flux.isOverloaded && !ship.flux.isVenting && !ship.engineController.isFlamedOut && ship.getFlameoutRatio() === 0 && !ship.engineStatuses.some(e => e.isDisabled);
const applicable = (s: ShipSpec) => (s.sourceHullId ?? s.id) === ROCINANTE_HULL_ID && !s.isModuleHull ? null : '仅限罗西南特号';
const meta = (icon: string) => ({ cost: { FRIGATE: 10 }, icon: `graphics/hullmods/${icon}.png`, uiTags: ['特殊'], manufacturer: '罗西南特 · Web改装' });
const resources = (icon: string) => ({ textures: [`/game-assets/graphics/hullmods/${icon}.png`] });
export const rocinanteHullMods: readonly HullModDefinition[] = [{
  id: M.matrix, name: '罗西南特 · 六联拦截矩阵', status: 'implemented',
  refit: { ...meta('defensive_targeting_array'), cost: { FRIGATE: 0 }, builtInOnly: true },
  resources: resources('defensive_targeting_array'), applicable,
  description: '本舰内置，0OP、不可卸下。六门专属PDC射程550→700，炮塔转速210→315度/秒；不扩大实际射界，不穿越遮挡，不影响轴炮或鱼雷。基础弹匣60发、每秒补6发不变。右键火控压制时可集中速射，但要承担供弹和载荷压力。',
  rangeFlat: (_ship, weapon) => weapon.id === ROCINANTE_WEAPONS.pdc ? 150 : 0,
  weaponStats: (_ship, weapon) => weapon.id === ROCINANTE_WEAPONS.pdc ? { turnRateMultiplier: 1.5 } : {},
}, {
  id: M.compensator, name: '反冲补偿架', status: 'implemented', refit: meta('auxilliary_thrusters'), resources: resources('auxilliary_thrusters'),
  applicable, conflicts: [M.magazine],
  description: '10OP。轴炮成功射击后额外消耗120软载荷，在0.25秒内沿实际反冲的反方向补回70%速度损失。补偿与姿态急转互斥；急转中、可用载荷容量不足、过载/排散或引擎受损不补偿，但不阻止轴炮发射。中断丢弃未用补偿，不能囤积。',
  onWeaponRecoil: (ship, mount, dx, dy) => {
    if (mount.spec.id !== ROCINANTE_WEAPONS.railgun || !canCompensate(ship)
      || ship.allSystems.some(s => s.type === 'WEB_ROCINANTE_ATTITUDE' && s.isActive)
      || ship.flux.totalFlux + 120 > ship.flux.maxFlux || isRocinanteCompensating(ship)) return;
    ship.flux.increaseFlux(120, false);
    compensation.set(ship, { x: -dx * .7, y: -dy * .7, remaining: .25 });
  },
  advance: (ship, dt) => {
    const state = compensation.get(ship); if (!state || !(dt > 0)) return;
    if (!canCompensate(ship)) { compensation.delete(ship); return; }
    const fraction = Math.min(dt, state.remaining) / .25;
    ship.vel.x += state.x * fraction; ship.vel.y += state.y * fraction;
    state.remaining -= Math.min(dt, state.remaining);
    if (state.remaining <= 1e-9) compensation.delete(ship);
  },
}, {
  id: M.magazine, name: '近防储弹扩容', status: 'implemented', refit: meta('expanded_magazines2'), resources: resources('expanded_magazines2'),
  applicable, conflicts: [M.compensator],
  description: '10OP。六门专属PDC弹匣容量60→90，仍每秒补充6发；不提高射速或长期供弹。基础平移加速度降低10%。卸下恢复基础值；不改共享军械规格，不在战斗切换火控时补弹。',
  stats: () => ({ accelerationMultiplier: .9 }),
  weaponStats: (_ship, weapon) => weapon.id === ROCINANTE_WEAPONS.pdc ? { ammoPercent: 50 } : {},
}];
