import { bundledShipPacks } from './BundledShipPacks';
import { shipSystemDefinitions, resolveSystemId } from '../extensions/ship-systems/Registry';
import { hullModDefinitions } from '../extensions/HullMods';
import { weaponEffects } from '../extensions/weapon-effects/Registry';
import type { ShipPack, ShipPackCapabilityRequirement } from './ShipPack';

export const SHIP_PACK_ABI = 'ship-pack-host-1';
export interface HostCapability {
  id: string; version: number; combat: boolean; campaign: boolean; detail: string;
}
const knownId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,95}$/.test(id)
  && !['constructor', 'prototype', '__proto__'].includes(id);
function version(value: unknown): number[] | undefined {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value)) return undefined;
  const parts = value.split('.').map(Number);
  return parts.every(Number.isSafeInteger) ? parts : undefined;
}
function atLeast(actual: string, minimum: string): boolean {
  const a = version(actual), b = version(minimum);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
}

/** Host registry facts, not an install file's claim of implementation readiness. */
export function hostCapability(id: string): HostCapability | undefined {
  const base = {id, version: 1, campaign: false};
  if (id.startsWith('behavior:')) {
    const behavior = id.slice('behavior:'.length);
    return behavior === 'data-only-1' || bundledShipPacks.some(pack => pack.behavior === behavior)
      ? {...base, combat: true, detail: '可信宿主已编译行为；未声明战役模拟支持。'} : undefined;
  }
  if (id.startsWith('system:')) {
    const definition = shipSystemDefinitions.get(resolveSystemId(id.slice('system:'.length)));
    return definition ? {...base, version: shipSystemDefinitions.capabilityVersion(definition.id)!, combat: !definition.unavailable,
      detail: definition.implementationDetails ?? definition.description ?? definition.name} : undefined;
  }
  if (id.startsWith('hullmod:')) {
    const definition = hullModDefinitions.get(id.slice('hullmod:'.length));
    return definition ? {...base, version: hullModDefinitions.capabilityVersion(definition.id)!, combat: definition.support ? definition.support.combat === 'implemented' : definition.status === 'implemented',
      detail: definition.support?.summary ?? definition.description ?? definition.name} : undefined;
  }
  const effect = /^effect:(beam|hit|advance):(.+)$/.exec(id);
  if (effect) {
    const definition = weaponEffects.get(effect[2]);
    return definition ? {...base, version: weaponEffects.capabilityVersion(definition.id)!, combat: typeof definition[effect[1] as 'beam' | 'hit' | 'advance'] === 'function', detail: '注册武器效果：' + effect[1]} : undefined;
  }
  return undefined;
}

