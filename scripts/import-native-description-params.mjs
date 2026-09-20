import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const core=resolve(process.argv[2]??resolve(root,'../starsector-core'));
const catalog=JSON.parse(await readFile(resolve(root,'src/engine/data/generated/native-catalog.json'),'utf8'));
const work=resolve(root,'artifacts/native-description-probe');await mkdir(work,{recursive:true});
const input=resolve(work,'input.json'), output=resolve(work,'parameters.json');
await writeFile(input,JSON.stringify({settings:catalog.configs.find(x=>x.sourcePath==='data/config/settings.json').spec,hullmods:catalog.hullmods}));
const jars=(await readdir(core)).filter(p=>p.endsWith('.jar')).map(p=>resolve(core,p));
const sources=catalog.hullmods.filter(r=>r.script.startsWith('data.')).map(r=>resolve(core,r.script.replaceAll('.','/')+'.java'));
function run(command,args){const result=spawnSync(command,args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:8e6});if(result.status!==0)throw Error(result.error?.message??result.stderr??result.stdout);}
run('javac',['-encoding','UTF-8','-cp',jars.join(delimiter),'-sourcepath',core,'-d',work,resolve(root,'scripts/native-descriptions/NativeDescriptionProbe.java'),...sources]);
run('java',['-Djava.awt.headless=true','-cp',[work,...jars].join(delimiter),'NativeDescriptionProbe',input,output]);
const params=JSON.parse(await readFile(output,'utf8'));
const errors=Object.entries(params).filter(([,sizes])=>sizes.error||Object.values(sizes).some(fields=>fields.descError||fields.sModDescError||['desc','sModDesc'].some(field=>!Array.isArray(fields[field])||fields[field].some(value=>typeof value!=='string'))));
if(errors.length)throw Error('Native description parameters unresolved: '+JSON.stringify(errors));
const hullmods=Object.fromEntries(catalog.hullmods.map(row=>{
  const sizes=params[row.id];
  return [row.id,{script:row.script,templates:{desc:row.desc??'',sModDesc:row.sModDesc??''},
    ...(new Set(Object.values(sizes).map(v=>JSON.stringify(v))).size===1 ? {parameters:sizes.FRIGATE} : {sizes})}];
}));
const destination=resolve(root,'src/engine/data/generated/native-description-params.json');
await writeFile(destination,JSON.stringify({source:'Local 0.98a-RC8 native HullModEffect description getters; GameState.TITLE, ship=null, no commander bonuses',hullmods},null,2)+'\n');
console.log(JSON.stringify({destination,entries:Object.keys(hullmods).length,errors},null,2));
