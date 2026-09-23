import {isSupportedOriginalMilitaryItem} from './OriginalMilitaryBases.mjs';
import {isSupportedOriginalGroundDefenseItem} from './OriginalGroundDefenses.mjs';
import { isSupportedOriginalPortItem, originalPortItemRequirements, applyOriginalPortItemAccessibility } from './OriginalPortItems.mjs';
import raw from '../data/reference-market-accessibility.json' with { type: 'json' };
import { identifier, isRecord, requireThat, immutableJSON } from '../core/Values.mjs';
import { economyShape, economyFloat, resolveOriginalEconomyMutable, originalEconomyShipping } from './OriginalMarketEconomy.mjs';
import { bool, size, functional } from './OriginalIndustryState.mjs';
import { ORIGINAL_INDUSTRY_COMMODITIES } from './OriginalCivicIndustries.mjs';
import { ORIGINAL_PRODUCTION_INDUSTRIES } from './OriginalProductionIndustries.mjs';
import { ORIGINAL_SPECIAL_INDUSTRIES } from './OriginalSpecialIndustries.mjs';
import { ORIGINAL_RESOURCE_INDUSTRIES, isSupportedOriginalResourceItem } from './OriginalResourceIndustries.mjs';
export const ORIGINAL_MARKET_ACCESSIBILITY = immutableJSON(raw);
const R = ORIGINAL_MARKET_ACCESSIBILITY, S = R.settings, f = Math.fround;
const roundHundredth = value => f(Math.floor(f(value * 100) + 0.5) / 100);
function nativeFloat(value, name, min = -(2 ** 24), max = 2 ** 24) { const n = economyFloat(value, name, min, max); requireThat(value === n, 'UNSUPPORTED_MARKET_ACCESS', 'Captured accessibility input must be native float'); return n; }
function validateBonus(bonus) {
  const value = resolveOriginalEconomyMutable({ base: 0, modifiers: bonus });
  for (const mods of Object.values(bonus)) for (const m of mods) nativeFloat(m.value, 'accessibility modifier');
  return value;
}
function flat(bonus, id, value, always = false) {
  const i = bonus.flat.findIndex(m => m.id === id);
  if (value === null) { if (i >= 0) bonus.flat.splice(i, 1); }
  else if (i >= 0) bonus.flat[i] = { id, value };
  else if (always || value !== 0) bonus.flat.push({ id, value });
}
function group(id) { if (id !== null) identifier(id, 'economy group'); }
export function originalFreeMarketAccessBonus(daysActive) {
  nativeFloat(daysActive, 'free-market elapsed days', 0); const C = R.freeMarketSettings;
  const value = f(f(C.MIN_ACCESS_BONUS) + f(f(daysActive / f(C.MAX_DAYS)) * f(f(C.MAX_ACCESS_BONUS) - f(C.MIN_ACCESS_BONUS))));
  return Math.max(f(0.01), Math.min(f(C.MAX_ACCESS_BONUS), roundHundredth(value)));
}
function validateIndustryAccessibility(input) {
  validateBonus(input.accessibility); bool(input.hasSpaceport, 'prior hasSpaceport'); size(input.marketSize); bool(input.firstQueuedIndustryHasSpaceportTag, 'first construction queue item spaceport tag');
  requireThat(Array.isArray(input.industries) && input.industries.length <= 64, 'UNSUPPORTED_MARKET_ACCESS', 'Expected ordered local industries');
  const known = ORIGINAL_INDUSTRY_COMMODITIES, seen = new Set();
  for (const i of input.industries) {
    economyShape(i, ['industryId', 'operating', 'aiCoreId', 'improved', 'specialItemId'], 'local accessibility industry'); identifier(i.industryId); functional(i.operating);
    requireThat(Object.hasOwn(known.industries, i.industryId) || Object.hasOwn(known.resourceIndustryPlugins, i.industryId) || Object.hasOwn(ORIGINAL_PRODUCTION_INDUSTRIES.industries, i.industryId) || Object.hasOwn(ORIGINAL_SPECIAL_INDUSTRIES.industries, i.industryId), 'UNSUPPORTED_MARKET_ACCESS', 'Unknown local industry accessibility effects');
    requireThat(!seen.has(i.industryId), 'UNSUPPORTED_MARKET_ACCESS', 'Duplicate industry'); seen.add(i.industryId);
    requireThat([null, 'alpha_core', 'beta_core', 'gamma_core'].includes(i.aiCoreId), 'UNSUPPORTED_MARKET_ACCESS', 'Unknown AI core'); bool(i.improved, 'improved');
    if (i.specialItemId !== null) {
      identifier(i.specialItemId);
      // These resource items have no accessibility effect; requirements belong to their live item phase.
      const supported = isSupportedOriginalResourceItem(i.industryId, i.specialItemId) || isSupportedOriginalMilitaryItem(i.industryId,i.specialItemId) || isSupportedOriginalGroundDefenseItem(i.industryId,i.specialItemId) || isSupportedOriginalPortItem(i.industryId, i.specialItemId) || Object.hasOwn(ORIGINAL_PRODUCTION_INDUSTRIES.items, i.specialItemId) && ORIGINAL_PRODUCTION_INDUSTRIES.items[i.specialItemId].industryIds.includes(i.industryId) || i.specialItemId === 'dealmaker_holosuite' && i.industryId === 'commerce';
      requireThat(supported, 'UNSUPPORTED_INDUSTRY_ITEM', 'Unknown or incompatible industry item accessibility effects');
    }
  }
  const portItems = input.industries.filter(i => isSupportedOriginalPortItem(i.industryId, i.specialItemId));
  requireThat((portItems.length > 0) === Object.hasOwn(input, 'portItemContext'), 'UNSUPPORTED_MARKET_ACCESS', 'Missing or unexpected port item getter context');
  for (const i of portItems) originalPortItemRequirements({ industryId: i.industryId, itemId: i.specialItemId, context: input.portItemContext });
}
/** Industry-only part of native reapplication; condition stats must already reflect the preceding condition phase. */
export function reapplyOriginalIndustryAccessibility(input) {
  economyShape(input, ['accessibility', 'hasSpaceport', 'marketSize', 'firstQueuedIndustryHasSpaceportTag', 'industries', ...(isRecord(input) && Object.hasOwn(input, 'portItemContext') ? ['portItemContext'] : [])], 'industry accessibility');
  validateIndustryAccessibility(input);
  let bonus = structuredClone(input.accessibility), hasSpaceport = input.hasSpaceport;
  const constructing = input.industries.some(i => i.industryId !== 'population' && i.operating.building && i.operating.upgradeId === null);
  const portFirst = input.firstQueuedIndustryHasSpaceportTag && !constructing;
  for (const i of input.industries) {
    const prefix = 'ind_' + i.industryId;
    if (i.industryId === 'population') {
      flat(bonus, prefix + '_0', null); flat(bonus, prefix + '_1', null);
      if (!hasSpaceport && !portFirst) flat(bonus, prefix + '_0', f(S.accessibilityNoSpaceport));
      const amount = f(R.populationSizeBonus[input.marketSize]); if (amount > 0) flat(bonus, prefix + '_1', amount);
    } else if (i.industryId === 'spaceport' || i.industryId === 'megaport') {
      const item = action => { if (isSupportedOriginalPortItem(i.industryId, i.specialItemId)) bonus = structuredClone(applyOriginalPortItemAccessibility({ industryId: i.industryId, itemId: i.specialItemId, action, context: action === 'apply' ? input.portItemContext : null, accessibility: bonus }).accessibility); };
      const unapply = () => { flat(bonus, prefix + '_2', null); flat(bonus, 'spaceport_improve', null); item('unapply'); hasSpaceport = false; for (const n of [0, 1, 2]) flat(bonus, prefix + '_' + n, null); };
      unapply();
      if (i.aiCoreId === 'alpha_core') flat(bonus, prefix + '_2', f(R.portSettings.ALPHA_CORE_ACCESSIBILITY));
      if (i.improved) flat(bonus, 'spaceport_improve', f(R.portSettings.IMPROVE_ACCESSIBILITY));
      item('apply');
      hasSpaceport = true;
      const amount = f(R.portSettings[i.industryId === 'megaport' ? 'MEGAPORT_ACCESSIBILITY' : 'BASE_ACCESSIBILITY']);
      if (amount > 0) flat(bonus, prefix + '_0', amount);
      if (!functional(i.operating)) { unapply(); hasSpaceport = true; }
    }
  }
  const value = validateBonus(bonus); return immutableJSON({ scope: 'industry-accessibility-effects-only', accessibility: bonus, hasSpaceport, value });
}

