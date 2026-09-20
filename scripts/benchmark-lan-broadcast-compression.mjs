// Real PMD WebSockets, fixed recorded complete states, a separate receiver process.
// Measures broadcast codec/fanout cost, NOT game FPS, WAN RTT or rendering.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import WebSocket, { WebSocketServer } from 'ws';
import * as current from '../server/LanDeltaTransport.mjs';
import { LanBroadcastCompression } from '../server/LanBroadcastCompression.mjs';
import { lanPerMessageDeflate } from '../server/lan-websocket.mjs';
import { LanDeltaReceiver } from '../src/network/LanBinaryDelta.mjs';
const folder = process.argv[2], baselineFile = process.argv[3], output = process.argv[4];
if (!folder || !baselineFile || !output) throw Error('Expected recording directory, frozen baseline module, output JSON');
const baseline = await import(pathToFileURL(path.resolve(baselineFile)));
const manifest = JSON.parse(await fs.readFile(path.join(folder, 'manifest.json'), 'utf8'));
const frames = await Promise.all(manifest.rows.slice(0, 60).map(row => fs.readFile(path.join(folder, row.name))));
assert.equal(frames.length, 60);
const frameSequences=frames.map(bytes=>JSON.parse(bytes.subarray(8,8+bytes.readUInt32LE(4)).toString()).seq);
const stats = xs => ({ mean: xs.reduce((a,b)=>a+b,0)/xs.length, p95: xs.toSorted((a,b)=>a-b)[Math.floor(xs.length*.95)] });
async function trial(optimized) {
  const server = new WebSocketServer({ host:'127.0.0.1', port:0, perMessageDeflate:lanPerMessageDeflate() }); await once(server,'listening');
  const peers=[], clients=[], compression=new LanBroadcastCompression(), errors=[];
  let currentBytes, received=0, onBatch, nativeCalls=0, packetBuilds=0, child;
  try {
    server.on('connection',peer=>{
      peers.push(peer);peer.on('error',e=>errors.push(String(e)));
      const ext=peer._extensions['permessage-deflate'], original=ext.compress;
      ext.compress=function(...args){nativeCalls++;return original.apply(this,args);};
      if(optimized)assert.equal(compression.attach(peer),true);
    });
    child=fork(fileURLToPath(import.meta.url),[folder,baselineFile,output,'--receiver','ws://127.0.0.1:'+server.address().port],{stdio:['ignore','ignore','pipe','ipc'],windowsHide:true});
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('Receiver startup timeout')),10000);
      child.once('error',e=>{clearTimeout(timeout);reject(e);});
      child.on('message',m=>{
        if(m.error){errors.push(m.error);clearTimeout(timeout);reject(Error(m.error));onBatch?.();}
        if(m.ready){clearTimeout(timeout);resolve();}
        if(m.batch){received=m.batch*9;onBatch?.();}
      });
    });
    assert.equal(peers.length,9);
    const codec=optimized?current:baseline, senders=peers.map(()=>new codec.LanDeltaSender({ordered:true,motionReference:true}));
    const batchMs=[], prepareMs=[]; let cpuAt, wallAt, wireAt, callsAt, afterWarm;
    for(let seq=1;seq<=60;seq++) {
      if(seq===13){cpuAt=process.cpuUsage();wallAt=performance.now();wireAt=peers.reduce((n,p)=>n+p._socket.bytesWritten,0);callsAt=nativeCalls;afterWarm=compression.stats();}
      currentBytes=frames[seq-1];
      const started=performance.now(), target=codec.lanDeltaTarget(currentBytes,frameSequences[seq-1]);
      let timeout;
      const done=new Promise((resolve,reject)=>{onBatch=resolve;timeout=setTimeout(()=>reject(Error('Fanout timed out')),5000);});
      const prepareAt=performance.now();
      for(let i=0;i<peers.length;i++){
        assert.equal(peers[i].bufferedAmount,0);
        const choice=senders[i].prepare(target); if(optimized)compression.share(choice.packet);
        peers[i].send(choice.packet);assert.equal(senders[i].commit(choice),true);
      }
      const prepare=performance.now()-prepareAt; packetBuilds+=target.packetBuilds??9;
      try{await done;}finally{clearTimeout(timeout);onBatch=null;}
      assert.deepEqual(errors,[]);
      if(seq>=13){batchMs.push(performance.now()-started);prepareMs.push(prepare);}
    }
    const cpu=process.cpuUsage(cpuAt), wireBytes=peers.reduce((n,p)=>n+p._socket.bytesWritten,0)-wireAt;
    assert.equal(received,540);assert.equal(compression.stats().activeJobs,0);
    return {optimized,frames:48,guests:9,exactDeliveries:received,wallMs:performance.now()-wallAt,cpuMs:(cpu.user+cpu.system)/1000,batchMs:stats(batchMs),prepareMs:stats(prepareMs),nativeCompressions:nativeCalls-callsAt,wireBytes,packetBuilds,
      sharedCompressions:compression.stats().shared-(afterWarm?.shared??0),errors};
  } finally {
    for(const p of [...clients,...peers])p.terminate();await new Promise(r=>server.close(r));
    if(child?.connected)child.disconnect();
    if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill();await exited;}
  }
}
async function receiveFrames(url){
  const clients=[],counts=Array(60).fill(0);
  process.once('disconnect',()=>{for(const client of clients)client.terminate();});
  for(let i=0;i<9;i++){
    const client=new WebSocket(url,{perMessageDeflate:lanPerMessageDeflate()}),receiver=new LanDeltaReceiver({motionReference:true});clients.push(client);let index=0;
    client.on('error',e=>process.send?.({error:String(e)}));
    client.on('message',data=>{try{
      assert.deepEqual(Buffer.from(receiver.decode(data)),frames[index]);
      counts[index]++;if(counts[index]===9)process.send?.({batch:index+1});index++;
    }catch(e){process.send?.({error:String(e)});}});
    await once(client,'open');
  }
  process.send({ready:true});
}
if(process.argv[5]==='--receiver') await receiveFrames(process.argv[6]);
else {
const results=[];
for(const optimized of [false,true,true,false]){const result=await trial(optimized);results.push(result);console.log(JSON.stringify(result));await fs.writeFile(output,JSON.stringify({scope:'ABBA real PMD loopback WS; nine receiver codecs in a SEPARATE process; CPU is sender-only; released fixed recording, no simulation/renderer/n2n/Steam routing; 12 warmup +48 measured complete frames per trial; fully drained batch, not a steady-Hz test',node:process.version,results},null,2));}
assert.ok(results.every(r=>r.wireBytes===results[0].wireBytes),'Sharing must not alter the wire byte volume');

}
