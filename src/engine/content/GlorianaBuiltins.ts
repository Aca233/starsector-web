import type { ShipSurfaceFeedback } from '../visual/ShipSurfaceFeedback';
import { batterySide, usableBattery, edictOnline, lockedBroadside } from '../extensions/ship-systems/GlorianaEdictState';
import type { HullModDefinition } from '../extensions/HullMods';
import type { ShipSpec } from './ShipSpec';
import type { Ship } from '../simulation/Ship';
import type { WeaponSpec } from '../simulation/Weapon';

export const GLORIANA_BUILTINS = {
  voidShield: 'web_gloriana_void_generators', ordnance: 'web_gloriana_heavy_ordnance', bulkheads: 'web_gloriana_emergency_bulkheads',
} as const;
export const GLORIANA_CORE_BUILTINS: readonly string[] = [GLORIANA_BUILTINS.voidShield, GLORIANA_BUILTINS.ordnance, GLORIANA_BUILTINS.bulkheads];
export const GLORIANA_BATTERY_BUILTINS: readonly string[] = [GLORIANA_BUILTINS.ordnance, GLORIANA_BUILTINS.bulkheads, 'reduced_explosion'];
export const GLORIANA_ENGINE_BUILTINS: readonly string[] = [GLORIANA_BUILTINS.bulkheads, 'reduced_explosion'];
export const GLORIANA_SEAL = { threshold: .4, duration: 6, fluxFraction: .25, damageMultiplier: .4 } as const;
const core = (ship: ShipSpec) => (ship.sourceHullId ?? ship.id) === 'web_gloriana' && !ship.isModuleHull;
const battery = (ship: ShipSpec) => /^web_gloriana_[ps][123]$/.test(ship.sourceHullId ?? ship.id) && !!ship.isModuleHull;
const engine = (ship: ShipSpec) => /^web_gloriana_e[ps]$/.test(ship.sourceHullId ?? ship.id) && !!ship.isModuleHull;
const heavyGun = (weapon: WeaponSpec) => weapon.mountSize === 'EXTRA_LARGE' && (weapon.weaponType === 'BALLISTIC' || weapon.weaponType === 'ENERGY');
interface BulkheadState { used: boolean; remaining: number }
const bulkheads = new WeakMap<Ship, BulkheadState>();
const sealModifiers = Object.freeze({ armorDamageMultiplier: GLORIANA_SEAL.damageMultiplier,
  hullDamageMultiplier: GLORIANA_SEAL.damageMultiplier, disableWeapons: 1, disableVenting: 1 });
