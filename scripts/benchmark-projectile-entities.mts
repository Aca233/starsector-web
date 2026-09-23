import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {deflateRawSync,inflateRawSync} from 'node:zlib';
import {captureCombat,applyCombatSnapshots} from '../src/network/AuthorityCombatSnapshot';
import {captureCombat as entityCapture,applyCombatSnapshots as entityApply} from 'entity-candidate';
import {ProjectileCapsuleReceiver} from '../src/network/ProjectileEntityCapsule';
import {expandSnapshotProjectiles} from '../src/network/ProjectileProjection';
import {encodeProjectedBinaryFrame,encodeBinaryState,decodeBinaryState,decodeBinaryFrame} from '../src/network/BinarySnapshot.mjs';
import {isLanDelta,LanDeltaReceiver} from '../src/network/LanBinaryDelta.mjs';import {LanDeltaSender,lanDeltaTarget} from '../server/LanDeltaTransport.mjs';
import {assets,world} from './lib/native-projectile-fixture.mts';
await assets();
const out=path.resolve('artifacts/network-stream-20260921/phase31/benchmark');fs.mkdirSync(out,{recursive:true});
const samples=120,warmup=30,rounds=2,q=(v:number[],f:number)=>v.toSorted((a,b)=>a-b)[Math.floor((v.length-1)*f)],stats=(v:number[])=>({p50:q(v,.5),p95:q(v,.95),p99:q(v,.99),max:Math.max(...v)});
const take=(e:any,tick:number,fn:any=captureCombat)=>fn(e,tick,{0:tick,1:tick},0,true,true,true,true,true);
const wire=(f:any)=>encodeProjectedBinaryFrame(f,true)!;
function plainFrame(frame:any){
 const layouts=frame.layouts??[];
 const expand=(v:any):any=>{
  if(!v||typeof v!=='object')return v;if(Array.isArray(v))return v.map(expand);
  if(Object.hasOwn(v,'$record'))return Object.fromEntries(layouts[v.$record].map((k:string,i:number)=>[k,expand(v.values[i])]));
  if(Object.hasOwn(v,'$records'))return v.values.map((r:any)=>Object.fromEntries(layouts[v.$records].map((k:string,i:number)=>[k,expand(r[i])])));
  return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,expand(x)]));
 };
 const {layouts:unused,world,...rest}=frame;const {projectiles,...other}=world;
 return expand({...rest,world:other});
}
function pipe(source:any,peers:number,candidate:boolean){
 const viewers=Array.from({length:peers},()=>world()),senders=viewers.map(()=>new LanDeltaSender({ordered:true,motionReference:true})),receivers=viewers.map(()=>new LanDeltaReceiver({motionReference:true}));
 return {viewers,step(tick:number){
  const m:any={capture:0,encode:0,delta:0,compress:0,inflate:0,decode:0,apply:0};let t=performance.now();const frame=take(source,tick,candidate?entityCapture:captureCombat);m.capture=performance.now()-t;
  if(candidate)assert.ok(frame.world.projectiles.$projectileEntityCapsule,'do not measure silent fallback');
  t=performance.now();const encoded=encodeBinaryState('native-projectile',tick,wire(frame));m.encode=performance.now()-t;
  t=performance.now();const target=lanDeltaTarget(encoded,tick,tick*1000/60);assert.ok(target);const choices=senders.map(s=>s.prepare(target)),packets=choices.map((c:any)=>c?.packet??encoded);choices.forEach((c:any,i:number)=>{if(c)senders[i].commit(c);});m.delta=performance.now()-t;
  t=performance.now();const compressed=packets.map(p=>deflateRawSync(p,{level:6}));m.compress=performance.now()-t;
  for(let i=0;i<peers;i++){
   t=performance.now();const bytes=inflateRawSync(compressed[i]);m.inflate+=performance.now()-t;t=performance.now();const data=decodeBinaryState(isLanDelta(bytes)?receivers[i].decode(bytes):bytes);m.decode+=performance.now()-t;
   t=performance.now();(candidate?entityApply:applyCombatSnapshots)(viewers[i],[data.frame],tick===1,undefined,{nativeTargeting:true});m.apply+=performance.now()-t;
  }
  return {frame,encoded,metrics:m,total:Object.values(m).reduce((a:number,b:any)=>a+b,0),wire:compressed.reduce((sum,p)=>sum+p.length,0)};
 },stats:()=>senders.map(s=>s.stats())};
}
const results:any[]=[],traces:string[]=[];
for(const peers of [3,5]){
 const pairs=[];
 for(let round=0;round<rounds;round++){
  const source=world();for(const s of source.allCapitalShips){s.pos.scale(.2);s.prevPos.copy(s.pos);s.fireControlMode='AI';}
  for(let i=0;i<120;i++)source.fixedUpdate(1/60);
  const a=pipe(source,peers,false),b=pipe(source,peers,true),control:any[]=[],candidate:any[]=[],hash=crypto.createHash('sha256');let min=Infinity,max=0;const oracle=new ProjectileCapsuleReceiver();
  for(let i=0;i<samples+warmup;i++){
   source.fixedUpdate(1/60);let before:any,after:any;if(round===1){after=b.step(i+1);before=a.step(i+1);}else{before=a.step(i+1);after=b.step(i+1);}
   const oldFrame=decodeBinaryFrame(decodeBinaryState(before.encoded).payload??wire(before.frame));
   assert.deepEqual(oracle.decode(decodeBinaryFrame(wire(after.frame)).world.projectiles.$projectileEntityCapsule,i+1),expandSnapshotProjectiles(oldFrame),'projectile semantics');
   assert.deepEqual(plainFrame(decodeBinaryFrame(wire(after.frame))),plainFrame(oldFrame),'all other frame semantics');
   if(i%30===0||i===samples+warmup-1)for(let p=0;p<peers;p++)assert.deepEqual(plainFrame(decodeBinaryFrame(wire(take(a.viewers[p],i+1)))),plainFrame(decodeBinaryFrame(wire(take(b.viewers[p],i+1)))),'all other applied semantics');
   hash.update(before.encoded);min=Math.min(min,source.projectiles.length);max=Math.max(max,source.projectiles.length);
   if(i>=warmup){const row=(r:any)=>({tick:i+1,total:r.total,metrics:r.metrics,wire:r.wire});control.push(row(before));candidate.push(row(after));}
  }
  const digest=hash.digest('hex');traces.push(digest);assert.ok(min>=30,'fixture must contain real projectiles');
  const summarize=(rows:any[])=>({total:stats(rows.map(r=>r.total)),wire:rows.reduce((a,r)=>a+r.wire,0)/rows.length,stages:Object.fromEntries(Object.keys(rows[0].metrics).map(k=>[k,stats(rows.map(r=>r.metrics[k]))]))});
  const old=summarize(control),next=summarize(candidate),pair={round,peers,projectileMin:min,projectileMax:max,traceSha256:digest,control:old,candidate:next,ratios:{total:next.total.p50/old.total.p50,p95:next.total.p95/old.total.p95,wire:next.wire/old.wire}};pairs.push(pair);
  fs.writeFileSync(path.join(out,`pair-${peers}-${round}.json`),JSON.stringify({pair,control,candidate,transport:{control:a.stats(),candidate:b.stats()}},null,2));console.log(JSON.stringify({peers,round,ratios:pair.ratios,old:old.total,next:next.total}));
 }
 const gate=pairs.every(p=>p.ratios.total<=.95&&p.ratios.p95<=1.10&&p.ratios.wire<=1);results.push({peers,pairs,gate});
}
assert.equal(new Set(traces).size,1,'same native trajectory in every pair');
const report={at:new Date().toISOString(),scope:'22-ship same-state A/B then B/A; native physics outside timers. Full capture, encode, ordered/motion byte delta, deflate6, N inflates/decode/apply. Base64 anchor and rotation included. 3/5 sequential offline receiving replicas, not actual players/RTT/Hz. No campaign.',samples,warmup,rounds,gate:{everyPairFullPipelineP50RatioAtMost:.95,everyPairP95RatioAtMost:1.10,everyPairWireRatioAtMost:1},results,passed:results.every(r=>r.gate)};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log('PERFORMANCE GATE',report.passed?'PASS':'FAIL; negative result retained');if(!report.passed)process.exitCode=1;
