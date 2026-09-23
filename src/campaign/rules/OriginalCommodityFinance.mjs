import { identifier, requireThat, immutableJSON } from '../core/Values.mjs';
import { economyShape } from './OriginalMarketEconomy.mjs';
import { resolveOriginalCommodityNetwork } from './OriginalCommodityNetwork.mjs';
import { ORIGINAL_MARKET_FINANCE as R, financeFloat, financeStat, nativeInt } from './OriginalMarketFinance.mjs';
import { bool } from './OriginalIndustryState.mjs';
const f = Math.fround, check = (v, message) => requireThat(v, 'UNSUPPORTED_COMMODITY_FINANCE', message);
/** Native stable largest-remainder pass. Kept private: inputs must be normalized source shares. */
function adjust(rows, key) {
  const whole = n => Math.trunc(f(n * 100)), remainder = n => f(f(n * 100) - whole(n));
  let left = 100 - rows.reduce((a, r) => a + whole(r[key]), 0);
  const sorted = [...rows].sort((a, b) => Math.sign(f(remainder(b[key]) - remainder(a[key]))));
  for (const row of sorted) { if (!(row[key] > 0)) continue; if (left > 0) { row[key] = f((whole(row[key]) + 1) / 100); left--; } else row[key] = f(whole(row[key]) / 100); }
  return sorted.map(r => r.marketId);
}
/** Original single-player faction/skill semantics, not a multiplayer revenue-ownership policy or settlement. */
export function resolveOriginalCommodityFinance(input) {
  economyShape(input, ['network', 'financialMarkets'], 'commodity finance phase'); const network = resolveOriginalCommodityNetwork(input.network), markets = input.network.markets;
  check(Array.isArray(input.financialMarkets) && input.financialMarkets.length === markets.length, 'Expected complete ordered financial market roster');
  const commodity = R.commodities[input.network.commodityId]; check(Object.hasOwn(R.commodities, input.network.commodityId), 'Missing native export value');
  const valuesByFaction = {}; let rawMarketValue = 0, totalWeight = 0;
  const rows = markets.map((m, i) => {
    const fin = input.financialMarkets[i]; economyShape(fin, ['marketId', 'playerOwned', 'incomeMult', 'playerCommodityExportMult'], 'market finance input'); identifier(fin.marketId); check(fin.marketId === m.marketId, 'Financial market roster order differs'); bool(fin.playerOwned, 'player ownership'); financeStat(fin.incomeMult);
    if (fin.playerOwned) financeFloat(fin.playerCommodityExportMult, 'actual player commodity export modifier'); else check(fin.playerCommodityExportMult === null, 'Non-player market does not read player export stats');
    const access = network.access.markets[i], exportedBeforeCore = Math.min(m.amounts.maxSupply, m.availableBeforeCore, access.before.shipping.global);
    const weight = f((exportedBeforeCore <= 0 ? 0 : exportedBeforeCore) * Math.max(0, access.after.value)); totalWeight = f(totalWeight + weight);
    const units = Math.min(access.after.shipping.global, m.amounts.maxDemand), demandValue = nativeInt(f(f((units <= 0 ? 0 : units) * commodity.exportValue) * f(R.settings.exportIncomeMult)));
    rawMarketValue = f(rawMarketValue + f(demandValue)); valuesByFaction[m.factionId] = f((Object.hasOwn(valuesByFaction, m.factionId) ? valuesByFaction[m.factionId] : 0) + f(demandValue));
    return { marketId: m.marketId, factionId: m.factionId, exportedBeforeCore, weight, demandValue, exportMarketShare: 0, marketValueFraction: 0, sourceIsIllegal: network.markets[i].availability.sourceIsIllegal };
  });
  for (const row of rows) { if (totalWeight > 0) row.exportMarketShare = f(row.weight / totalWeight); if (rawMarketValue > 0) row.marketValueFraction = f(f(row.demandValue) / rawMarketValue); }
  const sortedProducers = adjust(rows, 'exportMarketShare'), sortedConsumers = adjust(rows, 'marketValueFraction');
  const marketValue = f(rawMarketValue - (Object.hasOwn(valuesByFaction, 'player') ? valuesByFaction.player : 0));
  const incomeRows = rows.map((row, i) => {
    const fin = input.financialMarkets[i], incomeMultiplier = financeStat(fin.incomeMult), exportMultiplier = fin.playerOwned ? fin.playerCommodityExportMult : 1;
    const exportIncome = row.sourceIsIllegal ? 0 : nativeInt(f(f(row.exportMarketShare * marketValue) * f(incomeMultiplier * exportMultiplier)));
    return { ...row, exportSharePercent: Math.floor(f(row.exportMarketShare * 100) + 0.5), marketValuePercent: Math.floor(f(row.marketValueFraction * 100) + 0.5), exportIncome };
  });
  return immutableJSON({ scope: 'original-single-player-commodity-financial-effects-only', network, rawMarketValue, marketValue, marketValuePerFaction: valuesByFaction, totalWeight, markets: incomeRows, sortedProducers, sortedConsumers });
}
