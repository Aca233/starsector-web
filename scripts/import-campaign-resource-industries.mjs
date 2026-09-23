import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), check = args.includes('--check'), positional = args.filter(v => v !== '--check');
if (positional.length > 1) throw Error('Usage: node scripts/import-campaign-resource-industries.mjs [decompiled] [--check]');
const root = path.resolve(positional[0] ?? path.join(project, '../decompiled'));
const api = 'starfarer.api/com/fs/starfarer/api/', sources = {};
async function read(relative) {
  const data = await fs.readFile(path.join(root, relative));
  sources[relative] = { sha256: createHash('sha256').update(data).digest('hex') };
  return data.toString('utf8');
}
const deposits = await read(api + 'impl/campaign/econ/ResourceDepositsCondition.java');
const base = await read(api + 'impl/campaign/econ/impl/BaseIndustry.java');
for (const p of ['impl/campaign/econ/impl/Farming.java', 'impl/campaign/econ/impl/Mining.java', 'combat/MutableStat.java', 'combat/StatBonus.java']) await read(api + p);
for (const p of ['Market.java', 'reach/MainWorkTask2.java', 'reach/UpdateMarketsAgainTask.java']) await read('starfarer_obf/com/fs/starfarer/campaign/econ/' + p);
function map(name, numeric = false) {
  const pattern = new RegExp('\\b' + name + '\\.put\\("([^"]+)", ' + (numeric ? '(-?\\d+)' : '"([^"]+)"') + '\\);', 'g');
  const entries = [...deposits.matchAll(pattern)].map(m => [m[1], numeric ? Number(m[2]) : m[2]]);
  if (!entries.length || new Set(entries.map(e => e[0])).size !== entries.length) throw Error('Missing/duplicate native map ' + name);
  return Object.fromEntries(entries);
}
const commodity = map('COMMODITY'), modifier = map('MODIFIER', true), industry = map('INDUSTRY'), baseModifier = map('BASE_MODIFIER', true);
const baseZero = [...deposits.matchAll(/BASE_ZERO\.add\("([^"]+)"\);/g)].map(m => m[1]);
if (Object.keys(commodity).length !== Object.keys(modifier).length) throw Error('Incomplete resource modifiers');
const conditions = Object.fromEntries(Object.entries(commodity).map(([id, c]) => {
  if (!Object.hasOwn(modifier, id) || !Object.hasOwn(industry, c) || !Object.hasOwn(baseModifier, c)) throw Error('Incomplete condition ' + id);
  return [id, { commodityId: c, industryId: industry[c], modifier: modifier[id], baseModifier: baseModifier[c], addMarketSize: !baseZero.includes(c) }];
}));
const settings = Object.fromEntries(['SUPPLY_BONUS', 'DEMAND_REDUCTION', 'DEFAULT_IMPROVE_SUPPLY_BONUS'].map(name => {
  const m = base.match(new RegExp('public static int ' + name + ' = (\\d+);'));
  if (!m) throw Error('Missing native constant ' + name);
  return [name, Number(m[1])];
}));
const result = { schemaVersion: 1, originalReference: 'Starsector 0.98a-RC8', scope: 'resource-industry-commodity-methods-only', sources, settings, conditions };
const destination = path.join(project, 'src/campaign/data/reference-resource-industries.json'), output = JSON.stringify(result, null, 2) + '\n';
if (check) { if (await fs.readFile(destination, 'utf8') !== output) throw Error('Native resource-industry reference differs; inspect before reimporting'); }
else await fs.writeFile(destination, output);
console.log(JSON.stringify({ check, conditions: Object.keys(conditions).length, sources: Object.keys(sources).length }));
