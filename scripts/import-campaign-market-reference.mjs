/** Deterministic import of installed native commodity data, display order and the native source evidence. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), check = args.includes('--check'), positional = args.filter(v => v !== '--check');
if (positional.length > 2) throw Error('Usage: node scripts/import-campaign-market-reference.mjs [core] [decompiled] [--check]');
const core = path.resolve(positional[0] ?? path.join(project, '../starsector-core'));
const decompiled = path.resolve(positional[1] ?? path.join(project, '../decompiled'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sources = {};
async function source(root, relative, scope) {
  const bytes = await fs.readFile(path.join(root, relative));
  sources[relative] = { sha256: sha(bytes), scope };
  return bytes.toString('utf8');
}
const csv = await source(core, 'data/campaign/commodities.csv', 'Installed commodity data; local translation/modifications are not asserted to be pristine vanilla');
const settingsText = await source(core, 'data/config/settings.json', 'Pricing constants, read only active non-commented entries');
const nativePaths = {
  loader: 'starfarer_obf/com/fs/starfarer/loading/SpecStore.java',
  cargoSort: 'starfarer_obf/com/fs/starfarer/campaign/fleet/CargoData.java',
  calculator: 'starfarer_obf/com/fs/starfarer/campaign/econ/PriceCalculator.java',
  market: 'starfarer_obf/com/fs/starfarer/campaign/econ/Market.java',
  commodity: 'starfarer_obf/com/fs/starfarer/campaign/econ/CommodityOnMarket.java',
  demand: 'starfarer_obf/com/fs/starfarer/campaign/econ/MarketDemand.java',
  economy: 'starfarer_obf/com/fs/starfarer/campaign/econ/reach/MainWorkTask2.java',
  trade: 'starfarer_obf/com/fs/starfarer/campaign/ui/trade/F.java',
  contact: 'starfarer_obf/com/fs/starfarer/campaign/BaseLocation.java',
  clock: 'starfarer_obf/com/fs/starfarer/campaign/CampaignClock.java',
  variability: 'starfarer.api/com/fs/starfarer/api/campaign/econ/PriceVariability.java',
  bonus: 'starfarer.api/com/fs/starfarer/api/combat/StatBonus.java',
  temporaryMods: 'starfarer.api/com/fs/starfarer/api/combat/MutableStatWithTempMods.java',
  baseSubmarket: 'starfarer.api/com/fs/starfarer/api/impl/campaign/submarkets/BaseSubmarketPlugin.java',
  open: 'starfarer.api/com/fs/starfarer/api/impl/campaign/submarkets/OpenMarketPlugin.java',
  black: 'starfarer.api/com/fs/starfarer/api/impl/campaign/submarkets/BlackMarketPlugin.java',
  industry: 'starfarer.api/com/fs/starfarer/api/impl/campaign/econ/impl/BaseIndustry.java',
};
const native = {};
for (const [key, relative] of Object.entries(nativePaths)) native[key] = await source(decompiled, relative, key);
const activeSetting = key => {
  const rows = [...settingsText.matchAll(new RegExp('^\\s*"' + key + '"\\s*:\\s*(-?(?:\\d+\\.?\\d*|\\.\\d+))', 'gm'))];
  if (rows.length !== 1) throw Error('Missing/ambiguous setting ' + key);
  return Number(rows[0][1]);
};
const sourceConstant = (text, name) => {
  const match = text.match(new RegExp('\\b' + name + '\\s*=\\s*(\\d+(?:\\.\\d+)?)f?\\s*;'));
  if (!match) throw Error('Missing native constant ' + name);
  return Number(match[1]);
};
const settings = Object.fromEntries(['economyMinDemandForPricing', 'economyMinStockpileForPricing', 'economyNoDemandPriceMult',
  'economyGreedFraction', 'economyDeficitPriceIncrPerUnit', 'economyDeficitPriceMultMax', 'economyExcessPriceDecrPerUnit',
  'economyExcessPriceMultMin', 'rangeForMaxExoticDemand', 'exoticUtilityMultAtMaxRange'].map(k => [k, activeSetting(k)]));
settings.tradeImpactDays = sourceConstant(native.baseSubmarket, 'TRADE_IMPACT_DAYS');
settings.secondsPerDay = sourceConstant(native.clock, 'SECONDS_PER_GAME_DAY');
const priceVariability = Object.fromEntries([...native.variability.matchAll(/V(\d+)\((\d+(?:\.\d+)?)f\)/g)].map(m => ['V' + m[1], Math.fround(Number(m[2]))]));
if (Object.keys(priceVariability).length !== 11) throw Error('Unexpected native variability enum');
// Fail closed on the inspected defaults rather than silently guessing after a source update.
for (const text of ['optDouble("utility", 1.0)', 'optDouble("econUnit", 500.0)', 'optDouble("cargo space", 0.0)', 'PriceVariability.V4']) {
  if (!native.loader.includes(text)) throw Error('Native loader default changed: ' + text);
}
if (!/getCommodityEconUnitMult\(float size\)\s*\{\s*if \(size <= 0.0f\)\s*\{\s*return 0.0f;\s*\}\s*return 1.0f;/.test(native.industry)) throw Error('Native economy-unit conversion changed');
// Commodity order is a required double cast to float, not CSV position or an optional default.
const commodityLoader = native.loader.slice(native.loader.indexOf('"data/campaign/commodities.csv"'));
if (!commodityLoader.slice(0, commodityLoader.indexOf('setStackSize')).includes('setOrder((float)jSONObject.getDouble("order"))')) {
  throw Error('Native commodity order loading changed');
}
if (!commodityLoader.includes('setStackSize((int)jSONObject.getDouble("stack size"))')) throw Error('Native resource stack-size loading changed');
function parseCsv(text) {
  const rows = []; let row = [], field = '', quoted = false;
  const endField = () => { row.push(field.trim()); field = ''; };
  const endRow = () => { endField(); if (row.some(Boolean)) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c; }
    else if (c === '"' && !field.trim()) quoted = true; else if (c === ',') endField(); else if (c === '\n') endRow(); else if (c !== '\r') field += c;
  }
  if (quoted) throw Error('Unterminated CSV field'); if (field || row.length) endRow();
  const headers = rows.shift();
  return rows.filter(r => !r[0].startsWith('#')).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
}
const commodities = {};
for (const row of parseCsv(csv)) {
  if (!row.id) continue;
  if (Object.hasOwn(commodities, row.id)) throw Error('Duplicate commodity ' + row.id);
  const number = (column, fallback) => {
    if (!row[column] && fallback === null) return null;
    const n = row[column] ? Number(row[column]) : fallback;
    if (!Number.isFinite(n) || n < 0) throw Error('Invalid ' + row.id + '/' + column);
    return Math.fround(n);
  };
  const order = Math.fround(Number(row.order));
  if (!row.order || !Number.isFinite(order)) throw Error('Invalid or missing ' + row.id + '/order');
  const stackSize = Math.trunc(Number(row['stack size']));
  if (!row['stack size'] || !Number.isSafeInteger(stackSize) || stackSize < 1) throw Error('Invalid stack size ' + row.id);
  const variability = row['price variability'] ? 'V' + row['price variability'] : 'V4';
  if (!Object.hasOwn(priceVariability, variability)) throw Error('Unknown variability ' + variability);
  commodities[row.id] = { id: row.id, name: row.name, order, demandClass: row['demand class'], basePrice: number('base price', null),
    basePriceSource: row['base price'] ? 'explicit' : 'demand-class', variability, utility: number('utility', 1),
    econUnit: number('econUnit', 500), stackSize, cargoSpace: number('cargo space', 0), origin: row.origin || null,
    tags: row.tags.split(',').map(v => v.trim()).filter(Boolean), plugin: row.plugin || null, icon: row.icon };
}
// SpecStore's second pass overwrites non-primary commodity prices with demand-class price * utility ratio.
for (const row of Object.values(commodities)) if (row.id !== row.demandClass) {
  const base = commodities[row.demandClass];
  if (!base || base.basePrice === null || base.utility <= 0) throw Error('Unresolved demand class ' + row.id);
  row.basePrice = Math.fround(Math.fround(base.basePrice * row.utility) / base.utility);
  row.basePriceSource = 'demand-class';
}
for (const row of Object.values(commodities)) if (row.basePrice === null || row.utility <= 0 || row.econUnit <= 0) throw Error('Unsupported native commodity ' + row.id);
const output = { schemaVersion: 1, originalReference: 'Starsector 0.98a-RC8',
  provenance: { scope: 'Native commodity display order, resource stack sizes, prices and resolved-state trade pricing; NOT a sector economy, stock generator, diplomacy or customs simulator', sources },
  settings, priceVariability, commodities };
const destination = path.join(project, 'src/campaign/data/reference-market.json');
const text = JSON.stringify(output, null, 2) + '\n';
if (check) {
  if (await fs.readFile(destination, 'utf8') !== text) throw Error('Market reference differs from installed source; review and re-import explicitly');
} else {
  await fs.writeFile(destination + '.tmp', text, 'utf8'); await fs.rename(destination + '.tmp', destination);
}
console.log(JSON.stringify({ destination, check, commodities: Object.keys(commodities).length, sources: Object.keys(sources).length }));
