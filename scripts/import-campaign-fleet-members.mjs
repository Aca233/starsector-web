/** Public installed member/name inputs; no game process or save loading. */
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {spawn} from 'node:child_process';
import {parseFactionText} from './import-campaign-factions.mjs';
const project=fileURLToPath(new URL('..',import.meta.url)),root=path.resolve(project,'..'),sources={},check=process.argv.includes('--check');
if(process.argv.slice(2).some(a=>a!=='--check'))throw Error('Usage: import-campaign-fleet-members.mjs [--check]');
async function read(p){const b=await fs.readFile(path.join(root,p));sources[p]={sha256:createHash('sha256').update(b).digest('hex')};return b.toString('utf8');}
const obf='decompiled/starfarer_obf/com/fs/starfarer/',api='decompiled/starfarer.api/com/fs/starfarer/api/';
for(const p of ['campaign/CampaignEngine.java','campaign/fleet/FleetMember.java','campaign/fleet/FleetMemberStatus.java','campaign/fleet/FleetData.java','campaign/fleet/CargoData.java','campaign/fleet/RepairTracker.java','campaign/fleet/CrewComposition.java','rpg/Person.java','campaign/CharacterStats.java','loading/ShipNameStore.java','loading/SpecStore.java','loading/ShipHullSpecLoader.java','loading/ShipHullSpreadsheetLoader.java','loading/specs/HullVariantSpec.java','util/O0OO.java'])await read(obf+p);
for(const p of ['util/WeightedRandomPicker.java','util/MutableValue.java','util/Misc.java','loading/WeaponGroupSpec.java','impl/campaign/ids/Ranks.java'])await read(api+p);
const settings=parseFactionText(await read('starsector-core/data/config/settings.json')),names=parseFactionText(await read('starsector-core/data/strings/ship_names.json'));
const factions=JSON.parse(await read('starsector-web/src/campaign/data/reference-factions.json')),stored=JSON.parse(await read('starsector-web/src/campaign/data/reference-storage.json'));
const catalog=JSON.parse(await read('starsector-web/src/engine/data/generated/native-catalog.json')),raw={names,factions:{},variants:{}};
for(const d of factions.definitions){const source=factions.sources.find(s=>s.id===d.sourceId);raw.factions[d.id]=parseFactionText(await read('starsector-core/'+source.path));}
for(const v of catalog.variants){const spec=parseFactionText(await read('starsector-core/'+v.sourcePath));if(!Object.hasOwn(raw.variants,spec.variantId))raw.variants[spec.variantId]=spec;}
for(const p of new Set(catalog.ships.map(h=>h.csvSourcePath).filter(Boolean)))await read('starsector-core/'+p);
const hullRaw={};for(const h of catalog.ships){const spec=parseFactionText(await read('starsector-core/'+h.sourcePath)),id=spec.skinHullId??spec.hullId;if(!Object.hasOwn(hullRaw,id))hullRaw[id]=spec;}
const hulls={};function hull(id){if(hulls[id])return hulls[id];const s=hullRaw[id];if(!s){if(id.endsWith('_default_D')){const parent=hull(id.slice(0,-10));return hulls[id]={...structuredClone(parent),name:parent.name+' (D)'};}throw Error('Missing construction hull '+id);}
 const base=s.skinHullId?hull(s.baseHullId):null;const slots=base?structuredClone(base.slots):Object.fromEntries((s.weaponSlots??[]).map(slot=>[slot.id,slot.type]));
 for(const [slot,changes]of Object.entries(s.weaponSlotChanges??{}))if(changes.type)slots[slot]=changes.type;
 const tags=s.skinHullId?(s.tags??[]):String(catalog.ships.find(h=>h.id===id)?.stats?.tags??'').split(',');return hulls[id]={name:s.hullName??base?.name,slots,noAutoPenalty:tags.some(tag=>tag.trim()==='no_auto_penalty')};}
