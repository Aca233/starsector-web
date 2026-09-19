import { sameTeam } from "../../simulation/CombatTeams";
import type { Ship } from '../../simulation/Ship';
import type { ShipSystem } from '../../simulation/ShipSystem';
import type { SystemAIContext, SystemModifiers, SystemWorld, SystemWeaponModifiers } from './Types';
import { nativeSystem } from './NativeSystemFactory';
import { mineStrike } from './MineStrike';
import { advanceJetsAI, advanceWeaponBoostAI, offensiveManeuverAllowed } from './SystemAI';

const allWeapons = (value: SystemWeaponModifiers): SystemModifiers['weapons'] => ({ BALLISTIC: value, ENERGY: value, MISSILE: value });
const alive = (ship: Ship) => !ship.isDead && ship.hullHp > 0;
const ready = (ship: Ship, system = ship.system) => alive(ship) && !ship.flux.isOverloaded && !ship.flux.isVenting && !system.isActive
  && ship.flux.totalFlux + system.fluxCostPerUse < ship.flux.maxFlux * .95;

/** Web policy, not the native BasicShipAI: defend against assessed imminent damage, not proximity alone. */
function defensiveAI({ ship, system = ship.system, tactical }: SystemAIContext): void {
  const threatened = (tactical?.threat.imminentDamage ?? 0) > 0;
  if (system.definition.toggle && system.isActive) {
    if ((!threatened && (tactical?.quietFor ?? 0) > 1) || ship.flux.fluxPercent > .9) system.deactivate();
  } else if (threatened && alive(ship) && !ship.flux.isOverloaded && !ship.flux.isVenting) {
    if (system === ship.defenseSystem) ship.activateDefenseSystem(); else if (ready(ship, system)) system.activate();
  }
}
function driveAI({ ship, system = ship.system, target, distance, tactical, angleDiff }: SystemAIContext): void {
  const useful = alive(target) && !!tactical && offensiveManeuverAllowed(tactical) && Math.abs(angleDiff) < .2
    && ship.getFlameoutRatio() < 1 && distance > tactical.desiredRange + 200;
  if (system.isActive && system.definition.toggle) {
    if (!useful) system.deactivate();
  } else if (useful && ready(ship, system)) system.activate();
}
const damper = nativeSystem('damper', {
  modifiers: (_system, _capacity, ship) => {
    const mult = ship?.spec.hullSize === 'CRUISER' || ship?.spec.hullSize === 'CAPITAL_SHIP' ? .5 : .33;
    return { armorDamageMultiplier: mult, hullDamageMultiplier: mult, empDamageMultiplier: mult };
  }, advanceAI: defensiveAI,
});
const omegaDamage = { armorDamageMultiplier: .5, hullDamageMultiplier: .5, empDamageMultiplier: .5,
  weapons: allWeapons({ fluxCostMultiplier: .5 }) };
