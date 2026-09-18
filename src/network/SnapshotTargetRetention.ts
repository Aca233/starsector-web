import { CombatEngine } from '../engine/simulation/CombatEngine';
import { Ship } from '../engine/simulation/Ship';
import { isImmutableMetadata } from '../engine/extensions/Immutable';

const nativeVisible = Ship.prototype.isVisibleTo;
const nativeVastBulk = Object.getOwnPropertyDescriptor(Ship.prototype, 'hasVastBulk')?.get;
const arrayFilter = Array.prototype.filter, arrayIncludes = Array.prototype.includes;
const stringIncludes = String.prototype.includes, nativeApply = Reflect.apply;
const arraySpecies = Object.getOwnPropertyDescriptor(Array, Symbol.species)?.get;

function data(object: object, key: string): PropertyDescriptor | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor : undefined;
}

/** Check without invoking getters. The batch caller must separately guarantee no
 * Proxies: descriptor/prototype checks alone cannot prove that in JavaScript. */
function nativeTargetFields(ship: Ship): boolean {
  if (Object.getPrototypeOf(ship) !== Ship.prototype
    || Object.hasOwn(ship, 'hasVastBulk') || Object.hasOwn(ship, 'isVisibleTo')) return false;
  const team = data(ship, 'teamId'), dead = data(ship, 'isDead');
  const mask = data(ship, 'visibilityMask'), overflow = data(ship, 'visibilityOverflow');
  const target = data(ship, 'currentTargetShip'), combatShips = data(ship, 'combatShips');
  const mode = data(ship, 'fireControlMode'), targetId = data(ship, 'playerTargetId');
  const spec = data(ship, 'spec')?.value;
  if (!Number.isSafeInteger(team?.value) || typeof dead?.value !== 'boolean'
    || !Number.isSafeInteger(mask?.value) || typeof overflow?.value !== 'string'
    || !target?.writable || !combatShips?.writable || typeof mode?.value !== 'string'
    || !targetId || (targetId.value !== null && typeof targetId.value !== 'string')
    || !spec || !isImmutableMetadata(spec)) return false;
  // hasVastBulk reads these arrays. Branded metadata is recursively copied/frozen
  // and accessor-free; require own fields to exclude inherited property hooks.
  for (const key of ['builtInHullMods', 'hullMods']) {
    const mods = data(spec, key)?.value;
    if (!Array.isArray(mods) || !isImmutableMetadata(mods)
      || Object.getPrototypeOf(mods) !== Array.prototype || Object.hasOwn(mods, 'includes')) return false;
  }
  return true;
}

/** All-or-nothing shortcut for the native findHostile retained-target branch.
 * The original first filters EVERY candidate before retaining a target. Skipping
 * those reads is legal only when ALL predicates are pure, including non-targets.
 * If even one auto target needs selection, run the untouched original loop for
 * everyone: no distance calls/tie-breaking are replaced, and no custom selection
 * can invalidate an audit midway through an optimized phase.
 *
 * No dependency on full/sparse wire shapes: both endpoints have already been fully
 * unpacked (including craft lifecycle/deployment) before this fresh audit runs. */
export function canRetainSnapshotTargets(
  engine: CombatEngine,
  ships: ReadonlyMap<string, Ship>,
  roster: readonly Ship[],
  nativeFindHostile: CombatEngine['findHostile'],
): boolean {
  if (Object.hasOwn(engine, 'findHostile')
    || Object.getOwnPropertyDescriptor(CombatEngine.prototype, 'findHostile')?.value !== nativeFindHostile
    || Object.getOwnPropertyDescriptor(Ship.prototype, 'isVisibleTo')?.value !== nativeVisible
    || Object.getOwnPropertyDescriptor(Ship.prototype, 'hasVastBulk')?.get !== nativeVastBulk
    || Object.getOwnPropertyDescriptor(Array.prototype, 'filter')?.value !== arrayFilter
    || Object.getOwnPropertyDescriptor(Array.prototype, 'includes')?.value !== arrayIncludes
    || Object.getOwnPropertyDescriptor(String.prototype, 'includes')?.value !== stringIncludes
    || Object.getOwnPropertyDescriptor(Reflect, 'apply')?.value !== nativeApply
    || Object.getOwnPropertyDescriptor(Array.prototype, 'constructor')?.value !== Array
    || Object.getOwnPropertyDescriptor(Array, Symbol.species)?.get !== arraySpecies
    || Object.getPrototypeOf(roster) !== Array.prototype
    || ['filter', 'includes', 'constructor'].some(key => Object.hasOwn(roster, key))) return false;
  const audited = new Set<Ship>();
  for (const ship of ships.values()) {
    if (!nativeTargetFields(ship)) return false;
    audited.add(ship);
  }
  const active = new Set(roster);
  for (const ship of active) if (!audited.has(ship) && !nativeTargetFields(ship)) return false;
  for (const ship of ships.values()) {
    if (ship.fireControlMode === 'MANUAL') continue;
    const target = ship.currentTargetShip;
    // teamId is a numeric own data field on both sides, so sameTeam is equality;
    // the isPlayer fallback in combatTeam is unreachable in this audited branch.
    if (!target || !active.has(target) || target.hasVastBulk || target.isDead
      || !target.isVisibleTo(ship.teamId) || target.teamId === ship.teamId) return false;
  }
  return true;
}