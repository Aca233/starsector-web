import { identifier, integer, requireThat, immutableJSON, canonicalJSON, isRecord } from '../core/Values.mjs';
import { ORIGINAL_MARKET_ECONOMY as R, economyShape, economyFloat, originalEconomyCommodity } from './OriginalMarketEconomy.mjs';
const f = Math.fround;
export function validateOriginalMarketTradeLedger(ledger) {
  economyShape(ledger, ['schemaVersion', 'semantics', 'atTick', 'ticksPerSecond', 'entries', 'receipts'], 'native trade ledger');
  requireThat(ledger.schemaVersion === 1 && ledger.semantics === 'java-float-fixed-frame-v1', 'UNSUPPORTED_TRADE_LEDGER', 'Unknown native timing semantics');
  integer(ledger.atTick, 'ledger tick'); integer(ledger.ticksPerSecond, 'ledger rate', 1);
  requireThat(ledger.ticksPerSecond <= 1000 && Array.isArray(ledger.entries) && ledger.entries.length <= 4096 && isRecord(ledger.receipts) && Object.keys(ledger.receipts).length <= 16384,
    'UNSUPPORTED_TRADE_LEDGER', 'Ledger exceeds supported state bounds');
  const keys = new Set();
  for (const e of ledger.entries) {
    economyShape(e, ['key', 'commodityId', 'channel', 'quantity', 'remainingDays'], 'trade modifier');
    requireThat(typeof e.key === 'string' && e.key.length > 0 && e.key.length <= 1024 && !keys.has(e.key), 'UNSUPPORTED_TRADE_LEDGER', 'Invalid/duplicate modifier identity'); keys.add(e.key);
    originalEconomyCommodity(e.commodityId); requireThat(['both', 'plus', 'minus'].includes(e.channel), 'UNSUPPORTED_TRADE_LEDGER', 'Unknown impact channel');
    economyFloat(e.quantity, 'impact quantity'); requireThat(e.quantity !== 0 && e.quantity === f(e.quantity), 'UNSUPPORTED_TRADE_LEDGER', 'Impact must be a nonzero native float');
    if (e.remainingDays !== null) { economyFloat(e.remainingDays, 'remaining native days', Number.MIN_VALUE); requireThat(e.remainingDays === f(e.remainingDays), 'UNSUPPORTED_TRADE_LEDGER', 'Persist the actual native float timer'); }
  }
  for (const [key, receipt] of Object.entries(ledger.receipts)) requireThat(key.length <= 1024 && typeof receipt === 'string' && receipt.length <= 4096, 'UNSUPPORTED_TRADE_LEDGER', 'Malformed consumed trade receipt');
}
export function createOriginalMarketTradeLedger(input) {
  economyShape(input, ['atTick', 'ticksPerSecond', 'entries'], 'initial captured trade ledger');
  const result = { schemaVersion: 1, semantics: 'java-float-fixed-frame-v1', ...input, receipts: {} }; validateOriginalMarketTradeLedger(result); return immutableJSON(result);
}
/** Ingest at the actual creation tick. Past events require replay from a prior ledger, not a fabricated remaining duration. */
export function ingestOriginalMarketTrade(ledger, fact) {
  validateOriginalMarketTradeLedger(ledger);
  economyShape(fact, [...(isRecord(fact) && Object.hasOwn(fact, 'lineId') ? ['lineId'] : []), 'requestId', 'playerId', 'submarketId', 'commodityId', 'channel', 'quantity', 'createdTick', 'expiresAtGameSeconds'], 'market settlement fact');
  for (const k of ['requestId', 'playerId', 'submarketId', 'commodityId']) identifier(fact[k]);
  originalEconomyCommodity(fact.commodityId); integer(fact.createdTick, 'trade creation tick'); economyFloat(fact.quantity, 'settled quantity');
  requireThat(fact.channel === 'plus' && fact.quantity !== 0, 'UNSUPPORTED_TRADE_LEDGER', 'Expected native open-market plus-channel settlement');
  requireThat(fact.expiresAtGameSeconds === fact.createdTick / ledger.ticksPerSecond + R.settings.tradeImpactDays * R.settings.secondsPerDay,
    'UNSUPPORTED_TRADE_LEDGER', 'Settlement fact has an inconsistent nominal duration');
  if (Object.hasOwn(fact, 'lineId')) requireThat(fact.lineId === fact.commodityId, 'UNSUPPORTED_TRADE_LEDGER', 'Basket line must identify its net commodity');
  const key = JSON.stringify([fact.playerId, fact.requestId, ...(Object.hasOwn(fact, 'lineId') ? [fact.lineId] : [])]), receipt = canonicalJSON(fact);
  const legacyKey = JSON.stringify([fact.playerId, fact.requestId]);
  const hasLine = Object.hasOwn(fact, 'lineId');
  requireThat(hasLine ? !Object.hasOwn(ledger.receipts, legacyKey) : !Object.keys(ledger.receipts).some(k => k.startsWith(legacyKey.slice(0, -1) + ',')),
    'REQUEST_REUSED', 'A settlement cannot switch between legacy and basket identity');
  if (Object.hasOwn(ledger.receipts, key)) { requireThat(ledger.receipts[key] === receipt, 'REQUEST_REUSED', 'Trade receipt identity was reused with changed content'); return immutableJSON(ledger); }
  requireThat(fact.createdTick === ledger.atTick, 'TRADE_REPLAY_REQUIRED', 'Must insert new trades at their actual tick; nominal expiry cannot reconstruct float countdown history');
  requireThat(!ledger.entries.some(e => e.key === key), 'UNSUPPORTED_TRADE_LEDGER', 'Captured modifier collides with a trade receipt');
  const next = structuredClone(ledger); next.receipts[key] = receipt;
  next.entries.push({ key, commodityId: fact.commodityId, channel: 'plus', quantity: f(fact.quantity), remainingDays: f(R.settings.tradeImpactDays) });
  validateOriginalMarketTradeLedger(next); return immutableJSON(next);
}
/** Fixed-authority-frame policy: seconds=float(1/rate), days=float(seconds/secondsPerDay), decrement EACH frame. */
export function advanceOriginalMarketTradeLedger(ledger, frames) {
  validateOriginalMarketTradeLedger(ledger); integer(frames, 'frame count'); integer(ledger.atTick + frames, 'advanced ledger tick');
  requireThat(frames <= 1000000 && frames * Math.max(1, ledger.entries.length) <= 5000000, 'ECONOMY_WORK_LIMIT', 'Advance the exact frames in bounded batches, never collapse native float countdown into a wall-time subtraction');
  const next = structuredClone(ledger), expired = [], daysPerFrame = f(f(1 / ledger.ticksPerSecond) / f(R.settings.secondsPerDay));
  for (let i = 0; i < frames; i++) {
    next.atTick++;
    next.entries = next.entries.filter(e => {
      if (e.remainingDays === null) return true;
      e.remainingDays = f(e.remainingDays - daysPerFrame);
      if (e.remainingDays <= 0) { expired.push({ key: e.key, atTick: next.atTick }); return false; } return true;
    });
  }
  validateOriginalMarketTradeLedger(next); return immutableJSON({ ledger: next, expired, daysPerFrame });
}
/** Sum in source insertion order as native MutableStat flat modifiers do; no gradual decay and no unexplained baseline. */
export function originalMarketTradeQuantities(ledger, commodityId) {
  validateOriginalMarketTradeLedger(ledger); originalEconomyCommodity(commodityId);
  const result = { both: 0, plus: 0, minus: 0 };
  for (const e of ledger.entries) if (e.commodityId === commodityId) result[e.channel] = f(result[e.channel] + e.quantity);
  Object.values(result).forEach(n => economyFloat(n, 'effective trade quantity')); return immutableJSON(result);
}