const damperOmega = nativeSystem('damper_omega', { modifiers: () => ({ ...omegaDamage, repairTimeMultiplier: .1 }), advanceAI: defensiveAI });
const cryoflux = nativeSystem('cryoflux', { modifiers: () => omegaDamage, advanceAI: defensiveAI });
function burnModifiers(system: ShipSystem, speed: number, acceleration: number): SystemModifiers {
  return { speedFlat: system.state === 'OUT' ? 0 : speed * system.effectLevel, accelerationFlat: acceleration * system.retainedEffectLevel };
}
const infernium = nativeSystem('inferniuminjector', {
  description: '切换烈焰喷射：航速+50且+50%，加速度+800且+800%，转向加速度+400%，最大转速+50%；每秒1软幅能。保持原生noAccel限制，不擅自添加强制前进。',
  canActivate: ship => !ship.engineController.isFlamedOut && ship.engineController.state !== 'DISABLED',
  controls: {blockAcceleration:true,releaseOnOut:true}, visuals: {engineBoost:true},
  modifiers: s => ({speedFlat:s.state === 'OUT'?0:50*s.effectLevel,speedPercent:s.state === 'OUT'?0:50*s.effectLevel,
    accelerationFlat:800*s.retainedEffectLevel,accelerationPercent:800*s.retainedEffectLevel,
    turnAccelerationPercent:400*s.retainedEffectLevel,turnRatePercent:s.state === 'OUT'?0:50*s.effectLevel}),
  onAdvance: (ship, _dt, _world, system) => { if (ship.engineController.isFlamedOut || ship.engineController.state === 'DISABLED') system.deactivate(); },
});
const microburn = nativeSystem('microburn', { modifiers: system => burnModifiers(system, 600, 1200), advanceAI: driveAI });
const microburnOmega = nativeSystem('microburn_omega', {
  initialize: (system, ship) => { if (['FRIGATE','DESTROYER','CRUISER'].includes(ship.spec.hullSize ?? '')) system.maxCharges = system.charges = 2; },
  modifiers: system => burnModifiers(system, 600, 1200), advanceAI: driveAI,
});
const combatBurn = nativeSystem('combat_burn', { modifiers: system => burnModifiers(system, 100, 100), advanceAI: driveAI });
const dynamicStabilizer = nativeSystem('dynamic_stabilizer', {
  modifiers: system => ({ accelerationPercent: 200 * system.retainedEffectLevel, decelerationPercent: 200 * system.retainedEffectLevel,
    turnAccelerationFlat: 30 * system.retainedEffectLevel, turnAccelerationPercent: 200 * system.retainedEffectLevel,
    turnRateFlat: system.state === 'OUT' ? 0 : 15, turnRatePercent: system.state === 'OUT' ? 0 : 100,
    weapons: allWeapons({ rateOfFireMultiplier: 1 + system.effectLevel }), beamDamageMultiplier: 1.5, recoilMultiplier: .5 }),
  advanceAI: context => { advanceWeaponBoostAI(context, 'BALLISTIC'); advanceWeaponBoostAI(context, 'ENERGY'); advanceJetsAI(context); },
});
const temporalShell = nativeSystem('temporalshell', {
  modifiers: system => ({ timeMultiplier: 1 + 2 * system.effectLevel * system.effectLevel }),
  advanceAI: context => { advanceWeaponBoostAI(context, 'BALLISTIC'); advanceWeaponBoostAI(context, 'ENERGY'); defensiveAI(context); },
});
const finiteMissiles = (ship: Ship) => ship.weapons.filter(w => w.spec.weaponType === 'MISSILE' && Number.isFinite(w.ammo) && w.spec.maxAmmo !== undefined);
function reloadAI(context: SystemAIContext, cooldownOnly: boolean): void {
  const { ship, system = ship.system, target, tactical } = context;
  if (!ready(ship, system) || !alive(target) || target.isPhased || tactical?.waypoint) return;
  const weapons = finiteMissiles(ship).filter(w => !w.isDisabled);
  const useful = weapons.filter(w => cooldownOnly ? w.ammo > 0 && w.burstRemaining === 0 && w.cooldownTimer > system.chargeUpDuration : w.ammo < w.spec.maxAmmo! * .5);
  if (useful.length && useful.length >= weapons.length * .5) system.activate();
}
const fastMissileRacks = nativeSystem('fastmissileracks', {
  onActivate: (ship, _world, system) => { for (const w of ship.weapons) if (w.spec.weaponType === 'MISSILE' && w.burstRemaining === 0 && w.cooldownTimer > system.chargeUpDuration) w.cooldownTimer = system.chargeUpDuration; },
  advanceAI: context => reloadAI(context, true),
});
const forgeVats = nativeSystem('forgevats', {
  onActivate: ship => { for (const w of finiteMissiles(ship)) w.ammo = Math.min(w.spec.maxAmmo!, w.ammo + (w.baseMaxAmmo ?? w.spec.maxAmmo!)); },
  advanceAI: context => reloadAI(context, false),
});
const forgeVatsStation = nativeSystem('forgevats_station', {
  onActivate: ship => { for (const w of finiteMissiles(ship)) w.ammo = w.spec.maxAmmo!; },
  advanceAI: context => reloadAI(context, false),
});

