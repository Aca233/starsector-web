import { identifier, integer, isRecord, requireThat, immutableJSON } from '../core/Values.mjs';
import { ORIGINAL_MARKET_ECONOMY, economyShape, originalCommodityIconCounts, originalEconomyTradeLevel, originalMarketMonthlyRandom } from './OriginalMarketEconomy.mjs';
import { ORIGINAL_MARKET_REFERENCE } from './OriginalMarketPricing.mjs';
import { financeFloat, financeStat } from './OriginalMarketFinance.mjs';
import { put } from './OriginalIndustryState.mjs';

const f = Math.fround, S = ORIGINAL_MARKET_ECONOMY.settings;
const check = (value, message) => requireThat(value, 'UNSUPPORTED_CLASS_PRICING', message);
function spec(id) {
  identifier(id);
  const value = ORIGINAL_MARKET_ECONOMY.commodities[id];
  check(Object.hasOwn(ORIGINAL_MARKET_ECONOMY.commodities, id) && value && !value.plugin && !value.tags.includes('nonecon'), 'Unknown/plugin/noneconomic pricing commodity');
  return value;
}
function amount(value, name) {
  integer(value, name); check(value <= 65536, 'Commodity amount exceeds bounded native arithmetic range');
}
function validateRow(row, demandClass, allowLazyPrimary = false) {
  economyShape(row, ['commodityId', 'maxSupply', 'maxDemand', 'available', 'availableWithoutTrade', 'shippingGlobal', 'shippingFaction', 'maxExportGlobal', 'stockpile', 'tradeMod', 'greedStat', 'playerModifiers'], 'captured demand-class commodity');
  const definition = spec(row.commodityId);
  check(definition.demandClass === demandClass, 'Captured commodity belongs to another demand class');
  for (const name of ['maxSupply', 'maxDemand', 'available', 'shippingGlobal', 'shippingFaction']) amount(row[name], name);
  if (definition.id === demandClass && !allowLazyPrimary || row.maxExportGlobal !== null) amount(row.maxExportGlobal, 'cached global exports');
  financeFloat(row.availableWithoutTrade, 'captured available without eMod');
  financeFloat(row.stockpile, 'current stockpile'); financeStat(row.greedStat);
  economyShape(row.tradeMod, ['both', 'plus', 'minus'], 'captured trade quantities');
  for (const value of Object.values(row.tradeMod)) financeFloat(value, 'trade quantity');
  check(isRecord(row.playerModifiers) && Object.keys(row.playerModifiers).length > 0, 'Explicit current player modifiers required');
  for (const [id, modifiers] of Object.entries(row.playerModifiers)) {
    identifier(id); economyShape(modifiers, ['supply', 'demand'], 'player price modifiers');
    for (const bonus of Object.values(modifiers)) financeStat({ base: 0, modifiers: bonus });
  }
}
function icons(row) {
  return originalCommodityIconCounts({ available: row.available, maxSupply: row.maxSupply, maxDemand: row.maxDemand, shippingGlobal: row.shippingGlobal, shippingFaction: row.shippingFaction });
}
function thresholds(row, counts, unit) {
  const demand = { highThreshold: -1, highMult: 1, lowThreshold: -1, lowMult: 1 }, supply = { ...demand };
  if (counts.deficit > 0) {
    const highThreshold = f(row.stockpile + f(counts.deficit * unit));
    const highMult = Math.min(f(S.economyDeficitPriceMultMax), f(1 + f(Math.max(1, counts.deficit) * f(S.economyDeficitPriceIncrPerUnit))));
    Object.assign(demand, { highThreshold, highMult }); Object.assign(supply, { highThreshold, highMult });
  }
  const tradeLevel = originalEconomyTradeLevel(row.availableWithoutTrade, unit, row.tradeMod);
  if (counts.deficit <= 0 && tradeLevel > 0 && f(row.tradeMod.both + row.tradeMod.plus) > 0) {
    supply.highThreshold = Math.max(0, f(row.stockpile - f(counts.extra * unit)));
    supply.highMult = Math.min(f(S.economyDeficitPriceMultMax), f(1 + f(S.economyDeficitPriceIncrPerUnit)));
  }
  if (counts.extra > 0) {
    const lowThreshold = Math.max(0, f(row.stockpile - f(counts.extra * unit)));
    const lowMult = Math.max(f(S.economyExcessPriceMultMin), f(1 - f(Math.max(1, counts.extra) * f(S.economyExcessPriceDecrPerUnit))));
    Object.assign(demand, { lowThreshold, lowMult }); Object.assign(supply, { lowThreshold, lowMult });
  }
  return { demand, supply, tradeLevel };
}
/**
 * Actual MainWorkTask2 V2 class-wide mutation, using captured CURRENT getters.
 * Does not reaggregate industries or construct networks: those can differ across task phases.
 * The primary network must already be initialized: a lazy constructor changing getters mid-pass
 * needs a live sequential runtime, not a fabricated frozen capture.
 * Demand is shared; variant stockpiles are retained. No stock/freshness publication or account writes.
 */
