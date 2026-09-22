import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {test} from 'node:test';
import {motionFromText} from '../src/network/MotionFrame.mjs';
const base=path.resolve('artifacts/network-stream-20260921');
const define={__LAN_BUILD_ID__:'"motion-authority-test"','import.meta.env':'{"BASE_URL":"/","DEV":false,"VITE_LAN_LAYERED_SYNC":"true"}'};
for(const [source,name] of [['scripts/check-motion-authority.mts','motion-capture.mjs'],['server/authority-worker.mjs','motion-authority.worker.mjs']]){
 const r=await build({entryPoints:[source],outfile:path.join(base,name),bundle:true,platform:'node',format:'esm',packages:'external',metafile:true,define,logLevel:'warning'});
 assert.ok(!Object.keys(r.metafile.inputs).some(p=>p.startsWith('src/campaign/')));
}
await import(pathToFileURL(path.join(base,'motion-capture.mjs')).href);
test('real authority continues fresh critical ticks while bulk IPC credit is held; wrong motion receipt never frees credit',async()=>{
 const match={id:'motion-worker',hostId:'host',seed:157,snapshotHz:60,players:[{id:'host',seat:0,team:0,hull:'onslaught'},{id:'guest',seat:1,team:1,hull:'onslaught'}],options:{assignment:'teams',battleSize:3200,aiHulls:[[],[]]}};
 const worker=new Worker(path.join(base,'motion-authority.worker.mjs'),{workerData:{assets:path.resolve('public'),match}});
 let timeout,holdTimer,count=0,last=-1,bulkTick=null,bulkCount=0,held=null,verifiedWrongAck=false;
 try{
  await new Promise((resolve,reject)=>{
   timeout=setTimeout(()=>reject(Error('real motion Worker timeout')),20000);worker.on('error',reject);
   worker.on('message',m=>{try{
    if(m.type==='error')throw Error(m.message);
    if(m.type==='ready'){worker.postMessage({type:'motion-mode',enabled:true});worker.postMessage({type:'start'});}
    if(m.type==='snapshot'){bulkCount++;bulkTick??=m.tick;if(verifiedWrongAck&&bulkCount===2){assert.ok(m.tick>bulkTick);resolve();}return;}
    if(m.type!=='motion')return;
    const f=motionFromText(m.data);assert.equal(f.tick,m.tick);assert.ok(f.tick>last);last=f.tick;count++;assert.ok(f.ships.length===2);
    if(count===5){held=m.tick;worker.postMessage({type:'motion-consumed',tick:m.tick+999});holdTimer=setTimeout(()=>{try{assert.equal(count,5);verifiedWrongAck=true;worker.postMessage({type:'motion-consumed',tick:held});}catch(e){reject(e);}},120);return;}
    worker.postMessage({type:'motion-consumed',tick:m.tick});
    if(count===25){assert.equal(bulkCount,1);assert.ok(f.tick>bulkTick+10);worker.postMessage({type:'snapshot-consumed',tick:bulkTick});}
   }catch(error){reject(error);}});
  });
 }finally{clearTimeout(timeout);clearTimeout(holdTimer);await worker.terminate();}
});

test('real authority visual mailbox is independent of bulk credit, bounded and released only by its exact publication tick',async()=>{
 const match={id:'visual-worker',hostId:'host',seed:157,snapshotHz:60,players:[{id:'host',seat:0,team:0,hull:'onslaught'},{id:'guest',seat:1,team:1,hull:'onslaught'}],options:{assignment:'teams',battleSize:3200,aiHulls:[[],[]]}};
 const worker=new Worker(path.join(base,'motion-authority.worker.mjs'),{workerData:{assets:path.resolve('public'),match}});
 const {AnchoredProjectileReceiver}=await import('../src/network/AnchoredProjectileVisual.mjs');const receiver=new AnchoredProjectileReceiver(match.id);
 let timeout,holdTimer,count=0,last=-1,bulkCount=0,held,checked=false;
 try{await new Promise((resolve,reject)=>{
  timeout=setTimeout(()=>reject(Error('real visual Worker timeout')),20000);worker.on('error',reject);
  worker.on('message',m=>{try{
   if(m.type==='error'||m.type==='visual-unavailable')throw Error(m.message??m.reason);
   if(m.type==='ready'){worker.postMessage({type:'visual-mode',enabled:true});worker.postMessage({type:'start'});}
   if(m.type==='snapshot'){bulkCount++;return;}
   if(m.type!=='projectile-visual')return;
   const p=m.publication;assert.equal(p.tick,m.tick);assert.ok(p.tick>last);last=p.tick;count++;receiver.baseline(p.key,p.baseline);if(p.update)receiver.update(p.key,p.update);assert.equal(receiver.stats().tick,p.tick);
   if(count===4){held=m.tick;worker.postMessage({type:'visual-consumed',tick:m.tick+999});holdTimer=setTimeout(()=>{try{assert.equal(count,4);checked=true;worker.postMessage({type:'visual-consumed',tick:held});}catch(e){reject(e);}},150);return;}
   worker.postMessage({type:'visual-consumed',tick:m.tick});
   if(count===10){assert.ok(checked);assert.equal(bulkCount,1,'full world IPC still held');assert.ok(last>=24);resolve();}
  }catch(e){reject(e);}});
 });}finally{clearTimeout(timeout);clearTimeout(holdTimer);await worker.terminate();}
});
import { decodeCombatState } from '../src/network/CriticalCombatState.mjs';
test('real authority combat mailbox advances with bulk held, wrong tick cannot free it, disabling stops production',async()=>{
 const match={id:'combat-worker',hostId:'host',seed:157,snapshotHz:60,players:[{id:'host',seat:0,team:0,hull:'onslaught'},{id:'guest',seat:1,team:1,hull:'onslaught'}],options:{assignment:'teams',battleSize:3200,aiHulls:[[],[]]}};
 const worker=new Worker(path.join(base,'motion-authority.worker.mjs'),{workerData:{assets:path.resolve('public'),match}});let timeout,holdTimer,stopTimer,count=0,bulkCount=0,last=-1;
 try{await new Promise((resolve,reject)=>{
  timeout=setTimeout(()=>reject(Error('combat Worker timeout')),20000);worker.on('error',reject);
  worker.on('message',m=>{try{
   if(m.type==='error')throw Error(m.message);
   if(m.type==='ready'){worker.postMessage({type:'combat-mode',enabled:true});worker.postMessage({type:'start'});}
   if(m.type==='snapshot'){bulkCount++;return;}
   if(m.type!=='combat-state')return;
   const f=decodeCombatState(new Uint8Array(m.data));assert.equal(f.tick,m.tick);assert.ok(f.tick>last);assert.equal(f.ships.length,2);last=f.tick;count++;
   if(count===3){worker.postMessage({type:'combat-consumed',tick:m.tick+999});holdTimer=setTimeout(()=>{try{assert.equal(count,3);worker.postMessage({type:'combat-consumed',tick:m.tick});}catch(e){reject(e);}},150);return;}
   if(count===8){assert.equal(bulkCount,1);worker.postMessage({type:'combat-mode',enabled:false});worker.postMessage({type:'combat-consumed',tick:m.tick});stopTimer=setTimeout(()=>{try{assert.equal(count,8);resolve();}catch(e){reject(e);}},150);return;}
   worker.postMessage({type:'combat-consumed',tick:m.tick});
  }catch(e){reject(e);}});
 });}finally{clearTimeout(timeout);clearTimeout(holdTimer);clearTimeout(stopTimer);await worker.terminate();}
});
