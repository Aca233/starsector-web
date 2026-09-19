// Repeatable offline codec cost study. No SDK/network/ports, no performance
// thresholds, and no claim that synthetic state preparation is game FPS.
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { SteamPacketCodec } from '../server/steam/packet-codec.mjs';
import { SteamSocketStateCodec, unpackSocketState } from '../server/steam/sockets-state-codec.mjs';
import { SteamSnapshotEncoder } from '../server/steam/snapshot-delta.mjs';
import { SteamAnchoredSender, SteamAnchoredReceiver } from '../server/steam/anchored-snapshots.mjs';
const peers = 9, count = 240, quantile = (a,q) => [...a].sort((x,y)=>x-y)[Math.floor((a.length-1)*q)];
let seed = 218;
const noise = n => Array.from({length:n},()=>String.fromCharCode(32+((seed=Math.imul(seed,1664525)+1013904223>>>0)%90))).join('');
const ballast=noise(14000),moving=Array.from({length:60},(_,id)=>({id,name:noise(12)}));
const states=Array.from({length:count+peers},(_,index)=>{const seq=index+1;return JSON.stringify({type:'state',matchId:'shared-battle',seq,frame:{tick:seq,marker:'exact-'+seq,producedAt:Math.ceil(seq*1000/60/4)*4,ballast,moving:moving.map((m,i)=>({...m,x:Math.sin((seq+i)*.07)*1000,y:Math.cos((seq-i)*.04)*1000,hp:10000-seq%700}))}});});
function measure({packed,shared,staggered=false},limit=count) {
 const Codec=packed?SteamSocketStateCodec:SteamPacketCodec,commonCodec=new Codec(),commonEncoder=new SteamSnapshotEncoder();
 const senders=Array.from({length:peers},()=>({sender:new SteamAnchoredSender({adaptive:true}),codec:shared?commonCodec:new Codec(),encoder:shared?commonEncoder:new SteamSnapshotEncoder()}));
 const receiver=new SteamAnchoredReceiver(),preparation=[],reception=[],bytes=[];let firstAnchorBytes=0,packedFrames=0;
 if(staggered)for(let i=0;i<peers;i++){
  const {sender,codec,encoder}=senders[i],c=sender.prepare(states[i],encoder,codec,0);assert.equal(c.kind,'anchor');assert.ok(sender.commit(c));
  if(i===0){const p=c.prepared,raw=p.zipped?inflateRawSync(p.payload,{maxOutputLength:p.rawBytes}):p.payload;receiver.receiveAnchor(p.packedState?unpackSocketState(raw):JSON.parse(raw.toString('utf8')));firstAnchorBytes=p.payload.length+64*Math.ceil(p.payload.length/8192);}
  assert.ok(sender.acknowledgeAnchor(c.target.token));
 }
 for(let index=0;index<limit;index++){
  const now=(index+1)*1000/60,start=performance.now(),choices=senders.map(({sender,codec,encoder})=>{const c=sender.prepare(states[index+(staggered?peers:0)],encoder,codec,now);assert.ok(sender.commit(c));return c;});
  preparation.push(performance.now()-start);
  const c=choices[0],p=c.prepared,decoding=performance.now(),raw=p.zipped?inflateRawSync(p.payload,{maxOutputLength:p.rawBytes}):p.payload;
  const envelope=p.packedState?unpackSocketState(raw):JSON.parse(raw.toString('utf8'));
  const result=c.kind==='anchor'?receiver.receiveAnchor(envelope):receiver.receiveSnapshot(envelope);reception.push(performance.now()-decoding);
  assert.equal(JSON.stringify(result.data),states[index+(staggered?peers:0)]);
  choices.forEach((choice,i)=>{if(choice.kind==='anchor')assert.ok(senders[i].sender.acknowledgeAnchor(choice.target.token));});
  if(c.kind==='snapshot')bytes.push(p.payload.length+64*Math.ceil(p.payload.length/8192));else firstAnchorBytes=p.payload.length+64*Math.ceil(p.payload.length/8192);
  if(p.packedState)packedFrames++;
 }
 const summary=a=>({median:quantile(a.slice(20),.5),p95:quantile(a.slice(20),.95),mean:a.slice(20).reduce((n,x)=>n+x,0)/(a.length-20)});
 return{packed,shared,staggered,peers,states:limit,hostPreparationPerBroadcastMs:summary(preparation),oneGuestDecodeAndApplyMs:summary(reception),meanSnapshotWireBytes:bytes.reduce((n,x)=>n+x,0)/bytes.length,firstAnchorWireBytes:firstAnchorBytes,packedFrames};
}
// Warm all code paths before recording, then repeat in reversed order so one
// implementation is not always assigned the coldest phase of a busy machine.
const variants=[false,true].flatMap(staggered=>[{packed:false,shared:false},{packed:false,shared:true},{packed:true,shared:false},{packed:true,shared:true}].map(v=>({...v,staggered})));
for(const v of variants)measure(v,40);
const results=[];for(const [round,order]of [[1,variants],[2,[...variants].reverse()]])for(const v of order)results.push({round,...measure(v)});
const paths=['server/steam/sockets-state-codec.mjs','server/steam/snapshot-delta.mjs','server/steam/anchored-snapshots.mjs','server/steam/packet-codec.mjs','scripts/bench-steam-sockets-state-codec.mjs'];
const report={createdAt:new Date().toISOString(),scope:'Offline synthetic 9-peer transport preparation and one-peer decode/apply; excludes game simulation, initial state JSON creation, native calls and browser rendering. Immediate simulated anchor ACK; aligned and deliberately distinct per-peer anchors; not congestion or network behavior.',node:process.version,results,sourceHashes:Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')]))};
fs.writeFileSync('artifacts/steam-sockets-packed-cost.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
