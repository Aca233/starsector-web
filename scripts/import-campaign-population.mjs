import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const project=fileURLToPath(new URL('..',import.meta.url)), prior=JSON.parse(await fs.readFile(path.join(project,'src/campaign/data/reference-immigration.json'),'utf8'));
const sources={...prior.sources},roots={core:path.resolve(project,'../starsector-core'),decompiled:path.resolve(project,'../decompiled')};
for(const key of [...Object.keys(sources),'decompiled:starfarer_obf/com/fs/starfarer/campaign/econ/MarketCondition.java','decompiled:starfarer.api/com/fs/starfarer/api/impl/campaign/econ/Population.java']){
 const colon=key.indexOf(':'),bytes=await fs.readFile(path.join(roots[key.slice(0,colon)],key.slice(colon+1))),sha256=createHash('sha256').update(bytes).digest('hex');
 if(sources[key]&&sources[key].sha256!==sha256)throw Error('Reconcile original source '+key);sources[key]={sha256};
}
const output=JSON.stringify({schemaVersion:1,originalReference:prior.originalReference,scope:'population-advance-with-explicit-resize-effects-not-whole-world-economy',sources,settings:prior.settings},null,2)+'\n',dest=path.join(project,'src/campaign/data/reference-population.json'),check=process.argv.includes('--check');
if(check){if(await fs.readFile(dest,'utf8')!==output)throw Error('Population source capture changed');}else await fs.writeFile(dest,output);
console.log(JSON.stringify({check,sources:Object.keys(sources).length}));