export function updateOriginalCommodityClassPrices(input) { return updateClassPrices(input, null); }
/** Same V2 loop with the native lazy network read AFTER the stockpile's old-availability reads. */
export function updateOriginalCommodityClassPricesWithRuntime(input, runtime) {
  check(typeof runtime?.readAfterPrimaryNetwork === 'function', 'Synchronous primary network getter required');
  return updateClassPrices(input, runtime);
}
/** Saved instances execute updateCalc in readResolve; newly-created omitted instances retain PriceCalculator defaults. */
export function createOriginalCommodityPriceCalculators(input) {
  economyShape(input,['commodityId','demandStat','greedStat','fromSaved'],'native calculator initialization');
  identifier(input.commodityId);const definition=ORIGINAL_MARKET_ECONOMY.commodities[input.commodityId];check(definition&&!definition.plugin,'Actual commodity constructor specification required');const base=ORIGINAL_MARKET_REFERENCE.commodities[definition.demandClass];
  check(typeof input.fromSaved==='boolean','Explicit saved/new calculator origin required');
  check(base && base.utility>0,'Missing primary price specification');
  const demand=financeStat(input.demandStat),greed=financeStat(input.greedStat);
  const defaults={basePrice:1,variability:'V4',demand:0,highThreshold:-1,highMult:1,lowThreshold:-1,lowMult:1};
  const initialized=input.fromSaved ? {...defaults,basePrice:f(f(base.basePrice)/f(base.utility)),variability:base.variability,demand} : defaults;
  return immutableJSON({demandPrice:{...initialized},supplyPrice:{...initialized,demand:input.fromSaved ? f(demand+greed) : 0}});
}
function updateClassPrices(input, runtime) {
  economyShape(input, ['marketId', 'triggerCommodityId', 'month', 'phase', 'coverage', 'demandStat', 'commodities'], 'demand-class price pass');
  identifier(input.marketId);
  check(['native-final-iteration', 'native-force-stockpile-update'].includes(input.phase), 'Only actual native stockpile phases regenerate prices');
  check(input.coverage === 'complete-demand-class', 'Supply the complete ordered instantiated demand-class list');
  const definition = spec(input.triggerCommodityId), demandClass = definition.demandClass;
  const base = ORIGINAL_MARKET_REFERENCE.commodities[demandClass];
  check(base && base.demandClass === demandClass && base.utility > 0, 'Missing primary demand-class price specification');
  financeStat(input.demandStat);
  check(Array.isArray(input.commodities) && input.commodities.length <= 128, 'Expected bounded ordered class list');
  const seen = new Set();
  for (const row of input.commodities) { validateRow(row, demandClass, runtime !== null); check(!seen.has(row.commodityId), 'Duplicate commodity instance'); seen.add(row.commodityId); }
  const demandStat = structuredClone(input.demandStat), rows = structuredClone(input.commodities);
  const primary = rows.find(row => row.commodityId === demandClass);
  const random = originalMarketMonthlyRandom(input.marketId, input.triggerCommodityId, input.month);
  let rawDemand = 0, noDemand = false;
  if (primary) {
    const counts = icons(primary), unit = f(spec(primary.commodityId).econUnit);
    const demandUnits = Math.max(1, f(f(counts.production - counts.inFactionOnlyExport) - counts.canNotExport), primary.maxDemand);
    rawDemand = f(f(f(unit * demandUnits) + f(S.economyMinStockpileForPricing * 2)) * f(f(0.95) + f(f(0.1) * random.demandRoll)));
    noDemand = primary.maxDemand <= 0 && primary.maxSupply <= 0;
    put(demandStat, 'flat', 'core', f(rawDemand * f(1 - f(S.economyGreedFraction))));
  }
  // Both loops use the same noDemand flag and rawDemand, including a missing-primary class.
  for (const row of rows) {
    put(row.greedStat, 'flat', 'core', f(rawDemand * f(S.economyGreedFraction)));
    for (const modifiers of Object.values(row.playerModifiers)) {
      put({ modifiers: modifiers.demand }, 'mult', 'core', f(S.economyNoDemandPriceMult), !noDemand);
    }
  }
  if (primary) {
    const unit = f(spec(primary.commodityId).econUnit), produced = Math.min(primary.available, primary.maxSupply);
    const oldStockpileBase = f(unit * (primary.available + (noDemand ? 1 : 0)));
    if(runtime) {
      // Publish demand/greed/modifiers before the lazy read, then observe CURRENT getters after it.
      const refreshed=runtime.readAfterPrimaryNetwork(immutableJSON({demandStat,commodities:rows}));
      check(refreshed && !refreshed.then && Array.isArray(refreshed) && refreshed.length===rows.length,'Primary network read must synchronously return the same class roster');
      for(let n=0;n<rows.length;n++) {
        validateRow(refreshed[n],demandClass);
        check(refreshed[n].commodityId===rows[n].commodityId,'Primary network getter reordered class instances');
        Object.assign(rows[n],structuredClone(refreshed[n]));
      }
    }
    const factor = f(f(f(0.5) * 10) / Math.max(3, primary.maxExportGlobal));
    const extra = Math.min(f(produced * factor), f(factor * 10));
    primary.stockpile = f(f(oldStockpileBase + f(unit * extra)) * f(f(0.95) + f(f(0.1) * random.stockpileRoll)));
  }
  if (primary) financeFloat(primary.stockpile, 'generated stockpile');
  const demandValue = financeStat(demandStat);
  const commodities = rows.map(row => {
    const counts = icons(row), prices = thresholds(row, counts, f(spec(row.commodityId).econUnit)), greed = financeStat(row.greedStat);
    const calculator = { basePrice: f(f(base.basePrice) / f(base.utility)), variability: base.variability, demand: demandValue };
    return { ...row, demandPrice: { ...calculator, ...prices.demand }, supplyPrice: { ...calculator, demand: f(demandValue + greed), ...prices.supply }, diagnostics: { icons: counts, tradeLevel: prices.tradeLevel } };
  });
  return immutableJSON({ scope: 'native-demand-class-stockpile-and-price-effects-only', marketId: input.marketId, triggerCommodityId: input.triggerCommodityId, demandClass, month: input.month, phase: input.phase, demandStat, demandValue, commodities, diagnostics: { noDemand, rawDemand, random: { ...random, drawsConsumed: primary ? 2 : 0 } } });
}
