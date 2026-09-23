import rawReference from '../data/reference-market.json' with { type: 'json' };
import { finite, integer, isRecord, requireThat, immutableJSON } from '../core/Values.mjs';
const reference = immutableJSON(rawReference);
export const ORIGINAL_MARKET_REFERENCE = reference;
export const ORIGINAL_MARKET_NUMERIC_LIMIT = 2 ** 24;
const f = Math.fround;
const checkedFloat = (v, label, minimum = 0) => f(finite(v, label, minimum, ORIGINAL_MARKET_NUMERIC_LIMIT));
export function originalMarketCommodity(id) {
  const spec = reference.commodities[id];
  requireThat(spec && !spec.tags.includes('meta') && spec.plugin === null, 'UNSUPPORTED_COMMODITY', 'Only native resource commodities without custom item plugins are supported');
  return spec;
}
export function validateOriginalPriceModifiers(v) {
  requireThat(isRecord(v) && Object.keys(v).length === 3 && ['flat', 'percent', 'mult'].every(k => Object.hasOwn(v, k)), 'UNSUPPORTED_MARKET_STATE', 'Expected resolved native StatBonus components');
  checkedFloat(v.flat, 'flat price modifier', -ORIGINAL_MARKET_NUMERIC_LIMIT);
  checkedFloat(v.percent, 'percent price modifier', -ORIGINAL_MARKET_NUMERIC_LIMIT);
  checkedFloat(v.mult, 'multiplicative price modifier');
  return v;
}
export function validateOriginalPriceThresholds(v) {
  requireThat(isRecord(v) && Object.keys(v).length === 4 && ['highThreshold', 'highMult', 'lowThreshold', 'lowMult'].every(k => Object.hasOwn(v, k)), 'UNSUPPORTED_MARKET_STATE', 'Expected resolved native PriceCalculator thresholds');
  for (const k of ['highThreshold', 'lowThreshold']) { checkedFloat(v[k], k, -1); requireThat(v[k] === -1 || v[k] >= 0, 'UNSUPPORTED_MARKET_STATE', 'A disabled threshold must be -1'); }
  checkedFloat(v.highMult, 'high-price multiplier'); checkedFloat(v.lowMult, 'low-price multiplier');
  return v;
}
function effective(base, mod) {
  // StatBonus.computeEffective: each Java float operation is rounded, not only the final product.
  return f(f(f(base + f(f(base * f(mod.percent)) / 100)) + f(mod.flat)) * f(mod.mult));
}
/** Exact inspected PriceCalculator integral, including its float threshold-segment accumulation. */
export function originalMarketPriceIntegral({ basePrice, demand, variability, stockpile, quantity, side, thresholds }) {
  checkedFloat(basePrice, 'base price'); checkedFloat(demand, 'demand');
  finite(stockpile, 'pricing stockpile', -ORIGINAL_MARKET_NUMERIC_LIMIT, ORIGINAL_MARKET_NUMERIC_LIMIT);
  finite(quantity, 'utility quantity', 0, ORIGINAL_MARKET_NUMERIC_LIMIT);
  requireThat(['buy', 'sell'].includes(side) && Object.hasOwn(reference.priceVariability, variability), 'UNSUPPORTED_MARKET_STATE', 'Unknown pricing direction or variability');
  validateOriginalPriceThresholds(thresholds);
  const D = f(f(demand) + reference.settings.economyMinDemandForPricing), v = reference.priceVariability[variability];
  requireThat(v !== 1, 'UNSUPPORTED_MARKET_STATE', 'Native integral does not define variability one');
  const mult = f(basePrice) * Math.pow(D + D + 1, v);
  const inner = (lo, hi) => Math.max(0, f(mult * (Math.pow(Math.max(0, hi) + D + 1, 1 - v) - Math.pow(Math.max(0, lo) + D + 1, 1 - v)) / (1 - v)));
  const offset = reference.settings.economyMinStockpileForPricing;
  let lo = stockpile + offset - (side === 'buy' ? quantity : 0), hi = stockpile + offset + (side === 'sell' ? quantity : 0), price = 0;
  const high = f(f(thresholds.highThreshold) + offset), low = f(f(thresholds.lowThreshold) + offset);
  if (high >= offset && lo < high) { price = f(price + f(inner(lo, Math.min(hi, high)) * f(thresholds.highMult))); lo = Math.min(hi, high); }
  if (low >= offset && hi > low) { price = f(price + f(inner(Math.max(lo, low), hi) * f(thresholds.lowMult))); hi = Math.max(lo, low); }
  price = Math.max(0, f(price + inner(lo, hi)));
  finite(price, 'integrated price', 0, ORIGINAL_MARKET_NUMERIC_LIMIT);
  return price;
}
/** Native trade-mod contribution to MarketDemand stockpile utility (not retail inventory). */
export function originalTradeStockpileContribution(row, spec) {
  const { both, plus, minus } = row.tradeMod;
  const combined = f(f(f(both) + Math.max(f(plus), 0)) + Math.min(f(minus), 0));
  const total = f(f(f(both) + f(plus)) + f(minus));
  let quantity = combined, units = 0, available = f(row.availableWithoutTrade), cost;
  const unit = f(spec.econUnit);
  // CommodityOnMarket.getModValueForQuantity; BaseIndustry's current multiplier is 1 for size>0.
  // A bounded loop preserves the native float subtraction order; no arbitrary economic approximation.
  let iterations = 0;
  if (quantity > 0) {
    available = f(available + 1); cost = available > 0 ? unit : 0;
    while (quantity >= cost && f(available + units) > 0) {
      requireThat(++iterations <= 65536, 'UNSUPPORTED_MARKET_RANGE', 'Trade impact exceeds supported conversion work budget');
      quantity = f(quantity - cost); units = f(units + 1); cost = f(available + units) > 0 ? unit : 0;
    }
  } else if (quantity < 0) {
    quantity = -quantity; cost = available > 0 ? unit : 0;
    while (quantity >= cost && f(available + units) > 0) {
      requireThat(++iterations <= 65536, 'UNSUPPORTED_MARKET_RANGE', 'Trade impact exceeds supported conversion work budget');
      quantity = f(quantity - cost); units = f(units - 1); cost = f(available + units) > 0 ? unit : 0;
    }
  }
  // getQuantityForModValue iterates in the same unit domain, including the zero-availability guard.
  let consumed = 0, remaining = Math.abs(units); available = f(row.availableWithoutTrade);
  while (remaining > 0 && (units > 0 || available > 0)) {
    cost = (units > 0 ? f(available + 1) : available) > 0 ? unit : 0;
    consumed = f(consumed + (units > 0 ? cost : -cost));
    available = f(available + (units > 0 ? 1 : -1)); remaining = f(remaining - 1);
  }
  return f(f(f(combined - consumed) + f(total - combined)) * f(row.utilityOnMarket));
}
export function originalMarketStockpileUtility(commodityOrder, commodities, commodityId) {
  const spec = originalMarketCommodity(commodityId); let utility = 0;
  for (const id of commodityOrder) {
    const other = reference.commodities[id]; if (other.demandClass !== spec.demandClass) continue;
    const row = commodities[id];
    utility = f(utility + f(f(row.stockpile) * f(row.utilityOnMarket)));
    utility = f(utility + originalTradeStockpileContribution(row, other));
  }
  finite(utility, 'demand-class stockpile utility', -ORIGINAL_MARKET_NUMERIC_LIMIT, ORIGINAL_MARKET_NUMERIC_LIMIT);
  return utility;
}
/** Unrounded native resource price, retained until the whole transaction is settled. */
export function originalCommodityTradeGross(input) {
  const { commodityId, side, quantity, submarketKind, tariffRate, stockpileUtility, demandValue, greed, utilityOnMarket, thresholds, marketMod, playerMod } = input;
  const spec = originalMarketCommodity(commodityId), baseSpec = reference.commodities[spec.demandClass];
  integer(quantity, 'trade quantity', 1); requireThat(quantity <= ORIGINAL_MARKET_NUMERIC_LIMIT, 'UNSUPPORTED_MARKET_RANGE', 'Quantity exceeds exact native float integer range');
  requireThat(['buy', 'sell'].includes(side) && ['open', 'black'].includes(submarketKind), 'UNSUPPORTED_MARKET_STATE', 'Unsupported native transaction kind');
  checkedFloat(demandValue, 'demand'); checkedFloat(greed, 'greed'); checkedFloat(utilityOnMarket, 'commodity utility');
  requireThat(utilityOnMarket > 0, 'UNSUPPORTED_MARKET_STATE', 'Commodity utility must be positive');
  finite(stockpileUtility, 'stockpile utility', -ORIGINAL_MARKET_NUMERIC_LIMIT, ORIGINAL_MARKET_NUMERIC_LIMIT);
  finite(tariffRate, 'tariff', 0, 1); validateOriginalPriceModifiers(marketMod); validateOriginalPriceModifiers(playerMod); validateOriginalPriceThresholds(thresholds);
  let gross;
  if (spec.variability === 'V0') {
    // V0 bypasses both the integral and the market-level modifier, but not the player modifier.
    gross = effective(f(quantity * spec.basePrice), playerMod);
  } else {
    const utilityQuantity = quantity * f(utilityOnMarket);
    let stockpile = Math.max(0, stockpileUtility); if (side === 'buy') stockpile = Math.max(stockpile, utilityQuantity);
    const integrated = originalMarketPriceIntegral({ basePrice: f(baseSpec.basePrice / baseSpec.utility),
      demand: side === 'buy' ? f(f(demandValue) + f(greed)) : demandValue, variability: baseSpec.variability,
      stockpile, quantity: utilityQuantity, side, thresholds });
    const perUnit = f(integrated / quantity);
    let value = effective(perUnit, marketMod) * quantity;
    // Inspected Market.java 883-891: supply's player modifier intentionally uses d6 BEFORE marketMod.
    // Demand instead recomputes the per-unit value after marketMod. Do not "correct" this asymmetry.
    value = effective(side === 'buy' ? perUnit : f(value / quantity), playerMod) * quantity;
    gross = f(Math.floor(Math.max(quantity, value)));
  }
  finite(gross, 'gross credits', 0, ORIGINAL_MARKET_NUMERIC_LIMIT);
  return gross;
}
/** Native Market price + single-line F.getTransactionValue; state values must be server resolved. */
export function quoteOriginalCommodityTrade(input) {
  const gross = originalCommodityTradeGross(input);
  const { commodityId, side, quantity, submarketKind, tariffRate } = input;
  const spec = originalMarketCommodity(commodityId);
  const applicableTariff = submarketKind === 'black' ? 0 : f(tariffRate);
  const tariff = Math.floor(f(applicableTariff * Math.abs(gross)) + 0.5);
  const subtotal = Math.trunc(gross), creditsDelta = (side === 'buy' ? -subtotal : subtotal) - tariff;
  requireThat(Number.isSafeInteger(creditsDelta) && Math.abs(creditsDelta) <= ORIGINAL_MARKET_NUMERIC_LIMIT, 'UNSUPPORTED_MARKET_RANGE', 'Settlement exceeds exact native credit range');
  return immutableJSON({ commodityId, side, quantity, gross: subtotal, tariffRate: applicableTariff, tariff, creditsDelta,
    averageBeforeTariff: gross / quantity, pricing: spec.variability === 'V0' ? 'native-fixed-resource' : 'native-stockpile-integral' });
}
