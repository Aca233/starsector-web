import { effectState } from '../../../extensions/EffectState';
import { applyComponentDamage } from './ComponentDamage';
import { Vector2 } from '../../../math/Vector2';
import type { Beam } from '../../Weapon';
import type { Ship } from '../../Ship';
import type { SimulationRandom } from '../../SimulationRandom';
import type { WeaponSimContext } from './WeaponSimContext';
import { sound } from '../../../audio/SoundManager';

/** IntervalUtil carries no overshoot; its next interval starts on the next
 * eligible advance, even if that frame has a zero dpsDuration. */
export function advanceTachyonInterval(beam: Beam, hasTarget: boolean, random: SimulationRandom): boolean {
  const state = effectState(beam, 'tachyon', () => ({
    interval: .2 + random.next() * .1, elapsed: 0, intervalElapsed: false, wasZero: true
  }));
  if (!hasTarget || (beam.brightness ?? 1) < 1 || beam.damageActive === false) return false;
  const duration = beam.dpsDuration ?? 0;
  const amount = state.wasZero ? duration : 0;
  state.wasZero = duration <= 0;
  if (state.intervalElapsed) {
    state.interval = .2 + random.next() * .1;
    state.elapsed = 0;
    state.intervalElapsed = false;
  }
  state.elapsed += amount;
  state.intervalElapsed = state.elapsed >= state.interval;
  return state.intervalElapsed;
}

export interface EmpShipTarget { local: Vector2; weight: number; kind: 'ENGINE' | 'WEAPON' | 'CENTER'; index: number }

/** EmpArcEntity.getPotentialTargets(pierce=true): engines then damageable
 * nondecorative modules, including temporarily disabled ones, weighted 1/distance. */
export function pickEmpShipTarget(ship: Ship, from: Vector2, random: SimulationRandom): EmpShipTarget {
  const localFrom = from.clone().sub(ship.pos).rotate(-ship.facingRad);
  const choices: EmpShipTarget[] = [];
  const add = (local: Vector2, kind: EmpShipTarget['kind'], index: number) => {
    const distance = local.distanceTo(localFrom);
    if (distance <= 100000) choices.push({ local, kind, index, weight: 1 / Math.max(1e-6, distance) });
  };
  ship.spec.engineSlots?.forEach((slot, index) => add(new Vector2(slot.x, slot.y), 'ENGINE', index));
  ship.weapons.forEach((mount, index) => { if (mount.mountType !== 'HIDDEN') add(mount.relativePos.clone(), 'WEAPON', index); });
  if (!choices.length) return {local: new Vector2(), weight: 1, kind: 'CENTER', index: -1};
  let pick = random.next() * choices.reduce((sum, c) => sum + c.weight, 0);
  for (const choice of choices) { pick -= choice.weight; if (pick <= 0) return choice; }
  return choices[choices.length - 1];
}

/** Shield G.isWithinArc uses at least one degree; it is not a radial-distance test. */
export function isWithinEmpShieldArc(ship: Ship, point: Vector2): boolean {
  const shield = ship.shield;
  if (!shield.isActive || shield.type === 'NONE' || shield.type === 'PHASE') return false;
  const center = ship.getShieldCenter();
  const facing = shield.type === 'FRONT' ? ship.facingRad : shield.facingAngleRad;
  const angle = Math.atan2(point.y - center.y, point.x - center.x) - facing;
  const diff = Math.atan2(Math.sin(angle), Math.cos(angle));
  return Math.abs(diff) <= Math.max(1, shield.currentArcDeg) * Math.PI / 360;
}

export function advanceTachyonLance(beam: Beam, target: Ship | undefined, ctx: WeaponSimContext): void {
  if (!advanceTachyonInterval(beam, !!target, ctx.random) || !target || target.isDead) return;
  const from = (beam.rayEndPrevFrame ?? beam.endPos).clone();
  const hitShield = isWithinEmpShieldArc(target, from);
  const chance = (target.flux.hardFlux / target.flux.maxFlux - .1) * target.shieldPiercedMultiplier;
  if (hitShield && !(ctx.random.next() < chance)) return;
  const point = pickEmpShipTarget(target, from, ctx.random);
  const end = point.local.clone().rotate(target.facingRad).add(target.pos);
  const damage = beam.damagePerSec * (beam.damageMultiplier ?? 0) * .25;
  const emp = (beam.baseEmpPerSec ?? beam.empPerSec ?? 0) * .5;
  ctx.fx.spawnNativeEmpArc(from, end, target, beam.width + 5,
    beam.fringeColor ?? [...beam.color, 255], beam.coreColor ?? [255, 255, 255, 255]);
  const result = target.armor.takeDamage(point.local, damage * target.crDamageTakenMultiplier, 'ENERGY');
  target.applyHullDamage(result.hullDamage);
  ctx.fx.spawnArmorDamageSparks(target, point.local, result.armorDamage);
  const source = (ctx.ships ?? [ctx.playerShip, ctx.enemyShip, ...ctx.fighters]).find(s => s.id === beam.sourceShipId);
  applyComponentDamage(target, point.local, result, emp, source);
  // Count the arc's raw EMP once, independently of whether armor absorbed all energy.
  ctx.statsTracker?.recordDamageDealt(beam.isPlayer ?? false, 'ENERGY', result.armorDamage, 'ARMOR', emp);
  if (result.hullDamage > 0) ctx.statsTracker?.recordDamageDealt(beam.isPlayer ?? false, 'ENERGY', result.hullDamage, 'HULL');
  const variant = 1 + Math.min(2, Math.floor(ctx.visualRandom.next() * 3));
  sound.playAtPos('tachyon_lance_emp_impact_0' + variant, end, ctx.playerShip.pos, .3, 1.5);
  if (target.hullHp <= 0) ctx.handleShipDestruction(target);
}