/** Target eligibility shared by input, AI and execution. Never fall through an explicit invalid selection to a different ship. */
function selectTarget(ship: Ship, range: number, filter: (target: Ship) => boolean): Ship | undefined {
  const valid = (target: Ship) => alive(target) && target !== ship && !sameTeam(target, ship) && !target.isPhased && target.isVisibleTo(ship.teamId)
    && ship.pos.distanceTo(target.pos) <= range * ship.hullStats.systemRangeMultiplier + ship.spec.collisionRadius + target.spec.collisionRadius && filter(target);
  if (ship.currentTargetShip) return valid(ship.currentTargetShip) ? ship.currentTargetShip : undefined;
  const origin = ship.fireControlMode === 'MANUAL' ? ship.aimTargetWorld : ship.pos;
  return ship.combatShips.filter(valid).reduce<Ship | undefined>((best, target) => !best || target.pos.distanceTo(origin) < best.pos.distanceTo(origin) ? target : best, undefined);
}
const nonFighter = (ship: Ship) => ship.spec.hullSize !== 'FIGHTER';
const entropyTarget = (ship: Ship) => selectTarget(ship, 1500, nonFighter);
const disruptTarget = (ship: Ship) => selectTarget(ship, 500, target => nonFighter(target) && !target.flux.isOverloaded && !target.flux.isVenting);
const interdictTarget = (ship: Ship) => selectTarget(ship, 1000, target => target.getFlameoutRatio() < 1 && target.engineController.engines.some(e => !e.isDisabled));
function targetedAI(context: SystemAIContext): void {
  if (ready(context.ship, context.system) && !context.tactical?.waypoint) (context.system ?? context.ship.system).activate();
}
const entropyAmplifier = nativeSystem('entropyamplifier', {
  selectTarget: entropyTarget,
  onActivate: (ship, _world, source) => {
    const target = source.activationTarget; if (!target) return;
    const serial = source.activationSerial, key = 'entropy:' + ship.id + ':' + source.type;
    const valid = () => alive(ship) && alive(target) && source.isActive && source.activationSerial === serial;
    target.damageTakenModifiers.set(key, () => valid() ? 1 + .5 * source.effectLevel : 1);
    target.statusEffects.set(key, { advance: () => { if (valid()) return true; target.damageTakenModifiers.delete(key); return false; } });
  }, advanceAI: targetedAI,
});
const acausalDisruptor = nativeSystem('acausaldisruptor', {
  selectTarget: disruptTarget,
  onActive: (_ship, _world, system) => {
    const target = system.activationTarget;
    if (target && alive(target) && !target.flux.isOverloaded && !target.flux.isVenting) target.flux.overloadFor(1);
  },
  advanceAI: targetedAI,
});
function interdictEngines(target: Ship, world: SystemWorld): void {
  const engines = target.engineController.engines;
  const order = engines.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(world.combatRandom.next() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const limit = target.spec.hullSize === 'FIGHTER' ? 1 : target.isEngineGlowExtended ? .99 : .5;
  let contribution = 0, disabled = false;
  for (const index of order) if (!engines[index].isDisabled && contribution + engines[index].contribution <= limit + 1e-9) {
    target.triggerEngineFlameout(index); contribution += engines[index].contribution; disabled = true;
  }
  if (!disabled) { const index = order.find(i => !engines[i].isDisabled); if (index !== undefined) target.triggerEngineFlameout(index); }
}
const interdictor = nativeSystem('interdictor', {
  selectTarget: interdictTarget,
  onActive: (_ship, world, system) => {
    const target = system.activationTarget; if (!target || !alive(target)) return;
    const targets = target.spec.hullSize === 'FIGHTER' ? world.ships.filter(other => alive(other) && other.spec.hullSize === 'FIGHTER'
      && sameTeam(other, target) && other.pos.distanceTo(target.pos) <= 200) : [target];
    for (const other of targets) interdictEngines(other, world);
  }, advanceAI: targetedAI,
});
const travelDrive = nativeSystem('traveldrive', {
  audio:{loop:'system_travel_drive_loop'},resources:{sounds:['system_travel_drive_loop']},
  modifiers:s=>({speedFlat:s.state==='OUT'?0:600*s.effectLevel,accelerationFlat:600*s.retainedEffectLevel}),
  description:'巡航推进：最高航速与加速度最多+600；退出时撤销航速加成。全周期禁用武器、护盾、转向及横移，强制向前。',
});
const stationMineStrike = nativeSystem('mine_strike_station', {
  resources:mineStrike.resources,
  onActive:(ship,world,system)=>mineStrike.onActive!(ship,{...world,deployMine:(pos,source)=>world.deployMine(pos,source,3500 * source.hullStats.systemRangeMultiplier)},system),
  advanceAI:({ship,system=ship.system,target,distance,tactical})=>{
    if(!target.isDead && !target.isPhased && !tactical?.waypoint && distance<3500 * ship.hullStats.systemRangeMultiplier+ship.spec.collisionRadius)system.activate();
  },
  description:'3500射程的传送感应空雷，7次储备，每秒恢复0.33次；不套用普通空雷的1000射程限制。',
});
export const nativeCombatSystems = [infernium, travelDrive, stationMineStrike,damper, damperOmega, cryoflux, microburn, microburnOmega, combatBurn, dynamicStabilizer,
  temporalShell, fastMissileRacks, forgeVats, forgeVatsStation, entropyAmplifier, acausalDisruptor, interdictor];