function alive(ship: Ship): boolean { return !ship.isDead && ship.hullHp > 0 && !ship.isRetreated && !ship.isDocked; }
function available(ship: Ship): boolean { return alive(ship) && (!ship.parentShip || alive(ship.parentShip)); }
/** Per-ship combat lifetime; reset of tactical systems never refunds this one-shot stock. */
function advanceBulkheads(ship: Ship, dt: number): void {
  const state = bulkheads.get(ship);
  if (!state || !(dt > 0)) return;
  if (!available(ship)) { state.remaining = 0; ship.runtimeModifiers.delete(GLORIANA_BUILTINS.bulkheads); return; }
  if (state.remaining > 0) {
    state.remaining = Math.max(0, state.remaining - dt);
    if (state.remaining < 1e-8) { state.remaining = 0; ship.runtimeModifiers.delete(GLORIANA_BUILTINS.bulkheads); }
    return;
  }
  const cost = ship.flux.maxFlux * GLORIANA_SEAL.fluxFraction;
  const reserved = ship.allSystems.reduce((sum, system) => sum + system.reservedFluxCost, 0);
  if (state.used || ship.hullHp > ship.maxHullHp * GLORIANA_SEAL.threshold || ship.flux.isVenting || ship.flux.isOverloaded
    || ship.flux.maxFlux <= 0 || ship.flux.totalFlux + reserved + cost > ship.flux.maxFlux) return;
  ship.flux.increaseFluxClamped(cost, true);
  state.used = true; state.remaining = GLORIANA_SEAL.duration;
  ship.runtimeModifiers.set(GLORIANA_BUILTINS.bulkheads, sealModifiers);
}
/** The same predicates as actual bonuses; sealed/waiting compartments take visual priority. */
export function glorianaSurfaceFeedback(ship: Ship): ShipSurfaceFeedback | undefined {
  if (!available(ship)) return undefined;
  const seal = bulkheads.get(ship);
  if (seal?.remaining && seal.remaining > 0) {
    const elapsed = GLORIANA_SEAL.duration - seal.remaining;
    return { mode: 'SEALED', level: Math.min(1, elapsed / .35, seal.remaining / .5), progress: elapsed / GLORIANA_SEAL.duration };
  }
  if (seal && !seal.used && ship.hullHp <= ship.maxHullHp * GLORIANA_SEAL.threshold)
    return { mode: 'WAITING', level: .35, progress: 0 };
  const parent = ship.parentShip, side = batterySide(ship);
  if (!parent || !side || !parent.childModules.includes(ship) || !usableBattery(ship)) return undefined;
  const system = parent.allSystems.find(s => s.type === 'WEB_GLORIANA_BROADSIDE_EDICT');
  return system && edictOnline(system) && lockedBroadside(system) === side
    ? { mode: 'ORDER', level: system.effectLevel, progress: system.effectLevel } : undefined;
}
/** Read-only authoritative status, transported as text; display clients never run the timer. */
export function glorianaBulkheadStatus(owner: Ship): string | undefined {
  const parts = owner.assemblyShips.filter(ship => bulkheads.has(ship));
  if (!parts.length) return undefined;
  const active = parts.filter(ship => available(ship) && bulkheads.get(ship)!.remaining > 0);
  const reserve = parts.filter(ship => available(ship) && !bulkheads.get(ship)!.used).length;
  if (active.length) {
    const part = active[0];
    return '封舱 ' + (part.moduleMount?.slotId ?? '核心') + ' ' + bulkheads.get(part)!.remaining.toFixed(1) + 's'
      + (active.length > 1 ? ' 等' + active.length + '舱' : '') + ' · 储备' + reserve + '/' + parts.length;
  }
  const waiting = parts.find(ship => available(ship) && !bulkheads.get(ship)!.used && ship.hullHp <= ship.maxHullHp * GLORIANA_SEAL.threshold);
  return waiting ? (waiting.moduleMount?.slotId ?? '核心') + '待封舱：需25%空余载荷且非排散/过载' : '封舱储备 ' + reserve + '/' + parts.length;
}
/** The existing Ship/Shield implementation owns the defense; never apply a second shield. */
export const glorianaBuiltins: readonly HullModDefinition[] = [{
  id: GLORIANA_BUILTINS.voidShield,
  name: '荣光 · 多层虚空盾发生器',
  status: 'implemented',
  refit: {
    cost: { CAPITAL_SHIP: 0 }, uiTags: ['护盾', '支援'], manufacturer: '荣光女王专属 · Web扩展',
    icon: 'graphics/hullmods/hardened_shields.png', builtInOnly: true,
  },
  applicable: ship => (ship.sourceHullId ?? ship.id) === 'web_gloriana' && !ship.isModuleHull && ship.voidShield
    ? null : '仅限荣光女王指挥核心的虚空盾',
  description: '四层全向虚空盾，基础每层24000承载、总承载96000。恢复4000/秒，受击停充4秒；全层崩溃后锁定8秒，再蓄积至一层完成重建。友军可自由进入盾内，并由盾面拦截敌火。右键开关；排散或过载时抑制护盾。承载独立于普通护盾载荷。选装圣域重整列阵后的参数以改装面板为准。舰体内置，0OP、不可卸下；图标复用原版。',
}, {
  id: GLORIANA_BUILTINS.ordnance, name: '荣光 · 重型军械统合', status: 'implemented',
  refit: { cost: { CAPITAL_SHIP: 0 }, uiTags: ['武器'], manufacturer: '荣光女王专属 · Web扩展',
    icon: 'graphics/hullmods/ballistics_integration.png', builtInOnly: true },
  applicable: ship => core(ship) || battery(ship) ? null : '仅限荣光女王核心及六座炮廊',
  description: '本舱超大型实弹与超大型能量武器射程+20%，代价是发射载荷消耗×1.15、炮塔转速×0.75。适合远距离重炮战，但近身跟踪更慢、持续开火压力更大。大中小型武器、导弹和舰载机不受影响，不增加弹药或伤害。与敕令的射程加成相加、载荷消耗倍率相乘。舰体内置，0OP、不可卸下。Web原创规则，图标复用原版。',
  rangePercent: (_ship, weapon) => heavyGun(weapon) ? 20 : 0,
  weaponStats: (_ship, weapon) => heavyGun(weapon) ? { fluxCostMultiplier: 1.15, turnRateMultiplier: .75 } : {},
}, {
  id: GLORIANA_BUILTINS.bulkheads, name: '荣光 · 战损封舱协议', status: 'implemented',
  refit: { cost: { CAPITAL_SHIP: 0 }, uiTags: ['生存', '特殊'], manufacturer: '荣光女王专属 · Web扩展',
    icon: 'graphics/hullmods/reinforced_bulkheads.png', builtInOnly: true },
  applicable: ship => core(ship) || battery(ship) || engine(ship) ? null : '仅限荣光女王核心及固定模块',
  description: '本舱每场战斗可自动封舱一次。存活且结构≤40%，非排散/过载并有25%容量空余载荷时，支付本舱25%容量硬载荷，封舱6秒：装甲与结构承伤−60%，但本舱停火且不能主动排散。核心与各模块独立触发、独立付费，其它舱仍可作战。结束恢复正常，不回血、不修甲、不复活，不能挡下触发前的一击致死伤害。舰体内置，0OP、不可卸下。Web原创规则，图标复用原版。',
  apply: ship => { bulkheads.set(ship, { used: false, remaining: 0 }); },
  advance: advanceBulkheads,
  surfaceFeedback: glorianaSurfaceFeedback,
}];
