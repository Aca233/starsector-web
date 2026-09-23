import raw from '../data/reference-resource-industries.json' with { type: 'json' };
import { identifier, integer, requireThat, immutableJSON } from '../core/Values.mjs';
import { economyShape } from './OriginalMarketEconomy.mjs';
import { blank, bool, size, stat, unmodified, put, commodity, functional, get, quantity, updateBonuses, validateIndustryState } from './OriginalIndustryState.mjs';
export const ORIGINAL_RESOURCE_INDUSTRIES = immutableJSON(raw);
const kinds = ['farming', 'aquaculture', 'mining'], R = ORIGINAL_RESOURCE_INDUSTRIES;
const kind = id => requireThat(kinds.includes(id), 'UNSUPPORTED_RESOURCE_INDUSTRY', 'Only Farming/Mining commodity methods are implemented');
export function validateOriginalResourceIndustry(state) { validateIndustryState(state); kind(state.industryId); }
/** Only for a known newly constructed industry, never an implicit migration/capture. */
export function newOriginalResourceIndustry(industryId) {
  kind(industryId); return immutableJSON({ schemaVersion: 1, industryId, supplyBonus: blank(), demandReduction: blank(), supply: {}, demand: {} });
}
/** One surveyed, unsuppressed ResourceDepositsCondition.apply call. No implicit reapply/steady-state loop. */
export function applyOriginalResourceDeposit(input) {
  economyShape(input, ['conditionId', 'modId', 'marketSize', 'industries'], 'resource deposit application');
  identifier(input.conditionId); identifier(input.modId); size(input.marketSize);
  const condition = R.conditions[input.conditionId];
  requireThat(Object.hasOwn(R.conditions, input.conditionId) && condition, 'UNSUPPORTED_RESOURCE_CONDITION', 'Only native resource-deposit conditions are implemented');
  // Modifier suffixes must also fit the persisted identifier contract.
  identifier(input.modId + '_0'); identifier(input.modId + '_1');
  requireThat(Array.isArray(input.industries) && input.industries.length <= kinds.length, 'UNSUPPORTED_RESOURCE_INDUSTRY', 'Expected resource-industry roster');
  const ids = new Set();
  for (const entry of input.industries) {
    economyShape(entry, ['state', 'operating'], 'resource industry roster entry'); validateOriginalResourceIndustry(entry.state); functional(entry.operating);
    requireThat(!ids.has(entry.state.industryId), 'UNSUPPORTED_RESOURCE_INDUSTRY', 'Duplicate industry'); ids.add(entry.state.industryId);
  }
  const industries = structuredClone(input.industries);
  let entry = industries.find(i => i.state.industryId === condition.industryId);
  if (!entry && condition.industryId === 'farming') entry = industries.find(i => i.state.industryId === 'aquaculture');
  if (entry) {
    const { state } = entry, id = condition.commodityId;
    if (functional(entry.operating)) {
      quantity(state, 'supply', input.modId + '_0', id, (condition.addMarketSize ? input.marketSize : 0) + condition.baseModifier);
      quantity(state, 'supply', input.modId + '_1', id, condition.modifier);
    } else {
      const s = get(state, 'supply', id);
      put(s, 'flat', input.modId + '_0', 0, true); put(s, 'flat', input.modId + '_1', 0, true);
    }
    validateOriginalResourceIndustry(state);
  }
  return immutableJSON({ industries, targetIndustryId: entry?.state.industryId ?? null });
}
/** Commodity part of Farming/Mining.apply, with actual prior modifiers and available heavy machinery. */
export function applyOriginalResourceIndustry(input) {
  economyShape(input, ['state', 'marketSize', 'operating', 'available', 'modifiers'], 'resource-industry application');
  validateOriginalResourceIndustry(input.state); size(input.marketSize); const active = functional(input.operating);
  economyShape(input.available, ['heavy_machinery'], 'resource-production deficit inputs');
  integer(input.available.heavy_machinery, 'available heavy machinery', -65536);
  requireThat(input.available.heavy_machinery <= 65536, 'UNSUPPORTED_RESOURCE_INDUSTRY', 'Available quantity exceeds native supported range');
  // This legacy detached path has no finance/immigration/item/planet callbacks.
  // Admission in live loading/finance/accessibility does NOT widen this algorithm.
  requireThat(input.modifiers?.specialItemId === null, 'UNSUPPORTED_INDUSTRY_ITEM',
    'Detached resource apply requires specialItemId=null; installed items require the live resource callback');
  const state = structuredClone(input.state), id = state.industryId, modId = 'ind_' + id + '_0';
  updateBonuses(state, input.modifiers, { alphaSupplyBonus: true, improvementSupplyBonus: true });
  quantity(state, 'demand', modId, 'heavy_machinery', input.marketSize - (id === 'aquaculture' ? 0 : 3));
  if (id === 'mining') quantity(state, 'demand', modId, 'drugs', input.marketSize);
  const deficit = Math.max(Math.trunc(stat(get(state, 'demand', 'heavy_machinery'))) - input.available.heavy_machinery, 0);
  for (const c of id === 'mining' ? ['ore', 'rare_ore', 'organics', 'volatiles'] : ['food']) {
    if (!unmodified(get(state, 'supply', c))) quantity(state, 'supply', modId, c, -deficit);
  }
  if (!active) state.supply = {};
  validateOriginalResourceIndustry(state); return immutableJSON(state);
}
/** Feeds the existing max-per-industry aggregation without summing industries or inventing legality. */
export function originalResourceIndustryOutput(state, context) {
  validateOriginalResourceIndustry(state); economyShape(context, ['commodityId', 'illegal'], 'commodity legality context');
  commodity(context.commodityId); bool(context.illegal, 'native commodity illegality');
  return immutableJSON({ id: state.industryId, supply: stat(state.supply[context.commodityId] ?? blank()), demand: stat(state.demand[context.commodityId] ?? blank()), supplyLegal: !context.illegal, demandLegal: !context.illegal });
}

