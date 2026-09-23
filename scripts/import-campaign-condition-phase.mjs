import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), check = process.argv.includes('--check');
const roots = { core: path.join(project, '../starsector-core'), decompiled: path.join(project, '../decompiled') };
const load = name => fs.readFile(path.join(project, 'src/campaign/data/reference-' + name + '.json'), 'utf8').then(JSON.parse);
const [environment, additional, stability, access] = await Promise.all(['immigration', 'additional-conditions', 'market-stability', 'market-accessibility'].map(load));
const sources = {};
for (const data of [environment, additional, stability, access])
    for (const [key, value] of Object.entries(data.sources)) {
        if (sources[key] && sources[key].sha256 !== value.sha256)
            throw Error('Source conflict ' + key);
        sources[key] = value;
    }
for (const [key, value] of Object.entries(sources)) {
    const colon = key.indexOf(':'), bytes = await fs.readFile(path.join(roots[key.slice(0, colon)], key.slice(colon + 1)));
    if (createHash('sha256').update(bytes).digest('hex') !== value.sha256)
        throw Error('Reconcile original source ' + key);
}
const free = await fs.readFile(path.join(roots.decompiled, 'starfarer.api/com/fs/starfarer/api/impl/campaign/econ/FreeMarket.java'), 'utf8');
const officer = free.match(/public static float OFFICER_MERC_PROB_MOD = ([0-9.]+)f;/);
if (!officer)
    throw Error('Missing free-market dynamic constant');
const conditions = { ...environment.conditions };
for (const [id, spec] of Object.entries(additional.conditions)) {
    if (Object.hasOwn(conditions, id))
        throw Error('Overlapping condition ' + id);
    conditions[id] = { className: spec.className, hazardPlugin: ['HighGravity', 'LowGravity', 'MildClimate'].includes(spec.className), hazard: spec.hazard };
}
const result = { schemaVersion: 1, originalReference: environment.originalReference, scope: 'ordered-condition-local-effects-before-industries', sources, conditions, freeMarket: { ...stability.freeMarket, ...access.freeMarketSettings, OFFICER_MERC_PROB_MOD: Math.fround(Number(officer[1])) }, decivilized: stability.decivilized, relay: stability.relay };
const dest = path.join(project, 'src/campaign/data/reference-condition-phase.json'), output = JSON.stringify(result, null, 2) + '\n';
if (check) {
    if (await fs.readFile(dest, 'utf8') !== output)
        throw Error('Condition phase reference changed; inspect before importing');
}
else
    await fs.writeFile(dest, output);
console.log(JSON.stringify({ check, sources: Object.keys(sources).length, conditions: Object.keys(conditions).length }));
