import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), check = process.argv.includes('--check');
const roots = { core: path.join(project, '../starsector-core'), decompiled: path.join(project, '../decompiled') }, sources = {};
async function read(root, relative) { const bytes = await fs.readFile(path.join(roots[root], relative)); sources[root + ':' + relative] = { sha256: createHash('sha256').update(bytes).digest('hex') }; return bytes.toString('utf8'); }
const prior = JSON.parse(await fs.readFile(path.join(project, 'src/campaign/data/reference-market-stability.json'), 'utf8'));
for (const [key, value] of Object.entries(prior.sources)) { const colon = key.indexOf(':'); await read(key.slice(0, colon), key.slice(colon + 1)); if (sources[key].sha256 !== value.sha256) throw Error('Reconcile local source capture: ' + key); }
const api = 'starfarer.api/com/fs/starfarer/api/';
for (const p of ['util/DynamicStats.java', 'loading/specs/FactionProduction.java', 'loading/specs/H.java', 'loading/SpecStore.java', 'loading/while.java', 'campaign/econ/reach/CommodityMarketData.java', 'campaign/econ/reach/MarketShareData.java']) await read('decompiled', 'starfarer_obf/com/fs/starfarer/' + p);
const stipendSource=await read('decompiled',api+'impl/campaign/tutorial/GalatianAcademyStipend.java');
const monthlySource=await read('decompiled',api+'campaign/econ/MonthlyReport.java');
for(const p of ['impl/campaign/CoreScript.java','impl/campaign/shared/SharedData.java','util/Misc.java','impl/campaign/submarkets/StoragePlugin.java','impl/campaign/submarkets/LocalResourcesSubmarketPlugin.java'])await read('decompiled',api+p);
const monthlyReportIds=Object.fromEntries([...monthlySource.matchAll(/public static String ([A-Z_]+) = "([^"]+)";/g)].map(m=>[m[1],m[2]]));
if(Object.keys(monthlyReportIds).length!==18)throw Error('Review native monthly report node identities');
const settingsText = await read('core', 'data/config/settings.json'), settings = {};
for (const key of ['creditsPerCostUnit', 'industryIncomeMult', 'industryUpkeepMult', 'exportIncomeMult','economyIterPerMonth','crewSalary','marineSalary','officerSalaryBase','officerSalaryPerLevel','officerMercPayMult','idleAdminSalaryMult','adminSalaryTier0','adminSalaryTier1','adminSalaryTier2','storageFreeFraction','stockpileCostMult','productionCostMult','shipProductionCostBase','productionCapacityPerSWUnit','productionSuppliesBonusFraction','doctrineFleetQualityPerPoint']) { const m = [...settingsText.matchAll(new RegExp('^\\s*"' + key + '"\\s*:\\s*(-?[\\d.]+)', 'gm'))]; if (m.length !== 1) throw Error('Ambiguous setting ' + key); settings[key] = Number(m[0][1]); }
const enabled=[...settingsText.matchAll(/^\s*"enableStipend"\s*:\s*(true|false)/gm)];
const duration=stipendSource.match(/public static float DURATION = ([\d.]+)f;/),stipend=stipendSource.match(/public static int STIPEND = (\d+);/);
if(enabled.length!==1||!duration||!stipend)throw Error('Review native stipend settings');
const monthlyListenerRules={enableStipend:enabled[0][1]==='true',academy:{durationDays:Number(duration[1]),stipend:Number(stipend[1])}};
const base = await read('decompiled', api + 'impl/campaign/econ/impl/BaseIndustry.java'), port = await read('decompiled', api + 'impl/campaign/econ/impl/Spaceport.java');
for (const [text, key] of [[base, 'UPKEEP_MULT'], [port, 'UPKEEP_MULT_PER_DEFICIT']]) { const m = text.match(new RegExp('public static float ' + key + ' = ([\\d.]+)f;')); if (!m) throw Error('Missing constant ' + key); settings[key] = Number(m[1]); }
function csv(text) { const rows = []; let row = [], field = '', quoted = false; const endField = () => { row.push(field.trim()); field = ''; }; const endRow = () => { endField(); if (row.some(Boolean)) rows.push(row); row = []; }; for (let i = 0; i < text.length; i++) { const c = text[i]; if (quoted) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c; } else if (c === '"' && !field.trim()) quoted = true; else if (c === ',') endField(); else if (c === '\n') endRow(); else if (c !== '\r') field += c; } if (quoted) throw Error('Unterminated CSV'); if (field || row.length) endRow(); const headers = rows.shift(); return rows.filter(r => !r[0].startsWith('#')).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? '']))); }
const f = Math.fround, industries = {}, commodities = {};
for (const row of csv(await read('core', 'data/campaign/industries.csv'))) {
  if (!Object.hasOwn(prior.industries, row.id)) continue; const d = prior.industries[row.id]; if (row.plugin !== 'com.fs.starfarer.api.impl.campaign.econ.impl.' + d.className || Object.hasOwn(industries, row.id)) throw Error('Review industry binding');
  const incomeCSV = Number(row.income || 0), upkeepCSV = Number(row.upkeep || 0); if (![incomeCSV, upkeepCSV].every(Number.isFinite)) throw Error('Non-numeric industry finances');
  industries[row.id] = { ...d, name: row.name, incomeCSV, upkeepCSV, income: f(f(f(incomeCSV) * f(settings.creditsPerCostUnit)) * f(settings.industryIncomeMult)), upkeep: f(f(f(upkeepCSV) * f(settings.creditsPerCostUnit)) * f(settings.industryUpkeepMult)) };
}
const economy = JSON.parse(await fs.readFile(path.join(project, 'src/campaign/data/reference-market-economy.json'), 'utf8'));
for (const row of csv(await read('core', 'data/campaign/commodities.csv'))) { if (!row.id || !Object.hasOwn(economy.commodities, row.id)) continue; if (Object.hasOwn(commodities, row.id) || !Number.isFinite(Number(row['export value'] || 0))) throw Error('Invalid export value'); commodities[row.id] = { exportValue: f(Number(row['export value'] || 0)) }; }
if (sources['core:data/campaign/commodities.csv'].sha256 !== economy.sources['data/campaign/commodities.csv'].sha256 || sources['decompiled:starfarer_obf/com/fs/starfarer/campaign/econ/reach/CommodityMarketData.java'].sha256 !== economy.sources['starfarer_obf/com/fs/starfarer/campaign/econ/reach/CommodityMarketData.java'].sha256) throw Error('Reconcile commodity source capture');
if (Object.keys(industries).length !== 30 || Object.keys(commodities).length !== Object.keys(economy.commodities).length) throw Error('Incomplete finance catalogue');
const output = JSON.stringify({ schemaVersion: 1, originalReference: prior.originalReference, scope: 'industry-and-commodity-financial-effects-not-income-settlement', sources, settings, monthlyReportIds, monthlyListenerRules, industries, commodities }, null, 2) + '\n', dest = path.join(project, 'src/campaign/data/reference-market-finance.json');
if (check) { if (await fs.readFile(dest, 'utf8') !== output) throw Error('Finance reference changed; inspect before import'); } else await fs.writeFile(dest, output);
console.log(JSON.stringify({ check, sources: Object.keys(sources).length, industries: Object.keys(industries).length, commodities: Object.keys(commodities).length }));
