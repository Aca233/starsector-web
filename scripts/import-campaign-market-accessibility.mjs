import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), args = process.argv.slice(2), check = args.includes('--check'), positional = args.filter(a => a !== '--check');
if (positional.length > 2) throw Error('Usage: import-campaign-market-accessibility.mjs [core] [decompiled] [--check]');
const roots = { core: path.resolve(positional[0] ?? path.join(project, '../starsector-core')), decompiled: path.resolve(positional[1] ?? path.join(project, '../decompiled')) }, sources = {};
async function read(root, relative) { const bytes = await fs.readFile(path.join(roots[root], relative)); sources[root + ':' + relative] = { sha256: createHash('sha256').update(bytes).digest('hex') }; return bytes.toString('utf8'); }
const settingsText = await read('core', 'data/config/settings.json'), settings = {};
for (const key of ['accessibilityBaseValue', 'accessibilityDistFromCOM', 'accessibilityLossWhenAllHostile', 'accessibilityNoSpaceport', 'accessibilitySameFactionBonus', 'accessibilityPerUnitShipping', 'unitsPerLightYear']) {
  const matches = [...settingsText.matchAll(new RegExp('^\\s*"' + key + '"\\s*:\\s*(-?[\\d.]+)', 'gm'))]; if (matches.length !== 1) throw Error('Ambiguous native setting ' + key); settings[key] = Number(matches[0][1]);
}
const api = 'starfarer.api/com/fs/starfarer/api/', obf = 'starfarer_obf/com/fs/starfarer/campaign/econ/';
for (const p of ['reach/CommodityMarketData.java', 'reach/ReachEconomy.java', 'reach/MainWorkTask2.java', 'Market.java']) await read('decompiled', obf + p);
for (const p of ['util/Misc.java', 'combat/StatBonus.java', 'combat/MutableStat.java', 'impl/campaign/econ/impl/BaseIndustry.java']) await read('decompiled', api + p);
const port = await read('decompiled', api + 'impl/campaign/econ/impl/Spaceport.java'), pop = await read('decompiled', api + 'impl/campaign/econ/impl/PopulationAndInfrastructure.java'), free = await read('decompiled', api + 'impl/campaign/econ/FreeMarket.java');
await read('core', 'lwjgl_util.jar');
function constants(source, names) { return Object.fromEntries(names.map(name => { const match = source.match(new RegExp('public static float ' + name + ' = ([\\d.]+)f;')); if (!match) throw Error('Missing constant ' + name); return [name, Number(match[1])]; })); }
const portSettings = constants(port, ['BASE_ACCESSIBILITY', 'MEGAPORT_ACCESSIBILITY', 'ALPHA_CORE_ACCESSIBILITY', 'IMPROVE_ACCESSIBILITY']);
const freeMarketSettings = constants(free, ['MIN_ACCESS_BONUS', 'MAX_ACCESS_BONUS', 'MAX_DAYS']);
const sizeMethod = pop.slice(pop.indexOf('public static float getAccessibilityBonus('), pop.indexOf('public static float getBaseGroundDefenses('));
const sizePairs = [...sizeMethod.matchAll(/if \(marketSize == (\d+)\) \{\s*return ([\d.]+)f;/g)].map(m => [Number(m[1]), Number(m[2])]);
if (sizePairs.length !== 4 || !sizeMethod.includes('marketSize <= 4')) throw Error('Review changed population bonus branches');
const returns = [...sizeMethod.matchAll(/return ([\d.]+)f;/g)];
const populationSizeBonus = Array.from({ length: 11 }, (_, n) => n <= 4 ? Number(returns[0][1]) : new Map(sizePairs).get(n) ?? Number(returns.at(-1)[1]));
const reference = JSON.parse(await fs.readFile(path.join(project, 'src/campaign/data/reference-industry-commodities.json'), 'utf8'));
for (const suffix of ['Spaceport.java', 'PopulationAndInfrastructure.java', 'BaseIndustry.java']) { const key = 'decompiled:' + api + 'impl/campaign/econ/impl/' + suffix; if (reference.sources[key].sha256 !== sources[key].sha256) throw Error('Reconcile civic source version first'); }
const output = JSON.stringify({ schemaVersion: 1, originalReference: reference.originalReference, scope: 'local-access-and-group-network-not-complete-economy', sources, settings, portSettings, freeMarketSettings, populationSizeBonus }, null, 2) + '\n';
const destination = path.join(project, 'src/campaign/data/reference-market-accessibility.json');
if (check) { if (await fs.readFile(destination, 'utf8') !== output) throw Error('Accessibility reference changed; inspect before reimporting'); } else await fs.writeFile(destination, output);
console.log(JSON.stringify({ check, sources: Object.keys(sources).length }));
