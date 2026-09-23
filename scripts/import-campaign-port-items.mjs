import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2),check=args.includes('--check'),positional=args.filter(x=>x!=='--check');
if(positional.length>2)throw Error('Usage: import-campaign-port-items.mjs [core] [decompiled] [--check]');
const roots={core:path.resolve(positional[0]??path.join(project,'../starsector-core')),decompiled:path.resolve(positional[1]??path.join(project,'../decompiled'))},sources={};
async function read(root,relative){const bytes=await fs.readFile(path.join(roots[root],relative));sources[root+':'+relative]={sha256:createHash('sha256').update(bytes).digest('hex')};return bytes.toString('utf8');}
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
const api='starfarer.api/com/fs/starfarer/api/';
const effects=await read('decompiled',api+'impl/campaign/econ/impl/ItemEffectsRepo.java');
for(const name of ['BaseInstallableItemEffect','BaseIndustry','Spaceport'])await read('decompiled',api+'impl/campaign/econ/impl/'+name+'.java');
for(const name of ['MutableStat','StatBonus'])await read('decompiled',api+'combat/'+name+'.java');
await read('decompiled','starfarer_obf/com/fs/starfarer/campaign/econ/Market.java');
const rows=csv(await read('core','data/campaign/special_items.csv')).filter(r=>r.id==='fullerene_spool');
if(rows.length!==1||rows[0].plugin!=='com.fs.starfarer.api.campaign.impl.items.GenericSpecialItemPlugin')throw Error('Review changed port item binding');
const row=rows[0],industryIds=row['plugin params'].split(',').map(v=>v.trim());
if(JSON.stringify(industryIds)!==JSON.stringify(['spaceport','megaport']))throw Error('Review changed spool industries');
const start=effects.indexOf('this.put("fullerene_spool"'),end=effects.indexOf('this.put(',start+10),body=effects.slice(start,end);
const requirements=['NOT_A_GAS_GIANT','NOT_EXTREME_WEATHER','NOT_EXTREME_TECTONIC_ACTIVITY'];
if(start<0||!body.includes('return new String[]{'+requirements.join(', ')+'};')||!body.includes('getAccessibilityMod().modifyFlat(this.spec.getId(), FULLERENE_SPOOL_ACCESS_BONUS')||!body.includes('getAccessibilityMod().unmodifyFlat(this.spec.getId())'))throw Error('Review changed native spool effects');
const amount=[...effects.matchAll(/FULLERENE_SPOOL_ACCESS_BONUS = ([\d.]+)f;/g)];if(amount.length!==1)throw Error('Ambiguous spool bonus');
const requirementNames=Object.fromEntries(requirements.map(name=>{const m=effects.match(new RegExp('public static String '+name+' = ("[^"\\n]*");'));if(!m)throw Error('Missing requirement '+name);return [name,JSON.parse(m[1])];}));
const reference=JSON.parse(await fs.readFile(path.join(project,'src/campaign/data/reference-industry-commodities.json'),'utf8'));
const data={schemaVersion:1,originalReference:reference.originalReference,scope:'port-installable-accessibility-effects-only',sources,items:{fullerene_spool:{industryIds,accessibilityBonus:Math.fround(Number(amount[0][1])),requirements,name:row.name,icon:row.icon}},requirementNames};
const output=JSON.stringify(data,null,2)+'\n',destination=path.join(project,'src/campaign/data/reference-port-items.json');
if(check){if(await fs.readFile(destination,'utf8')!==output)throw Error('Port-item source capture changed; inspect before importing');}else await fs.writeFile(destination,output);
console.log(JSON.stringify({check,sources:Object.keys(sources).length,items:Object.keys(data.items).length}));
