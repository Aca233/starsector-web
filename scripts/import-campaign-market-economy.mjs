/** Import only the constants and source evidence used by the native economy kernels. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), check = args.includes('--check'), positional = args.filter(v => v !== '--check');
if (positional.length > 2) throw Error('Usage: node scripts/import-campaign-market-economy.mjs [core] [decompiled] [--check]');
const core = path.resolve(positional[0] ?? path.join(project, '../starsector-core'));
const decompiled = path.resolve(positional[1] ?? path.join(project, '../decompiled'));
const sources = {};
async function read(root, relative) {
  const bytes = await fs.readFile(path.join(root, relative));
  sources[relative] = { sha256: createHash('sha256').update(bytes).digest('hex') }; return bytes.toString('utf8');
}
const settingsText = await read(core, 'data/config/settings.json');
await read(core, 'data/campaign/commodities.csv');
const paths = [
  'starfarer_obf/com/fs/starfarer/campaign/econ/reach/MainWorkTask2.java',
  'starfarer_obf/com/fs/starfarer/campaign/econ/reach/ReachEconomyStepper.java',
  'starfarer_obf/com/fs/starfarer/campaign/econ/reach/CommodityMarketData.java',
  'starfarer_obf/com/fs/starfarer/campaign/econ/reach/UpdateMarketsAgainTask.java',
  'starfarer_obf/com/fs/starfarer/campaign/econ/Market.java',
  'starfarer_obf/com/fs/starfarer/campaign/econ/CommodityOnMarket.java',
  'starfarer_obf/com/fs/starfarer/campaign/econ/MarketDemand.java',
  'starfarer_obf/com/fs/starfarer/campaign/econ/Economy.java',
  'starfarer_obf/com/fs/starfarer/campaign/CampaignClock.java',
  'starfarer.api/com/fs/starfarer/api/impl/campaign/econ/CommodityIconCounts.java',
  'starfarer.api/com/fs/starfarer/api/impl/campaign/econ/impl/BaseIndustry.java',
  'starfarer.api/com/fs/starfarer/api/combat/MutableStat.java',
  'starfarer.api/com/fs/starfarer/api/combat/StatBonus.java',
  'starfarer.api/com/fs/starfarer/api/combat/MutableStatWithTempMods.java',
  'starfarer.api/com/fs/starfarer/api/impl/campaign/submarkets/BaseSubmarketPlugin.java',
];
const text = {};
for (const p of paths) text[p] = await read(decompiled, p);
const setting = key => { const matches = [...settingsText.matchAll(new RegExp('^\\s*"' + key + '"\\s*:\\s*(-?(?:\\d+\\.?\\d*|\\.\\d+))', 'gm'))]; if (matches.length !== 1) throw Error('Missing/ambiguous native setting ' + key); return Number(matches[0][1]); };
const settings = Object.fromEntries(['economyIterPerMonth', 'economyMinStockpileForPricing', 'economyGreedFraction', 'economyNoDemandPriceMult',
  'economyDeficitPriceIncrPerUnit', 'economyDeficitPriceMultMax', 'economyExcessPriceDecrPerUnit', 'economyExcessPriceMultMin',
  'accessibilitySameFactionBonus', 'accessibilityPerUnitShipping'].map(k => [k, setting(k)]));
const fromConstant = (suffix, name) => { const source = text[paths.find(p => p.endsWith(suffix))]; const m = source.match(new RegExp('\\b' + name + '\\s*=\\s*(\\d+(?:\\.\\d+)?)f?\\s*;')); if (!m) throw Error('Missing constant ' + name); return Number(m[1]); };
settings.secondsPerDay = fromConstant('CampaignClock.java', 'SECONDS_PER_GAME_DAY');
settings.tradeImpactDays = fromConstant('BaseSubmarketPlugin.java', 'TRADE_IMPACT_DAYS');
const formulas = { stockpilePricePass: 'MainWorkTask2.updateStockpileAndPriceV2', industryAggregation: 'CommodityOnMarket.updateMaxSupplyAndDemand',
  availability: 'CommodityMarketData constructor core_local/core_base/core_shortage/core_lowaccess branch',
  tradeTime: 'MutableStatWithTempMods.advance subtracts float days each frame; no gradual amplitude decay',
  taskOrder: ['MainWorkTask2', 'UpdateMarketsAgainTask', 'ImmigrationTask', 'FinishEconomyUpdateTask'],
  support: 'Deterministic primary economic commodity kernels from explicit industry/network/modifier inputs. No automatic global economy, inventory generation, admission, or snapshot freshness certification.' };
const marketReference = JSON.parse(await fs.readFile(path.join(project, 'src/campaign/data/reference-market.json'), 'utf8'));
if (marketReference.provenance.sources['data/campaign/commodities.csv'].sha256 !== sources['data/campaign/commodities.csv'].sha256) throw Error('Market reference must first match the same installed commodity source');
const commodities = Object.fromEntries(Object.entries(marketReference.commodities).map(([id, s]) => [id, { id, demandClass: s.demandClass, econUnit: s.econUnit, utility: s.utility, tags: s.tags, origin: s.origin, plugin: s.plugin }]));
const result = { schemaVersion: 1, originalReference: marketReference.originalReference, sources, settings, formulas, commodities };
const destination = path.join(project, 'src/campaign/data/reference-market-economy.json'), output = JSON.stringify(result, null, 2) + '\n';
if (check) { if (await fs.readFile(destination, 'utf8') !== output) throw Error('Native economy reference differs; inspect then reimport explicitly'); }
else { await fs.writeFile(destination + '.tmp', output); await fs.rename(destination + '.tmp', destination); }
console.log(JSON.stringify({ destination, check, sources: Object.keys(sources).length, commodities: Object.keys(commodities).length }));
