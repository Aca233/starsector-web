/** Import installed 0.98a autofit specs; public resources and headless spec methods only. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {parseFactionText} from './import-campaign-factions.mjs';
const repo=fileURLToPath(new URL('..',import.meta.url)),root=path.resolve(repo,'..'),sources={},checking=process.argv.includes('--check'),f=Math.fround;
if(process.argv.slice(2).some(arg=>arg!=='--check'))throw Error('Only --check is supported');
async function read(p){const b=await fs.readFile(path.join(root,p));sources[p]={sha256:createHash('sha256').update(b).digest('hex')};return b.toString('utf8');}
const json=async p=>parseFactionText(await read(p));
function csv(text){const rows=[];let row=[],field='',quoted=false;const endField=()=>{row.push(field.trim());field='';},endRow=()=>{endField();if(row.some(Boolean))rows.push(row);row=[];};for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++;}else if(c==='"')quoted=false;else field+=c;}else if(c==='"'&&!field.trim())quoted=true;else if(c===',')endField();else if(c==='\n')endRow();else if(c!=='\r')field+=c;}if(quoted)throw Error('Unterminated CSV');if(field||row.length)endRow();const headers=rows.shift();return rows.filter(r=>!r[0].startsWith('#')).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));}
const list=text=>[...new Set(text.split(',').map(x=>x.trim()).filter(Boolean))],int=(v,label)=>{const n=Number(v);if(!Number.isInteger(n)||n<-2147483648||n>2147483647)throw Error('Invalid original int '+label);return n;};
const catalog=await json('starsector-web/src/engine/data/generated/native-catalog.json'),sync=await json('starsector-web/src/campaign/data/reference-fleet-sync.json'),storage=await json('starsector-web/src/campaign/data/reference-storage.json'),view=await json('starsector-web/src/campaign/data/reference-fleet-view.json');
const weaponRows=new Map(csv(await read('starsector-core/data/weapons/weapon_data.csv')).filter(x=>x.id).map(x=>[x.id,x])),wingRows=csv(await read('starsector-core/data/hulls/wing_data.csv')).filter(x=>x.id),shipRows=new Map(csv(await read('starsector-core/data/hulls/ship_data.csv')).filter(x=>x.id).map(x=>[x.id,x]));
const weapons={},fighters={},hulls={},rawHulls=new Map();
for(const entry of catalog.weapons){const raw=await json('starsector-core/'+entry.sourcePath),row=weaponRows.get(raw.id);if(!row)throw Error('Missing loaded weapon '+raw.id);if(Object.hasOwn(weapons,raw.id))throw Error('Duplicate weapon '+raw.id);
 if(!['beam','projectile','pulse'].includes(raw.specClass)||!['SMALL','MEDIUM','LARGE'].includes(raw.size))throw Error('Unaudited weapon class/size');
 const tags=list(row.tags),aiHints=list(row.hints),tier=int(row.tier||1,raw.id),range=f(Number(row.range||250)),maxAmmo=int(row.ammo||2147483647,raw.id);
 if(!tags.length){let level=({SMALL:4,MEDIUM:9,LARGE:13})[raw.size]+tier;const shortRange=({SMALL:350,MEDIUM:450,LARGE:600})[raw.size];let category=null;
  if(aiHints.includes('PD')){category='pd';level++;}else if(aiHints.includes('STRIKE'))category='strike';else if(raw.specClass==='beam')category='beam';else if(raw.type==='MISSILE')category='missile';else if(row.type==='KINETIC')category='kinetic';else if(row.type==='HIGH_EXPLOSIVE')category='he';else if(row.type==='FRAGMENTATION'){category='he';level-=7;}else if(row.type==='ENERGY')category='energy';
  if(category!==null)tags.push(category+Math.max(0,level));if(range<=shortRange)tags.push('SR');if(range>=shortRange+300)tags.push('LR');
 }
 weapons[raw.id]={id:raw.id,size:raw.size,type:raw.type,mountType:raw.mountTypeOverride??raw.type,restrictToSpecifiedMountType:raw.specClass!=='beam'&&(raw.restrictToSpecifiedMountType??false),tier,tags,aiHints,maxAmmo,baseOPCost:int(row.OPs||0,raw.id),beam:raw.specClass==='beam'};
}
for(const row of wingRows){if(Object.hasOwn(fighters,row.id))throw Error('Duplicate wing '+row.id);fighters[row.id]={id:row.id,tags:list(row.tags),tier:int(row.tier||0,row.id),baseOPCost:f(Number(row['op cost']||0)),role:row.role.toUpperCase()};}
for(const entry of catalog.ships){const raw=await json('starsector-core/'+entry.sourcePath),id=raw.skinHullId??raw.hullId;if(!rawHulls.has(id))rawHulls.set(id,raw);}
const resolving=new Set(),dTags=['special_allows_system_use','system_allows_special_use','auto_rec','codex_unlockable','restricted','no_autofit','no_autofit_unless_player','req_military','module_hull_bar_only','no_auto_penalty'];
function hull(id){if(hulls[id])return hulls[id];if(resolving.has(id))throw Error('Cyclic hull '+id);resolving.add(id);const raw=rawHulls.get(id),s=sync.hulls[id],built=storage.hulls[id],v=view.hulls[id];if(!s||!built||!v)throw Error('Unloaded hull '+id);let shieldType,shieldArc,defenseId,tags;
 if(!raw&&id.endsWith('_default_D')){const base=hull(id.slice(0,-10));({shieldType,shieldArc,defenseId}=base);tags=dTags.filter(t=>base.tags.includes(t));}
 else if(raw?.skinHullId){({shieldType,shieldArc,defenseId}=hull(raw.baseHullId));tags=[...new Set((raw.tags??[]).map(t=>t.trim()).filter(Boolean))];}
 else{const row=shipRows.get(id);if(!row||!raw)throw Error('Missing original hull source '+id);shieldType=row['shield type']||null;shieldArc=f(Number(row['shield arc']||30));defenseId=row['defense id']||null;tags=list(row.tags);}
 const result={hullId:id,hullSize:s.hullSize,phase:s.hints.includes('PHASE')||(shieldType==='PHASE'&&defenseId==='phasecloak'),shieldType,shieldArc,defenseId,tags,builtInMods:[...built.builtInMods],builtInWeapons:{...built.builtInWeapons},builtInWings:[...built.builtInWings],fighterBays:s.fighterBays,ordnancePoints:s.ordnancePoints,
 slots:v.slots.map(slot=>({...slot,location:[...slot.location],builtIn:slot.type==='BUILT_IN',decorative:slot.type==='DECORATIVE',hidden:slot.mount==='HIDDEN',system:slot.type==='SYSTEM',stationModule:slot.type==='STATION_MODULE'}))};
 if(![null,'NONE','OMNI','FRONT','PHASE'].includes(shieldType)||!Number.isFinite(shieldArc))throw Error('Invalid original shield '+id);hulls[id]=result;resolving.delete(id);return result;
}
for(const id of Object.keys(sync.hulls))hull(id);
for(const p of ['WeaponSpecLoader.java','WeaponSpreadsheetLoader.java','FighterWingSpreadsheetLoader.java','ShipHullSpecLoader.java','ShipHullSpreadsheetLoader.java','String.java','specs/BaseWeaponSpec.java','specs/FighterWingSpec.java','specs/nullsuper.java','specs/g_0.java'])await read('decompiled/starfarer_obf/com/fs/starfarer/loading/'+p);
await read('decompiled/starfarer_api_source/com/fs/starfarer/api/plugins/impl/CoreAutofitPlugin.java');
for(const p of ['starfarer_obf.jar','starfarer.api.jar','json.jar','lwjgl_util.jar'])await read('starsector-core/'+p);await read('jre/release');await read('starsector-web/scripts/lib/NativeAutofitSpecInputs.java');
const run=(exe,args,input='')=>new Promise((resolve,reject)=>{const child=spawn(exe,args,{cwd:repo,windowsHide:true}),out=[],err=[];const timer=setTimeout(()=>{child.kill();reject(Error('Native autofit spec extraction timed out'));},30000);child.on('error',e=>{clearTimeout(timer);reject(e);});child.stdout.on('data',b=>out.push(b));child.stderr.on('data',b=>err.push(b));child.on('close',code=>{clearTimeout(timer);if(code)reject(Error(Buffer.concat(err).toString()));else resolve(Buffer.concat(out).toString());});child.stdin.end(input);});
const build=await fs.mkdtemp(path.join(repo,'artifacts/native-autofit-specs-')),cp=path.join(root,'starsector-core/*'),javac='C:/Program Files/Java/jdk-17/bin/javac.exe';
await run(javac,['--release','17','-encoding','UTF-8','-cp',cp,'-d',build,path.join(repo,'scripts/lib/NativeAutofitSpecInputs.java')]);
const original=JSON.parse(await run(path.join(root,'jre/bin/java.exe'),['-Xverify:none','-Djava.awt.headless=true','-cp',build+path.delimiter+cp,'NativeAutofitSpecInputs'],JSON.stringify({weapons:Object.values(weapons),fighters:Object.values(fighters)})));
Object.values(weapons).forEach((w,i)=>Object.assign(w,original.weapons[i]));Object.values(fighters).forEach((w,i)=>Object.assign(w,original.fighters[i]));
const data={schemaVersion:1,originalReference:'Starsector 0.98a-RC8',scope:'native-autofit-static-specs-not-op-stat-lifecycle',sources,weapons,fighters,hulls,compatibility:original.compatibility};
const output=path.join(repo,'src/campaign/data/reference-autofit-specs.json'),text=JSON.stringify(data,null,2)+'\n',prior=await fs.readFile(output,'utf8').catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
if(checking){if(prior!==text)throw Error('Autofit source inputs changed; review before reimport');}else await fs.writeFile(output,text,{flag:prior===null?'wx':'w'});
console.log(JSON.stringify({weapons:Object.keys(weapons).length,fighters:Object.keys(fighters).length,hulls:Object.keys(hulls).length,compatibilityCases:original.compatibility.bits.length,sources:Object.keys(sources).length,check:checking}));
