import fs from 'node:fs';import path from 'node:path';import {deflateRawSync} from 'node:zlib';
import {assetManager} from '../src/engine/assets/AssetResolver';
import {createLanWorld} from '../src/network/LanWorld';
import {configureHostCosmetics,captureAuthorityCombat} from '../src/network/HostSnapshot';
import {encodeBinaryState,encodeProjectedBinaryFrame} from '../src/network/BinarySnapshot.mjs';
import {applyCombatSnapshot} from '../src/network/AuthorityCombatSnapshot';
import {decodeBinaryState} from '../src/network/BinarySnapshot.mjs';
import {Vector2} from '../src/engine/math/Vector2';
import {withoutBulkProjectiles} from '../src/network/ProjectileBulkVariant.mjs';
const root=path.resolve('public');globalThis.fetch=async input=>new Response(fs.readFileSync(path.resolve(root,String(input).replace(/^\//,''))));await assetManager.ensureManifestLoaded();
const old=JSON.parse(fs.readFileSync('artifacts/network-latency-phase5-20260920/frames22/manifest.json','utf8')),match=old.match,e=createLanWorld(match).engine,m=configureHostCosmetics(e,true,true);
const out=process.env.PARTICLE_RECORDING_DIR || 'artifacts/network-stream-20260921/particle-paired-exact',records=[[],[]] as any[][],times=[[],[]] as number[][],sizes=[[],[]] as any[][];
const viewers=[createLanWorld(match).engine,createLanWorld(match).engine], applyTimes=[[],[]] as number[][], encodeTimes=[[],[]] as number[][];
for(const mode of ['ordinary','recipe'])fs.mkdirSync(path.join(out,mode),{recursive:true});
for(let tick=0;tick<=840;tick++){
 if(tick)e.fixedUpdate(1/60);if(tick<600)continue;
 for(const mode of [tick%2,1-tick%2]){
  const at=performance.now(),frame=captureAuthorityCombat(e,tick,{0:tick,1:tick},0,m,!!mode);times[mode].push(performance.now()-at);
  const encodeAt=performance.now();
  const bytes=encodeBinaryState(match.id,tick,encodeProjectedBinaryFrame(frame)!),compact=encodeBinaryState(match.id,tick,encodeProjectedBinaryFrame(withoutBulkProjectiles(frame))!);
  encodeTimes[mode].push(performance.now()-encodeAt);
  const decoded=decodeBinaryState(bytes)!.frame, applyAt=performance.now();applyCombatSnapshot(viewers[mode],decoded,false);applyTimes[mode].push(performance.now()-applyAt);
  const name=String(tick)+'.bin';fs.writeFileSync(path.join(out,mode?'recipe':'ordinary',name),bytes);records[mode].push({name,tick});sizes[mode].push({raw:bytes.length,full:deflateRawSync(bytes,{level:1}).length,compact:deflateRawSync(compact,{level:1}).length});
 }
}
const q=(xs:number[],f:number)=>xs.toSorted((a,b)=>a-b)[Math.floor((xs.length-1)*f)],result:any[]=[];
for(let mode=0;mode<2;mode++){
 fs.writeFileSync(path.join(out,mode?'recipe':'ordinary','manifest.json'),JSON.stringify({scope:'Same native 22-ship authority, exact paired full state; only dynamic particle representation differs. No network/FPS assertion.',match,rows:records[mode]},null,2));
 result.push({mode:mode?'recipe':'ordinary',captureMs:{p50:q(times[mode],.5),p95:q(times[mode],.95)},applyMs:{p50:q(applyTimes[mode],.5),p95:q(applyTimes[mode],.95)},encodeFullAndCompactMs:{p50:q(encodeTimes[mode],.5),p95:q(encodeTimes[mode],.95)},mean:Object.fromEntries(['raw','full','compact'].map(k=>[k,sizes[mode].reduce((n,r)=>n+r[k],0)/sizes[mode].length]))});
}
fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));

// Cross-runtime fixtures contain all particle families in camera, ordinary and
// recipe binaries from the SAME authority. Browser tests must not regenerate
// both sides using browser math, which would conceal Node/Chromium drift.
const fixtureMatch={...match,id:'particle-browser',players:match.players.slice(0,2),options:{...match.options,aiHulls:[[],[]]}},f=createLanWorld(fixtureMatch).engine,fm=configureHostCosmetics(f,true,true);
f.playerShip.pos.set(0,0);
f.fxSystem.spawnArmorDamageSparks(f.playerShip,new Vector2(0,0),100);
f.fxSystem.spawnDebris(new Vector2(0,0),25,[140,100,80],70,'large');
f.fxSystem.spawnSparks(new Vector2(-55,0),60,[255,200,100]);
f.fxSystem.spawnExplosion(new Vector2(55,0),60);
const fixtureRows=[];
for(let tick=0;tick<=120;tick++){
 if(tick)f.fxSystem.update(1/60);if(![0,1,17,43,90,120].includes(tick))continue;
 for(const mode of ['ordinary','recipe']){
  const bytes=encodeBinaryState(fixtureMatch.id,tick,encodeProjectedBinaryFrame(captureAuthorityCombat(f,tick,{},0,fm,mode==='recipe'))!);
  fs.writeFileSync(path.join(out,mode,'fixture-'+tick+'.bin'),bytes);
 }
 fixtureRows.push({tick,name:'fixture-'+tick+'.bin'});
}
fs.writeFileSync(path.join(out,'fixtures.json'),JSON.stringify({match:fixtureMatch,rows:fixtureRows}));
