import { needsLaunchers } from './Requirements';
import { sameTeam } from "../../simulation/CombatTeams";
import { Vector2 } from '../../math/Vector2';
import type { Ship } from '../../simulation/Ship';
import type { ShipSystem } from '../../simulation/ShipSystem';
import type { ShipSystemDefinition, SystemWorld } from './Types';
import { nativeSystem } from './NativeSystemFactory';
import { teleportDefinition } from './PhaseTeleporter';
import { systemEmpArc } from './SystemArc';
import deploymentCosts from './native-lash-deployment-costs.json';

const costs: Record<string, number> = deploymentCosts;
const initialCharges = 0;
const onEnergyLash = (system: ShipSystem) => { system.charges = 1; system.activate(); };
const speed = (s: ShipSystem) => ({ speedFlat: 100 * s.effectLevel, accelerationFlat: 200 * s.effectLevel, decelerationFlat: 200 * s.effectLevel });
const incursion = nativeSystem('incursion_mode', {
  initialCharges, onEnergyLash, tacticalMode: 'ASSAULT',
  controls: { forceAutofire: true }, preventAIVenting: s => s.effectLevel > 0,
  description: '由友方能量之鞭激活：航速+100、加减速+200、实弹/能量弹药恢复最高×5、幅能耗散最高×3；自动开火并进攻，AI期间不自主排幅（玩家仍可排幅）。初始无次数。',
  modifiers: s => ({ ...speed(s), dissipationMultiplier: 1 + 2 * s.effectLevel,
    weapons: { BALLISTIC: { ammoRegenMultiplier: 1 + 4 * s.effectLevel }, ENERGY: { ammoRegenMultiplier: 1 + 4 * s.effectLevel } } }),
});
const vented = new WeakMap<ShipSystem, number>();
const extraction = nativeSystem('extraction_protocol', {
  initialCharges, onEnergyLash, tacticalMode: 'EXTRACT', controls: { forceAutofire: true, releaseOnOut: true },
  preventAIVenting: s => s.effectLevel > 0,
  description: '由友方能量之鞭激活：加速撤离，退场阶段补满非系统武器弹药并开始排幅。初始无次数。',
  modifiers: speed, onReset:s=>{vented.delete(s);},
  onAdvance: (ship, _dt, _world, s) => {
    if (s.state !== 'OUT' || vented.get(s) === s.activationSerial) return;
    vented.set(s, s.activationSerial);
    for (const w of ship.weapons) if (Number.isFinite(w.ammo) && w.spec.maxAmmo !== undefined) w.ammo = w.spec.maxAmmo;
    ship.startVenting();
  },
});
const threatDisplacer: ShipSystemDefinition = {
  ...teleportDefinition('DISPLACER_THREAT', 'displacer_threat', '移位器', 300, 3, 0), initialCharges,
  onEnergyLash: s => { s.charges = s.maxCharges; },
  description: '初始无次数，由友方能量之鞭补满3次闪现；沿速度方向移动300，不自然恢复。',
};
interface Discharge { target: Ship; elapsed: number; next: number; slots: Vector2[] }
const discharges = new WeakMap<ShipSystem, Discharge>();
export function validLashTarget(ship: Ship, other: Ship): boolean {
  if (other === ship || other.isDead || other.hullHp <= 0 || other.isDocked || other.spec.hullSize === 'FIGHTER') return false;
  const range = 1500 * ship.hullStats.systemRangeMultiplier + ship.spec.collisionRadius + other.spec.collisionRadius;
  if (ship.pos.distanceTo(other.pos) > range) return false;
  if (!sameTeam(ship, other)) return other.isVisibleTo(ship.teamId);
  return other.allSystems.some(system => system.definition.onEnergyLash && !system.isActive && !system.isCoolingDown)
    && !other.flux.isOverloaded && !other.flux.isVenting;
}
export function findLashTarget(ship: Ship): Ship | undefined {
  if (ship.currentTargetShip) return validLashTarget(ship, ship.currentTargetShip) ? ship.currentTargetShip : undefined;
  const point = ship.fireControlMode === 'MANUAL' ? ship.aimTargetWorld : ship.pos;
  return ship.combatShips.filter(s => validLashTarget(ship, s)).sort((a,b) => a.pos.distanceTo(point) - b.pos.distanceTo(point))[0];
}
function advanceDischarge(ship: Ship, dt: number, world: SystemWorld, s: ShipSystem): void {
  const state = discharges.get(s);
  if (!state) return;
  state.elapsed += dt;
  while (state.next < state.slots.length && state.elapsed + 1e-9 >= state.next * .03) {
    const from = state.slots[state.next++].clone().rotate(ship.facingRad).add(ship.pos);
    systemEmpArc(ship, state.target, from, world, 0, 1500);
  }
  if (state.next >= state.slots.length) discharges.delete(s);
}
const energyLash = nativeSystem('energy_lash', {
  installReason: needsLaunchers,
  description: '1500范围内激活友方受控系统；对敌方从每个SYSTEM挂点发射1500 EMP电弧，电弧间隔0.03秒。命中相位舰使其过载1秒；冷却随目标变化。',
  implementationDetails: '原版时序、逐挂点EMP、护盾拦截、相位过载与目标冷却；Web目标/战术策略及电弧表现。碎片蜂群相位转换依赖蜂群控制器，尚不计为完成。',
  canActivate: ship => !!findLashTarget(ship) && !!ship.spec.systemWeaponSlots?.length,
  selectTarget: findLashTarget,
  onActive: (ship, world, s) => {
    const target = s.activationTarget;
    if (!target || !validLashTarget(ship, target)) { s.maxCooldown = 0; return; }
    if (sameTeam(target, ship)) {
      const slot = ship.spec.systemWeaponSlots?.find(p => p.slotSize === 'MEDIUM');
      const from = slot ? new Vector2(slot.x, slot.y).rotate(ship.facingRad).add(ship.pos) : ship.pos;
      world.spawnSystemArc?.(from, target.pos);
      for (const system of target.allSystems) if (!system.isActive && !system.isCoolingDown) system.definition.onEnergyLash?.(system, target, ship);
      s.maxCooldown = Math.min(10, 2 + (costs[target.spec.id] ?? 0) * .33) * ship.hullStats.systemCooldownMultiplier;
    } else {
      const phased = target.isPhased;
      if (phased) target.flux.overloadFor(1);
      s.maxCooldown = Math.min(10, (2 + world.combatRandom.next() * 3) * (phased ? 2 : 1)) * ship.hullStats.systemCooldownMultiplier;
      discharges.set(s, { target, elapsed: 0, next: 0, slots: (ship.spec.systemWeaponSlots ?? []).map(p => new Vector2(p.x, p.y)) });
      advanceDischarge(ship, 0, world, s);
    }
  },
  onAdvance: advanceDischarge, onReset:s=>{discharges.delete(s);},
  advanceAI: ({ ship, system = ship.system }) => {
    if (system.isActive || system.isCoolingDown || ship.flux.isVenting || ship.flux.isOverloaded) return;
    const friendly = ship.combatShips.filter(t => validLashTarget(ship,t) && sameTeam(t, ship))
      .find(t => t.allSystems.some(system => system.type === 'DISPLACER_THREAT' && system.charges < system.maxCharges) || t.currentTargetShip !== null);
    const previous = ship.currentTargetShip;
    if (friendly) ship.currentTargetShip = friendly;
    if (findLashTarget(ship)) system.activate();
    ship.currentTargetShip = previous;
  },
});
/** Native unused DISPLACER configuration: range zero is a phase window, not a damage boost. */
const conversion = nativeSystem('energy_conversion', {
  phase: { vulnerableChargeUp: false, vulnerableChargeDown: false },
  controls: { blockFluxDissipation: true, blockWeapons: true, blockShields: true },
  description: '原地相位：0.5秒进入、2秒退出，期间不可被常规攻击命中且不耗散；3次库存，每10秒恢复一次。不虚构增伤或能量转化。',
  advanceAI: ({ ship, tactical, system = ship.system }) => { if ((tactical?.threat.imminentDamage ?? 0) > 0) system.activate(); },
});
export const energyLashSystems = [incursion, extraction, threatDisplacer, energyLash, conversion];
