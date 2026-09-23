/** Import installed FleetFactoryV3 constants only; does not start the game or load saves. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {parseFactionText} from './import-campaign-factions.mjs';
const project=fileURLToPath(new URL('..',import.meta.url)),root=path.resolve(project,'..'),sources={};
const check=process.argv.includes('--check');
if(process.argv.slice(2).some(a=>a!=='--check'))throw Error('Usage: import-campaign-fleet-composition.mjs [--check]');
async function read(p){const bytes=await fs.readFile(path.join(root,p));sources[p]={sha256:createHash('sha256').update(bytes).digest('hex')};return bytes.toString('utf8');}
const api='decompiled/starfarer.api/com/fs/starfarer/api/';
for(const p of ['impl/campaign/fleets/FleetFactoryV3.java','impl/campaign/fleets/FleetParamsV3.java','util/WeightedRandomPicker.java','combat/ShipAPI.java'])await read(api+p);
for(const p of ['starsector-core/starfarer.api.jar','starsector-core/json.jar','jre/release','starsector-web/scripts/lib/NativeFleetCompositionConstants.java'])await read(p);
const settings=parseFactionText(await read('starsector-core/data/config/settings.json'));
const run=(file,args)=>new Promise((resolve,reject)=>{const p=spawn(file,args,{cwd:project,windowsHide:true}),out=[],err=[];
 const timer=setTimeout(()=>{p.kill();reject(Error('Native composition constant import timed out'));},30000);
 p.stdout.on('data',d=>out.push(d));p.stderr.on('data',d=>err.push(d));p.on('error',e=>{clearTimeout(timer);reject(e);});
 p.on('close',code=>{clearTimeout(timer);if(code)reject(Error('Native composition constant import failed: '+Buffer.concat(err)));else resolve(Buffer.concat(out).toString('utf8'));});});
const build=await fs.mkdtemp(path.join(project,'artifacts/native-fleet-constants-'));
const javac=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin/javac.exe'):'C:/Program Files/Java/jdk-17/bin/javac.exe';
await run(javac,['--release','17','-encoding','UTF-8','-cp',path.join(root,'starsector-core/json.jar'),'-d',build,path.join(project,'scripts/lib/NativeFleetCompositionConstants.java')]);
const imported=JSON.parse(await run(path.join(root,'jre/bin/java.exe'),['-cp',build+path.delimiter+path.join(root,'starsector-core/*'),'NativeFleetCompositionConstants']));
// Fixed key order: JSONObject iteration order is not part of this data format.
const constants=Object.fromEntries(['BASE_COUNTS_WITH_4','MAX_EXTRA_WITH_4','BASE_COUNTS_WITH_3','MAX_EXTRA_WITH_3','FLEET_POINTS_THRESHOLD_FOR_ANNOYING_SHIPS','MIN_NUM_SHIPS_DEFICIT_MULT','BASE_QUALITY_WHEN_NO_MARKET'].map(k=>[k,imported[k]]));
for(const [key,value]of Object.entries(constants)){if(Array.isArray(value)){const width=key.endsWith('_4')?4:3;if(value.length!==5||value.some(row=>row.length!==width||row.some(n=>!Number.isInteger(n)||n<0)))throw Error('Invalid installed composition matrix');}else if(!Number.isFinite(value))throw Error('Invalid installed composition constant');}
const data={schemaVersion:1,originalReference:'Starsector 0.98a-RC8',scope:'fleet-factory-roster-phase-not-complete-fleet-creation',sources,constants,settings:{maxShipsInAIFleet:settings.maxShipsInAIFleet}};
if(!Number.isInteger(data.settings.maxShipsInAIFleet))throw Error('Missing native fleet size setting');
const destination=path.join(project,'src/campaign/data/reference-fleet-composition.json'),output=JSON.stringify(data,null,2)+'\n';
const old=await fs.readFile(destination,'utf8').catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
if(check){if(old!==output)throw Error('Composition reference changed; review native evidence before reimport');}else await fs.writeFile(destination,output,{flag:old===null?'wx':'w'});
console.log(JSON.stringify({check,constants,sources:Object.keys(sources).length,settings:data.settings}));
