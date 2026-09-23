import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), check = args.includes('--check'), positional = args.filter(x => x !== '--check');
if (positional.length > 2) throw Error('Usage: node scripts/import-campaign-production-industries.mjs [core] [decompiled] [--check]');
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
const api = 'starfarer.api/com/fs/starfarer/api/';
const bindings = { lightindustry: 'LightIndustry', refining: 'Refining', heavyindustry: 'HeavyIndustry', orbitalworks: 'HeavyIndustry', fuelprod: 'FuelProduction' };
const texts = {};
for (const name of [...new Set(Object.values(bindings)), 'BaseIndustry', 'ItemEffectsRepo', 'BoostIndustryInstallableItemEffect', 'BaseInstallableItemEffect']) texts[name] = await read('decompiled', api + 'impl/campaign/econ/impl/' + name + '.java');
for (const name of ['MutableStat', 'StatBonus']) await read('decompiled', api + 'combat/' + name + '.java');
const industries = {};
for (const row of csv(await read('core', 'data/campaign/industries.csv'))) {
  if (!Object.hasOwn(bindings, row.id)) continue;
  if (row.plugin !== 'com.fs.starfarer.api.impl.campaign.econ.impl.' + bindings[row.id] || Object.hasOwn(industries, row.id)) throw Error('Review production plugin binding');
  industries[row.id] = { plugin: row.plugin, className: bindings[row.id], tags: row.tags.split(',').map(s=>s.trim()).filter(Boolean), image: row.image };
}
const number = (name, text) => { const match = text.match(new RegExp('\\b' + name + ' = (-?[0-9.]+)f?;')); if (!match) throw Error('Missing native constant ' + name); return Math.fround(Number(match[1])); };
const items = {};
const itemRules = { biofactory_embryo: ['BIOFACTORY_PROD_BONUS', 'habitable', null], catalytic_core: ['CATALYTIC_CORE_BONUS', 'no_atmosphere', null], synchrotron: ['SYNCHROTRON_FUEL_BONUS', 'no_atmosphere', null], corrupted_nanoforge: ['CORRUPTED_NANOFORGE_PROD', null, 'CORRUPTED_NANOFORGE_QUALITY_BONUS'], pristine_nanoforge: ['PRISTINE_NANOFORGE_PROD', null, 'PRISTINE_NANOFORGE_QUALITY_BONUS'] };
for (const row of csv(await read('core', 'data/campaign/special_items.csv'))) {
  if (!Object.hasOwn(itemRules, row.id)) continue;
  const [supply, requiredCondition, quality] = itemRules[row.id];
  items[row.id] = { industryIds: row['plugin params'].split(',').map(s=>s.trim()), supplyBonus: number(supply, texts.ItemEffectsRepo), requiredCondition, qualityBonus: quality ? number(quality, texts.ItemEffectsRepo) : null };
}
if (Object.keys(industries).length !== 5 || Object.keys(items).length !== 5) throw Error('Incomplete production catalogue');
const prior = JSON.parse(await fs.readFile(path.join(project, 'src/campaign/data/reference-industry-commodities.json'), 'utf8'));
for (const [key, value] of Object.entries(sources)) if (prior.sources[key] && prior.sources[key].sha256 !== value.sha256) throw Error('Reconcile changed native source ' + key);
const output = JSON.stringify({ schemaVersion: 1, originalReference: prior.originalReference, scope: 'production-commodity-and-quality-effects-not-world-lifecycle', sources, industries, items, orbitalWorksQualityBonus: number('ORBITAL_WORKS_QUALITY_BONUS', texts.HeavyIndustry), pollution: { daysBeforePollution: number('DAYS_BEFORE_POLLUTION', texts.HeavyIndustry), daysBeforePermanent: number('DAYS_BEFORE_POLLUTION_PERMANENT', texts.HeavyIndustry) } }, null, 2) + '\n';
const dest = path.join(project, 'src/campaign/data/reference-production-industries.json');
if (check) { if (await fs.readFile(dest, 'utf8') !== output) throw Error('Production reference changed; inspect before import'); } else await fs.writeFile(dest, output);
console.log(JSON.stringify({ check, sources: Object.keys(sources).length, industries: Object.keys(industries).length, items: Object.keys(items).length }));
