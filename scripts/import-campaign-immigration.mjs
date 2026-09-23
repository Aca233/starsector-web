import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), check = process.argv.includes('--check');
const roots = { core: path.join(project, '../starsector-core'), decompiled: path.join(project, '../decompiled') }, sources = {};
async function read(root, relative) { const bytes = await fs.readFile(path.join(roots[root], relative)); sources[root + ':' + relative] = { sha256: createHash('sha256').update(bytes).digest('hex') }; return bytes.toString('utf8'); }
const prior = JSON.parse(await fs.readFile(path.join(project, 'src/campaign/data/reference-market-finance.json'), 'utf8'));
for (const [key, value] of Object.entries(prior.sources)) { const colon = key.indexOf(':'); await read(key.slice(0, colon), key.slice(colon + 1)); if (sources[key].sha256 !== value.sha256) throw Error('Reconcile source capture: ' + key); }
const api = 'starfarer.api/com/fs/starfarer/api/';
for (const p of ['impl/campaign/population/CoreImmigrationPluginImpl.java', 'impl/campaign/population/PopulationComposition.java', 'impl/campaign/procgen/ConditionGenDataSpec.java']) await read('decompiled', api + p);
await read('core', 'lwjgl_util.jar');
const settingsText = await read('core', 'data/config/settings.json'), settings = {};
for (const key of ['immigrationPerHazard','immigrationHazardMultExtraPerColonySizeAbove3','immigrationIncentiveCostPerPoint','immigrationIncentivePointsAboveHazardPenalty','maxColonySize','accessibilityPerUnitShipping','unitsPerLightYear']) { const m = [...settingsText.matchAll(new RegExp('^\\s*"'+key+'"\\s*:\\s*(-?[\\d.]+)','gm'))]; if (m.length !== 1) throw Error('Ambiguous setting '+key); settings[key] = Number(m[0][1]); }
for (const [file,names] of [['impl/campaign/population/CoreImmigrationPluginImpl.java',['GROWTH_NO_INDUSTRIES']],['impl/campaign/econ/FreeMarket.java',['MIN_GROWTH','MAX_GROWTH','MAX_DAYS']]]) {
  const text = await read('decompiled',api+file); for(const name of names){const m=text.match(new RegExp('public static float '+name+' = ([\\d.]+)f;'));if(!m)throw Error('Missing constant '+name);settings[name]=Number(m[1]);}
}
function csv(text) { const rows=[];let row=[],field='',quoted=false;const endField=()=>{row.push(field.trim());field='';};const endRow=()=>{endField();if(row.some(Boolean))rows.push(row);row=[];};for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++;}else if(c==='"')quoted=false;else field+=c;}else if(c==='"'&&!field.trim())quoted=true;else if(c===',')endField();else if(c==='\n')endRow();else if(c!=='\r')field+=c;}if(quoted)throw Error('Unterminated CSV');if(field||row.length)endRow();const headers=rows.shift();return rows.filter(r=>!r[0].startsWith('#')).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??'']))); }
const genRows=csv(await read('core','data/campaign/procgen/condition_gen_data.csv')), gen=new Map();for(const row of genRows){if(!row.id)continue;if(gen.has(row.id))throw Error('Duplicate condition gen spec');gen.set(row.id,row);}
const civic=JSON.parse(await fs.readFile(path.join(project,'src/campaign/data/reference-industry-commodities.json'),'utf8')), conditions={};
for(const [id,plugin]of Object.entries({...Object.fromEntries(Object.entries(civic.conditions).map(([id,d])=>[id,d.plugin])),...civic.resourceConditionPlugins})){
  const className=plugin.split('.').at(-1), hazardPlugin=['BaseHazardCondition','Habitable','LCAttractorLow','LCAttractorMedium','DecivilizedSubpop','ResourceDepositsCondition','Pollution'].includes(className), row=gen.get(id);
  const hazard=row?Math.fround(Number(row.hazard||0)):null;if(hazard!==null&&!Number.isFinite(hazard))throw Error('Invalid hazard');conditions[id]={className,hazardPlugin,hazard};
}
const industries=Object.fromEntries(Object.entries(prior.industries).map(([id,d])=>[id,{className:d.className,immigrationPlugin:['PopulationAndInfrastructure','Spaceport','Farming','Mining','TradeCenter','TechMining'].includes(d.className)}]));
const output=JSON.stringify({schemaVersion:1,originalReference:prior.originalReference,scope:'supported-hazard-and-immigration-input-effects-not-population-advance',sources,settings,conditions,industries},null,2)+'\n',dest=path.join(project,'src/campaign/data/reference-immigration.json');
if(check){if(await fs.readFile(dest,'utf8')!==output)throw Error('Immigration reference changed; inspect before import');}else await fs.writeFile(dest,output);
console.log(JSON.stringify({check,sources:Object.keys(sources).length,conditions:Object.keys(conditions).length,industries:Object.keys(industries).length}));
