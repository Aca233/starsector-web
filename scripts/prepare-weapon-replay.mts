// Reconstruct the exact recorded native Web world before extracting a component;
// never invent per-slot spec identities missing from the projected snapshot.
import fs from 'node:fs';import path from 'node:path';
import {assetManager} from '../src/engine/assets/AssetResolver';import {createLanWorld} from '../src/network/LanWorld';
import {applyCombatSnapshot} from '../src/network/AuthorityCombatSnapshot';import {decodeBinaryState} from '../src/network/BinarySnapshot.mjs';
import {captureCriticalCombat} from '../src/network/CriticalCombatReplica';import {decodeCombatState} from '../src/network/CriticalCombatState.mjs';
const [directory,output]=process.argv.slice(2);if(!directory||!output)throw Error('recording-dir output.json required');
const root=path.resolve('public');globalThis.fetch=async(input:any)=>{const p=path.resolve(root,String(input).replace(/^\//,''));if(!p.startsWith(root+path.sep))throw Error('Outside assets');return new Response(fs.readFileSync(p));};await assetManager.ensureManifestLoaded();
const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8')),engine=createLanWorld(manifest.match).engine;
const rows=manifest.rows.map((row:any)=>{const frame=decodeBinaryState(fs.readFileSync(path.join(directory,row.name))).frame;applyCombatSnapshot(engine,frame,false);
 const data=captureCriticalCombat(engine,frame.tick,true)!;const component=decodeCombatState(data);if(!component.weapons)throw Error('Missing weapon section at '+frame.tick);
 return {name:row.name,tick:row.tick,data:Buffer.from(data).toString('base64')};});
fs.writeFileSync(output,JSON.stringify({scope:'Native Web restoration of the SAME recorded worlds; exact component bytes, identities from recorded match content. Not a new simulation or rendering run.',recording:path.resolve(directory),matchId:manifest.match.id,rows},null,2));console.log(JSON.stringify({frames:rows.length,ships:engine.allCapitalShips.length,output}));
