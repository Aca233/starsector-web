import type { HullModDefinition } from '../extensions/HullMods';
import type { ShipSpec } from './ShipSpec';
import type { Ship } from '../simulation/Ship';
import type { ShipSystem } from '../simulation/ShipSystem';
import { HYPERION_HULL_ID, HYPERION_YAMATO_ID, HYPERION_JUMP_ID, HYPERION_HULLMODS as M } from './HyperionIds';
import { HYPERION_REACTOR } from './HyperionJumpTarget';

export const HYPERION_FOCUS = { cost: 45, cooldown: 14, jumpWarmup: 2.4 } as const;
export const HYPERION_REPAIR = { quiet: 6, rate: .005, ceiling: .8, budget: .2, energyPerSecond: 6 } as const;
const isHyperion = (s: ShipSpec) => (s.sourceHullId ?? s.id) === HYPERION_HULL_ID && !s.isModuleHull;
const has = (s: ShipSpec, id: string) => !!(s.builtInHullMods?.includes(id) || s.hullMods?.includes(id));
export const hyperionReactor = (ship: Ship) => ship.allSystems.find(s => s.type === HYPERION_YAMATO_ID);
export const hyperionYamatoCost = (ship: Ship) => has(ship.spec, M.focus) ? HYPERION_FOCUS.cost : HYPERION_REACTOR.yamato;

/** The hullmod configures the existing snapshotted system reservoir, not a second hidden pool. */
function installReactor(ship: Ship): void {
  const core = hyperionReactor(ship);
  if (!core) return;
  core.maxCharges = Math.max(0, HYPERION_REACTOR.capacity + ship.hullStats.systemUsesBonus);
  core.charges = Math.min(core.maxCharges, HYPERION_REACTOR.capacity);
  core.chargeRegenRate = HYPERION_REACTOR.regen * ship.hullStats.systemRegenMultiplier;
  core.maxCooldown = (has(ship.spec, M.focus) ? HYPERION_FOCUS.cooldown : core.definition.cooldown) * ship.hullStats.systemCooldownMultiplier;
  const jump = ship.allSystems.find(s => s.type === HYPERION_JUMP_ID);
  if (jump) jump.chargeUpDuration = has(ship.spec, M.focus) ? HYPERION_FOCUS.jumpWarmup : jump.definition.chargeUp;
}
export function hyperionSharedReason(ship: Ship, system: ShipSystem, cost: number): string | undefined {
  if (!isHyperion(ship.spec) || !has(ship.spec, M.reactor)) return '需要内置旗舰反应堆';
  const core = hyperionReactor(ship);
  if (!core) return '需要大和炮/反应堆核心技能';
  if (core.disabled || (ship.runtimeModifiers.value.disableSystems ?? 0) > 0) return '旗舰反应堆离线';
  if (ship.allSystems.some(s => s !== system && [HYPERION_YAMATO_ID, HYPERION_JUMP_ID].includes(s.type) && s.isActive)) return '反应堆正供能另一技能';
  if (core.charges < cost) return `反应堆不足：${core.charges}/${cost}`;
}
export function spendHyperionReactor(ship: Ship, system: ShipSystem, cost: number): boolean {
  if (hyperionSharedReason(ship, system, cost)) return false;
  hyperionReactor(ship)!.charges -= cost;
  return true;
}

interface RepairState {
  quiet: number; used: number; tick: number; working: boolean; reason: string;
  cycles: Map<string, number>;
}
// Authority-only, one encounter per Ship instance. Display snapshots carry status text, not simulation checkpoints.
const repairs = new WeakMap<Ship, RepairState>();
function interruptRepair(state: RepairState): void {
  state.quiet = 0; state.tick = 0; state.working = false; state.reason = '脱战等待';
}
function installRepair(ship: Ship): void {
  const state: RepairState = { quiet: 0, used: 0, tick: 0, working: false, reason: '脱战等待', cycles: new Map(ship.weapons.map(w => [w.slotId, w.firingCycleId])) };
  repairs.set(ship, state);
  // Observe actual hull/armor damage, preserving native callbacks and without granting damage immunity.
  ship.hullDamageInterceptors.add(damage => { if (damage > 0) interruptRepair(state); return false; });
  const onArmorDamage = ship.armor.onCellDamage;
  ship.armor.onCellDamage = (c, r, damage) => { onArmorDamage?.(c, r, damage); if (damage > 0) interruptRepair(state); };
}
const repairOnline = (ship: Ship) => !ship.isDead && ship.hullHp > 0 && !ship.isRetreated && !ship.retreating && !ship.isDocked
  && !ship.isPhased && !ship.flux.isOverloaded && !ship.flux.isVenting && (ship.runtimeModifiers.value.disableSystems ?? 0) <= 0;