// ItemEffectsRepo.java:80-91,268-375,422-433; special_items.csv:18,20,23.
// These are economic callbacks, not item installation commands or planet visuals.
const RESOURCE_ITEMS = immutableJSON({
  soil_nanites: { industryId: 'farming', supplyBonus: 2, commodities: [] },
  mantle_bore: { industryId: 'mining', supplyBonus: 3, commodities: ['ore', 'rare_ore', 'organics'] },
  plasma_dynamo: { industryId: 'mining', supplyBonus: 3, commodities: ['volatiles'] },
});
const check = (ok, message) => requireThat(ok, 'UNSUPPORTED_RESOURCE_INDUSTRY', message);
/**
 * special_items.csv:18,20,23. Compatibility/admission only, NOT live environmental
 * requirements: a loaded item may remain installed while its effect is disabled.
 * No item (null) is handled separately by callers, not reported as supported.
 */
export function isSupportedOriginalResourceItem(industryId, itemId) {
  return typeof itemId === 'string' && Object.hasOwn(RESOURCE_ITEMS, itemId)
    && RESOURCE_ITEMS[itemId].industryId === industryId;
}
function resourceItem(industryId, itemId) {
  if (itemId === null) return null;
  identifier(itemId, 'resource industry item');
  requireThat(isSupportedOriginalResourceItem(industryId, itemId),
    'UNSUPPORTED_INDUSTRY_ITEM', 'Unknown or incompatible resource industry item');
  return RESOURCE_ITEMS[itemId];
}
function resourceConditions(market) {
  check(Array.isArray(market.conditions) && market.conditions.length <= 128, 'Actual market conditions required');
  const ids = market.conditions.map(condition => identifier(condition.id, 'market condition'));
  check(new Set(ids).size === ids.length, 'Expected unique actual market conditions');
  return ids;
}
function unapplyResourceItem(state, itemId, effect) {
  if (!effect) return;
  if (itemId === 'soil_nanites') {
    // BoostIndustryInstallableItemEffect.unapply uses modifyFlat(0), not unmodifyFlat.
    put(state.supplyBonus, 'flat', itemId, 0);
  } else {
    // A zero supply write removes this source only and does not refresh historical ind_sb.
    for (const id of effect.commodities) quantity(state, 'supply', itemId, id, 0);
  }
}
function applyResourceItem(market, state, itemId, effect, runtime) {
  if (!effect) return;
  // Read the current conditions at the item phase, after the financial callback. Neither
  // survey nor suppression filters belong here: native getUnmetRequirements uses false.
  const conditions = resourceConditions(market);
  let enabled;
  if (itemId === 'soil_nanites') {
    enabled = !conditions.some(id => {
      const commodityId = Object.hasOwn(R.conditions, id) ? R.conditions[id].commodityId : null;
      return commodityId === 'rare_ore' || commodityId === 'volatiles';
    });
  } else {
    check(typeof runtime.readPlanetIsGasGiant === 'function', 'Mining items require the actual planet gas-giant getter; null means no planet');
    const gas = runtime.readPlanetIsGasGiant();
    if (gas !== null) bool(gas, 'actual planet gas-giant getter');
    // Native requirements allow a null planet for BOTH GAS_GIANT and NOT_A_GAS_GIANT.
    enabled = itemId === 'mantle_bore' ? gas !== true && !conditions.includes('habitable') : gas !== false;
  }
  if (!enabled) {
    unapplyResourceItem(state, itemId, effect);
  } else if (itemId === 'soil_nanites') {
    put(state.supplyBonus, 'flat', itemId, effect.supplyBonus);
  } else {
    // LinkedHashSet order follows market conditions, not the list of item commodities.
    const affected = new Set();
    for (const id of conditions) {
      const commodityId = Object.hasOwn(R.conditions, id) ? R.conditions[id].commodityId : null;
      if (effect.commodities.includes(commodityId)) affected.add(commodityId);
    }
    for (const id of affected) quantity(state, 'supply', itemId, id, effect.supplyBonus);
  }
}
/**
 * One shared mutable Farming/Mining.apply. No captured availability, implicit unapply,
 * resource-condition reapply, lifecycle, immigration registration, or natural-frame work.
 * The return value is a detached read-only snapshot; entry.state itself remains mutable.
 */
