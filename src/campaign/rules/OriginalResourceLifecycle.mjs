/** Native Farming/Mining instance lifecycle. Economy, queue, cargo and planet effects use real services. */
import { requireThat } from '../core/Values.mjs';
import { blank, functional } from './OriginalIndustryState.mjs';
import { ORIGINAL_MILITARY_BASES as catalog } from './OriginalMilitaryBases.mjs';
import {
  ORIGINAL_RESOURCE_INDUSTRIES as resources, newOriginalResourceIndustry, validateOriginalResourceIndustry,
  unapplyOriginalLiveResourceIndustry, unapplyOriginalResourceItem,
} from './OriginalResourceIndustries.mjs';
import { originalIndustryDisruptionKey, readOriginalIndustryRuntime } from './OriginalIndustryRuntime.mjs';
import {
  validateOriginalCampaignMemory, originalCampaignMemoryContains, originalCampaignMemoryBoolean,
  setOriginalCampaignMemory, unsetOriginalCampaignMemory,
} from './OriginalCampaignMemory.mjs';
import { advanceOriginalBaseIndustryFrame } from './OriginalBaseIndustryFrame.mjs';
const f = Math.fround, check = (value, message) => requireThat(value, 'UNSUPPORTED_RESOURCE_LIFECYCLE', message);
const float = value => Number.isFinite(value) && f(value) === value;
const itemOwners = { soil_nanites: 'farming', mantle_bore: 'mining', plasma_dynamo: 'mining' };
export const hasOriginalResourceFrame = id => ['farming', 'aquaculture', 'mining'].includes(id);
function spec(id) {
  check(hasOriginalResourceFrame(id), 'Actual Farming/Mining plugin required');
  const result = catalog.industrySpecs[id];
  check(result && result.upgradeId === null && result.buildTime === 60, 'Actual native resource industry spec required');
  return result;
}
const ref = value => typeof value === 'string' && value.length > 0;
function validSpecial(id, special) {
  return special === null || special && ref(special.objectRef) && Object.hasOwn(itemOwners, special.id)
    && itemOwners[special.id] === id && (special.data === null || typeof special.data === 'string');
}
function method(runtime, name) { check(typeof runtime?.[name] === 'function', 'Actual resource lifecycle service required: ' + name); }
function sync(value, name) { check(!value?.then, name + ' must complete synchronously'); return value; }
function current(m, id) {
  spec(id);
  const row = validateOriginalResourceLifecycle(m).industries.find(row => row.active && row.entry.state.industryId === id);
  check(row, 'Actual active resource instance required'); return row;
}
function known(m, row) {
  check(validateOriginalResourceLifecycle(m).industries.includes(row), 'Actual current or retained resource instance required');
}
/** Older captures are explicitly unavailable, not repaired from current operating flags or installed items. */
export function restoreOriginalResourceLifecycle(saved, m, shareSpecial = value => value) {
  const selected = saved.industries.filter(i => hasOriginalResourceFrame(i.industryId));
  if (selected.some(i => !Object.hasOwn(i, 'buildCostOverride') || !Object.hasOwn(i, 'specialItem') || !i.runtimeInput
    || i.industryId === 'mining' && !Object.hasOwn(i, 'shownPlasmaNetVisuals'))) return null;
  const disruptions = [];
  const industries = selected.map(i => {
    const readback = readOriginalIndustryRuntime(i.runtimeInput), id = i.industryId;
    check(i.runtimeInput.industryId === id && i.classAlias === (id === 'mining' ? 'Mining' : 'Farming'), 'Resource capture class/id mismatch');
    check(i.building === i.runtimeInput.building && i.upgradeId === i.runtimeInput.upgradeId
      && i.improved === i.runtimeInput.improved, 'Conflicting BaseIndustry/runtime capture');
    const entries = m.industries.filter(e => e.state.industryId === id), finances = m.finances.filter(e => e.industryId === id);
    check(entries.length === 1 && finances.length === 1, 'Missing or duplicate shared resource industry/finance');
    const entry = entries[0];
    check(entry.operating.building === readback.operating.building && entry.operating.upgradeId === readback.operating.upgradeId
      && entry.operating.disrupted === readback.operating.disrupted && entry.modifiers.improved === readback.improved
      && entry.modifiers.aiCoreId === i.aiCoreId, 'Resource lifecycle disagrees with restored entry');
    const d = i.runtimeInput.disruption, old = disruptions.find(row => row.key === d.key);
    check(!old || old.present === d.present && Object.is(old.value, d.value) && old.expires.length === d.expires.length
      && old.expires.every((value, index) => Object.is(value, d.expires[index])), 'Conflicting shared Farming/Mining disruption capture');
    if (!old) disruptions.push(structuredClone(d));
    check(validSpecial(id, i.specialItem), 'Actual compatible resource SpecialItemData required');
    const special = i.specialItem === null ? null : shareSpecial(structuredClone(i.specialItem));
    check(validSpecial(id, special) && (i.specialItem === null ? special === null : special !== null && special.objectRef === i.specialItem.objectRef && special.id === i.specialItem.id
      && special.data === i.specialItem.data), 'SpecialItemData interning changed captured fields');
    check(i.buildTime === null || float(i.buildTime), 'Actual captured BaseIndustry buildTime required');
    return { objectRef: i.objectRef, active: true, entry, finances: finances[0], buildProgress: i.buildProgress,
      buildTime: Math.max(1, i.buildTime ?? 0), buildCostOverride: i.buildCostOverride, wasDisrupted: i.wasDisrupted,
      special, shownPlasmaNetVisuals: id === 'mining' ? i.shownPlasmaNetVisuals : null };
  });
  const result = { scope: 'native-resource-industry-lifecycle', nextObjectId: 0, memory: null, disruptions, messages: [], industries };
  validateOriginalResourceLifecycle({ ...m, resourceLifecycle: result });
  return result;
}
export function validateOriginalResourceLifecycle(m) {
  const s = m.resourceLifecycle;
  check(ref(m.objectRef) && ref(m.marketId) && typeof m.playerOwned === 'boolean', 'Actual resource lifecycle market identity required');
  check(s?.scope === 'native-resource-industry-lifecycle' && Number.isSafeInteger(s.nextObjectId) && s.nextObjectId >= 0
    && Array.isArray(s.industries) && Array.isArray(s.messages), 'Actual resource lifecycle capture required');
  check(Array.isArray(m.industries) && Array.isArray(m.finances), 'Actual live industry and financial rosters required');
  for (const field of ['objectRef', 'entry', 'finances']) check(new Set(s.industries.map(row => row[field])).size === s.industries.length, 'Split resource ' + field + ' identities');
  if (s.memory !== null) {
    validateOriginalCampaignMemory(s.memory); check(s.disruptions === null, 'Bound resource lifecycle cannot duplicate market Memory');
  } else {
    const keys = new Set(s.industries.map(row => originalIndustryDisruptionKey(row.entry.state.industryId)));
    check(Array.isArray(s.disruptions) && s.disruptions.length === keys.size && new Set(s.disruptions.map(d => d.key)).size === keys.size
      && s.disruptions.every(d => keys.has(d.key) && typeof d.present === 'boolean' && Array.isArray(d.expires) && d.expires.every(float)
        && (d.present ? ['boolean', 'string', 'number'].includes(typeof d.value) && (typeof d.value !== 'number' || float(d.value)) : d.value === null)),
    'Actual complete resource disruption capture required');
  }
  const activeIds = new Set(), specials = new Map();
  for (const row of s.industries) {
    const id = row.entry?.state.industryId; spec(id); validateOriginalResourceIndustry(row.entry.state); functional(row.entry.operating);
    check(row.entry.operating.upgradeId === null, 'Native resource plugins have no upgrade target; captured non-native upgrade is unsupported');
    check(ref(row.objectRef) && typeof row.active === 'boolean' && typeof row.wasDisrupted === 'boolean'
      && float(row.buildProgress) && float(row.buildTime) && row.buildTime >= 1
      && (row.buildCostOverride === null || float(row.buildCostOverride)), 'Actual resource BaseIndustry fields required');
    check(m.industries.filter(e => e === row.entry).length === (row.active ? 1 : 0)
      && m.finances.filter(e => e === row.finances).length === (row.active ? 1 : 0) && row.finances.industryId === id,
    'Lost active/retired resource industry/finance identities');
    if (row.active) { check(!activeIds.has(id), 'Duplicate active resource industry'); activeIds.add(id); }
    check(validSpecial(id, row.special) && (row.special?.id ?? null) === row.entry.modifiers.specialItemId, 'Lost resource SpecialItemData');
    if (row.special) {
      check(!specials.has(row.special.objectRef) || specials.get(row.special.objectRef) === row.special, 'Split shared SpecialItemData identity');
      specials.set(row.special.objectRef, row.special);
    }
    check(id === 'mining' ? typeof row.shownPlasmaNetVisuals === 'boolean' : row.shownPlasmaNetVisuals === null,
      'Actual Mining.shownPlasmaNetVisuals history required; never infer it from the installed item');
  }
  check(m.industries.filter(e => hasOriginalResourceFrame(e.state.industryId)).every(e => s.industries.some(row => row.active && row.entry === e)), 'Missing current resource instance');
  return s;
}
export function bindOriginalResourceMemory(m, mem) {
  const s = validateOriginalResourceLifecycle(m); validateOriginalCampaignMemory(mem);
  if (s.memory !== null) { check(s.memory === mem, 'Cannot replace bound resource market Memory'); return; }
  for (const d of s.disruptions) {
    const data = mem.data.find(row => row.key === d.key), expires = mem.expire.filter(row => row.key === d.key);
    check(Boolean(data) === d.present && (!d.present || Object.is(data.value, d.value)) && expires.length === d.expires.length
      && expires.every((row, index) => Object.is(row.timeLeft, d.expires[index])), 'Complete Memory disagrees with captured resource disruption');
  }
  s.memory = mem; s.disruptions = null;
}
function memory(m) { const mem = validateOriginalResourceLifecycle(m).memory; check(mem !== null, 'Resource frames require complete bound market Memory'); return mem; }
function isDisrupted(m, row, services) {
  const mem = memory(m), key = originalIndustryDisruptionKey(row.entry.state.industryId);
  return row.entry.operating.disrupted = originalCampaignMemoryContains(mem, key, services) && originalCampaignMemoryBoolean(mem, key, services);
}
export function syncOriginalResourceDisruption(m, services = {}) {
  for (const row of validateOriginalResourceLifecycle(m).industries) isDisrupted(m, row, services);
}
export function setOriginalResourceDisrupted(m, id, days, useMax = false, services = {}) {
  const row = current(m, id), mem = memory(m), key = originalIndustryDisruptionKey(id);
  check(float(days) && typeof useMax === 'boolean', 'Actual resource disruption duration required');
  isDisrupted(m, row, services);
  const duration = useMax ? Math.max(days, mem.expire.find(e => e.key === key)?.timeLeft ?? -1) : days;
  if (duration <= 0) unsetOriginalCampaignMemory(mem, key, services); else setOriginalCampaignMemory(mem, key, true, duration);
  // Farming and Mining inherit empty notifyDisrupted/disruptionFinished; no economic reapply here.
  syncOriginalResourceDisruption(m, services); return row.entry.operating.disrupted;
}
/** Native isAvailableToBuild only: no credits, industry-count limit, duplicate or command permission gate. */
export function isOriginalResourceIndustryAvailableToBuild(m, id, runtime = {}) {
  spec(id);
  check(Array.isArray(m.tags) && m.tags.every(tag => typeof tag === 'string') && Array.isArray(m.industries), 'Actual market tags and industry roster required');
  if (m.tags.includes('market_no_industries_allowed') || !m.industries.some(e => e.state.industryId === 'population')) return false;
  if (id !== 'mining') {
    method(runtime, 'readPlanetType'); const type = runtime.readPlanetType();
    check(type === null || typeof type === 'string' && type.length > 0, 'Actual planet type getter required; null means no planet');
    if ((id === 'aquaculture') !== (type === 'water')) return false;
  }
  check(Array.isArray(m.conditions) && m.conditions.every(c => typeof c.id === 'string'), 'Actual market conditions required');
  return m.conditions.some(c => Object.hasOwn(resources.conditions, c.id)
    && resources.conditions[c.id].industryId === (id === 'mining' ? 'mining' : 'farming'));
}
export function instantiateOriginalResourceIndustry(m, id) {
  const s = validateOriginalResourceLifecycle(m); spec(id); check(ref(m.objectRef), 'Actual market objectRef required');
  return { objectRef: 'created-resource-industry:' + m.objectRef + ':' + s.nextObjectId++, active: false,
    entry: { state: structuredClone(newOriginalResourceIndustry(id)), operating: { building: false, upgradeId: null, disrupted: false },
      modifiers: { aiCoreId: null, improved: false, specialItemId: null, adminSupplyBonus: 0, adminDemandReduction: 0,
        supplyBonusFromOther: blank(), demandReductionFromOther: blank() } },
    finances: { industryId: id, income: blank(), upkeep: blank() }, buildProgress: 0, buildTime: 1, buildCostOverride: null,
    wasDisrupted: false, special: null, shownPlasmaNetVisuals: id === 'mining' ? false : null };
}
export function addOriginalResourceIndustry(m, id, runtime) {
  const s = validateOriginalResourceLifecycle(m); spec(id);
  const existing = s.industries.find(row => row.active && row.entry.state.industryId === id); if (existing) return existing;
  memory(m); method(runtime, 'apply');
  const row = instantiateOriginalResourceIndustry(m, id); row.active = true;
  s.industries.push(row); m.industries.push(row.entry); m.finances.push(row.finances);
  isDisrupted(m, row, runtime.memoryServices); sync(runtime.apply(row), 'Resource constructor apply'); return row;
}
/** BaseIndustry.unapply unregisters this exact instance before old-item economic unapply. */
export function unapplyOriginalResourceRow(m, row, runtime) {
  known(m, row); method(runtime, 'unregisterImmigration');
  sync(runtime.unregisterImmigration(row), 'Resource immigration deregistration');
  unapplyOriginalLiveResourceIndustry(row.entry);
}
export function startBuildingOriginalResourceIndustry(m, row, runtime) {
  known(m, row); method(runtime, 'unregisterImmigration');
  row.entry.operating.building = true; row.entry.operating.upgradeId = null;
  row.buildProgress = 0; row.buildTime = spec(row.entry.state.industryId).buildTime;
  unapplyOriginalResourceRow(m, row, runtime);
}
/** Native setter, not a cargo transaction or installation eligibility command. */
export function setOriginalResourceSpecialItem(m, row, special, runtime = {}) {
  known(m, row); const id = row.entry.state.industryId;
  check(validSpecial(id, special), 'Actual compatible resource SpecialItemData required');
  if (special !== null) check(m.resourceLifecycle.industries.every(other => !other.special || other.special.objectRef !== special.objectRef || other.special === special), 'SpecialItemData must use the shared interned instance');
  const visualAction = id !== 'mining' ? null : special?.id === 'plasma_dynamo' ? true : row.shownPlasmaNetVisuals ? false : null;
  if (visualAction !== null) { method(runtime, 'readPlanet'); method(runtime, 'setMiningPlasmaVisuals'); }
  // Keep the same SpecialItemData object; do not clone or silently perform a full industry reapply.
  unapplyOriginalResourceItem(row.entry.state, row.entry.modifiers.specialItemId);
  row.special = special; row.entry.modifiers.specialItemId = special?.id ?? null;
  if (visualAction !== null) {
    const planet = runtime.readPlanet();
    check(planet === null || typeof planet === 'object' && !Array.isArray(planet) && !planet.then, 'Actual current planet object or explicit null required');
    if (planet !== null) {
      sync(runtime.setMiningPlasmaVisuals(planet, visualAction, row), 'Actual Mining planet visual changes');
      row.shownPlasmaNetVisuals = visualAction;
    }
    // Mining.applyVisuals/unapplyVisuals return before changing the historical flag for a null planet.
  }
}
/** Native removeIndustry; retained rows are not substituted or destroyed. */
export function removeOriginalResourceIndustry(m, id, runtime, { mode = null, forUpgrade = false } = {}) {
  const row = current(m, id);
  check([null, 'LOCAL', 'REMOTE'].includes(mode) && typeof forUpgrade === 'boolean', 'Actual native removal mode required');
  method(runtime, 'unregisterImmigration');
  if (mode !== null && !forUpgrade && (row.special !== null || row.entry.modifiers.aiCoreId !== null)) {
    method(runtime, 'notifyBeingRemoved');
    sync(runtime.notifyBeingRemoved(row, mode, forUpgrade), 'Actual core/item return to native interaction cargo');
  }
  unapplyOriginalResourceRow(m, row, runtime);
  m.industries.splice(m.industries.indexOf(row.entry), 1); m.finances.splice(m.finances.indexOf(row.finances), 1); row.active = false;
  // Base removal neither calls setSpecialItem(null) nor clears Mining's plasma visuals.
  return row;
}
function finish(m, row, runtime) {
  check(row.entry.operating.upgradeId === null, 'Resource upgrade completion is not a native supported path');
  for (const name of ['apply', 'unregisterImmigration', 'buildNextInQueue']) method(runtime, name);
  if (m.playerOwned) method(runtime, 'timestamp');
  row.entry.operating.building = false; row.buildProgress = 0; row.buildTime = 1;
  if (m.playerOwned) {
    const timestamp = runtime.timestamp(); check(typeof timestamp === 'string', 'Actual campaign timestamp required');
    m.resourceLifecycle.messages.push({ marketId: m.marketId, industryId: row.entry.state.industryId, industryRef: row.objectRef,
      kind: 'finished', timestamp, clickAction: 'COLONY_INFO' });
  }
  sync(runtime.buildNextInQueue(), 'Actual construction queue continuation');
  unapplyOriginalResourceRow(m, row, runtime); sync(runtime.apply(row), 'Resource completion apply');
  return row.objectRef;
}
export function advanceOriginalResourceIndustryFrame(m, row, days, runtime, { colonyDebug = false } = {}) {
  known(m, row); memory(m);
  const finishedRef = advanceOriginalBaseIndustryFrame(row, days, { colonyDebug }, {
    isDisrupted: () => isDisrupted(m, row, runtime?.memoryServices), disruptionFinished: () => {},
    finishBuildingOrUpgrading: () => finish(m, row, runtime),
  });
  return { scope: 'native-resource-industry-frame', industryRef: row.objectRef, finishedRef };
}
