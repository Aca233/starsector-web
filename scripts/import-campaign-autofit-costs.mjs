/** Small public-source constants for OP/variant-only before-creation effects. */
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const repo=fileURLToPath(new URL('..',import.meta.url)),root=path.resolve(repo,'..'),sources={},effects={},checking=process.argv.includes('--check');
if(process.argv.slice(2).some(x=>x!=='--check'))throw Error('Only --check is supported');
async function read(p){const bytes=await fs.readFile(path.join(root,p));sources[p]={sha256:createHash('sha256').update(bytes).digest('hex')};return bytes.toString('utf8');}
for(const [script,file]of [
 ['com.fs.starfarer.api.impl.hullmods.ConvertedHangar','decompiled/starfarer_api_source/com/fs/starfarer/api/impl/hullmods/ConvertedHangar.java'],
 ['data.hullmods.ReinforcedBulkheads','starsector-core/data/hullmods/ReinforcedBulkheads.java'],
 ['data.hullmods.FluxCoilAdjunct','starsector-core/data/hullmods/FluxCoilAdjunct.java'],
]){const source=(await read(file)).replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\r\n]*/g,'');effects[script]={constants:Object.fromEntries([...source.matchAll(/public static (?:final )?(?:float|int) (\w+)\s*=\s*([0-9.]+)f?;/g)].map(m=>[m[1],Math.fround(Number(m[2]))])),hullSizeMap:Object.fromEntries([...source.matchAll(/mag\.put\(HullSize\.(\w+), ([0-9.]+)f\)/g)].map(m=>[m[1],Math.fround(Number(m[2]))])),hullSizeBonusMap:Object.fromEntries([...source.matchAll(/magBonus\.put\(HullSize\.(\w+), ([0-9.]+)f\)/g)].map(m=>[m[1],Math.fround(Number(m[2]))]))};}
for(const file of ['loading/specs/HullVariantSpec.java','loading/specs/BaseWeaponSpec.java','loading/specs/FighterWingSpec.java','loading/specs/O00O.java','loading/specs/g_0.java','prototype/Utils.java','combat/entities/ship/o0OO.java','util/DynamicStats.java'])await read('decompiled/starfarer_obf/com/fs/starfarer/'+file);
for(const file of ['combat/StatBonus.java','combat/listeners/CombatListenerUtil.java','util/Misc.java','impl/campaign/ids/Stats.java','impl/hullmods/Automated.java','impl/hullmods/HeavyBallisticsIntegration.java','impl/hullmods/RuggedConstruction.java','impl/hullmods/VastHangar.java'])await read('decompiled/starfarer_api_source/com/fs/starfarer/api/'+file);
for(const file of ['BlastDoors.java','IntegratedTargetingUnit.java'])await read('starsector-core/data/hullmods/'+file);
const result={schemaVersion:1,originalReference:'Starsector 0.98a-RC8',scope:'native-autofit-cost-and-variant-effects',sources,effects};
if(Object.keys(effects['com.fs.starfarer.api.impl.hullmods.ConvertedHangar'].constants).length!==8||Object.keys(effects['data.hullmods.FluxCoilAdjunct'].hullSizeMap).length!==4)throw Error('Source constants changed; review required');
const output=path.join(repo,'src/campaign/data/reference-autofit-costs.json'),text=JSON.stringify(result,null,2)+'\n',prior=await fs.readFile(output,'utf8').catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
if(checking){if(text!==prior)throw Error('Autofit cost sources changed');}else await fs.writeFile(output,text,{flag:prior===null?'wx':'w'});
console.log(JSON.stringify({sources:Object.keys(sources).length,effects:Object.keys(effects).length,check:checking}));
