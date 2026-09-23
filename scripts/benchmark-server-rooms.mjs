import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import { WebSocket } from 'ws';
import { Worker } from 'node:worker_threads';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { createLanServer } from '../server/lan-server.mjs';
import { createAuthorityFactory } from '../server/ServerBattleAuthority.mjs';
import { decodeBinaryState } from '../src/network/BinarySnapshot.mjs';
import { LanDeltaReceiver } from '../src/network/LanBinaryDelta.mjs';
import protocol from '../src/network/protocol.json' with {type:'json'};

const args=process.argv.slice(2), value=(key,fallback)=>{const at=args.indexOf(key);return at<0?fallback:args[at+1];};
const runtime=path.resolve(value('--runtime','artifacts/server-authority-20260920/runtime'));
const assets=path.resolve(value('--assets','public'));
const ships=Number(value('--ships','16')), roomCount=Number(value('--rooms','2'));
const expectSuspended=args.includes('--expect-suspended');
const applyReplica=args.includes('--apply-replica');
const motionReference=!args.includes('--no-motion-reference');
const autoMotion=args.includes('--auto-motion');
if(autoMotion&&!applyReplica)throw Error('--auto-motion requires --apply-replica (isolated native peers)');
const isolatedClients=applyReplica||args.includes('--isolated-clients');
let replicaSource;
if(applyReplica){
  // Standalone --benchmarks runtimes include a prebuilt helper. Source checkouts
  // compile it once before launching peers; no client CPU runs on the gateway.
  try { replicaSource=await fs.readFile(new URL('./headless-battle-replica.mjs',import.meta.url),'utf8'); }
  catch(error){
    if(error.code!=='ENOENT')throw error;
    const {build}=await import('esbuild');
    const built=await build({entryPoints:[fileURLToPath(new URL('./lib/headless-battle-replica.mts',import.meta.url))],bundle:true,platform:'node',format:'esm',target:'node22',write:false,logLevel:'warning',metafile:true,define:{__LAN_BUILD_ID__:'"room-bench"','import.meta.env':JSON.stringify({BASE_URL:'/',DEV:false,VITE_LAN_AI_WORKERS:'false',VITE_LAN_COMPONENTS:'false',VITE_LAN_FIXED_DISPLAY:'false',VITE_LAN_RECORD_DELTAS:'false'})}});
    if(Object.keys(built.metafile.inputs).some(file=>/(^|\/)campaign(\/|\.)/.test(file)))throw Error('Campaign leaked into benchmark replica');
    replicaSource=built.outputFiles[0].text;
  }
}
const activeSeconds=Number(value('--active-seconds','0'));
if(!Number.isFinite(activeSeconds)||activeSeconds<0||activeSeconds>60)throw Error('Invalid active measurement length');
const stats=values=>{const sorted=[...values].sort((a,b)=>a-b);return sorted.length?{count:sorted.length,mean:sorted.reduce((a,b)=>a+b,0)/sorted.length,p50:sorted[Math.floor(sorted.length/2)],p95:sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*.95)-1)],max:sorted.at(-1)}:null;};
const loop=monitorEventLoopDelay({resolution:10});let inputTimer;
if(!Number.isInteger(ships)||ships<2||ships>64||!Number.isInteger(roomCount)||roomCount<1||roomCount>4)throw Error('Invalid bounds');
const dist=await fs.mkdtemp(path.join(os.tmpdir(),'starsector-room-bench-'));
await fs.writeFile(path.join(dist,'lan-build.json'),JSON.stringify({build:'room-bench'}));
const metrics=[],clients=[],rooms=[],errors=[],phases=[];
const factory=createAuthorityFactory({workerFile:path.join(runtime,'authority-worker.mjs'),assets,maxBattles:roomCount});
const authorityFactory=(match,receive)=>{
  const metricsRow={id:match.id,produced:0,bytes:0,tick:0,recoveries:0,recoveryEvents:[],telemetry:null,gatewayTimes:[]};metrics.push(metricsRow);
  return factory({...match,seed:1511506142},m=>{
    if(m.type==='snapshot'){metricsRow.produced++;metricsRow.bytes+=m.bytes;metricsRow.tick=m.tick;}
    if(m.type==='performance'){metricsRow.tick=m.tick;metricsRow.telemetry=m;}
    if(m.type==='recovered'){metricsRow.recoveries++;metricsRow.recoveryEvents.push({pauseMs:m.pauseMs,diagnostics:m.diagnostics});}
    if(m.type==='error'){metricsRow.failure={message:m.message,diagnostics:m.diagnostics};errors.push(Error(m.message));}
    const at=performance.now();receive(m);
    if(m.type==='snapshot'&&metricsRow.gatewayTimes.length<4096)metricsRow.gatewayTimes.push(performance.now()-at);
  });
};
const publicOrigin='https://combat.example.test';
let app;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label,ms=30000){const end=Date.now()+ms;while(Date.now()<end){if(errors.length)throw errors[0];if(fn())return;await sleep(20);}throw Error('Timed out '+label);}
class Peer {
  constructor(name){
    this.frames=0;this.inputSeq=0;this.pending=new Map();this.inputLatencies=[];this.decoder=new LanDeltaReceiver();
    this.ws=new WebSocket('ws://127.0.0.1:'+app.server.address().port+'/lan/ws',{headers:{Host:new URL(publicOrigin).host},origin:publicOrigin,perMessageDeflate:true});
    clients.push(this);
    this.ws.on('error',e=>errors.push(e));
    this.ws.on('open',()=>this.send({type:'hello',name,instance:crypto.randomUUID(),build:'room-bench',protocol:protocol.version,stateCredits:1,binaryDelta:1,motionReference:motionReference?1:0}));
    this.ws.on('message',(data,binary)=>{try{
      const m=binary?decodeBinaryState(this.decoder.decode(data)):JSON.parse(data);
      if(m.type==='welcome'){this.welcome=m;this.decoder.setMotionReference(m.motionReference===1);}
      if(m.type==='room')this.room=m.room;
      if(m.type==='match'){this.seat=m.match.players.find(p=>p.id===this.welcome.id).seat;this.match=m.match;this.decoder.reset();this.send({type:'loaded',matchId:m.match.id});}
      if(m.type==='launch')this.launch=m;
      if(m.type==='controls-ready')this.controls=m;
      if(m.type==='error'||m.type==='ended')throw Error(m.message??m.reason);
      if(m.type==='state'){
        this.frames++;this.state=m;
        const ack=m.frame.acknowledged?.[this.seat];if(this.pending.has(ack)&&this.inputLatencies.length<4096)this.inputLatencies.push(performance.now()-this.pending.get(ack));
        for(const seq of this.pending.keys())if(seq<=ack)this.pending.delete(seq);
        this.send({type:'state-consumed',matchId:m.matchId,seq:m.seq});
        if(this.launch?.matchId===m.matchId&&this.controls?.syncId!==this.launch.syncId&&m.frame.tick>=this.launch.minTick)this.send({type:'sync-ready',matchId:m.matchId,syncId:this.launch.syncId,tick:m.frame.tick});
      }
    }catch(e){errors.push(e);}});
  }
  send(m){if(this.ws.readyState===WebSocket.OPEN)this.ws.send(JSON.stringify(m));}
  probeInput(){if(!this.controls||this.controls.syncId!==this.launch?.syncId)return;const seq=++this.inputSeq;this.pending.set(seq,performance.now());while(this.pending.size>120)this.pending.delete(this.pending.keys().next().value);this.send({type:'input',matchId:this.match.id,syncId:this.launch.syncId,input:{seq,keys:0,aim:[0,0],firing:false,pointerActive:false,actions:[]}});}
  visibility(hidden){this.send({type:'visibility',hidden});if(!hidden){this.decoder.reset();this.send({type:'resync',matchId:this.match.id});}}
}
class IsolatedPeer {
  constructor(name){
    this.frames=0;this.appliedFrames=0;this.inputLatencies=[];this.receiveLatencies=[];this.decodeTimes=[];this.applyTimes=[];clients.push(this);
    this.worker=new Worker(new URL('./benchmark-server-peer.mjs',import.meta.url),{workerData:{name,url:'ws://127.0.0.1:'+app.server.address().port+'/lan/ws',origin:publicOrigin,assets,replicaSource,motionReference,autoMotion,authoritySeed:1511506142},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:256}});
    this.ws={extensions:'',terminate:()=>this.worker.terminate()};
    this.worker.on('error',e=>errors.push(e));
    this.worker.on('message',m=>{if(m.error){errors.push(Error(m.error));return;}if(m.extensions)this.ws.extensions=m.extensions;for(const key of ['frames','appliedFrames','state','welcome','room','match','seat','launch','controls'])if(Object.hasOwn(m,key))this[key]=m[key];if(m.latency!==null&&Number.isFinite(m.latency)&&this.inputLatencies.length<4096)this.inputLatencies.push(m.latency);for(const [key,list] of [['receivedLatency',this.receiveLatencies],['decodeMs',this.decodeTimes],['applyMs',this.applyTimes]])if(m[key]!==null&&Number.isFinite(m[key])&&list.length<4096)list.push(m[key]);});
  }
  send(message){this.worker.postMessage({type:'send',message});}
  visibility(hidden){this.worker.postMessage({type:'visibility',hidden});}
  startInputs(){this.worker.postMessage({type:'probe-start'});}
  stopInputs(){this.worker.postMessage({type:'probe-stop'});}
}
async function phase(name,ms){
  loop.reset();for(const m of metrics)m.gatewayTimes=[];for(const p of clients){p.inputLatencies=[];p.receiveLatencies=[];p.decodeTimes=[];p.applyTimes=[];}
  const peers=rooms.flatMap(r=>r.peers),peerBefore=peers.map(p=>({...p.lanFlow,wireBytes:p.ws._socket?.bytesWritten??0}));
  const before=metrics.map(m=>({...m})),received=clients.map(p=>p.frames),applied=clients.map(p=>p.appliedFrames??0),cpu=process.cpuUsage(),start=performance.now();
  await sleep(ms);if(errors.length)throw errors[0];
  const elapsed=(performance.now()-start)/1000,usage=process.cpuUsage(cpu);
  const result={name,seconds:elapsed,cpuMs:(usage.user+usage.system)/1000,rssMiB:process.memoryUsage().rss/1048576,
    rooms:metrics.map((m,i)=>({produced:m.produced-before[i].produced,producedHz:(m.produced-before[i].produced)/elapsed,progressTicks:m.tick-before[i].tick,uncompressedMiB:(m.bytes-before[i].bytes)/1048576,recoveries:m.recoveries,recoveryEvents:m.recoveryEvents,telemetry:m.telemetry,gatewayMs:stats(m.gatewayTimes)})),
    eventLoopMs:{mean:loop.mean/1e6,p95:loop.percentile(95)/1e6,max:loop.max/1e6},inputAckMs:clients.map(p=>stats(p.inputLatencies)),
    transport:peers.map((p,i)=>({seat:p.seat,socketSkips:p.lanFlow.skippedSocket-peerBefore[i].skippedSocket,creditSkips:p.lanFlow.skippedCredit-peerBefore[i].skippedCredit,wireMbps:((p.ws._socket?.bytesWritten??0)-peerBefore[i].wireBytes)*8/elapsed/1e6,credits:p.stateCredits.stats(),delta:p.lanDelta?.stats()})),
    receivedHz:clients.map((p,i)=>(p.frames-received[i])/elapsed),
    ...(applyReplica?{appliedHz:clients.map((p,i)=>(p.appliedFrames-applied[i])/elapsed),guestDecodeMs:clients.map(p=>stats(p.decodeTimes)),guestApplyMs:clients.map(p=>stats(p.applyTimes)),inputReceiveAckMs:clients.map(p=>stats(p.receiveLatencies))}:{})};
  phases.push(result);console.log(JSON.stringify(result));return result;
}
try{
  app=await createLanServer({host:'127.0.0.1',port:0,dist,authorityFactory,publicOrigin});
  for(let i=0;i<roomCount;i++){
    const Client=isolatedClients?IsolatedPeer:Peer;const a=new Client('creator-'+i),b=new Client('guest-'+i);await until(()=>a.welcome&&b.welcome,'hello');
    a.send({type:'create'});await until(()=>a.room,'create');
    b.send({type:'join',code:a.room.code});await until(()=>b.room?.members.length===2,'join');
    const room=app.rooms.get(a.room.code);rooms.push(room);
    for(const p of [a,b])p.send({type:'configure',hull:'onslaught'});
    // Use the production room settings path; both clients are neutral human Onslaughts; the remaining ships are AI Hammerheads.
    a.send({type:'options',baseRevision:room.options.aiRevision??0,options:{battleSize:3200,aiHulls:[Array(Math.floor((ships-2)/2)).fill('hammerhead'),Array(Math.ceil((ships-2)/2)).fill('hammerhead')]}});
    await until(()=>room.options.aiHulls.flat().length===ships-2,'fleet');
    b.send({type:'ready',ready:true});await until(()=>room.peers[1].ready,'ready');
    a.send({type:'start'});await until(()=>a.controls&&b.controls&&a.frames>=20&&b.frames>=20,'start');
    assert.equal(a.welcome.motionReference===1,motionReference);
  }
  loop.enable();await sleep(2000);
  if(activeSeconds){
    if(isolatedClients)for(const p of clients)p.startInputs();else inputTimer=setInterval(()=>{for(const p of clients)p.probeInput();},20);
    await phase('active-with-inputs',activeSeconds*1000);clearInterval(inputTimer);if(isolatedClients)for(const p of clients)p.stopInputs();
    for(const p of clients)assert.ok(p.inputLatencies.length>10,'input latency samples required');
  }else{
  await phase('all-visible',6000);
  clients[0].visibility(true);await sleep(400);
  const partial=await phase('one-client-hidden',3000);assert.ok(partial.receivedHz[1]>0);
  for(const p of clients)p.visibility(true);await sleep(500);
  const hidden=await phase('all-hidden',14000);
  for(const room of rooms)assert.equal(room.status,'running','idle snapshots must not trip 12-second watchdog');
  for(const r of hidden.rooms){assert.ok(r.progressTicks>600,'simulation must continue while hidden');if(expectSuspended)assert.equal(r.produced,0,'no heavy captures without recipients');}
  for(const p of clients)p.visibility(false);
  await until(()=>rooms.every(r=>r.peers.every(p=>p.loaded)),'fresh sync after hidden');
  const resumed=await phase('visible-again',5000);assert.ok(resumed.receivedHz.every(hz=>hz>0));
  for(const p of clients)p.send({type:'input',matchId:p.match.id,syncId:p.launch.syncId,input:{seq:500,keys:1,aim:[0,0],firing:false,pointerActive:true,actions:[]}});
  await until(()=>clients.every(p=>p.state.frame.acknowledged[p.match.players.find(row=>row.id===p.welcome.id).seat]>=500),'input after resume');
  }
  // Stop client traffic before deleting rooms. A probe-stop message is asynchronous:
  // otherwise an in-flight input can reach an already-removed room and falsely fail cleanup.
  await Promise.all(clients.map(p=>p.ws.terminate()));
  for(const room of rooms)app.closeRoom(room.code);
  await until(()=>factory.activeCount()===0,'cleanup');
  const report={passed:true,node:process.version,arch:process.arch,shipsPerRoom:ships,rooms:roomCount,expectSuspended,activeSeconds,isolatedClients,applyReplica,motionReference,autoMotion,
    scope:(applyReplica?'Latest-input ACKs measured after native replica apply; headless appliedHz excludes RAF/interpolation/prediction/GPU. ':'Latest-input ACKs measured at synthetic consumption, not GPU display latency. ')+ ' Real server workers + gateway + PMD/delta WebSocket clients on one machine (isolatedClients=true gives each client its own worker); CPU total still includes clients; no WAN, TLS, GPU or browser render cost. Short test, not a capacity guarantee.',phases};
  const out=path.resolve(value('--out','artifacts/server-authority-20260920/room-benchmark.json'));await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(report,null,2));
}catch(error){
  const out=path.resolve(value('--out','artifacts/server-authority-20260920/room-benchmark.json'));
  await fs.mkdir(path.dirname(out),{recursive:true});
  await fs.writeFile(out,JSON.stringify({passed:false,error:String(error?.stack??error),node:process.version,shipsPerRoom:ships,rooms:roomCount,activeSeconds,isolatedClients,applyReplica,motionReference,autoMotion,metrics,phases},null,2));
  throw error;
}finally{
  clearInterval(inputTimer);loop.disable();
  await Promise.all(clients.map(p=>p.ws.terminate()));await app?.close();await factory.close();
  await fs.unlink(path.join(dist,'lan-build.json'));await fs.rmdir(dist);
}
