import {ProjectileVisualSender as WireSender,ProjectileVisualReceiver as WireReceiver} from '../src/network/ProjectileVisualCodec.mjs';
import {packProjectileVisual,unpackProjectileVisual} from '../src/network/ProjectileVisualColumns.mjs';
import {ProjectileVisualSender,ProjectileVisualReceiver,withinProjectileVisualBudget} from './lib/projectile-visual-anchor-probe.mjs';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {build} from 'esbuild';import {deflateRawSync} from 'node:zlib';
import {decodeBinaryState} from '../src/network/BinarySnapshot.mjs';
import {ProjectileEventSender,ProjectileEventReceiver} from '../src/network/ProjectileEventStream.mjs';
import {projectProjectileVisual,quantizeProjectileVisual} from '../src/network/ProjectileVisualProjection.mjs';
const folder=process.argv[2],output=process.argv[3];assert.ok(folder&&output,'recording folder + output JSON');
const module=(await build({stdin:{contents:"export {expandSnapshotProjectiles} from './src/network/ProjectileProjection';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'})).outputFiles[0].text;
const {expandSnapshotProjectiles}=await import('data:text/javascript;base64,'+Buffer.from(module).toString('base64'));
const frames=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'))).rows.map(r=>decodeBinaryState(fs.readFileSync(path.join(folder,r.name))).frame);
const rows=frames.map(f=>expandSnapshotProjectiles(f)),duration=(frames.at(-1).tick-frames[0].tick)/60;
const avg=a=>a.reduce((s,v)=>s+v,0)/a.length,q=(a,p)=>a.toSorted((a,b)=>a-b)[Math.floor((a.length-1)*p)];const results=[];
for(const stride of [1,3,6,12])for(const visual of (process.argv.includes('--wire-only')?['wire']:[false,true,'quantized','anchors','packed','residual','wire'])){
 const sender=visual==='wire'?new WireSender('paired'):visual==='anchors'?new ProjectileVisualSender('paired'):new ProjectileEventSender('paired',{referenceSteps:visual!=='packed',visualColumns:visual==='residual'}),receiver=visual==='wire'?new WireReceiver('paired'):visual==='anchors'?new ProjectileVisualReceiver('paired'):new ProjectileEventReceiver('paired'),bytes=[],ms=[],decode=[],counts={created:0,changed:0,removed:0};
 for(let i=0;i<frames.length;i+=stride){const f=frames[i],projected=visual==='wire'?rows[i]:visual?rows[i].map(visual==='quantized'?quantizeProjectileVisual:['packed','residual'].includes(visual)?packProjectileVisual:projectProjectileVisual):rows[i],at=performance.now();const c=sender.prepare({tick:f.tick,time:f.world.combatTime,rows:projected});ms.push(performance.now()-at);
  const decodeStart=performance.now(),back=receiver.receive(c.bytes);decode.push(performance.now()-decodeStart);if(visual==='anchors'){const display=receiver.sample(f.tick,f.world.combatTime);assert.equal(display.length,projected.length);for(let n=0;n<display.length;n++)assert.ok(withinProjectileVisualBudget(display[n],projected[n]),'visual budget '+i+'/'+n);}else if(visual==='wire')assert.deepEqual(back.rows,projected.map(r=>unpackProjectileVisual(packProjectileVisual(r))));else assert.deepEqual(back.rows,projected);assert.ok(sender.commit(c));if(i){bytes.push(deflateRawSync(c.bytes,{level:1,memLevel:7}).length);for(const k of Object.keys(counts))counts[k]+=c.stats[k];}
 }
 const row={hz:60/stride,visual,updates:bytes.length,compressedMeanBytes:avg(bytes),bytesPerSecond:bytes.reduce((s,v)=>s+v,0)/duration,prepareMs:{p50:q(ms,.5),p95:q(ms,.95)},decodeMs:{p50:q(decode,.5),p95:q(decode,.95)},...counts};results.push(row);console.log(JSON.stringify(row));
}
fs.writeFileSync(output,JSON.stringify({scope:'Same 22-ship recording, anchored trajectories verified within published display bounds; exact and bounded-display-quantized visual subsets vs complete projectile records, actual deflate bytes after baseline, no network/rate/rendering claim. Wire mode times include visual field selection/integer packing and receiver unpacking, but exclude native capture and zlib; other mode timings exclude projection. Mine FX, beams and target indicators not covered; cannot remove all bulk projectiles.',results},null,2));
