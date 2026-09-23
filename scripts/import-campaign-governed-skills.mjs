import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { parseFactionText } from './import-campaign-factions.mjs';
const project=fileURLToPath(new URL('..',import.meta.url)),root=resolve(project,'..'),args=process.argv.slice(2),check=args.includes('--check');
if(args.some(v=>v!=='--check'))throw Error('Usage: import-campaign-governed-skills.mjs [--check]');
const sources={};async function read(p){const b=await readFile(join(root,p));sources[p]={sha256:createHash('sha256').update(b).digest('hex')};return b.toString('utf8');}
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
const dir='starsector-core/data/characters/skills/',api='decompiled/starfarer.api/com/fs/starfarer/api/',obf='decompiled/starfarer_obf/com/fs/starfarer/';
const active=new Set(csv(await read(dir+'skill_data.csv')).map(r=>r.id).filter(Boolean));
for(const r of csv(await read(dir+'aptitude_data.csv')))if(r.effect_skill_id)active.add(r.effect_skill_id);
for(const p of ['campaign/CharacterStats.java','campaign/econ/Market.java','loading/SkillSpec.java','loading/SpecStore.java','util/DynamicStats.java'])await read(obf+p);
for(const name of ['MutableStat','StatBonus'])await read(api+'combat/'+name+'.java');
const classes={};for(const name of ['Hypercognition','PlanetaryOperations','SpaceOperations'])classes[name]=await read(api+'impl/campaign/skills/'+name+'.java');
const constant=(name,key)=>{const m=classes[name].match(new RegExp('public static (?:final )?(?:float|int) '+key+' = ([0-9.]+)f?;'));if(!m)throw Error('Missing native constant '+key);return Math.fround(Number(m[1]));};
const f=Math.fround;
const operations={
 'Hypercognition$Level1':{target:'accessibility',channel:'flat',value:constant('Hypercognition','ACCESS')},
 'Hypercognition$Level2':{target:'combatFleetSize',channel:'flat',value:f(constant('Hypercognition','FLEET_SIZE')/f(100))},
 'Hypercognition$Level3':{target:'groundDefenses',channel:'mult',value:f(f(1)+f(constant('Hypercognition','DEFEND_BONUS')*f(0.01)))},
 'Hypercognition$Level4':{target:'stability',channel:'flat',value:constant('Hypercognition','STABILITY_BONUS')},
 'PlanetaryOperations$Level1':{target:'groundDefenses',channel:'mult',value:f(f(1)+f(constant('PlanetaryOperations','DEFEND_BONUS')*f(0.01)))},
 'PlanetaryOperations$Level2':{target:'stability',channel:'flat',value:constant('PlanetaryOperations','STABILITY_BONUS')},
 'SpaceOperations$Level1':{target:'accessibility',channel:'flat',value:constant('SpaceOperations','ACCESS')},
 'SpaceOperations$Level2':{target:'combatFleetSize',channel:'flat',value:f(constant('SpaceOperations','FLEET_SIZE')/f(100))},
};
const effects=[],known=[];
for(const file of (await readdir(join(root,dir))).filter(f=>f.endsWith('.skill')).sort()){
 const bytes=await readFile(join(root,dir,file)),s=parseFactionText(bytes.toString('utf8'),file);if(!active.has(s.id))continue;
 sources[dir+file]={sha256:createHash('sha256').update(bytes).digest('hex')};known.push(s.id);let index=0;
 for(const group of s.effectGroups??[])for(const e of group.effects??[]){
  if(e.type==='ALL_OUTPOSTS')throw Error('New all-outposts effect requires review');
  if(e.type==='GOVERNED_OUTPOST'){
   const script=e.script.replace('com.fs.starfarer.api.impl.campaign.skills.',''),operation=operations[script];if(!operation)throw Error('Unreviewed governed script '+script);
   effects.push({skillId:s.id,index,requiredLevel:group.requiredSkillLevel??1,script,operation});
  }
  index++;
 }
}
if(active.size!==known.length||effects.length!==8||known.includes('fleet_logistics'))throw Error('Loaded skill catalogue changed');
const data={schemaVersion:1,originalReference:'Starsector 0.98a-RC8',scope:'governed-market-skill-stat-effects-only',sources,knownSkillIds:known,effects};
const output=JSON.stringify(data,null,2)+'\n',destination=join(project,'src/campaign/data/reference-governed-skills.json');
if(check){if(await readFile(destination,'utf8')!==output)throw Error('Governed skills source mismatch; inspect before reimport');}else await writeFile(destination,output);
console.log(JSON.stringify({check,sources:Object.keys(sources).length,skills:known.length,effects:effects.length}));
