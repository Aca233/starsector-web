// All values are verified after each independent entity revision. Byte figures
// are actual deflate output, not estimates from raw JSON or an asserted line rate.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {build} from 'esbuild';import {deflateRawSync} from 'node:zlib';
import {decodeBinaryState,encodeProjectedBinaryFrame,encodeBinaryState} from '../src/network/BinarySnapshot.mjs';
import {LanDeltaSender,lanDeltaTarget} from '../server/LanDeltaTransport.mjs';
import {ProjectileEventSender,ProjectileEventReceiver} from '../src/network/ProjectileEventStream.mjs';
const folder=process.argv[2],output=process.argv[3];assert.ok(folder&&output,'recording folder and output JSON required');
const module=(await build({stdin:{contents:"export {expandSnapshotProjectiles} from './src/network/ProjectileProjection';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'})).outputFiles[0].text;
const {expandSnapshotProjectiles}=await import('data:text/javascript;base64,'+Buffer.from(module).toString('base64'));
const frames=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'))).rows.map(r=>decodeBinaryState(fs.readFileSync(path.join(folder,r.name))).frame);
const rows=frames.map(f=>expandSnapshotProjectiles(f)),strip=f=>({...f,world:Object.fromEntries(Object.entries(f.world).filter(([k])=>k!=='projectiles'))});
const zip=b=>deflateRawSync(b,{level:1,memLevel:7}).length,q=(a,p)=>a.toSorted((a,b)=>a-b)[Math.floor((a.length-1)*p)];
const duration=(frames.at(-1).tick-frames[0].tick)/60,results=[];
for(const stride of [1,3,6,12,30]){
 const event=new ProjectileEventSender('replay'),receiver=new ProjectileEventReceiver('replay'),legacy=new LanDeltaSender({ordered:true,motionReference:true}),detail=new LanDeltaSender({ordered:true,motionReference:true});
 const timing=[],restore=[],eventBytes=[],legacyBytes=[],detailBytes=[],created=[],changed=[];
 for(let i=0;i<frames.length;i+=stride){const f=frames[i],at=performance.now(),c=event.prepare({tick:f.tick,time:f.world.combatTime,rows:rows[i]});timing.push(performance.now()-at);
  const start=performance.now(),back=receiver.receive(c.bytes);restore.push(performance.now()-start);assert.deepEqual(back.rows,rows[i]);assert.ok(event.commit(c));
  const before=encodeBinaryState('replay',i+1,encodeProjectedBinaryFrame(f,true)),after=encodeBinaryState('replay',i+1,encodeProjectedBinaryFrame(strip(f),true));
  const a=legacy.prepare(lanDeltaTarget(before,i+1)),b=detail.prepare(lanDeltaTarget(after,i+1));assert.ok(legacy.commit(a));assert.ok(detail.commit(b));
  if(i){eventBytes.push(zip(c.bytes));legacyBytes.push(zip(a.packet));detailBytes.push(zip(b.packet));created.push(c.stats.created);changed.push(c.stats.changed);}
 }
 const sum=a=>a.reduce((a,b)=>a+b,0),avg=a=>sum(a)/a.length;
 results.push({stride,hz:60/stride,frames:eventBytes.length,projectiles:{min:Math.min(...rows.map(r=>r.length)),max:Math.max(...rows.map(r=>r.length))},
  bytesPerUpdate:{legacy:avg(legacyBytes),detailWithoutProjectiles:avg(detailBytes),projectileEvents:avg(eventBytes)},bytesPerSecond:{legacy:sum(legacyBytes)/duration,detailWithoutProjectiles:sum(detailBytes)/duration,projectileEvents:sum(eventBytes)/duration},
  prepareMs:{p50:q(timing,.5),p95:q(timing,.95)},decodeMs:{p50:q(restore,.5),p95:q(restore,.95)},spawned:sum(created),updated:sum(changed),retained:event.stats(),verified:true});
}
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({scope:'22-ship recording, lossless projectile revision verification and measured deflate bytes; not network Hz or browser rendering. Complete-world detail excludes projectiles only in this probe. First baseline excluded from rates.',durationSeconds:duration,results},null,2));console.log(JSON.stringify(results,null,2));
