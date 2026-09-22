// Synthetic client CPU must not run on the gateway event loop.
import {parentPort,workerData} from 'node:worker_threads';
import {registerHooks} from 'node:module';
import {WebSocket} from 'ws';
import {motionFromText} from '../src/network/MotionFrame.mjs';
import {LanDeltaReceiver} from '../src/network/LanBinaryDelta.mjs';
import {decodeBinaryState} from '../src/network/BinarySnapshot.mjs';
import protocol from '../src/network/protocol.json' with {type:'json'};
let replica;
if(workerData.replicaSource){
 const url=new URL('./headless-battle-replica.bundle.mjs',import.meta.url).href;
 const hooks=registerHooks({resolve(s,c,next){return s===url?{url,shortCircuit:true}:next(s,c);},load(u,c,next){return u===url?{format:'module',source:workerData.replicaSource,shortCircuit:true}:next(u,c);}});
 try{replica=await(await import(url)).createHeadlessReplica(workerData.assets);}finally{hooks.deregister();}
}
const decoder=new LanDeltaReceiver(),pending=new Map();let welcome,match,launch,controls,seat,frames=0,appliedFrames=0,seq=0,timer;
const ws=new WebSocket(workerData.url,{headers:{Host:new URL(workerData.origin).host},origin:workerData.origin,perMessageDeflate:true});
const send=m=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(m));};
const probe=()=>{if(!controls||controls.syncId!==launch?.syncId)return;pending.set(++seq,performance.now());while(pending.size>120)pending.delete(pending.keys().next().value);send({type:'input',matchId:match.id,syncId:launch.syncId,input:{seq,keys:0,aim:[0,0],firing:false,pointerActive:false,actions:[]}});};
ws.on('error',e=>parentPort.postMessage({error:e.message}));
ws.on('open',()=>send({type:'hello',name:workerData.name,instance:crypto.randomUUID(),build:'room-bench',protocol:protocol.version,stateCredits:1,binaryDelta:1,motionReference:workerData.motionReference===false?0:1,...(workerData.autoMotion?{motionState:1,motionAuto:1}:{})}));
ws.on('message',(data,binary)=>{try{
 const started=performance.now();
 const m=binary?(replica?.decode??decodeBinaryState)(decoder.decode(data)):JSON.parse(data);
 const decodedAt=performance.now();
 if(m.type==='welcome'){welcome=m;decoder.setMotionReference(m.motionReference===1);parentPort.postMessage({welcome:m,extensions:ws.extensions});}
 if(m.type==='motion'){const frame=motionFromText(m.data);send({type:'motion-consumed',matchId:m.matchId,syncId:m.syncId,tick:frame.tick});}
 if(m.type==='room')parentPort.postMessage({room:m.room});
 if(m.type==='match'){match=m.match;seat=match.players.find(p=>p.id===welcome.id).seat;decoder.reset();replica?.initialize({...match,seed:workerData.authoritySeed??match.seed});parentPort.postMessage({match,seat});send({type:'loaded',matchId:match.id});}
 if(m.type==='launch'){launch=m;parentPort.postMessage({launch});}
 if(m.type==='controls-ready'){controls=m;parentPort.postMessage({controls});}
 if(m.type==='error'||m.type==='ended')throw Error(m.message??m.reason);
 if(m.type==='state'){
  const ack=m.frame.acknowledged?.[seat],receivedLatency=pending.has(ack)?decodedAt-pending.get(ack):null;
  const applyStarted=performance.now();if(replica){replica.apply(m.frame);appliedFrames++;}
  const appliedAt=performance.now(),latency=pending.has(ack)?appliedAt-pending.get(ack):null;
  for(const id of pending.keys())if(id<=ack)pending.delete(id);
  send({type:'state-consumed',matchId:m.matchId,seq:m.seq});
  if(launch?.matchId===m.matchId&&controls?.syncId!==launch.syncId&&m.frame.tick>=launch.minTick)send({type:'sync-ready',matchId:m.matchId,syncId:launch.syncId,tick:m.frame.tick});
  // Only tiny accounting leaves this worker, never a cloned presentation graph.
  parentPort.postMessage({frames:++frames,appliedFrames,state:{frame:{tick:m.frame.tick,acknowledged:m.frame.acknowledged}},latency,receivedLatency,decodeMs:decodedAt-started,applyMs:replica?appliedAt-applyStarted:null});
 }
}catch(e){parentPort.postMessage({error:e.message});}});
parentPort.on('message',m=>{
 if(m.type==='send')send(m.message);
 if(m.type==='visibility'){send({type:'visibility',hidden:m.hidden});if(!m.hidden){decoder.reset();replica?.reset();send({type:'resync',matchId:match.id});}}
 if(m.type==='probe-start'){clearInterval(timer);timer=setInterval(probe,20);}
 if(m.type==='probe-stop'){clearInterval(timer);timer=undefined;}
});
