import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), check = process.argv.includes('--check');
const roots = { core: path.join(project, '../starsector-core'), decompiled: path.join(project, '../decompiled') }, sources = {};
async function read(root, relative) { const bytes = await fs.readFile(path.join(roots[root], relative)); sources[root + ':' + relative] = { sha256: createHash('sha256').update(bytes).digest('hex') }; return bytes.toString('utf8'); }
const prior = JSON.parse(await fs.readFile(path.join(project, 'src/campaign/data/reference-industry-commodities.json'), 'utf8'));
for (const [key, value] of Object.entries(prior.sources)) { const colon = key.indexOf(':'); await read(key.slice(0, colon), key.slice(colon + 1)); if (sources[key].sha256 !== value.sha256) throw Error('Reconcile industry source capture: ' + key); }
const production = JSON.parse(await fs.readFile(path.join(project, 'src/campaign/data/reference-production-industries.json'), 'utf8'));
for (const [key, value] of Object.entries(production.sources)) { const colon = key.indexOf(':'); await read(key.slice(0, colon), key.slice(colon + 1)); if (sources[key].sha256 !== value.sha256) throw Error('Reconcile production source capture: ' + key); }
const special = JSON.parse(await fs.readFile(path.join(project, 'src/campaign/data/reference-special-industries.json'), 'utf8'));
for (const [key, value] of Object.entries(special.sources)) { const colon = key.indexOf(':'); await read(key.slice(0, colon), key.slice(colon + 1)); if (sources[key].sha256 !== value.sha256) throw Error('Reconcile special source capture: ' + key); }
const api = 'starfarer.api/com/fs/starfarer/api/', econ = api + 'impl/campaign/econ/';
for (const p of ['combat/MutableStat.java', 'combat/StatBonus.java', 'util/Misc.java', 'impl/campaign/econ/BaseMarketConditionPlugin.java', 'impl/campaign/econ/impl/Farming.java', 'impl/campaign/econ/impl/Mining.java']) await read('decompiled', api + p);
const settingsText = await read('core', 'data/config/settings.json'), settings = {};
for (const key of ['stabilityBaseValue', 'minUpkeepMult', 'upkeepReductionFromInFactionImports', 'colonyOverMaxPenalty', 'overMaxIndustriesPenalty']) {
  const matches = [...settingsText.matchAll(new RegExp('^\\s*"' + key + '"\\s*:\\s*(-?[\\d.]+)', 'gm'))]; if (matches.length !== 1) throw Error('Ambiguous setting ' + key); settings[key] = Number(matches[0][1]);
}
const max = settingsText.match(/"maxIndustries"\s*:\s*(\[[\d,\s]+\])/); if (!max) throw Error('Missing industry cap'); const maxIndustries = JSON.parse(max[1]);
async function constants(file, names) { const text = await read('decompiled', econ + file); return Object.fromEntries(names.map(name => { const m = text.match(new RegExp('public static float ' + name + ' = (-?[\\d.]+)f;')); if (!m) throw Error('Missing constant ' + name); return [name, Number(m[1])]; })); }
const freeMarket = await constants('FreeMarket.java', ['MIN_STABILITY_PENALTY', 'MAX_STABILITY_PENALTY', 'MAX_DAYS']);
const relay = await constants('CommRelayCondition.java', ['NO_RELAY_PENALTY', 'COMM_RELAY_BONUS', 'MAKESHIFT_COMM_RELAY_BONUS']);
const population = await constants('impl/PopulationAndInfrastructure.java', ['IMPROVE_STABILITY_BONUS']);
const station = await constants('impl/OrbitalStation.java', ['IMPROVE_STABILITY_BONUS']);
const decivilized = await constants('DecivilizedSubpop.java', ['STABILITY_PENALTY']);
// Use a CSV reader rather than splitting quoted tag/description fields.
function csv(text) {
  const rows = []; let row = [], field = '', quoted = false;
  const endField = () => { row.push(field.trim()); field = ''; };
  const endRow = () => { endField(); if (row.some(Boolean)) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) { const c = text[i]; if (quoted) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c; } else if (c === '"' && !field.trim()) quoted = true; else if (c === ',') endField(); else if (c === '\n') endRow(); else if (c !== '\r') field += c; }
  if (quoted) throw Error('Unterminated CSV'); if (field || row.length) endRow(); const headers = rows.shift(); return rows.filter(r => !r[0].startsWith('#')).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
}
const industries = {};
for (const row of csv(await read('core', 'data/campaign/industries.csv'))) {
  const expected = prior.industries[row.id]?.plugin ?? prior.resourceIndustryPlugins[row.id] ?? production.industries[row.id]?.plugin ?? special.industries[row.id]?.plugin; if (!expected) continue;
  if (row.plugin !== expected || Object.hasOwn(industries, row.id)) throw Error('Unexpected industry binding');
  industries[row.id] = { className: row.plugin.split('.').at(-1), tags: row.tags.split(',').map(t => t.trim()).filter(Boolean), upgrade: row.upgrade || null };
}
if (Object.keys(industries).length !== 30) throw Error('Review changed supported industry list');
const output = JSON.stringify({ schemaVersion: 1, originalReference: prior.originalReference, scope: 'local-stability-and-population-financial-factors-only', sources, settings, maxIndustries, freeMarket, relay, population, station, decivilized, industries }, null, 2) + '\n';
const dest = path.join(project, 'src/campaign/data/reference-market-stability.json'); if (check) { if (await fs.readFile(dest, 'utf8') !== output) throw Error('Stability reference changed; inspect before import'); } else await fs.writeFile(dest, output);
console.log(JSON.stringify({ check, sources: Object.keys(sources).length, industries: Object.keys(industries).length }));
