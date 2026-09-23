import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), check = args.includes('--check'), positional = args.filter(x => x !== '--check');
if (positional.length > 2) throw Error('Usage: node scripts/import-campaign-industry-commodities.mjs [core] [decompiled] [--check]');
const roots = { core: path.resolve(positional[0] ?? path.join(project, '../starsector-core')), decompiled: path.resolve(positional[1] ?? path.join(project, '../decompiled')) }, sources = {};
async function read(root, relative) {
  const data = await fs.readFile(path.join(roots[root], relative));
  sources[root + ':' + relative] = { sha256: createHash('sha256').update(data).digest('hex') }; return data.toString('utf8');
}
function csv(text) {
  const rows = []; let row = [], field = '', quoted = false;
  const endField = () => { row.push(field.trim()); field = ''; };
  const endRow = () => { endField(); if (row.some(Boolean)) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c; }
    else if (c === '"' && !field.trim()) quoted = true; else if (c === ',') endField(); else if (c === '\n') endRow(); else if (c !== '\r') field += c;
  }
  if (quoted) throw Error('Unterminated native CSV'); if (field || row.length) endRow();
  const headers = rows.shift(); return rows.filter(r => !r[0].startsWith('#')).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
}
const industryClasses = ['PopulationAndInfrastructure', 'Spaceport', 'MilitaryBase', 'GroundDefenses', 'OrbitalStation'];
const conditionClasses = ['Population', 'BaseHazardCondition', 'LCAttractorLow', 'LCAttractorMedium', 'Habitable', 'FreeMarket', 'CommRelayCondition', 'RecentUnrest', 'DecivilizedSubpop', 'Pollution'];
const api = 'starfarer.api/com/fs/starfarer/api/';
for (const name of [...industryClasses, 'BaseIndustry']) await read('decompiled', api + 'impl/campaign/econ/impl/' + name + '.java');
for (const name of [...conditionClasses, 'ResourceDepositsCondition']) await read('decompiled', api + 'impl/campaign/econ/' + name + '.java');
await read('decompiled', 'starfarer_obf/com/fs/starfarer/campaign/econ/Market.java');
await read('decompiled', 'starfarer_obf/com/fs/starfarer/campaign/econ/CommodityOnMarket.java');
const industries = {}, conditions = {};
const industryRows = csv(await read('core', 'data/campaign/industries.csv'));
const conditionRows = csv(await read('core', 'data/campaign/market_conditions.csv'));
for (const row of industryRows) {
  const className = row.plugin?.split('.').at(-1);
  if (!row.id || !industryClasses.includes(className) || row.plugin !== 'com.fs.starfarer.api.impl.campaign.econ.impl.' + className) continue;
  if (Object.hasOwn(industries, row.id)) throw Error('Duplicate industry ' + row.id);
  industries[row.id] = { plugin: row.plugin, className, tags: row.tags.split(',').map(x => x.trim()).filter(Boolean) };
}
for (const row of conditionRows) {
  const className = row.script?.split('.').at(-1);
  if (!row.id || !conditionClasses.includes(className) || row.script !== 'com.fs.starfarer.api.impl.campaign.econ.' + className) continue;
  if (Object.hasOwn(conditions, row.id)) throw Error('Duplicate condition ' + row.id);
  conditions[row.id] = { plugin: row.script, commodityEffect: 'none-direct' };
}
if (!Object.keys(conditions).length || !Object.keys(industries).length) throw Error('Empty supported industry/condition catalogue');
// Do not silently combine captures from different installed source revisions.
const resources = JSON.parse(await fs.readFile(path.join(project, 'src/campaign/data/reference-resource-industries.json'), 'utf8'));
for (const suffix of ['impl/campaign/econ/impl/BaseIndustry.java', 'impl/campaign/econ/ResourceDepositsCondition.java']) {
  if (resources.sources[api + suffix].sha256 !== sources['decompiled:' + api + suffix].sha256) throw Error('Reconcile resource source version first');
}
const resourceConditionPlugins = {}, resourceIndustryPlugins = {};
for (const id of Object.keys(resources.conditions)) {
  const rows = conditionRows.filter(r => r.id === id), expected = 'com.fs.starfarer.api.impl.campaign.econ.ResourceDepositsCondition';
  if (rows.length !== 1 || rows[0].script !== expected) throw Error('Resource condition plugin differs: ' + id);
  resourceConditionPlugins[id] = expected;
}
for (const [id, name] of [['farming', 'Farming'], ['aquaculture', 'Farming'], ['mining', 'Mining']]) {
  const rows = industryRows.filter(r => r.id === id), expected = 'com.fs.starfarer.api.impl.campaign.econ.impl.' + name;
  if (rows.length !== 1 || rows[0].plugin !== expected) throw Error('Resource industry plugin differs: ' + id);
  resourceIndustryPlugins[id] = expected;
}
const destination = path.join(project, 'src/campaign/data/reference-industry-commodities.json');
const output = JSON.stringify({ schemaVersion: 1, originalReference: resources.originalReference, scope: 'supported-industry-commodity-effects-only-not-economy-task-completion', sources, industries, conditions, resourceConditionPlugins, resourceIndustryPlugins }, null, 2) + '\n';
if (check) { if (await fs.readFile(destination, 'utf8') !== output) throw Error('Industry catalogue differs; inspect before reimporting'); }
else await fs.writeFile(destination, output);
console.log(JSON.stringify({ check, industries: Object.keys(industries).length, conditions: Object.keys(conditions).length, sources: Object.keys(sources).length }));
