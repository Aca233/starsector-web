import {normalizedProjection} from './lib/damage-view-oracle.mts';
import {applyCombatSnapshots as nativeApply} from 'native-apply-candidate';
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {serialize} from 'node:v8';import {deflateRawSync,inflateRawSync} from 'node:zlib';
import {decodeBinaryState as oldDecode} from 'onepass-control';
import {LanDeltaReceiver as OldReceiver} from '../src/network/LanBinaryDelta.mjs';
import {LanDeltaSender as OldSender,lanDeltaTarget as oldTarget} from '../server/LanDeltaTransport.mjs';
import {captureCombat as oldCaptureCombat,applyCombatSnapshots} from 'native-apply-control';
import {captureCombat as currentCaptureCombat} from 'native-apply-candidate';
const captureCombat=process.env.RESTORE_BASELINE||process.env.DAMAGE_VIEW_BASELINE||process.env.CAPTURE_BASELINE?currentCaptureCombat:oldCaptureCombat;
import {encodeProjectedBinaryFrame,encodeBinaryState,decodeBinaryState} from 'onepass-candidate';
import {isLanDelta,LanDeltaReceiver} from '../src/network/LanBinaryDelta.mjs';import {LanDeltaSender,lanDeltaTarget} from '../server/LanDeltaTransport.mjs';
import {assets,world} from './lib/native-projectile-fixture.mts';
await assets();
const out=path.resolve(process.env.ONEPASS_OUT??'artifacts/network-stream-20260921/phase32/benchmark');fs.mkdirSync(out,{recursive:true});
const samples=Number(process.env.ONEPASS_SAMPLES??120),warmup=30;assert.ok(Number.isInteger(samples)&&samples>=120&&samples<=600);
const rounds=2,q=(v:number[],f:number)=>v.toSorted((a,b)=>a-b)[Math.floor((v.length-1)*f)],stats=(v:number[])=>({p50:q(v,.5),p95:q(v,.95),p99:q(v,.99),max:Math.max(...v)});
const restoreOnly=!!process.env.RESTORE_BASELINE;
const damageView=!!process.env.DAMAGE_VIEW_BASELINE;
const captureOnly=!!process.env.CAPTURE_BASELINE;
const currentPipeline=restoreOnly||damageView||captureOnly;
const acceptAnyGain=damageView||restoreOnly&&process.env.RESTORE_ACCEPT_ANY_GAIN==='1';
const take=(e:any,tick:number,fn:any=captureCombat)=>currentPipeline
 ? fn(e,tick,{0:tick,1:tick},0,true,true,true,true,true,true,false,false,false,true,damageView||captureOnly)
 : fn(e,tick,{0:tick,1:tick},0,true,true,true,true,true);
