import { identifier, integer, requireThat, immutableJSON } from '../core/Values.mjs';
import { ORIGINAL_MARKET_ECONOMY, economyShape, economyFloat, resolveOriginalEconomyExports, resolveOriginalEconomyAvailability, originalEconomyTradeLevel } from './OriginalMarketEconomy.mjs';
import { computeOriginalGroupAccessibility } from './OriginalMarketAccessibility.mjs';
/** One known commodity network phase; NOT prices, stock, income/market shares or native task completion. */
export function resolveOriginalCommodityNetwork(input) {
  economyShape(input, ['econGroup', 'roster', 'markets', 'hostility', 'commodityId'], 'commodity network pass');
  identifier(input.commodityId);
  const definition = ORIGINAL_MARKET_ECONOMY.commodities[input.commodityId];
  requireThat(Object.hasOwn(ORIGINAL_MARKET_ECONOMY.commodities, input.commodityId) && definition && Object.hasOwn(ORIGINAL_MARKET_ECONOMY.commodities, definition.demandClass) && !definition.plugin && !definition.tags.includes('nonecon'), 'UNSUPPORTED_ECONOMY_COMMODITY', 'Only known economic commodity network effects without custom plugins are implemented');
  requireThat(Array.isArray(input.markets), 'INCOMPLETE_ECONOMY_NETWORK', 'Expected explicit commodity market states');
  for (const m of input.markets) {
    economyShape(m, ['marketId', 'factionId', 'size', 'location', 'hidden', 'accessibility', 'amounts', 'availableBeforeCore', 'otherAvailableFlat', 'eventModBeforeCore', 'tradeMod'], 'commodity network market');
    if (definition.id !== definition.demandClass) requireThat(m.amounts?.maxDemand === 0, 'UNSUPPORTED_ECONOMY_COMMODITY', 'Variant own-constructor maxima reset demand to zero; do not reuse inherited demand');
    economyShape(m.amounts, ['maxSupply', 'maxDemand', 'supplyLegal', 'demandLegal'], 'current industry maxima');
    integer(m.availableBeforeCore, 'before-core native available quantity'); integer(m.eventModBeforeCore, 'previous native event modifier', -65536);
    requireThat(m.availableBeforeCore <= 65536 && m.eventModBeforeCore <= 65536, 'UNSUPPORTED_ECONOMY_RANGE', 'Commodity snapshot exceeds supported native range');
  }
  const access = computeOriginalGroupAccessibility({ econGroup: input.econGroup, roster: input.roster, hostility: input.hostility, markets: input.markets.map(({ marketId, factionId, size, location, accessibility }) => ({ marketId, factionId, size, location, accessibility })) });
  const exportRows = input.markets.map((m, n) => ({ marketId: m.marketId, factionId: m.factionId, maxSupply: m.amounts.maxSupply, availableBeforePass: m.availableBeforeCore, shippingGlobalBeforePass: access.markets[n].before.shipping.global, shippingFactionBeforePass: access.markets[n].before.shipping.inFaction }));
  const exports = exportRows.length ? resolveOriginalEconomyExports({ coverage: 'complete-econ-group', econGroup: input.econGroup, rows: exportRows }) : { maxExportGlobal: 0, maxExportPerFaction: {} };
  const markets = input.markets.map((m, n) => {
    const a = access.markets[n], network = { hidden: m.hidden, shippingGlobal: a.after.shipping.global, shippingFaction: a.after.shipping.inFaction, maxExportGlobal: exports.maxExportGlobal, maxExportFaction: exports.maxExportPerFaction[m.factionId] ?? 0 };
    const availability = resolveOriginalEconomyAvailability({ ...m.amounts, ...network, otherFlat: m.otherAvailableFlat });
    // Validate/recompute even on the early-continue branch, but retain its previously applied event modifier.
    const tradeLevel = originalEconomyTradeLevel(availability.availableWithoutTrade, definition.econUnit, m.tradeMod);
    const appliedEventMod = availability.reappliesEventMod ? tradeLevel : m.eventModBeforeCore;
    const availableStatValue = Math.fround(availability.availableWithoutTrade + appliedEventMod); economyFloat(availableStatValue, 'resolved available stat', -65536, 65536);
    const available = Math.max(0, Math.floor(availableStatValue + 0.5));
    return { marketId: m.marketId, accessibility: a.accessibility, network, availability, availableStatValue, available, appliedEventMod, tradeLevel };
  });
  return immutableJSON({ scope: 'commodity-network-effects-only', commodityId: input.commodityId, econGroup: input.econGroup, access, exports, markets });
}
