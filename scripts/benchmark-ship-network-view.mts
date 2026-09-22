import {serialize,deserialize} from 'node:v8';
import {encodeProjectedBinaryFrame} from '../src/network/BinarySnapshot.mjs';
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {initAssets,world,take,channel,pilotApplyShips} from './lib/ship-network-view-pilot.mts';
await initAssets();
const samples=Number(process.env.SHIP_VIEW_SAMPLES??120),warmup=30,rounds=3;
assert.ok(Number.isInteger(samples)&&samples>=60&&samples<=600);
const out=path.resolve(process.env.SHIP_VIEW_OUT??'artifacts/network-stream-20260921/phase28/benchmark');fs.mkdirSync(out,{recursive:true});
const native=world(22);for(const s of native.allCapitalShips){s.pos.scale(.2);s.prevPos.copy(s.pos);}native.playerShip.vel.set(40,8);
console.log('recording real native combat');for(let tick=0;tick<120;tick++)native.fixedUpdate(1/60);
const trace:any[]=[],projectiles:number[]=[];for(let tick=0;tick<samples+warmup;tick++){native.fixedUpdate(1/60);trace.push(take(native,22,tick+1));projectiles.push(native.projectiles.length);}
assert.ok(Math.max(...projectiles)>0);const idle=world(2),idleTrace=Array.from({length:samples+warmup},(_,i)=>take(idle,1,i+1));
const exactTrace=serialize({seed:917,preSteps:120,step:1/60,fixturePositionScale:.2,frames:trace,idleFrames:idleTrace,projectiles});
assert.deepEqual(deserialize(exactTrace).frames,trace,'saved trace must retain all values including negative zero');
const traceDigest=crypto.createHash('sha256').update(exactTrace).digest('hex');fs.writeFileSync(path.join(out,'trace.v8'),exactTrace);
const quantile=(values:number[],p:number)=>{const sorted=values.toSorted((a,b)=>a-b);return sorted[Math.floor((sorted.length-1)*p)];};
const summarize=(rows:any[])=>{const metrics=Object.fromEntries(Object.keys(rows[0].metrics).map(k=>[k,{p50:quantile(rows.map(r=>r.metrics[k]),.5),p95:quantile(rows.map(r=>r.metrics[k]),.95)}]));const total=rows.map(r=>Object.values(r.metrics).reduce((a:any,b:any)=>a+b,0) as number);return{metrics,total:{p50:quantile(total,.5),p95:quantile(total,.95)},rawBytes:rows.reduce((a,r)=>a+r.rawBytes,0)/rows.length,compressedBytes:rows.reduce((a,r)=>a+r.compressedBytes,0)/rows.length,changedFields:rows.reduce((a,r)=>a+(r.changedFields??0),0)/rows.length};};
const configs=[{name:'idle-one',count:1,peers:1,trace:idleTrace,world:2},{name:'combat-one',count:1,peers:1,trace,world:22},...([3,4,5].map(peers=>({name:'combat-22-fanout-'+peers,count:22,peers,trace,world:22})))];
const results:any[]=[];
for(const config of configs){
 const runs:any[]=[];
 for(let round=0;round<rounds;round++)for(const candidate of round%2?[true,false]:[false,true]){
  const replay=world(config.world),pipe=channel(replay,candidate,config.peers,true),rows:any[]=[];let last:any;
  for(let i=0;i<config.trace.length;i++){
   // Input reconstruction is outside measured regions, identical for A and B.
   pilotApplyShips(replay,config.trace[i],i===0);last=pipe.step(config.count,i+1);
   if(i>=warmup)rows.push({tick:i+1,metrics:last.metrics,rawBytes:last.packets.reduce((a:number,p:Uint8Array)=>a+p.length,0),compressedBytes:last.compressed.reduce((a:number,p:Uint8Array)=>a+p.length,0),changedFields:last.changedFields});
  }
  for(const v of pipe.viewers)assert.deepEqual(encodeProjectedBinaryFrame(take(v,config.count,config.trace.length),true),encodeProjectedBinaryFrame(take(replay,config.count,config.trace.length),true),'entire canonical P1 ship contract; the unchanged legacy encoder canonicalizes some negative zero values');
  const result={candidate,round,...summarize(rows),transport:pipe.stats()};runs.push(result);fs.writeFileSync(path.join(out,config.name+'-'+round+'-'+(candidate?'candidate':'control')+'.json'),JSON.stringify({result,rows},null,2));console.log(config.name,round,candidate?'candidate':'control',JSON.stringify({total:result.total,compressedBytes:result.compressedBytes}));
 }
 const pairs=Array.from({length:rounds},(_,round)=>{const a=runs.find(r=>r.round===round&&!r.candidate),b=runs.find(r=>r.round===round&&r.candidate);return{round,cpuP50Ratio:b.total.p50/a.total.p50,cpuP95Ratio:b.total.p95/a.total.p95,compressedRatio:b.compressedBytes/a.compressedBytes,rawRatio:b.rawBytes/a.rawBytes};});
 const gate=pairs.every(p=>p.cpuP50Ratio<=.9&&p.cpuP95Ratio<=1.05&&p.compressedRatio<=1.05);results.push({name:config.name,ships:config.count,recipients:config.peers,runs,pairs,gate});
}
const report={at:new Date().toISOString(),scope:'Offline complete registered-ship P1 slice only. Native recorded combat, same trace/order, existing binary+ordered byte delta with motionReference for BOTH, per-message deflate level6 and inflate, shared capture/core encoding. Not actual sockets, Steam, n2n, WebGL or full-world projectile/effects delivery; payload bytes exclude WS/TLS headers.',sampling:'Explicit 27 field reads every tick then dirty registration, not instrumented simulation writes. capture=remainder/control P1; fieldView=candidate sampling+dirty+core encoding; delta includes preparation/commit and bundle copy; receiver costs summed for all recipients. Remaining fields and compression are NOT excluded.',sourceTrace:{format:"Node v8.serialize (negative zero preserved)",sha256:traceDigest,samples,warmup,rounds,seed:917,projectileMin:Math.min(...projectiles),projectileMax:Math.max(...projectiles)},gateDefinition:{cpuP50RatioAtMost:.9,cpuP95RatioAtMost:1.05,compressedPayloadRatioAtMost:1.05,everyPair:true},passed:results.every(r=>r.gate),results};
fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log('PERFORMANCE ACCEPTANCE',report.passed?'PASS':'FAIL (negative result retained; do not enable)');
