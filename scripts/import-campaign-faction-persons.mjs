/** Installed public random-person inputs; no engine, desktop, or campaign-save loading. */
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {spawn} from 'node:child_process';
import {parseFactionText} from './import-campaign-factions.mjs';
const project=fileURLToPath(new URL('..',import.meta.url)),root=path.resolve(project,'..'),sources={},check=process.argv.includes('--check');
if(process.argv.slice(2).some(a=>a!=='--check'))throw Error('Usage: import-campaign-faction-persons.mjs [--check]');
async function read(p){const b=await fs.readFile(path.join(root,p));sources[p]={sha256:createHash('sha256').update(b).digest('hex')};return b.toString('utf8');}
const obf='decompiled/starfarer_obf/com/fs/starfarer/',api='decompiled/starfarer.api/com/fs/starfarer/api/';
for(const p of ['campaign/Faction.java','rpg/Person.java','loading/PersonNameStore.java','loading/G.java','loading/LoadingUtils.java','loading/SpecStore.java','loading/o0oo_0.java','campaign/rules/Memory.java'])await read(obf+p);
for(const p of ['util/WeightedRandomPicker.java','characters/FullName.java'])await read(api+p);
const definitions=JSON.parse(await read('starsector-web/src/campaign/data/reference-factions.json')),input={csv:await read('starsector-core/data/characters/person_names.csv'),factions:{}};
for(const d of definitions.definitions){const source=definitions.sources.find(s=>s.id===d.sourceId);input.factions[d.id]=parseFactionText(await read('starsector-core/'+source.path));}
for(const p of ['starsector-core/json.jar','starsector-core/starfarer_obf.jar','jre/release','starsector-web/scripts/lib/NativeFactionPersonInputs.java'])await read(p);
const run=(file,args,input='')=>new Promise((resolve,reject)=>{const p=spawn(file,args,{cwd:project,windowsHide:true}),out=[],err=[];p.stdout.on('data',d=>out.push(d));p.stderr.on('data',d=>err.push(d));p.on('error',reject);p.on('close',code=>code?reject(Error('Native person input import failed: '+Buffer.concat(err))):resolve(Buffer.concat(out).toString('utf8')));p.stdin.end(input);});
const build=await fs.mkdtemp(path.join(project,'artifacts/native-person-inputs-')),classpath=['json.jar','starfarer_obf.jar'].map(p=>path.join(root,'starsector-core',p)).join(path.delimiter),javac=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin/javac.exe'):'C:/Program Files/Java/jdk-17/bin/javac.exe';
await run(javac,['--release','17','-encoding','UTF-8','-cp',classpath,'-d',build,path.join(project,'scripts/lib/NativeFactionPersonInputs.java')]);
const imported=JSON.parse(await run(path.join(root,'jre/bin/java.exe'),['-cp',build+path.delimiter+classpath,'NativeFactionPersonInputs'],JSON.stringify(input)));
const data={schemaVersion:1,originalReference:'Starsector 0.98a-RC8',scope:'faction-random-person-inputs-not-officer-skills',sources,...imported};
const destination=path.join(project,'src/campaign/data/reference-faction-persons.json'),output=JSON.stringify(data,null,2)+'\n',old=await fs.readFile(destination,'utf8').catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
if(check){if(old!==output)throw Error('Faction-person inputs changed; review before reimport');}else await fs.writeFile(destination,output,{flag:old===null?'wx':'w'});
console.log(JSON.stringify({check,rows:imported.rows,factions:Object.keys(imported.factions).length,sources:Object.keys(sources).length,nameCategories:Object.fromEntries(Object.entries(imported.names).map(([g,u])=>[g,Object.fromEntries(Object.entries(u).map(([k,t])=>[k,t.order.length]))]))}));
