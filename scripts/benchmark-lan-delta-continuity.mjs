// Fixed-recording, exact-byte comparison. No simulation/render/n2n/Valve claim.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {deflateRawSync,constants} from 'node:zlib';
import {build} from 'esbuild';
import {WebSocketServer,WebSocket} from 'ws';
import {once} from 'node:events';
import {lanPerMessageDeflate} from '../server/lan-websocket.mjs';
import {LanStateCredits} from '../server/LanStateCredits.mjs';
const [folder,baselineFile,outDir]=process.argv.slice(2);
assert.ok(folder&&baselineFile&&outDir,'Usage: recording-dir frozen-LanBinaryDelta-file output-dir');
await fs.mkdir(outDir,{recursive:true});
const baseline=await fs.readFile(baselineFile,'utf8');
const entries=`export {LanDeltaSender,lanDeltaTarget} from './server/LanDeltaTransport.mjs';
export {LanDeltaReceiver} from './src/network/LanBinaryDelta.mjs';
export {decodeBinaryState} from './src/network/BinarySnapshot.mjs';
export {SteamBinarySnapshotSender,SteamBinarySnapshotEncoder,SteamBinarySnapshotReceiver} from './server/steam/binary-snapshot.mjs';
export {SteamPacketCodec} from './server/steam/packet-codec.mjs';`;
const versions={};
for(const name of ['before','after']){
 const file=path.resolve(outDir,name+'.mjs');
 await build({stdin:{contents:entries,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',packages:'external',outfile:file,logLevel:'silent',
  plugins:name==='before'?[{name:'frozen-matcher',setup(b){b.onLoad({filter:/[\\/]src[\\/]network[\\/]LanBinaryDelta\.mjs$/},args=>({contents:baseline,resolveDir:path.dirname(args.path),loader:'js'}));}}]:[]});
 versions[name]=await import(pathToFileURL(file));
}
const manifest=JSON.parse(await fs.readFile(path.join(folder,'manifest.json'),'utf8'));
const frames=await Promise.all(manifest.rows.map(r=>fs.readFile(path.join(folder,r.name))));
const states=frames.map(f=>versions.after.decodeBinaryState(f)),canonical=states.map(s=>JSON.stringify(s));
const mean=a=>a.reduce((n,v)=>n+v,0)/a.length;
const stats=a=>({mean:mean(a),p95:a.toSorted((a,b)=>a-b)[Math.floor(a.length*.95)]});
const pmd=bytes=>{const data=deflateRawSync(bytes,{level:1,memLevel:7,chunkSize:16384,finishFlush:constants.Z_SYNC_FLUSH});const n=data.length-4;return n+(n<126?2:n<65536?4:10);};
function trial(name){
 const c=versions[name],r=new versions.before.LanDeltaReceiver({motionReference:true}),s=new c.LanDeltaSender({ordered:true,motionReference:true});
 const steam=new c.SteamBinarySnapshotSender(),encoder=new c.SteamBinarySnapshotEncoder(),codec=new c.SteamPacketCodec({binaryStates:true}),decoder=new versions.before.SteamPacketCodec({binaryStates:true}),sr=new versions.before.SteamBinarySnapshotReceiver();
 let lanWire=0,steamWire=0,rawPatch=0,exact=0;const lanMs=[],steamMs=[],receiveMs=[];
 for(let i=0;i<frames.length;i++){
  const at=performance.now(),choice=s.prepare(c.lanDeltaTarget(frames[i],states[i].seq,i*1000/60));s.commit(choice);
  const wire=pmd(choice.packet);lanMs.push(performance.now()-at);
  const receivedAt=performance.now();assert.deepEqual(Buffer.from(r.decode(choice.packet)),frames[i]);receiveMs.push(performance.now()-receivedAt);
  const steamAt=performance.now(),sc=steam.prepare({state:states[i],bytes:frames[i]},encoder,codec,i*1000/60),framed=codec.frame('a'.repeat(32),'data',sc.prepared);assert.equal(steam.commit(sc),true);steamMs.push(performance.now()-steamAt);
  let result;for(const p of framed.packets)result=decoder.receive('peer',p)??result;
  const restored=sr.receive(result.data);assert.equal(restored.canonicalText,canonical[i]);assert.deepEqual(Buffer.from(restored.binaryState),frames[i]);exact+=2;
  if(i>=30){lanWire+=wire;steamWire+=framed.packets.reduce((n,p)=>n+p.length,0);rawPatch+=choice.packet.length;}
 }
 return {name,measuredFrames:frames.length-30,exactStates:exact,lanWireBytes:lanWire,steamWireBytes:steamWire,patchBytes:rawPatch,lanPrepareAndDeflateMs:stats(lanMs.slice(30)),steamPrepareAndDeflateMs:stats(steamMs.slice(30)),lanRestoreAndVerifyMs:stats(receiveMs.slice(30))};
}
// Separate deterministic service model: unchanged credit code, 60Hz offered,
// fixed 68ms idle RTT, FIFO bandwidth, 2ms consumer. CPU is NOT simulated.
function constrained(name,mbps){
 const c=versions[name],r=new versions.before.LanDeltaReceiver({motionReference:true}),s=new c.LanDeltaSender({ordered:true,motionReference:true});
 let now=0,linkFree=0,skipped=0,wire=0;const queue=[],received=[],ages=[];
 const credits=new LanStateCredits({now:()=>now});credits.recordNetworkRtt(68);
 const advance=until=>{while(queue.length&&queue[0].at<=until){const e=queue.shift();now=e.at;if(e.kind==='receive'){
   assert.deepEqual(Buffer.from(r.decode(e.choice.packet)),frames[e.index]);received.push(now);ages.push(now-e.sent);
  }else{assert.equal(credits.ack(e.seq),true);s.ack(e.seq);}}now=until;};
 for(let i=0;i<frames.length;i++){
  advance(i*1000/60);if(!credits.reserve(states[i].seq,frames[i].length)){skipped++;continue;}
  const choice=s.prepare(c.lanDeltaTarget(frames[i],states[i].seq,now));assert.equal(s.commit(choice),true);
  const n=pmd(choice.packet);wire+=n;linkFree=Math.max(linkFree,now)+n*8/(mbps*1000);
  const arrival=linkFree+34;queue.push({kind:'receive',at:arrival,choice,index:i,sent:now},{kind:'ack',at:arrival+36,seq:states[i].seq});queue.sort((a,b)=>a.at-b.at);
 }
 const end=(frames.length-1)*1000/60;advance(Infinity);assert.equal(credits.stats().inflight,0);
 return {name,mbps,offeredSeconds:end/1000,exactStates:received.length,skipped,wireBytes:wire,receiveHzAfter1s:received.filter(t=>t>=1000&&t<end).length/((end-1000)/1000),snapshotArrivalAgeMs:stats(ages)};
}
async function liveWire(name){
 const c=versions[name],server=new WebSocketServer({host:'127.0.0.1',port:0,perMessageDeflate:lanPerMessageDeflate()});
 await once(server,'listening');let client,peer;const errors=[];
 try{
  const connected=once(server,'connection');client=new WebSocket('ws://127.0.0.1:'+server.address().port,{perMessageDeflate:lanPerMessageDeflate()});
  const opened=once(client,'open');[peer]=await connected;await opened;
  peer.on('error',e=>errors.push(String(e)));client.on('error',e=>errors.push(String(e)));
  const sender=new c.LanDeltaSender({ordered:true,motionReference:true}),receiver=new versions.before.LanDeltaReceiver({motionReference:true});let start,expected=0;
  for(let i=0;i<frames.length;i++){
   if(i===30)start=peer._socket.bytesWritten;
   const choice=sender.prepare(c.lanDeltaTarget(frames[i],states[i].seq,i*1000/60));
   const incoming=once(client,'message',{signal:AbortSignal.timeout(5000)});peer.send(choice.packet);assert.equal(sender.commit(choice),true);
   const [bytes]=await incoming;assert.deepEqual(Buffer.from(receiver.decode(bytes)),frames[i]);if(i>=30)expected+=pmd(choice.packet);
  }
  const bytes=peer._socket.bytesWritten-start;assert.equal(bytes,expected,'Actual PMD WS bytes must match compression benchmark');assert.deepEqual(errors,[]);
  return {name,exactStates:frames.length,measuredWireBytes:bytes,expectedWireBytes:expected,errors};
 }finally{client?.terminate();peer?.terminate();await new Promise(r=>server.close(r));}
}
const liveResults=[];
for(const name of ['before','after']){const result=await liveWire(name);liveResults.push(result);console.log(JSON.stringify(result));}
const results=[];
for(const name of ['before','after','after','before']){const result=trial(name);results.push(result);console.log(JSON.stringify(result));}
const constrainedResults=[];
for(const mbps of [4,8,16,32])for(const name of ['before','after']){const result=constrained(name,mbps);constrainedResults.push(result);console.log(JSON.stringify(result));}
await fs.writeFile(path.join(outDir,'comparison.json'),JSON.stringify({scope:'Frozen recording, production LAN/Steam codec ABBA; pre-change receiver exact compatibility. Wire counts include WS or Steam framing, not IP/UDP/n2n overhead. Separate ideal FIFO link model is not an actual internet, n2n, renderer or native Steam test.',recordingCommit:manifest.sourceCommit,frames:frames.length,sha256:createHash('sha256').update(Buffer.concat(frames)).digest('hex'),node:process.version,results,constrainedResults,liveResults},null,2));
