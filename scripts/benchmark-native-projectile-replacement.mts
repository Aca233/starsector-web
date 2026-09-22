import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {serialize} from 'node:v8';import {deflateRawSync,inflateRawSync} from 'node:zlib';
import {captureCombat as oldCapture,applyCombatSnapshots as oldApply,projectileSliceForTest as oldSlice} from 'projectiles-reference';
import {captureCombat,applyCombatSnapshots,projectileSliceForTest} from '../src/network/CombatSnapshot';
import {encodeProjectedBinaryFrame,encodeBinaryState,decodeBinaryState} from '../src/network/BinarySnapshot.mjs';
import {isLanDelta,LanDeltaReceiver} from '../src/network/LanBinaryDelta.mjs';import {LanDeltaSender,lanDeltaTarget} from '../server/LanDeltaTransport.mjs';
import {assets,world} from './lib/native-projectile-fixture.mts';import {nativeProjectileCaptureDiagnostics} from '../src/network/NativeProjectileCapture';
await assets();
const out=path.resolve(process.env.NATIVE_PROJECTILE_OUT??'artifacts/network-stream-20260921/phase30/benchmark');fs.mkdirSync(out,{recursive:true});
const samples=Number(process.env.NATIVE_PROJECTILE_SAMPLES??120),warmup=30;assert.ok(Number.isInteger(samples)&&samples>=60&&samples<=600);
const rounds=3,q=(v:number[],f:number)=>v.toSorted((a,b)=>a-b)[Math.floor((v.length-1)*f)],stats=(v:number[])=>({p50:q(v,.5),p95:q(v,.95),p99:q(v,.99),max:Math.max(...v)});
const take=(e:any,tick:number,fn:any=captureCombat)=>fn(e,tick,{0:tick,1:tick},0,true,true,true,true,true);
const wire=(f:any)=>encodeProjectedBinaryFrame(f,true)!;
function pipe(source:any,peers:number,candidate:boolean){
 const viewers=Array.from({length:peers},()=>world()),senders=viewers.map(()=>new LanDeltaSender({ordered:true,motionReference:true})),receivers=viewers.map(()=>new LanDeltaReceiver({motionReference:true}));
 return {viewers,step(tick:number){
  const m:any={capture:0,encode:0,delta:0,compress:0,inflate:0,decode:0,apply:0};let t=performance.now();const frame=take(source,tick,candidate?captureCombat:oldCapture);m.capture=performance.now()-t;
  t=performance.now();const encoded=encodeBinaryState('native-projectile',tick,wire(frame));m.encode=performance.now()-t;
  t=performance.now();const target=lanDeltaTarget(encoded,tick,tick*1000/60);assert.ok(target);const choices=senders.map(s=>s.prepare(target)),packets=choices.map((c:any)=>c?.packet??encoded);choices.forEach((c:any,i:number)=>{if(c)senders[i].commit(c);});m.delta=performance.now()-t;
  t=performance.now();const compressed=packets.map(p=>deflateRawSync(p,{level:6}));m.compress=performance.now()-t;
  for(let i=0;i<peers;i++){
   t=performance.now();const bytes=inflateRawSync(compressed[i]);m.inflate+=performance.now()-t;t=performance.now();const data=decodeBinaryState(isLanDelta(bytes)?receivers[i].decode(bytes):bytes);m.decode+=performance.now()-t;
   t=performance.now();(candidate?applyCombatSnapshots:oldApply)(viewers[i],[data.frame],tick===1,undefined,{nativeTargeting:true,nativeProjectiles:candidate});m.apply+=performance.now()-t;
  }
  t=performance.now();(candidate?projectileSliceForTest:oldSlice)(source,tick);const projectileCapture=performance.now()-t;
  return {frame,encoded,packets,compressed,metrics:m,projectileCapture,total:Object.values(m).reduce((a:number,b:any)=>a+b,0)};
 },stats:()=>senders.map(s=>s.stats())};
}
const results:any[]=[];const traces:string[]=[];
for(const peers of [3,4,5]){
 const pairs=[];
 for(let round=0;round<rounds;round++){
  const source=world();for(const s of source.allCapitalShips){s.pos.scale(.2);s.prevPos.copy(s.pos);s.fireControlMode='AI';}
  for(let i=0;i<120;i++)source.fixedUpdate(1/60);
  const a=pipe(source,peers,false),b=pipe(source,peers,true),control:any[]=[],candidate:any[]=[],trace:any[]=[],hash=crypto.createHash('sha256');let min=Infinity,max=0;
  for(let i=0;i<samples+warmup;i++){
   source.fixedUpdate(1/60);let before:any,after:any;if(round===1){after=b.step(i+1);before=a.step(i+1);}else{before=a.step(i+1);after=b.step(i+1);}
   assert.deepEqual(after.encoded,before.encoded,'whole frame exact binary');for(let p=0;p<peers;p++){assert.deepEqual(after.packets[p],before.packets[p],'actual ordered/motion delta exact bytes');assert.deepEqual(after.compressed[p],before.compressed[p]);}
   if(i%30===0||i===samples+warmup-1)for(let p=0;p<peers;p++)assert.deepEqual(wire(take(a.viewers[p],i+1,oldCapture)),wire(take(b.viewers[p],i+1,oldCapture)),'whole restored viewer semantics');
   hash.update(before.encoded);if(peers===3&&round===0)trace.push(before.frame);min=Math.min(min,source.projectiles.length);max=Math.max(max,source.projectiles.length);
   if(i>=warmup){const row=(r:any)=>({tick:i+1,total:r.total,projectileCapture:r.projectileCapture,metrics:r.metrics,wire:r.compressed.reduce((sum:number,p:any)=>sum+p.length,0)});control.push(row(before));candidate.push(row(after));}
  }
  const digest=hash.digest('hex');traces.push(digest);assert.ok(min>=30,'fixture must contain real projectiles');
  const summarize=(rows:any[])=>({total:stats(rows.map(r=>r.total)),projectileCapture:stats(rows.map(r=>r.projectileCapture)),wire:rows.reduce((a,r)=>a+r.wire,0)/rows.length,stages:Object.fromEntries(Object.keys(rows[0].metrics).map(k=>[k,stats(rows.map(r=>r.metrics[k]))]))});
  const old=summarize(control),next=summarize(candidate),pair={round,peers,projectileMin:min,projectileMax:max,traceSha256:digest,control:old,candidate:next,ratios:{capture:next.projectileCapture.p50/old.projectileCapture.p50,total:next.total.p50/old.total.p50,p95:next.total.p95/old.total.p95,wire:next.wire/old.wire}};pairs.push(pair);
  fs.writeFileSync(path.join(out,`pair-${peers}-${round}.json`),JSON.stringify({pair,control,candidate,transport:a.stats()},null,2));if(trace.length)fs.writeFileSync(path.join(out,'trace.v8'),serialize(trace));console.log(JSON.stringify({peers,round,ratios:pair.ratios,old:old.total,next:next.total}));
 }
 const gate=pairs.every(p=>p.ratios.capture<=.85&&p.ratios.p95<=1.10&&p.ratios.wire<=1)&&q(pairs.map(p=>p.ratios.total),.5)<=.95;results.push({peers,pairs,gate});
}
assert.equal(new Set(traces).size,1,'all pairs must use the same recorded native trajectory');
const report={at:new Date().toISOString(),scope:'Full native 22-ship world; both variants capture the SAME authoritative state at each tick (physics outside timing). Existing projected binary + reliable ordered motion delta + deflate6/inflate. All receiver decode/apply costs included; 3/4/5 are sequential offline receiving replicas, not actual players, RTT or Hz. Standalone projectile capture timing is separate, NOT added twice to full pipeline. Assertions outside timed regions. Source traces identical across 9 pairs.',samples,warmup,rounds,gate:{projectileCaptureP50RatioAtMost:.85,medianFullPipelineP50RatioAtMost:.95,everyPairP95RatioAtMost:1.10,everyPairWireRatioAtMost:1},results,passed:results.every(r=>r.gate),captureDiagnostics:nativeProjectileCaptureDiagnostics()};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log('PERFORMANCE GATE',report.passed?'PASS':'FAIL; negative result retained');

if (!report.passed) process.exitCode = 1;
