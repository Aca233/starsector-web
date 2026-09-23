import { finite, requireThat, immutableJSON } from '../core/Values.mjs';
import { ORIGINAL_MARKET_NUMERIC_LIMIT as limit } from './OriginalMarketPricing.mjs';
const f = Math.fround;
/** F.getTransactionValue without a held cursor: settled net lines, in each cargo's stack order. */
export function originalMarketBasketTotals(lines, tariffRate) {
  requireThat(Array.isArray(lines) && lines.length > 0 && lines.length <= 64, 'UNSUPPORTED_MARKET_RANGE', 'Expected 1..64 net trade lines');
  finite(tariffRate, 'tariff', 0, 1);
  let buy = 0, sell = 0;
  for (const line of lines) {
    requireThat(line && ['buy', 'sell'].includes(line.side), 'INVALID_COMMAND', 'Unknown trade side');
    finite(line.rawGross, 'line gross', 0, limit);
    const next = line.side === 'buy' ? buy - line.rawGross : sell + line.rawGross;
    requireThat(Math.abs(next) <= limit, 'UNSUPPORTED_MARKET_RANGE', 'Basket exceeds supported native amount range');
    if (line.side === 'buy') buy = f(next);
    else sell = f(next);
  }
  const rate = f(tariffRate);
  const tariff = Math.floor(f(f(rate * Math.abs(buy)) + f(rate * Math.abs(sell))) + 0.5);
  const subtotal = Math.trunc(f(sell + buy));
  const creditsDelta = f(subtotal - tariff);
  requireThat(Number.isSafeInteger(creditsDelta) && Math.abs(subtotal - tariff) <= limit, 'UNSUPPORTED_MARKET_RANGE', 'Basket settlement exceeds exact native credit range');
  return immutableJSON({ buyGross: -buy || 0, sellGross: sell, subtotal: subtotal || 0, tariffRate: rate, tariff, creditsDelta: creditsDelta || 0 });
}