const wire=(f:any)=>encodeProjectedBinaryFrame(f,true)!;
function pipe(source:any,peers:number,candidate:boolean){
 const viewers=Array.from({length:peers},()=>world()),senders=viewers.map(()=>new (candidate?LanDeltaSender:OldSender)({ordered:true,motionReference:!currentPipeline})),receivers=viewers.map(()=>new (candidate?LanDeltaReceiver:OldReceiver)({motionReference:!currentPipeline}));
 return {viewers,step(tick:number){
  const m:any={capture:0,encode:0,delta:0,compress:0,inflate:0,decode:0,apply:0};let t=performance.now();const frame=take(source,tick,damageView||captureOnly?(candidate?currentCaptureCombat:oldCaptureCombat):captureCombat);m.capture=performance.now()-t;
  t=performance.now();const encoded=encodeBinaryState('native-projectile',tick,wire(frame));m.encode=performance.now()-t;
  t=performance.now();const target=(candidate?lanDeltaTarget:oldTarget)(encoded,tick,tick*1000/60);assert.ok(target);const choices=senders.map(s=>s.prepare(target)),packets=choices.map((c:any)=>c?.packet??encoded);choices.forEach((c:any,i:number)=>{if(c)senders[i].commit(c);});m.delta=performance.now()-t;
  t=performance.now();const compressed=packets.map(p=>deflateRawSync(p,{level:6}));m.compress=performance.now()-t;
  for(let i=0;i<peers;i++){
   t=performance.now();const bytes=inflateRawSync(compressed[i]);m.inflate+=performance.now()-t;t=performance.now();const data=(candidate?decodeBinaryState:oldDecode)(isLanDelta(bytes)?receivers[i].decode(bytes):bytes);m.decode+=performance.now()-t;
   t=performance.now();(damageView||captureOnly||candidate?nativeApply:applyCombatSnapshots)(viewers[i],[data.frame],tick===1,undefined,{nativeTargeting:true,nativeProjection:currentPipeline||candidate});m.apply+=performance.now()-t;
  }
  return {frame,encoded,packets,compressed,metrics:m,total:Object.values(m).reduce((a:number,b:any)=>a+b,0)};
 },stats:()=>senders.map(s=>s.stats())};
}
// Dispatch changes must preserve cycles, Ship discovery, tag values and custom
// generic getter/Proxy observation order before any timed measurements.
let captureContracts=0;
if(captureOnly){
 const e=world(2),p:any=e.allCapitalShips[0],shared:any={values:[1,2,3]},cycle:any[]=[];cycle.push(cycle);
 const row:any=[undefined,null,true,false,'字😀',NaN,Infinity,-Infinity,-0,shared,shared,cycle,new Float32Array([1,2.5])];row.length+=2;
 p.dispatchFixture={row,owner:e.enemyShip,nested:[row.slice(0,8),[[],[shared]]],map:new Map([['k',row]]),set:new Set([undefined,shared])};
 for(const native of [true,false])for(const components of [true,false]){
  const run=(fn:any)=>fn(e,1,{0:1,1:1},0,true,true,true,native,true,true,components,false,false,true,true);
  assert.deepEqual(wire(run(currentCaptureCombat)),wire(run(oldCaptureCombat)));captureContracts++;
 }
 delete p.dispatchFixture;
 const logs:string[][]=[];
 for(const fn of [oldCaptureCombat,currentCaptureCombat]){
  const events:string[]=[],value:any={};Object.defineProperty(value,'v',{enumerable:true,get(){events.push('get:v');return 3;}});
  p.dispatchFixture=new Proxy(value,{getPrototypeOf(t){events.push('proto');return Reflect.getPrototypeOf(t);},ownKeys(t){events.push('keys');return Reflect.ownKeys(t);},getOwnPropertyDescriptor(t,k){events.push('descriptor:'+String(k));return Reflect.getOwnPropertyDescriptor(t,k);}});
  fn(e,1,{},0,true,true,true,false);logs.push(events);
 }
 assert.deepEqual(logs[0],logs[1]);captureContracts++;delete p.dispatchFixture;
}
const results:any[]=[];const traces:string[]=[];
for(const peers of [3,5]){
 const pairs=[];
 for(let round=0;round<rounds;round++){
  const source=world();for(const s of source.allCapitalShips){s.pos.scale(.2);s.prevPos.copy(s.pos);s.fireControlMode='AI';}
  for(let i=0;i<120;i++)source.fixedUpdate(1/60);
  const a=pipe(source,peers,false),b=pipe(source,peers,true),control:any[]=[],candidate:any[]=[],trace:any[]=[],hash=crypto.createHash('sha256');let min=Infinity,max=0;
  for(let i=0;i<samples+warmup;i++){
   source.fixedUpdate(1/60);let before:any,after:any;if(round===1){after=b.step(i+1);before=a.step(i+1);}else{before=a.step(i+1);after=b.step(i+1);}
   if(damageView){
    assert.deepEqual(normalizedProjection(after.frame),normalizedProjection(before.frame,true),'only six mark internals may differ');
    assert.ok(after.encoded.length<=before.encoded.length,'full-frame wire must not grow');
   }else{
    assert.deepEqual(after.encoded,before.encoded,'whole frame exact binary');for(let p=0;p<peers;p++){assert.deepEqual(after.packets[p],before.packets[p],'actual ordered/motion delta exact bytes');assert.deepEqual(after.compressed[p],before.compressed[p]);}
   }
   if(i%30===0||i===samples+warmup-1)for(let p=0;p<peers;p++){
    const x=take(a.viewers[p],i+1,captureCombat),y=take(b.viewers[p],i+1,captureCombat);
    if(damageView)assert.deepEqual(normalizedProjection(y,true),normalizedProjection(x,true),'whole restored viewer presentation');
    else assert.deepEqual(wire(x),wire(y),'whole restored viewer semantics');
   }
   hash.update(before.encoded);if(peers===3&&round===0)trace.push(before.frame);min=Math.min(min,source.projectiles.length);max=Math.max(max,source.projectiles.length);
   if(i>=warmup){const row=(r:any)=>({tick:i+1,total:r.total,metrics:r.metrics,fullBytes:r.encoded.length,deltaBytes:r.packets.reduce((sum:number,p:any)=>sum+p.length,0),wire:r.compressed.reduce((sum:number,p:any)=>sum+p.length,0)});control.push(row(before));candidate.push(row(after));}
  }
  const digest=hash.digest('hex');traces.push(digest);assert.ok(min>=30,'fixture must contain real projectiles');
  const summarize=(rows:any[])=>({total:stats(rows.map(r=>r.total)),fullBytes:rows.reduce((a,r)=>a+r.fullBytes,0)/rows.length,deltaBytes:rows.reduce((a,r)=>a+r.deltaBytes,0)/rows.length,wire:rows.reduce((a,r)=>a+r.wire,0)/rows.length,stages:Object.fromEntries(Object.keys(rows[0].metrics).map(k=>[k,stats(rows.map(r=>r.metrics[k]))]))});
  const old=summarize(control),next=summarize(candidate),pair={round,peers,projectileMin:min,projectileMax:max,traceSha256:digest,control:old,candidate:next,ratios:{capture:next.stages.capture.p50/old.stages.capture.p50,fullBytes:next.fullBytes/old.fullBytes,deltaBytes:next.deltaBytes/old.deltaBytes,apply:next.stages.apply.p50/old.stages.apply.p50,decode:next.stages.decode.p50/old.stages.decode.p50,total:next.total.p50/old.total.p50,p95:next.total.p95/old.total.p95,wire:next.wire/old.wire}};pairs.push(pair);
  fs.writeFileSync(path.join(out,`pair-${peers}-${round}.json`),JSON.stringify({pair,control,candidate,transport:a.stats()},null,2));if(trace.length)fs.writeFileSync(path.join(out,'trace.v8'),serialize(trace));console.log(JSON.stringify({peers,round,ratios:pair.ratios,old:old.total,next:next.total}));
 }
 const gate=captureOnly ? pairs.every(p=>p.ratios.total<=1.10&&p.ratios.p95<=1.10&&p.ratios.wire===1) : pairs.every(p=>(acceptAnyGain?p.ratios.total<1&&(damageView||p.ratios.apply<1):p.ratios.total<=.95)&&p.ratios.p95<=1.10&&p.ratios.wire<=1);results.push({peers,pairs,gate});
}
assert.equal(new Set(traces).size,1,'all pairs must use the same recorded native trajectory');
const captureAggregate=captureOnly?Object.fromEntries(["capture","total"].map(key=>[key,Math.exp(results.flatMap(r=>r.pairs).reduce((sum,p)=>sum+Math.log(p.ratios[key]),0)/4)])):undefined;
const report={at:new Date().toISOString(),restoreOnly,damageView,captureOnly,captureBaseline:process.env.CAPTURE_BASELINE,captureAggregate,damageBaseline:process.env.DAMAGE_VIEW_BASELINE,restoreBaseline:process.env.RESTORE_BASELINE,comparison:captureOnly?'Only capture implementation differs: current source vs current frozen baseline; same current parser/native restore, pruned weapon/mark fields, ordered delta and compression. Exact wire/receiver equivalence.':damageView?'Only damage mark capture differs: frozen current source vs exact native 8-field presentation projection; same current parser/restore/delta/compression for both.':restoreOnly?'Only restore differs; both use current parser/native DTO/pruned weapon authority/packed numbers/ordinary ordered byte deltas. Dynamic particle recipes enabled in fixture.':'Legacy phase32 comparison',scope:'Full native 22-ship world; both variants capture the SAME authoritative state at each tick (physics outside timing). Existing projected binary + reliable ordered delta + deflate6/inflate; motion reference is enabled only in the legacy parser comparison. All receiver decode/apply costs included; 3/5 are sequential offline receiving replicas, not actual players, RTT or Hz. Shared authority capture; receiver restoration is the compared stage when restoreOnly is true. Assertions outside timed regions. Control source is frozen by the selected wrapper. See comparison for changed stages. Source traces identical across 4 pairs.',samples,warmup,rounds,captureContracts,gate:{policy:captureOnly?"user-accept-any-aggregate-capture-gain":acceptAnyGain?"user-accept-any-measured-gain":"historical-five-percent",everyPairApplyP50RatioBelow:acceptAnyGain&&!damageView?1:undefined,everyPairFullPipelineP50RatioAtMost:captureOnly?1.10:acceptAnyGain?undefined:.95,everyPairFullPipelineP50RatioBelow:acceptAnyGain?1:undefined,everyPairP95RatioAtMost:1.10,everyPairWireRatioAtMost:1},results,passed:results.every(r=>r.gate)&&(!captureOnly||captureAggregate!.capture<1&&captureAggregate!.total<=1)};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log('PERFORMANCE GATE',report.passed?'PASS':'FAIL; negative result retained');

if (!report.passed) process.exitCode = 1;
