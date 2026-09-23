/** Installed public core native registry oracle. No game bootstrap, mods, CampaignEngine or private saves. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
const project=fileURLToPath(new URL('..',import.meta.url)),root=path.resolve(project,'..'),core=path.join(root,'starsector-core'),check=process.argv.includes('--check'),sources={};
if(process.argv.slice(2).some(a=>a!=='--check'))throw Error('Usage: import-campaign-default-hull-registry.mjs [--check]');
const hash=b=>createHash('sha256').update(b).digest('hex');
async function read(file){const b=await fs.readFile(path.join(root,file));sources[file]={sha256:hash(b)};return b.toString('utf8');}
for(const p of ['starsector-core/starfarer_obf.jar','starsector-core/fs.common_obf.jar','starsector-core/starfarer.api.jar','starsector-core/json.jar','jre/release','starsector-web/scripts/lib/NativeDefaultHullRegistry.java'])await read(p);
const storage=JSON.parse(await read('starsector-web/src/campaign/data/reference-storage.json')),autofit=JSON.parse(await read('starsector-web/src/campaign/data/reference-autofit-specs.json'));
const run=(file,args,input='')=>new Promise((resolve,reject)=>{const child=spawn(file,args,{cwd:project,windowsHide:true}),stdout=[],stderr=[];const timer=setTimeout(()=>{child.kill();reject(Error('Native default hull registry import timed out'));},30000);child.stdout.on('data',b=>stdout.push(b));child.stderr.on('data',b=>stderr.push(b));child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);if(code)reject(Error('Native registry failed: '+Buffer.concat(stderr)));else resolve(Buffer.concat(stdout).toString('utf8'));});child.stdin.end(input);});
const build=await fs.mkdtemp(path.join(project,'artifacts/native-default-hull-registry-')),cp=path.join(core,'*'),javac=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin/javac.exe'):'C:/Program Files/Java/jdk-17/bin/javac.exe';
await run(javac,['--release','17','-encoding','UTF-8','-cp',cp,'-d',build,path.join(project,'scripts/lib/NativeDefaultHullRegistry.java')]);
const input=JSON.stringify({hulls:storage.hulls,autofitHulls:autofit.hulls,weapons:storage.weapons,wings:storage.wings});
const stdout=await run(path.join(root,'jre/bin/java.exe'),['-noverify','-Djava.awt.headless=true','-cp',build+path.delimiter+cp,'NativeDefaultHullRegistry',core],input);
const marker='@@NATIVE_DEFAULT_HULL_REGISTRY@@',start=stdout.lastIndexOf(marker);if(start<0)throw Error('Native registry oracle result missing');const native=JSON.parse(stdout.slice(start+marker.length));
for(const raw of new Set(native.paths)){const rel=raw.replaceAll('\\','/');if(!rel.startsWith('data/')||rel.includes('..'))throw Error('Non-public native source path '+rel);await read('starsector-core/'+rel);}
const state=structuredClone(native.before),witnesses={};
for(const id of native.registryOrder){const v=state[id],targetId=v.hullId+'_Hull',target=state[targetId];if(v.emptyHull||v.tags.includes('skip_for_default_hull_modules')||!target||target.modules.length||!v.modules.length)continue;
 const mapped=[];for(const [slot,moduleId]of v.modules){const module=state[moduleId];if(!module)throw Error('Missing native module '+moduleId);const moduleHullId=native.restoration[module.hullId].defaultModuleHullId,childId=moduleHullId+'_Hull';if(!state[childId])continue;state[childId].displayName='标准';target.modules.push([slot,childId]);mapped.push([slot,childId]);}
 if(mapped.length)witnesses[targetId]={templateId:id,registryIndex:native.registryOrder.indexOf(id),modules:mapped};
}
const hullVariants={};
for(const [id,actual]of Object.entries(native.hullsAfter)){if(JSON.stringify([actual.modules,actual.displayName])!==JSON.stringify([state[id].modules,state[id].displayName]))throw Error('Default-module native oracle mismatch '+id);const initial=native.before[id];hullVariants[id]={hullId:actual.hullId,displayName:actual.displayName,initialDisplayName:initial.displayName,stationModules:actual.modules,templateId:witnesses[id]?.templateId??null,registryIndex:native.registryOrder.indexOf(id)};}
const body={schemaVersion:1,originalReference:storage.originalReference,scope:'public-core-new-registry-default-hull-modules-not-saved-class-history',oracleMethod:native.method,registryOrder:native.registryOrder,registrationEvents:native.events,legacyIds:native.legacyIds,hullRestoration:native.restoration,hullVariants};
const data={...body,referenceId:hash(JSON.stringify(body)),sources};
const destination=path.join(project,'src/campaign/data/reference-default-hull-modules.json'),text=JSON.stringify(data,null,2)+'\n';
const old=await fs.readFile(destination,'utf8').catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
if(check){if(old!==text)throw Error('Native default hull registry changed; review original sources before import');}else if(old!==text)await fs.writeFile(destination,text,{flag:old===null?'wx':'w'});
console.log(JSON.stringify({check,referenceId:data.referenceId,registryIds:data.registryOrder.length,hullVariants:Object.keys(hullVariants).length,legacyIds:native.legacyIds.length,filledHulls:Object.values(hullVariants).filter(h=>h.stationModules.length).length,renamedHulls:Object.values(hullVariants).filter(h=>h.displayName!==h.initialDisplayName).length,hullRestoration:Object.keys(native.restoration).length,sources:Object.keys(sources).length}));
