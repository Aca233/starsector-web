/** Source-pinned economy kernels. Synthetic inputs test formulae; they are NOT a populated native economy. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { CampaignError } from '../src/campaign/core/Values.mjs';
import { ORIGINAL_MARKET_ECONOMY as R, originalEconomyCommodity, originalJavaStringHash, originalMarketMonthlyRandom,
  resolveOriginalEconomyBonus, resolveOriginalEconomyMutable, resolveOriginalIndustryAmounts, originalEconomyShipping,
  resolveOriginalEconomyExports, resolveOriginalEconomyAvailability, originalEconomyTradeLevel, originalCommodityIconCounts,
  resolveOriginalMarketEconomyPass } from '../src/campaign/rules/OriginalMarketEconomy.mjs';
import { createOriginalMarketTradeLedger, ingestOriginalMarketTrade, advanceOriginalMarketTradeLedger, originalMarketTradeQuantities } from '../src/campaign/rules/OriginalMarketEconomyLedger.mjs';
import { initialOriginalEconomySchedule, advanceOriginalEconomySchedule } from '../src/campaign/rules/OriginalMarketEconomySchedule.mjs';
import { originalMarketStockpileUtility, quoteOriginalCommodityTrade } from '../src/campaign/rules/OriginalMarketPricing.mjs';
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..'), native = resolve(project, '../decompiled'), f = Math.fround;
const bonus = () => ({ flat: [], percent: [], mult: [] });
const mutable = () => ({ base: 0, modifiers: bonus() });
const trade = () => ({ both: 0, plus: 0, minus: 0 });
const industry = (supply = 3, demand = 5, id = 'actual-effective-industry') => ({ id, supply, demand, supplyLegal: true, demandLegal: true });
const fixture = () => ({ marketId: 'test-market', commodityId: 'supplies', month: 9, sourceRevision: 'source-revision-1', phase: 'native-final-iteration',
  industry: { industries: [industry()], previousSupplyLegal: true, previousDemandLegal: true },
  network: { shippingGlobal: 5, shippingFaction: 10, maxExportGlobal: 6, maxExportFaction: 6, hidden: false },
  otherAvailableFlat: 0, eventModBeforePass: 0, tradeMod: trade(), demandStat: mutable(), greedStat: mutable(),
  playerModifiers: { a: { supply: bonus(), demand: bonus() }, b: { supply: bonus(), demand: bonus() } }, marketModifiers: { supply: bonus(), demand: bonus() } });
const reject = (fn, code) => assert.throws(fn, e => e instanceof CampaignError && (!code || e.code === code));
const availability = (values = {}) => ({ maxSupply: 3, maxDemand: 7, supplyLegal: true, demandLegal: true, hidden: false,
  shippingGlobal: 4, shippingFaction: 6, maxExportGlobal: 5, maxExportFaction: 6, otherFlat: 0, ...values });
const frame = (values = {}) => ({ amountDays: 0, month: 9, day: 1, daysInMonth: 30, completedTask: null, ...values });
const ledger = (values = {}) => createOriginalMarketTradeLedger({ atTick: 0, ticksPerSecond: 60, entries: [], ...values });
const fact = (values = {}) => ({ requestId: 'trade-1', playerId: 'a', submarketId: 'open', commodityId: 'supplies', channel: 'plus', quantity: 100, createdTick: 0, expiresAtGameSeconds: 1200, ...values });

test('import reproduces settings, commodity catalogue and 17 pinned source hashes', () => {
  const p = spawnSync(process.execPath, ['scripts/import-campaign-market-economy.mjs', '--check'], { cwd: project, encoding: 'utf8' });
  assert.equal(p.status, 0, p.stdout + p.stderr); assert.equal(Object.keys(R.sources).length, 17);
});
test('max industry output, Java rounding, ordered tie legality, and zero legality persistence', () => {
  const input = { commodityId: 'supplies', previousSupplyLegal: false, previousDemandLegal: false,
    industries: [industry(3.5, 4.49, 'one'), { ...industry(4, 6.5, 'two'), supplyLegal: false, demandLegal: false }] };
  assert.deepEqual(resolveOriginalIndustryAmounts(input), { maxSupply: 4, maxDemand: 7, supplyLegal: true, demandLegal: false });
  input.industries = [industry(-1, -3)]; assert.deepEqual(resolveOriginalIndustryAmounts(input), { maxSupply: 0, maxDemand: 0, supplyLegal: false, demandLegal: false });
  input.industries = [industry(), industry()]; reject(() => resolveOriginalIndustryAmounts(input));
});
test('supported primary resources only; ordered stat source ids are validated', () => {
  for (const id of ['supplies', 'food', 'fuel']) assert.equal(originalEconomyCommodity(id).id, id);
  for (const id of ['volturnian_lobster', 'credits', 'does-not-exist']) reject(() => originalEconomyCommodity(id));
  assert.deepEqual(resolveOriginalEconomyBonus({ flat: [{ id: 'one', value: 3 }, { id: 'two', value: 2 }], percent: [{ id: 'pct', value: 10 }], mult: [{ id: 'mult', value: 0.5 }] }), { flat: 5, percent: 10, mult: 0.5 });
  assert.equal(resolveOriginalEconomyMutable({ base: 10, modifiers: { flat: [{ id: 'f', value: 5 }], percent: [{ id: 'p', value: 10 }], mult: [{ id: 'm', value: 0.5 }] } }), 8);
  reject(() => resolveOriginalEconomyBonus({ flat: [{ id: 'x', value: 1 }, { id: 'x', value: 2 }], percent: [], mult: [] }));
  reject(() => resolveOriginalEconomyBonus({ flat: [], percent: [], mult: [{ id: 'x', value: 1e7 }, { id: 'y', value: 1e7 }, { id: 'z', value: 1e7 }, { id: 'w', value: 1e7 }, { id: 'overflow', value: 1e7 }] }));
});
test('shipping rounds accessibility before applying faction bonus; export uses before-pass state', () => {
  assert.deepEqual(originalEconomyShipping(0.596), { global: 6, inFaction: 11 }); assert.deepEqual(originalEconomyShipping(-0.6), { global: 0, inFaction: 0 });
  const input = { coverage: 'complete-econ-group', econGroup: null, rows: [
    { marketId: 'a', factionId: 'hegemony', maxSupply: 8, availableBeforePass: 4, shippingGlobalBeforePass: 3, shippingFactionBeforePass: 7 },
    { marketId: 'b', factionId: 'independent', maxSupply: 6, availableBeforePass: 8, shippingGlobalBeforePass: 5, shippingFactionBeforePass: 10 }] };
  assert.deepEqual(resolveOriginalEconomyExports(input), { maxExportGlobal: 5, maxExportPerFaction: { hegemony: 4, independent: 6 } });
  reject(() => resolveOriginalEconomyExports({ ...input, coverage: 'one-local-market' }), 'INCOMPLETE_ECONOMY_NETWORK');
  reject(() => resolveOriginalEconomyExports({ ...input, rows: [...input.rows, input.rows[0]] }));
});
test('availability reflects local/import/shortage/low-access, hidden markets and illegal faction tie', () => {
  const result = resolveOriginalEconomyAvailability(availability());
  assert.equal(result.availableWithoutTrade, 6); assert.equal(result.source, 'IN_FACTION');
  assert.deepEqual(result.core, { local: 3, imports: 4, shortage: -1, lowAccess: 0 });
  assert.equal(resolveOriginalEconomyAvailability(availability({ hidden: true })).availableWithoutTrade, 3);
  assert.equal(resolveOriginalEconomyAvailability(availability({ shippingFaction: 2, shippingGlobal: 1, maxExportFaction: 8 })).availableWithoutTrade, 5);
  const illegal = resolveOriginalEconomyAvailability(availability({ maxSupply: 0, maxDemand: 4, supplyLegal: false, demandLegal: false, shippingGlobal: 4, shippingFaction: 4, maxExportGlobal: 4, maxExportFaction: 4 }));
  assert.equal(illegal.sourceIsIllegal, true); assert.equal(illegal.source, 'IN_FACTION'); assert.equal(illegal.availableWithoutTrade, 4);
});
test('early availability continue preserves captured eMod rather than fabricating a reapply', () => {
  const input = fixture(); input.industry.industries = []; input.network.maxExportGlobal = 0; input.network.maxExportFaction = 0; input.eventModBeforePass = 2;
  const result = resolveOriginalMarketEconomyPass(input); assert.equal(result.diagnostics.availability.reappliesEventMod, false); assert.equal(result.diagnostics.tradeLevel, 0);
  assert.equal(result.diagnostics.appliedEventMod, 2); assert.equal(result.diagnostics.available, 2);
  assert.deepEqual(result.diagnostics.icons, originalCommodityIconCounts({ available: 2, maxSupply: 0, maxDemand: 0, shippingGlobal: 5, shippingFaction: 10 }));
  const missing = structuredClone(input); delete missing.eventModBeforePass; reject(() => resolveOriginalMarketEconomyPass(missing));
});
test('trade quantities use signed channel filters and econ-unit thresholds, not quantity as levels', () => {
  assert.equal(originalEconomyTradeLevel(4, 100, { both: 0, plus: -500, minus: 500 }), 0);
  for (const [q, levels] of [[99, 0], [100, 1], [201, 2], [-99, 0], [-100, -1], [-999, -4]]) assert.equal(originalEconomyTradeLevel(4, 100, { ...trade(), both: q }), levels);
  assert.equal(originalEconomyTradeLevel(0, 100, { ...trade(), both: 100 }), 1);
  reject(() => originalEconomyTradeLevel(1, 0, trade()));
});
test('pass produces immutable deterministic quote inputs, does not mint a freshness tick', () => {
  const input = fixture(), before = structuredClone(input), first = resolveOriginalMarketEconomyPass(input);
  assert.deepEqual(input, before); assert.deepEqual(first, resolveOriginalMarketEconomyPass(input)); assert.ok(Object.isFrozen(first.commodity));
  assert.equal(Object.hasOwn(first, 'asOfTick'), false); assert.equal(Object.hasOwn(first.commodity, 'asOfTick'), false);
  assert.equal(first.diagnostics.amounts.maxSupply, 3); assert.equal(first.diagnostics.available, 5);
  const c = first.commodity;
  const quote = quoteOriginalCommodityTrade({ commodityId: input.commodityId, side: 'buy', quantity: 20, submarketKind: 'open', tariffRate: 0.3,
    stockpileUtility: originalMarketStockpileUtility(['supplies'], { supplies: c }, 'supplies'), demandValue: c.demandValue, greed: c.greed, utilityOnMarket: c.utilityOnMarket,
    thresholds: c.supplyPrice, marketMod: first.marketSupplyMod, playerMod: c.playerSupplyModsByPlayer.a });
  assert.equal(quote.pricing, 'native-stockpile-integral'); assert.ok(quote.gross > 0); assert.ok(quote.tariff > 0); assert.ok(quote.creditsDelta < -quote.gross);
});
test('no-demand core is replaced, not compounded; demand restoration removes only core; players isolated', () => {
  const input = fixture(); input.industry.industries = []; input.playerModifiers.a.demand.mult.push({ id: 'skill', value: 0.8 });
  const first = resolveOriginalMarketEconomyPass(input); assert.equal(first.commodity.playerDemandModsByPlayer.a.mult, f(0.4)); assert.equal(first.commodity.playerDemandModsByPlayer.b.mult, 0.5);
  Object.assign(input, first.nativeStats); assert.deepEqual(resolveOriginalMarketEconomyPass(input), first);
  input.industry.industries = [industry()]; const next = resolveOriginalMarketEconomyPass(input);
  assert.equal(next.commodity.playerDemandModsByPlayer.a.mult, f(0.8)); assert.equal(next.commodity.playerDemandModsByPlayer.b.mult, 1);
});
test('deficit and positive trade extra choose original asymmetric price thresholds', () => {
  const input = fixture(); input.network.hidden = true; input.industry.industries = [industry(1, 8)];
  const shortage = resolveOriginalMarketEconomyPass(input); assert.equal(shortage.commodity.supplyPrice.highMult, 1.25); assert.equal(shortage.commodity.demandPrice.highMult, 1.25);
  input.industry.industries = [industry(5, 5)]; input.tradeMod.plus = R.commodities.supplies.econUnit * 2;
  const extra = resolveOriginalMarketEconomyPass(input); assert.equal(extra.diagnostics.tradeLevel, 2);
  assert.equal(extra.commodity.supplyPrice.highMult, 1.25); assert.equal(extra.commodity.demandPrice.highThreshold, -1); assert.equal(extra.commodity.supplyPrice.lowMult, f(0.85));
});
test('unknown fields, missing modifiers, nonfinite inputs, invalid months/phases reject', () => {
  for (const mutation of [i => i.asOfTick = 1, i => i.phase = 'each-tick', i => i.month = 13, i => delete i.playerModifiers,
    i => i.industry.commodityId = 'food', i => i.network.shippingGlobal = NaN, i => i.demandStat.base = Infinity,
    i => i.otherAvailableFlat = -Infinity, i => i.otherAvailableFlat = -100, i => i.playerModifiers.a.supply.mult.push({ id: 'negative', value: -1 }), i => i.tradeMod.plus = NaN, i => i.playerModifiers.a.demand.flat.push({ id: 'bad', value: Infinity })]) {
    const input = fixture(); mutation(input); reject(() => resolveOriginalMarketEconomyPass(input));
  }
  assert.equal(originalJavaStringHash('hello'), 99162322); assert.deepEqual(originalMarketMonthlyRandom('jangala', 'supplies', 9), originalMarketMonthlyRandom('jangala', 'supplies', 9));
});
test('ledger ingests real settlement once, rejects changed content and late insertion', () => {
  const initial = ledger(), entry = fact(), first = ingestOriginalMarketTrade(initial, entry);
  assert.equal(initial.entries.length, 0); assert.equal(first.entries.length, 1); assert.deepEqual(ingestOriginalMarketTrade(first, entry), first);
  assert.deepEqual(originalMarketTradeQuantities(first, 'supplies'), { both: 0, plus: 100, minus: 0 });
  reject(() => ingestOriginalMarketTrade(first, fact({ quantity: 101 })), 'REQUEST_REUSED');
  reject(() => ingestOriginalMarketTrade(advanceOriginalMarketTradeLedger(initial, 1).ledger, entry), 'TRADE_REPLAY_REQUIRED');
  reject(() => ingestOriginalMarketTrade(initial, fact({ expiresAtGameSeconds: 1199 })), 'UNSUPPORTED_TRADE_LEDGER');
  const another = ingestOriginalMarketTrade(first, fact({ playerId: 'b' })); assert.equal(another.entries.length, 2);
});
test('timers decrement exact fixed frames with no amplitude decay; batching preserves bits', () => {
  const first = ingestOriginalMarketTrade(ledger(), fact()), once = advanceOriginalMarketTradeLedger(first, 600);
  const batches = advanceOriginalMarketTradeLedger(advanceOriginalMarketTradeLedger(first, 200).ledger, 400);
  assert.deepEqual(once.ledger, batches.ledger); assert.deepEqual(advanceOriginalMarketTradeLedger(first, 0).ledger, first);
  assert.equal(originalMarketTradeQuantities(once.ledger, 'supplies').plus, 100); assert.ok(once.ledger.entries[0].remainingDays < 120);
});
test('native expiry is not a nominal deadline; receipts survive expiry; permanent captured mods explicit', () => {
  const start = ingestOriginalMarketTrade(ledger(), fact()); const end = advanceOriginalMarketTradeLedger(start, 80000);
  assert.equal(end.expired.length, 1); assert.notEqual(end.expired[0].atTick, 72000); assert.equal(end.ledger.entries.length, 0);
  assert.deepEqual(ingestOriginalMarketTrade(end.ledger, fact()), end.ledger);
  const permanent = ledger({ entries: [{ key: 'captured-core', commodityId: 'supplies', channel: 'both', quantity: -42, remainingDays: null }] });
  assert.equal(originalMarketTradeQuantities(advanceOriginalMarketTradeLedger(permanent, 80000).ledger, 'supplies').both, -42);
  reject(() => ledger({ entries: [{ key: 'unknown-expiry', commodityId: 'supplies', channel: 'plus', quantity: 1 }] }));
});
test('schedule preserves civil month boundary and only final iteration updates stockpile', () => {
  let result = advanceOriginalEconomySchedule(initialOriginalEconomySchedule(), frame({ month: 2, daysInMonth: 28 }));
  assert.equal(result.state.untilNext, f(27 / 10)); assert.deepEqual(result.events.map(e => e.type), ['economy-tick', 'economy-month-end']);
  const flags = [];
  for (let pass = 0; pass < 10; pass++) {
    result = advanceOriginalEconomySchedule(result.state, frame({ amountDays: 3, month: 2, daysInMonth: 28 }));
    flags.push(result.events.find(e => e.type === 'begin-economy-pass').withStockpileUpdate);
    for (const task of R.formulas.taskOrder) result = advanceOriginalEconomySchedule(result.state, frame({ month: 2, daysInMonth: 28, completedTask: task }));
  }
  assert.deepEqual(flags, [...Array(9).fill(false), true]); assert.equal(result.state.iterLeft, 0); assert.equal(result.state.phase, 'WAITING');
});
test('scheduler waits for actual task completion, rejects reordering and defers month change during work', () => {
  let r = advanceOriginalEconomySchedule(initialOriginalEconomySchedule(), frame({ day: 30 })); assert.equal(r.state.phase, 'DOING_TASKS');
  reject(() => advanceOriginalEconomySchedule(r.state, frame({ completedTask: 'ImmigrationTask' })), 'ECONOMY_TASK_ORDER');
  const pending = advanceOriginalEconomySchedule(r.state, frame({ month: 10 })); assert.equal(pending.state.prevMonth, 9); assert.equal(pending.state.taskIndex, 0);
  for (const task of R.formulas.taskOrder) r = advanceOriginalEconomySchedule(r.state, frame({ month: 10, completedTask: task }));
  const next = advanceOriginalEconomySchedule(r.state, frame({ month: 10, daysInMonth: 31 })); assert.equal(next.state.prevMonth, 10); assert.equal(next.state.untilNext, 3);
});

// Native oracle compiles pinned decompiled METHODS/CLASSES, not another hand-written version of the formulas.
function source(suffix) {
  const [relative, expected] = Object.entries(R.sources).find(([p]) => p.endsWith(suffix));
  const bytes = readFileSync(join(native, relative)); assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256, relative); return bytes.toString('utf8');
}
function method(text, signature) {
  const start = text.indexOf(signature); assert.ok(start >= 0, signature);
  const brace = text.indexOf('{', start); let depth = 0;
  for (let i = brace; i < text.length; i++) { if (text[i] === '{') depth++; if (text[i] === '}' && --depth === 0) return text.slice(start, i + 1); }
  throw Error('Unterminated native method ' + signature);
}
const bitsBuffer = new DataView(new ArrayBuffer(4));
const bits = n => { bitsBuffer.setFloat32(0, n); return bitsBuffer.getInt32(0); };
const jf = n => `${f(n)}f`;
const statSetup = (target, modifiers) => ['flat', 'percent', 'mult'].flatMap(kind => modifiers[kind].map(m => `${target}.modify${kind[0].toUpperCase() + kind.slice(1)}(${JSON.stringify(m.id)},${jf(m.value)});`)).join('\n');
function vectors() {
  const out = [];
  for (let i = 0; i < 160; i++) {
    const input = fixture(); input.marketId = ['jangala', 'corvus-independent', 'ZZZZZZZZZZZZZZ', 'seed-overflow'][i % 4]; input.month = i % 12 + 1;
    input.commodityId = ['supplies', 'food', 'fuel', 'ore'][i % 4]; input.industry.industries = [industry(i % 11, Math.floor(i / 3) % 10)];
    input.network = { shippingGlobal: i % 9, shippingFaction: i % 9 + 5, maxExportGlobal: Math.floor(i / 4) % 9, maxExportFaction: Math.floor(i / 7) % 11, hidden: i % 5 === 0 };
    input.tradeMod = { both: R.commodities[input.commodityId].econUnit * (i % 5 - 2), plus: R.commodities[input.commodityId].econUnit * (i % 7 - 2), minus: -R.commodities[input.commodityId].econUnit * (i % 3) };
    input.otherAvailableFlat = i % 4 === 0 ? 0.75 : 0; input.eventModBeforePass = i % 3;
    input.industry.industries[0].supplyLegal = i % 5 !== 0; input.industry.industries[0].demandLegal = i % 7 !== 0;
    input.demandStat = { base: 17.25, modifiers: { flat: [{ id: 'before', value: 0.125 }, { id: 'core', value: 999 }, { id: 'after', value: 1.75 }], percent: [{ id: 'percent', value: 13.75 }], mult: [{ id: 'factor', value: 1.125 }] } };
    input.greedStat = { base: 3.75, modifiers: { flat: [{ id: 'after', value: 11 }], percent: [{ id: 'percent', value: 7.5 }], mult: [{ id: 'factor', value: 0.875 }] } };
    input.playerModifiers.a.demand.mult = [{ id: 'skill', value: 0.8 }, { id: 'core', value: 0.7 }]; out.push(input);
  }
  return out;
}
function oracleSource(inputs) {
  const com = source('CommodityOnMarket.java'), main = source('MainWorkTask2.java'), cmd = source('CommodityMarketData.java');
  const clean = text => text.replace(/^package .*;\r?$/gm, '').replace(/^import com\..*;\r?$/gm, '').replace(/public class /g, 'class ');
  let update = method(main, 'public static void updateStockpileAndPriceV2');
  update = update.replace(/\bOOoO{30,}\b/g, 'Spec').replace(/\boOoO{30,}2\b/g, 'seedSpec');
  const icons = clean(source('CommodityIconCounts.java'));
  const availabilityStart = cmd.indexOf('            n7 = CommodityMarketData.getShippingCapacity(marketAPI, false);');
  const availabilityEnd = cmd.indexOf('            commodityOnMarketAPI.reapplyEventMod();', availabilityStart);
  assert.ok(availabilityStart > 0 && availabilityEnd > availabilityStart);
  const branch = cmd.slice(availabilityStart, availabilityEnd) + ' ((CommodityOnMarket)commodityOnMarketAPI).reapplyEventMod();';
  const allImports = 'import java.util.*;\n';
  const classes = [source('MutableStat.java'), source('StatBonus.java'), source('MutableStatWithTempMods.java')].map(clean).join('\n').replace(/^import .*;\r?$/gm, '');
  const calls = inputs.map((input, i) => {
    const net = input.network, a = input.industry.industries[0], mods = input.playerModifiers.a.demand;
    return `{ Market m=new Market(${JSON.stringify(input.marketId)},${net.shippingGlobal},${net.shippingFaction},${net.hidden}); Global.month=${input.month};
      CommodityOnMarket c=new CommodityOnMarket(m,new Spec(${JSON.stringify(input.commodityId)},${jf(R.commodities[input.commodityId].econUnit)})); m.com=c;
      c.maxSupply=${a.supply}; c.maxDemand=${a.demand}; c.available.modifyFlat("other",${jf(input.otherAvailableFlat)}); c.available.modifyFlat("eMod",${jf(input.eventModBeforePass)});
      c.tradeMod.modifyFlat("test",${jf(input.tradeMod.both)}); c.tradeModPlus.modifyFlat("test",${jf(input.tradeMod.plus)}); c.tradeModMinus.modifyFlat("test",${jf(input.tradeMod.minus)});
      c.demand.demand.setBaseValue(${jf(input.demandStat.base)}); ${statSetup('c.demand.demand', input.demandStat.modifiers)}
      c.greed.setBaseValue(${jf(input.greedStat.base)}); ${statSetup('c.greed', input.greedStat.modifiers)} ${statSetup('c.playerDemand', mods)}
      CommodityMarketData data=new CommodityMarketData(${net.maxExportGlobal},${net.maxExportFaction}); c.data=data;
      MarketShareData share=data.resolve(m,c,${!(a.demandLegal && a.demand > 0 || a.supplyLegal && a.supply > 0)});
      float withoutTrade=c.available.getModifiedValue()-(c.available.getFlatMods().get("eMod")==null?0:c.available.getFlatMods().get("eMod").value); MainWorkTask2.updateStockpileAndPriceV2(m,c.spec);
      CommodityIconCounts icons=new CommodityIconCounts(c);
      line("P${i}", withoutTrade,c.getAvailable(),c.getModValueForQuantity(c.getCombinedTradeModQuantity()), c.demand.demand.getModifiedValue(),c.greed.getModifiedValue(),c.stockpile,
        c.supply.highThreshold,c.supply.highMult,c.supply.lowThreshold,c.supply.lowMult,c.demandPrice.highThreshold,c.demandPrice.highMult,c.demandPrice.lowThreshold,c.demandPrice.lowMult,c.playerDemand.computeEffective(1),
        icons.production,icons.extra,icons.deficit,icons.globalExport,icons.inFactionOnlyExport,icons.canNotExport);
      System.out.println("S${i} "+share.source);
    }`;
  });
  const chunks = [];
  for (let i = 0; i < calls.length; i += 20) chunks.push(`static void part${i}(){${calls.slice(i, i + 20).join('\n')}}`);
  return `${allImports}${classes}\n${icons}
interface CommodityOnMarketAPI { int getAvailable(); int getMaxSupply(); int getMaxDemand(); Market getMarket(); Spec getCommodity(); MutableStatWithTempMods getAvailableStat(); }
interface MarketAPI { StatBonus getAccessibilityMod(); boolean isHidden(); }
class Spec { String id; float unit; Spec(String i,float u){id=i;unit=u;} String getId(){return id;} String getDemandClass(){return id;} boolean isPrimary(){return true;} float getEconUnit(){return unit;} }
class Market implements MarketAPI { String id; int sg,sf; boolean hidden; CommodityOnMarket com; StatBonus access=new StatBonus();
 Market(String id,int sg,int sf,boolean h){this.id=id;this.sg=sg;this.sf=sf;hidden=h;}
 String getId(){return id;} List<CommodityOnMarket> getCommoditiesWithClass(String ignored){return Arrays.asList(com);} public boolean isHidden(){return hidden;} public StatBonus getAccessibilityMod(){return access;}}
class Global { static int month; static Global getSector(){return new Global();} Global getClock(){return this;} int getMonth(){return month;}
 static Global getSettings(){return new Global();} int getShippingCapacity(Market m,boolean faction){return faction?m.sf:m.sg;} }
class MarketDemand { MutableStat demand=new MutableStat(0); MutableStat getDemand(){return demand;} }
class PriceCalculator { float highThreshold=-1,highMult=1,lowThreshold=-1,lowMult=1;
 void setHighPriceThreshold(float v){highThreshold=v;} void setHighPriceMult(float v){highMult=v;} void setLowPriceThreshold(float v){lowThreshold=v;} void setLowPriceMult(float v){lowMult=v;} }
class CommodityOnMarket implements CommodityOnMarketAPI { Market market; Spec spec; int maxSupply,maxDemand; float stockpile;
 MutableStatWithTempMods available=new MutableStatWithTempMods(0),tradeMod=new MutableStatWithTempMods(0),tradeModPlus=new MutableStatWithTempMods(0),tradeModMinus=new MutableStatWithTempMods(0);
 MutableStat greed=new MutableStat(0); StatBonus playerDemand=new StatBonus(); MarketDemand demand=new MarketDemand(); PriceCalculator supply=new PriceCalculator(),demandPrice=new PriceCalculator(); CommodityMarketData data;
 CommodityOnMarket(Market m,Spec s){market=m;spec=s;} public Market getMarket(){return market;} public Spec getCommodity(){return spec;} public int getMaxSupply(){return maxSupply;} public int getMaxDemand(){return maxDemand;}
 public MutableStatWithTempMods getAvailableStat(){return available;} MutableStat getGreed(){return greed;} StatBonus getPlayerDemandPriceMod(){return playerDemand;}
 MarketDemand getDemand(){return demand;} PriceCalculator getDemandPrice(){return demandPrice;} PriceCalculator getSupplyPrice(){return supply;} void updateCalc(){}
 void setStockpile(float v){stockpile=v;} float getStockpile(){return stockpile;} CommodityMarketData getCommodityMarketData(){return data;}
 MutableStatWithTempMods getTradeMod(){return tradeMod;} MutableStatWithTempMods getTradeModPlus(){return tradeModPlus;} MutableStatWithTempMods getTradeModMinus(){return tradeModMinus;}
 ${method(com, 'public int getAvailable()')}
 ${method(com, 'public float getCombinedTradeModQuantity()')}
 ${method(com, 'public void reapplyEventMod()')}
 ${method(com, 'public float getModValueForQuantity(float f2)')}
 ${method(com, 'public static float getTestModValue')}
}
class BaseIndustry { ${method(source('BaseIndustry.java'), 'public static float getSizeMult(float size)')} ${method(source('BaseIndustry.java'), 'public static float getCommodityEconUnitMult(float size)')} }
class Economy {
 static final int MIN_STOCKPILE_FOR_PRICING=${R.settings.economyMinStockpileForPricing};
 static final float ECONOMY_GREED_FRACTION=${jf(R.settings.economyGreedFraction)}, ECONOMY_NO_DEMAND_PRICE_MULT=${jf(R.settings.economyNoDemandPriceMult)},
 DEFICIT_PRICE_INCR_PER_UNIT=${jf(R.settings.economyDeficitPriceIncrPerUnit)}, DEFICIT_PRICE_MULT_MAX=${jf(R.settings.economyDeficitPriceMultMax)},
 EXCESS_PRICE_DECR_PER_UNIT=${jf(R.settings.economyExcessPriceDecrPerUnit)}, EXCESS_PRICE_MULT_MIN=${jf(R.settings.economyExcessPriceMultMin)};
}
class MainWorkTask2 { ${update} ${method(main, 'public static float getStockpileQuantity')} }
enum CommoditySourceType { NONE,LOCAL,IN_FACTION,GLOBAL }
class MarketShareData { boolean illegal; CommoditySourceType source; MarketShareData(boolean v){illegal=v;} boolean isSourceIsIllegal(){return illegal;} void setSource(CommoditySourceType s){source=s;} }
class CommodityMarketData { int maxExportGlobal,maxExportFaction; static final String KEY_LOCAL="core_local",KEY_IMPORTS="core_base",KEY_SHORTAGE="core_shortage",KEY_LOWACCESS="core_lowaccess";
 CommodityMarketData(int g,int f){maxExportGlobal=g;maxExportFaction=f;} int getMaxExportGlobal(){return maxExportGlobal;} int getMaxExport(String ignored){return maxExportFaction;}
 static int getShippingCapacity(MarketAPI m,boolean faction){return faction?((Market)m).sf:((Market)m).sg;}
 MarketShareData resolve(MarketAPI marketAPI,CommodityOnMarketAPI commodityOnMarketAPI,boolean illegal) {
   Object object2=new MarketShareData(illegal); String string4="faction"; int n7,n6,n5,n4,n3,n2,var30_41,var31_42,var32_43; boolean bl;
   for(int once=0;once<1;once++){${branch}} return (MarketShareData)object2;
 }
}
class ShippingNative { static final float SAME_FACTION_BONUS=${jf(R.settings.accessibilitySameFactionBonus)},PER_UNIT_SHIPPING=${jf(R.settings.accessibilityPerUnitShipping)}; ${method(cmd, 'public static int getShippingCapacity')} }
public class Oracle {
 static void line(String label,float... nums){StringBuilder s=new StringBuilder(label);for(float n:nums)s.append(' ').append(Float.floatToIntBits(n));System.out.println(s);}
 ${chunks.join('\n')}
 public static void main(String[] ignored){ ${calls.filter((_,i)=>i%20===0).map((_,i)=>`part${i*20}();`).join(' ')}
 for(int rate:new int[]{1,20,60,1000}) {MutableStatWithTempMods mod=new MutableStatWithTempMods(0);mod.addTemporaryModFlat(120,"trade",100);
   float days=(1f/rate)/10f;int tick=0;while(mod.hasMod("trade")&&tick<2000000){mod.advance(days);tick++;}System.out.println("T"+rate+" "+tick);}
 for(int i=0;i<201;i++){float access=(i-80)/100f+0.0049f;Market m=new Market("ship",0,0,false);m.access.modifyFlat("test",access);System.out.println("H"+i+" "+ShippingNative.getShippingCapacity(m,false)+" "+ShippingNative.getShippingCapacity(m,true));}
 for(int i=0;i<100;i++){String id="overflow-market-"+i;String commodity="supplies";int month=i%12+1;int seed=id.hashCode()+commodity.hashCode()+month*170000;Random random=new Random(seed);
 System.out.println("R"+i+" "+seed+" "+Float.floatToIntBits(random.nextFloat())+" "+Float.floatToIntBits(random.nextFloat()));}
 }
}`;
}

test('native Java oracle: pinned price pass + icons + availability branch + float timers + shipping + RNG', () => {
  const inputs = vectors(), dir = mkdtempSync(join(tmpdir(), 'campaign-market-economy-oracle-'));
  // All temporary source/classes are direct children of this newly-created directory; no recursive delete.
  try {
    writeFileSync(join(dir, 'Oracle.java'), oracleSource(inputs));
    const compile = spawnSync('javac', ['-encoding', 'UTF-8', 'Oracle.java'], { cwd: dir, encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
    assert.equal(compile.status, 0, compile.error?.message ?? compile.stderr);
    const run = spawnSync('java', ['-cp', dir, 'Oracle'], { cwd: dir, encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
    assert.equal(run.status, 0, run.error?.message ?? run.stderr);
    const lines = new Map(run.stdout.trim().split(/\r?\n/).map(line => { const [key,...v] = line.split(' '); return [key,v]; }));
    inputs.forEach((input, i) => {
      const result = resolveOriginalMarketEconomyPass(input), c = result.commodity, d = result.diagnostics, icons = d.icons;
      const expected = [c.availableWithoutTrade,d.available,d.tradeLevel,c.demandValue,c.greed,c.stockpile,
        c.supplyPrice.highThreshold,c.supplyPrice.highMult,c.supplyPrice.lowThreshold,c.supplyPrice.lowMult,c.demandPrice.highThreshold,c.demandPrice.highMult,c.demandPrice.lowThreshold,c.demandPrice.lowMult,c.playerDemandModsByPlayer.a.mult,
        icons.production,icons.extra,icons.deficit,icons.globalExport,icons.inFactionOnlyExport,icons.canNotExport].map(bits);
      assert.deepEqual(lines.get(`P${i}`).map(Number), expected, `Native price/availability vector ${i}: ${JSON.stringify(input)}`);
      assert.equal(lines.get(`S${i}`)[0], d.availability.source, `source ${i}`);
    });
    for(const rate of [1,20,60,1000]) {
      const initial = ingestOriginalMarketTrade(ledger({ ticksPerSecond: rate }), fact());
      const first = advanceOriginalMarketTradeLedger(initial, Math.min(1000000, rate * 1300));
      const second = first.expired.length ? first : advanceOriginalMarketTradeLedger(first.ledger, rate * 1300 - 1000000);
      assert.equal(Number(lines.get(`T${rate}`)[0]), second.expired[0].atTick, `timer ${rate}`);
    }
    for(let i=0;i<201;i++) { const access=f(f((i-80)/100)+f(0.0049)), shipping=originalEconomyShipping(access); assert.deepEqual(lines.get(`H${i}`).map(Number),[shipping.global,shipping.inFaction],`shipping ${i}`); }
    for(let i=0;i<100;i++) { const r=originalMarketMonthlyRandom(`overflow-market-${i}`,'supplies',i%12+1); assert.deepEqual(lines.get(`R${i}`).map(Number),[r.seed,bits(r.demandRoll),bits(r.stockpileRoll)],`RNG ${i}`); }
    console.log('Native oracle matched 160 price/availability passes, 4 timer rates, 201 shipping vectors, 100 RNG seeds.');
  } finally {
    for(const name of readdirSync(dir)) unlinkSync(join(dir,name)); rmdirSync(dir);
  }
});
