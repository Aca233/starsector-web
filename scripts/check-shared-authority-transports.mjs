import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import {build} from 'esbuild';
import {decodeBinaryFrame,encodeBinaryState,decodeBinaryState} from '../src/network/BinarySnapshot.mjs';
import {summarizeCombatFrame} from '../src/network/CombatFrameSummary.mjs';
import {prepareAuthoritySnapshot} from '../server/authority-snapshot.mjs';
import {SnapshotPrepareState} from '../server/steam/snapshot-prepare-state.mjs';
import {SteamPacketCodec} from '../server/steam/packet-codec.mjs';
import {SteamBinarySnapshotReceiver} from '../server/steam/binary-snapshot.mjs';
import {SteamSnapshotReceiver} from '../server/steam/snapshot-delta.mjs';
const base=path.resolve('artifacts/guest-hz-20260920/shared-transports');await fs.mkdir(base,{recursive:true});
const workerFile=path.join(base,'authority-transport.worker.mjs');
// Execute the real adapter and host loop. Only the adapter's test init selects
// negotiated binary/legacy capabilities; no substituted physics/capture function.
const result=await build({entryPoints:['server/authority-worker.mjs'],outfile:workerFile,bundle:true,platform:'node',format:'esm',packages:'external',metafile:true,
 define:{__LAN_BUILD_ID__:'"shared-transport-test"','import.meta.env':'{"BASE_URL":"/","DEV":false,"VITE_LAN_AI_WORKERS":"false"}'},logLevel:'warning',plugins:[{
 name:'test-transport-init',setup(b){b.onLoad({filter:/authority-worker\.mjs$/},async args=>{
  const text=await fs.readFile(args.path,'utf8'),anchor='binarySnapshots: true, authoritySummaries: true';assert.ok(text.includes(anchor));
  return {contents:text.replace(anchor,'binarySnapshots: workerData.binarySnapshots, authoritySummaries: workerData.authoritySummaries'),loader:'js'};
 });}
}]});
assert.ok(!Object.keys(result.metafile.inputs).some(p=>/(^|\/)campaign(\/|\.)/.test(p)));
assert.match(await fs.readFile('src/network/host.worker.ts','utf8'),/const frame = captureAuthorityCombat\(/);
const match={id:'shared-transport-match',hostId:'a',seed:1511506142,snapshotHz:60,players:[{id:'a',seat:0,team:0,hull:'onslaught'},{id:'b',seat:1,team:1,hull:'onslaught'}],options:{assignment:'teams',battleSize:3200,aiHulls:[Array(7).fill('hammerhead'),Array(7).fill('hammerhead')]}};
const normalize=value=>JSON.parse(JSON.stringify(value));
const initialState=frame=>{const result={...frame};for(const k of ['simulationMs','captureMs','encodeMs','realtimeRatio','combatRate'])delete result[k];return normalize(result);};
async function collect(mode){
 const worker=new Worker(workerFile,{workerData:{assets:path.resolve('public'),match,binarySnapshots:mode.binary,authoritySummaries:mode.summary}});
 const frames=[];let timeout,count=0,last=-1,acknowledged=false;
 try{
  await new Promise((resolve,reject)=>{
   timeout=setTimeout(()=>reject(Error('Worker timed out: '+mode.name)),30000);
   worker.on('error',reject);worker.on('exit',code=>{if(code!==0)reject(Error('Unexpected Worker exit '+code));});
   worker.on('message',m=>{try{
    if(m.type==='error')throw Error(m.message);
    if(m.type==='ready'){
     worker.postMessage({type:'presence',seat:1,connected:true,online:true});
     worker.postMessage({type:'input',seat:1,input:{seq:7,keys:0,aim:[0,0],pointerActive:false,firing:false,actions:[]}});
     worker.postMessage({type:'start'});
    }
    if(m.type!=='snapshot')return;
    assert.ok(m.tick>last);last=m.tick;count++;
    assert.equal(m.binary instanceof ArrayBuffer,mode.binary);assert.equal(typeof m.json==='string',!mode.binary);
    assert.equal(!!m.summary,mode.summary);
    if(!frames.length||(frames.length===1&&m.tick>=120)||(frames.length===2&&m.tick>=300)){
     const frame=m.binary?decodeBinaryFrame(m.binary):JSON.parse(m.json);
     assert.equal(frame.tick,m.tick);assert.equal(m.bytes,m.binary?m.binary.byteLength:Buffer.byteLength(m.json));
     if(frame.acknowledged[1]>=7)acknowledged=true;
     if(m.summary)assert.deepEqual(m.summary,summarizeCombatFrame(frame,16,m.tick-1));
     frames.push({message:m,frame});
    }
    worker.postMessage({type:'snapshot-consumed',tick:m.tick});
    if(frames.length===3)resolve();
   }catch(error){reject(error);}});
  });
  assert.ok(count>30&&acknowledged);return {frames,count};
 }finally{clearTimeout(timeout);await worker.terminate();}
}
function steamRoundtrip(packets){
 const kernel=new SnapshotPrepareState(),receivers=[new SteamBinarySnapshotReceiver(),new SteamSnapshotReceiver()];
 let seq=0;const formats=[];
 for(const {message:m,frame} of packets){
  seq++;
  const expected=normalize({type:'state',matchId:match.id,seq,frame});
  const input=m.binary?{kind:'binary',data:encodeBinaryState(match.id,seq,m.binary)}:{kind:'json',data:JSON.stringify(expected)};
  const {response}=kernel.handle({op:'prepare',id:seq,now:1000+seq*500,peers:[{key:1,epoch:0,binary:true},{key:2,epoch:0,binary:false}],input});
  for(const r of response.results){
   const codec=new SteamPacketCodec({binaryStates:true});
   const fragments=codec.frame('a'.repeat(32),'data',{...r.prepared,payload:Buffer.from(r.prepared.payload)});
   let incoming;for(const fragment of fragments.packets)incoming=codec.receive('remote',fragment)??incoming;
   assert.ok(incoming);const restored=receivers[r.key-1].receive(incoming.data);assert.equal(restored.needsFull,false);
   assert.deepEqual(normalize(restored.data),expected);formats.push(r.format);
  }
  kernel.handle({op:'commit',id:seq,accepted:[1,2]});
 }
 assert.deepEqual(kernel.stats().map(s=>s.lastSeq),[seq,seq]);return formats;
}
const modes=[{name:'lan-web-relay-and-steam-binary',binary:true,summary:false},{name:'steam-legacy-json',binary:false,summary:false},{name:'dedicated-node-adapter',binary:true,summary:true}];
const checks=[];let baseline;
for(const mode of modes){
 const {frames,count}=await collect(mode);const initial=initialState(frames[0].frame);
 if(baseline)assert.deepEqual(initial,baseline,'same authority projection across transport capability modes');else baseline=initial;
 // LAN/web relay envelope and dedicated metadata validation retain exact state.
 for(const [{message:m,frame},i] of frames.map((v,i)=>[v,i])){
  if(m.binary){const wire=decodeBinaryState(encodeBinaryState(match.id,i+1,m.binary));assert.deepEqual(normalize(wire.frame),normalize(frame));}
  if(mode.summary){const prepared=prepareAuthoritySnapshot(m,match.id,i+1,16,m.tick-1);assert.deepEqual(prepared.summary,summarizeCombatFrame(frame,16,m.tick-1));assert.deepEqual(normalize(decodeBinaryState(prepared.bytes).frame),normalize(frame));}
 }
 checks.push({mode:mode.name,snapshots:count,ticks:frames.map(v=>v.frame.tick),steamPeerFormats:steamRoundtrip(frames)});
}
const report={passed:true,checks,scope:'Real shared authority Worker and real Steam preparation/framing/receivers; local in-memory delivery, NOT native Steam or public-Internet latency/Hz. No campaign bundle or running service changed.'};
await fs.writeFile(path.join(base,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
