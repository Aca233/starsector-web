/** Import only the reviewed native sensor getter constants and provenance. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const project=fileURLToPath(new URL('..',import.meta.url)),root=path.resolve(project,'..'),sources={};
const check=process.argv.includes('--check');
if(process.argv.slice(2).some(a=>a!=='--check'))throw Error('Usage: import-campaign-sensors.mjs [--check]');
async function read(p){const b=await fs.readFile(path.join(root,p));sources[p]={sha256:createHash('sha256').update(b).digest('hex')};return b.toString('utf8');}
const obf='decompiled/starfarer_obf/com/fs/starfarer/';
for(const p of ['campaign/BaseCampaignEntity.java','campaign/fleet/CampaignFleet.java','campaign/fleet/MutableFleetStats.java','campaign/CampaignEngine.java','campaign/save/CampaignGameManager.java','settings/StarfarerSettings.java','prototype/Utils.java','util/DynamicStats.java'])await read(obf+p);
for(const p of ['combat/StatBonus.java','combat/MutableStat.java','util/Misc.java'])await read('decompiled/starfarer.api/com/fs/starfarer/api/'+p);
const text=(await read('starsector-core/data/config/settings.json')).split('\n').map(s=>s.replace(/#.*/, '')).join('\n'),settings={};
for(const key of ['sensorRangeMax','sensorRangeMaxHyper','detectionRangeTransponderMult','detectionRangeDetailsMult','detectionRangeDetailsAlwaysMult','detectionRangeDetailsAlwaysNonFleet','detectionRangeDetailsAlwaysMin','baseFleetSelectionRadius','fleetSelectionRadiusPerUnitSize','maxFleetSelectionRadius','easySensorBonus']){
 const matches=[...text.matchAll(new RegExp('"'+key+'"\\s*:\\s*([0-9.]+)','g'))];if(matches.length!==1)throw Error('Review changed sensor setting: '+key);settings[key]=Math.fround(Number(matches[0][1]));
}
const output=JSON.stringify({schemaVersion:1,originalReference:'Starsector 0.98a-RC8',scope:'native-sensor-getter-rules-not-rendering',sources,settings},null,2)+'\n';
const destination=path.join(project,'src/campaign/data/reference-sensors.json'),old=await fs.readFile(destination,'utf8').catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
if(check){if(old!==output)throw Error('Sensor sources changed; review before reimport');}else await fs.writeFile(destination,output,{flag:old===null?'wx':'w'});
console.log(JSON.stringify({check,sources:Object.keys(sources).length,settings:Object.keys(settings).length}));