// Loaded D hull specs exist without registered *_default_D_Hull variants. Needed by Settings.createEmptyVariant and DModManager.
for(const id of Object.keys(stored.hulls))hull(id);
for(const p of ['starsector-core/json.jar','starsector-core/starfarer_obf.jar','jre/release','starsector-web/scripts/lib/NativeJsonOrder.java'])await read(p);
const run=(file,args,input='')=>new Promise((resolve,reject)=>{const p=spawn(file,args,{cwd:project,windowsHide:true}),out=[],err=[];const timer=setTimeout(()=>{p.kill();reject(Error('Native order import timed out'));},30000);p.stdout.on('data',d=>out.push(d));p.stderr.on('data',d=>err.push(d));p.on('error',e=>{clearTimeout(timer);reject(e);});p.on('close',code=>{clearTimeout(timer);if(code)reject(Error('Native order import failed: '+Buffer.concat(err)));else resolve(Buffer.concat(out).toString('utf8'));});p.stdin.end(input);});
const build=await fs.mkdtemp(path.join(project,'artifacts/native-member-order-')),jsonJar=path.join(root,'starsector-core/json.jar');
const javac=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin/javac.exe'):'C:/Program Files/Java/jdk-17/bin/javac.exe';
await run(javac,['--release','17','-encoding','UTF-8','-cp',jsonJar,'-d',build,path.join(project,'scripts/lib/NativeJsonOrder.java')]);
const order=new Map(JSON.parse(await run(path.join(root,'jre/bin/java.exe'),['-cp',build+path.delimiter+jsonJar,'NativeJsonOrder'],JSON.stringify(raw))));
const escape=s=>s.replaceAll('~','~0').replaceAll('/','~1'),keys=p=>order.get(p)??[];
const seen=new Set(),groups={},all=[];for(const group of keys('/names')){groups[group]=[];for(const name of names[group]){if(seen.has(name))continue;seen.add(name);groups[group].push(name);if(!['OMEGA','DERELICT_DRONE','THREAT','DWELLER'].includes(group))all.push(name);}}
const factionNames={};for(const [id,spec]of Object.entries(raw.factions)){const weights=spec.shipNameSources,entries=keys('/factions/'+escape(id)+'/shipNameSources').map(key=>({item:key,weight:Math.fround(weights[key])})).filter(e=>e.weight>0);if(!weights||Object.keys(weights).length===0)entries.push({item:'ALL',weight:1});factionNames[id]={prefix:spec.shipNamePrefix??'ISS',entries};}
const variants={};for(const [id,input]of Object.entries(stored.variants)){const spec=raw.variants[id];const groups=(spec?.weaponGroups??[]).map((g,i)=>({type:g.mode??null,autofire:g.autofire??false,slots:keys('/variants/'+escape(id)+'/weaponGroups/'+i+'/weapons')})).filter(g=>g.slots.length);
 variants[id]={displayName:spec?.displayName??(Object.keys(hull(input.hullId).slots).length?'特装':'标准'),source:spec?'STOCK':'HULL',goalVariant:spec?.goalVariant??false,groupSpecs:groups,defaultHullModulesPending:!spec&&Object.values(hull(input.hullId).slots).includes('STATION_MODULE')};}
const extraEffects={};for(const name of ['UnstableInjector','SafetyOverrides','HardenedSubsystems','ArmoredWeapons','DedicatedTargetingCore','FluxBreakers','InsulatedEngines','FluxDistributor','AutomatedRepairUnit','ExpandedMagazines','Automated']){
 const text=(await read(name==='Automated'?api+'impl/hullmods/Automated.java':'starsector-core/data/hullmods/'+name+'.java')).replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
 extraEffects[(name==='Automated'?'com.fs.starfarer.api.impl.hullmods.':'data.hullmods.')+name]={constants:Object.fromEntries([...text.matchAll(/(?:public|private) static (?:final )?(?:float|int) (\w+) = ([-0-9.]+)f?;/g)].map(m=>[m[1],Math.fround(Number(m[2]))])),hullSizeMap:Object.fromEntries([...text.matchAll(/(?:mag|speed).put\(HullSize.(\w+), ([0-9.]+)f\)/g)].map(m=>[m[1],Math.fround(Number(m[2]))]))};
}
const distributor=(await read('starsector-core/data/hullmods/FluxDistributor.java')).replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');extraEffects['data.hullmods.FluxDistributor'].hullSizeBonusMap=Object.fromEntries([...distributor.matchAll(/magBonus.put\(HullSize.(\w+), ([0-9.]+)f\)/g)].map(m=>[m[1],Math.fround(Number(m[2]))]));
await read(api+'combat/BaseHullMod.java');
const ballistic=await read(api+'impl/hullmods/BallisticRangefinder.java');if(!/void applyEffectsBeforeShipCreation\([^)]*\)\s*\{\s*\}/.test(ballistic))throw Error('BallisticRangefinder before-creation behavior changed');
const data={extraEffects,schemaVersion:1,originalReference:'Starsector 0.98a-RC8',scope:'member-construction-and-name-inputs-not-world-fleets',sources,errorShipVariant:settings.errorShipVariant,hulls,variants,names:{groups,all},factions:factionNames};
if(!variants[data.errorShipVariant]||Object.values(hulls).some(h=>typeof h.name!=='string'))throw Error('Incomplete construction reference');
const destination=path.join(project,'src/campaign/data/reference-fleet-members.json'),output=JSON.stringify(data,null,2)+'\n';const old=await fs.readFile(destination,'utf8').catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
if(check){if(old!==output)throw Error('Member reference changed; review sources before reimport');}else await fs.writeFile(destination,output,{flag:old===null?'wx':'w'});
console.log(JSON.stringify({check,variants:Object.keys(variants).length,hulls:Object.keys(hulls).length,groups:Object.keys(groups).length,names:seen.size,factions:Object.keys(factionNames).length,sources:Object.keys(sources).length}));
