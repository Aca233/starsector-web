import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
import {deflateRawSync} from 'node:zlib';
import {decodeBinaryState} from '../src/network/BinarySnapshot.mjs';
import {AnchoredProjectilePublisher,AnchoredProjectileReceiver} from '../src/network/AnchoredProjectileVisual.mjs';
import {ProjectileVisualSender,ProjectileVisualReceiver} from '../src/network/ProjectileVisualCodec.mjs';
import {packProjectileVisual,unpackProjectileVisual} from '../src/network/ProjectileVisualColumns.mjs';
const [folder,output]=process.argv.slice(2);assert.ok(folder&&output,'recording folder + output JSON');
const module=(await build({stdin:{contents:"export {expandSnapshotProjectiles} from './src/network/ProjectileProjection';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'})).outputFiles[0].text;
const {expandSnapshotProjectiles}=await import('data:text/javascript;base64,'+Buffer.from(module).toString('base64'));
const frames=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'))).rows.map(r=>decodeBinaryState(fs.readFileSync(path.join(folder,r.name))).frame);
const rows=frames.map(expandSnapshotProjectiles),duration=(frames.at(-1).tick-frames[0].tick)/60;
const q=(a,p)=>a.toSorted((a,b)=>a-b)[Math.floor((a.length-1)*p)],results=[];
for(const stride of [3,6])for(const anchored of [false,true]){
 const sender=anchored?new AnchoredProjectilePublisher('paired'):new ProjectileVisualSender('paired');
 const guests=Array.from({length:5},()=>anchored?new AnchoredProjectileReceiver('paired'):new ProjectileVisualReceiver('paired'));
 const prepare=[],decode=[],raw=[],compressed=[];let baseBytes=0,updateBytes=0,lastKey=0,baselineCount=0,encodeCount=0,decodeCount=0;
 for(let i=0;i<frames.length;i+=stride){
  const f=frames[i],input={tick:f.tick,time:f.world.combatTime,rows:rows[i]},start=performance.now();
  let c;try{c=anchored?sender.publish(input):sender.prepare(input);}catch(e){console.log(JSON.stringify({failedAt:i,tick:f.tick,entities:rows[i].length,rawBaseline:new ProjectileVisualSender("probe").prepare(input).bytes.length,publisher:sender.stats()}));throw e;}prepare.push(performance.now()-start);encodeCount++;
  const packets=anchored?(c.key!==lastKey?[c.baseline,...(c.update?[c.update]:[])]:[c.update]):[c.bytes];
  if(anchored&&c.key!==lastKey){baselineCount++;baseBytes+=deflateRawSync(c.baseline,{level:1,memLevel:7}).length;lastKey=c.key;}
  for(const packet of packets){assert.ok(packet);raw.push(packet.length);const n=deflateRawSync(packet,{level:1,memLevel:7}).length;compressed.push(n);if(!anchored||packet===c.update)updateBytes+=n;}
  const expected=rows[i].map(r=>unpackProjectileVisual(packProjectileVisual(r)));
  for(let n=0;n<guests.length;n++){
   // Healthy, skipped, stalled, and late-joining consumers. Non-anchored chain
   // cannot skip, so is measured with healthy consumers only.
   if(anchored&&((n===1&&i%(stride*3))||(n===2&&i>30&&i<120)||(n===3&&i<90)||(n===4&&i%(stride*7))))continue;
   const rx=guests[n],at=performance.now();let back;
   if(anchored){if(rx.stats().key!==c.key)back=rx.baseline(c.key,c.baseline);if(c.update)back=rx.update(c.key,c.update);}else back=rx.receive(c.bytes);
   decode.push(performance.now()-at);decodeCount++;assert.deepEqual(back.rows,expected);
  }
  if(!anchored)assert.ok(sender.commit(c));
 }
 const result={hz:60/stride,anchored,publications:encodeCount,decodeCount,baselineCount,baselineCompressedBytes:baseBytes,updateCompressedBytes:updateBytes,compressedBytesPerSecondIncludingBaselines:compressed.reduce((a,b)=>a+b,0)/duration,rawMax:Math.max(...raw),rawP95:q(raw,.95),prepareMs:{p50:q(prepare,.5),p95:q(prepare,.95)},decodeMs:{p50:q(decode,.5),p95:q(decode,.95)},publisher:anchored?sender.stats():null};results.push(result);console.log(JSON.stringify(result));
}
fs.writeFileSync(output,JSON.stringify({scope:'Single room encoding on recorded 22-ship battle, all periodic baselines counted. Five consumers with skipped updates/stall/late join for anchored mode. Includes field projection/pack/unpack, excludes capture, compression CPU, transport and GPU. Bytes per guest, not aggregate room. No production integration or real network acceptance claim.',duration,results},null,2));

