/** Source-derived ship-role tables and memberships for FleetFactoryV3's actual picker. */
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {spawn} from 'node:child_process';
import {parseFactionText} from './import-campaign-factions.mjs';
const project=fileURLToPath(new URL('..',import.meta.url)),root=path.resolve(project,'..'),sources={},f=Math.fround,check=process.argv.includes('--check');
if(process.argv.slice(2).some(a=>a!=='--check'))throw Error('Usage: import-campaign-ship-selection.mjs [--check]');
const sha=b=>createHash('sha256').update(b).digest('hex');
async function read(p){const b=await fs.readFile(path.join(root,p));sources[p]={sha256:sha(b)};return b.toString('utf8');}
function csv(text){const rows=[];let row=[],field='',quoted=false;const end=()=>{row.push(field.trim());field='';};for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++;}else if(c==='"')quoted=false;else field+=c;}else if(c==='"'&&!field.trim())quoted=true;else if(c===',')end();else if(c==='\n'){end();if(row.some(Boolean))rows.push(row);row=[];}else if(c!=='\r')field+=c;}if(field||row.length){end();rows.push(row);}const header=rows.shift();return rows.filter(r=>!r[0].startsWith('#')).map(r=>Object.fromEntries(header.map((key,i)=>[key,r[i]??''])));}
const obf='decompiled/starfarer_obf/com/fs/starfarer/',api='decompiled/starfarer.api/com/fs/starfarer/api/';
for(const p of ['campaign/Faction.java','campaign/econ/Market.java','campaign/save/CampaignGameManager.java','loading/o0oo.java','loading/SpecStore.java','loading/ShipHullSpecLoader.java','loading/ShipHullSpreadsheetLoader.java','settings/StarfarerSettings.java'])await read(obf+p);
for(const p of ['impl/campaign/fleets/FleetFactoryV3.java','campaign/FactionAPI.java','util/Misc.java','util/WeightedRandomPicker.java','fleet/ShipRolePick.java'])await read(api+p);
const stored=JSON.parse(await read('starsector-web/src/campaign/data/reference-storage.json')),fleet=JSON.parse(await read('starsector-web/src/campaign/data/reference-fleet-sync.json')),factionsRef=JSON.parse(await read('starsector-web/src/campaign/data/reference-factions.json'));
const catalogue=JSON.parse(await read('starsector-web/src/engine/data/generated/native-catalog.json')),rows=csv(await read('starsector-core/data/hulls/ship_data.csv')),tags={};
const shipRows=new Map(rows.map(row=>[row.id,row]));for(const row of catalogue.ships){const raw=parseFactionText(await read('starsector-core/'+row.sourcePath)),id=raw.skinHullId??raw.hullId;if(!fleet.hulls[id]||Object.hasOwn(tags,id))continue;tags[id]=raw.skinHullId?[...(raw.tags??[])].map(s=>s.trim()).filter(Boolean):(shipRows.get(id)?.tags??'').split(',').map(s=>s.trim()).filter(Boolean);}
const dTags=['special_allows_system_use','system_allows_special_use','auto_rec','codex_unlockable','restricted','no_autofit','no_autofit_unless_player','req_military','module_hull_bar_only','no_auto_penalty'];
for(const id of Object.keys(fleet.hulls))if(!Object.hasOwn(tags,id)&&id.endsWith('_default_D')&&tags[id.slice(0,-10)])tags[id]=tags[id.slice(0,-10)].filter(t=>dTags.includes(t));
const variants={};for(const [id,v]of Object.entries(stored.variants))if(fleet.hulls[v.hullId])variants[id]={hullId:v.hullId,fp:fleet.hulls[v.hullId].fleetPoints};
const raw={defaults:parseFactionText(await read('starsector-core/data/world/factions/default_ship_roles.json')),factions:{}};
for(const d of factionsRef.definitions){const s=factionsRef.sources.find(s=>s.id===d.sourceId),text=await read('starsector-core/'+s.path);if(sha(Buffer.from(text))!==s.sha256)throw Error('Faction source changed; reimport after review');raw.factions[d.id]=parseFactionText(text);}
const settings=parseFactionText(await read('starsector-core/data/config/settings.json'));await read('starsector-core/json.jar');await read('jre/release');await read('starsector-web/scripts/lib/NativeJsonOrder.java');
const run=(file,args,input='')=>new Promise((resolve,reject)=>{const p=spawn(file,args,{cwd:project,windowsHide:true}),out=[],err=[];const timer=setTimeout(()=>{p.kill();reject(Error('Native JSON order import timed out'));},30000);p.stdout.on('data',d=>out.push(d));p.stderr.on('data',d=>err.push(d));p.on('error',e=>{clearTimeout(timer);reject(e);});p.on('close',code=>{clearTimeout(timer);if(code)reject(Error('Native JSON order import failed: '+Buffer.concat(err)));else resolve(Buffer.concat(out).toString('utf8'));});p.stdin.end(input);});
const build=await fs.mkdtemp(path.join(project,'artifacts/native-json-order-')),javac=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin','javac.exe'):'C:/Program Files/Java/jdk-17/bin/javac.exe',jsonJar=path.join(root,'starsector-core/json.jar');
await run(javac,['--release','17','-encoding','UTF-8','-cp',jsonJar,'-d',build,path.join(project,'scripts/lib/NativeJsonOrder.java')]);
const orders=new Map(JSON.parse(await run(path.join(root,'jre/bin/java.exe'),['-cp',build+path.delimiter+jsonJar,'NativeJsonOrder'],JSON.stringify(raw))));
const pointer=s=>s.replaceAll('~','~0').replaceAll('/','~1'),keys=p=>orders.get(p)??[];
const roles={defaults:{},factions:{},byRef:{},entries:{}};
function compile(rawRoles,scope,p,defaults={}){const result={};for(const id of keys(p)){if(id==='doctrine')continue;const ref=scope+':'+id,row={objectRef:ref,roleId:id,entries:[],fallback:null,fallback2:null};let inherited=null,serial=0;
 for(const key of keys(p+'/'+pointer(id))){const value=rawRoles[id][key];if(key==='includeDefault'){if(value===true&&defaults[id]){inherited=roles.byRef[defaults[id]];row.entries.push(...inherited.entries);}}else if(key==='fallback'||key==='fallback2'){const target=keys(p+'/'+pointer(id)+'/'+key)[0];if(target===undefined)throw Error('Empty native role fallback');row[key]={roleId:target,count:f(value[target])};}else{if(!variants[key])throw Error('Missing native role variant: '+key);const entryRef=ref+':entry:'+serial++;roles.entries[entryRef]={objectRef:entryRef,variantId:key,weight:f(value)};row.entries.push(entryRef);}}
 if(inherited){row.fallback??=inherited.fallback;row.fallback2??=inherited.fallback2;}result[id]=ref;roles.byRef[ref]=row;
 }return result;}
