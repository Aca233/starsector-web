// Offline replay of actual captured complete SWB1 states. Not gameplay FPS/RTT.
import fs from 'node:fs';import assert from 'node:assert/strict';import{deflateRawSync,constants}from'node:zlib';
import{LanDeltaSender,lanDeltaTarget}from'../server/LanDeltaTransport.mjs';
import{LanDeltaReceiver}from'../src/network/LanBinaryDelta.mjs';import{decodeBinaryState}from'../src/network/BinarySnapshot.mjs';
const folder=process.argv[2]??'artifacts/lan-delta-20260919/frames32';
const manifest=JSON.parse(fs.readFileSync(folder+'/manifest.json','utf8'));
const frames=manifest.rows.map(row=>{const bytes=fs.readFileSync(folder+'/'+row.name);return{bytes,seq:decodeBinaryState(bytes).seq};});
const compress=bytes=>deflateRawSync(bytes,{level:1,memLevel:7,finishFlush:constants.Z_SYNC_FLUSH}).length-4;
const baseline=frames.map(({bytes})=>compress(bytes));
const stat=values=>{const a=[...values].sort((a,b)=>a-b);return{mean:a.reduce((n,v)=>n+v,0)/a.length,p95:a[Math.floor(a.length*.95)]};};
const scenarios=[];
for(const ackTicks of [0,2,8,18]){
 const s=new LanDeltaSender(),r=new LanDeltaReceiver(),acks=[],rows=[];
 for(let i=0;i<frames.length;i++){
  while(acks.length&&acks[0].at<=i)s.ack(acks.shift().seq);
  const f=frames[i],started=performance.now(),t=lanDeltaTarget(f.bytes,f.seq,i*1000/60),c=s.prepare(t),encodeMs=performance.now()-started;
  const decodedAt=performance.now(),bytes=r.decode(c.packet),restoreMs=performance.now()-decodedAt;assert.deepEqual(bytes,new Uint8Array(f.bytes));s.commit(c);
  acks.push({at:i+Math.max(1,ackTicks),seq:f.seq});rows.push({full:baseline[i],delta:compress(c.packet),encodeMs,restoreMs,anchor:c.anchor});
 }
 const mean=key=>rows.reduce((n,r)=>n+r[key],0)/rows.length;scenarios.push({ackTicks,frames:frames.length,compressedFull:mean('full'),compressedWithDelta:mean('delta'),saving:1-mean('delta')/mean('full'),encode:stat(rows.map(r=>r.encodeMs)),restore:stat(rows.map(r=>r.restoreMs)),sender:s.stats(),rows});
}
const result={scope:'actual 32-ship offline engine captures; lossless replay and RFC7692 payload byte/CPU microbenchmark, ACK timing synthetic; NOT network/GPU/game FPS',capture:manifest.scope,scenarios};
fs.writeFileSync('artifacts/lan-delta-20260919/production-replay.json',JSON.stringify(result,null,2));console.log(scenarios.map(({rows:_rows,...s})=>s));