/** Local accessibility effects only; legacy conditions plus industries. No timers or network task advance. */
export function reapplyOriginalLocalAccessibility(input) {
  economyShape(input, ['accessibility', 'hasSpaceport', 'marketSize', 'firstQueuedIndustryHasSpaceportTag', 'conditions', 'freeMarketDaysByModId', 'industries', ...(isRecord(input) && Object.hasOwn(input, 'portItemContext') ? ['portItemContext'] : [])], 'local accessibility');
  validateIndustryAccessibility(input);
  requireThat(Array.isArray(input.conditions) && input.conditions.length <= 128 && isRecord(input.freeMarketDaysByModId), 'UNSUPPORTED_MARKET_ACCESS', 'Expected explicit current conditions and elapsed free-market state');
  const known = ORIGINAL_INDUSTRY_COMMODITIES, bonus = structuredClone(input.accessibility), freeIds = new Set(), conditionIds = new Set();
  for (const c of input.conditions) {
    economyShape(c, ['id', 'modId', 'surveyed', 'suppressed'], 'local market condition'); identifier(c.id); identifier(c.modId); bool(c.surveyed, 'surveyed'); bool(c.suppressed, 'suppressed');
    requireThat(!conditionIds.has(c.modId), 'UNSUPPORTED_MARKET_ACCESS', 'Duplicate condition modification ID'); conditionIds.add(c.modId);
    requireThat(Object.hasOwn(known.conditions, c.id) || Object.hasOwn(ORIGINAL_RESOURCE_INDUSTRIES.conditions, c.id), 'UNSUPPORTED_MARKET_ACCESS', 'Unknown condition accessibility effects');
    if (c.id === 'free_market') {
      freeIds.add(c.modId); requireThat(Object.hasOwn(input.freeMarketDaysByModId, c.modId), 'UNSUPPORTED_MARKET_ACCESS', 'Free-market elapsed days must be captured, not assumed');
      const value = originalFreeMarketAccessBonus(input.freeMarketDaysByModId[c.modId]); flat(bonus, c.modId, null);
      if (c.surveyed && !c.suppressed) flat(bonus, c.modId, value);
    }
  }
  requireThat(Object.keys(input.freeMarketDaysByModId).length === freeIds.size, 'UNSUPPORTED_MARKET_ACCESS', 'Free-market time state does not match conditions');
  if (input.portItemContext) { const actual = new Set(input.conditions.map(c => c.id)); requireThat(input.portItemContext.conditionIds.length === actual.size && input.portItemContext.conditionIds.every(id => actual.has(id)), 'UNSUPPORTED_MARKET_ACCESS', 'Conflicting item and market condition captures'); }
  const result = reapplyOriginalIndustryAccessibility({accessibility: bonus, hasSpaceport: input.hasSpaceport, marketSize: input.marketSize, firstQueuedIndustryHasSpaceportTag: input.firstQueuedIndustryHasSpaceportTag, industries: input.industries, ...(Object.hasOwn(input, 'portItemContext') ? {portItemContext: input.portItemContext} : {})});
  return immutableJSON({...result, scope: 'local-accessibility-effects-only'});
}
/** Constructor's whole-group center/hostility update. Roster must be the authority's actual ordered economy membership. */
export function computeOriginalGroupAccessibility(input) {
  economyShape(input, ['econGroup', 'roster', 'markets', 'hostility'], 'group accessibility inputs'); group(input.econGroup);
  requireThat(Array.isArray(input.roster) && input.roster.length <= 4096 && Array.isArray(input.markets), 'INCOMPLETE_ECONOMY_NETWORK', 'Expected economy roster and selected group markets');
  const seen = new Set();
  for (const r of input.roster) { economyShape(r, ['marketId', 'econGroup'], 'economy roster row'); identifier(r.marketId); group(r.econGroup); requireThat(!seen.has(r.marketId), 'INCOMPLETE_ECONOMY_NETWORK', 'Duplicate economy roster market'); seen.add(r.marketId); }
  const selected = input.roster.filter(r => r.econGroup === input.econGroup);
  requireThat(input.markets.length === selected.length, 'INCOMPLETE_ECONOMY_NETWORK', 'Missing/excess group markets');
  const weights = {}, factions = []; let x = 0, y = 0, mass = 0, totalHostilityWeight = 0;
  for (let index = 0; index < input.markets.length; index++) {
    const m = input.markets[index]; economyShape(m, ['marketId', 'factionId', 'size', 'location', 'accessibility'], 'group market');
    requireThat(m.marketId === selected[index].marketId, 'INCOMPLETE_ECONOMY_NETWORK', 'Market roster order changed'); identifier(m.factionId); size(m.size); validateBonus(m.accessibility);
    economyShape(m.location, ['x', 'y'], 'hyperspace position'); nativeFloat(m.location.x, 'hyperspace x'); nativeFloat(m.location.y, 'hyperspace y');
    const weight = Math.max(1, m.size - 1); x = f(x + f(m.location.x * weight)); y = f(y + f(m.location.y * weight)); mass = f(mass + weight);
    if (!Object.hasOwn(weights, m.factionId)) { weights[m.factionId] = 0; factions.push(m.factionId); }
    const hostileWeight = Math.max(1, m.size - 2); weights[m.factionId] += hostileWeight; totalHostilityWeight = f(totalHostilityWeight + hostileWeight);
  }
  const center = mass > 0 ? { x: f(x * f(1 / mass)), y: f(y * f(1 / mass)) } : { x: 0, y: 0 };
  requireThat(isRecord(input.hostility) && Object.keys(input.hostility).length === factions.length, 'INCOMPLETE_ECONOMY_RELATIONS', 'Expected current directed faction hostility matrix');
  const hostileWeights = {};
  for (const faction of factions) {
    requireThat(Object.hasOwn(input.hostility, faction) && isRecord(input.hostility[faction]) && Object.keys(input.hostility[faction]).length === factions.length - 1, 'INCOMPLETE_ECONOMY_RELATIONS', 'Missing/excess faction relation row');
    let count = 0;
    for (const other of factions) { if (faction === other) continue; requireThat(Object.hasOwn(input.hostility[faction], other), 'INCOMPLETE_ECONOMY_RELATIONS', 'Missing directed hostility value'); bool(input.hostility[faction][other], 'directed hostility'); if (input.hostility[faction][other]) count += weights[other]; }
    hostileWeights[faction] = count;
  }
  const markets = input.markets.map(m => {
    const beforeValue = validateBonus(m.accessibility), dx = f(center.x - m.location.x), dy = f(center.y - m.location.y);
    const length = f(Math.sqrt(f(f(dx * dx) + f(dy * dy)))), distanceLY = f(length / f(S.unitsPerLightYear));
    const base = roundHundredth(f(f(S.accessibilityBaseValue) - f(distanceLY / f(S.accessibilityDistFromCOM))));
    const penalty = roundHundredth(f(f(f(S.accessibilityLossWhenAllHostile) * f(hostileWeights[m.factionId])) / totalHostilityWeight));
    const bonus = structuredClone(m.accessibility); flat(bonus, 'core_base', base, true); flat(bonus, 'core_hostile', penalty > 0 ? -penalty : null, true);
    const afterValue = validateBonus(bonus);
    return { marketId: m.marketId, accessibility: bonus, distanceLY, base, hostilityPenalty: penalty,
      before: { value: beforeValue, shipping: originalEconomyShipping(beforeValue) }, after: { value: afterValue, shipping: originalEconomyShipping(afterValue) } };
  });
  return immutableJSON({ scope: 'group-core-accessibility-only', econGroup: input.econGroup, center, factionWeights: weights, hostileWeights, totalHostilityWeight, markets });
}
