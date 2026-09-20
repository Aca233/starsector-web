// Actual recorded states, lossless FIFO replay. Wire sizes are RFC7692 payloads,
// not TCP bandwidth; ACK timing is synthetic, not a measured network latency.
import fs from 'node:fs';import assert from 'node:assert/strict';import path from 'node:path';
import{deflateRawSync,constants}from'node:zlib';import{LanDeltaSender,lanDeltaTarget}from'../server/LanDeltaTransport.mjs';
import{LanDeltaReceiver}from'../src/network/LanBinaryDelta.mjs';import{decodeBinaryState}from'../src/network/BinarySnapshot.mjs';
const folder=process.argv[2]??'artifacts/lan-delta-20260919/frames32';
const output=process.argv[3]??'artifacts/network-analysis-2026-09-20/ordered-lan-replay.json';
const manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'));
const frames=manifest.rows.map(row=>{const bytes=fs.readFileSync(path.join(folder,row.name));return{bytes,seq:decodeBinaryState(bytes).seq};});
const stat=xs=>{const a=[...xs].sort((a,b)=>a-b);return{mean:a.reduce((x,y)=>x+y,0)/a.length,p95:a[Math.floor(a.length*.95)]};};
function replay(ordered,ackTicks){const s=new LanDeltaSender({ordered}),r=new LanDeltaReceiver(),acks=[],rows=[];let peakRetained=0;
 for(let i=0;i<frames.length;i++){
  while(acks.length&&acks[0].at<=i)s.ack(acks.shift().seq);
  const f=frames[i],at=performance.now(),t=lanDeltaTarget(f.bytes,f.seq),c=s.prepare(t);s.commit(c);const encodeMs=performance.now()-at;
  const rt=performance.now(),decoded=r.decode(c.packet),restoreMs=performance.now()-rt;assert.deepEqual(decoded,new Uint8Array(f.bytes));
  peakRetained=Math.max(peakRetained,s.stats().retainedBytes+r.retainedBytes);
  acks.push({at:i+ackTicks,seq:f.seq});rows.push({encodeMs,restoreMs,compressedBytes:deflateRawSync(c.packet,{level:1,memLevel:7,finishFlush:constants.Z_SYNC_FLUSH}).length-4});
 }
 return{ordered,ackTicks,frames:rows.length,compressedBytes:stat(rows.map(r=>r.compressedBytes)),encodeMs:stat(rows.map(r=>r.encodeMs)),restoreMs:stat(rows.map(r=>r.restoreMs)),peakRetained};
}
replay(false,8);replay(true,8);const scenarios=[];
for(const ackTicks of [2,8,18]){const rounds=[false,true,true,false].map(ordered=>replay(ordered,ackTicks));const average=(ordered,key)=>rounds.filter(r=>r.ordered===ordered).reduce((a,r)=>a+r[key].mean,0)/2;
 const old=average(false,'compressedBytes'),next=average(true,'compressedBytes');scenarios.push({ackTicks,oldCompressedBytes:old,newCompressedBytes:next,savingPercent:(1-next/old)*100,oldEncodeMs:average(false,'encodeMs'),newEncodeMs:average(true,'encodeMs'),oldRestoreMs:average(false,'restoreMs'),newRestoreMs:average(true,'restoreMs'),rounds});}
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({scope:'32-ship recorded FIFO replay; lossless bytes, NOT game Hz/RTT',node:process.version,scenarios},null,2));
console.log(JSON.stringify(scenarios.map(({rounds:_rounds,...r})=>r),null,2));
assert.ok(scenarios.filter(r=>r.ackTicks>=8).every(r=>r.savingPercent>=10),'retain only a materially smaller ordered delta path');
