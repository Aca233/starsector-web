import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {parseFactionText} from './import-campaign-factions.mjs';
const project=fileURLToPath(new URL('..',import.meta.url)),root=resolve(project,'..'),args=process.argv.slice(2),check=args.includes('--check');
if(args.some(a=>a!=='--check'))throw Error('Usage: import-campaign-character-industry-stats.mjs [--check]');
const sources={};async function read(p){const b=await readFile(join(root,p));sources[p]={sha256:createHash('sha256').update(b).digest('hex')};return b.toString('utf8');}
const catalog=JSON.parse(await read('starsector-web/src/campaign/data/reference-governed-skills.json'));
// The loaded skill roster must still match the original CSV/spec evidence, not stale generated IDs.
for(const [p,e]of Object.entries(catalog.sources)){await read(p);if(sources[p].sha256!==e.sha256)throw Error('Loaded skill reference is stale: '+p);}
const api='decompiled/starfarer.api/com/fs/starfarer/api/',obf='decompiled/starfarer_obf/com/fs/starfarer/';
for(const p of ['campaign/CharacterStats.java','util/DynamicStats.java','campaign/command/CustomProductionPanel.java'])await read(obf+p);
for(const p of ['combat/StatBonus.java','combat/MutableStat.java','impl/campaign/econ/impl/BaseIndustry.java','impl/campaign/econ/impl/FuelProduction.java','impl/campaign/skills/ContainmentProcedures.java'])await read(api+p);
const all=[];for(const id of catalog.knownSkillIds){const spec=parseFactionText(await read('starsector-core/data/characters/skills/'+id+'.skill'));let index=0;for(const g of spec.effectGroups)for(const e of g.effects){if(e.type==='CHARACTER_STATS')all.push({skillId:id,index,requiredLevel:g.requiredSkillLevel??1,script:e.script.replace('com.fs.starfarer.api.impl.campaign.skills.','')});index++;}}
for(const name of new Set(all.map(e=>e.script.split('$')[0])))await read(api+'impl/campaign/skills/'+name+'.java');
const planning=await read(api+'impl/campaign/skills/IndustrialPlanning.java');
const supply=Number(planning.match(/SUPPLY_BONUS = ([0-9.]+)[f]?;/)?.[1]);const custom=Number(planning.match(/CUSTOM_PRODUCTION_BONUS = ([0-9.]+)[f]?;/)?.[1]);
if(!Number.isFinite(supply)||!Number.isFinite(custom)||all.length!==23)throw Error('Character effects/constants changed; audit before importing');
const ops={'IndustrialPlanning$Level1':{target:'supplyBonus',channel:'flat',value:Math.fround(supply)},'IndustrialPlanning$Level2':{target:'customProduction',channel:'mult',value:Math.fround(1+Math.fround(custom/100))}};
const effects=all.filter(e=>Object.hasOwn(ops,e.script)).map(e=>({...e,operation:ops[e.script]}));
if(effects.length!==2||all.some(e=>e.script==='ContainmentProcedures$Level5'))throw Error('Industry-affecting effect catalogue changed');
const data={schemaVersion:1,originalReference:'Starsector 0.98a-RC8',scope:'character-industry-stat-projection-only',sources,knownSkillIds:catalog.knownSkillIds,loadedCharacterEffects:all,effects,keys:{supplyBonus:'supply_bonus',demandReduction:'demand_reduction',fuelSupplyBonus:'fuel_supply_bonus',customProduction:'custom_production_mod'}};
const output=JSON.stringify(data,null,2)+'\n',destination=join(project,'src/campaign/data/reference-character-industry-stats.json');
if(check){if(await readFile(destination,'utf8')!==output)throw Error('Character industry stat reference changed; inspect before reimport');}else await writeFile(destination,output);
console.log(JSON.stringify({check,sources:Object.keys(sources).length,loadedCharacterEffects:all.length,effects:effects.length}));
