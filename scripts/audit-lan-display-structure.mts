// Diagnostic-only entry built by the existing frozen authority CPU probe.
// No timers/renderer/IPC or performance claims; never imported by production.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createLanWorld} from '../src/network/LanWorld';
import {assetManager} from '../src/engine/assets/AssetResolver';
import {captureLanDisplayCombat,configureHostCosmetics} from '../src/network/HostSnapshot';
import {encodeProjectedBinaryFrame,decodeBinaryFrame} from '../src/network/BinarySnapshot.mjs';
import {createLanDisplayWorld} from '../src/network/LanDisplayBootstrap';
import {applyLanDisplaySnapshot} from '../src/network/LanDisplaySnapshot';
import {expandAuditRecords,restoreStructure,definitionSignature,summarizeDefinitions} from './lib/lan-display-structure-audit.mjs';

const args=process.argv.slice(2),outAt=args.indexOf('--out');
if(outAt<0||!args[outAt+1])throw Error('Required --out');
const out=path.resolve(args[outAt+1]);
if(fs.existsSync(out))throw Error('Do not overwrite a prior audit');
fs.mkdirSync(out,{recursive:true});
const publicRoot=path.resolve('public'),assets=new Map<string,string>();
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
globalThis.fetch=async(input:any)=>{
 const file=path.resolve(publicRoot,String(input).replace(/^\//,''));
 if(!file.startsWith(publicRoot+path.sep))throw Error('Outside audit assets');
 const bytes=fs.readFileSync(file),hash=sha(bytes);
 if(assets.has(file)&&assets.get(file)!==hash)throw Error('Asset changed during audit: '+file);
 assets.set(file,hash);return new Response(bytes);
};
await assetManager.ensureManifestLoaded();
const checkpoints=new Set([240,300,360,480]);
const samples:any[]=[],contracts:any[]=[];
for(const count of [22,64]){
 const match:any={id:'v1-structure-audit',seed:917,hostId:'p0',snapshotHz:60,
  players:[{id:'p0',seat:0,team:0,hull:'onslaught'},{id:'p1',seat:1,team:1,hull:'onslaught'}],
  options:{assignment:'teams',battleSize:3200,aiHulls:[Array(Math.ceil((count-2)/2)).fill('hammerhead'),Array(Math.floor((count-2)/2)).fill('hammerhead')]}};
 const engine=createLanWorld(match).engine,muzzle=configureHostCosmetics(engine,true,true);
 const previousWeapons=new Map(),previousSystems=new Map(),previousWeaponRoots=new Map(),previousSystemRoots=new Map();
 let replica:any,lastFrame:any,lastDefinitions:any[]=[];
 for(let tick=1;tick<=480;tick++){
  engine.fixedUpdate(1/60);if(tick%12!==0)continue;
  const binary=encodeProjectedBinaryFrame(captureLanDisplayCombat(engine,tick,{0:0,1:0},0,muzzle,true,true),true);
  const frame=decodeBinaryFrame(binary);assert.equal(frame.displayVersion,1);assert.equal(frame.displayDefinitions,undefined);
  if(replica)applyLanDisplaySnapshot(replica,frame);else replica=createLanDisplayWorld(match,0,frame).world;
  lastFrame=frame;if(!checkpoints.has(tick))continue;
  const roots=[...replica.allCapitalShips,...replica.ships];
  const views=new Map<string,any>(roots.map((ship:any)=>[ship.id,ship]));
  const weapons:any[]=[],systems:any[]=[],fieldGroups=new Map<string,number>();
  let totalFields=0,systemOccurrences=0,uniqueSystemContents=0,distinctSystemRoots=0;
  const add=(key:string,value:any)=>fieldGroups.set(key,(fieldGroups.get(key)??0)+restoreStructure(value).fields);
  for(const row of [...frame.ships,...frame.crafts]){
   const state:any=expandAuditRecords(row.state,frame.layouts??[]),ship=views.get(row.id);assert.ok(ship,'Missing display identity: '+row.id);
   totalFields+=restoreStructure(state).fields;
   // The top-level property itself belongs to the surrounding ship/mount; the
   // nested definition's own properties are the work counted as metadata here.
   for(const [key,value] of Object.entries(state))add(key,value);
   for(let index=0;index<ship.weapons.length;index++){
    const mount=ship.weapons[index],wire=state.weapons[index];
    weapons.push({binding:row.id+'/weapons/'+index,value:mount.weaponSpec});add('weaponDefinition',wire.weaponSpec);
   }
   const wireSystems=[state.system,...state.systems,...state.allSystems,...(ship.defenseSystem?[state.defenseSystem]:[])];
   const displaySystems=[ship.system,...ship.systems,...ship.allSystems,...(ship.defenseSystem?[ship.defenseSystem]:[])];
   systemOccurrences+=displaySystems.length;distinctSystemRoots+=new Set(displaySystems).size;
   uniqueSystemContents+=new Set(wireSystems.map(value=>definitionSignature(value).hash)).size;
   displaySystems.forEach((value:any,index:number)=>{
    systems.push({binding:row.id+'/systems/'+index,value:value.definitionData});add('systemDefinition',wireSystems[index].definitionData);
   });
  }
  const weaponFields=fieldGroups.get('weaponDefinition')??0,systemFields=fieldGroups.get('systemDefinition')??0;
  const sample={requestedShips:count,tick,capitals:frame.ships.length,crafts:frame.crafts.length,binaryBytes:binary.byteLength,
   wireHash:sha(Buffer.from(binary)),totalShipRestoredFields:totalFields,weaponDefinitionFields:weaponFields,systemDefinitionFields:systemFields,
   remainingFields:totalFields-weaponFields-systemFields,fieldGroups:Object.fromEntries(fieldGroups),
   systemsPerShip:{occurrences:systemOccurrences,uniqueContentsSummedPerShip:uniqueSystemContents,distinctRootsSummedPerShip:distinctSystemRoots},
   weaponDefinitions:summarizeDefinitions(weapons,previousWeapons,previousWeaponRoots),systemDefinitions:summarizeDefinitions(systems,previousSystems,previousSystemRoots)};
  assert.ok(sample.remainingFields>=0);samples.push(sample);lastDefinitions=weapons;
  fs.writeFileSync(path.join(out,`sample-${count}-${tick}.json`),JSON.stringify(sample,null,2));
 }
 // Ownership/guard checks deliberately occur after sampling, in this isolated
 // replica only. They do not change authority content or become a timing run.
 const first=lastDefinitions.find(entry=>typeof entry.value.damagePerShot==='number');assert.ok(first);
 const definition=first.value,original=definition.damagePerShot;
 const twin=lastDefinitions.find(entry=>entry.value!==definition&&definitionSignature(entry.value).hash===definitionSignature(definition).hash);assert.ok(twin);
 const twinOriginal=twin.value.damagePerShot;definition.damagePerShot=original+12345;
 definition.auditLocalExtension={sentinel:917};assert.equal(twin.value.damagePerShot,twinOriginal);
 applyLanDisplaySnapshot(replica,lastFrame);assert.equal(definition.damagePerShot,original);assert.deepEqual(definition.auditLocalExtension,{sentinel:917});
 const shipId=first.binding.split('/weapons/')[0],index=Number(first.binding.split('/weapons/')[1]);
 const ship=[...replica.allCapitalShips,...replica.ships].find((value:any)=>value.id===shipId);
 assert.equal(ship.weapons[index].weaponSpec,definition);delete definition.auditLocalExtension;
 const descriptor=Object.getOwnPropertyDescriptor(definition,'damagePerShot')!;let invoked=0;
 try{
  Object.defineProperty(definition,'damagePerShot',{configurable:true,enumerable:true,get(){invoked++;return original;}});
  assert.throws(()=>applyLanDisplaySnapshot(replica,lastFrame),/Display data shadows a read capability/);assert.equal(invoked,0);
 }finally{Object.defineProperty(definition,'damagePerShot',descriptor);}
 contracts.push({ships:count,mutableRoot:true,rootIdentityPreserved:true,localWriteRestored:true,localExtensionPreserved:true,
  identicalContentMountRootsIndependent:true,accessorRejectedWithoutInvocation:true});
}
for(const [file,hash] of assets)assert.equal(sha(fs.readFileSync(file)),hash,'Audit asset changed: '+file);
fs.writeFileSync(path.join(out,'assets.json'),JSON.stringify([...assets].map(([file,sha256])=>({file,sha256})),null,2));
const summary={scope:'Fixed-scene v1 structure/ownership audit, NOT CPU timing, allocation count, LAN latency or all-content compatibility.',
 node:process.version,seed:917,captureEveryTicks:12,checkpoints:[...checkpoints],assetFiles:assets.size,contracts,
 samples:samples.map(({weaponDefinitions:weapons,systemDefinitions:systems,fieldGroups:_fieldGroups,...row})=>({...row,
  weaponDefinitions:{...weapons,definitions:undefined},systemDefinitions:{...systems,definitions:undefined}}))};
fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
