import raw from '../data/reference-market-economy.json' with { type: 'json' };
import { identifier, integer, finite, isRecord, requireThat, immutableJSON } from '../core/Values.mjs';
import { validateOriginalPriceModifiers, validateOriginalPriceThresholds } from './OriginalMarketPricing.mjs';
export const ORIGINAL_MARKET_ECONOMY = immutableJSON(raw);
const R = ORIGINAL_MARKET_ECONOMY, S = R.settings, f = Math.fround;
export const economyShape = (v, keys, name) => requireThat(isRecord(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k)), 'UNSUPPORTED_ECONOMY_INPUT', `Expected exact ${name} fields`);
export const economyFloat = (v, name, min = -(2 ** 24), max = 2 ** 24) => { const result = f(finite(v, name, min, max)); finite(result, name, min, max); return result; };
const nonnegativeInt = (n, name) => { integer(n, name); requireThat(n <= 65536, 'UNSUPPORTED_ECONOMY_RANGE', 'Industry quantity exceeds supported iteration range'); return n; };
export function originalEconomyCommodity(id) {
  const c = R.commodities[identifier(id, 'commodity')];
  requireThat(Object.hasOwn(R.commodities, id) && c && c.id === c.demandClass && !c.tags.includes('nonecon') && !c.tags.includes('meta') && !c.origin && !c.plugin,
    'UNSUPPORTED_ECONOMY_COMMODITY', 'This kernel resolves primary economic resources only, not variants, exotic, meta or nonecon commodities');
  return c;
}
export function originalJavaStringHash(value) {
  requireThat(typeof value === 'string' && value.length <= 4096, 'UNSUPPORTED_ECONOMY_INPUT', 'Invalid Java hash input');
  let hash = 0; for (let i = 0; i < value.length; i++) hash = (Math.imul(hash, 31) + value.charCodeAt(i)) | 0; return hash;
}
/** java.util.Random(long), including signed int overflow BEFORE sign extension of the seed. */
export function originalMarketMonthlyRandom(marketId, commodityId, month) {
  identifier(marketId); identifier(commodityId); integer(month, 'month', 1); requireThat(month <= 12, 'UNSUPPORTED_ECONOMY_INPUT', 'Native month is 1..12, not absolute month count');
  const seed = (originalJavaStringHash(marketId) + originalJavaStringHash(commodityId) + Math.imul(month, 170000)) | 0;
  const mask = (1n << 48n) - 1n; let state = (BigInt(seed) ^ 0x5deece66dn) & mask;
  const next = () => { state = (state * 0x5deece66dn + 11n) & mask; return Number(state >> 24n) / 2 ** 24; };
  return immutableJSON({ seed, demandRoll: next(), stockpileRoll: next() });
}
// Native modifier keys are Java strings, not entity IDs: CR uses Chinese names and 'crew understrength'.
function validateBonus(input) {
  economyShape(input, ['flat', 'percent', 'mult'], 'ordered stat bonus');
  for (const kind of ['flat', 'percent', 'mult']) {
    requireThat(Array.isArray(input[kind]) && input[kind].length <= 1024, 'UNSUPPORTED_ECONOMY_INPUT', 'Expected bounded ordered modifiers');
    const seen = new Set();
    for (const mod of input[kind]) { economyShape(mod, ['id', 'value'], 'stat modifier'); requireThat(typeof mod.id === 'string' && mod.id.length > 0 && mod.id.length <= 128 && Array.from(mod.id).every(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127) && !['__proto__', 'prototype', 'constructor'].includes(mod.id), 'INVALID_MODIFIER_ID', 'Invalid native stat modifier ID'); requireThat(!seen.has(mod.id), 'UNSUPPORTED_ECONOMY_INPUT', 'Duplicate modifier source'); seen.add(mod.id); economyFloat(mod.value, 'modifier'); }
  }
}
export function resolveOriginalEconomyBonus(input) {
  validateBonus(input);
  const result = { flat: input.flat.reduce((a, m) => f(a + f(m.value)), 0), percent: input.percent.reduce((a, m) => f(a + f(m.value)), 0), mult: input.mult.reduce((a, m) => f(a * f(m.value)), 1) };
  Object.values(result).forEach(v => economyFloat(v, 'resolved modifier')); return immutableJSON(result);
}
function coreBonus(input, kind, value) {
  validateBonus(input); const result = structuredClone(input), index = result[kind].findIndex(m => m.id === 'core');
  if (value === null) { if (index >= 0) result[kind].splice(index, 1); }
  else if (index < 0) result[kind].push({ id: 'core', value }); else result[kind][index] = { id: 'core', value };
  return result;
}
function effective(base, bonus) { return f(f(f(base + f(f(base * bonus.percent) / 100)) + bonus.flat) * bonus.mult); }
export function resolveOriginalEconomyMutable(input) {
  economyShape(input, ['base', 'modifiers'], 'mutable stat'); const value = effective(economyFloat(input.base, 'base'), resolveOriginalEconomyBonus(input.modifiers));
  economyFloat(value, 'resolved stat'); return value;
}
/** CommodityOnMarket chooses the largest rounded effective industry amount, NOT a sum; ties keep the earlier industry's legality. */
export function resolveOriginalIndustryCommodityAmounts(input) {
  economyShape(input, ['commodityId', 'industries', 'previousSupplyLegal', 'previousDemandLegal'], 'industry amounts');
  identifier(input.commodityId); const definition = R.commodities[input.commodityId];
  requireThat(Object.hasOwn(R.commodities, input.commodityId) && definition && definition.id === definition.demandClass, 'UNSUPPORTED_ECONOMY_COMMODITY', 'Industry aggregation supports known primary commodities only (including ships/meta), not variant demand inheritance');
  requireThat(typeof input.previousSupplyLegal === 'boolean' && typeof input.previousDemandLegal === 'boolean' && Array.isArray(input.industries), 'UNSUPPORTED_ECONOMY_INPUT', 'Missing industry state');
  let maxSupply = 0, maxDemand = 0, supplyLegal = input.previousSupplyLegal, demandLegal = input.previousDemandLegal; const seen = new Set();
  for (const industry of input.industries) {
    economyShape(industry, ['id', 'supply', 'demand', 'supplyLegal', 'demandLegal'], 'effective industry output'); identifier(industry.id);
    requireThat(!seen.has(industry.id) && typeof industry.supplyLegal === 'boolean' && typeof industry.demandLegal === 'boolean', 'UNSUPPORTED_ECONOMY_INPUT', 'Duplicate industry or missing legality'); seen.add(industry.id);
    const supply = Math.floor(economyFloat(industry.supply, 'effective supply', -65536, 65536) + 0.5), demand = Math.floor(economyFloat(industry.demand, 'effective demand', -65536, 65536) + 0.5);
    if (supply > maxSupply) { maxSupply = supply; supplyLegal = industry.supplyLegal; } if (demand > maxDemand) { maxDemand = demand; demandLegal = industry.demandLegal; }
  }
  return immutableJSON({ maxSupply, maxDemand, supplyLegal, demandLegal });
}
/** Native updateMaxSupplyAndDemand also supports known variants: demand is reset to zero, not inherited here. */
export function resolveOriginalCommodityMaxima(input) {
  economyShape(input, ['commodityId', 'industries', 'previousSupplyLegal', 'previousDemandLegal'], 'industry amounts');
  identifier(input.commodityId); const definition = R.commodities[input.commodityId];
  requireThat(Object.hasOwn(R.commodities, input.commodityId) && definition && !definition.plugin && !definition.tags.includes('nonecon') && Object.hasOwn(R.commodities, definition.demandClass), 'UNSUPPORTED_ECONOMY_COMMODITY', 'Unknown/plugin/noneconomic commodity maxima');
  if (definition.id === definition.demandClass) return resolveOriginalIndustryCommodityAmounts(input);
  requireThat(typeof input.previousSupplyLegal === 'boolean' && typeof input.previousDemandLegal === 'boolean' && Array.isArray(input.industries), 'UNSUPPORTED_ECONOMY_INPUT', 'Missing variant industry state');
  let maxSupply = 0, supplyLegal = input.previousSupplyLegal; const seen = new Set();
  for (const industry of input.industries) {
    economyShape(industry, ['id', 'supply', 'demand', 'supplyLegal', 'demandLegal'], 'effective industry output'); identifier(industry.id);
    requireThat(!seen.has(industry.id) && typeof industry.supplyLegal === 'boolean' && typeof industry.demandLegal === 'boolean', 'UNSUPPORTED_ECONOMY_INPUT', 'Duplicate industry or missing legality'); seen.add(industry.id);
    const supply = Math.floor(economyFloat(industry.supply, 'effective supply', -65536, 65536) + 0.5);
    if (supply > maxSupply) { maxSupply = supply; supplyLegal = industry.supplyLegal; }
  }
  return immutableJSON({maxSupply,maxDemand:0,supplyLegal,demandLegal:input.previousDemandLegal});
}
/** Existing resource-price boundary stays strict even though industry ships/meta quantities are now available. */
export function resolveOriginalIndustryAmounts(input) {
  economyShape(input, ['commodityId', 'industries', 'previousSupplyLegal', 'previousDemandLegal'], 'industry amounts');
  originalEconomyCommodity(input.commodityId); return resolveOriginalIndustryCommodityAmounts(input);
}
export function originalEconomyShipping(accessibility) {
  const access = f(Math.max(-2147483648, Math.min(2147483647, Math.floor(f(economyFloat(accessibility, 'effective accessibility') * 100) + 0.5))) / 100);
  return immutableJSON({ global: Math.trunc(Math.max(0, f(access / f(S.accessibilityPerUnitShipping)))), inFaction: Math.trunc(Math.max(0, f(f(access + f(S.accessibilitySameFactionBonus)) / f(S.accessibilityPerUnitShipping)))) });
}
/** Explicit first-pass export rows. These are BEFORE CommodityMarketData updates accessibility. */
export function resolveOriginalEconomyExports(input) {
  economyShape(input, ['coverage', 'econGroup', 'rows'], 'complete export group');
  requireThat(input.coverage === 'complete-econ-group' && (input.econGroup === null || typeof input.econGroup === 'string') && Array.isArray(input.rows) && input.rows.length > 0, 'INCOMPLETE_ECONOMY_NETWORK', 'Supply the complete relevant economy group, not just this market');
  let maxExportGlobal = 0; const maxExportPerFaction = {}, seen = new Set();
  for (const row of input.rows) {
    economyShape(row, ['marketId', 'factionId', 'maxSupply', 'availableBeforePass', 'shippingGlobalBeforePass', 'shippingFactionBeforePass'], 'export row'); identifier(row.marketId); identifier(row.factionId);
    requireThat(!seen.has(row.marketId), 'UNSUPPORTED_ECONOMY_INPUT', 'Duplicate export market'); seen.add(row.marketId);
    for (const k of ['maxSupply', 'availableBeforePass', 'shippingGlobalBeforePass', 'shippingFactionBeforePass']) nonnegativeInt(row[k], k);
    const supply = Math.min(row.maxSupply, row.availableBeforePass); maxExportGlobal = Math.max(maxExportGlobal, Math.min(supply, row.shippingGlobalBeforePass));
    maxExportPerFaction[row.factionId] = Math.max(maxExportPerFaction[row.factionId] ?? 0, Math.min(supply, row.shippingFactionBeforePass));
  }
  return immutableJSON({ maxExportGlobal, maxExportPerFaction });
}
/** Exact local/import/shortage/low-access branch; network and shipping must already reflect their proper native phase. */
export function resolveOriginalEconomyAvailability(input) {
  economyShape(input, ['maxSupply', 'maxDemand', 'supplyLegal', 'demandLegal', 'hidden', 'shippingGlobal', 'shippingFaction', 'maxExportGlobal', 'maxExportFaction', 'otherFlat'], 'availability inputs');
  for (const k of ['maxSupply', 'maxDemand', 'shippingGlobal', 'shippingFaction', 'maxExportGlobal', 'maxExportFaction']) nonnegativeInt(input[k], k);
  for (const k of ['supplyLegal', 'demandLegal', 'hidden']) requireThat(typeof input[k] === 'boolean', 'UNSUPPORTED_ECONOMY_INPUT', 'Missing native legality/hidden state');
  const other = economyFloat(input.otherFlat, 'available excluding native core and eMod');
  const { maxSupply: supply, maxDemand: demand, shippingGlobal: sg, shippingFaction: sf, maxExportGlobal: eg, maxExportFaction: ef } = input;
  const illegal = !(input.demandLegal && demand > 0 || input.supplyLegal && supply > 0);
  const factionImport = illegal ? 0 : Math.min(sf, ef), globalImport = Math.min(sg, eg), need = Math.max(0, demand - supply);
  let local = 0, imports = 0, shortage = 0, lowAccess = 0, source = 'NONE';
  if (!(supply + factionImport + globalImport <= 0 && demand <= 0)) {
    if (supply > 0) { local = supply; source = 'LOCAL'; }
    const hasBetterSource = factionImport > supply || globalImport > supply;
    if (need > 0 && !input.hidden) {
      const a = need - Math.max(0, demand - ef) - Math.max(0, need - sf), b = need - Math.max(0, demand - eg) - Math.max(0, need - sg);
      if (a >= b || globalImport > 0) {
        const chooseFaction = a >= b; if (hasBetterSource) source = chooseFaction ? 'IN_FACTION' : 'GLOBAL';
        imports = need; const rawShortage = Math.min(demand - (chooseFaction ? ef : eg), need);
        shortage = rawShortage > 0 ? -rawShortage : 0; const accessShortage = Math.min(imports - (chooseFaction ? sf : sg), need) - Math.max(0, rawShortage); lowAccess = accessShortage > 0 ? -accessShortage : 0;
      }
    }
  }
  const availableWithoutTrade = f(f(f(f(other + local) + imports) + shortage) + lowAccess);
  const reappliesEventMod = !(supply + factionImport + globalImport <= 0 && demand <= 0);
  return immutableJSON({ availableWithoutTrade, reappliesEventMod, source, sourceIsIllegal: illegal, core: { local, imports, shortage, lowAccess } });
}
export function originalEconomyTradeLevel(availableWithoutTrade, econUnit, tradeMod) {
  let available = economyFloat(availableWithoutTrade, 'available base'), quantity;
  const unit = economyFloat(econUnit, 'econUnit', Number.MIN_VALUE);
  economyShape(tradeMod, ['both', 'plus', 'minus'], 'trade quantities'); Object.values(tradeMod).forEach(v => economyFloat(v, 'trade quantity'));
  quantity = f(f(f(tradeMod.both) + Math.max(f(tradeMod.plus), 0)) + Math.min(f(tradeMod.minus), 0));
  let levels = 0, count = 0;
  if (quantity > 0) { available = f(available + 1); let cost = available > 0 ? unit : 0;
    while (quantity >= cost && f(available + levels) > 0) { requireThat(++count <= 65536, 'UNSUPPORTED_ECONOMY_RANGE', 'Trade conversion work exceeded'); quantity = f(quantity - cost); levels = f(levels + 1); cost = f(available + levels) > 0 ? unit : 0; }
  } else if (quantity < 0) { quantity = -quantity; let cost = available > 0 ? unit : 0;
    while (quantity >= cost && f(available + levels) > 0) { requireThat(++count <= 65536, 'UNSUPPORTED_ECONOMY_RANGE', 'Trade conversion work exceeded'); quantity = f(quantity - cost); levels = f(levels - 1); cost = f(available + levels) > 0 ? unit : 0; }
  }
  return levels;
}
export function originalCommodityIconCounts(input) {
  economyShape(input, ['available', 'maxSupply', 'maxDemand', 'shippingGlobal', 'shippingFaction'], 'commodity icons'); Object.entries(input).forEach(([k, n]) => nonnegativeInt(n, k));
  const { available, maxDemand: demand, shippingGlobal: sg, shippingFaction: sf } = input, production = Math.min(input.maxSupply, available);
  const extra = Math.max(0, available - Math.max(Math.min(production, sg), demand)), deficit = Math.max(0, demand - available);
  const imports = Math.max(0, available - production), demandMet = Math.min(available, demand);
  let demandMetWithLocal = Math.min(available, production) - extra, nonDemandExport = 0;
  if (demandMetWithLocal > demand && demand > 0) { nonDemandExport = demandMetWithLocal - demand; demandMetWithLocal = demand; }
  let globalExport = production, inFactionOnlyExport = 0, canNotExport = 0;
  if (globalExport > sg) { inFactionOnlyExport = globalExport - sg; globalExport = sg; }
  if (globalExport + inFactionOnlyExport > sf) { canNotExport = globalExport + inFactionOnlyExport - sf; inFactionOnlyExport -= canNotExport; }
  const aboveMax = Math.max(demandMetWithLocal, globalExport) + canNotExport + inFactionOnlyExport - (available - imports);
  if (aboveMax > 0) { inFactionOnlyExport -= aboveMax; if (inFactionOnlyExport < 0) canNotExport += inFactionOnlyExport; }
  return immutableJSON({ available, production, demand, extra, deficit, imports, demandMet, demandMetWithLocal: Math.max(0, demandMetWithLocal), nonDemandExport: Math.max(0, nonDemandExport), globalExport, inFactionOnlyExport: Math.max(0, inFactionOnlyExport), canNotExport: Math.max(0, canNotExport) });
}
/** One REAL MainWorkTask2 stockpile/price pass, never a generic per-tick refresh. */
export function resolveOriginalMarketEconomyPass(input) {
  economyShape(input, ['marketId', 'commodityId', 'month', 'sourceRevision', 'phase', 'industry', 'network', 'otherAvailableFlat', 'eventModBeforePass', 'tradeMod', 'demandStat', 'greedStat', 'playerModifiers', 'marketModifiers'], 'native pricing pass');
  identifier(input.marketId); identifier(input.sourceRevision, 'resolved source revision');
  requireThat(['native-final-iteration', 'native-force-stockpile-update'].includes(input.phase), 'ECONOMY_PHASE_REQUIRED', 'Only a real stockpile update or explicit native force update may regenerate prices');
  economyShape(input.industry, ['industries', 'previousSupplyLegal', 'previousDemandLegal'], 'industry snapshot');
  const spec = originalEconomyCommodity(input.commodityId), amounts = resolveOriginalIndustryAmounts({ commodityId: input.commodityId, ...input.industry });
  economyShape(input.network, ['shippingGlobal', 'shippingFaction', 'maxExportGlobal', 'maxExportFaction', 'hidden'], 'resolved native network');
  const availability = resolveOriginalEconomyAvailability({ ...amounts, ...input.network, otherFlat: input.otherAvailableFlat });
  integer(Math.abs(input.eventModBeforePass), 'captured pre-pass eMod'); requireThat(Math.abs(input.eventModBeforePass) <= 65536, 'UNSUPPORTED_ECONOMY_RANGE', 'Captured event level exceeds supported bounds');
  const level = originalEconomyTradeLevel(availability.availableWithoutTrade, spec.econUnit, input.tradeMod);
  // CommodityMarketData early-continue clears core flats but does NOT reapply an existing eMod.
  const appliedEventMod = availability.reappliesEventMod ? level : input.eventModBeforePass;
  const available = Math.max(0, Math.floor(f(availability.availableWithoutTrade + appliedEventMod) + 0.5));
  const icons = originalCommodityIconCounts({ available, maxSupply: amounts.maxSupply, maxDemand: amounts.maxDemand, shippingGlobal: input.network.shippingGlobal, shippingFaction: input.network.shippingFaction });
  const random = originalMarketMonthlyRandom(input.marketId, input.commodityId, input.month), econUnit = f(spec.econUnit);
  const noDemand = amounts.maxDemand <= 0 && amounts.maxSupply <= 0;
  const demandUnits = Math.max(1, f(f(icons.production - icons.inFactionOnlyExport) - icons.canNotExport), amounts.maxDemand);
  const rawDemand = f(f(f(econUnit * demandUnits) + f(S.economyMinStockpileForPricing * 2)) * f(f(0.95) + f(f(0.1) * random.demandRoll)));
  const demandCore = f(rawDemand * f(1 - f(S.economyGreedFraction))), greedCore = f(rawDemand * f(S.economyGreedFraction));
  economyShape(input.demandStat, ['base', 'modifiers'], 'demand stat'); economyShape(input.greedStat, ['base', 'modifiers'], 'greed stat');
  const demandStat = { base: input.demandStat.base, modifiers: coreBonus(input.demandStat.modifiers, 'flat', demandCore) };
  const greedStat = { base: input.greedStat.base, modifiers: coreBonus(input.greedStat.modifiers, 'flat', greedCore) };
  const demandValue = resolveOriginalEconomyMutable(demandStat), greed = resolveOriginalEconomyMutable(greedStat);
  const exportMax = Math.max(3, input.network.maxExportGlobal), factor = f(f(f(0.5) * 10) / exportMax);
  const productionExtra = Math.min(f(Math.min(available, amounts.maxSupply) * factor), f(factor * 10));
  const stockpile = f(f(f(econUnit * (available + (noDemand ? 1 : 0))) + f(econUnit * productionExtra)) * f(f(0.95) + f(f(0.1) * random.stockpileRoll)));
  const demandPrice = { highThreshold: -1, highMult: 1, lowThreshold: -1, lowMult: 1 }, supplyPrice = { ...demandPrice };
  if (icons.deficit > 0) { const threshold = f(stockpile + f(icons.deficit * econUnit)), mult = Math.min(f(S.economyDeficitPriceMultMax), f(1 + f(Math.max(1, icons.deficit) * f(S.economyDeficitPriceIncrPerUnit)))); Object.assign(demandPrice, { highThreshold: threshold, highMult: mult }); Object.assign(supplyPrice, { highThreshold: threshold, highMult: mult }); }
  if (icons.deficit <= 0 && level > 0 && f(f(input.tradeMod.both) + f(input.tradeMod.plus)) > 0) Object.assign(supplyPrice, { highThreshold: Math.max(0, f(stockpile - f(icons.extra * econUnit))), highMult: Math.min(f(S.economyDeficitPriceMultMax), f(1 + f(S.economyDeficitPriceIncrPerUnit))) });
  if (icons.extra > 0) { const threshold = Math.max(0, f(stockpile - f(icons.extra * econUnit))), mult = Math.max(f(S.economyExcessPriceMultMin), f(1 - f(Math.max(1, icons.extra) * f(S.economyExcessPriceDecrPerUnit)))); for (const p of [demandPrice, supplyPrice]) Object.assign(p, { lowThreshold: threshold, lowMult: mult }); }
  requireThat(isRecord(input.playerModifiers) && Object.keys(input.playerModifiers).length > 0, 'UNSUPPORTED_ECONOMY_INPUT', 'Explicit player modifiers required');
  const playerSupplyModsByPlayer = {}, playerDemandModsByPlayer = {}, nextPlayerModifiers = {};
  for (const [id, mods] of Object.entries(input.playerModifiers)) {
    identifier(id); economyShape(mods, ['supply', 'demand'], 'player source modifiers');
    nextPlayerModifiers[id] = { supply: structuredClone(mods.supply), demand: coreBonus(mods.demand, 'mult', noDemand ? f(S.economyNoDemandPriceMult) : null) };
    playerSupplyModsByPlayer[id] = resolveOriginalEconomyBonus(mods.supply); playerDemandModsByPlayer[id] = resolveOriginalEconomyBonus(nextPlayerModifiers[id].demand);
  }
  economyShape(input.marketModifiers, ['supply', 'demand'], 'market source modifiers');
  // Native pathological/custom values may be valid Java but are outside the current authoritative quote contract. Fail closed.
  for (const [name, value] of Object.entries({ stockpile, demandValue, greed, availableWithoutTrade: availability.availableWithoutTrade })) economyFloat(value, name, 0);
  validateOriginalPriceThresholds(supplyPrice); validateOriginalPriceThresholds(demandPrice);
  const marketSupplyMod = resolveOriginalEconomyBonus(input.marketModifiers.supply), marketDemandMod = resolveOriginalEconomyBonus(input.marketModifiers.demand);
  for (const mod of [marketSupplyMod, marketDemandMod, ...Object.values(playerSupplyModsByPlayer), ...Object.values(playerDemandModsByPlayer)]) validateOriginalPriceModifiers(mod);
  // Return data, NOT asOfTick/admission/inventory or a claim that the world is now valid for trade.
  return immutableJSON({ sourceRevision: input.sourceRevision, phase: input.phase, month: input.month, marketId: input.marketId, commodityId: input.commodityId,
    commodity: { stockpile, demandValue, greed, utilityOnMarket: spec.utility, availableWithoutTrade: availability.availableWithoutTrade, tradeMod: input.tradeMod, supplyPrice, demandPrice, playerSupplyModsByPlayer, playerDemandModsByPlayer },
    marketSupplyMod, marketDemandMod,
    nativeStats: { demandStat, greedStat, playerModifiers: nextPlayerModifiers }, diagnostics: { amounts, availability, available, appliedEventMod, tradeLevel: level, icons, noDemand, random } });
}
