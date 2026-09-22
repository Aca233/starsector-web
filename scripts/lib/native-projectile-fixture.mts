import fs from 'node:fs';import path from 'node:path';
import {assetManager} from '../../src/engine/assets/AssetResolver';
import {createLanWorld} from '../../src/network/LanWorld';
import {configureHostCosmetics} from '../../src/network/HostSnapshot';
export async function assets(){const root=path.resolve('public');globalThis.fetch=async(input:any)=>{const file=path.resolve(root,String(input).replace(/^\//,''));if(!file.startsWith(root+path.sep))throw Error('Outside assets');return new Response(fs.readFileSync(file));};await assetManager.ensureManifestLoaded();}
export function world(count=22){const e=createLanWorld({id:'native-projectile',seed:917,hostId:'p0',snapshotHz:60,players:[{id:'p0',seat:0,team:0,hull:'onslaught'},{id:'p1',seat:1,team:1,hull:'onslaught'}],options:{assignment:'teams',battleSize:3200,aiHulls:[Array(Math.floor((count-2)/2)).fill('hammerhead'),Array(Math.ceil((count-2)/2)).fill('hammerhead')]}} as any).engine;configureHostCosmetics(e,true,true,true);return e;}
