import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {deflateRawSync} from 'node:zlib';
import {decodeBinaryState,encodeBinaryState,encodeProjectedBinaryFrame} from '../src/network/BinarySnapshot.mjs';
import {withoutBulkProjectiles} from '../src/network/ProjectileBulkVariant.mjs';
import {LanDeltaSender,lanDeltaTarget} from '../server/LanDeltaTransport.mjs';
const [folder,out]=process.argv.slice(2);assert.ok(folder&&out);
const frames=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'))).rows.map(r=>decodeBinaryState(fs.readFileSync(path.join(folder,r.name))).frame),results=[];
for(const stride of [3,6,12,30])for(const compact of [false,true]){
 const sender=new LanDeltaSender({ordered:true,motionReference:true}),raw=[],compressed=[],delta=[],timing=[];
 for(let i=0,seq=1;i<frames.length;i+=stride,seq++){
  const full=frames[i],frame=compact?withoutBulkProjectiles(full):full;
  if(compact){assert.deepEqual({...frame.world,projectiles:full.world.projectiles},full.world);assert.equal(frame.ships,full.ships);assert.equal(frame.muzzleEvents,full.muzzleEvents);}
  const start=performance.now(),bytes=encodeBinaryState('measure',seq,encodeProjectedBinaryFrame(frame)),choice=sender.prepare(lanDeltaTarget(bytes,seq));sender.commit(choice);timing.push(performance.now()-start);
  raw.push(bytes.length);compressed.push(deflateRawSync(bytes,{level:1,memLevel:7}).length);delta.push(deflateRawSync(choice.packet,{level:1,memLevel:7}).length);
 }
 const mean=a=>a.reduce((x,y)=>x+y,0)/a.length,q=(a,p)=>a.toSorted((x,y)=>x-y)[Math.floor((a.length-1)*p)];
 const r={hz:60/stride,compact,frames:raw.length,meanRawBytes:mean(raw),meanCompressedFull:mean(compressed),meanCompressedDelta:mean(delta),codecMs:{p50:q(timing,.5),p95:q(timing,.95)}};results.push(r);console.log(JSON.stringify(r));
}
fs.writeFileSync(out,JSON.stringify({scope:'Paired recorded world variant: only bulk projectiles empty, all other state identical. Includes baselines, synthetic ordered delta, no transport/renderer/Hz claim; visual stream bytes not included.',results},null,2));
