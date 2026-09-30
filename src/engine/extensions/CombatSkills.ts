import type { ShipSpec } from '../content/ShipSpec';
import type { WeaponSpec } from '../simulation/Weapon';
import type { Ship } from '../simulation/Ship';
import type { HullModStats, HullModWeaponStats } from './HullMods';

/** Combat presets only. No campaign skill points, unlocks, crew losses or logistics. */
export type CombatSkillLoadout = Record<string, 1 | 2>;
export interface CombatSkillDefinition {
  id: string;
  name: string;
  source: string;
  normal: string;
  elite: string;
  stats?: (spec: ShipSpec, level: number, weaponOP: number) => Partial<HullModStats>;
  weaponStats?: (weapon: WeaponSpec, level: number) => Partial<HullModWeaponStats>;
  rangePercent?: (weapon: WeaponSpec, level: number) => number;
}
const civilian = (s: ShipSpec) => {
  const traits = [...(s.sourceHullTraits ?? []), ...(s.builtInHullMods ?? []), ...(s.hullMods ?? [])];
  return traits.includes('civgrade') ? !traits.includes('militarized_subsystems') : traits.includes('CIVILIAN');
};
const maneuver = (bonus: number) => ({ accelerationPercent: bonus, decelerationPercent: bonus, turnAccelerationPercent: bonus * 2, turnRatePercent: bonus });
const definitions: CombatSkillDefinition[] = []; // Native officer skills removed; no authored skills yet.
export const combatSkillDefinitions: readonly Readonly<CombatSkillDefinition>[] = Object.freeze(definitions.map(d => Object.freeze(d)));
const byId = new Map(combatSkillDefinitions.map(d => [d.id, d]));
export function combatSkillErrors(input: unknown): string[] {
  if (input === undefined) return [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return ['舰长战斗技能配置必须是对象'];
  return Object.entries(input).flatMap(([id, level]) => !byId.has(id) ? ['尚未接入的战斗技能：' + id]
    : level !== 1 && level !== 2 ? ['技能等级只能为普通或精英：' + id] : []);
}
export function combatSkillLevel(spec: ShipSpec, id: string): number { return spec.captainSkills?.[id] ?? 0; }
export function skillHullModifiers(spec: ShipSpec, weaponOP: number): Partial<HullModStats>[] {
  const errors = combatSkillErrors(spec.captainSkills);
  if (errors.length) throw new Error(errors.join('；'));
  return Object.entries(spec.captainSkills ?? {}).map(([id, level]) => byId.get(id)!.stats?.(spec, level, weaponOP) ?? {});
}
export function skillWeaponModifiers(spec: ShipSpec, weapon: WeaponSpec): Partial<HullModWeaponStats>[] {
  return Object.entries(spec.captainSkills ?? {}).map(([id, level]) => byId.get(id)?.weaponStats?.(weapon, level) ?? {});
}
export function skillRangePercent(spec: ShipSpec, weapon: WeaponSpec): number {
  return Object.entries(spec.captainSkills ?? {}).reduce((sum, [id, level]) => sum + (byId.get(id)?.rangePercent?.(weapon, level) ?? 0), 0);
}
export function polarizedArmorLevel(ship: Ship): number {
  if (!combatSkillLevel(ship.spec, 'polarized_armor')) return 0;
  return ship.shield.type === 'NONE' ? .5 : Math.max(0, Math.min(1, ship.flux.hardFlux / ship.flux.maxFlux));
}
const regenerated = new WeakMap<Ship, number>();
/** Ship-local listeners use subjective combat time. A fresh encounter constructs fresh Ships. */
export function advanceCombatSkills(ship: Ship, dt: number): void {
  if (ship.isDead || !(dt > 0) || combatSkillLevel(ship.spec, 'combat_endurance') !== 2) return;
  const used = regenerated.get(ship) ?? 0;
  const limit = Math.max(2000, ship.maxHullHp * .5);
  const repair = Math.max(0, Math.min(limit - used, ship.maxHullHp * .005 * dt, ship.maxHullHp - ship.hullHp));
  if (repair > 0) { ship.hullHp += repair; regenerated.set(ship, used + repair); }
}
