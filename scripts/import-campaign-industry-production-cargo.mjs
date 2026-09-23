import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),sources={};
async function read(relative){const data=await readFile(path.resolve(root,'..',relative));sources[relative]={sha256:createHash('sha256').update(data).digest('hex')};return data.toString('utf8');}
function csv(text){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c===','||c==='\n')){row.push(cell.trim());cell='';if(c==='\n'){rows.push(row);row=[];}}else if(c!=='\r')cell+=c;}if(cell||row.length){row.push(cell.trim());rows.push(row);}const headers=rows.shift();return rows.filter(r=>r[0]&&!r[0].startsWith('#')).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));}
const api='decompiled/starfarer_api_source/com/fs/starfarer/api/';
const base=await read(api+'impl/campaign/econ/impl/BaseIndustry.java'),tech=await read(api+'impl/campaign/econ/impl/TechMining.java');
if(!/generateCargoForGatheringPoint\(Random random\)\s*\{\s*return null;/.test(base))throw Error('Review BaseIndustry default');
const settings=await read('starsector-core/data/config/settings.json'),industries={};
for(const row of csv(await read('starsector-core/data/campaign/industries.csv'))){
 if(!row.plugin.startsWith('com.fs.starfarer.api.impl.campaign.econ.impl.'))throw Error('Review nonvanilla industry '+row.id);
 const name=row.plugin.split('.').at(-1),source=name==='TechMining'?tech:await read(api+'impl/campaign/econ/impl/'+name+'.java');
 if(name!=='TechMining'&&/\bgenerateCargoForGatheringPoint\s*\(/.test(source))throw Error('Review additional industry override '+name);
 industries[row.id]={plugin:row.plugin,kind:name==='TechMining'?'techmining':'base-null'};
}
await read(api+'impl/campaign/rulecmd/salvage/SalvageEntity.java');await read(api+'impl/campaign/procgen/SalvageEntityGenDataSpec.java');
const segment=tech.slice(tech.indexOf('List<DropData> dropRandom'),tech.indexOf('if (mult >= 1)')),dropRandom=[],dropValue=[];
for(const match of segment.matchAll(/(?:DropData )?d = new DropData\(\);([\s\S]*?)\b(dropRandom|dropValue)\.add\(d\);/g)){
 const block=match[1].replace(/\/\/[^\n]*/g,''),drop={chances:-1,maxChances:-1,value:-1,valueMult:1,group:null};
 for(const m of block.matchAll(/d\.(chances|value|valueMult|group) = ([^;]+);/g))drop[m[1]]=m[1]==='group'?JSON.parse(m[2]):Math.fround(Number(m[2].replace(/f$/,'')));
 (match[2]==='dropRandom'?dropRandom:dropValue).push(drop);
}
if(dropRandom.length!==5||dropValue.length!==1||!tech.includes('SalvageEntity.generateSalvage(random, 1f, 1f, base * mult, 1f, dropValue, dropRandom)'))throw Error('Review TechMining salvage flow');
const decay=Number(settings.match(/"techMiningDecay"\s*:\s*([0-9.]+)/)?.[1]);if(!Number.isFinite(decay))throw Error('Missing decay');
const data={schemaVersion:1,originalReference:'Starsector 0.98a-RC8',scope:'vanilla-industry-gathering-cargo',sources,industries,techMiningDecay:Math.fround(decay),dropRandom,dropValue};
const target=path.join(root,'src/campaign/data/reference-industry-production-cargo.json'),output=JSON.stringify(data,null,2)+'\n';
if(process.argv.includes('--check')){if(await readFile(target,'utf8')!==output)throw Error('Industry production reference out of date');}else await writeFile(target,output);
console.log('industry production reference: '+Object.keys(industries).length+' vanilla industries');
