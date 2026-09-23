import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {build} from 'esbuild';
const out=path.resolve(process.env.WEAPON_RANGE_OUT??'artifacts/dynamic-range-20260922');fs.mkdirSync(out,{recursive:true});
const outfile=path.join(out,'range-contract.mjs');
await build({stdin:{loader:'ts',resolveDir:process.cwd(),contents:
 `export {combatWeaponRange,effectiveWeaponRange} from './src/engine/simulation/WeaponRange';
 export * as mods from './src/engine/extensions/HullMods';
 export {immutableCopy} from './src/engine/extensions/Immutable';
 export {assets,world} from './scripts/lib/native-projectile-fixture.mts';`},outfile,bundle:true,platform:'node',format:'esm',packages:'external',define:{__LAN_BUILD_ID__:'"range-contract"','import.meta.env':'{"BASE_URL":"/","DEV":false}'}});
const {combatWeaponRange,effectiveWeaponRange,mods,immutableCopy,assets,world}=await import(pathToFileURL(outfile));await assets();
const engine=world(2),template=engine.playerShip.spec,weaponTemplate=engine.playerShip.weapons[0].spec;
let checks=0;
function reference(spec,w,mult=1,percent=0,flat=0){const base=w.range+mods.hullModRangeBaseFlat(spec,w);
 const range=(base*(1+(mods.hullModRangePercent(spec,w)+percent)/100)*mods.hullModRangeMultiplier(spec,w)*mult+mods.hullModRangeFlat(spec,w)+flat)*(spec.weaponRangeMult??1);
 const stats=mods.hullModRangeThresholdStats(spec);return Math.max(0,w.weaponType==='MISSILE'||range<=stats.rangeThreshold?range:stats.rangeThreshold+(range-stats.rangeThreshold)*stats.rangePastThresholdMultiplier);}
function compare(spec,w,ecm,percent,carrier){const flat=carrier?mods.fighterWeaponRangeFlat(carrier,w):0;
 const ship={spec,ecmRangePenalty:ecm,system:{getWeaponRangePercent:()=>percent},sourceCarrier:carrier?{spec:carrier}:undefined};
 assert.equal(combatWeaponRange(ship,w),reference(spec,w,1-ecm/100,percent,flat));checks++;}
for(const hullMods of [[],['advancedcore'],['targetingunit'],['eccm'],['coherer'],['high_scatter_amp'],['advancedoptics'],['safetyoverrides'],['ballistic_rangefinder'],['glitched_sensors'],['advancedcore','advancedoptics','eccm']]){
 const spec=immutableCopy({...template,builtInHullMods:[],hullMods,captainSkills:{gunnery_implants:2,point_defense:2,ballistic_mastery:2},weaponRangeMult:1.13});
 const carrier=immutableCopy({...template,builtInHullMods:[],hullMods:[],captainSkills:{point_defense:2}});
 const w={...weaponTemplate,aiHints:[]};
 for(const weaponType of ['BALLISTIC','ENERGY','MISSILE'])for(const mountSize of ['SMALL','MEDIUM','LARGE'])for(const isBeam of [false,true])for(const range of [0,449,450,800,900,1250]){
  Object.assign(w,{weaponType,mountSize,isBeam,range,mountTypeOverride:undefined,isPointDefense:false,isRocket:false,spawnType:undefined});w.aiHints.length=0;
  for(const ecm of [0,10,42,0])for(const percent of [0,40,100,-15,0])compare(spec,w,ecm,percent,carrier);
  w.aiHints.push('PD');compare(spec,w,23,70,carrier);w.aiHints.length=0;w.isPointDefense=true;compare(spec,w,23,70,carrier);
  w.isPointDefense=false;w.mountTypeOverride='HYBRID';compare(spec,w,23,70);w.isRocket=true;compare(spec,w,23,70);w.isRocket=false;w.spawnType='MISSILE';compare(spec,w,23,70);
  assert.equal(effectiveWeaponRange(spec,w),reference(spec,w));checks++;
 }
}
// Carrier S-mod flats change without changing the craft's spec or weapon key.
const carrierFit=immutableCopy({...template,builtInHullMods:[],hullMods:['defensive_targeting_array'],sMods:['defensive_targeting_array']});
const sModSpec=immutableCopy({...template,builtInHullMods:[],hullMods:['dedicated_targeting_core'],sMods:['dedicated_targeting_core']});
const unchangedWeapon={...weaponTemplate,weaponType:'BALLISTIC',aiHints:[],isPointDefense:false};
for(const carrier of [undefined,carrierFit,undefined,carrierFit])compare(sModSpec,unchangedWeapon,20,40,carrier);
// A replacement immutable loadout is a new cache owner; mutable loadouts never cache.
const mutable={...template,builtInHullMods:[],hullMods:['advancedcore']},w={...weaponTemplate,aiHints:[]};
compare(mutable,w,10,50);mutable.hullMods.splice(0,1,'safetyoverrides');compare(mutable,w,10,50);
let calls=0,bonus=7;
mods.hullModDefinitions.register({id:'range_contract_live',name:'Live range contract',status:'implemented',rangePercent:()=>{calls++;return bonus;}});
const custom=immutableCopy({...template,builtInHullMods:[],hullMods:['range_contract_live']});
for(const percent of [0,30,30,0]){bonus+=11;const before=calls;compare(custom,w,10,percent);assert.equal(calls-before,2,'candidate and reference must both call extension');}
for(const value of [NaN,Infinity,-Infinity,-1,0]){w.range=value;compare(immutableCopy({...template,builtInHullMods:[],hullMods:['safetyoverrides']}),w,20,40);}
// Classification caches may hold false, but never mutable specs or failed resolution.
const nativeSpec=immutableCopy({...template,builtInHullMods:[],hullMods:['targetingunit']});
for(let i=0;i<3;i++){assert.equal(mods.hasOnlyNativeRangeModifiers(nativeSpec),true);assert.equal(mods.hasOnlyNativeRangeModifiers(custom),false);}
const changing={...template,builtInHullMods:[],hullMods:['targetingunit']};
assert.equal(mods.hasOnlyNativeRangeModifiers(changing),true);changing.hullMods[0]='range_contract_live';
assert.equal(mods.hasOnlyNativeRangeModifiers(changing),false);changing.hullMods[0]='targetingunit';
assert.equal(mods.hasOnlyNativeRangeModifiers(changing),true);
const late=immutableCopy({...template,builtInHullMods:[],hullMods:['range_contract_late']});
assert.throws(()=>mods.hasOnlyNativeRangeModifiers(late),/unsupported/);
mods.hullModDefinitions.register({id:'range_contract_late',name:'Late registry contract',status:'implemented'});
assert.equal(mods.hasOnlyNativeRangeModifiers(late),false);
const installed=mods.installedHullMods(nativeSpec);installed.length=0;
assert.equal(mods.installedHullMods(nativeSpec).length,1);assert.equal(mods.hasOnlyNativeRangeModifiers(nativeSpec),true);
checks+=13;
fs.writeFileSync(path.join(out,'range-contract.json'),JSON.stringify({checks,customCalls:calls}));console.log(JSON.stringify({checks,customCalls:calls}));