/** Include baselines and all opt-in variants so a declaration cannot hide a real dependency. */
export function shipPackCapabilityRequirements(pack: ShipPack): ShipPackCapabilityRequirement[] {
  const requirements = new Map<string, ShipPackCapabilityRequirement>();
  const add = (id: string, minVersion = 1, scope: 'combat' | 'campaign' = 'combat') => {
    const key = scope + ':' + id, previous = requirements.get(key);
    if (!previous || previous.minVersion < minVersion) requirements.set(key, {id, minVersion, scope});
  };
  add('behavior:' + pack.behavior);
  const seen = new Set<object>();
  const walk = (value: unknown, key = ''): void => {
    if (typeof value === 'string') {
      if (['systemType', 'defenseSystemType', 'rightClickSystemType', 'systemTypes'].includes(key)) add('system:' + resolveSystemId(value));
      // Campaign-only metadata carries no combat effect requirement. An explicit
      // request for its combat/campaign implementation still fails normally.
      if (['hullMods', 'builtInHullMods', 'sMods'].includes(key)
        && hullModDefinitions.get(value)?.support?.combat !== 'not-applicable') add('hullmod:' + value);
      if (key === 'beamEffect') add('effect:beam:' + value);
      if (key === 'onHitEffect') add('effect:hit:' + value);
      if (key === 'everyFrameEffect') add('effect:advance:' + value);
    } else if (value && typeof value === 'object' && !seen.has(value)) {
      seen.add(value);
      if (Array.isArray(value)) value.forEach(item => walk(item, key));
      else for (const [childKey, child] of Object.entries(value)) walk(child, childKey);
    }
  };
  walk(pack.ships); walk(pack.weapons); walk(pack.baselines); walk(pack.variants);
  if (pack.capabilities !== undefined) {
    if (!Array.isArray(pack.capabilities) || pack.capabilities.length > 1024) throw new Error('包能力声明无效。');
    for (const requirement of pack.capabilities) {
      if (!requirement || typeof requirement.id !== 'string' || requirement.id.length > 256 || !Number.isSafeInteger(requirement.minVersion)
        || requirement.minVersion < 1 || !['combat', 'campaign'].includes(requirement.scope)) throw new Error('包能力版本或范围无效。');
      add(requirement.id, requirement.minVersion, requirement.scope);
    }
  }
  return [...requirements.values()].sort((a, b) => a.id.localeCompare(b.id) || a.scope.localeCompare(b.scope));
}
export function validateShipPackCapabilities(pack: ShipPack): void {
  if (!pack || pack.schema !== 1 || pack.hostABI !== SHIP_PACK_ABI || !knownId(pack.id) || !knownId(pack.mainHull) || !version(pack.version))
    throw new Error('单舰包身份、格式或宿主版本不兼容。');
  if (!Array.isArray(pack.ships) || !pack.ships.length || pack.ships.length > 256 || !Array.isArray(pack.weapons) || pack.weapons.length > 512
    || !pack.baselines || typeof pack.baselines !== 'object' || Array.isArray(pack.baselines) || !pack.refit
    || !Array.isArray(pack.variants) || !pack.variants.length) throw new Error('单舰包内容目录不完整。');
  for (const table of [pack.baselines, pack.refit.ships, pack.refit.weapons, pack.refit.wings ?? {}, pack.refit.shipStatus, pack.refit.weaponStatus ?? {}]) {
    if (!table || typeof table !== 'object' || Array.isArray(table) || Object.keys(table).some(id => !knownId(id))) throw new Error('单舰包目录键无效。');
  }
  if (pack.ships.some(ship => !ship || !knownId(ship.id)) || pack.weapons.some(weapon => !weapon || !knownId(weapon.id))
    || pack.variants.some(variant => !variant || !knownId(variant.id) || !variant.fit || variant.fit.hullId !== pack.mainHull))
    throw new Error('单舰包内容身份无效。');
  const shipIds = new Set(pack.ships.map(ship => ship.id)), weaponIds = new Set(pack.weapons.map(weapon => weapon.id));
  if (Object.entries(pack.baselines).some(([id, ship]) => !ship || ship.id !== id || !shipIds.has(id))
    || Object.keys(pack.refit.ships).some(id => !shipIds.has(id)) || Object.keys(pack.refit.shipStatus).some(id => !shipIds.has(id))
    || Object.keys(pack.refit.weapons).some(id => !weaponIds.has(id)) || Object.keys(pack.refit.weaponStatus ?? {}).some(id => !weaponIds.has(id)))
    throw new Error('单舰包目录接管了包外实体。');
  const trusted = bundledShipPacks.find(source => source.id === pack.id);
  if (pack.behavior !== 'data-only-1' && (!trusted || trusted.behavior !== pack.behavior || trusted.mainHull !== pack.mainHull))
    throw new Error('宿主没有该包声明的可信行为：' + pack.behavior);
  for (const requirement of shipPackCapabilityRequirements(pack)) {
    const capability = hostCapability(requirement.id);
    if (!capability || capability.version < requirement.minVersion || !capability[requirement.scope])
      throw new Error(`${pack.id} 缺少 ${requirement.scope} 宿主能力 ${requirement.id} v${requirement.minVersion}${capability ? '：' + capability.detail : ''}`);
  }
}

/** Resolve only declared installed dependencies, in stable dependency-first order. */
export function shipPackDependencyClosure(pack: ShipPack, available: readonly ShipPack[]): ShipPack[] {
  const catalog = new Map<string, ShipPack>();
  for (const candidate of available) {
    if (catalog.has(candidate.id)) throw new Error('重复单舰包：' + candidate.id);
    catalog.set(candidate.id, candidate);
  }
  catalog.set(pack.id, pack);
  const pending = new Set<string>(), completed = new Set<string>(), result: ShipPack[] = [];
  const visit = (current: ShipPack) => {
    if (pending.has(current.id)) throw new Error('单舰包存在循环依赖：' + current.id);
    if (completed.has(current.id)) return;
    pending.add(current.id);
    if (current.dependencies !== undefined && (!Array.isArray(current.dependencies) || current.dependencies.length > 64)) throw new Error('单舰包依赖声明无效。');
    const ids = new Set<string>();
    for (const dependency of current.dependencies ?? []) {
      if (!dependency || !knownId(dependency.id) || !version(dependency.minVersion) || ids.has(dependency.id)) throw new Error('单舰包依赖身份或版本无效。');
      ids.add(dependency.id);
      const target = catalog.get(dependency.id);
      if (!target || !atLeast(target.version, dependency.minVersion)) throw new Error(`${current.id} 需要已启用的 ${dependency.id} >= ${dependency.minVersion}`);
      visit(target);
    }
    pending.delete(current.id); completed.add(current.id);
    if (current.id !== pack.id) result.push(current);
  };
  visit(pack);
  return result;
}
/** Shared by preflight, the browser catalog and worker admission. No publishing here. */
export function validateRuntimeShipPacks(packs: readonly ShipPack[]): void {
  if (!Array.isArray(packs) || packs.length > 64) throw new Error('单舰包目录超出限制。');
  const ids = {ships: new Set<string>(), weapons: new Set<string>(), variants: new Set<string>()};
  const wingIds = new Set<string>();
  for (const pack of packs) {
    validateShipPackCapabilities(pack); shipPackDependencyClosure(pack, packs);
    for (const kind of ['ships', 'weapons', 'variants'] as const) for (const item of pack[kind] ?? []) {
      if (ids[kind].has(item.id)) throw new Error(`重复单舰包 ${kind} ID：${item.id}`);
      ids[kind].add(item.id);
    }
    for (const id of Object.keys(pack.refit.wings ?? {})) {
      if (wingIds.has(id)) throw new Error('重复单舰包航空 ID：' + id);
      wingIds.add(id);
    }
  }
}