/** After weapon/system updates: even a complete short firing cycle in this tick interrupts repair. */
function advanceRepair(ship: Ship, dt: number): void {
  const state = repairs.get(ship);
  if (!state || !Number.isFinite(dt) || dt <= 0) return;
  let firing = ship.isFiringMain || ship.allSystems.some(s => s.isActive);
  for (const w of ship.weapons) {
    firing ||= w.firingState !== 'IDLE' || w.triggerHeld || state.cycles.get(w.slotId) !== w.firingCycleId;
    state.cycles.set(w.slotId, w.firingCycleId);
  }
  const core = hyperionReactor(ship);
  if (!repairOnline(ship) || !core || core.disabled || !has(ship.spec, M.reactor) || firing) { interruptRepair(state); return; }
  state.quiet = Math.min(HYPERION_REPAIR.quiet, state.quiet + dt, ship.shield.sinceLastDamageTaken);
  state.working = false;
  const ceiling = ship.maxHullHp * HYPERION_REPAIR.ceiling, budget = ship.maxHullHp * HYPERION_REPAIR.budget;
  if (state.used >= budget - 1e-7) { state.reason = '材料耗尽'; state.tick = 0; return; }
  if (ship.hullHp >= ceiling - 1e-7) { state.reason = '已达80%上限'; state.tick = 0; return; }
  if (state.quiet < HYPERION_REPAIR.quiet) { state.reason = '脱战等待'; state.tick = 0; return; }
  if (core.charges < 1) { state.reason = '储备不足'; state.tick = 0; return; }
  state.working = true; state.reason = '修复中';
  state.tick += dt * HYPERION_REPAIR.energyPerSecond;
  const hpPerEnergy = ship.maxHullHp * HYPERION_REPAIR.rate / HYPERION_REPAIR.energyPerSecond;
  // At most the available stock/material is consumed, including large-dt calls. No prepaid cycle to refund.
  while (state.tick >= 1 && core.charges >= 1 && state.used < budget - 1e-7 && ship.hullHp < ceiling - 1e-7) {
    const amount = Math.min(hpPerEnergy, budget - state.used, ceiling - ship.hullHp);
    core.charges--; state.tick--; ship.hullHp += amount; state.used += amount;
  }
  state.tick = Math.min(state.tick, 1);
  if (state.used >= budget - 1e-7) { state.working = false; state.reason = '材料耗尽'; }
  else if (ship.hullHp >= ceiling - 1e-7) { state.working = false; state.reason = '已达80%上限'; }
  else if (core.charges < 1) { state.working = false; state.reason = '储备不足'; }
}
export function hyperionRepairStatus(ship: Ship): string | undefined {
  const state = repairs.get(ship);
  if (!state || !has(ship.spec, M.repair)) return undefined;
  if (!repairOnline(ship)) return '抢修暂停';
  const wait = state.reason === '脱战等待' ? ` ${(Math.max(0, HYPERION_REPAIR.quiet - Math.min(state.quiet, ship.shield.sinceLastDamageTaken))).toFixed(1)}s` : '';
  const remaining = Math.max(0, 100 * (HYPERION_REPAIR.budget - state.used / ship.maxHullHp));
  return `抢修${state.reason}${wait} · 材料余${remaining.toFixed(1)}%船体`;
}
export function hyperionReactorStatus(ship: Ship): string {
  const core = hyperionReactor(ship);
  if (!has(ship.spec, M.reactor) || !core) return '旗舰反应堆未装配';
  const focus = has(ship.spec, M.focus) ? ' · 聚能/跃迁预热2.4s' : '';
  const repair = hyperionRepairStatus(ship);
  return `反应堆 ${core.charges}/${core.maxCharges} · 大和${hyperionYamatoCost(ship)} / 跃迁${HYPERION_REACTOR.jump}${focus}${repair ? ' | ' + repair : ''}`;
}
const meta = (cost: number, icon: string, builtInOnly = false) => ({ cost: { CAPITAL_SHIP: cost }, icon: `graphics/hullmods/${icon}.png`, uiTags: ['特殊'], manufacturer: '休伯利安专属', builtInOnly });
const onlyHyperion = (s: ShipSpec) => isHyperion(s) ? null : '仅限星际争霸休伯利安号';
const resources = (icon: string) => ({ textures: [`/game-assets/graphics/hullmods/${icon}.png`] });
export const hyperionHullMods: readonly HullModDefinition[] = [{
  id: M.reactor, name: '休伯利安 · 旗舰反应堆', status: 'implemented',
  refit: meta(0, 'flux_coil_adjunct', true), resources: resources('flux_coil_adjunct'), applicable: onlyHyperion,
  description: '内置0OP，不可卸下。为大和炮和战术跃迁提供同一100点储备，每秒恢复3点；大和消耗60，跃迁消耗75，运行互斥。成功发射/跃迁才扣能量，中断不扣。原生系统次数、恢复和冷却舰装仍生效。聚能回路与战地抢修会改变此资源的分配，不额外生成第二个储备池。Web改编，非SC2原始数值。',
  apply: installReactor,
}, {
  id: M.focus, name: '休伯利安 · 大和聚能回路', status: 'implemented',
  refit: meta(25, 'advanced_targeting_core'), resources: resources('advanced_targeting_core'), applicable: onlyHyperion, conflicts: [M.repair],
  description: '25OP。大和炮储备消耗60→45，基础冷却18→14秒；不增加单发伤害。代价是战术跃迁预热1.2→2.4秒，期间仍能受击和被过载/排散中断，落点需重新检查。与战地抢修系统互斥。卸下后恢复基础消耗、冷却和跃迁预热。',
}, {
  id: M.repair, name: '休伯利安 · 战地抢修系统', status: 'implemented',
  refit: meta(25, 'automated_repair_unit'), resources: resources('automated_repair_unit'), applicable: onlyHyperion, conflicts: [M.focus],
  description: '25OP。所有武器（含自动近防）及技能停火、连续6秒无盾/甲/结构受击后自动抢修：每秒消耗6点反应堆储备，恢复0.5%最大结构，最多修至80%。本场材料累计只能修20%最大结构；不修装甲、不复活。开火/受击、过载/排散/跃迁或撤退中断并重新等待；储备不足暂停。想要抢修需关闭自动开火、脱离接触。与大和聚能回路互斥。Web改编，不是原版自动修复单元。',
  apply: installRepair, advanceCombat: advanceRepair,
}];