roles.defaults=compile(raw.defaults,'default','/defaults');
const definitions={};for(const [id,spec]of Object.entries(raw.factions)){
 roles.factions[id]=compile(spec.shipRoles??{},'faction:'+id,'/factions/'+pointer(id)+'/shipRoles',roles.defaults);
 const membership=key=>{const s=spec[key]??{},members=new Set();for(const [h,ts]of Object.entries(tags))if(ts.some(t=>(s.tags??[]).includes(t)))members.add(h);for(const h of s.hulls??[])members.add(h);return [...members];};
 const knownShips=membership('knownShips'),shipsWhenImporting=membership('shipsWhenImporting'),priorityShips=membership('priorityShips'),variantOverrides={},hullFrequency={},overriddenHulls=[];
 for(const key of keys('/factions/'+pointer(id)+'/variantOverrides')){if(!variants[key])throw Error('Missing variant override');variantOverrides[key]=f(spec.variantOverrides[key]);if(!overriddenHulls.includes(variants[key].hullId))overriddenHulls.push(variants[key].hullId);}
 for(const key of keys('/factions/'+pointer(id)+'/hullFrequency/hulls'))hullFrequency[key]=f(spec.hullFrequency.hulls[key]);
 for(const tag of keys('/factions/'+pointer(id)+'/hullFrequency/tags'))for(const [h,ts]of Object.entries(tags))if(ts.includes(tag)){const value=f((hullFrequency[h]??1)*f(spec.hullFrequency.tags[tag]));if(value!==1)hullFrequency[h]=value;}
 definitions[id]={knownShips,shipsWhenImporting:shipsWhenImporting.length?shipsWhenImporting:[...knownShips],priorityShips,variantOverrides,overriddenHulls,hullFrequency};
}
const data={schemaVersion:1,originalReference:'Starsector 0.98a-RC8',scope:'ship-selection-membership-and-ordered-roles-not-fleet-entities',sources,devMode:settings.devMode,roles,variants,definitions};
const destination=path.join(project,'src/campaign/data/reference-ship-selection.json'),output=JSON.stringify(data,null,2)+'\n',old=await fs.readFile(destination,'utf8').catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
if(check){if(old!==output)throw Error('Ship selection sources changed; review before reimport');}else await fs.writeFile(destination,output,{flag:old===null?'wx':'w'});
console.log(JSON.stringify({check,factions:Object.keys(definitions).length,roles:Object.keys(roles.byRef).length,entries:Object.keys(roles.entries).length,variants:Object.keys(variants).length,sources:Object.keys(sources).length}));
