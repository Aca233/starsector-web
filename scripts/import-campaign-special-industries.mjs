import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), check = args.includes('--check'), positional = args.filter(x => x !== '--check');
if (positional.length > 2) throw Error('Usage: node scripts/import-campaign-special-industries.mjs [core] [decompiled] [--check]');
const roots = { core: path.resolve(positional[0] ?? path.join(project, '../starsector-core')), decompiled: path.resolve(positional[1] ?? path.join(project, '../decompiled')) }, sources = {};
async function read(root, relative) {
  const data = await fs.readFile(path.join(roots[root], relative));
  sources[root + ':' + relative] = { sha256: createHash('sha256').update(data).digest('hex') }; return data.toString('utf8');
}
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
const api='starfarer.api/com/fs/starfarer/api/', bindings={commerce:'TradeCenter',techmining:'TechMining',lionsguard:'LionsGuardHQ',cryosanctum:'Cryosanctum'}, texts={};
for(const name of [...Object.values(bindings),'BaseIndustry','ItemEffectsRepo']) texts[name]=await read('decompiled',api+'impl/campaign/econ/impl/'+name+'.java');
for(const name of ['MutableStat','StatBonus']) await read('decompiled',api+'combat/'+name+'.java');
await read('core','starfarer.api.jar');
const lifecycle=await read('decompiled',api+'impl/campaign/CoreLifecyclePluginImpl.java');
const industries={};for(const row of csv(await read('core','data/campaign/industries.csv'))){if(!Object.hasOwn(bindings,row.id))continue;if(row.plugin!=='com.fs.starfarer.api.impl.campaign.econ.impl.'+bindings[row.id]||Object.hasOwn(industries,row.id))throw Error('Unexpected special industry binding');industries[row.id]={plugin:row.plugin,className:bindings[row.id],tags:row.tags.split(',').map(s=>s.trim()).filter(Boolean),image:row.image};}
for(const d of Object.values(industries)){
 if(!lifecycle.includes('import '+d.plugin+';'))throw Error('Unresolved native imported class '+d.plugin);
 const aliases=[...new Set([...lifecycle.matchAll(new RegExp('x\\.alias\\("([^"\\n]+)", '+d.className+'\\.class\\);','g'))].map(m=>m[1]))];
 if(aliases.length!==1)throw Error('Ambiguous native save alias '+d.className);d.savedClassAlias=aliases[0];
}
const item=csv(await read('core','data/campaign/special_items.csv')).find(r=>r.id==='dealmaker_holosuite');if(item?.['plugin params']!=='commerce')throw Error('Review holosuite binding');
const constants={};for(const [name,keys] of [['TradeCenter',['BASE_BONUS','ALPHA_CORE_BONUS','IMPROVE_BONUS','STABILITY_PENALTY']],['TechMining',['ALPHA_CORE_FINDS_BONUS','IMPROVE_FINDS_BONUS']],['ItemEffectsRepo',['DEALMAKER_INCOME_PERCENT_BONUS']]])for(const key of keys){const m=texts[name].match(new RegExp('\\b'+key+' = (-?[0-9.]+)f?;'));if(!m)throw Error('Missing constant '+key);constants[key]=Math.fround(Number(m[1]));}
if(Object.keys(industries).length!==4)throw Error('Incomplete special catalogue');
const prior=JSON.parse(await fs.readFile(path.join(project,'src/campaign/data/reference-production-industries.json'),'utf8'));for(const [key,v]of Object.entries(sources))if(prior.sources[key]&&prior.sources[key].sha256!==v.sha256)throw Error('Reconcile source '+key);
const output=JSON.stringify({schemaVersion:1,originalReference:prior.originalReference,scope:'special-industry-local-effects-not-submarket-patrol-or-salvage-runtime',sources,industries,constants},null,2)+'\n',dest=path.join(project,'src/campaign/data/reference-special-industries.json');
if(check){if(await fs.readFile(dest,'utf8')!==output)throw Error('Special industry reference changed; inspect before import');}else await fs.writeFile(dest,output);
console.log(JSON.stringify({check,sources:Object.keys(sources).length,industries:Object.keys(industries).length}));