export function applyOriginalLiveResourceIndustry(market, entry, runtime) {
  validateOriginalResourceIndustry(entry.state); size(market.size); functional(entry.operating);
  check(runtime && typeof runtime.applyFinances === 'function' && typeof runtime.readCommodityAvailable === 'function' && typeof runtime.registerImmigration === 'function',
    'Actual synchronous finance and lazy commodity callbacks required');
  const state = entry.state, id = state.industryId;
  const specialItemId = entry.modifiers.specialItemId, effect = resourceItem(id, specialItemId);
  updateBonuses(state, { ...entry.modifiers, specialItemId: null }, { alphaSupplyBonus: true, improvementSupplyBonus: true });
  // BaseIndustry.apply(true): finance can trigger lazy reads of OLD commodity quantities,
  // but must already see the rebuilt supply/demand bonuses. Do not pre-read availability.
  const finances = runtime.applyFinances();
  check(finances !== null && typeof finances === 'object' && !finances.then, 'Actual synchronous industry finance result required');
  // The base AI/improvement special methods are empty for Farming and Mining.
  const registration=runtime.registerImmigration();check(!registration?.then, 'Immigration registration must be synchronous');
  applyResourceItem(market, state, specialItemId, effect, runtime);
  const n = market.size, modId = 'ind_' + id + '_0';
  size(n);
  quantity(state, 'demand', modId, 'heavy_machinery', n - (id === 'aquaculture' ? 0 : 3));
  if (id === 'mining') quantity(state, 'demand', modId, 'drugs', n);
  // BaseIndustry.getMaxDeficit reads demand BEFORE invoking the actual lazy getter.
  // There is exactly one such read here. Mining's drugs deficit belongs to immigration,
  // not production, and Farming's lobster output is not among its deficit targets.
  const demand = Math.trunc(stat(get(state, 'demand', 'heavy_machinery')));
  const available = runtime.readCommodityAvailable('heavy_machinery');
  integer(available, 'available heavy machinery', -65536);
  check(available <= 65536, 'Available quantity exceeds native supported range');
  const deficit = Math.max(demand - available, 0);
  for (const commodityId of id === 'mining' ? ['ore', 'rare_ore', 'organics', 'volatiles'] : ['food']) {
    if (!unmodified(get(state, 'supply', commodityId))) quantity(state, 'supply', modId, commodityId, -deficit);
  }
  // Native supply.clear() preserves the map identity; it does not clear demand or uninstall the item.
  if (!functional(entry.operating)) for (const commodityId of Object.keys(state.supply)) delete state.supply[commodityId];
  validateOriginalResourceIndustry(state);
  return immutableJSON(state);
}
/** Economic part of BaseIndustry.setSpecialItem: unapply only the OLD installed item. */
export function unapplyOriginalResourceItem(state, specialItemId) {
  validateOriginalResourceIndustry(state);
  unapplyResourceItem(state, specialItemId, resourceItem(state.industryId, specialItemId));
  validateOriginalResourceIndustry(state);
}
/**
 * Economic part of Farming/Mining.unapply on the shared entry. The base special AI and
 * improvement methods are empty here; leave all commodity and other bonus history intact.
 * The caller remains responsible for transient immigration deregistration.
 */
export function unapplyOriginalLiveResourceIndustry(entry) {
  unapplyOriginalResourceItem(entry.state, entry.modifiers.specialItemId);
}
