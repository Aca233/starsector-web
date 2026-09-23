import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const roots = { core: path.join(project, '../starsector-core'), decompiled: path.join(project, '../decompiled') }, sources = {};
async function read(root, p) { const bytes = await fs.readFile(path.join(roots[root], p)); sources[root + ':' + p] = { sha256: createHash('sha256').update(bytes).digest('hex') }; return bytes.toString('utf8'); }
function csv(text) { const rows = []; let row = [], field = '', quoted = false; const endField = () => { row.push(field.trim()); field = ''; }; const endRow = () => { endField(); if (row.some(Boolean))
    rows.push(row); row = []; }; for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
        if (c === '"' && text[i + 1] === '"') {
            field += '"';
            i++;
        }
        else if (c === '"')
            quoted = false;
        else
            field += c;
    }
    else if (c === '"' && !field.trim())
        quoted = true;
    else if (c === ',')
        endField();
    else if (c === '\n')
        endRow();
    else if (c !== '\r')
        field += c;
} if (quoted)
    throw Error('Unterminated CSV'); if (field || row.length)
    endRow(); const headers = rows.shift(); return rows.filter(r => !r[0].startsWith('#')).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? '']))); }
const api = 'starfarer.api/com/fs/starfarer/api/', campaign = 'impl/campaign/';
const bindings = { arid: 'econ/WorldArid', barren_marginal: 'econ/WorldBarrenMarginal', ice: 'econ/WorldIce', tundra: 'econ/WorldTundra', high_gravity: 'econ/HighGravity', low_gravity: 'econ/LowGravity', mild_climate: 'econ/MildClimate', solar_array: 'econ/SolarArray', luddic_majority: 'econ/LuddicMajority', pirate_activity: 'intel/bases/PirateActivity', pather_cells: 'intel/bases/LuddicPathCells', shipping_disruption: 'econ/ShippingDisruption' }, texts = {};
for (const p of [...Object.values(bindings), 'econ/WorldFarming', 'econ/BaseHazardCondition', 'econ/LCAttractorHigh', 'intel/bases/PirateBaseIntel', 'intel/bases/LuddicPathCellsIntel'])
    texts[p.split('/').at(-1)] = await read('decompiled', api + campaign + p + '.java');
for (const p of ['combat/MutableStat.java', 'combat/StatBonus.java', 'combat/MutableStatWithTempMods.java', 'impl/campaign/population/PopulationComposition.java'])
    await read('decompiled', api + p);
for (const name of ['Market', 'CommodityOnMarket'])
    await read('decompiled', 'starfarer_obf/com/fs/starfarer/campaign/econ/' + name + '.java');
await read('core', 'starfarer.api.jar');
await read('core', 'json.jar');
const conditions = {}, gen = new Map(csv(await read('core', 'data/campaign/procgen/condition_gen_data.csv')).map(r => [r.id, r]));
for (const row of csv(await read('core', 'data/campaign/market_conditions.csv'))) {
    if (!Object.hasOwn(bindings, row.id))
        continue;
    const plugin = 'com.fs.starfarer.api.impl.campaign.' + bindings[row.id].replaceAll('/', '.');
    if (row.script !== plugin || Object.hasOwn(conditions, row.id))
        throw Error('Unexpected condition binding ' + row.id);
    conditions[row.id] = { plugin, className: plugin.split('.').at(-1), hazard: gen.has(row.id) ? Math.fround(Number(gen.get(row.id).hazard || 0)) : null };
}
if (Object.keys(conditions).length !== 12)
    throw Error('Incomplete condition catalogue');
const industries = {};
for (const row of csv(await read('core', 'data/campaign/industries.csv'))) {
    if (!row.id)
        continue;
    if (Object.hasOwn(industries, row.id))
        throw Error('Duplicate industry');
    industries[row.id] = { tags: row.tags.split(',').map(s => s.trim()).filter(Boolean) };
}
const constants = {};
for (const [name, keys] of [['SolarArray', ['FARMING_BONUS']], ['LuddicMajority', ['STABILITY', 'IMMIGRATION_BASE', 'PRODUCTION_BASE_RURAL', 'BONUS_MULT_DEFEATED_EXPEDITION']], ['ShippingDisruption', ['ACCESS_LOSS_DURATION', 'ACCESS_PER_UNITS_LOST']], ['LuddicPathCells', ['STABLITY_PENALTY']], ['LowGravity', ['ACCESS_BONUS']]])
    for (const key of keys) {
        const m = texts[name].match(new RegExp('\\b' + key + ' = (-?[0-9.]+)f?;'));
        if (!m)
            throw Error('Missing constant ' + key);
        constants[name + '.' + key] = Math.fround(Number(m[1]));
    }
const suppressedConditions = [...texts.SolarArray.matchAll(/SUPPRESSED_CONDITIONS.add\("([^"]+)"\)/g)].map(m => m[1]);
const productionOverrides = {};
for (const m of texts.LuddicMajority.matchAll(/PRODUCTION_OVERRIDES.put\("([^"]+)", (\d+)\)/g))
    productionOverrides[m[1]] = Number(m[2]);
if ((texts.LuddicMajority.match(/PRODUCTION_OVERRIDES.put\(/g) || []).length !== Object.keys(productionOverrides).length)
    throw Error('Review production override initialization');
const pirateTiers = {};
for (const name of ['Accessibility', 'Stability']) {
    const start = texts.PirateBaseIntel.indexOf('public float get' + name + 'Penalty()'), end = texts.PirateBaseIntel.indexOf('return 0.0f;', start);
    if (start < 0 || end < start)
        throw Error('Missing pirate penalty');
    for (const m of texts.PirateBaseIntel.slice(start, end).matchAll(/case (TIER_[A-Z0-9_]+): \{\s*return ([0-9.]+)f;/g)) {
        pirateTiers[m[1]] ??= {};
        pirateTiers[m[1]][name.toLowerCase()] = Math.fround(Number(m[2]));
    }
}
if (Object.keys(pirateTiers).length !== 5 || Object.values(pirateTiers).some(t => Object.keys(t).length !== 2))
    throw Error('Incomplete pirate tiers');
const prior = JSON.parse(await fs.readFile(path.join(project, 'src/campaign/data/reference-immigration.json'), 'utf8'));
for (const [key, v] of Object.entries(sources))
    if (prior.sources[key] && prior.sources[key].sha256 !== v.sha256)
        throw Error('Reconcile source ' + key);
const data = { schemaVersion: 1, originalReference: prior.originalReference, scope: 'additional-condition-local-callbacks-not-restored-market', sources, conditions, industries, constants, suppressedConditions, productionOverrides, pirateTiers };
const dest = path.join(project, 'src/campaign/data/reference-additional-conditions.json'), output = JSON.stringify(data, null, 2) + '\n';
if (check) {
    if (await fs.readFile(dest, 'utf8') !== output)
        throw Error('Additional conditions reference changed; inspect before import');
}
else
    await fs.writeFile(dest, output);
console.log(JSON.stringify({ check, sources: Object.keys(sources).length, conditions: Object.keys(conditions).length, industries: Object.keys(industries).length }));
