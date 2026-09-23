/** Source-derived GroundDefenses constants and drone-replicator compatibility. */
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const project=fileURLToPath(new URL('..',import.meta.url)),root=path.resolve(project,'..'),check=process.argv.includes('--check'),sources={};
if(process.argv.slice(2).some(a=>a!=='--check'))throw Error('Usage: import-campaign-ground-defenses.mjs [--check]');
async function read(p){const b=await fs.readFile(path.join(root,p));sources[p]={sha256:createHash('sha256').update(b).digest('hex')};return b.toString('utf8');}
function csv(text){const rows=[];let row=[],field='',quoted=false;const endField=()=>{row.push(field.trim());field='';};const endRow=()=>{endField();if(row.some(Boolean))rows.push(row);row=[];};for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++;}else if(c==='"')quoted=false;else field+=c;}else if(c==='"'&&!field.trim())quoted=true;else if(c===',')endField();else if(c==='\n')endRow();else if(c!=='\r')field+=c;}if(quoted)throw Error('Unterminated CSV');if(field||row.length)endRow();const header=rows.shift();return rows.filter(r=>!r[0].startsWith('#')).map(r=>Object.fromEntries(header.map((h,i)=>[h,r[i]??''])));}
const api='decompiled/starfarer.api/com/fs/starfarer/api/',impl=api+'impl/campaign/econ/impl/';
const ground=await read(impl+'GroundDefenses.java'),items=await read(impl+'ItemEffectsRepo.java');
for(const p of ['BaseIndustry.java','BaseInstallableItemEffect.java'])await read(impl+p);
for(const p of ['combat/StatBonus.java','combat/MutableStat.java'])await read(api+p);
for(const p of ['campaign/econ/Market.java','util/DynamicStats.java'])await read('decompiled/starfarer_obf/com/fs/starfarer/'+p);
const constants={};for(const name of ['DEFENSE_BONUS_BASE','DEFENSE_BONUS_BATTERIES','IMPROVE_DEFENSE_BONUS','ALPHA_CORE_BONUS']){const m=ground.match(new RegExp('public static float '+name+' = ([0-9.]+)f;'));if(!m)throw Error('Review changed ground defense constant');constants[name]=Math.fround(Number(m[1]));}
const multiplier=items.match(/DRONE_REPLICATOR_BONUS_MULT = ([0-9.]+)f;/);if(!multiplier)throw Error('Review changed drone replicator');
const industries=csv(await read('starsector-core/data/campaign/industries.csv')).filter(r=>r.plugin==='com.fs.starfarer.api.impl.campaign.econ.impl.GroundDefenses').map(r=>r.id);
const item=csv(await read('starsector-core/data/campaign/special_items.csv')).find(r=>r.id==='drone_replicator'),itemIndustries=item?.['plugin params'].split(',').map(s=>s.trim());
if(JSON.stringify([...industries].sort())!==JSON.stringify(['grounddefenses','heavybatteries'])||JSON.stringify([...itemIndustries].sort())!==JSON.stringify([...industries].sort()))throw Error('Review changed defense industry/item catalogue');
const data={schemaVersion:1,originalReference:'Starsector 0.98a-RC8',scope:'ground-defense-stat-effects-only',sources,industries,constants,item:{id:item.id,industryIds:itemIndustries,multiplier:Math.fround(Number(multiplier[1])),requirements:[]}};
const output=JSON.stringify(data,null,2)+'\n',destination=path.join(project,'src/campaign/data/reference-ground-defenses.json');const old=await fs.readFile(destination,'utf8').catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
if(check){if(old!==output)throw Error('Ground defense reference changed; inspect before reimport');}else await fs.writeFile(destination,output,{flag:old===null?'wx':'w'});
console.log(JSON.stringify({check,industries:industries.length,sources:Object.keys(sources).length}));
